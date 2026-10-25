"""功能：仅监听本机的静态网页与BERTopic训练服务；训练使用项目语料，不接受外部文件路径。"""
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PORT = 8765
LOCK = threading.Lock()
STATE = {'status': 'idle', 'message': '尚未运行BERTopic'}


def validate(options):
    """功能：白名单校验参数，限制训练规模和输入类型。"""
    limits = {'minSize': (2, 30), 'neighbors': (2, 50), 'topWords': (1, 30), 'minDf': (1, 100)}
    clean = {}
    dataset = options.get('dataset','legacy100')
    if dataset not in ('legacy100','arxiv-ai-education-1000'):
        raise ValueError('未知数据集')
    clean['dataset'] = dataset
    for key, (low, high) in limits.items():
        value = options.get(key)
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'{key}需为{low}–{high}的整数')
        clean[key] = value
    return clean


def train(options, *, corpus=None):
    """功能：本地语义编码、UMAP、HDBSCAN与c-TF-IDF；未归类论文保留为灰色。"""
    global STATE
    try:
        cache = ROOT / 'runtime/model-cache'
        os.environ['HF_HOME'] = str(cache)
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'
        STATE = {'status': 'running', 'message': '加载BERTopic依赖…'}
        from bertopic import BERTopic
        from sentence_transformers import SentenceTransformer
        from sklearn.feature_extraction.text import CountVectorizer
        from umap import UMAP
        from hdbscan import HDBSCAN
        # 功能：网页始终读取固定项目语料；内部验证可显式传入内存合成文本，不写入真实数据。
        if corpus is None:
            corpus_path = 'data/datasets/arxiv-ai-education-1000/processed/topic-corpus.json' if options.get('dataset')=='arxiv-ai-education-1000' else 'data/processed/topic-corpus.json'
            corpus = json.loads((ROOT / corpus_path).read_text(encoding='utf-8-sig'))
        if len(corpus) < 5:
            raise ValueError('至少需要5篇有效文本')
        STATE = {'status': 'running', 'message': '加载本地语义模型缓存…'}
        encoder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', cache_folder=str(cache), device='cpu', local_files_only=True)
        STATE = {'status': 'running', 'message': '在本机计算论文语义向量…'}
        embeddings = encoder.encode([d['text'] for d in corpus], show_progress_bar=False)
        STATE = {'status': 'running', 'message': '聚类与提取主题词…'}
        model = BERTopic(embedding_model=encoder, top_n_words=options['topWords'],
            umap_model=UMAP(n_neighbors=min(options['neighbors'], len(corpus)-1), n_components=min(5, len(corpus)-2), metric='cosine', random_state=42, n_jobs=1),
            hdbscan_model=HDBSCAN(min_cluster_size=options['minSize'], min_samples=1, metric='euclidean', prediction_data=True),
            vectorizer_model=CountVectorizer(stop_words='english', min_df=options['minDf']),
            calculate_probabilities=False, verbose=False)
        assignments, probabilities = model.fit_transform([d['text'] for d in corpus], embeddings)
        ids = sorted(set(int(t) for t in assignments) - {-1})
        index = {topic: i for i, topic in enumerate(ids)}
        topics = [{'id': index[t], 'words': [{'word': word, 'weight': float(weight)} for word, weight in model.get_topic(t)]} for t in ids]
        documents = []
        for i, (doc, assigned) in enumerate(zip(corpus, assignments)):
            primary = index.get(int(assigned))
            # 功能：硬聚类归属用one-hot映射关键词；不把HDBSCAN成员强度混称为NMF主题占比。
            weights = [int(j == primary) for j in range(len(ids))]
            documents.append({'id': doc['id'], 'primary': primary, 'weights': weights,
                'membership': float(probabilities[i]) if probabilities is not None else None})
        result = {'model': 'BERTopic', 'topics': topics, 'documents': documents, 'used': len(corpus),
            'outliers': sum(t == -1 for t in assignments), 'seed': 42, 'options': options}
        STATE = {'status': 'done', 'message': f'BERTopic完成：{len(topics)}个主题，{result["outliers"]}篇未归类', 'result': result}
    except ModuleNotFoundError as error:
        STATE = {'status': 'error', 'message': f'BERTopic运行依赖尚未就绪（{error.name}），需确认安装项目环境后启用；NMF/LDA不受影响。'}
    except Exception as error:
        STATE = {'status': 'error', 'message': f'{type(error).__name__}: {error}；BERTopic仅使用本地模型缓存，缺少模型时需先确认下载。'}
    finally:
        LOCK.release()


class Handler(SimpleHTTPRequestHandler):
    """功能：同源API，不开放跨域；只允许JSON自定义头请求启动训练。"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def trusted(self):
        return self.headers.get('Host') == f'127.0.0.1:{PORT}'

    def reply(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.trusted():
            return self.reply(403, {'message': '请使用127.0.0.1访问'})
        if urlsplit(self.path).path == '/api/topics':
            return self.reply(200, STATE)
        return super().do_GET()

    def do_POST(self):
        if not self.trusted() or self.headers.get('Origin') != f'http://127.0.0.1:{PORT}' or self.headers.get('X-Topic-Request') != 'train':
            return self.reply(403, {'message': '仅允许本机网页同源请求'})
        if self.path != '/api/topics':
            return self.reply(404, {'message': '接口不存在'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096:
                raise ValueError('请求长度不合法')
            options = validate(json.loads(self.rfile.read(size)))
        except (ValueError, TypeError) as error:
            return self.reply(400, {'message': str(error)})
        if not LOCK.acquire(blocking=False):
            return self.reply(409, {'message': '已有训练正在运行，请等待完成'})
        global STATE
        STATE = {'status': 'running', 'message': '正在启动BERTopic…'}
        threading.Thread(target=train, args=(options,), daemon=True).start()
        return self.reply(202, STATE)


if __name__ == '__main__':
    print(f'打开 http://127.0.0.1:{PORT}/pages/network.html', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
