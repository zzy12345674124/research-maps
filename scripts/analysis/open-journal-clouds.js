// 功能：生成稳定散布参数，只用于画图，不表达期刊相似度。
function journalCloudHash(text,salt){
 let h=(2166136261^salt)>>>0;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
 return (Math.imul(h^(h>>>16),2246822507)>>>0)/4294967296;
}
// 功能：只保留左右整幅画布边界，不再限制期刊必须位于某个学科椭圆内。
function clampJournalToSide(node,bounds){
 node.x=Math.max(bounds.x0+node.radius,Math.min(bounds.x1-node.radius,node.x));
 node.y=Math.max(bounds.y0+node.radius,Math.min(bounds.y1-node.radius,node.y));
 return node;
}
// 功能：同一侧所有学科期刊一起参与排斥和碰撞，允许不同学科点云靠近、交错。
// 各期刊用弱位置力维持所属学科附近的软锚点，无学科硬围栏，不改变类别或数据。
function layoutJournalClouds(regions,side,height,repulsion,spread){
 const bounds=side==='left'?{x0:25,x1:535,y0:75,y1:height-30}:{x0:665,x1:1175,y0:75,y1:height-30};
 const nodes=regions.flatMap(region=>region.ids.map(id=>{
  const angle=journalCloudHash(id,17)*Math.PI*2;
  const distance=Math.sqrt(journalCloudHash(id,53));
  const tx=region.position.x+Math.cos(angle)*distance*region.rx*spread;
  const ty=region.position.y+Math.sin(angle)*distance*region.ry*spread;
  const node={id,field:region.field,radius:1.9,tx,ty,x:tx,y:ty};
  return clampJournalToSide(node,bounds);
 }));
 if(!nodes.length)return nodes;
 const simulation=d3.forceSimulation(nodes).stop()
  .force('repulsion',d3.forceManyBody().strength(-repulsion))
  .force('x',d3.forceX(d=>d.tx).strength(0.022))
  .force('y',d3.forceY(d=>d.ty).strength(0.022))
  .force('collision',d3.forceCollide().radius(d=>d.radius+0.35).iterations(2))
  // 功能：防止出画布或越过左右中缝；此约束不限制跨学科区域。
  .force('canvas-boundary',()=>nodes.forEach(node=>{
   const predicted={x:node.x+node.vx,y:node.y+node.vy,radius:node.radius};
   clampJournalToSide(predicted,bounds);node.vx=predicted.x-node.x;node.vy=predicted.y-node.y;
  }));
 for(let i=0;i<240;i++){simulation.tick();nodes.forEach(node=>clampJournalToSide(node,bounds));}
 return nodes;
}
