"""生成GitHub Pages静态预览；只复制公开展示资产，不修改本机源文件。"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]

SEED = """/* Pages预览：载入已保存结果，不调用本机BERTopic服务。 */
globalThis.ShowcaseMode=true;
if(typeof topicCorpus!=='undefined'&&typeof showcaseBertopic!=='undefined'){
  if(!TopicStore.read(topicCorpus))TopicStore.save(showcaseBertopic.result,topicCorpus);
  for(const id of ['topic-method','timeline-topic-method']){const el=document.getElementById(id);if(el)el.value='bertopic';}
  const originalFit=TopicTrainer.fit.bind(TopicTrainer);
  TopicTrainer.fit=async function(method,corpus,options,progress,status){
    if(method!=='bertopic')return originalFit(method,corpus,options,progress,status);
    status?.('载入已保存的BERTopic结果；在线预览不重新训练。');
    return JSON.parse(JSON.stringify(showcaseBertopic.result));
  };
}
"""

UI = """/* Pages预览模式：明确展示边界，保留NMF/LDA和原有图形交互。 */
(function(){
 const brand=document.querySelector('.ws-brand small');if(brand)brand.textContent+=' · 在线预览';
 for(const [methodId,buttonId,paramsId] of [['topic-method','run-topic','bertopic-parameters'],['timeline-topic-method','timeline-train-topic','timeline-bertopic-parameters']]){
  const method=document.getElementById(methodId),button=document.getElementById(buttonId);if(!method||!button)continue;
  const option=method.querySelector('option[value="bertopic"]');if(option)option.textContent='BERTopic（已保存示例）';
  const params=document.getElementById(paramsId);
  if(params){const note=document.createElement('p');note.className='note';note.textContent='在线预览：BERTopic载入已有结果（9主题、23篇未归类），不重新训练；NMF/LDA仍在浏览器运行。';params.append(note);}
  const sync=()=>{if(method.value==='bertopic'&&button.textContent!=='载入BERTopic示例')button.textContent='载入BERTopic示例';if(params)params.querySelectorAll('input').forEach(input=>input.disabled=true);};
  method.addEventListener('change',sync);new MutationObserver(sync).observe(button,{childList:true,subtree:true,characterData:true});sync();
 }
})();
"""


def build(output):
    output = Path(output).resolve()
    # 构建输出必须是独立新目录，拒绝覆盖源码或既有成果。
    if output.exists():
        raise FileExistsError('请使用不存在的输出目录：' + str(output))
    snapshot = json.loads((ROOT / 'docs/当前主题结果快照.json').read_text(encoding='utf-8'))
    digest = hashlib.sha256((ROOT / 'data/processed/topic-corpus.json').read_bytes()).hexdigest()
    if digest != snapshot['corpus_file_sha256']:
        raise ValueError('BERTopic快照与当前语料不匹配，停止发布')
    output.mkdir(parents=True)
    for name in ['pages', 'css', 'scripts', 'library']:
        shutil.copytree(ROOT / name, output / name)
    for name in ['processed', 'demo']:
        shutil.copytree(ROOT / 'data' / name, output / 'data' / name)
    (output / 'docs').mkdir()
    for name in ['project-guide.html', 'changelog.json', 'openalex-bundling-selection.json']:
        shutil.copy2(ROOT / 'docs' / name, output / 'docs' / name)
    shutil.copy2(ROOT / 'index.html', output / 'index.html')
    (output / '.nojekyll').write_text('', encoding='utf-8')
    (output / 'data/demo/bertopic-snapshot.json').write_text(
        json.dumps({'saved_at': snapshot['saved_at'], 'result': snapshot['service_state']['result']}, ensure_ascii=False), encoding='utf-8')
    (output / 'scripts/interactions/pages-seed.js').write_text(SEED, encoding='utf-8')
    (output / 'scripts/interactions/pages-ui.js').write_text(UI, encoding='utf-8')
    references = 0
    for page in (output / 'pages').glob('*.html'):
        text = page.read_text(encoding='utf-8')
        match = re.search(r"data-config='([^']+)'", text)
        config = json.loads(match[1])
        if 'topicCorpus' in config['data']:
            config['data']['showcaseBertopic'] = '../data/demo/bertopic-snapshot.json'
            config['scripts'].insert(0, '../scripts/interactions/pages-seed.js')
        config['scripts'].insert(config['scripts'].index('../scripts/interactions/liquid-select.js'), '../scripts/interactions/pages-ui.js')
        text = text[:match.start(1)] + json.dumps(config, ensure_ascii=False) + text[match.end(1):]
        page.write_text(text, encoding='utf-8')
        refs = re.findall(r'(?:src|href)="([^"]+)"', text) + list(config['data'].values()) + config['scripts']
        for ref in refs:
            if ref.startswith(('http:', 'https:', '#')):
                continue
            target = (page.parent / urlsplit(ref).path).resolve()
            if not target.is_relative_to(output) or not target.is_file():
                raise ValueError(f'无效页面资源：{page.name}: {ref}')
            references += 1
    guide = output / 'scripts/interactions/release-notes.js'
    guide.write_text(guide.read_text(encoding='utf-8').replace("'../README.md'", "'../usage.txt'"), encoding='utf-8')
    (output / 'usage.txt').write_text(
        'Research Maps 在线预览\n\n图形可交互，NMF/LDA在浏览器运行。BERTopic为已保存的100篇样本结果（9主题、23篇未归类），不在线重新训练。\n'
        'OpenAlex样本用于教学与方法演示，不代表领域全量。捆绑线只改变路线，不增加或删除关系。\n'
        '完整源码与本机运行方式：https://github.com/zzy12345674124/research-maps\n', encoding='utf-8')
    print(json.dumps({'files': sum(p.is_file() for p in output.rglob('*')), 'references': references,
                      'output': str(output), 'bertopic_backend_required': False}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT / 'dist-pages'))
    build(parser.parse_args().output)
