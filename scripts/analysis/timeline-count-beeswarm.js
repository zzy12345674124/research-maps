// 固定时间坐标的逐行蜂群避让；离线版无需实验插件。
(function(root){
 function layout(points,{stackRows=false,top=48,rowGap=16,minRowHeight=48,spreadX=0,xMin=365,xMax=1030}={}){
  const groups=new Map(),centers=new Map();let bottom=top;
  for(const point of points){if(!groups.has(point.key))groups.set(point.key,[]);groups.get(point.key).push(point);}
  for(const [key,items] of groups){
   const baseline=items[0]?.y||0;
   const placed=[];
   for(const point of items.sort((a,b)=>a.x-b.x||b.r-a.r)){
    const center=point.y;
    if(spreadX>0){
      point.timeX=point.x;
      const left=Math.max(point.timeX-spreadX,xMin+point.r),right=Math.min(point.timeX+spreadX,xMax-point.r);
      const xs=[Math.max(left,Math.min(right,point.timeX))];
      // 月份附近的横向候选；优先减少纵向堆叠，不跨越相邻月份中点。
      for(let i=0;i<=12;i++)xs.push(left+(right-left)*i/12);
      const candidates=[];
      const neighbors=placed.filter(other=>Math.abs(other.x-point.timeX)<=spreadX+point.r+other.r+1);
      for(const x of xs){const ys=[center];
        for(const other of neighbors){const gap=point.r+other.r+1,dx=x-other.x;if(Math.abs(dx)<gap){const dy=Math.sqrt(gap*gap-dx*dx);ys.push(other.y+dy,other.y-dy);}}
        ys.sort((a,b)=>Math.abs(a-center)-Math.abs(b-center));
        const y=ys.find(y=>neighbors.every(other=>(x-other.x)**2+(y-other.y)**2>=(point.r+other.r+.99)**2));
        if(y!==undefined)candidates.push({x,y,score:(y-center)**2+.2*(x-point.timeX)**2});
      }
      candidates.sort((a,b)=>a.score-b.score||a.x-b.x);const best=candidates[0];
      if(best){point.x=best.x;point.y=best.y;}
    }else{
      const candidates=[center];
      for(const other of placed){const gap=point.r+other.r+1,dx=point.x-other.x;if(Math.abs(dx)<gap){const dy=Math.sqrt(gap*gap-dx*dx);candidates.push(other.y+dy,other.y-dy);}}
      candidates.sort((a,b)=>Math.abs(a-center)-Math.abs(b-center));
      point.y=candidates.find(y=>placed.every(other=>Math.hypot(point.x-other.x,y-other.y)>=point.r+other.r+.99))??center;
    }
    placed.push(point);
   }
   if(stackRows&&items.length){
    const lo=Math.min(...items.map(p=>p.y-p.r)),hi=Math.max(...items.map(p=>p.y+p.r));
    const rowHeight=Math.max(minRowHeight,hi-lo),offset=bottom+(rowHeight-(hi-lo))/2-lo;
    for(const point of items)point.y+=offset;
    centers.set(key,baseline+offset);bottom+=rowHeight+rowGap;
   }else centers.set(key,baseline);
  }
  return {points,centers,spreadX,xMin,xMax,bottom:stackRows?Math.max(top,bottom-rowGap):bottom};
 }
 function mount(dots,onUpdate){
  const points=[];
  dots.each(function(d){points.push({el:this,d,key:d.row??d.name,x:Number(this.getAttribute('cx')),y:Number(this.getAttribute('cy')),r:Number(this.getAttribute('r'))});});
  layout(points);
  for(const p of points){p.el.setAttribute('cy',p.y);p.d.x=p.x;p.d.y=p.y;}
  onUpdate();
 }
 let active=null;
 function stop(){active?.stop();active=null;}
 function animate(packed,onUpdate){
  stop();
  const bands=new Map();
  for(const p of packed.points){const b=bands.get(p.key)||{top:Infinity,bottom:-Infinity};b.top=Math.min(b.top,p.y-p.r);b.bottom=Math.max(b.bottom,p.y+p.r);bands.set(p.key,b);}
  const nodes=packed.points.map(p=>({point:p,key:p.key,r:p.r,x:p.timeX??p.x,targetX:p.timeX??p.x,y:packed.centers.get(p.key),targetY:p.y}));
  const paint=()=>{for(const n of nodes){const b=bands.get(n.key);n.y=Math.max(b.top+n.r,Math.min(b.bottom-n.r,n.y));if(packed.spreadX){const spread=packed.spreadX;n.x=Math.max(Math.max(n.targetX-spread,packed.xMin+n.r),Math.min(Math.min(n.targetX+spread,packed.xMax-n.r),n.x));}else n.x=Math.max(n.targetX-8,Math.min(n.targetX+8,n.x));n.point.d.x=n.x;n.point.d.y=n.y;}onUpdate();};
  const finish=()=>{for(const n of nodes){n.point.d.x=n.point.x;n.point.d.y=n.targetY;}onUpdate();active=null;};
  if(!nodes.length||root.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return;}
  // 每一行独立碰撞；X力将圆拉向时间位置，而非锁死fx或只做静态错位。
  const rowNodes=new Map();for(const n of nodes){if(!rowNodes.has(n.key))rowNodes.set(n.key,[]);rowNodes.get(n.key).push(n);}
  const collisions=[...rowNodes.values()].map(row=>{const force=root.d3.forceCollide(n=>n.r+.5).iterations(3);force.initialize(row,root.d3.randomLcg(.42));return force;});
  active=root.d3.forceSimulation(nodes).stop().alphaDecay(.045).velocityDecay(.3)
   .force('time',root.d3.forceX(n=>n.targetX).strength(packed.spreadX ? .2 : .8))
   .force('row',root.d3.forceY(n=>n.targetY).strength(.14))
   .force('collision',alpha=>{for(const force of collisions)force(alpha);})
   .on('tick',paint).on('end',finish);
  paint();active.restart();
 }
 root.TimelineCountBeeswarm={layout,mount,animate,stop};
 root.addEventListener('pagehide',stop);
 if(!root.TimelineExperimentalBeeswarm)root.TimelineExperimentalBeeswarm=root.TimelineCountBeeswarm;
})(globalThis);
