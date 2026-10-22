/* 功能：主题模型参数、训练状态、证据展示及关键词配色映射；训练与网络筛选独立。 */
(function () {
  'use strict';
  let result = null;
  const topicOfKeyword = new Map();
  const colors = () => result ? createClusterPalette(result.topics.length) : [];
  const el = id => document.getElementById(id);

  // 功能：汇总包含关键词的论文主题相对权重，再选最大者；不把主题词当作网络节点。
  function mapKeywords() {
    topicOfKeyword.clear();
    const byId = new Map(result.documents.map(d => [d.id, d]));
    const scores = new Map();
    openAlexPapers.forEach(paper => {
      const doc = byId.get(paper.id); if (!doc || doc.primary === null) return;
      new Set(paper.keywords || []).forEach(word => {
        if (!scores.has(word)) scores.set(word, Array(result.topics.length).fill(0));
        doc.weights.forEach((v, i) => { scores.get(word)[i] += v; });
      });
    });
    scores.forEach((values, word) => topicOfKeyword.set(word, values.indexOf(Math.max(...values))));
  }

  // 功能：安全创建文字节点，列出代表词、主主题论文数、权重最高论文及其完整混合权重。
  function showResults() {
    const box = el('topic-results'); box.replaceChildren();
    const palette = colors();
    const titles = new Map(topicCorpus.map(d => [d.id, d.title]));
    result.topics.forEach(topic => {
      const detail = document.createElement('details');
      const heading = document.createElement('summary');
      const assigned = result.documents.filter(d => d.primary === topic.id).length;
      heading.textContent = `T${topic.id+1} · ${assigned}篇主主题论文：${topic.words.slice(0,3).map(w=>w.word).join(' / ')}`;
      heading.style.color = palette[topic.id]; detail.append(heading);
      const terms = document.createElement('p'); terms.textContent = '代表词：' + topic.words.map(w => w.word).join('、'); detail.append(terms);
      const button = document.createElement('button'); button.type='button'; button.textContent='高亮相关关键词';
      button.addEventListener('click',()=>{
        if (densityActive()) {el('view-mode').value='network';updateView();}
        el('color-mode').value='topic';updateColors();
        const matches = nodes.filter(n=>topicOfKeyword.get(n.name)===topic.id);
        highlightGroup({members:matches.map(n=>n.name),rank:topic.id});
        el('selection').textContent=`T${topic.id+1}：当前${matches.length}个关键词。按包含该词的论文主题权重汇总归类；不是模块度群组。`;
      }); detail.append(button);
      const list=document.createElement('ol');
      result.documents.filter(d=>result.model!=='BERTopic'||d.primary===topic.id).slice().sort((a,b)=> result.model==='BERTopic' ? (b.membership||0)-(a.membership||0) : b.weights[topic.id]-a.weights[topic.id]||a.id.localeCompare(b.id)).slice(0,5).forEach(doc=>{
        const li=document.createElement('li');li.textContent=result.model==='BERTopic'
          ? `${titles.get(doc.id)}（T${topic.id+1}；聚类成员强度 ${doc.membership===null?'未提供':doc.membership.toFixed(3)}）`
          : `${titles.get(doc.id)}（T${topic.id+1}相对权重 ${(100*doc.weights[topic.id]).toFixed(1)}%；主主题T${doc.primary+1}）`;
        li.title=result.model==='BERTopic'?'聚类成员强度不是主题占比。':doc.weights.map((v,i)=>`T${i+1} ${(100*v).toFixed(1)}%`).join('；');list.append(li);
      });detail.append(list);box.append(detail);
    });
  }

  // 功能：按钮触发一次训练，固定种子42；运行期间冻结参数，防止界面参数与结果错配。
  async function run() {
    const controls=[...el('topic-panel').querySelectorAll('input,button,select')];
    const options={topics:Number(el('topic-count').value),topWords:Number(el('topic-words').value),minDf:Number(el('topic-min-df').value),iterations:Number(el('topic-iterations').value)};
    controls.forEach(c=>{c.disabled=true;});
    try {
      el('topic-status').textContent='正在准备文本…';
      const useBert=el('topic-method').value==='bertopic';
      const method=el('topic-method').value;
      options.minSize=Number(el('bertopic-min-size').value);options.neighbors=Number(el('bertopic-neighbors').value);
      const fitted=await TopicTrainer.fit(method,topicCorpus,options,(step,total)=>{el('topic-status').textContent=`${method.toUpperCase()}计算中：${step}/${total}轮…`;},message=>{el('topic-status').textContent=message;});
      result=fitted;TopicStore.save(result,topicCorpus);mapKeywords();showResults();
      el('topic-status').textContent=useBert?`BERTopic完成：${result.topics.length}个主题，${result.used}篇有效，${result.outliers}篇未归类。成员强度不是主题占比。`:`${result.model}完成：${result.used}/${topicCorpus.length}篇有效，词表${result.vocabularySize}；${result.iterations}轮，种子42。${method==='lda'?'LDA显示平滑后的主题概率估计，不是分类准确率。':'NMF显示相对强度，不是置信度。'}`;
      el('topic-color-option').disabled=false;el('color-mode').value='topic';updateColors();
      // 功能：训练成功自动按主题聚拢；位置仅用于展示主题归属，不代表主题间语义距离。
      el('topic-layout-option').disabled=false;el('layout-mode').value='topic';
      buildSimulation();fitGraph();
    } catch(error) {el('topic-status').textContent=`训练失败：${error.message}。此前成功结果仍保留。`;}
    finally {controls.forEach(c=>{c.disabled=false;});syncMethod();}
  }
  // 功能：切换模型仅更改适用参数与按钮文案，不覆盖上次成功结果或自动启动训练。
  function syncMethod(){
    const bert=el('topic-method').value==='bertopic';
    el('bertopic-parameters').hidden=!bert;
    el('topic-count').disabled=bert;el('topic-iterations').disabled=bert;
    el('run-topic').textContent='运行'+({nmf:'NMF',lda:'LDA',bertopic:'BERTopic'}[el('topic-method').value]);
  }
  syncMethod();
  el('topic-method').addEventListener('change',()=>{syncMethod();el('topic-status').textContent='已切换待运行模型；已有图形仍对应上次成功结果。';});
  if(location.protocol==='file:'){
    const link=document.createElement('a');link.href='http://127.0.0.1:8765/pages/network.html';link.textContent='打开本机主题工作台（先启动服务）';el('topic-panel').append(link);
  }
  window.TopicPanel={color:word=>colors()[topicOfKeyword.get(word)] || '#a7adb3',
    group:word=>topicOfKeyword.has(word)?topicOfKeyword.get(word):null};
  el('run-topic').addEventListener('click',run);
  // 功能：复用本标签页时间线/网络最近一次相同语料的主题模型，不自动重训。
  const shared=TopicStore.read(topicCorpus);
  if(shared){
    result=shared;mapKeywords();showResults();
    el('topic-color-option').disabled=false;el('topic-layout-option').disabled=false;
    el('color-mode').value='topic';el('layout-mode').value='topic';
    updateColors();buildSimulation();fitGraph();
    el('topic-status').textContent=`已复用${result.model||'NMF'}结果：${result.topics.length}个主题、${result.used}篇。当前参数为待运行设置，修改后需点击运行更新。模块度暂时停用。`;
  }
  // 功能：参数改变只标注结果待更新，不隐式重训；网络门槛、布局与颜色均不触发训练。
  el('topic-panel').querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{if(result)el('topic-status').textContent='参数已修改，当前仍显示上次结果；点击运行按钮更新。';}));
})();
