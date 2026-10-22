// 功能：仅用虚拟文本检验NMF收敛、确定性、异常输入及输入不可变性；不训练真实数据。
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
vm.runInThisContext(fs.readFileSync(path.join(root,'scripts/analysis/topic-model.js'),'utf8'));
(async()=>{
  const docs=[
    {id:'a',text:'apple orchard fruit harvest apple fruit orchard'},
    {id:'b',text:'apple fruit tree orchard harvest'},
    {id:'c',text:'fruit apple harvest orchard tree'},
    {id:'d',text:'galaxy planet astronomy space orbit galaxy'},
    {id:'e',text:'planet galaxy orbit space astronomy'},
    {id:'f',text:'astronomy space galaxy orbit planet'},
    {id:'empty',text:'the and of'}
  ];
  const before=JSON.stringify(docs),options={topics:2,minDf:2,iterations:100,topWords:4};
  const initial=await TopicModel.fit(docs,{...options,iterations:10});
  const result=await TopicModel.fit(docs,options);
  const repeated=await TopicModel.fit(docs,options);
  assert.deepEqual(result,repeated);
  assert.equal(JSON.stringify(docs),before);
  assert.equal(result.used,6);assert.equal(result.excluded,1);
  assert(result.error<initial.error,'训练后重构误差应下降');
  const group=result.documents.map(d=>d.primary);
  assert(group.slice(0,3).every(g=>g===group[0]));
  assert(group.slice(3).every(g=>g===group[3]));assert.notEqual(group[0],group[3]);
  result.documents.forEach(d=>{assert(d.weights.every(v=>Number.isFinite(v)&&v>=0));assert(Math.abs(d.weights.reduce((a,b)=>a+b,0)-1)<1e-9);});
  await assert.rejects(()=>TopicModel.fit([],options));
  await assert.rejects(()=>TopicModel.fit(docs,{...options,topics:2.5}));
  await assert.rejects(()=>TopicModel.fit(docs,{...options,minDf:999}));
  // 功能：静态编译页面脚本及新增模块，确认经典script模式兼容，不执行真实数据上的训练。
  const html=fs.readFileSync(path.join(root,'scripts/charts/network.js'),'utf8');
  // 功能：虚拟节点检查布局切换使用主题编号/模块度编号，未分类节点保留null。
  const assignment=html.slice(html.indexOf('function applyGroupIds()'),html.indexOf('function layoutLinks()'));
  let layoutMode='topic';
  const fixture=[{name:'apple'},{name:'galaxy'},{name:'unknown'}];
  const panel={group:name=>({apple:0,galaxy:1}[name] ?? null)};
  const context={AnalysisFeatures:{modularity:false},nodes:fixture,TopicPanel:panel,window:{TopicPanel:panel},
    d3:{select:()=>({property:()=>layoutMode})},clusterInfo:{groups:[{rank:7,members:['apple','galaxy']}]}};
  vm.createContext(context);vm.runInContext(assignment+';applyGroupIds();',context);
  assert.deepEqual(fixture.map(n=>n.groupId),[0,1,null]);
  layoutMode='community';vm.runInContext('applyGroupIds();',context);
  assert.deepEqual(fixture.map(n=>n.groupId),[null,null,null]);
  context.AnalysisFeatures.modularity=true;vm.runInContext('applyGroupIds();',context);
  assert.deepEqual(fixture.map(n=>n.groupId),[7,7,null]);
  new vm.Script(html);
  new vm.Script(fs.readFileSync(path.join(root,'scripts/interactions/topic-panel.js'),'utf8'));
  JSON.parse(fs.readFileSync(path.join(root,'data/processed/topic-corpus.json'),'utf8'));
  console.log(JSON.stringify({passed:true,used:result.used,excluded:result.excluded,error10:initial.error,error100:result.error,deterministic:true,inputUnchanged:true,syntax:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
