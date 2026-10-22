// 功能：限制学科区域在引用方或被引方各自的版面内，不赋予距离任何语义。
function clampDiscipline(node,bounds){
 node.x=Math.max(bounds.x0,Math.min(bounds.x1,node.x));
 node.y=Math.max(bounds.y0,Math.min(bounds.y1,node.y));
}
// 功能：由学科ID生成稳定的0–1伪随机值；不用Math.random，保证刷新与重建结果一致。
function hashUnit(text,salt){
 let h=(2166136261^salt)>>>0;
 for(let i=0;i<text.length;i++){h=(h^text.charCodeAt(i))>>>0;h=Math.imul(h,16777619)>>>0;}
 h=(h^(h>>>15))>>>0;h=Math.imul(h,2246822507)>>>0;h=(h^(h>>>13))>>>0;h=Math.imul(h,3266489909)>>>0;
 return ((h^(h>>>16))>>>0)/4294967296;
}
// 功能：按涉及期刊数推算学科椭圆半径；与页面绘图共用同一公式，保证留白与椭圆实际大小一致。
function disciplineRadii(item){
 const s=Math.sqrt(item.journals||0);
 return {rx:28+Math.min(22,s*2.5),ry:13+Math.min(12,s)};
}
// 功能：把学科排成不对称的散落版面：按椭圆高度贪心分列，列内不等距堆叠，再叠加稳定错落偏移。
// 只使用学科自身的期刊数与ID，不按引用相似度建立力、不赋予距离任何含义；学科ID与传入顺序不变。
function layoutDisciplineAreas(items,side,height){
 const bounds=side==='left'?{x0:85,x1:435,y0:115,y1:height-65}:{x0:765,x1:1115,y0:115,y1:height-65};
 const W=bounds.x1-bounds.x0,H=bounds.y1-bounds.y0;
 const columns=items.length>6?3:(items.length>2?2:1);
 const bandW=W/columns,gap=22;
 // 功能：每个学科记录椭圆半径、纵向占位高度（含上方标签）和两个稳定随机量。
 const records=items.map(item=>{
  const r=disciplineRadii(item);
  return {item,r,slot:2*r.ry+34,jx:hashUnit(String(item.id),7),jy:hashUnit(String(item.id),23)};
 });
 // 功能：按占位高度贪心分列，各列的条目数与总高不同，形成不规则分栏而非等分网格。
 const columnLists=Array.from({length:columns},()=>[]),columnHeights=new Array(columns).fill(0);
 [...records].sort((a,b)=>b.slot-a.slot).forEach(rec=>{
  let k=0;for(let c=1;c<columns;c++)if(columnHeights[c]<columnHeights[k])k=c;
  columnLists[k].push(rec);columnHeights[k]+=rec.slot+gap;
 });
 // 功能：列内首尾贴边、间距不等地铺满可用高度；间距按稳定随机量抖动，形成散落而非等距网格。
 // 内容高度超出可用高度时整体等比压缩，保证不越界。
 columnLists.forEach((list,c)=>{
  const gaps=list.map(rec=>0.55+0.9*rec.jy);
  const sumSlots=list.reduce((s,rec)=>s+rec.slot,0);
  const sumGaps=Math.max(1e-6,gaps.reduce((s,g)=>s+g,0));
  const centerX=bounds.x0+bandW*(c+0.5);
  let y=bounds.y0;
  // 功能：单条目列直接居中，避免除零。
  if(list.length===1){
   const rec=list[0];
   rec.tx=centerX+(rec.jx-0.5)*Math.min(bandW*0.5,46);
   rec.ty=bounds.y0+H/2;
   return;
  }
  // 功能：可分配给间隔的空间；不足时对内容与间隔一起等比压缩。
  const avail=H-sumSlots;
  const scale=avail>0?1:H/sumSlots;
  const gapTotal=avail>0?avail:0;
  list.forEach((rec,i)=>{
   rec.tx=centerX+(rec.jx-0.5)*Math.min(bandW*0.5,46);
   rec.ty=y+(rec.slot*scale)/2;
   y+=rec.slot*scale+(i<list.length-1?gapTotal*gaps[i]/sumGaps:0);
  });
 });
 // 功能：用受边界约束的力布局消除重叠；位置力较弱、排斥力较小，允许结果保留错落感。
 const nodes=records.map(rec=>({id:rec.item.id,x:rec.tx,y:rec.ty,tx:rec.tx,ty:rec.ty,r:Math.max(rec.r.rx+6,rec.r.ry+16)}));
 const simulation=d3.forceSimulation(nodes).stop()
  .force('x',d3.forceX(d=>d.tx).strength(0.22))
  .force('y',d3.forceY(d=>d.ty).strength(0.34))
  .force('repulsion',d3.forceManyBody().strength(-30))
  .force('collision',d3.forceCollide(d=>d.r).iterations(3));
 for(let i=0;i<160;i++){simulation.tick();nodes.forEach(node=>clampDiscipline(node,bounds));}
 return nodes.map(node=>({id:node.id,x:node.x,y:node.y}));
}
