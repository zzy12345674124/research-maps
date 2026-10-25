/* 功能：同源读取JSON后，按顺序加载图形、交互及工作台；错误时显示可操作提示。 */
(async function(){
  const configText=document.currentScript.dataset.config;
  let config;
  try{
    config=JSON.parse(configText);
    if(location.protocol==='file:')throw new Error('JSON数据需要本机网页服务。请启动项目根目录“启动可视化.cmd”，再打开 http://127.0.0.1:8765/');
    // arXiv支持摘要、日期和姓名合作；缺失机构/引文的页面明确沿用旧样本。
    if(config.data.openAlexPapers||config.data.dualMapData){
      const query=new URLSearchParams(location.search),page=location.pathname.split('/').pop();
      const supported=page==='network.html'||page==='timeline.html'||(page==='cooperation.html'&&query.get('type')!=='institution');
      window.DatasetInfo={id:'legacy100',source:'OpenAlex',count:100};
      if(!query.get('dataset')||query.get('dataset')==='arxiv-ai-education-1000'){
        const manifest=await fetch('../data/datasets/arxiv-ai-education-1000/manifest.json',{cache:'no-store'});
        if(manifest.ok){
          const info=await manifest.json();
          if(supported){
            window.DatasetInfo=info;
            for(const name of Object.keys(config.data))if(info.files[name])config.data[name]='../'+info.files[name];
          }else window.DatasetInfo.fallback='arXiv未提供完整机构、引文和期刊映射，本图沿用OpenAlex 100篇样本。';
        }else if(manifest.status!==404)throw Error('arXiv数据清单读取失败：'+manifest.status);
      }
    }
    const loaded=await Promise.all(Object.entries(config.data).map(async([name,url])=>{
      const response=await fetch(url);if(!response.ok)throw new Error(`数据加载失败：${url}（${response.status}）`);
      return [name,await response.json()];
    }));
    loaded.forEach(([name,value])=>{window[name]=value;});
    if(window.semanticMap){
      if(semanticMap.dataset!==DatasetInfo.id)throw Error('论文语义坐标与所选数据集不匹配');
      if(!globalThis.crypto?.subtle)throw Error('请通过127.0.0.1打开论文语义地图，以验证坐标与语料一致性');
      const encoded=new TextEncoder().encode(JSON.stringify(topicCorpus.map(d=>[d.id,d.text])));
      const hash=await crypto.subtle.digest('SHA-256',encoded);
      const signature=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      if(signature!==semanticMap.input_fingerprint)throw Error('论文语义坐标已过期，请重新生成后查看');
    }

    if(window.journalSemanticMap&&journalSemanticMap.dataset!==DatasetInfo.id)throw Error('期刊语义坐标与所选数据集不匹配');
    // 只读诊断：同一图形跳过单个可选模块，不清除主题保存结果或修改数据。
    const diagnostic=new URLSearchParams(location.search).get('diagnose');
    const scripts=config.scripts.filter(url=>!(diagnostic==='no-topic'&&url.endsWith('/topic-panel.js')));
    if(diagnostic==='no-topic'){
      const panel=document.getElementById('topic-panel');if(panel)panel.hidden=true;
      console.info('[诊断] 已跳过主题面板；绘图与标签逻辑保持原样。');
    }
    for(const url of scripts)await new Promise((resolve,reject)=>{
      // 功能：前端资源使用统一版本标记，避免公共CSS与工作台脚本混用不同缓存版本。
      const asset=new URL(url,location.href);asset.searchParams.set('v','20261025-journal88');
      const script=document.createElement('script');script.src=asset.href;script.onload=resolve;script.onerror=()=>reject(new Error(`脚本加载失败：${url}`));document.body.append(script);
    });
    await window.ResearchMapsUI?.ready();
    // 功能：工作台可能等待DOMContentLoaded，需等其真正组装完成，避免先显示独立页再搬迁。
    if(config.workspace){
      if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      if(document.body.dataset.workspaceReady!=='true')throw new Error('工作台初始化未完成，请刷新重试。');
      window.WorkspaceStartup?.ready();
    }
    window.ChartLoading?.install();
    window.WorkspaceNavigation?.ready();
  }catch(error){
    window.WorkspaceNavigation?.fail(error.message);
    if(window.WorkspaceStartup){window.WorkspaceStartup.fail(error.message);return;}

    const message=document.createElement('p');message.setAttribute('role','alert');message.style.cssText='padding:20px;color:#a34522;background:#fff4e8';message.textContent=error.message;document.body.prepend(message);
  }
})();
