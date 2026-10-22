// 功能：统计参考文献在多少篇样本论文中被引用；论文和文献ID均去重。
// 未补查到标题的参考文献仍参与关系计算，以ID显示，避免因元数据缺失删除引用。
function buildCoCitationNetwork(papers, metadata) {
  const refs=new Map(),seen=new Set();let includedPapers=0;
  papers.forEach(paper=>{
    if(!paper.id||seen.has(paper.id))return;seen.add(paper.id);
    const ids=[...new Set(paper.referenced_works||[])];
    if(ids.length)includedPapers++;
    ids.forEach(id=>{
      if(!refs.has(id)){
        const info=metadata[id]||{};
        refs.set(id,{name:id,label:info.title||id,count:0,paperIds:[],
          meanYear:Number.isInteger(info.year)?info.year:null,yearCount:Number.isInteger(info.year)?1:0});
      }
      const ref=refs.get(id);ref.count++;ref.paperIds.push(paper.id);
    });
  });
  return {nodes:[...refs.values()],includedPapers};
}

// 功能：先按样本内被引次数选节点，再以共同引用它们的样本论文数建立边。
// 上限仅控制展示；按频次降序、ID升序稳定选择，不改变原始节点和样本。
function selectCoCitationNetwork(network,minimumCount,minimumWeight,maximumNodes,showIsolates=false) {
  const eligible=network.nodes.filter(node=>node.count>=minimumCount)
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const nodes=eligible.slice(0,maximumNodes).map(node=>({...node}));
  const links=[];
  for(let i=0;i<nodes.length;i++){
    const citing=new Set(nodes[i].paperIds);
    for(let j=i+1;j<nodes.length;j++){
      const shared=nodes[j].paperIds.filter(id=>citing.has(id));
      if(shared.length>=minimumWeight)links.push({source:nodes[i].name,target:nodes[j].name,weight:shared.length,paperIds:shared});
    }
  }
  // 功能：在节点门槛、数量上限和边门槛应用后识别孤立点；默认隐藏，可显式保留，不补选候选节点。
  const connected=new Set(links.flatMap(link=>[link.source,link.target]));
  const isolatedCount=nodes.filter(node=>!connected.has(node.name)).length;
  return {nodes:showIsolates?nodes:nodes.filter(node=>connected.has(node.name)),links,
    eligibleCount:eligible.length,candidateCount:nodes.length,isolatedCount,hiddenIsolates:showIsolates?0:isolatedCount};
}
