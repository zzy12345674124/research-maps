"""功能：一次性目录迁移；先保存备份与指纹，所有移动限制在本工程内。"""
import hashlib
import json
import re
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / 'docs/backups/2026-10-19-directory'
STATUS = ROOT / 'docs/目录迁移状态.json'


def checked(path):
    path = path.resolve()
    if not path.is_relative_to(ROOT.resolve()):
        raise ValueError('路径超出工程')
    return path


def write(path, text):
    checked(path).parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def move(source, target):
    checked(source)
    checked(target).parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise ValueError(f'目标已存在：{target}')
    shutil.move(str(source), str(target))


def main():
    if BACKUP.exists():
        raise RuntimeError('备份已存在，请读取状态后人工接力，不自动重跑迁移')
    BACKUP.mkdir(parents=True)
    # 功能：备份全部将变更代码，保存数据字节指纹；不覆盖历史接力基线。
    for folder in ['src', 'scripts']:
        shutil.copytree(ROOT / folder, BACKUP / folder)
    shutil.copy2(ROOT / 'index.html', BACKUP / 'index.html')
    shutil.copy2(ROOT / '启动主题工作台.cmd', BACKUP / '启动主题工作台.cmd')
    shutil.copytree(ROOT / 'data/processed', BACKUP / 'processed')
    fingerprints = {str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'data').rglob('*.json')}
    write(STATUS, json.dumps({'phase':'backed_up','original_json_sha256':fingerprints},ensure_ascii=False,indent=2))
    # 功能：D3固定版本本地化；下载失败时保留全部源文件，停止迁移。
    library = ROOT / 'library/d3/d3.v7.min.js'
    library.parent.mkdir(parents=True, exist_ok=True)
    errors=[]
    for url in ['https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js','https://unpkg.com/d3@7.9.0/dist/d3.min.js']:
        try:
            payload=urllib.request.urlopen(url,timeout=40).read()
            if b'd3' not in payload[:500] or len(payload)<100000:
                raise ValueError('D3下载内容不符合预期')
            library.write_bytes(payload)
            break
        except Exception as error:
            errors.append(str(error))
    else:
        raise RuntimeError('D3下载失败：'+';'.join(errors))
    for folder in ['analysis','interactions']:
        move(ROOT/'src'/folder,ROOT/'scripts'/folder)
    move(ROOT/'src/styles/workspace.css',ROOT/'css/common.css')
    # 功能：将数据脚本转换为JSON，旧脚本移入备份，data下只保存JSON。
    data_names={}
    for path in sorted((ROOT/'data/processed').glob('*.js')):
        content=path.read_text(encoding='utf-8-sig')
        match=re.search(r'const\s+(\w+)\s*=\s*([\s\S]*);\s*$',content)
        if not match:
            raise ValueError(f'无法识别数据脚本：{path}')
        value=json.loads(match[2])
        target=path.with_suffix('.json')
        if target.exists():
            if json.loads(target.read_text(encoding='utf-8-sig'))!=value:
                raise ValueError(f'JSON与JS不一致：{path}')
        else:
            write(target,json.dumps(value,ensure_ascii=False,indent=2)+'\n')
        data_names[path.name]=(match[1],target.name)
        move(path,BACKUP/'retired-data-scripts'/path.name)
    # 功能：按图拆出页面专用样式和绘图脚本；所有数据就绪后再启动脚本。
    for page in sorted((ROOT/'src/charts').glob('*.html')):
        name=page.stem
        html=page.read_text(encoding='utf-8-sig')
        styles=re.findall(r'<style[^>]*>([\s\S]*?)</style>',html)
        write(ROOT/f'css/{name}.css','/* 功能：'+name+'页面专用样式。 */\n'+'\n'.join(styles))
        html=re.sub(r'<style[^>]*>[\s\S]*?</style>','',html)
        data={}
        for source in re.findall(r'<script[^>]*src="([^"]+)"[^>]*>\s*</script>',html):
            file=source.split('/')[-1]
            if file in data_names:
                variable,jsonfile=data_names[file]
                data[variable]='../data/processed/'+jsonfile
        inline=[]
        def extract(match):
            attrs,body=match[1],match[2]
            return match[0] if re.search(r'\bsrc=',attrs) else (inline.append(body) or '')
        html=re.sub(r'<script([^>]*)>([\s\S]*?)</script>',extract,html)
        write(ROOT/f'scripts/charts/{name}.js','// 功能：'+name+'图形计算、绘制及交互；数据由bootstrap就绪后注入。\n'+'\n'.join(inline))
        html=re.sub(r'<script[^>]*src="[^\"]*(?:data/processed|workspace\.js|topic-panel\.js)[^\"]*"[^>]*>\s*</script>','',html)
        html=re.sub(r'https://cdn.jsdelivr.net/npm/d3@7','../library/d3/d3.v7.min.js',html)
        html=html.replace('../analysis/','../scripts/analysis/').replace('../styles/workspace.css','../css/common.css')
        html=html.replace('../../README.md','../README.md').replace('../../index.html','../index.html')
        html=html.replace('</head>',f'<link rel="stylesheet" href="../css/{name}.css">\n</head>')
        scripts=[f'../scripts/charts/{name}.js']
        if name=='network':scripts.append('../scripts/interactions/topic-panel.js')
        scripts.append('../scripts/interactions/workspace.js')
        config=json.dumps({'data':data,'scripts':scripts},ensure_ascii=False).replace("'",'&#39;')
        html=html.replace('</body>',f'<script src="../scripts/bootstrap.js" data-config=\'{config}\'></script>\n</body>')
        write(ROOT/f'pages/{page.name}',html)
        # 功能：保留旧书签入口，包括作者/机构查询参数；旧绘图实现保存在备份。
        write(page,f'<!doctype html><meta charset="utf-8"><title>页面已迁移</title><script>location.replace("../../pages/{page.name}"+location.search+location.hash);</script><a href="../../pages/{page.name}">打开新页面</a>')
    # 功能：工具与服务分开，修复所有维护工具的相对路径。
    for path in list((ROOT/'scripts').glob('*')):
        if path.is_file():
            target=ROOT/('server' if path.name in ['topic_server.py','requirements-bertopic.txt'] else 'tools')/path.name
            move(path,target)
    for folder in ['tools','server','scripts/interactions']:
        for path in (ROOT/folder).glob('*'):
            if path.suffix not in ['.py','.js','.cjs']:continue
            if path.name=='restructure_project.py':continue
            text=path.read_text(encoding='utf-8-sig')
            text=text.replace('src/charts/','pages/').replace('src/analysis/','scripts/analysis/').replace('src/interactions/','scripts/interactions/').replace('../../README.md','../README.md')
            if path.suffix=='.py' and path.name in ['download_openalex.py','build_dual_map.py','upgrade_dual_map.py','build_topic_corpus.py']:
                # 功能：旧工具仍生成兼容脚本时写到scripts/data，避免data出现JS。
                text=text.replace('data/processed/papers.js','scripts/data/papers.js').replace('data/processed/dual-map.js','scripts/data/dual-map.js')
                text=text.replace('data/processed/topic-corpus.js','scripts/data/topic-corpus.js')
                text=text.replace('ROOT=Path(__file__).resolve().parents[1]','ROOT=Path(__file__).resolve().parents[1]\n(ROOT/"scripts/data").mkdir(parents=True,exist_ok=True)')
                text=text.replace('ROOT = Path(__file__).resolve().parents[1]','ROOT = Path(__file__).resolve().parents[1]\n(ROOT/"scripts/data").mkdir(parents=True,exist_ok=True)')
            if path.name=='test_topic_model.cjs':
                text=text.replace("new vm.Script(fs.readFileSync(path.join(root,'data/processed/topic-corpus.js'),'utf8'));","JSON.parse(fs.readFileSync(path.join(root,'data/processed/topic-corpus.json'),'utf8'));")
                text=text.replace("const html=fs.readFileSync(path.join(root,'pages/network.html'),'utf8');","const html=fs.readFileSync(path.join(root,'scripts/charts/network.js'),'utf8');")
            write(path,text)
    write(ROOT/'index.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>文献计量可视化</title><meta http-equiv="refresh" content="0;url=pages/network.html"><a href="pages/network.html">进入文献计量可视化</a></html>\n')
    launcher=(ROOT/'启动主题工作台.cmd').read_text(encoding='utf-8-sig').replace('scripts\\topic_server.py','server\\topic_server.py').replace('scripts/topic_server.py','server/topic_server.py').replace('src/charts/','pages/')
    write(ROOT/'启动主题工作台.cmd',launcher)
    unchanged=all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==digest for p,digest in fingerprints.items())
    if not unchanged:raise ValueError('原JSON指纹变化，请检查')
    write(STATUS,json.dumps({'phase':'migrated_pending_validation','original_json_sha256':fingerprints,'original_json_unchanged':unchanged,'bertopic':'用户暂不安装'},ensure_ascii=False,indent=2))
    print('迁移完成；原JSON指纹未变化；等待引用检查。')


if __name__=='__main__':main()
