// 学科聚团散点：专用轻量碰撞与有界会话缓存；不改写期刊归类或引用路径。
const dualScatterCache=(function(){
 const key='research-maps-dual-scatter-v2',limit=4,entries=new Map();
 try{for(const [signature,nodes] of JSON.parse(sessionStorage.getItem(key)||'[]')){
  if(typeof signature==='string'&&Array.isArray(nodes)&&nodes.every(n=>typeof n.id==='string'&&[n.x,n.y,n.radius].every(Number.isFinite)))entries.set(signature,nodes);
 }}catch{}
 return {get(signature){const nodes=entries.get(signature);return nodes?.map(n=>({...n}));},set(signature,nodes){
  entries.delete(signature);entries.set(signature,nodes.map(n=>({...n})));
  while(entries.size>limit)entries.delete(entries.keys().next().value);
  try{sessionStorage.setItem(key,JSON.stringify([...entries]));}catch{}
 }};
})();

// 初始散点没有固定点且所有半径均为3：直接在节点上建树，省去通用包装对象和访问器。
// 保留质心吸引、同组/跨组间距、位置推开、清零速度及每轮两次碰撞处理。
function forceDualScatterClusters(nodes,outerGap){
 const groups=[...d3.group(nodes,n=>n.groupId).values()],innerGap=2,reach=6+Math.max(innerGap,outerGap);
 return function(alpha){
  for(const members of groups){let x=0,y=0;for(const n of members){x+=n.x;y+=n.y;}x/=members.length;y/=members.length;
   for(const n of members){n.vx+=(x-n.x)*.13*alpha;n.vy+=(y-n.y)*.13*alpha;}}
  for(let pass=0;pass<2;pass++){
   const tree=d3.quadtree(nodes,n=>n.x,n=>n.y);let changes=0;
   for(const n of nodes){
    const x0=n.x-reach,x1=n.x+reach,y0=n.y-reach,y1=n.y+reach;
    tree.visit((quad,left,top,right,bottom)=>{
     if(!quad.length)for(let leaf=quad;leaf;leaf=leaf.next){const other=leaf.data;if(other===n)continue;
      let dx=n.x-other.x,dy=n.y-other.y;
      const required=6+(n.groupId===other.groupId?innerGap:outerGap);
      const squared=dx*dx+dy*dy;if(squared>=(required-1e-5)*(required-1e-5))continue;
      let distance=Math.sqrt(squared);
      const actual=distance;if(distance<1e-8){dx=-1;dy=0;distance=1;}
      const factor=(actual-required)/distance*.2;dx*=factor;dy*=factor;
      n.x-=dx;n.y-=dy;other.x+=dx;other.y+=dy;n.vx=n.vy=other.vx=other.vy=0;changes++;
     }
     return left>x1||right<x0||top>y1||bottom<y0;
    });
   }
   if(!changes)break;
  }
 };
}
function layoutDualScatter(items,side,height,spacing=0.7){
 const signature=JSON.stringify([2,side,height,spacing,items.map(item=>[item.id,item.journalIds||[]])]);
 const cached=dualScatterCache.get(signature);if(cached)return cached;
 const nodes=items.flatMap(item=>(item.journalIds||[]).map(id=>({id,field:item.id,groupId:item.id,radius:3})));
 if(!nodes.length)return nodes;
 seedPositionsByCommunity(nodes,{radius:180,spread:24,offsetX:0,offsetY:0});
 const sim=d3.forceSimulation(nodes).stop()
  .force('cluster',forceDualScatterClusters(nodes,12+spacing*8))
  .force('center',d3.forceCenter(0,0));
 sim.tick(350);sim.stop();
 const x0=d3.min(nodes,n=>n.x-n.radius),x1=d3.max(nodes,n=>n.x+n.radius);
 const y0=d3.min(nodes,n=>n.y-n.radius),y1=d3.max(nodes,n=>n.y+n.radius);
 const scale=Math.min(1,460/Math.max(1,x1-x0),(height-150)/Math.max(1,y1-y0));
 const cx=side==='left'?300:900,cy=height/2+15;
 const result=nodes.map(n=>({id:n.id,field:n.field,radius:n.radius*scale,x:cx+(n.x-(x0+x1)/2)*scale,y:cy+(n.y-(y0+y1)/2)*scale}));
 dualScatterCache.set(signature,result);return result;
}
