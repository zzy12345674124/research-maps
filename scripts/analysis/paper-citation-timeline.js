// 功能：把关键词/群组行转换为单篇论文节点，使用参考文献ID建立真实有向引用。
// 功能：各行独立画组内引用；跨行重复是显示副本，唯一引用数单独统计。无共同行时仅画一次跨行引用。
function buildPaperCitationTimeline(papers, rowDefinitions) {
  const byId=new Map(papers.map(p=>[p.id,p])), copies=new Map(),nodes=[];
  const rows=rowDefinitions.map((row,index)=>{
    const unique=new Map();[...row.years.values()].flat().forEach(p=>{if(byId.has(p.id))unique.set(p.id,byId.get(p.id));});
    const members=[...unique.values()].sort((a,b)=>a.periodIndex-b.periodIndex||a.id.localeCompare(b.id));
    members.forEach(paper=>{
      const node={key:JSON.stringify([index,paper.id]),row:index,paper};nodes.push(node);
      if(!copies.has(paper.id))copies.set(paper.id,[]);copies.get(paper.id).push(node);
    });
    return {name:row.name,members:row.members||[],papers:members};
  });
  const edges=[],uniqueEdges=[];let omitted=0;
  copies.forEach((sourceCopies,sourceId)=>{
    const paper=byId.get(sourceId);
    new Set(paper.referenced_works||[]).forEach(targetId=>{
      if(targetId===sourceId)return;
      const targets=copies.get(targetId);
      if(!targets){omitted++;return;}
      // 功能：同一引用在所有共有行显示，避免大组独占弧线；唯一关系另存一份。
      const rowPairs=sourceCopies.flatMap(source=>{
        const target=targets.find(d=>d.row===source.row);
        return target?[{source,target}]:[];
      });
      if(!rowPairs.length)rowPairs.push({source:sourceCopies[0],target:targets[0]});
      rowPairs.forEach(({source,target})=>edges.push({source,target,sourceId,targetId}));
      uniqueEdges.push({source:rowPairs[0].source,target:rowPairs[0].target,sourceId,targetId});
    });
  });
  return {rows,nodes,edges,uniqueEdges,uniquePapers:copies.size,omitted,
    withReferences:[...copies.keys()].filter(id=>(byId.get(id).referenced_works||[]).length).length};
}
