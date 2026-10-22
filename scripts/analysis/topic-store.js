/* 功能：全图统一暂停模块度；保留源算法，主题结果按语料指纹在当前浏览器标签内共享。 */
globalThis.AnalysisFeatures=Object.freeze({modularity:false});
globalThis.TopicStore=(function(){
  let memory=null;
  const key='research-maps-topics-v2';
  function signature(corpus){let hash=2166136261;for(const d of corpus)for(const c of d.id+'|'+d.text){hash=Math.imul(hash^c.charCodeAt(0),16777619);}return (hash>>>0).toString(16);}
  function save(result,corpus){memory={signature:signature(corpus),result};try{sessionStorage.setItem(key,JSON.stringify(memory));}catch{} }
  function read(corpus){try{if(!memory)memory=JSON.parse(sessionStorage.getItem(key));}catch{}return memory&&memory.signature===signature(corpus)?memory.result:null;}
  // 功能：每篇论文按模型最大权重进入唯一主主题行；关键词映射按全样本主题强度汇总。
  function rows(papers,minimum,result,fullPapers){
    if(!result)return [];
    const byId=new Map(result.documents.map(d=>[d.id,d]));
    const scores=new Map(),frequency=new Map();
    papers.forEach(p=>new Set(p.keywords||[]).forEach(w=>frequency.set(w,(frequency.get(w)||0)+1)));
    fullPapers.forEach(p=>{const doc=byId.get(p.id);if(!doc||doc.primary===null)return;new Set(p.keywords||[]).forEach(w=>{if(!scores.has(w))scores.set(w,Array(result.topics.length).fill(0));doc.weights.forEach((v,i)=>scores.get(w)[i]+=v);});});
    return result.topics.map(t=>{
      const selected=papers.filter(p=>byId.get(p.id)?.primary===t.id&&Number.isInteger(p.periodIndex));
      const years=new Map();selected.forEach(p=>{if(!years.has(p.periodIndex))years.set(p.periodIndex,[]);years.get(p.periodIndex).push(p);});
      const members=[...scores].filter(([w,v])=>(frequency.get(w)||0)>=minimum&&v.indexOf(Math.max(...v))===t.id).map(([w])=>w);
      return {name:`T${t.id+1}: ${t.words.slice(0,3).map(w=>w.word).join(' / ')}`,members,count:new Set(selected.map(p=>p.id)).size,years};
    }).filter(r=>r.count>=minimum);
  }
  return {save,read,rows};
})();
