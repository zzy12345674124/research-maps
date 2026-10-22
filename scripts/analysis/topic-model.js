/* 功能：浏览器内的NMF主题模型；英文分词、TF-IDF及乘法更新，不依赖外部服务。
 * 最小化 ||X-WH||²，W为论文主题强度，H为主题词强度；固定随机种子可复现。
 * W行归一化仅用于展示相对权重，不是概率推断或论文质量评分。 */
(function (root) {
  'use strict';
  const stop = new Set(('a an the and or but if of to in on at by for from with as is are was were be been being this that these those it its we our you your they their he she not can could may might will would should have has had do does did also into than then such both each other more most some all any no using used use based study studies research paper article results result findings approach method methods analysis investigate proposed present presents show shows education educational learning artificial intelligence').split(' '));

  // 功能：提取英文词并滤去通用研究措辞；不声称执行词形还原，支持连字符拆词。
  function tokens(text) {
    return (String(text || '').toLowerCase().match(/[a-z]{3,}/g) || []).filter(t => !stop.has(t));
  }

  // 功能：把文档转换为L2归一化TF-IDF，按文档频次筛选并限制词表以控制浏览器开销。
  function vectorize(documents, minimum) {
    const counts = documents.map(d => {
      const map = new Map(); tokens(d.text).forEach(t => map.set(t, (map.get(t) || 0) + 1)); return map;
    });
    const df = new Map(); counts.forEach(map => map.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const vocabulary = [...df.keys()].filter(t => df.get(t) >= minimum)
      .sort((a, b) => df.get(b) - df.get(a) || a.localeCompare(b)).slice(0, 1200);
    const rows = counts.map(map => {
      const row = Float64Array.from(vocabulary, t => map.has(t) ? (1 + Math.log(map.get(t))) * (1 + Math.log((1 + documents.length) / (1 + df.get(t)))) : 0);
      const norm = Math.hypot(...row) || 1; return row.map(v => v / norm);
    });
    return {vocabulary, rows};
  }

  // 功能：异步训练；每五轮把控制权交还浏览器，允许状态文字更新和页面交互。
  async function fit(documents, options = {}, progress = () => {}) {
    const {topics: k = 5, iterations = 120, minDf = 2, topWords = 8} = options;
    if (![k, iterations, minDf, topWords].every(Number.isInteger) || k < 2 || k > 12 || iterations < 10 || iterations > 300 || minDf < 1 || topWords < 1 || topWords > 30) throw new Error('模型参数超出允许范围。');
    const input = documents.filter(d => String(d.text || '').trim());
    const {vocabulary, rows: initial} = vectorize(input, minDf);
    const active = initial.map((row, i) => ({row, doc: input[i]})).filter(x => x.row.some(v => v > 0));
    const n = active.length, m = vocabulary.length;
    if (Math.min(n, m) < k) throw new Error('有效论文或词语少于主题数，请减少主题数或降低词频门槛。');
    const X = active.map(x => x.row);
    let seed = 42;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return 0.1 + seed / 4294967296; };
    const W = Array.from({length:n}, () => Float64Array.from({length:k}, random));
    const H = Array.from({length:k}, () => Float64Array.from({length:m}, random));
    const eps = 1e-12;
    for (let step = 0; step < iterations; step++) {
      // 功能：H <- H*(WᵀX)/(WᵀWH)，随后W <- W*(XHᵀ)/(WHHᵀ)。
      const gramW = Array.from({length:k}, () => new Float64Array(k));
      for (let a=0;a<k;a++) for(let b=0;b<k;b++) for(let i=0;i<n;i++) gramW[a][b]+=W[i][a]*W[i][b];
      // 功能：此轮H更新必须同时读取旧H，先暂存结果，避免污染分母。
      const nextH = H.map(row => row.slice());
      for(let a=0;a<k;a++) for(let j=0;j<m;j++) {
        let num=0,den=eps; for(let i=0;i<n;i++) num+=W[i][a]*X[i][j];
        for(let b=0;b<k;b++) den+=gramW[a][b]*H[b][j]; nextH[a][j]=H[a][j]*num/den;
      }
      nextH.forEach((row,a)=>H[a].set(row));
      const gramH = Array.from({length:k}, () => new Float64Array(k));
      for(let a=0;a<k;a++) for(let b=0;b<k;b++) for(let j=0;j<m;j++) gramH[a][b]+=H[a][j]*H[b][j];
      for(let i=0;i<n;i++) {
        const next = W[i].slice();
        for(let a=0;a<k;a++) {
          let num=0,den=eps; for(let j=0;j<m;j++) num+=X[i][j]*H[a][j];
          for(let b=0;b<k;b++) den+=W[i][b]*gramH[b][a]; next[a]=W[i][a]*num/den;
        } W[i].set(next);
      }
      // 功能：固定主题词向量长度，消除NMF缩放不唯一性，使论文主题强度可比较。
      for(let a=0;a<k;a++) {
        const norm=Math.hypot(...H[a]) || 1;
        for(let j=0;j<m;j++) H[a][j]/=norm;
        for(let i=0;i<n;i++) W[i][a]*=norm;
      }
      if(step%5===0) { progress(step+1,iterations); await new Promise(resolve=>setTimeout(resolve,0)); }
    }
    // 功能：导出代表词、论文混合权重和重构误差；不改写输入文档。
    let error=0;
    for(let i=0;i<n;i++) for(let j=0;j<m;j++) {let value=0;for(let a=0;a<k;a++)value+=W[i][a]*H[a][j];error+=(X[i][j]-value)**2;}
    const documentsOut=active.map((x,i)=>{
      const sum=W[i].reduce((a,b)=>a+b,0);
      const weights=Array.from(W[i],v=>sum>eps?v/sum:0);
      const primary=sum>eps?weights.indexOf(Math.max(...weights)):null;
      return {id:x.doc.id,weights,primary};
    });
    return {topics:H.map((row,id)=>({id,words:vocabulary.map((word,j)=>({word,weight:row[j]})).sort((a,b)=>b.weight-a.weight||a.word.localeCompare(b.word)).slice(0,topWords)})),
      documents:documentsOut, vocabularySize:m, used:n, excluded:documents.length-n, iterations, seed:42, error:Math.sqrt(error)};
  }
  root.TopicModel = {fit, tokens};
})(globalThis);
