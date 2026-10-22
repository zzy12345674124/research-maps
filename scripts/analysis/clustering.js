// 功能：在加权无向图上做贪心模块度社区划分（Newman 贪心合并）。
// 只使用共现拓扑：谁和谁连、连得密不密。不使用语义、年份或主题信息。
// 这是拓扑社区检测，产出的是“结构上抱团的关键词群组”，不是主题模型的主题。
// 不修改传入的节点名和边；重复节点对累加权重，自环与非法端点跳过。
// 返回 {groups:[{members:[名称...]}], isolated:[名称...]}；度数为0的词单独返回，不并入任何群组。

// 功能：计算把两个群组合并后的模块度增量 ΔQ = W_ij/m − (k_i·k_j)/(2m²)。
// W_ij 是两群组之间的边权和，k 是各自度数，m 是全图边权总和。
function modularityGain(betweenWeight,totalWeight,degreeA,degreeB){
 return betweenWeight/totalWeight - (degreeA*degreeB)/(2*totalWeight*totalWeight);
}

// 功能：按节点名下标准备下标、度数与去重后的边权，供后续合并使用。
function indexCooccurrence(nodeNames,edges){
 const index=new Map();
 nodeNames.forEach((name,i)=>{if(!index.has(name))index.set(name,i);});
 const degree=new Array(nodeNames.length).fill(0);
 const pairWeights=new Map();
 let totalWeight=0;
 (edges||[]).forEach(edge=>{
  if(!edge)return;
  const a=index.get(edge.source),b=index.get(edge.target);
  if(a===undefined||b===undefined||a===b)return;
  const weight=Number(edge.weight);
  if(!(weight>0))return;
  const key=a<b?a+'|'+b:b+'|'+a;
  pairWeights.set(key,(pairWeights.get(key)||0)+weight);
  degree[a]+=weight;degree[b]+=weight;totalWeight+=weight;
 });
 return {degree,pairWeights,totalWeight};
}

// 功能：执行贪心合并。每轮挑选增益最大的两个群组合并，直到没有正的模块度增益。
// 用增量维护的“群组对权重”避免每轮重扫全部成员，复杂度约为 O(n²·平均度) 而非朴素 O(n³)。
function clusterByModularity(nodeNames,edges){
 const names=[...new Set(nodeNames)];
 const {degree,pairWeights,totalWeight}=indexCooccurrence(names,edges);
 // 功能：把名字和全局下标绑定，后续按全局下标取度数，避免反复查找位置。
 const connected=[],connectedGlobalIndex=[];
 names.forEach((name,i)=>{
  if(degree[i]>0){connected.push(name);connectedGlobalIndex.push(i);}
 });
 const isolated=names.filter((name,i)=>degree[i]===0);
 if(!connected.length||!(totalWeight>0))return {groups:[],isolated};
 const size=connected.length;
 // 功能：pairWeights 的键是全局下标，需映射到只含连通节点的局部下标。
 const globalToLocal=new Array(names.length).fill(-1);
 connectedGlobalIndex.forEach((globalIndex,localIndex)=>{globalToLocal[globalIndex]=localIndex;});
 const alive=new Array(size).fill(true);
 const commDegree=new Array(size);
 const members=new Array(size);
 connected.forEach((name,i)=>{commDegree[i]=degree[connectedGlobalIndex[i]];members[i]=[name];});
 // 功能：between[i] 保存群组 i 与其它存活群组之间的边权；两个方向同步维护。
 const between=Array.from({length:size},()=>new Map());
 pairWeights.forEach((weight,key)=>{
  const [a,b]=key.split('|').map(Number);
  const la=globalToLocal[a],lb=globalToLocal[b];
  if(la<0||lb<0)return;
  between[la].set(lb,weight);between[lb].set(la,weight);
 });
 // 功能：反复合并增益最大且为正的一对；gain 阈值为 1e-10，避免浮点噪声导致无效合并。
 for(;;){
  let bestGain=1e-10,bestA=-1,bestB=-1;
  for(let i=0;i<size;i++){
   if(!alive[i])continue;
   const row=between[i];
   for(const [j,weight] of row){
    if(j<=i||!alive[j])continue;
    const gain=modularityGain(weight,totalWeight,commDegree[i],commDegree[j]);
    if(gain>bestGain){bestGain=gain;bestA=i;bestB=j;}
   }
  }
  if(bestA<0)break;
  // 功能：把 bestB 并入 bestA，并更新两群组与其它群组之间的权重。
  const rowA=between[bestA],rowB=between[bestB];
  rowB.forEach((weight,k)=>{
   if(k===bestA)return;
   const merged=(rowA.get(k)||0)+weight;
   rowA.set(k,merged);
   const rowK=between[k];
   rowK.set(bestA,merged);rowK.delete(bestB);
  });
  rowA.delete(bestB);rowB.clear();
  commDegree[bestA]+=commDegree[bestB];
  members[bestA]=members[bestA].concat(members[bestB]);
  members[bestB]=null;alive[bestB]=false;
 }
 const groups=[];
 for(let i=0;i<size;i++)if(alive[i]&&members[i])groups.push({members:members[i]});
 return {groups,isolated};
}
