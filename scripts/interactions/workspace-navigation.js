/* 同源双缓冲切图：旧页面保持可见，新页面准备好后才交换；不复用绘图全局变量。 */
(function(){
  if(typeof OfflineLocation!=='undefined')return; // 单文件离线包由自己的宿主管理。
  let active=null,pending=null,serial=0,isReady=false;
  const allowed=new Set(['network.html','cooperation.html','co-citation.html','timeline.html','dual-map.html','openalex-demo.html','airline-demo.html']);
  function target(value){
    const url=new URL(value,location.href);
    return url.origin===location.origin&&allowed.has(url.pathname.split('/').pop())?url:null;
  }
  function host(){
    try{if(parent!==window&&parent.WorkspaceNavigation)return parent.WorkspaceNavigation;}catch{}
    return api;
  }
  function notice(text){
    let box=document.getElementById('workspace-navigation-notice');
    if(!box){box=document.createElement('div');box.id='workspace-navigation-notice';box.setAttribute('role','status');box.style.cssText='position:fixed;right:24px;bottom:24px;z-index:30000;padding:10px 16px;border-radius:12px;background:#f7fbff;color:#36566b;box-shadow:0 6px 28px #294a6026;font:13px/1.6 sans-serif';document.body.append(box);}
    box.textContent=text;setTimeout(()=>box.remove(),7000);
  }
  function discard(){if(pending){clearTimeout(pending.timer);pending.releaseLoading();pending.frame.remove();pending=null;}}
  function failed(frame,reason){
    if(pending?.frame!==frame)return;
    discard();notice(reason||'图表加载未完成，已保留当前图表，请重试。');
  }
  function commit(frame){
    if(pending?.frame!==frame)return;
    const job=pending;
    frame.contentWindow.ChartLoading?.prepareReveal();
    // 两帧让目标页完成布局和首帧绘制，交换前旧图始终可见。
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(pending!==job)return;
      clearTimeout(job.timer);pending=null;
      const old=active;
      frame.style.visibility='visible';frame.style.pointerEvents='auto';frame.removeAttribute('aria-hidden');
      active=frame;
      job.releaseLoading();frame.contentWindow.ChartLoading?.reveal();
      if(old){old.contentWindow.dispatchEvent(new Event('pagehide'));old.remove();}
      else{
        window.dispatchEvent(new Event('pagehide'));
        for(const child of [...document.body.children])if(child!==frame&&!['SCRIPT','STYLE'].includes(child.tagName))child.style.display='none';
      }
      document.title=frame.contentDocument.title;
      if(job.push)history.pushState({workspace:true},'',job.url.href);
      frame.focus();
    }));
  }
  function navigate(value,{push=true}={}){
    const url=target(value);if(!url){location.href=value;return;}
    url.searchParams.set('v','20261025-journal88');
    if(host()!==api){host().navigate(url.href,{push});return;}
    discard();
    const frame=document.createElement('iframe');frame.title='文献计量可视化工作台';frame.dataset.workspaceFrame=String(++serial);
    frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:20000;visibility:hidden;pointer-events:none;background:#eef2f7';
    const loading=active?active.contentWindow.ChartLoading:window.ChartLoading;
    const releaseLoading=loading?.begin?loading.begin():(loading?.show(),()=>loading?.hide());
    pending={frame,url,push,releaseLoading,timer:setTimeout(()=>failed(frame,'新图表加载超时，已保留当前图表，请检查服务后重试。'),45000)};
    frame.onerror=()=>failed(frame);
    frame.onload=()=>{
      if(pending?.frame!==frame)return;
      try{
        if(frame.contentDocument.documentElement.dataset.workspaceState==='error')failed(frame);
        else if(frame.contentWindow.WorkspaceNavigation?.isReady)commit(frame);
      }catch{failed(frame);}
    };
    frame.src=url.href;document.body.append(frame);
  }
  const api=window.WorkspaceNavigation={navigate,get isReady(){return isReady;},
    ready(){isReady=true;const owner=host();if(owner!==api)owner.accept(window);},
    accept(child){if(pending?.frame.contentWindow===child)commit(pending.frame);},
    fail(reason){const owner=host();if(owner!==api)owner.reject(window,reason);},
    reject(child,reason){if(pending?.frame.contentWindow===child)failed(pending.frame,reason);}
  };
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
    if(!target(link.href))return;event.preventDefault();navigate(link.href);
  });
  window.addEventListener('popstate',()=>{if(active||pending)navigate(location.href,{push:false});});
})();
