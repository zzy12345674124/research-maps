"""只读对比接力前后的文件指纹；不还原、不覆盖任何文件。"""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'docs/接力基线.json'

def fingerprint(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def tracked(path):
    relative=path.relative_to(ROOT).as_posix()
    return relative!='docs/接力基线.json' and not any(part in {'node_modules','.git','__pycache__'} for part in path.relative_to(ROOT).parts)

if __name__=='__main__':
    baseline=json.loads(BASE.read_text(encoding='utf-8'))
    previous=baseline['files']
    current={path.relative_to(ROOT).as_posix():fingerprint(path) for path in ROOT.rglob('*') if path.is_file() and tracked(path)}
    added=sorted(current.keys()-previous.keys())
    deleted=sorted(previous.keys()-current.keys())
    modified=sorted(name for name in previous.keys()&current.keys() if previous[name]['sha256']!=current[name])
    print(json.dumps({'baseline_at':baseline['created_at'],'added':added,'modified':modified,'deleted':deleted,'unchanged':len(current)-len(added)-len(modified)},ensure_ascii=False,indent=2))
