// Journal copies on two panels share one semantic projection; citations remain directed.
(function(root){
 function build(map){
  if(map?.projection?.method!=='UMAP'||!Array.isArray(map.journals))throw Error('期刊语义坐标无效');
  const journals=new Map(map.journals.map(j=>[j.id,j]));
  if(journals.size!==map.journals.length||map.journals.some(j=>![j.x,j.y].every(Number.isFinite)))throw Error('期刊语义坐标重复或缺失');
  const nodes=[],byKey=new Map();
  for(const side of ['left','right'])for(const id of map[side]){const j=journals.get(id);if(!j)throw Error('缺少期刊语义坐标：'+id);const key=side+':'+id;if(byKey.has(key))throw Error('重复的期刊节点');const n={...j,key,side,count:0};nodes.push(n);byKey.set(key,n);}
  const edges=map.edges.map(e=>{const source=byKey.get('left:'+e.source),target=byKey.get('right:'+e.target);if(!source||!target||!Number.isFinite(e.value)||e.value<1||e.evidence.length!==e.value)throw Error('期刊引用证据不完整');source.count+=e.value;target.count+=e.value;return {...e,source,target};});
  return {nodes,edges,journals};
 }
 root.JournalSemanticGraph={build};
})(globalThis);
