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
  d3.select('#dual-map-zoom-level').text(`${Math.round(event.transform.k*100)}%`);
 });
svg.call(dualMapZoom).on('dblclick.zoom',null);
d3.select('#dual-map-zoom-in').on('click',()=>svg.call(dualMapZoom.scaleBy,1.25));
d3.select('#dual-map-zoom-out').on('click',()=>svg.call(dualMapZoom.scaleBy,0.8));
d3.select('#dual-map-reset-view').on('click',()=>svg.call(dualMapZoom.transform,d3.zoomIdentity));

const color=d3.scaleOrdinal(["#279fba","#df765b","#b59c3e","#65a78d","#927db1","#678fb4","#ba8b6f","#79a9b3","#a88eac","#8f9c64"]).domain([...new Set([...left,...right].map(d=>d.id))]);
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
d3.select("#stats").text(`100篇样本中${stats.with_reference_records}篇有参考文献记录；待查参考文献${stats.unique_reference_ids}个，已匹配${stats.resolved_reference_ids}个；已纳入期刊间引用${stats.included_edges||0}条，汇总为${data.paths.length}条学科路径。`);
const skipped=(stats.unresolved_work||0)+(stats.nonjournal_or_missing_source||0)+(stats.missing_field_mapping||0);
d3.select("#message").text(`未纳入${skipped}条：未匹配文献${stats.unresolved_work||0}，非期刊或缺失来源${stats.nonjournal_or_missing_source||0}，缺失学科归类${stats.missing_field_mapping||0}。${stats.failed_batches.length?"存在补查失败批次，当前结果不完整。":""}`);
dualMapViewport.append("text").attr("x",315).attr("y",35).attr("text-anchor","middle").attr("font-weight","bold").text("引用方期刊学科 →");
dualMapViewport.append("text").attr("x",885).attr("y",35).attr("text-anchor","middle").attr("font-weight","bold").text("→ 被引用方期刊学科");
const pathLayer=dualMapViewport.append("g");
const nodeLayer=dualMapViewport.append("g");
// 功能：保存各区域的点图层，调整力参数时只重排期刊，不移动学科与引用曲线。
const journalRegions=[];
let visiblePaths;
// 功能：引用路径按引用条数控制明暗，并保留主要路径突出及学科点击焦点。
let dualWeightOpacity=()=>0.35,majorPathOpacity=()=>0.35,focusedField=null;
function dualEdgeOpacity(path){
 if(!focusedField)return majorPathOpacity(path);
 return dualWeightOpacity(path,(focusedField.side==='left'?path.source:path.target)===focusedField.id?'focus':'dim');
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
  group.append('ellipse').attr('cx',position.x).attr('cy',position.y).attr('rx',rx).attr('ry',ry)
   .attr('fill',color(item.id)).attr('fill-opacity',0.055).attr('stroke',color(item.id)).attr('stroke-opacity',0.38);
  const ids=item.journalIds||[];
  const dots=group.append('g');
  journalRegions.push({ids,position,rx,ry,dots,field:item.id});
  const label=group.append('text').attr('x',position.x).attr('y',position.y-ry-24)
   .attr('text-anchor','middle').attr('font-size',11).attr('fill','#46545f');
  label.append('tspan').text(item.label.length>23?item.label.slice(0,21)+'…':item.label);
  label.append('tspan').attr('x',position.x).attr('dy',13).attr('font-size',10).attr('fill','#92a0aa')
   .text(`${item.journals} journals · ${side==='left'?outgoing.get(item.id):incoming.get(item.id)} citations`);
  group.append('title').text(`${item.label}：${item.journals}种期刊，点击查看分类依据`);
  group.on('click',event=>{event.stopPropagation();focusedField={side,id:item.id};visiblePaths.attr('opacity',dualEdgeOpacity);showJournals(item,side);});
 });
}
drawSide(left,"left");drawSide(right,"right");
// 功能：只改变椭圆内期刊点的位置；期刊ID、所属学科、引用计数均不改变。
function relayoutJournals(){
 const strength=Number(d3.select('#journal-charge').property('value'));
 if(!Number.isFinite(strength)||strength<0.1||strength>3)return;
 journalRegions.forEach(region=>{
  const nodes=layoutJournalsConstrained(region.ids,region.position,region.rx,region.ry,strength);
  const dots=region.dots.selectAll('circle').data(nodes,d=>d.id).join('circle')
   .attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',d=>d.radius)
   .attr('fill',color(region.field)).attr('opacity',0.65);
  dots.selectAll('title').remove();
  dots.append('title').text(d=>(journalProfiles.get(d.id)||{}).label||d.id);
 });
}
relayoutJournals();
d3.select('#relayout').on('click',relayoutJournals);
d3.select('#journal-charge').on('change',relayoutJournals);
// 功能：曲线从左至右连接学科，线宽单调反映引用边数量；两侧节点不随筛选移动。
function render(){
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
    .attr("d",p=>{const a=positions.get("left:"+p.source),b=positions.get("right:"+p.target);return `M${a.x+40},${a.y} C${a.x+(b.x-a.x)*0.38},${a.y-45} ${a.x+(b.x-a.x)*0.62},${b.y-45} ${b.x-40},${b.y}`;})
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
