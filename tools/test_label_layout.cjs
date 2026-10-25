// 合成矩形与 SVG 度量替身；不加载真实论文，不启动浏览器。
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'scripts/analysis/label-layout.js'),'utf8');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'library/d3/d3.v7.min.js'),'utf8'),context);
let frames=[];context.requestAnimationFrame=fn=>frames.push(fn);vm.runInContext(source,context);const L=context.LabelLayout;
const box=(x,y,w,h,priority=0)=>({x0:x,y0:y,x1:x+w,y1:y+h,priority});
const brute=(items,limit=Infinity)=>{const visible=[];items.map((b,i)=>({b,i})).sort((a,b)=>b.b.priority-a.b.priority||a.i-b.i).forEach(({b})=>{if(visible.length<limit&&!visible.some(a=>L.overlaps(a,b)))visible.push(b);});return visible;};
let seed=713;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let trial=0;trial<200;trial++){
 const items=Array.from({length:120},()=>box(random()*2000-1000,random()*1200-600,1+random()*1200,1+random()*100,Math.floor(random()*10)));
 const before=JSON.stringify(items),limit=trial%3?Infinity:20;
 assert.deepEqual([...L.select(items,{limit})],brute(items,limit));assert.equal(JSON.stringify(items),before);
}
const nested=[box(-1000,-1000,2000,2000,100),box(0,0,1,1),box(2000,2000,1,1)];assert.deepEqual([...L.select(nested)],brute(nested));
const sameCenter=[box(0,0,20,20,1),box(-5,-5,30,30,2)];assert.equal([...L.select(sameCenter)][0],sameCenter[1]);
const tree=context.d3.quadtree().x(d=>(d.x0+d.x1)/2).y(d=>(d.y0+d.y1)/2).addAll(sameCenter);
assert(L.visit2(tree,box(21,21,1,1),15,15)); // 检查叶节点 next 链，首个矩形未命中时仍能找到另一个。
assert.equal(L.select([box(0,0,0,10),box(NaN,0,10,10)]).size,0);
assert.equal(L.truncate('one two three four five six seven',6),'one two three four five six…');
assert.equal(L.truncate('short title',6),'short title');assert.equal(Array.from(L.truncate('中'.repeat(22))).length,19);
const parent={isConnected:true};
function element(x,priority){return {__data__:{count:priority},parentNode:parent,style:{},getBBox:()=>({x,y:0,width:30,height:12}),getScreenCTM:()=>({a:1,b:0,c:0,d:1,e:0,f:0})};}
const elements=[element(0,1),element(5,2),element(100,3)];
const selection={style(name,value){elements.forEach(e=>e.style[name]=value);return this;},each(fn){elements.forEach((e,i)=>fn.call(e,e.__data__,i));return this;},node:()=>elements[0]};
L.svg(selection);assert.equal(elements[0].style.display,'none');assert.equal(elements[1].style.display,'');
L.svg(selection,{priority:d=>d.count===1?1e9:d.count});assert.equal(elements[0].style.display,'');assert.equal(elements[1].style.display,'none');
L.svg(selection,{all:true});assert(elements.every(e=>e.style.display===''));
L.schedule(selection,{});L.schedule(selection,{all:true});assert.equal(frames.length,1);frames.shift()();assert(elements.every(e=>e.style.display===''));
// 字体变宽后重新测量，避免缓存旧矩形；没有增删数据或改变坐标。
elements[2].getBBox=()=>({x:20,y:0,width:180,height:12});L.svg(selection);assert.equal(elements[1].style.display,'none');
// 屏幕变换变化后从隐藏状态恢复；验证不是沿用上次矩形。
elements[2].getScreenCTM=()=>({a:2,b:0,c:0,d:2,e:500,f:0});L.svg(selection);assert.equal(elements[1].style.display,'');
let observed=null,refreshes=0;context.addEventListener=(event,fn)=>{assert.equal(event,'resize');fn();};
context.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(el){observed=el;this.fn([{contentRect:{width:900,height:520}}]);this.fn([{contentRect:{width:900,height:520}}]);}};
L.observe(parent,()=>refreshes++);assert.equal(observed,parent);assert.equal(refreshes,2);
const text={textContent:'abcdefghijklmnop',getComputedTextLength(){return this.textContent.length*10;}};
L.fitText({each(fn){fn.call(text);}},55);assert.equal(text.textContent,'abcd…');
const timeline=fs.readFileSync(path.join(root,'scripts/charts/timeline.js'),'utf8');
const init=timeline.match(/if\(!TopicStore.read\(topicCorpus\)\)d3.select\('#paper-row-type'\).property\('value','keyword'\);/)[0];
for(const trained of [false,true]){let value='cluster';vm.runInNewContext(init,{TopicStore:{read:()=>trained?{}:null},topicCorpus:[],d3:{select:()=>({property:(k,v)=>value=v})}});assert.equal(value,trained?'cluster':'keyword');}
const guard=timeline.slice(timeline.indexOf('      const needsTopics='),timeline.indexOf('      const minimum = Number',timeline.indexOf('    function renderTimeline()')));
const messages=[];const values={'#mode':'papers','#paper-row-type':'cluster'};const stub={property:()=>null,text(t){messages.push(t);return this;},attr(){return this;},selectAll(){return this;},remove(){return this;},append(){return this;}};
vm.runInNewContext('(function(){'+guard+'})()',{d3:{select:id=>({...stub,property:()=>values[id]})},TopicStore:{read:()=>null},topicCorpus:[],svg:stub,timelineLayer:{}});
assert(messages.some(m=>m.includes('此视图需要主题结果')));
for(const name of ['network','co-citation','timeline']){
 new vm.Script(fs.readFileSync(path.join(root,'scripts/charts',name+'.js'),'utf8'));
 const config=JSON.parse(fs.readFileSync(path.join(root,'pages',name+'.html'),'utf8').match(/data-config='([^']+)'/)[1]);
 assert(config.scripts.indexOf('../scripts/analysis/label-layout.js')<config.scripts.indexOf('../scripts/charts/'+name+'.js'));
}
console.log(JSON.stringify({passed:true,randomized_rectangles:24000,oracle:'greedy brute-force comparison',long_boxes:true,coincident_leaf_chain:true,selection_priority:true,screen_metrics:true,frame_coalescing:true,title_truncation:true,timeline_startup:true,topic_missing_message:true,gui_verified:false}));

// 仅合成论文；全库/样本内口径不混用，未知不同于0，来源与参考文献去重。
assert(L.weightPriority(0)>L.weightPriority(null));
assert(L.weightPriority(null,true)>L.weightPriority(1e12));
let weights=L.paperWeights([{id:'A',referenced_works:['B','B','A']},{id:'A',referenced_works:['B','B','A']},{id:'B',referenced_works:[]}]);
assert.equal(weights.values.get('B'),1);assert.equal(weights.values.get('A'),0);assert(weights.scope.includes('样本内'));
weights=L.paperWeights([{id:'A',cited_by_count:0,referenced_works:['B']},{id:'B'}]);
assert.equal(weights.values.get('A'),0);assert.equal(weights.values.get('B'),null);assert(weights.scope.includes('总被引'));
weights=L.paperWeights([{id:'A',referenced_works:[]},{id:'B'}]);assert.equal(weights.values.get('A'),null);assert(weights.scope.includes('缺失'));
console.log('PASS: node-weight priority, selected priority, citation scope, missing versus zero and deduplication');
