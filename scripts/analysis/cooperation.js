// 功能：按OpenAlex实体ID统计作者或机构共同署名，避免同名不同人被合并。
// 口径：全计数；同一论文内每实体、每实体对只计一次；缺失ID不按姓名猜测。
function buildCooperationNetwork(papers, mode) {
  const nodes=new Map(), edges=new Map(), seenPapers=new Set();
  let includedPapers=0;
  papers.forEach(paper=>{
    if(!paper.id || seenPapers.has(paper.id))return;
    seenPapers.add(paper.id);
    const entities=new Map();
    (paper.authors||[]).forEach(mention=>{
      const items=mode==='institution' ? (mention.institutions||[]) : [mention.author];
      items.forEach(item=>{
        if(item && item.id)entities.set(item.id,item.display_name||item.id);
      });
    });
    if(entities.size)includedPapers++;
    entities.forEach((label,id)=>{
      if(!nodes.has(id))nodes.set(id,{name:id,label,count:0,yearCount:0,yearSum:0,paperIds:[]});
      const node=nodes.get(id);node.count++;node.paperIds.push(paper.id);
      if(Number.isInteger(paper.year)){node.yearCount++;node.yearSum+=paper.year;}
    });
    const ids=[...entities.keys()].sort();
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
      const key=JSON.stringify([ids[i],ids[j]]);
      if(!edges.has(key))edges.set(key,{source:ids[i],target:ids[j],weight:0,paperIds:[]});
      const edge=edges.get(key);edge.weight++;edge.paperIds.push(paper.id);
    }
  });
  return {nodes:[...nodes.values()].map(node=>({...node,meanYear:node.yearCount?node.yearSum/node.yearCount:null})),
    links:[...edges.values()],includedPapers};
}
