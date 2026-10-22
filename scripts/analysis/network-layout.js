// 功能：网络布局工具。包含关联强度归一化与“群落引力”力函数，用于把共现网络排成分散的主题团。
// 只改变节点坐标与受力，不改动共现次数、节点频次、群组划分或任何原始数据。
// 位置不表示年份、质量或因果；团块分开只是布局结果，不代表主题之间的相似度。

// 功能：取端点名称。力布局会把连线的 source/target 改写成节点对象，这里统一取回关键词名。
function endpointName(value){
 return (value && typeof value === 'object') ? value.name : value;
}

// 功能：按 VOSviewer 的关联强度归一化共现权重，抵消高频词的“天然高共现”偏置。
// 公式 strength = c_ij / (k_i × k_j)：c_ij 是共现次数，k 是各自的出现频次。
// 例：两个各出现 30 次的词共现 10 次，与两个各出现 2 次的词共现 1 次，后者才是更强的关联。
// 随后把 strength 归一化到均值 1，使力参数的取值保持在常见量级；再压缩到 [0.05, 4] 防止极稀疏对支配布局。
// 原始共现次数保留在 weight 字段，线宽与提示仍按真实次数显示。
function associationStrength(nodeWeights,links){
 const out=[];
 (links||[]).forEach(link=>{
  const source=endpointName(link.source),target=endpointName(link.target);
  const wSource=Number(nodeWeights.get(source))||0,wTarget=Number(nodeWeights.get(target))||0;
  const count=Number(link.weight)||0;
  if(!(count>0)||!(wSource>0)||!(wTarget>0))return;
  out.push({source,target,weight:count,strength:count/(wSource*wTarget)});
 });
 if(!out.length)return out;
 const mean=out.reduce((sum,link)=>sum+link.strength,0)/out.length;
 if(!(mean>0)){out.forEach(link=>{link.strength=1;});return out;}
 out.forEach(link=>{
  const normalized=link.strength/mean;
  // 功能：开平方压缩动态范围。稀疏词对的原始比值可达均值数十倍，直接使用会让少数边支配整个布局。
  link.strength=Math.max(0.05,Math.min(4,Math.sqrt(normalized)));
 });
 return out;
}

// 功能：群落引力力函数。每个节点被本组质心吸引，同时被其他组的质心排斥，使同组聚成团、组间分开。
// 质心每轮由其成员当前位置实时重算，因此拖动节点后整个群落会随之调整，不需要重新跑布局。
// 只在同一张图内比较：分离程度受参数、节点数与连线数影响，不表示主题相似度或距离语义。
function forceCommunities(options){
 const config=Object.assign({attraction:0.35,separation:900,minimumDistance:12},options||{});
 let nodes=[];
 const centroids=new Map();
 function force(alpha){
  if(nodes.length<2)return;
  // 功能：按 groupId 累加求质心；没有分组的节点不参与，保持自由浮动。
  centroids.clear();
  for(const node of nodes){
   const group=node.groupId;
   if(group===undefined||group===null)continue;
   let centroid=centroids.get(group);
   if(!centroid){centroid={x:0,y:0,count:0};centroids.set(group,centroid);}
   centroid.x+=node.x;centroid.y+=node.y;centroid.count++;
  }
  if(centroids.size<1)return;
  for(const centroid of centroids.values()){
   centroid.x/=centroid.count;centroid.y/=centroid.count;
  }
  const list=[...centroids.values()];
  for(const node of nodes){
   const own=centroids.get(node.groupId);
   // 功能：本组质心吸引，把同组成员收拢成团。
   if(own){
    node.vx+=(own.x-node.x)*config.attraction*alpha;
    node.vy+=(own.y-node.y)*config.attraction*alpha;
   }
   // 功能：其他组质心排斥，用反平方衰减把不同群落推开。
   // 节点数少时质心可能重合，此时按组序号取确定方向，避免除零并保证结果可复现。
   for(let i=0;i<list.length;i++){
    const other=list[i];
    if(other===own)continue;
    let dx=node.x-other.x,dy=node.y-other.y;
    let squared=dx*dx+dy*dy;
    if(squared<config.minimumDistance*config.minimumDistance){
     const angle=(node.groupId||0)*1.7+i*2.399963;
     dx=Math.cos(angle);dy=Math.sin(angle);
     squared=config.minimumDistance*config.minimumDistance;
    }
    const distance=Math.sqrt(squared);
    const push=config.separation*alpha/squared;
    node.vx+=dx/distance*push;
    node.vy+=dy/distance*push;
   }
  }
 }
 force.initialize=function(input){nodes=input||[];};
 return force;
}

// 功能：按分组给出初始位置，避免力布局从随机位置出发时把不同群落搅在一起。
// 各组按规模降序排在螺旋上，组内成员围绕本组中心做确定性散布；不使用随机数，刷新结果一致。
function seedPositionsByCommunity(nodes,options){
 const config=Object.assign({radius:430,spread:46,offsetX:450,offsetY:280,spiral:2.399963},options||{});
 const byGroup=new Map();
 nodes.forEach(node=>{
  const group=node.groupId;
  if(group===undefined||group===null)return;
  if(!byGroup.has(group))byGroup.set(group,[]);
  byGroup.get(group).push(node);
 });
 const order=[...byGroup.entries()].sort((a,b)=>b[1].length-a[1].length||a[0]-b[0]);
 order.forEach(([group,members],index)=>{
  const angle=index*config.spiral;
  // 功能：螺旋半径随组序号平方根增长，使各组中心尽量均匀铺开而不是挤在一条线上。
  const distance=config.radius*Math.sqrt(index/Math.max(1,order.length-1||1));
  const centerX=config.offsetX+Math.cos(angle)*distance;
  const centerY=config.offsetY+Math.sin(angle)*distance;
  members.forEach((node,i)=>{
   const memberAngle=i*config.spiral;
   const memberDistance=config.spread*Math.sqrt(i/Math.max(1,members.length-1||1));
   node.x=centerX+Math.cos(memberAngle)*memberDistance;
   node.y=centerY+Math.sin(memberAngle)*memberDistance;
  });
 });
 // 功能：无分组节点（当前门槛下没有连线）排到外圈，不干扰各团内部结构。
 let loose=0;
 nodes.forEach(node=>{
  if(node.groupId!==undefined&&node.groupId!==null)return;
  const angle=loose*config.spiral;
  node.x=config.offsetX+Math.cos(angle)*(config.radius+120);
  node.y=config.offsetY+Math.sin(angle)*(config.radius+120);
  loose++;
 });
 return nodes;
}

// 功能：统计布局结果的分团质量，供验证使用：组间最小质心距、组内平均半径、组间重叠对数。
// 这是一个只读诊断函数，不参与绘图；阈值需人工判断，不能当作“布局正确”的证明。
function summarizeCommunityLayout(nodes){
 const byGroup=new Map();
 nodes.forEach(node=>{
  const group=node.groupId;
  if(group===undefined||group===null)return;
  if(!byGroup.has(group))byGroup.set(group,[]);
  byGroup.get(group).push(node);
 });
 const centroids=[...byGroup.entries()].map(([group,members])=>({
  group,members,
  x:members.reduce((sum,node)=>sum+node.x,0)/members.length,
  y:members.reduce((sum,node)=>sum+node.y,0)/members.length
 }));
 let minimumCenterDistance=Infinity;
 for(let i=0;i<centroids.length;i++)for(let j=i+1;j<centroids.length;j++){
  const distance=Math.hypot(centroids[i].x-centroids[j].x,centroids[i].y-centroids[j].y);
  if(distance<minimumCenterDistance)minimumCenterDistance=distance;
 }
 const groupedMembers=centroids.reduce((sum,centroid)=>sum+centroid.members.length,0);
 const radii=centroids.map(centroid=>{
  const sum=centroid.members.reduce((total,node)=>total+Math.hypot(node.x-centroid.x,node.y-centroid.y),0);
  return {group:centroid.group,radius:sum/centroid.members.length};
 });
 return {
  groupCount:centroids.length,
  minimumCenterDistance:Number.isFinite(minimumCenterDistance)?minimumCenterDistance:0,
  averageRadius:radii.length?radii.reduce((sum,item)=>sum+item.radius,0)/radii.length:0,
  maximumRadius:radii.length?Math.max(...radii.map(item=>item.radius)):0,
  looseCount:nodes.length-groupedMembers
 };
}

// 功能：按群组数量生成确定性的不同颜色，超过10组时不循环复用色号。
// 大量类别仍可能颜色相近，图例的G编号和成员列表用于辅助区分。
function createClusterPalette(count){
 const base=["#4e79a7","#f28e2b","#59a14f","#e15759","#b07aa1","#76b7b2","#edc948","#ff9da7","#9c755f","#bab0ac"];
 const result=base.slice(0,count),used=new Set(result);
 let candidate=0;
 while(result.length<count){
  const color=d3.hcl((35+candidate*137.508)%360,45+(candidate%3)*8,48+(candidate%4)*7).formatHex();
  candidate++;
  if(used.has(color))continue;
  used.add(color);result.push(color);
 }
 return result;
}
