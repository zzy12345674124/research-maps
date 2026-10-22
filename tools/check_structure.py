"""功能：只读检查资源、语法及数据指纹；HTTP测试仅使用内存状态和项目内临时虚拟文件。"""
import ast
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]


def check():
    references = 0
    for page in (ROOT/'pages').glob('*.html'):
        text = page.read_text(encoding='utf-8')
        refs = re.findall(r'(?:src|href)="([^"]+)"', text)
        config = json.loads(re.search(r"data-config='([^']+)'", text)[1])
        refs += list(config['data'].values()) + config['scripts']
        for ref in refs:
            if ref.startswith(('http:', 'https:', '#')):
                continue
            path = (page.parent / urlsplit(ref).path).resolve()
            assert path.is_relative_to(ROOT.resolve()) and path.is_file(), f'{page.name}: {ref}'
            references += 1
        for ref in config['data'].values():
            json.loads((page.parent/ref).read_text(encoding='utf-8'))
    for path in [*(ROOT/'tools').glob('*.py'), *(ROOT/'server').glob('*.py')]:
        ast.parse(path.read_text(encoding='utf-8-sig'), filename=str(path))
    state = json.loads((ROOT/'docs/目录迁移状态.json').read_text(encoding='utf-8'))
    for path, digest in state['original_json_sha256'].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest() == digest, path
    assert all(p.suffix=='.json' for p in (ROOT/'data').rglob('*') if p.is_file())
    # 功能：从临时虚拟目录启动HTTP服务，验证本机API与静态文件，不加载或训练真实论文。
    spec=importlib.util.spec_from_file_location('test_topic_service',ROOT/'server/topic_server.py')
    service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
    with tempfile.TemporaryDirectory(dir=ROOT/'tools',prefix='structure-test-') as folder:
        fixture=Path(folder);(fixture/'index.html').write_text('synthetic fixture',encoding='utf-8')
        service.ROOT=fixture
        server=service.ThreadingHTTPServer(('127.0.0.1',0),service.Handler)
        service.PORT=server.server_port
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        try:
            base=f'http://127.0.0.1:{server.server_port}'
            assert urllib.request.urlopen(base+'/').read()==b'synthetic fixture'
            assert json.load(urllib.request.urlopen(base+'/api/topics'))['status']=='idle'
            req=urllib.request.Request(base+'/api/topics',data=b'{}',headers={'Content-Type':'application/json'})
            try:urllib.request.urlopen(req)
            except urllib.error.HTTPError as error:assert error.code==403
            else:raise AssertionError('跨域保护未生效')
        finally:
            server.shutdown();server.server_close();worker.join()
    print(json.dumps({'pages':len(list((ROOT/'pages').glob('*.html'))),'references_checked':references,'original_json_unchanged':True,'data_json_only':True,'python_syntax':True,'synthetic_http':True}))


if __name__=='__main__':check()
