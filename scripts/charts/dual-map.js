// 功能：dual-map图形计算、绘制及交互；数据由bootstrap就绪后注入。

// 功能：验证引用次数门槛，并按两侧学科筛选；不修改原数据。
function filterPaths(paths,minimum,left,right){
  return paths.filter(p=>p.value>=minimum&&(!left||p.source===left)&&(!right||p.target===right));
}
const data=dualMapData,svg=d3.select("#dual-map");
// 功能：按完整数据引用量排序学科，优先展示主要路径；筛选后坐标不变。
const outgoing=new Map(),incoming=new Map();
data.paths.forEach(p=>{outgoing.set(p.source,(outgoing.get(p.source)||0)+p.value);incoming.set(p.target,(incoming.get(p.target)||0)+p.value);});
const left=[...data.left].sort((a,b)=>(outgoing.get(b.id)||0)-(outgoing.get(a.id)||0)||a.label.localeCompare(b.label));
const right=[...data.right].sort((a,b)=>(incoming.get(b.id)||0)-(incoming.get(a.id)||0)||a.label.localeCompare(b.label));
const journalProfiles=new Map(data.journalMapping.map(j=>[j.id,j]));
// 功能：多列学科区域使用较宽的横向画布，避免退化为两条长列表。
const height=Math.max(740,Math.ceil(Math.max(left.length,right.length)/3)*88+190);
svg.attr("viewBox",`0 0 1200 ${height}`).attr("height",height);
// 功能：整张双图同步缩放平移，只改变视图，不修改期刊排布、归类或引用数据。
const dualMapViewport=svg.append('g').attr('class','dual-map-viewport');
const dualMapZoom=d3.zoom().scaleExtent([0.25,8]).clickDistance(5)
 .on('zoom',event=>{
  dualMapViewport.attr('transform',event.transform);
  if(typeof nodeLayer!=='undefined')LabelLayout.schedule(nodeLayer.selectAll('.discipline-label'),{priority:()=>1});
  d3.select('#dual-map-zoom-level').text(`${Math.round(event.transform.k*100)}%`);
 });
svg.call(dualMapZoom).on('dblclick.zoom',null);
window.WorkspaceZoom={scaleBy:factor=>{
 if(document.getElementById('dual-layout').value==='cells')window.WorkspaceSVGZoom?.(document.querySelector('#journal-cells-host svg'),factor);
 else svg.call(dualMapZoom.scaleBy,factor);
}};
d3.select('#dual-map-zoom-in').on('click',()=>svg.call(dualMapZoom.scaleBy,1.25));
d3.select('#dual-map-zoom-out').on('click',()=>svg.call(dualMapZoom.scaleBy,0.8));
d3.select('#dual-map-reset-view').on('click',()=>svg.call(dualMapZoom.transform,d3.zoomIdentity));

const fieldIds=[...new Set([...left,...right].map(d=>d.id))];
const color=d3.scaleOrdinal(createClusterPalette(fieldIds.length)).domain(fieldIds);
const positions=new Map();
// 功能：先固定左右分区，再用受约束的力布局学科；筛选不重排。
function positionSide(items,side){
 layoutDisciplineAreas(items,side,height).forEach(node=>positions.set(`${side}:${node.id}`,{x:node.x,y:node.y}));
}
positionSide(left,"left");positionSide(right,"right");
for(const [id,items] of [["left-filter",left],["right-filter",right]]){
  const select=d3.select("#"+id);select.append("option").attr("value","").text("全部学科");
  items.forEach(item=>select.append("option").attr("value",item.id).text(item.label));
}
const stats=data.stats;
d3.select("#stats").text(`${stats.sample_works||100}篇样本中${stats.with_reference_records}篇有参考文献记录；待查参考文献${stats.unique_reference_ids}个，已匹配${stats.resolved_reference_ids}个；已纳入期刊间引用${stats.included_edges||0}条，汇总为${data.paths.length}条学科路径。`);
const skipped=(stats.unresolved_work||0)+(stats.nonjournal_or_missing_source||0)+(stats.missing_field_mapping||0);
d3.select("#message").text(`未纳入${skipped}条：未匹配文献${stats.unresolved_work||0}，非期刊或缺失来源${stats.nonjournal_or_missing_source||0}，缺失学科归类${stats.missing_field_mapping||0}。${stats.failed_batches.length?"存在补查失败批次，当前结果不完整。":""}`);
dualMapViewport.append("text").attr("x",315).attr("y",35).attr("text-anchor","middle").attr("font-weight","bold").text("引用方期刊学科 →");
dualMapViewport.append("text").attr("x",885).attr("y",35).attr("text-anchor","middle").attr("font-weight","bold").text("→ 被引用方期刊学科");
const hullLayer=dualMapViewport.append("g").attr("class","dual-flexible-hulls").attr("pointer-events","none");
const pathLayer=dualMapViewport.append("g");
const nodeLayer=dualMapViewport.append("g");
// 功能：保存各区域的点图层，调整力参数时只重排期刊，不移动学科与引用曲线。
const journalRegions=[];
let visiblePaths;
const scatterMode=()=>d3.select("#dual-layout").property("value")==="scatter";
let scatterNodes={left:[],right:[]};
let originalCells=null;
const originalCellMode=()=>d3.select('#dual-layout').property('value')==='cells';
function syncOriginalCells(){
 const active=originalCellMode();
 // SVG没有HTML元素的hidden属性反射，必须显式设置特性与显示样式。
 d3.select('#dual-map').attr('hidden',active?'':null).style('display',active?'none':null,'important');
 d3.select('#journal-cells-host').property('hidden',!active);
 d3.select('#original-cell-controls').property('hidden',!active);
 for(const id of ['major-paths','journal-charge','minimum','left-filter','right-filter'])
  document.getElementById(id).closest('label').hidden=active;
 for(const id of ['relayout','apply','reset'])document.getElementById(id).hidden=active;
 document.getElementById('dual-map-zoom-in').closest('.toolbar').hidden=true;
 document.getElementById('dual-hulls-control').hidden=active||!scatterMode();
 d3.select('#dual-area-description').style('display',active||scatterMode()?'none':null);
 d3.select('#dual-layout-help').style('display',!active&&scatterMode()?null:'none');
 if(active){
  if(!originalCells)originalCells=mountJournalCells(document.getElementById('journal-cells-host'),data,color);
  else originalCells.start();
  d3.select('#original-cell-info').text(`${originalCells.count}种真实期刊 · ${originalCells.fields}个学科 · 节点半径按期刊来源作品量映射3–10，不是样本被引次数；拖动圆点体验原示例，Toggle Cells切换。`);
 }else originalCells?.stop();
 return active;
}

const jellyStates=new Map();let jellyFrame=null;
const activeCellMotions=new Map();
function stopCellMotions(){
 for(const motion of activeCellMotions.values()){motion.simulation.stop();clearTimeout(motion.timeout);for(const n of motion.nodes){n.fx=null;n.fy=null;}}
 activeCellMotions.clear();
}
function paintCell(region,nodes){
 region.position.x=d3.mean(nodes,n=>n.x);region.position.y=d3.mean(nodes,n=>n.y);
 region.dots.selectAll('circle').attr('cx',n=>n.x).attr('cy',n=>n.y);
 region.group.select('text').attr('x',region.position.x).attr('y',region.position.y-region.ry-24)
  .selectAll('tspan[x]').attr('x',region.position.x);
 if(visiblePaths)visiblePaths.attr('d',dualPathGeometry);
 redrawJelly();LabelLayout.schedule(nodeLayer.selectAll('.discipline-label'),{priority:()=>1});
}
// 使用Force Layout Cells跨组节点碰撞，不再叠加原有SAT轮廓推开。
function pushDualRegions(activeKey){
 const regions=journalRegions.filter(r=>r.dots.selectAll('circle').size());
 if(!scatterMode()){
  for(const side of ['left','right']){
   const proxies=regions.filter(r=>r.side===side).map(region=>({region,x:region.position.x,y:region.position.y,radius:Math.max(region.rx,region.ry),field:region.field}));
   NodeCollision.resolve(proxies,null,n=>n.radius,{alpha:0.2,passes:4,gap:6,fixed:n=>side+':'+n.field===activeKey});
   for(const proxy of proxies){const region=proxy.region,dx=proxy.x-region.position.x,dy=proxy.y-region.position.y;
    const delta=dualRegionDelta([{x:region.position.x-region.rx,y:region.position.y-region.ry,radius:3},{x:region.position.x+region.rx,y:region.position.y+region.ry,radius:3}],side,height,dx,dy);
    region.position.x+=delta.dx;region.position.y+=delta.dy;
    region.dots.selectAll('circle').each(n=>{n.x+=delta.dx;n.y+=delta.dy;});
    region.group.select('ellipse').attr('cx',region.position.x).attr('cy',region.position.y);
   }
  }
 }
 for(const side of ['left','right']){
  if(!scatterMode())continue;
  const selected=regions.filter(r=>r.side===side),owner=new Map();
  const nodes=selected.flatMap(region=>region.dots.selectAll('circle').data().map(n=>{owner.set(n,region);return n;}));
  NodeCollision.resolve(nodes,null,n=>n.radius,{passes:4,alpha:0.2,gap:2,clusterGap:22,
   group:n=>owner.get(n).field,fixed:n=>owner.get(n).side+':'+owner.get(n).field===activeKey});
  const lo=side==='left'?35:635,hi=side==='left'?565:1165;
  for(const n of nodes){n.x=Math.max(lo+n.radius,Math.min(hi-n.radius,n.x));n.y=Math.max(65+n.radius,Math.min(height-25-n.radius,n.y));}
 }
 for(const region of regions){
  if(scatterMode()){
   const nodes=region.dots.selectAll('circle').data();
   region.position.x=d3.mean(nodes,n=>n.x);region.position.y=d3.mean(nodes,n=>n.y);
  }
  region.dots.selectAll('circle').attr('cx',n=>n.x).attr('cy',n=>n.y);
  region.group.select('text').attr('x',region.position.x).attr('y',region.position.y-region.ry-24).selectAll('tspan[x]').attr('x',region.position.x);
 }
 if(visiblePaths)visiblePaths.attr('d',dualPathGeometry);redrawJelly();
}
function ellipseNodeDrag(region){
 return d3.drag().container(dualMapViewport.node()).clickDistance(4)
 .on('start',event=>event.sourceEvent.stopPropagation())
 .on('drag',(event,node)=>{
  const nodes=region.dots.selectAll('circle').data();
  const constrain=n=>{
   const rx=Math.max(1,region.rx-n.radius),ry=Math.max(1,region.ry-n.radius);
   const dx=n.x-region.position.x,dy=n.y-region.position.y,k=Math.hypot(dx/rx,dy/ry);
   if(k>1){n.x=region.position.x+dx/k;n.y=region.position.y+dy/k;}
  };
  const target={...node,x:event.x,y:event.y};constrain(target);
  NodeCollision.move(nodes,node,target.x,target.y,n=>n.radius,{gap:0.5});
  for(let i=0;i<4;i++){nodes.forEach(constrain);NodeCollision.resolve(nodes,node,n=>n.radius,{gap:0.5,passes:2});}
  nodes.forEach(constrain);region.dots.selectAll('circle').attr('cx',n=>n.x).attr('cy',n=>n.y);
 });
}
function cellNodeDrag(region){
 const key=region.side+':'+region.field;
 return d3.drag().container(dualMapViewport.node()).clickDistance(4)
 .on('start',(event,node)=>{
  event.sourceEvent.stopPropagation();
  const previous=activeCellMotions.get(key);if(previous){previous.simulation.stop();clearTimeout(previous.timeout);for(const n of previous.nodes){n.fx=null;n.fy=null;}}
  jellyStates.delete(key);
  const nodes=region.dots.selectAll('circle').data();
  const origins=new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
  const motion={nodes,origins,dx:0,dy:0,timeout:null,anchor:node};
  const springX=d3.forceX(n=>origins.get(n.id).x).strength(0.035);
  const springY=d3.forceY(n=>origins.get(n.id).y).strength(0.035);
  const simulation=d3.forceSimulation(nodes).stop().velocityDecay(0.22).alphaDecay(0.06)
   .force('spring-x',springX).force('spring-y',springY)
   .force('collide',null);
  motion.simulation=simulation;motion.springX=springX;motion.springY=springY;
  simulation.on('tick',()=>{
   const lo=region.side==='left'?35:635,hi=region.side==='left'?565:1165;
   for(const n of nodes){n.x=Math.max(lo+n.radius,Math.min(hi-n.radius,n.x));n.y=Math.max(65+n.radius,Math.min(height-25-n.radius,n.y));}
   NodeCollision.resolve(nodes,node,n=>n.radius,{gap:2,passes:2,alpha:0.2});
   paintCell(region,nodes);pushDualRegions(key);
  }).on('end',()=>{clearTimeout(motion.timeout);if(activeCellMotions.get(key)===motion)activeCellMotions.delete(key);});
  node.fx=node.x;node.fy=node.y;activeCellMotions.set(key,motion);
  simulation.alpha(0.45).alphaTarget(0.15).restart();
 })
 .on('drag',(event,node)=>{
  const motion=activeCellMotions.get(key);if(!motion)return;
  const delta=dualRegionDelta([...motion.origins.values()].map(n=>({...n,radius:node.radius})),region.side,height,event.x-motion.origins.get(node.id).x,event.y-motion.origins.get(node.id).y);
  motion.dx=delta.dx;motion.dy=delta.dy;
  NodeCollision.move(motion.nodes,node,motion.origins.get(node.id).x+delta.dx,motion.origins.get(node.id).y+delta.dy,n=>n.radius,{gap:2});
  node.fx=node.x;node.fy=node.y;
  motion.springX.x(n=>motion.origins.get(n.id).x+motion.dx);
  motion.springY.y(n=>motion.origins.get(n.id).y+motion.dy);
 })
 .on('end',(event,node)=>{
  const motion=activeCellMotions.get(key);if(!motion)return;
  node.fx=null;node.fy=null;motion.simulation.alphaTarget(0).alpha(0.4).restart();
  motion.timeout=setTimeout(()=>{motion.simulation.stop();paintCell(region,motion.nodes);pushDualRegions(key);if(activeCellMotions.get(key)===motion)activeCellMotions.delete(key);},1400);
 });
}

function stopJelly(){if(jellyFrame!==null)cancelAnimationFrame(jellyFrame);jellyFrame=null;jellyStates.clear();}
function jellyPath(group){
 const state=jellyStates.get(group.key);if(!state)return flexibleHullPath(group.nodes);
 const cx=d3.mean(group.nodes,n=>n.x),cy=d3.mean(group.nodes,n=>n.y);
 const span=Math.max(20,d3.max(group.nodes,n=>Math.hypot(n.x-cx,n.y-cy))||0);
 return flexibleHullPath(group.nodes.map(n=>({...n,
  x:n.x+state.x*(0.55+0.35*(n.y-cy)/span),
  y:n.y+state.y*(0.55+0.35*(n.x-cx)/span)})));
}
function redrawJelly(){hullLayer.selectAll('path').attr('d',jellyPath);}
function settleJelly(key){
 const state=jellyStates.get(key);if(!state)return;
 state.start=performance.now();state.baseX=state.x;state.baseY=state.y;state.releasing=true;
 if(jellyFrame!==null)return;
 const frame=now=>{
  jellyFrame=null;let moving=false;
  for(const [id,s] of jellyStates){if(!s.releasing)continue;
   const t=now-s.start;if(t>=650){jellyStates.delete(id);continue;}
   const k=jellyDecay(t);s.x=s.baseX*k;s.y=s.baseY*k;moving=true;
  }
  redrawJelly();if(moving)jellyFrame=requestAnimationFrame(frame);
 };
 jellyFrame=requestAnimationFrame(frame);
}
function dualPathGeometry(p){
 const a=positions.get('left:'+p.source),b=positions.get('right:'+p.target),offset=scatterMode()?0:40;
 return `M${a.x+offset},${a.y} C${a.x+(b.x-a.x)*0.38},${a.y-45} ${a.x+(b.x-a.x)*0.62},${b.y-45} ${b.x-offset},${b.y}`;
}
function regionDrag(side,field){
 const key=side+':'+field;
 return d3.drag().container(dualMapViewport.node()).clickDistance(4)
  .on('start',event=>{event.sourceEvent.stopPropagation();jellyStates.delete(key);})
  .on('drag',event=>{
   const region=journalRegions.find(r=>r.side===side&&r.field===field);if(!region)return;
   const nodes=region.dots.selectAll('circle').data();
   const delta=dualRegionDelta(nodes,side,height,event.dx,event.dy);
   if(!delta.dx&&!delta.dy)return;
   for(const n of nodes){n.x+=delta.dx;n.y+=delta.dy;}
   region.position.x+=delta.dx;region.position.y+=delta.dy;
   region.dots.selectAll('circle').attr('cx',n=>n.x).attr('cy',n=>n.y);
   region.group.select('ellipse').attr('cx',region.position.x).attr('cy',region.position.y);
   region.group.select('text').attr('x',region.position.x).attr('y',region.position.y-region.ry-24)
    .selectAll('tspan[x]').attr('x',region.position.x);
   if(scatterMode()&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const old=jellyStates.get(key)||{x:0,y:0};
    jellyStates.set(key,{x:Math.max(-18,Math.min(18,old.x*0.5-delta.dx)),y:Math.max(-18,Math.min(18,old.y*0.5-delta.dy)),releasing:false});
   }
   pushDualRegions(key);
   if(visiblePaths)visiblePaths.attr('d',dualPathGeometry);
   redrawJelly();
   LabelLayout.schedule(nodeLayer.selectAll('.discipline-label'),{priority:()=>1});
  })
  .on('end',()=>settleJelly(key));
}
addEventListener('pagehide',()=>{stopJelly();stopCellMotions();originalCells?.stop();});

// 功能：引用路径按引用条数控制明暗，并保留主要路径突出及学科点击焦点。
let dualWeightOpacity=()=>0.35,majorPathOpacity=()=>0.35,focusedField=null;
function dualEdgeOpacity(path){
 if(!focusedField)return majorPathOpacity(path);
 return dualWeightOpacity(path,(focusedField.side==='left'?path.source:path.target)===focusedField.id?'focus':'dim');
}
// 柔性区域位于路径和节点下方；区域可拖动，引用线与期刊点击仍优先。
function updateFlexibleHulls(){
 const active=scatterMode();d3.select('#dual-hulls-control').property('hidden',!active);
 const groups=[];
 if(active&&d3.select('#dual-show-hulls').property('checked')){
  for(const side of ['left','right'])for(const [field,nodes] of d3.group(scatterNodes[side],n=>n.field))
   groups.push({key:side+':'+field,side,field,nodes});
 }
 hullLayer.selectAll('path').data(groups,d=>d.key).join('path')
  .attr('d',jellyPath).attr('fill',d=>color(d.field)).attr('fill-opacity',0.10)
  .attr('stroke',d=>color(d.field)).attr('stroke-opacity',0.38).attr('stroke-width',1.2)
  .attr('vector-effect','non-scaling-stroke').attr('pointer-events','none');
}
// 功能：点击引用路径时分页显示原论文对，所有标题用text写入避免解释为HTML。
function showEvidence(path){
  const panel=d3.select("#details");panel.selectAll("*").remove();panel.text("");
  panel.append("strong").text(`${path.sourceLabel} → ${path.targetLabel}：${path.value}条引用关系`);
  panel.append("p").text(`占该引用方学科全部纳入引用的${(100*path.value/(outgoing.get(path.source)||1)).toFixed(1)}%。计数单位是论文→参考文献的有向引用边，不是独立样本论文数。`);
  const list=panel.append("ol");let shown=0;
  const button=panel.append("button").text("显示更多");
  function more(){
    path.evidence.slice(shown,shown+25).forEach(pair=>{
      const li=list.append("li");
      li.append("a").attr("href",pair.citingId).attr("target","_blank").attr("rel","noopener noreferrer").text(pair.citingTitle||pair.citingId);
      li.append("span").text(`（${pair.citingJournal}） 引用 `);
      li.append("a").attr("href",pair.citedId).attr("target","_blank").attr("rel","noopener noreferrer").text(pair.citedTitle||pair.citedId);
      li.append("span").text(`（${pair.citedJournal}）`);
    });shown=Math.min(shown+25,path.evidence.length);button.style("display",shown<path.evidence.length?null:"none");
  }
  button.on("click",more);more();
}
// 功能：显示期刊本身的主题画像与归类依据，观察薄弱或多学科归类。
function showJournals(item,side){
 const panel=d3.select('#details');panel.selectAll('*').remove();panel.text('');
 panel.append('strong').text(`${side==='left'?'引用方':'被引方'} · ${item.label} · ${item.journals}种期刊`);
 panel.append('p').text('分类依据为OpenAlex Source.topics返回主题的count按field聚合。以下支持率仅指返回主题计数内比例，不是期刊全部论文比例；低于60%提示画像较混合，此阈值仅作说明，不改变归类。');
 const list=panel.append('ul');
 (item.journalIds||[]).map(id=>journalProfiles.get(id)).filter(Boolean)
  .sort((a,b)=>a.label.localeCompare(b.label)).forEach(journal=>{
   const row=list.append('li');row.append('a').attr('href',journal.id).attr('target','_blank').attr('rel','noopener noreferrer').text(journal.label);
   row.append('span').text(` · ${journal.fieldLabel} · 返回主题支持率${(100*journal.supportShare).toFixed(1)}%${journal.supportShare<0.6?'（混合画像）':''}`);
  });
}
// 功能：每个背景点对应真实期刊；点位由受约束的力导向计算，不推断期刊距离。
function drawSide(items,side){
 items.forEach(item=>{
  const position=positions.get(`${side}:${item.id}`),group=nodeLayer.append('g').style('cursor','pointer');
  const rx=28+Math.min(22,Math.sqrt(item.journals)*2.5),ry=13+Math.min(12,Math.sqrt(item.journals));
  if(!scatterMode())group.append('ellipse').attr('cx',position.x).attr('cy',position.y).attr('rx',rx).attr('ry',ry)
   .attr('fill',color(item.id)).attr('fill-opacity',0.055).attr('stroke',color(item.id)).attr('stroke-opacity',0.38);
  const ids=item.journalIds||[];
  const dots=group.append('g');
  journalRegions.push({ids,position,rx,ry,dots,field:item.id,side,group});
  if(!scatterMode())group.call(regionDrag(side,item.id));
  const label=group.append('text').attr('class','discipline-label').attr('x',position.x).attr('y',position.y-ry-24)
   .attr('text-anchor','middle').attr('font-size',11).attr('fill','#46545f');
  label.append('tspan').text(item.label.length>23?item.label.slice(0,21)+'…':item.label);
  label.append('tspan').attr('x',position.x).attr('dy',13).attr('font-size',10).attr('fill','#92a0aa')
   .text(`${item.journals} journals · ${side==='left'?outgoing.get(item.id):incoming.get(item.id)} citations`);
  group.append('title').text(`${item.label}：${item.journals}种期刊，点击查看分类依据`);
  group.on('click',event=>{event.stopPropagation();focusedField={side,id:item.id};visiblePaths.attr('opacity',dualEdgeOpacity);showJournals(item,side);});
 });
}

// 功能：只改变椭圆内期刊点的位置；期刊ID、所属学科、引用计数均不改变。
let journalChargeFrame=null,journalChargeJobs=[];
function relayoutJournals(){
 stopJournalCharge();
 stopCellMotions();stopJelly();
 if(syncOriginalCells())return;
 const strength=Number(d3.select('#journal-charge').property('value'));
 if(!Number.isFinite(strength)||strength<0.1||strength>3)return;
 d3.select('#dual-area-description').style('display',scatterMode()?'none':null);
 d3.select('#dual-layout-help').style('display',scatterMode()?null:'none');
 if(scatterMode()){
  for(const [side,items] of [['left',left],['right',right]]){
   scatterNodes[side]=layoutDualScatter(items,side,height,strength);
   for(const item of items){const members=scatterNodes[side].filter(n=>n.field===item.id);
    if(members.length)positions.set(`${side}:${item.id}`,{x:d3.mean(members,n=>n.x),y:d3.mean(members,n=>n.y)});
   }
  }
 }else{positionSide(left,'left');positionSide(right,'right');}
 nodeLayer.selectAll('*').remove();journalRegions.length=0;
 drawSide(left,'left');drawSide(right,'right');
 journalRegions.forEach(region=>{
  const nodes=scatterMode()?scatterNodes[region.side].filter(n=>n.field===region.field):layoutJournalsConstrained(region.ids,region.position,region.rx,region.ry,strength);
  const dots=region.dots.selectAll('circle').data(nodes,d=>d.id).join('circle')
   .attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',d=>d.radius)
   .attr('fill',color(region.field)).attr('opacity',0.65);
  dots.style('cursor','grab').call(scatterMode()?cellNodeDrag(region):ellipseNodeDrag(region));
  dots.selectAll('title').remove();
  dots.append('title').text(d=>(journalProfiles.get(d.id)||{}).label||d.id);
 });
 updateFlexibleHulls();
 if(scatterMode())LabelLayout.schedule(nodeLayer.selectAll('.discipline-label'),{priority:()=>1});
}
relayoutJournals();
d3.select('#relayout').on('click',()=>{relayoutJournals();render();});
// 连续输入只更新最新参数；每帧推进两轮，保持现有DOM、坐标起点与视角。

function stopJournalCharge(){
 if(journalChargeFrame!==null)cancelAnimationFrame(journalChargeFrame);
 journalChargeFrame=null;
 for(const job of journalChargeJobs)job.sim.stop();journalChargeJobs=[];
}
function startJournalCharge(){
 const strength=Number(d3.select('#journal-charge').property('value'));
 if(originalCellMode()||!Number.isFinite(strength)||strength<0.1||strength>3)return;
 stopCellMotions();stopJelly();
 if(!journalChargeJobs.length){
  const groups=scatterMode()?['left','right'].map(side=>({side,nodes:scatterNodes[side]})):
   journalRegions.map(region=>({region,nodes:region.dots.selectAll('circle').data()}));
  journalChargeJobs=groups.filter(job=>job.nodes.length).map(job=>{
   job.scatter=scatterMode();
   const sim=d3.forceSimulation(job.nodes).stop();
   if(job.scatter){
    job.nodes.forEach(n=>n.groupId=n.field);
    sim.force('center',d3.forceCenter(job.side==='left'?300:900,height/2+15));
   }else{
    const c=job.region.position;
    sim.force('x',d3.forceX(c.x).strength(.035)).force('y',d3.forceY(c.y).strength(.035))
     .force('collision',d3.forceCollide().radius(n=>n.radius+.3).iterations(2));
   }
   return {...job,sim};
  });
 }
 for(const job of journalChargeJobs){
  job.sim.force(job.scatter?'cluster':'repulsion',job.scatter?
   forceDualScatterClusters(job.nodes,12+strength*8):d3.forceManyBody().strength(-strength));
  job.sim.alpha(.35);
 }
 if(journalChargeFrame===null)journalChargeFrame=requestAnimationFrame(tickJournalCharge);
}
function tickJournalCharge(){
 journalChargeFrame=null;let active=false;
 for(const job of journalChargeJobs){
  job.sim.tick(2);active ||= job.sim.alpha()>.015;
  for(const n of job.nodes){
   if(job.scatter){const lo=job.side==='left'?35:635,hi=job.side==='left'?565:1165;
    n.x=Math.max(lo+n.radius,Math.min(hi-n.radius,n.x));n.y=Math.max(65+n.radius,Math.min(height-25-n.radius,n.y));
   }else clampJournalPoint(n,job.region.position,job.region.rx,job.region.ry);
  }
 }
 for(const region of journalRegions){
  const dots=region.dots.selectAll('circle');dots.attr('cx',n=>n.x).attr('cy',n=>n.y);
  if(scatterMode()&&dots.size()){
   const nodes=dots.data();region.position.x=d3.mean(nodes,n=>n.x);region.position.y=d3.mean(nodes,n=>n.y);
   region.group.select('text').attr('x',region.position.x).attr('y',region.position.y-region.ry-24).selectAll('tspan[x]').attr('x',region.position.x);
  }
 }
 updateFlexibleHulls();if(visiblePaths)visiblePaths.attr('d',dualPathGeometry);
 if(scatterMode())LabelLayout.schedule(nodeLayer.selectAll('.discipline-label'),{priority:()=>1});
 if(active)journalChargeFrame=requestAnimationFrame(tickJournalCharge);else stopJournalCharge();
}
d3.select('#journal-charge').on('input',startJournalCharge);
svg.on('pointerdown.journal-charge',stopJournalCharge);
addEventListener('pagehide',stopJournalCharge);

d3.select('#dual-show-hulls').on('change',updateFlexibleHulls);
d3.select('#dual-layout').on('change',()=>{relayoutJournals();render();});
// 功能：曲线从左至右连接学科，线宽单调反映引用边数量；两侧节点不随筛选移动。
function render(){
 if(originalCellMode()){d3.select("#details").text("原版Cell独立视图：不绘制引用路径或左右分区；同一期刊仅出现一次，按已有学科分组。原版聚拢、碰撞、四角凸包、节点拖动和Toggle Cells均保留。切回其他布局可查看引用证据。");return;}
  const minimum=Number(d3.select("#minimum").property("value"));
  if(!Number.isInteger(minimum)||minimum<1){d3.select("#details").text("最少引用次数需为正整数。");return;}
  const majorCount=Number(d3.select('#major-paths').property('value'));
  if(!Number.isInteger(majorCount)||majorCount<1||majorCount>50){d3.select('#details').text('突出路径数量需为1–50的整数。');return;}
  const paths=filterPaths(data.paths,minimum,d3.select("#left-filter").property("value"),d3.select("#right-filter").property("value"));
  const ranked=[...paths].sort((a,b)=>b.value-a.value);
  const major=new Set(ranked.slice(0,majorCount).map(p=>JSON.stringify([p.source,p.target])));
  const isMajor=p=>major.has(JSON.stringify([p.source,p.target]));
  dualWeightOpacity=EdgeRendering.opacityScale(paths,p=>p.value);
  majorPathOpacity=p=>dualWeightOpacity(p,isMajor(p)?'focus':'normal');focusedField=null;
  // 功能：先画次要路径、后画主要路径，避免背景线遮挡主通道。
  visiblePaths=pathLayer.selectAll("path").data([...ranked].reverse(),p=>JSON.stringify([p.source,p.target])).join("path")
    .attr("d",dualPathGeometry)
    .attr("fill","none").attr("stroke",p=>color(p.source)).attr("stroke-width",p=>Math.min(24,1+Math.sqrt(p.value)))
    .attr("opacity",dualEdgeOpacity).attr("stroke-linecap","round").style("cursor","pointer");
  visiblePaths.selectAll("title").remove();
  visiblePaths.append("title").text(p=>`${p.sourceLabel} → ${p.targetLabel}：${p.value}条引用，占该引用方学科全部纳入引用${(100*p.value/(outgoing.get(p.source)||1)).toFixed(1)}%`);
  visiblePaths.on("mouseenter",function(event,p){d3.select(this).attr("opacity",dualWeightOpacity(p,'focus'));})
    .on("mouseleave",function(event,p){d3.select(this).attr("opacity",dualEdgeOpacity(p));})
    .on("click",(event,p)=>{event.stopPropagation();showEvidence(p);});
  visiblePaths.order();
  d3.select("#details").text(`粗线突出前${Math.min(majorCount,paths.length)}条路径。当前显示${paths.length}条学科路径，包含${paths.reduce((sum,p)=>sum+p.value,0)}条引用关系。点击曲线查看证据。`);
}
// 功能：绑定筛选、恢复和空白取消高亮。
d3.select("#apply").on("click",render);
d3.select("#reset").on("click",()=>{d3.select("#minimum").property("value",1);d3.select("#left-filter").property("value","");d3.select("#right-filter").property("value","");render();});
svg.on("click",render);render();
