/* SPDX-License-Identifier: GPL-3.0-only
 * Adapted from Patrick Sier, Force Layout Cells (2021), collide(alpha).
 * Upstream collision: Mike Bostock https://gist.github.com/mbostock/7882658 (GPL-3.0).
 * Original source, licensing provenance and full GPL: library/force-layout-cells/.
 * Adaptation 2026-10-22: accessors, fixed nodes, zero distance, coincident leaf chains,
 * finite collision passes and swept pointer movement. No original graph data are changed.
 */
globalThis.NodeCollision=(function(){
 // 原示例的四叉树碰撞：同组padding，异组clusterPadding，位置直接相互推开。
 function collide(nodes,radius,{gap=2,clusterGap=gap,group=()=>0,pinned=null,fixed=()=>false,direction={x:1,y:0},alpha=0.2}={}){
  const views=nodes.map(node=>({node,radius:Math.max(0,Number(radius(node))||0),cluster:group(node),
   get x(){return node.x;},set x(value){node.x=value;},get y(){return node.y;},set y(value){node.y=value;}}));
  const maxRadius=d3.max(views,d=>d.radius)||0;
  const quadtree=d3.quadtree().x(d=>d.x).y(d=>d.y).addAll(views);
  let changes=0;
  for(const d of views){
   const reach=d.radius+maxRadius*8+Math.max(gap,clusterGap);
   const nx1=d.x-reach,nx2=d.x+reach,ny1=d.y-reach,ny2=d.y+reach;
   quadtree.visit((quad,x1,y1,x2,y2)=>{
    if(!quad.length)for(let leaf=quad;leaf;leaf=leaf.next){const data=leaf.data;
     if(!data||data===d)continue;
     let x=d.x-data.x,y=d.y-data.y,length=Math.hypot(x,y);
     const required=d.radius+data.radius+(d.cluster===data.cluster?gap:clusterGap);
     if(length>=required-1e-5)continue;
     const wa=d.node===pinned||d.node.fx!=null||fixed(d.node)?0:1;
     const wb=data.node===pinned||data.node.fx!=null||fixed(data.node)?0:1;if(!wa&&!wb)continue;
     const distance=length;
     if(length<1e-8){x=-(direction.x||1);y=-(direction.y||0);length=Math.hypot(x,y);}
     // 原式 l=(l-r)/l*alpha；被拖节点固定时，将其反作用位移给另一端。
     const l=(distance-required)/length*alpha;
     x*=l;y*=l;
     if(wa){const weight=wb?1:2;d.x-=x*weight;d.y-=y*weight;d.node.vx=0;d.node.vy=0;}
     if(wb){const weight=wa?1:2;data.x+=x*weight;data.y+=y*weight;data.node.vx=0;data.node.vy=0;}
     changes++;
    }
    return x1>nx2||x2<nx1||y1>ny2||y2<ny1;
   });
  }
  return changes;
 }
 function resolve(nodes,pinned,radius,options={}){
  const passes=options.passes??8;
  for(let i=0;i<passes;i++)if(!collide(nodes,radius,{alpha:0.5,...options,pinned}))break;
 }
 function move(nodes,node,x,y,radius,options={}){
  if(![x,y].every(Number.isFinite))return;
  const dx=x-node.x,dy=y-node.y,steps=Math.max(1,Math.min(256,Math.ceil(Math.hypot(dx,dy)/Math.max(2,Number(radius(node))||2))));
  const startX=node.x,startY=node.y,affected=new Set([node]);
  for(let i=1;i<=steps;i++){
   node.x=startX+dx*i/steps;node.y=startY+dy*i/steps;
   if(options.localOnly){
    for(let round=0;round<8;round++){
     let added=false;
     const tree=d3.quadtree(nodes,n=>n.x,n=>n.y),maxR=d3.max(nodes,radius)||0,gap=options.gap??2;
     for(const a of affected){const reach=radius(a)+maxR+gap;
      tree.visit((q,x0,y0,x1,y1)=>{
       if(x0>a.x+reach||x1<a.x-reach||y0>a.y+reach||y1<a.y-reach)return true;
       if(!q.length)for(let leaf=q;leaf;leaf=leaf.next){const b=leaf.data;
        if(!affected.has(b)&&Math.hypot(a.x-b.x,a.y-b.y)<=radius(a)+radius(b)+gap+1e-5){affected.add(b);added=true;}
       }
       return false;
      });
     }
     if(round>0&&!added)break;
     resolve([...affected],node,radius,{...options,direction:{x:dx,y:dy}});
    }
   }else resolve(nodes,node,radius,{...options,direction:{x:dx,y:dy}});
  }
  if(node.fx!=null)node.fx=node.x;if(node.fy!=null)node.fy=node.y;
 }
 function force(radius,options={}){
  let nodes=[];const f=()=>collide(nodes,radius,options);f.initialize=input=>{nodes=input||[];};return f;
 }
 return {move,resolve,collide,force};
})();
