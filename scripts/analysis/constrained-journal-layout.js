// 功能：把点硬限制在所属椭圆内；为圆半径留边，不能跨学科或跨左右侧。
function clampJournalPoint(node,center,rx,ry){
  const ax=Math.max(0.1,rx-node.radius-1),ay=Math.max(0.1,ry-node.radius-1);
  const dx=node.x-center.x,dy=node.y-center.y;
  const q=Math.hypot(dx/ax,dy/ay);
  if(q>1){node.x=center.x+dx/q;node.y=center.y+dy/q;}
  return node;
}
// 功能：在固定学科椭圆内用排斥、碰撞和X/Y位置力排列真实期刊点。
// 无期刊相似度数据，不添加虚构链接力；位置只改善显示，不表达科学距离。
function layoutJournalsConstrained(ids,center,rx,ry,repulsion){
  if(!ids.length)return [];
  // 功能：期刊多时缩小点半径，缓解有限区域内的碰撞挤压；硬边界始终优先。
  const radius=Math.min(2.1,Math.sqrt(Math.PI*(rx-3)*(ry-3)*0.4/(ids.length*Math.PI)));
  const nodes=ids.map((id,i)=>({id,radius,
    x:center.x+Math.sqrt((i+0.5)/ids.length)*(rx-4)*Math.cos(i*2.399963),
    y:center.y+Math.sqrt((i+0.5)/ids.length)*(ry-4)*Math.sin(i*2.399963)}));
  const simulation=d3.forceSimulation(nodes).stop()
    .force('repulsion',d3.forceManyBody().strength(-repulsion))
    .force('x',d3.forceX(center.x).strength(0.035))
    .force('y',d3.forceY(center.y).strength(0.035))
    .force('collision',d3.forceCollide().radius(d=>d.radius+0.3).iterations(2))
    // 功能：在每轮积分前约束预测位置，避免强排斥把节点推出所属学科。
    .force('boundary',()=>{
      nodes.forEach(node=>{
        const predicted={x:node.x+node.vx,y:node.y+node.vy,radius:node.radius};
        clampJournalPoint(predicted,center,rx,ry);
        node.vx=predicted.x-node.x;node.vy=predicted.y-node.y;
      });
    });
  for(let i=0;i<200;i++){
    simulation.tick();nodes.forEach(node=>clampJournalPoint(node,center,rx,ry));
  }
  return nodes;
}
