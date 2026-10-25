/* 功能：原始权重控制透明度；普通/捆绑连线共用SVG路径及原边对象，保持点击证据与节点位置。 */
(function(root){
 'use strict';
 // 功能：当前显示边集合内按log1p权重映射明暗；同权重同透明度，不表达数据可信度。
 function opacityScale(edges,weight=d=>d.weight){
  const values=edges.map(d=>Math.log1p(Math.max(0,Number(weight(d))||0)));
  const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):0;
  return (edge,state='normal')=>{
   const t=high>low?Math.max(0,Math.min(1,(Math.log1p(Math.max(0,Number(weight(edge))||0))-low)/(high-low))):0.5;
   return state==='focus'?0.55+0.4*t:state==='dim'?0.015+0.055*t:0.10+0.50*t;
  };
 }
 // 功能：节点坐标/边拓扑均纳入快照键，防止旧线束覆盖新布局；重合点边单独画直线。
 function snapshot(nodes,edges){
  const ids=new Map(nodes.map((n,i)=>[n.name,String(i)])),byName=new Map(nodes.map(n=>[n.name,n]));
  const finite=nodes.filter(n=>Number.isFinite(n.x)&&Number.isFinite(n.y));
  if(finite.length!==nodes.length)return null;
  const x0=finite.length?Math.min(...finite.map(n=>n.x)):0,y0=finite.length?Math.min(...finite.map(n=>n.y)):0;
  const scale=Math.max(1,...finite.map(n=>Math.max(n.x-x0,n.y-y0)));
  const coordinates={};nodes.forEach(n=>{coordinates[ids.get(n.name)]={x:(n.x-x0)/scale,y:(n.y-y0)/scale};});
  const endpoint=v=>v&&typeof v==='object'?v.name:v;
  const valid=[],indices=[];
  edges.forEach((e,i)=>{const a=byName.get(endpoint(e.source)),b=byName.get(endpoint(e.target));if(a&&b&&(a.x!==b.x||a.y!==b.y)){valid.push({source:ids.get(a.name),target:ids.get(b.name)});indices.push(i);}});
  return {nodes:coordinates,edges:valid,indices,x0,y0,scale,key:JSON.stringify([nodes.map(n=>[n.name,n.x,n.y]),edges.map(e=>[endpoint(e.source),endpoint(e.target)])])};
 }
 function create(layer,getNodes,getEdges,options={}){
  const maximumEdges=options.maximumEdges||2000,maximumMs=options.maximumMs||20000;
  let paths,worker=null,timer=null,jobTimer=null,cached=null,pending=null,serial=0,lastKey=null,failedKey=null,releaseLoading=null;
  const svg=layer.node().ownerSVGElement,bar=document.createElement('div');bar.className='toolbar';
  bar.innerHTML='<label>连线画法 <select id="edge-render-mode"><option value="straight">普通连线</option><option value="bundled">捆绑连线</option></select></label><span id="edge-render-status" class="note" role="status"></span>';
  svg.parentElement.insertBefore(bar,svg);
  const select=bar.querySelector('select'),status=bar.querySelector('span');
  const normalMessage=options.description||'普通连线；透明度随原始关系次数增加，不表示数据可信度。';status.textContent=normalMessage;
  const line=d3.line().x(p=>p.x).y(p=>p.y).curve(d3.curveLinear);
  function finishLoading(){releaseLoading?.();releaseLoading=null;}
  function cancel(){serial++;clearTimeout(timer);clearTimeout(jobTimer);jobTimer=null;timer=null;if(worker)worker.terminate();worker=null;pending=null;finishLoading();}
  function straight(edge,lookup){
   const name=v=>v&&typeof v==='object'?v.name:v;
   const a=lookup.get(name(edge.source)),b=lookup.get(name(edge.target));
   return a&&b&&[a.x,a.y,b.x,b.y].every(Number.isFinite)?`M${a.x},${a.y}L${b.x},${b.y}`:null;
  }
  function paint(){
   if(!paths)return;
   const edges=getEdges(),index=new Map(edges.map((edge,i)=>[edge,i])),lookup=new Map(getNodes().map(n=>[n.name,n]));
   paths.attr('d',edge=>select.value==='bundled'&&cached?.key===lastKey&&cached.paths[index.get(edge)]?line(cached.paths[index.get(edge)]):straight(edge,lookup));
  }
  function start(snap){
   timer=null;
   if(select.value!=='bundled'||lastKey!==snap.key)return;
   if(!snap.edges.length){cached={key:snap.key,paths:[]};status.textContent='当前没有需要捆绑的有效连线。';return;}
   if(snap.edges.length>maximumEdges){failedKey=snap.key;status.textContent=`当前超过${maximumEdges}条连线，保留普通连线；提高关系门槛后可再捆绑。所有关系均保留。`;return;}
   try{
    releaseLoading=root.ChartLoading?.begin();
    worker=new Worker(new URL('../scripts/analysis/edge-bundling-worker.js?v=20261021-bundlefix14',location.href));pending=snap.key;
    const id=++serial;status.textContent='正在后台整理线束；节点和关系数据保持不变…';
    worker.onmessage=event=>{
     if(event.data.id!==serial||lastKey!==snap.key||select.value!=='bundled'||!worker)return;
     clearTimeout(jobTimer);jobTimer=null;worker.terminate();worker=null;pending=null;
     try{
      if(event.data.error)throw Error(event.data.error);
      if(event.data.paths.length!==snap.indices.length)throw Error('路径数量不匹配');
      const result=[];
      event.data.paths.forEach((points,i)=>{
       if(!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw Error('路径坐标无效');
       const edge=snap.edges[i],a=snap.nodes[edge.source],b=snap.nodes[edge.target];
       if(!points.length||Math.hypot(points[0].x-a.x,points[0].y-a.y)>1e-8||Math.hypot(points.at(-1).x-b.x,points.at(-1).y-b.y)>1e-8)throw Error('路径端点不匹配');
       result[snap.indices[i]]=points.map(p=>({x:p.x*snap.scale+snap.x0,y:p.y*snap.scale+snap.y0}));
      });
      cached={key:snap.key,paths:result};paint();status.textContent='捆绑完成。线束只整理路线，不代表新增关系或主题；点击节点追踪原有连接。'+(event.data.fallbackEdges?` ${event.data.fallbackEdges}条过度绕行的边保留普通线。`:'');
     }catch(error){failedKey=snap.key;cached=null;paint();status.textContent='捆绑未完成，已保留普通连线：'+error.message;}finally{finishLoading();}
    };
    worker.onerror=()=>{if(id!==serial)return;cancel();failedKey=snap.key;status.textContent='后台捆绑不可用，保留普通连线。';};
    // 功能：耗时过长时保留所有普通连线，不让后台任务无限占用资源。
    jobTimer=setTimeout(()=>{cancel();failedKey=snap.key;status.textContent='捆绑计算超时，保留普通连线；可提高关系门槛后重试。';},maximumMs);
    worker.postMessage({id,nodes:snap.nodes,edges:snap.edges});
   }catch(error){cancel();failedKey=snap.key;status.textContent='后台捆绑不可用，保留普通连线。';}
  }
  function update(){
   const snap=snapshot(getNodes(),getEdges());
   if(!snap){cancel();lastKey=null;cached=null;paint();return;}
   if(lastKey!==snap.key){cancel();lastKey=snap.key;}
   paint();
   if(select.value==='bundled'&&cached?.key!==snap.key&&pending!==snap.key&&!timer&&failedKey!==snap.key)timer=setTimeout(()=>start(snap),180);
  }
  const changeMode=()=>{cancel();failedKey=null;if(select.value==='straight')status.textContent=normalMessage;update();};
  select.addEventListener('change',()=>root.ChartLoading?root.ChartLoading.run(changeMode,'edge-render-mode'):changeMode());
  window.addEventListener('pagehide',cancel);
  return {bind(selection){paths=selection;cached=null;lastKey=null;failedKey=null;cancel();},update};
 }
 root.EdgeRendering={opacityScale,snapshot,create};
})(globalThis);
