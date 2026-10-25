/* 功能：网络与时间线统一调度NMF/LDA/BERTopic，固定输入语料；不自动安装或下载模型。 */
(function(root){
 root.TopicTrainer={async fit(method,corpus,options,progress=()=>{},status=()=>{}){
  if(method==='nmf'){const result=await TopicModel.fit(corpus,options,progress);return {...result,model:'NMF'};}
  if(method==='lda')return LDAModel.fit(corpus,options,progress);
  if(method!=='bertopic')throw Error('未知主题模型');
  if(location.protocol==='file:')throw Error('请从本机工作台网页运行BERTopic');
  const response=await fetch('/api/topics',{method:'POST',headers:{'Content-Type':'application/json','X-Topic-Request':'train'},body:JSON.stringify({dataset:root.DatasetInfo?.id||'legacy100',minSize:options.minSize,neighbors:options.neighbors,topWords:options.topWords,minDf:options.minDf})});
  const started=await response.json();if(!response.ok)throw Error(started.message||'本机训练启动失败');
  while(true){
   await new Promise(resolve=>setTimeout(resolve,1500));
   const poll=await fetch('/api/topics',{cache:'no-store'});if(!poll.ok)throw Error('本机服务连接中断');
   const state=await poll.json();status(state.message);
   if(state.status==='done'){
    const expected=new Set(corpus.map(d=>d.id));
    if(state.result.documents.length!==expected.size||state.result.documents.some(d=>!expected.has(d.id)))throw Error('服务返回了其他数据集的主题结果，请关闭旧服务后重新启动主题工作台。');
    return state.result;
   }
   if(state.status==='error')throw Error(state.message);
  }
 }};
})(globalThis);
