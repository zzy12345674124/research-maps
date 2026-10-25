// Only synthetic boxes/labels; no real paper data or GUI.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const events={};const root=path.resolve(__dirname,'..'),c={requestAnimationFrame:fn=>fn(),addEventListener:(type,fn)=>events[type]=fn};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'library/d3/d3.v7.min.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(root,'scripts/analysis/label-layout.js'),'utf8'),c);const L=c.LabelLayout;
let seed=42;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
const entries=Array.from({length:800},(_,i)=>{const x=random()*300,y=random()*300,z=random()*10;return {i,x0:x,y0:y,z0:z,x1:x+random()*50,y1:y+random()*50,z1:z+random()*3};});
const tree=L.packedRTree3(entries);
const hit=(a,b)=>a.x0<=b.x1&&a.x1>=b.x0&&a.y0<=b.y1&&a.y1>=b.y0&&a.z0<=b.z1&&a.z1>=b.z0;
for(let i=0;i<200;i++){const box={x0:random()*250,y0:random()*250,z0:random()*10};Object.assign(box,{x1:box.x0+70,y1:box.y0+70,z1:box.z0+.1});assert.deepEqual(Array.from(L.queryRTree3(tree,box),x=>x.i).sort((a,b)=>a-b),entries.filter(x=>hit(x,box)).map(x=>x.i).sort((a,b)=>a-b));}
const items=Array.from({length:120},(_,i)=>({x:random()*500,y:random()*300,halfWidth:10+random()*40,halfHeight:8,priority:i===0?Infinity:120-i}));
const index=L.multiScaleIndex(items);let previous=new Set();
for(let k=.001;k<=16;k*=1.13){const visible=index.query(k);assert(visible.has(items[0]));for(const p of previous)assert(visible.has(p));const a=[...visible];for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const p=a[i],q=a[j];assert(Math.abs(p.x-q.x)>=(p.halfWidth+q.halfWidth)/k||Math.abs(p.y-q.y)>=(p.halfHeight+q.halfHeight)/k);}previous=visible;}
const owner={__zoom:{k:1,x:0,y:0},getScreenCTM:()=>({a:1,b:0,c:0,d:1,e:100,f:80})},parent={isConnected:true};
const nodes=[0,60,120].map((x,i)=>({__data__:{x,count:3-i},ownerSVGElement:owner,parentNode:parent,style:{},getAttribute(name){return name==='x'?this.__data__.x:name==='y'?20:name==='font-size'?12:null;},getBBox(){const font=parseFloat(this.style.fontSize)||12;return {x:this.__data__.x,y:20-font,width:font*9,height:font};},getScreenCTM(){const z=owner.__zoom;return {a:z.k,b:0,c:0,d:z.k,e:100+z.x,f:80+z.y};}}));
const selection={node:()=>nodes[0],style(name,value){for(const node of nodes)node.style[name]=value;return this;},each(fn){nodes.forEach((node,i)=>fn.call(node,node.__data__,i));return this;}};
function visible(){return nodes.filter(n=>n.style.display!=='none').length;}
L.svg(selection);const initial=visible();owner.__zoom={k:8,x:200,y:-50};L.svg(selection);assert(visible()>initial);assert.equal(parseFloat(nodes[0].style.fontSize)*8,12);
owner.__zoom={k:1,x:0,y:0};L.svg(selection);assert.equal(visible(),initial);
L.svg(selection,{priority:d=>d.count===1?Infinity:d.count});assert.equal(nodes[2].style.display,'');
nodes[2].__data__.x=1000;L.svg(selection);assert.equal(nodes[2].style.display,'');
L.svg(selection,{all:true});assert.equal(visible(),3);
console.log('PASS: 800-entry 3D R-tree vs 200 brute queries; 120-label arbitrary-zoom nonoverlap and monotonic visibility; SVG zoom/pan/font compensation/selection/movement/show-all');

const timers=new Map();let nextTimer=0;c.setTimeout=fn=>{timers.set(++nextTimer,fn);return nextTimer;};c.clearTimeout=id=>timers.delete(id);
nodes[1].__data__.x+=5;L.svg(selection);assert.equal(timers.size,1);
nodes[1].__data__.x+=5;L.svg(selection);assert.equal(timers.size,1);
const [timer,finish]=timers.entries().next().value;timers.delete(timer);finish();assert.equal(timers.size,0);
owner.__zoom={k:2,x:30,y:40};L.svg(selection);assert.equal(timers.size,0,'stable geometry zoom must reuse full index');
nodes[1].__data__.x+=5;L.svg(selection);assert.equal(timers.size,1);events.pagehide();assert.equal(timers.size,0);
console.log('PASS: moving coordinates debounce full index; stable zoom reuses index; stale rebuild replaced; pagehide cancels pending rebuild');
