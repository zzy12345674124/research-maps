/* 功能：同源读取JSON后，按顺序加载图形、交互及工作台；错误时显示可操作提示。 */
(async function(){
  const configText=document.currentScript.dataset.config;
  let config;
  try{
    config=JSON.parse(configText);
    if(location.protocol==='file:')throw new Error('JSON数据需要本机网页服务。请启动项目根目录“启动可视化.cmd”，再打开 http://127.0.0.1:8765/');
    const loaded=await Promise.all(Object.entries(config.data).map(async([name,url])=>{
      const response=await fetch(url);if(!response.ok)throw new Error(`数据加载失败：${url}（${response.status}）`);
      return [name,await response.json()];
    }));
    loaded.forEach(([name,value])=>{window[name]=value;});
    for(const url of config.scripts)await new Promise((resolve,reject)=>{
      // 功能：前端资源使用统一版本标记，避免公共CSS与工作台脚本混用不同缓存版本。
      const asset=new URL(url,location.href);asset.searchParams.set('v','20261021-select25');
      const script=document.createElement('script');script.src=asset.href;script.onload=resolve;script.onerror=()=>reject(new Error(`脚本加载失败：${url}`));document.body.append(script);
    });
    // 功能：工作台可能等待DOMContentLoaded，需等其真正组装完成，避免先显示独立页再搬迁。
    if(config.workspace){
      if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      if(document.body.dataset.workspaceReady!=='true')throw new Error('工作台初始化未完成，请刷新重试。');
      window.WorkspaceStartup?.ready();
    }
  }catch(error){
    if(window.WorkspaceStartup){window.WorkspaceStartup.fail(error.message);return;}

    const message=document.createElement('p');message.setAttribute('role','alert');message.style.cssText='padding:20px;color:#a34522;background:#fff4e8';message.textContent=error.message;document.body.prepend(message);
  }
})();
