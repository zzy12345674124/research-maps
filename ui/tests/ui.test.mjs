// 只使用合成DOM与参数；不访问真实论文、不运行主题模型、不做GUI自动验收。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import {readControl,commitControl,parseMonth,formatMonth} from '../src/control-model.js';
const bundle=await readFile(new URL('../../library/vue-primevue/research-maps-ui.js',import.meta.url),'utf8');
function fixture(page='network.html'){
 const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>{if(!error.message.includes('Could not parse CSS stylesheet'))errors.push(error);});console.on('error',error=>errors.push(error));
 const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{runScripts:'outside-only',pretendToBeVisual:true,url:'http://fixture.test/pages/'+page,virtualConsole:console});
 const win=dom.window;win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});win.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};win.HTMLElement.prototype.scrollIntoView=function(){};
 win.eval(bundle);return {dom,win,document:win.document,ui:win.ResearchMapsUI,errors};
}
async function flush(f){await f.ui.ready();await new Promise(r=>f.win.setTimeout(r,90));await f.ui.ready();}
function controls(f){const panel=f.document.querySelector('#panel-view')||f.document.body;panel.insertAdjacentHTML('beforeend',`<div class="toolbar"><label>布局<select id="fixture-layout"><option value="force">力导向</option><option value="topic">主题聚团</option><option value="hidden" hidden>隐藏项</option></select></label><label>门槛<input id="fixture-number" type="number" min="1" max="30" value="2"></label><label><input id="fixture-check" type="checkbox">显示连线</label><button id="fixture-run" type="button">应用筛选</button><label>检索<input id="fixture-search" type="search"></label><label>时间<input id="fixture-month" type="month" value="2026-04"></label></div>`);}
function host(f,id){return f.document.getElementById(id).nextElementSibling;}

test('Vue owns workbench and tabs without replacing chart/evidence nodes',async()=>{
 const f=fixture();try{
  const chart=f.document.createElement('svg');let clicks=0;chart.addEventListener('click',()=>clicks++);
  const shell=f.ui.mountWorkbench();shell.layout.querySelector('.ws-viewport').append(chart);controls(f);f.ui.upgradeControls();await flush(f);
  assert.equal(f.ui.inspect().versions.vue,'3.5.44');assert.equal(f.ui.inspect().versions.primevue,'4.5.5');assert(f.ui.inspect().shell);
  assert.equal(f.document.querySelector('.ws-viewport svg'),chart);chart.dispatchEvent(new f.win.Event('click'));assert.equal(clicks,1);
  f.document.getElementById('tab-find').click();await flush(f);assert(f.document.getElementById('panel-view').hidden);assert(!f.document.getElementById('panel-find').hidden);
  f.document.getElementById('tab-view').dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'End',bubbles:true}));await flush(f);assert(!f.document.getElementById('panel-info').hidden);
  assert(f.ui.inspect().controls>=6);assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});
test('PrimeVue Select and Checkbox write through native IDs and events',async()=>{
 const f=fixture();try{
  let ancestorScrollCalls=0;f.win.HTMLElement.prototype.scrollIntoView=function(){ancestorScrollCalls++;};
  f.ui.mountWorkbench();controls(f);let changes=0;const select=f.document.getElementById('fixture-layout');select.addEventListener('change',()=>changes++);
  f.ui.upgradeControls();await flush(f);assert.notEqual(select.closest('label').control,select,'可见下拉框的标签不得激活隐藏select');assert(select.closest('label').htmlFor.includes('--prime-'));host(f,'fixture-layout').querySelector('.p-select').click();await flush(f);
  const option=[...f.document.querySelectorAll('.p-select-option')].find(el=>el.textContent.includes('主题聚团'));assert(option);
  option.dispatchEvent(new f.win.MouseEvent('mousedown',{bubbles:true}));await flush(f);assert.equal(select.value,'topic');assert.equal(changes,1);assert.equal(ancestorScrollCalls,0,'选项不能滚动工作台祖先');
  assert(![...f.document.querySelectorAll('.p-select-option')].some(el=>el.textContent==='隐藏项'));
  const check=f.document.getElementById('fixture-check');host(f,'fixture-check').querySelector('input[type="checkbox"]').click();await flush(f);assert(check.checked);
  check.checked=false;select.value='force';await flush(f);assert(!host(f,'fixture-check').querySelector('input').checked);assert(host(f,'fixture-layout').textContent.includes('力导向'));
  select.querySelector('option[value="topic"]').hidden=true;select.disabled=true;await flush(f);assert(host(f,'fixture-layout').querySelector('.p-select').classList.contains('p-disabled'));
  assert.equal(f.ui.inspect().controls,6);assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});
test('buttons, text, number, month and programmatic D3-style writes stay synchronized',async()=>{
 const f=fixture();try{
  controls(f);const button=f.document.getElementById('fixture-run'),number=f.document.getElementById('fixture-number'),search=f.document.getElementById('fixture-search');let count=0,keys=[];
  button.addEventListener('click',()=>count++);search.addEventListener('keydown',event=>keys.push(event.key));f.ui.upgradeControls();await flush(f);
  host(f,'fixture-run').querySelector('button').click();assert.equal(count,1);
  button.textContent='计算中';button.disabled=true;number.value='9';number.disabled=true;await flush(f);
  assert(host(f,'fixture-run').textContent.includes('计算中'));assert(host(f,'fixture-run').querySelector('button').disabled);assert.equal(host(f,'fixture-number').querySelector('input').value,'9');assert(host(f,'fixture-number').querySelector('input').disabled);
  const input=host(f,'fixture-search').querySelector('input');input.value='synthetic';input.dispatchEvent(new f.win.Event('input',{bubbles:true}));input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(search.value,'synthetic');assert.deepEqual(keys,['Enter']);
  const month=f.document.getElementById('fixture-month');month.value='2026-08';await flush(f);assert.equal(host(f,'fixture-month').querySelector('input').value,'2026-08');
  assert.equal(formatMonth(parseMonth('2026-08')),'2026-08');assert.equal(readControl(number).value,9);commitControl(number,12);assert.equal(number.value,'9');
  assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});
test('dynamic controls upgrade once; pagehide releases adapters and overlays',async()=>{
 const f=fixture();try{
  f.ui.mountWorkbench();controls(f);f.ui.upgradeControls();await flush(f);f.ui.upgradeControls();await flush(f);assert.equal(f.ui.inspect().controls,6);
  f.document.getElementById('panel-view').insertAdjacentHTML('beforeend','<label>动态<button id="fixture-dynamic">展开</button></label>');await flush(f);assert.equal(f.ui.inspect().controls,7);
  const raw=f.document.getElementById('fixture-layout');f.win.dispatchEvent(new f.win.Event('pagehide'));await flush(f);assert.equal(f.ui.inspect().controls,0);assert(!f.document.querySelector('.rm-prime-overlay'));assert(!raw.classList.contains('rm-native-control'));assert.equal(Object.getOwnPropertyDescriptor(raw,'value'),undefined);
  assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});
test('existing workspace controller, D3-native callbacks and PrimeVue cooperate',async()=>{
 const f=fixture();try{
  f.document.body.innerHTML='<h2>合成图</h2><div class="toolbar"><svg id="synthetic-scale-preview"></svg><label>布局<select id="layout-mode"><option value="force">力导向</option><option value="topic">主题聚拢</option></select></label><label>关键词最少出现<input id="min-count" type="number" value="2">篇</label><label>最少共现<input id="min-weight" type="number" value="1">篇</label><button id="filter-button">应用筛选</button><button id="reset-view">显示全图</button></div><div class="chart"><svg id="synthetic-chart"></svg></div><div id="summary">合成计数</div><div id="detail">合成证据</div>';
  const chart=f.document.getElementById('synthetic-chart');let changed=0;f.document.getElementById('filter-button').addEventListener('click',()=>changed++);
  let resets=0;const reset=f.document.getElementById('reset-view');reset.addEventListener('click',()=>resets++);
  const routes=[];f.win.WorkspaceNavigation={navigate:href=>routes.push(href)};
  f.win.eval(await readFile(new URL('../../scripts/interactions/workspace.js',import.meta.url),'utf8'));await flush(f);
  if(f.document.body.dataset.workspaceReady!=='true'){f.document.dispatchEvent(new f.win.Event('DOMContentLoaded'));await flush(f);}
  assert(f.document.querySelector('#panel-view #synthetic-scale-preview'));assert.equal(f.document.body.dataset.workspaceReady,'true');assert.equal(f.document.querySelector('.ws-viewport svg'),chart);assert.equal(f.document.querySelector('.ws-status #summary').textContent,'合成计数');
  assert(f.document.querySelector('.ws-filter-row #min-count'));assert(f.document.querySelector('.ws-filter-row #min-weight'));assert(f.document.querySelector('.ws-filter-row #filter-button'));assert.equal(f.document.querySelector('.ws-output-head #reset-view'),reset);
  host(f,'reset-view').querySelector('button').click();assert.equal(resets,1);
  host(f,'filter-button').querySelector('button').click();assert.equal(changed,1);
  const category=f.document.getElementById('workspace-category');category.value='timeline';category.dispatchEvent(new f.win.Event('change',{bubbles:true}));assert(routes[0].includes('timeline.html'));
  f.document.getElementById('layout-mode').value='topic';await flush(f);assert(host(f,'layout-mode').textContent.includes('主题聚拢'));assert.equal(f.document.querySelector('.ws-viewport svg'),chart);assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});
test('slider keyboard, number edits and checkbox labels preserve input/change contracts',async()=>{
 const f=fixture();try{
  f.document.body.innerHTML='<div class="toolbar"><label>间距<input id="spacing" type="range" min="0.1" max="3" step="0.1" value="0.7"></label><label>数量<input id="amount" type="number" min="1" max="30" value="2"></label><label id="check-label"><input id="enabled" type="checkbox">启用</label></div>';
  const events=[];for(const id of ['spacing','amount','enabled'])for(const type of ['input','change'])f.document.getElementById(id).addEventListener(type,()=>events.push(id+':'+type));
  f.ui.upgradeControls();await flush(f);
  for(const id of ['spacing','amount','enabled']){const native=f.document.getElementById(id);assert(native.hasAttribute('inert'));assert.notEqual(native.closest('label').control,native,'标签不应指向隐藏原始控件');}
  const handle=host(f,'spacing').querySelector('.p-slider-handle');let focusOptions;const originalFocus=handle.focus.bind(handle);handle.focus=options=>{focusOptions=options;originalFocus(options);};
  handle.dispatchEvent(new f.win.MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:10,clientY:10}));
  assert.equal(focusOptions?.preventScroll,true,'拖动滑块聚焦必须禁止祖先滚动');
  f.document.dispatchEvent(new f.win.MouseEvent('mouseup',{bubbles:true}));
  host(f,'spacing').querySelector('.p-slider-handle').dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true}));await flush(f);assert(Math.abs(Number(f.document.getElementById('spacing').value)-.8)<1e-6);assert(events.includes('spacing:input'));assert(events.includes('spacing:change'));
  const input=host(f,'amount').querySelector('input');input.setSelectionRange(0,input.value.length);
  for(const key of ['1','2'])input.dispatchEvent(new f.win.KeyboardEvent('keypress',{key,charCode:key.charCodeAt(0),bubbles:true,cancelable:true}));
  await flush(f);assert.equal(f.document.getElementById('amount').value,'12');input.dispatchEvent(new f.win.FocusEvent('blur'));await flush(f);assert(events.includes('amount:change'));
  f.document.getElementById('check-label').click();await flush(f);assert(f.document.getElementById('enabled').checked);assert.equal(events.filter(x=>x==='enabled:change').length,1);assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});

test('parameter redesign moves legends, groups nodes, splits density and gates topic controls',async()=>{
 const f=fixture();try{
  f.document.body.innerHTML=`<h2>合成网络</h2><svg id="network" data-workspace-chart></svg>
  <div class="toolbar"><label for="color-mode">节点颜色</label><select id="color-mode"><option value="year">年份</option></select><span id="color-description">说明</span></div>
  <div class="toolbar"><label><input id="show-all-labels" type="checkbox">显示全部标签（可能重叠）</label><label><input id="show-links" type="checkbox">显示连线</label><span class="note">解释</span></div>
  <div class="toolbar" id="size-mapping-controls"><strong>节点调整</strong><p class="note">解释</p><input id="node-size-strength" type="range"><p id="node-size-help">帮助</p></div>
  <div id="year-legend">颜色图例</div><div id="density-legend">密度图例</div><div class="legend">原图说明</div>
  <div class="toolbar"><label>展示方式<select id="view-mode"><option value="network">共现</option><option value="density">密度</option></select></label><label>密度权重<select id="density-weight"><option>词频</option></select></label><label>平滑<input id="bandwidth" type="range"></label></div>
  <div class="toolbar"><label>布局<select id="layout-mode"><option value="force">力导向</option><option value="topic">按论文主题聚拢</option><option value="bubbles">气泡</option></select></label><label>归一化<select id="weight-mode"><option value="strength">关联强度</option></select></label><div id="weight-mode-help">解释</div></div>
  <div class="toolbar" id="topic-panel"><select id="topic-method"><option value="nmf">NMF</option></select><input id="topic-count" type="number"></div>
  <div class="toolbar"><label>连线画法<select id="edge-render-mode"><option>普通连线</option></select></label></div>`;
  f.win.eval(await readFile(new URL('../../scripts/interactions/workspace.js',import.meta.url),'utf8'));await flush(f);
  if(!f.document.body.dataset.workspaceReady){f.document.dispatchEvent(new f.win.Event('DOMContentLoaded'));await flush(f);}
  for(const id of ['year-legend','density-legend','show-all-labels','show-links'])assert(f.document.querySelector('.ws-plot-legend #'+id),id);
  assert(f.document.querySelector('#panel-view #edge-render-mode'));assert(!f.document.querySelector('.ws-legend-explanation'));assert(f.document.querySelector('.ws-header .ws-top-search input'));assert(f.document.querySelector('.ws-output > .ws-plot-legend'));
  assert(f.document.querySelector('#node-controls #color-mode'));assert(f.document.querySelector('#node-controls #node-size-strength'));assert(!f.document.getElementById('node-size-help'));
  assert(f.document.querySelector('.ws-layout-row #layout-mode'));assert(f.document.querySelector('.ws-layout-row #weight-mode'));
  assert(f.document.getElementById('topic-panel').hidden);const layout=f.document.getElementById('layout-mode');layout.value='topic';layout.dispatchEvent(new f.win.Event('change',{bubbles:true}));assert(!f.document.getElementById('topic-panel').hidden);
  layout.value='bubbles';layout.dispatchEvent(new f.win.Event('change',{bubbles:true}));assert(f.document.getElementById('topic-panel').hidden);
  const view=f.document.getElementById('view-mode');assert(view.closest('label').hidden);view.value='density';view.dispatchEvent(new f.win.Event('change',{bubbles:true}));assert(f.document.getElementById('node-controls').hidden);assert(!f.document.getElementById('bandwidth').closest('label').hidden);
  const routes=[...f.document.getElementById('workspace-chart').options].map(o=>o.value);assert(routes.includes('network.html?view=network'));assert(routes.includes('network.html?view=density'));assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});

test('count beeswarm preserves time, counts and separates synthetic circles',async()=>{
 const f=fixture();try{
  f.win.eval(await readFile(new URL('../../scripts/analysis/timeline-count-beeswarm.js',import.meta.url),'utf8'));
  const circles=[{name:'a',count:2},{name:'a',count:3},{name:'b',count:4}].map(d=>{const el=f.document.createElementNS('http://www.w3.org/2000/svg','circle');el.__data__=d;el.setAttribute('cx','50');el.setAttribute('cy',d.name==='a'?'40':'100');el.setAttribute('r','10');return el;});
  let updated=0;f.win.TimelineCountBeeswarm.mount({each(fn){circles.forEach(el=>fn.call(el,el.__data__));}},()=>updated++);
  assert.equal(updated,1);assert(circles.every(el=>el.getAttribute('cx')==='50'));assert(Math.abs(Number(circles[0].getAttribute('cy'))-Number(circles[1].getAttribute('cy')))>=20);assert.equal(circles[2].getAttribute('cy'),'100');assert.deepEqual(circles.map(el=>el.__data__.count),[2,3,4]);
 }finally{f.win.close();}
});

test('actual timeline markup keeps compact controls and working output zoom after comparison setup',async()=>{
 const f=fixture('timeline.html');try{
  const html=await readFile(new URL('../../pages/timeline.html',import.meta.url),'utf8');
  f.document.body.innerHTML=html.match(/<body>([\s\S]*)<\/body>/)[1];
  f.win.eval(await readFile(new URL('../../library/d3/d3.v7.min.js',import.meta.url),'utf8'));
  let scale=1;f.win.WorkspaceZoom={scaleBy:factor=>scale*=factor};
  f.win.openAlexPapers=[];f.win.BeeswarmD3v5=f.win.d3;
  f.win.eval(await readFile(new URL('../../scripts/interactions/workspace.js',import.meta.url),'utf8'));await flush(f);
  if(!f.document.body.dataset.workspaceReady){f.document.dispatchEvent(new f.win.Event('DOMContentLoaded'));await flush(f);}
  f.win.eval(await readFile(new URL('../../scripts/interactions/timeline-beeswarm-compare.js',import.meta.url),'utf8'));await flush(f);
  assert(f.document.querySelector('.timeline-view-tools').hidden);
  assert(!f.document.querySelector('#paper-legend,#relation-legend,#distribution-legend,.legend'));
  assert(f.document.querySelector('.ws-plot-legend').hidden);
  const search=f.document.querySelector('.ws-top-search'),input=search.querySelector('input'),button=search.querySelector('button');
  assert(button);assert.equal(input.nextElementSibling,button);
  const text=f.document.createElementNS('http://www.w3.org/2000/svg','text');text.textContent='Synthetic education';f.document.getElementById('timeline').append(text);
  input.value='education';button.click();assert.equal(text.style.fontWeight,'700');
  input.value='';input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(text.style.fontWeight,'');
  assert(f.document.getElementById('paper-layout').closest('label').hidden);
  assert.equal(f.document.getElementById('paper-layout').value,'experimental');
  for(const id of ['start-month','end-month','time-granularity'])assert(f.document.querySelector('.ws-date-row #'+id));
  assert(f.document.getElementById('reset-period').hidden);assert(f.document.getElementById('exclude-jan-first').closest('label').hidden);
  assert(f.document.querySelector('.ws-tabs').hidden);assert(f.document.querySelector('#panel-info').hidden);
  const plus=f.document.querySelector('.ws-tools button');assert(!plus.disabled);
  const visible=plus.nextElementSibling?.matches('[data-rm-prime-host]')?plus.nextElementSibling.querySelector('button'):plus;
  visible.click();assert.equal(scale,1.25);
  const experimental=f.document.createElementNS('http://www.w3.org/2000/svg','svg');experimental.setAttribute('viewBox','0 0 1200 600');f.document.getElementById('timeline-beeswarm-host').append(experimental);
  f.document.getElementById('timeline-implementation').value='fil';visible.click();assert.equal(experimental.getAttribute('viewBox'),'120 60 960 480');assert.equal(scale,1.25);
  f.win.WorkspaceSVGZoom(experimental,.8);assert.equal(experimental.getAttribute('viewBox'),'0 0 1200 600');assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});

test('actual network topic entry is enabled without saved model and exposes training controls',async()=>{
 const f=fixture();try{
  const html=await readFile(new URL('../../pages/network.html',import.meta.url),'utf8');f.document.body.innerHTML=html.match(/<body>([\s\S]*)<\/body>/)[1];
  f.win.topicCorpus=[];f.win.TopicStore={read:()=>null};
  f.win.eval(await readFile(new URL('../../scripts/interactions/topic-panel.js',import.meta.url),'utf8'));
  assert.equal(f.document.getElementById('topic-layout-option').disabled,false);
  f.win.eval(await readFile(new URL('../../scripts/interactions/workspace.js',import.meta.url),'utf8'));await flush(f);
  if(!f.document.body.dataset.workspaceReady){f.document.dispatchEvent(new f.win.Event('DOMContentLoaded'));await flush(f);}
  const row=f.document.querySelector('.ws-top-search .ws-search-row');assert(row);assert.equal(row.querySelector('#keyword-search').nextElementSibling,row.querySelector('#search-button'));assert(!f.document.querySelector('.legend'));
  let searches=0;row.querySelector('#search-button').addEventListener('click',()=>searches++);row.querySelector('#search-button').click();assert.equal(searches,1);
  const select=host(f,'layout-mode').querySelector('.p-select');select.click();await flush(f);
  const option=[...f.document.querySelectorAll('.p-select-option')].find(el=>el.textContent==='按论文主题聚拢');assert(option);assert(!option.getAttribute('aria-disabled')||option.getAttribute('aria-disabled')==='false');
  option.dispatchEvent(new f.win.MouseEvent('mousedown',{bubbles:true}));await flush(f);
  assert.equal(f.document.getElementById('layout-mode').value,'topic');assert(!f.document.getElementById('topic-panel').hidden);assert(!f.document.getElementById('run-topic').disabled);assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});

test('all shared chart zoom controllers route plus/minus to their own chart',async()=>{
 for(const [name,zoomName] of [['network','zoom'],['co-citation','zoom'],['cooperation','zoom'],['openalex-demo','zoom'],['timeline','timelineZoom'],['dual-map','dualMapZoom']]){
  const source=await readFile(new URL('../../scripts/charts/'+name+'.js',import.meta.url),'utf8');
  const start=source.indexOf('window.WorkspaceZoom=');assert(start>=0,name);
  const end=source.indexOf('};',start)+2;const assignment=source.slice(start,end);let received=null;
  const context={};const svg={call(handler,factor){received={handler,factor};}};const controller={scaleBy(){}};
  const document={getElementById:()=>({value:'scatter'}),querySelector:()=>null};
  new Function('window','svg',zoomName,'document',assignment)(context,svg,controller,document);
  context.WorkspaceZoom.scaleBy(1.25);assert.equal(received.factor,1.25,name);assert.equal(received.handler,controller.scaleBy,name);
  context.WorkspaceZoom.scaleBy(.8);assert.equal(received.factor,.8,name);
 }
});

test('dense count timeline rows stay below axis with nonoverlapping row bands and radius margins',async()=>{
 const f=fixture();try{
  f.win.eval(await readFile(new URL('../../scripts/analysis/timeline-count-beeswarm.js',import.meta.url),'utf8'));
  const points=[];for(const key of ['keyword','topic'])for(let i=0;i<60;i++)points.push({key,x:i===59?1010:385+(i%8)*5,y:0,r:i%3===0?17:9,count:i+1});
  const saved=points.map(p=>({x:p.x,count:p.count}));const result=f.win.TimelineCountBeeswarm.layout(points,{stackRows:true,top:48,rowGap:16,minRowHeight:48});
  for(let i=0;i<points.length;i++){const p=points[i];assert.equal(p.x,saved[i].x);assert.equal(p.count,saved[i].count);assert(p.y-p.r>=48-1e-6);assert(p.y+p.r<=result.bottom+1e-6);assert(p.x-p.r>=365);assert(p.x+p.r<=1030);}
  const a=points.filter(p=>p.key==='keyword'),b=points.filter(p=>p.key==='topic');assert(Math.max(...a.map(p=>p.y+p.r))+16<=Math.min(...b.map(p=>p.y-p.r))+1e-6);
  for(const row of [a,b])for(let i=0;i<row.length;i++)for(let j=i+1;j<row.length;j++)assert(Math.hypot(row[i].x-row[j].x,row[i].y-row[j].y)>=row[i].r+row[j].r+.98);
 }finally{f.win.close();}
});


test('cooperation author/institution initialize and retain legend label toggle',async()=>{
 for(const mode of ['author','institution']){
  const f=fixture('cooperation.html?type='+mode);try{
   const html=await readFile(new URL('../../pages/cooperation.html',import.meta.url),'utf8');
   f.document.body.innerHTML=html.match(/<body>([\s\S]*)<\/body>/)[1];
   f.win.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:800,height:450});
   f.win.eval(await readFile(new URL('../../library/d3/d3.v7.min.js',import.meta.url),'utf8'));
   f.win.openAlexPapers=[{id:'fixture-paper',year:2025,title:'Synthetic',authors:[
    {author:{id:'a1',display_name:'Author One'},institutions:[{id:'i1',display_name:'Institute One'}]},
    {author:{id:'a2',display_name:'Author Two'},institutions:[{id:'i2',display_name:'Institute Two'}]}]}];
   const all=[];f.win.LabelLayout={schedule:(labels,options)=>all.push(options.all),weightPriority:n=>n,observe:()=>{}};
   f.win.EdgeRendering={create:()=>({bind(){},update(){}}),opacityScale:()=>()=>.3};
   f.win.eval(await readFile(new URL('../../scripts/analysis/cooperation.js',import.meta.url),'utf8'));
   f.win.eval(await readFile(new URL('../../scripts/charts/cooperation.js',import.meta.url),'utf8'));
   assert.equal(f.document.querySelectorAll('#network circle').length,2);
   assert(f.document.getElementById('summary').textContent.includes(mode==='author'?'作者':'机构'));
   const toggle=f.document.getElementById('show-all-labels');assert(toggle);assert.equal(all.at(-1),false);
   toggle.checked=true;toggle.dispatchEvent(new f.win.Event('change'));assert.equal(all.at(-1),true);
   f.win.eval(await readFile(new URL('../../scripts/interactions/workspace.js',import.meta.url),'utf8'));await flush(f);
   if(!f.document.body.dataset.workspaceReady){f.document.dispatchEvent(new f.win.Event('DOMContentLoaded'));await flush(f);}
   assert(f.document.querySelector('#workspace-chart').value.includes('type='+mode));
   assert(f.document.querySelector('.ws-plot-legend #show-all-labels'));
   toggle.remove();assert.doesNotThrow(()=>f.document.getElementById('reset-view').click());
   assert.deepEqual(f.errors,[]);
  }finally{f.win.close();}
 }
});


test('dual map classic variant boots actual chart and switches back with dataset preserved',async()=>{
 const f=fixture('dual-map.html?layout=classic&dataset=legacy100');try{
  const html=await readFile(new URL('../../pages/dual-map.html',import.meta.url),'utf8');
  f.document.body.innerHTML=html.match(/<body>([\s\S]*)<\/body>/)[1];
  const template=f.document.getElementById('journal-classic-template');assert(template);
  const content=template.content.cloneNode(true);f.document.body.replaceChildren(content);
  f.win.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:1200,height:740});
  f.win.eval(await readFile(new URL('../../library/d3/d3.v7.min.js',import.meta.url),'utf8'));
  f.win.LabelLayout={schedule(){},observe(){},weightPriority:n=>n};
  f.win.dualMapData={left:[{id:'f1',label:'Field One',journals:1,journalIds:['j1']}],right:[{id:'f2',label:'Field Two',journals:1,journalIds:['j2']}],journalMapping:[{id:'j1',label:'Journal One',field:'f1',fieldLabel:'Field One'},{id:'j2',label:'Journal Two',field:'f2',fieldLabel:'Field Two'}],paths:[{source:'f1',target:'f2',value:1,evidence:[]}],stats:{sample_works:1,failed_batches:[]}};
  const cfg=JSON.parse(html.match(/data-config='([^']+)'/)[1]);
  const original=JSON.stringify(f.win.dualMapData);
  for(const script of cfg.variants.classic.scripts){
   if(script.includes('/label-layout.js'))continue;
   f.win.eval(await readFile(new URL('../../'+script.replace('../',''),import.meta.url),'utf8'));
  }
  await flush(f);if(!f.document.body.dataset.workspaceReady){f.document.dispatchEvent(new f.win.Event('DOMContentLoaded'));await flush(f);}
  assert(f.document.querySelector('#dual-map .dual-map-viewport'));
  assert.equal(f.document.querySelector('#journal-semantic-map'),null);
  const local=f.document.getElementById('dual-layout');local.value='scatter';local.dispatchEvent(new f.win.Event('change'));assert(f.document.querySelector('#dual-map circle'));local.value='areas';local.dispatchEvent(new f.win.Event('change'));
  assert.equal(typeof f.win.WorkspaceZoom.scaleBy,'function');
  const select=f.document.getElementById('journal-layout-choice');assert.equal(select.value,'classic');
  let destination;f.win.WorkspaceNavigation={navigate:url=>destination=url};select.value='semantic';select.dispatchEvent(new f.win.Event('change'));
  const url=new URL(destination);assert.equal(url.searchParams.get('layout'),'semantic');assert.equal(url.searchParams.get('dataset'),'legacy100');
  assert.equal(JSON.stringify(f.win.dualMapData),original);assert.deepEqual(f.errors,[]);
 }finally{f.win.close();}
});
