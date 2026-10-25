// 功能：纯合成数据验证透明度、上游FDEB端点、输入不变、拖动过期路径及模式切换，不加载真实论文。
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/interactions/edge-rendering.js'),'utf8'),ctx);
const edges=[{source:'a',target:'b',weight:1},{source:'c',target:'d',weight:10},{source:'e',target:'f',weight:100}];
const nodes=[{name:'a',x:0,y:0},{name:'b',x:100,y:100},{name:'c',x:0,y:10},{name:'d',x:100,y:110},{name:'e',x:0,y:20},{name:'f',x:100,y:120}];
const original=JSON.stringify({nodes,edges}),opacity=ctx.EdgeRendering.opacityScale(edges);
for(const state of ['normal','focus','dim']){const values=edges.map(e=>opacity(e,state));assert(values.every(v=>Number.isFinite(v)&&v>0&&v<=1));assert(values[0]<values[1]&&values[1]<values[2]);}
assert.equal(opacity(edges[0]),0.1);assert.equal(opacity(edges[2]),0.6);
assert.equal(ctx.EdgeRendering.opacityScale([{weight:4},{weight:4}])({weight:4}),0.35);
assert(Number.isFinite(ctx.EdgeRendering.opacityScale([])({weight:0})));
const snap=ctx.EdgeRendering.snapshot(nodes,edges);
function runWorker(snapshot,scriptPath='scripts/analysis/edge-bundling-worker.js'){
 let reply;const worker={self:{postMessage:v=>reply=v},d3:{}};vm.createContext(worker);
 worker.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(root,'library/d3-forcebundle/d3-ForceEdgeBundling.js'),'utf8'),worker);
 vm.runInContext(fs.readFileSync(path.join(root,scriptPath),'utf8'),worker);
 worker.self.onmessage({data:{id:1,nodes:snapshot.nodes,edges:snapshot.edges}});
 assert(!reply.error,reply.error);return reply.paths;
}
const output=runWorker(snap);assert.equal(output.length,3);
output.forEach((points,i)=>{assert(points.length>2);assert(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));const a=snap.nodes[snap.edges[i].source],b=snap.nodes[snap.edges[i].target];assert(Math.hypot(points[0].x-a.x,points[0].y-a.y)<1e-8);assert(Math.hypot(points.at(-1).x-b.x,points.at(-1).y-b.y)<1e-8);});
assert.equal(JSON.stringify({nodes,edges}),original);
const coincident=ctx.EdgeRendering.snapshot([{name:'x',x:1,y:1},{name:'y',x:1,y:1}],[{source:'x',target:'y',weight:1}]);assert.equal(coincident.edges.length,0);
assert.equal(ctx.EdgeRendering.snapshot([{name:'x',x:NaN,y:0}],[]),null);
assert.equal(ctx.EdgeRendering.snapshot(nodes,[{...edges[0],source:nodes[0],target:nodes[1]}]).edges.length,1);
// 功能：固定种子的稠密合成网络复现尺度导致的扭曲，比较修复前后路径绕行并验证显示尺度不影响结果。
let randomSeed=42;const random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
const denseNodes=Array.from({length:60},(_,i)=>({name:String(i),x:random()*900,y:random()*900})),denseEdges=[];
for(let i=0;i<60;i++)for(let j=i+1;j<60;j++)if(random()<0.2)denseEdges.push({source:String(i),target:String(j),weight:1});
const denseBefore=JSON.stringify({denseNodes,denseEdges}),denseSnapshot=ctx.EdgeRendering.snapshot(denseNodes,denseEdges);
const oldDense=runWorker(denseSnapshot,'docs/backups/2026-10-21-bundling-scale-fix/scripts/analysis/edge-bundling-worker.js'),newDense=runWorker(denseSnapshot);
function detours(paths,snapshot){return paths.map((points,i)=>{let length=0;for(let j=1;j<points.length;j++)length+=Math.hypot(points[j].x-points[j-1].x,points[j].y-points[j-1].y);const a=snapshot.nodes[snapshot.edges[i].source],b=snapshot.nodes[snapshot.edges[i].target];assert(Math.hypot(points[0].x-a.x,points[0].y-a.y)<1e-8);assert(Math.hypot(points.at(-1).x-b.x,points.at(-1).y-b.y)<1e-8);return length/Math.hypot(a.x-b.x,a.y-b.y);});}
const oldRatios=detours(oldDense,denseSnapshot),newRatios=detours(newDense,denseSnapshot);
assert(newRatios.every(r=>Number.isFinite(r)&&r<=1.50000001));assert(Math.max(...newRatios)<Math.max(...oldRatios));assert(newRatios.some(r=>r>1.00001),'应保留实际捆绑，而非所有边变直线');
assert.equal(newDense.length,denseEdges.length);assert.equal(JSON.stringify({denseNodes,denseEdges}),denseBefore);
const scaledSnapshot=ctx.EdgeRendering.snapshot(denseNodes.map(n=>({...n,x:n.x*10,y:n.y*10})),denseEdges),scaledDense=runWorker(scaledSnapshot);
newDense.forEach((points,i)=>points.forEach((p,j)=>assert(Math.hypot(p.x-scaledDense[i][j].x,p.y-scaledDense[i][j].y)<1e-8)));
console.log(JSON.stringify({shape_regression:true,synthetic_edges:denseEdges.length,old_max_detour:Math.max(...oldRatios),new_max_detour:Math.max(...newRatios),coordinate_scale_invariant:true}));
// 功能：最小界面替身仅验证控制器状态，不作为GUI视觉验收；绘图使用工程真实D3。
const control={value:'straight',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}},status={textContent:''};
let queue=new Map(),nextTimer=0,workerInstance;
ctx.d3=require(path.join(root,'library/d3/d3.v7.min.js'));
ctx.document={createElement:()=>({querySelector:sel=>sel==='select'?control:status})};
ctx.window={addEventListener:()=>{}};ctx.location={href:'http://127.0.0.1:8765/pages/network.html'};ctx.URL=URL;
ctx.setTimeout=(fn,delay)=>{const id=++nextTimer;queue.set(id,{fn,delay});return id;};ctx.clearTimeout=id=>queue.delete(id);
ctx.Worker=class{constructor(){workerInstance=this;}postMessage(payload){this.payload=payload;}terminate(){this.terminated=true;}};
const selection={values:[],attr(name,fn){if(name==='d')this.values=edges.map(fn);return this;}};
const svg={parentElement:{insertBefore:()=>{}}},layer={node:()=>({ownerSVGElement:svg})};
const view=ctx.EdgeRendering.create(layer,()=>nodes,()=>edges);view.bind(selection);view.update();assert(selection.values.every(p=>p.startsWith('M')&&p.includes('L')));
function startPending(){const entry=[...queue.entries()].find(([,job])=>job.delay===180);assert(entry);queue.delete(entry[0]);entry[1].fn();}
control.value='bundled';control.listeners.change();startPending();const oldWorker=workerInstance;
// 功能：拖动导致坐标改变时，旧worker必须终止，旧路径不能回写。
nodes[0].x=3;view.update();assert(oldWorker.terminated);oldWorker.onmessage({data:{id:oldWorker.payload.id,paths:output}});assert(selection.values[0].startsWith('M3,'));
startPending();const currentWorker=workerInstance,newPaths=runWorker(currentWorker.payload);
currentWorker.onmessage({data:{id:currentWorker.payload.id,paths:newPaths}});assert(selection.values[0].split('L').length>3);assert(status.textContent.includes('捆绑完成'));
control.value='straight';control.listeners.change();assert.equal(selection.values[0],'M3,0L100,100');
// 功能：后台失败保留全部原边，不清空图形。
control.value='bundled';control.listeners.change();view.bind(selection);view.update();startPending();workerInstance.onerror();assert.equal(selection.values.length,edges.length);assert(status.textContent.includes('保留普通连线'));
assert.equal(fs.readFileSync(path.join(root,'library/d3-forcebundle/LICENSE'),'utf8').includes('GNU GENERAL PUBLIC LICENSE'),true);
console.log(JSON.stringify({passed:true,weighted_opacity:true,upstream_worker:true,fixed_endpoints:true,input_unchanged:true,zero_length_edges:true,stale_worker_cancelled:true,mode_roundtrip:true,worker_failure_fallback:true,gui_verified:false}));
