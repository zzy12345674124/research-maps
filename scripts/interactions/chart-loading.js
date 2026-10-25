/* 只淡化绘图区内容，加载图标独立保持清晰；不更改左侧参数区。 */
(function(){
  let viewport=null,overlay=null,revealFrame=null,busy=0,epoch=0;
  const revisions=new Map();
  const style=document.createElement('style');
  style.textContent=`
    .chart-loading-surface{position:relative!important}
    .chart-loading-surface>:not(.chart-loading-overlay){transition:opacity .2s ease}
    .chart-loading-surface.chart-is-loading>:not(.chart-loading-overlay),
    .chart-loading-surface.chart-is-revealing>:not(.chart-loading-overlay){opacity:.5!important}
    .chart-is-revealing>:not(.chart-loading-overlay){transition:none!important}
    .chart-is-loading>:not(.chart-loading-overlay){pointer-events:none!important}
    .chart-loading-overlay{position:absolute;inset:0;z-index:1000;display:grid;place-items:center;cursor:progress;background:transparent}
    .loading-3{position:relative;width:34px;height:34px;box-sizing:content-box;border:2px solid #000;border-top-color:transparent;border-bottom-color:transparent;border-radius:100%;animation:loading-3 infinite .75s linear}
    .loading-3:before,.loading-3:after{position:absolute;top:24px;left:-2px;border-top:5px solid #000;border-right:5px solid transparent;border-left:5px solid transparent;content:"";transform:rotate(-30deg)}
    .loading-3:after{top:0;left:20.5px;transform:rotate(150deg)}
    @keyframes loading-3{0%{transform:rotate(360deg)}to{transform:rotate(0)}}
    @media(prefers-reduced-motion:reduce){.chart-loading-surface>:not(.chart-loading-overlay){transition:none}.loading-3{animation:none}}
  `;
  document.head.append(style);
  function surface(){return document.querySelector('.ws-viewport')||document.querySelector('.canvas')||document.querySelector('.chart');}
  function hide(){
    if(revealFrame!==null){cancelAnimationFrame(revealFrame);revealFrame=null;}
    overlay?.remove();overlay=null;
    viewport?.classList.remove('chart-is-loading','chart-is-revealing');
    viewport?.removeAttribute('aria-busy');
  }
  const api=window.ChartLoading={show(){
    hide();viewport=surface();if(!viewport)return;
    viewport.classList.add('chart-loading-surface','chart-is-loading');viewport.setAttribute('aria-busy','true');
    overlay=document.createElement('div');overlay.className='chart-loading-overlay';overlay.setAttribute('role','status');overlay.setAttribute('aria-label','正在加载图表');
    const spinner=document.createElement('span');spinner.className='loading-3';spinner.setAttribute('aria-hidden','true');overlay.append(spinner);viewport.append(overlay);
  },hide,prepareReveal(){
    hide();viewport=surface();viewport?.classList.add('chart-loading-surface','chart-is-revealing');
  },reveal(){
    // 强制计算50%起点，再过一帧恢复；只对新绘图区执行淡入。
    if(viewport)void viewport.offsetWidth;
    revealFrame=requestAnimationFrame(()=>{revealFrame=null;viewport?.classList.remove('chart-is-revealing');});
  },begin(){
    const ownEpoch=epoch;let released=false;
    if(busy++===0)api.show();
    return ()=>{if(released||ownEpoch!==epoch)return;released=true;if(--busy===0)hide();};
  },async run(work,key){
    const revision=key?(revisions.get(key)||0)+1:0;if(key)revisions.set(key,revision);
    const release=api.begin(),started=Date.now(),ownEpoch=epoch;
    try{
      // 让浏览器先真正画出遮罩，再进行同步布局计算；连续滑动只执行最新参数。
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(ownEpoch!==epoch||(key&&revisions.get(key)!==revision))return;
      const result=await work();window.ResearchMapsUI?.syncControls();api.install();return result;
    }finally{
      const remaining=180-(Date.now()-started);
      if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
      release();
    }
  },install(){
    if(!window.d3)return;
    const controls={click:['filter-button','apply','reset','reset-period','relayout','timeline-train-topic','demo-apply','demo-relayout','demo-restore','airline-reset','updateButton'],
      change:['layout-mode','weight-mode','view-mode','color-mode','show-all-labels','show-links','show-isolates','density-weight','dual-layout','dual-show-hulls','mode','paper-row-type','paper-layout','time-granularity','demo-layout-mode','airline-labels'],
      input:[]};
    for(const [event,ids] of Object.entries(controls))for(const id of ids){
      const select=window.d3.select('#'+id);if(select.empty())continue;
      const handler=select.on(event);
      if(!handler||handler.chartLoadingWrapped)continue;
      const wrapped=function(...args){return api.run(()=>handler.apply(this,args),id+':'+event);};
      wrapped.chartLoadingWrapped=true;select.on(event,wrapped);
    }
  }};
  window.addEventListener('pagehide',()=>{epoch++;busy=0;revisions.clear();hide();});
})();
