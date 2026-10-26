// 根据节点圆周外扩采样生成凸包；单点、双点同样可形成封闭区域。
// 仅显示组别范围，不代表统计置信区间或语义边界。
function flexibleHullPoints(nodes,padding=10){
 const points=[];
 for(const n of nodes){if(!Number.isFinite(n.x)||!Number.isFinite(n.y))continue;
  const radius=Math.max(0,Number(n.radius)||0)+Math.max(0,padding);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;points.push([n.x+Math.cos(a)*radius,n.y+Math.sin(a)*radius]);}
 }
 return points.length?d3.polygonHull(points):null;
}
function flexibleHullPath(nodes,padding=10){
 const hull=flexibleHullPoints(nodes,padding);
 return hull?d3.line().curve(d3.curveBasisClosed)(hull)+'Z':null;
}
