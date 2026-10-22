/* 功能：浏览器LDA，使用词频与折叠Gibbs采样；固定种子42，不使用TF-IDF替代词计数。 */
(function(root){
'use strict';
async function fit(documents,options={},progress=()=>{}){
 const {topics:k=5,iterations=120,minDf=2,topWords=8}=options;
 if(![k,iterations,minDf,topWords].every(Number.isInteger)||k<2||k>12||iterations<10||iterations>300||minDf<1||topWords<1||topWords>30)throw Error('模型参数超出允许范围');
 const tokenized=documents.map(d=>TopicModel.tokens(d.text)),df=new Map();
 tokenized.forEach(ts=>new Set(ts).forEach(t=>df.set(t,(df.get(t)||0)+1)));
 const vocabulary=[...df.keys()].filter(t=>df.get(t)>=minDf).sort((a,b)=>df.get(b)-df.get(a)||a.localeCompare(b)).slice(0,1200);
 const indices=new Map(vocabulary.map((w,i)=>[w,i]));
 const active=tokenized.map((ts,i)=>({doc:documents[i],words:ts.filter(t=>indices.has(t)).map(t=>indices.get(t))})).filter(d=>d.words.length);
 const n=active.length,m=vocabulary.length;
 if(Math.min(n,m)<k)throw Error('有效论文或词语少于主题数，请减少主题数或降低词频门槛');
 let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const alpha=0.1,beta=0.01,nd=Array.from({length:n},()=>new Int32Array(k)),nw=Array.from({length:k},()=>new Int32Array(m)),totals=new Int32Array(k);
 const assignments=active.map((d,i)=>d.words.map(w=>{const t=Math.floor(random()*k);nd[i][t]++;nw[t][w]++;totals[t]++;return t;}));
 // 功能：逐词撤回旧主题，再按论文主题计数与主题词计数的条件分布重新采样。
 for(let step=0;step<iterations;step++){
  active.forEach((doc,i)=>doc.words.forEach((w,j)=>{
   const old=assignments[i][j];nd[i][old]--;nw[old][w]--;totals[old]--;
   const probabilities=Array.from({length:k},(_,t)=>(nd[i][t]+alpha)*(nw[t][w]+beta)/(totals[t]+m*beta));
   let draw=random()*probabilities.reduce((a,b)=>a+b,0),chosen=k-1;
   for(let t=0;t<k;t++){draw-=probabilities[t];if(draw<=0){chosen=t;break;}}
   assignments[i][j]=chosen;nd[i][chosen]++;nw[chosen][w]++;totals[chosen]++;
  }));
  if(step%5===0||step===iterations-1){progress(step+1,iterations);await new Promise(resolve=>setTimeout(resolve,0));}
 }
 // 功能：带先验平滑的最终采样状态估计，不把主题概率解释为分类准确率。
 return {model:'LDA',topics:nw.map((row,id)=>({id,words:vocabulary.map((word,j)=>({word,weight:(row[j]+beta)/(totals[id]+m*beta)})).sort((a,b)=>b.weight-a.weight||a.word.localeCompare(b.word)).slice(0,topWords)})),
 documents:active.map((doc,i)=>{const weights=Array.from(nd[i],v=>(v+alpha)/(doc.words.length+k*alpha));return {id:doc.doc.id,weights,primary:weights.indexOf(Math.max(...weights))};}),
 used:n,excluded:documents.length-n,vocabularySize:m,iterations,seed:42,alpha,beta};
}
root.LDAModel={fit};
})(globalThis);
