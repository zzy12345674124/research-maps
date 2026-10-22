"""功能：经用户确认后下载BERTopic语义模型到项目缓存；不读取论文、不自动执行训练。"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT/'runtime/model-cache'
# 功能：所有模型缓存位于项目内；仅下载推理需要的文件，不拉取ONNX/OpenVINO等额外副本。
os.environ['HF_HOME'] = str(CACHE)
os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = '60'

def main():
    from huggingface_hub import snapshot_download
    snapshot = snapshot_download('sentence-transformers/all-MiniLM-L6-v2', cache_dir=str(CACHE),
        allow_patterns=['modules.json', 'config_sentence_transformers.json', 'sentence_bert_config.json', 'config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', '1_Pooling/config.json'], max_workers=2)
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', cache_folder=str(CACHE), device='cpu', local_files_only=True)
    vectors = model.encode(['This is a synthetic sentence for an offline model check.'], show_progress_bar=False)
    assert vectors.shape == (1, 384), vectors.shape
    print(json.dumps({'downloaded': True, 'offline_load': True, 'dimensions': 384, 'revision': Path(snapshot).name}), flush=True)

if __name__ == '__main__':
    main()
