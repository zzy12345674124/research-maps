// 用内存DOM和合成选项检查交互；不打开浏览器或加载真实论文。
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'scripts/interactions/liquid-select.js'),'utf8');
function fixture(){
 const observers=[],frames=[];let focused=null;
 class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.nodeType=1;this.children=[];this.parentElement=null;this.attrs=new Map();this.events=new Map();this._text='';this.hidden=false;this.disabled=false;this.style={setProperty(k,v){this[k]=v;}};
   this.classList={add:v=>{const names=new Set(this.className.split(' ').filter(Boolean));names.add(v);this.className=[...names].join(' ');},remove:v=>{this.className=this.className.split(' ').filter(x=>x!==v).join(' ');},toggle:(v,on)=>on?this.classList.add(v):this.classList.remove(v)};
  }
  get className(){return this._class||'';}set className(value){this._class=value;}
  get childNodes(){return this.children;}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];}
  get isConnected(){return this===body||Boolean(this.parentElement?.isConnected);}
  append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}
  before(n){const p=this.parentElement,index=p.children.indexOf(this);n.remove();n.parentElement=p;p.children.splice(index,0,n);}
  remove(){if(this.parentElement){const p=this.parentElement;p.children=p.children.filter(n=>n!==this);this.parentElement=null;}}
  replaceChildren(...nodes){for(const n of [...this.children])n.remove();this._text='';this.append(...nodes);}
  setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.get(k)??null;}removeAttribute(k){this.attrs.delete(k);}
  matches(selector){return selector==='select'&&this.tagName==='SELECT';}
  querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
  contains(node){return this===node||this.children.some(n=>n.contains(node));}
  addEventListener(k,fn){if(!this.events.has(k))this.events.set(k,[]);this.events.get(k).push(fn);}
  dispatchEvent(e){e.target=e.target||this;for(const fn of [...(this.events.get(e.type)||[])])fn(e);if(e.bubbles)this.parentElement?.dispatchEvent(e);return true;}
  focus(){focused=this;doc.dispatchEvent({type:'focusin',target:this});}
  getClientRects(){return this.isConnected&&!this.hidden&&!this.parentElement?.hidden?[{}]:[];}
  getBoundingClientRect(){return this.rect||{left:20,top:80,bottom:117,width:240};}
  get scrollHeight(){return Math.max(50,this.children.length*40);}scrollIntoView(){}
 }
 class Select extends Element{
  constructor(){super('select');this._index=0;this.size=0;this.multiple=false;this.labels=[];}
  get options(){return this.children.flatMap(n=>n.tagName==='OPTION'?[n]:n.children);}
  get selectedIndex(){return this._index;}set selectedIndex(value){this._index=Number(value);}
  get value(){return this.options[this._index]?.value||'';}set value(value){this._index=this.options.findIndex(o=>o.value===value);}
  get selectedOptions(){return this.options.filter(o=>o.selected);}
 }
 class Option extends Element{
  constructor(value,label){super('option');this.value=value;this.label=label;this.textContent=label;}
  get index(){const select=this.parentElement?.tagName==='SELECT'?this.parentElement:this.parentElement?.parentElement;return select.options.indexOf(this);}
  get selected(){const select=this.parentElement?.tagName==='SELECT'?this.parentElement:this.parentElement?.parentElement;return select?.selectedIndex===this.index;}
 }
 const body=new Element('body'),doc=new Element('document');doc.body=body;doc.nodeType=9;doc.readyState='complete';doc.querySelectorAll=s=>body.querySelectorAll(s);doc.createElement=tag=>new Element(tag);
 const select=new Select(),label=new Element('label');label.children.push({nodeType:3,textContent:'模型',querySelectorAll:()=>[],matches:()=>false,contains:()=>false});select.labels=[label];
 const a=new Option('a','Alpha'),b=new Option('b','Beta'),disabled=new Option('d','Disabled'),hidden=new Option('h','Hidden');disabled.disabled=true;hidden.hidden=true;select.append(a,b,disabled,hidden);body.append(select);
 const context={document:doc,window:{innerWidth:900,innerHeight:600,addEventListener:(k,fn)=>doc.addEventListener('window-'+k,fn)},HTMLSelectElement:Select,
 MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(target,options){this.target=target;this.options=options;}},Event:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},requestAnimationFrame:fn=>frames.push(fn),Date};
 vm.createContext(context);vm.runInContext(source,context);
 const button=body.children[0].children.find(n=>n.tagName==='BUTTON');
 const click=el=>el.dispatchEvent({type:'click',preventDefault(){}}),key=k=>button.dispatchEvent({type:'keydown',key:k,preventDefault(){}});
 const menu=()=>body.children.find(n=>n.className==='lg-menu');
 return {body,doc,select,button,a,b,disabled,hidden,click,key,menu,frames,observers,Select,Option,Element,focus:()=>focused};
}
let f=fixture();assert.equal(f.button.children[0].textContent,'Alpha');assert.equal(f.button.getAttribute('aria-label'),'模型：Alpha');
let changes=0,inputs=0;f.select.addEventListener('change',()=>changes++);f.select.addEventListener('input',()=>inputs++);
f.click(f.button);assert.equal(f.button.getAttribute('aria-expanded'),'true');assert.equal(f.menu().children.length,3);assert.equal(f.menu().parentElement,f.body);
f.click(f.menu().children[2]);assert.equal(f.select.value,'a');assert(f.menu()); // 禁用项不触发
f.click(f.menu().children[1]);assert.equal(f.select.value,'b');assert.equal(changes,1);assert.equal(inputs,1);assert(!f.menu());assert.equal(f.button.children[0].textContent,'Beta');
f.click(f.button);f.click(f.menu().children[1]);assert.equal(changes,1); // 相同选项不重复派发
f.select.value='a';assert.equal(f.button.children[0].textContent,'Alpha');f.select.selectedIndex=1;assert.equal(f.button.children[0].textContent,'Beta');
f.key('ArrowDown');f.key('Home');f.key('ArrowDown');f.key('ArrowDown');f.key('Enter');assert.equal(f.select.value,'b');assert(!f.menu()); // 跳过禁用项
f.key('Enter');f.key('Escape');assert(!f.menu());assert.equal(f.focus(),f.button);
f.click(f.button);f.key('Tab');assert(!f.menu());f.click(f.button);f.doc.dispatchEvent({type:'pointerdown',target:f.body});assert(!f.menu());
f.click(f.button);assert.notEqual(f.menu().style.top,'auto');f.doc.dispatchEvent({type:'scroll',target:f.menu()});assert(f.menu());f.doc.dispatchEvent({type:'scroll',target:f.body});assert(!f.menu());
f.button.rect={left:850,top:570,bottom:607,width:240};f.click(f.button);assert.equal(f.menu().style.top,'auto');assert(parseFloat(f.menu().style.left)<=670);f.key('Escape');
f.select.disabled=true;f.observers[0].fn([]);assert(f.button.disabled);f.click(f.button);assert(!f.menu());
f.select.disabled=false;f.observers[0].fn([]);f.select.hidden=true;f.observers[0].fn([]);assert(f.select.parentElement.hidden);f.select.hidden=false;f.observers[0].fn([]);
f.a.hidden=true;f.click(f.button);assert.equal(f.menu().children.length,2);f.key('Escape');
const extra=new f.Select();extra.append(new f.Option('z','Zeta'));f.body.append(extra);f.observers[1].fn([{addedNodes:[extra]}]);assert(extra.parentElement.className==='lg-select');
new vm.Script(source);
console.log(JSON.stringify({passed:true,synthetic_only:true,choose_once:true,programmatic_value_sync:true,keyboard:true,disabled_hidden:true,outside_scroll_escape:true,viewport_position:true,dynamic_selects:true,gui_verified:false}));
