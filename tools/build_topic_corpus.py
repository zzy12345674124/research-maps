"""功能：从现有OpenAlex倒排摘要恢复本地主题语料；不联网，不改写原数据。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build():
    raw = json.loads((ROOT / 'data/raw/openalex-ai-education-100.json').read_text(encoding='utf-8-sig'))
    works = raw['results']
    documents = []
    for work in works:
        positions = {}
        for word, indexes in (work.get('abstract_inverted_index') or {}).items():
            for index in indexes:
                positions[index] = word
        abstract = ' '.join(positions[i] for i in sorted(positions))
        title = work.get('title') or work.get('display_name') or ''
        documents.append(dict(id=work['id'], title=title, hasAbstract=bool(abstract), text=f'{title} {abstract}'.strip()))
    # 功能：新目录统一输出JSON，浏览器由scripts/bootstrap.js加载。
    target = ROOT / 'data/processed/topic-corpus.json'
    target.write_text(json.dumps(documents, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'已生成{len(documents)}篇语料，其中{sum(d["hasAbstract"] for d in documents)}篇有摘要。')


if __name__ == '__main__':
    build()
