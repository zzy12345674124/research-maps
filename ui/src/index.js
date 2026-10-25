import {createApp,h,Fragment,Teleport,reactive,shallowReactive,ref,nextTick,version as vueVersion} from 'vue';
import PrimeVue from 'primevue/config';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import Slider from 'primevue/slider';
import DatePicker from 'primevue/datepicker';
import Aura from '@primeuix/themes/aura';
import {definePreset} from '@primeuix/themes';
import {kindOf,readControl,commitControl,parseMonth,formatMonth} from './control-model.js';
import './theme.css';

// 原scrollIntoView会连带滚动overflow:hidden的页面祖先，挪走整个工作台。
// 保留PrimeVue选项交互，仅将滚动限定在菜单自己的列表容器。
const WorkbenchSelect={extends:Select,methods:{scrollInView(index=-1){
 this.$nextTick(()=>{
  const id=index!==-1?`${this.$id}_${index}`:this.focusedOptionId;
  const item=Array.from(this.list?.querySelectorAll('li')||[]).find(el=>el.id===id);
  const container=this.list?.parentElement;
  if(item&&container){
   const box=container.getBoundingClientRect(),rect=item.getBoundingClientRect();
   if(rect.top<box.top)container.scrollTop-=box.top-rect.top;
   else if(rect.bottom>box.bottom)container.scrollTop+=rect.bottom-box.bottom;
  }else if(!this.virtualScrollerDisabled)this.virtualScroller?.scrollToIndex(index!==-1?index:this.focusedOptionIndex);
 });
}}};
const WorkbenchSlider={extends:Slider,methods:{onDragStart(event,index){
 const handle=event.currentTarget;
 // 保留上游拖动初始化，只禁止聚焦时滚动外层容器。
 return Slider.methods.onDragStart.call(this,{currentTarget:{focus:()=>handle.focus({preventScroll:true})}},index);
}}};

export const versions=Object.freeze({vue:vueVersion,primevue:'4.5.5'});
const theme=definePreset(Aura,{semantic:{primary:{50:'#f0fafb',100:'#dceff2',200:'#bedee5',300:'#94c6d2',400:'#62a7b8',500:'#35899f',600:'#28758a',700:'#256073',800:'#254f60',900:'#234452',950:'#142d38'},formField:{borderRadius:'12px'}}});
let runtime=null,serial=0;

const Tabs={setup(){
 const active=ref(0),items=[['view','视图 View'],['find','查找 Find'],['info','说明 Info']];
 function select(index){active.value=index;items.forEach(([id],i)=>{const panel=document.getElementById('panel-'+id);if(panel)panel.hidden=i!==index;});}
 return ()=>h('div',{class:'ws-tabs',role:'tablist','aria-label':'参数面板'},items.map(([id,label],index)=>h(Button,{label,class:'ws-tab',id:'tab-'+id,role:'tab',type:'button',text:true,
  'aria-controls':'panel-'+id,'aria-selected':String(active.value===index),tabindex:active.value===index?0:-1,
  onClick:()=>select(index),onKeydown:event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;select(next);document.getElementById('tab-'+items[next][0]).focus();}}
 })));
}};

// 静态Vue外壳的空槽交给已有D3页面填入；Vue不会重建或克隆图形节点。
const Shell={setup(){return ()=>h(Fragment,[
 h('header',{class:'ws-header'},[
  h('div',{class:'ws-brand'},[h('span',{class:'ws-mark'}),'Research Maps',h('small','人工智能教育 · OpenAlex 100篇样本')]),
  h('nav',{class:'ws-header-actions','aria-label':'辅助页面'},[
   h(Button,{as:'a',href:'openalex-demo.html',label:'OpenAlex合作演示',class:'ws-demo-button',text:true}),
   h(Button,{as:'a',href:'airline-demo.html',label:'航空捆绑演示',class:'ws-demo-button',text:true}),
   h('a',{class:'ws-link',href:'../docs/project-guide.html?v=20261021-releases18',target:'_blank',rel:'noopener noreferrer'},'工程说明 ↗')])]),
 h('div',{class:'ws-layout'},[
  h('aside',{class:'ws-sidebar'},[h(Tabs),h('div',{class:'ws-panels'},['view','find','info'].map((id,i)=>h('section',{class:'ws-panel',role:'tabpanel',id:'panel-'+id,'aria-labelledby':'tab-'+id,hidden:i!==0})))]),
  h('main',{class:'ws-output'},[
   h('div',{class:'ws-output-head'},[h('span',{class:'ws-caption',style:'margin:0'},'VISUALIZATION'),h('span',{class:'ws-output-label'},'OUTPUT')]),
   h('div',{class:'ws-viewport'}),h('div',{class:'ws-status','aria-live':'polite'}),
   h('details',{class:'ws-drawer'},[h('summary','选择详情与论文证据')])])])]);}};

function emitChange(element){element.dispatchEvent(new Event('change',{bubbles:true}));}
function forwardKey(element,event){element.dispatchEvent(new KeyboardEvent('keydown',{key:event.key,code:event.code,bubbles:true,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey}));}
const Control={props:['control'],setup(props){
 const instance=ref(null);
 return ()=>{
  const {element,state,uid}=props.control;
  const base={ref:instance,disabled:state.disabled,ariaLabel:state.label,'aria-label':state.label,'aria-describedby':element.getAttribute('aria-describedby')||undefined,title:state.title||undefined};
  const model={modelValue:state.value,'onUpdate:modelValue':value=>commitControl(element,value)};
  if(state.kind==='select')return h(WorkbenchSelect,{...base,...model,inputId:uid,options:state.options,optionLabel:'label',optionValue:'value',optionDisabled:'disabled',filter:state.options.length>12,emptyMessage:'暂无可用选项',emptyFilterMessage:'没有匹配项',filterPlaceholder:'搜索选项',appendTo:'self',class:'rm-select',pt:{overlay:{class:'rm-prime-overlay'},list:{class:'rm-prime-options'}}});
  if(state.kind==='button')return h(Button,{...base,type:'button',label:state.text,class:'rm-button',onClick:()=>element.click()});
  if(state.kind==='checkbox')return h(Checkbox,{...base,...model,inputId:uid,binary:true,class:'rm-checkbox'});
  if(state.kind==='range')return h(WorkbenchSlider,{...base,...model,id:uid,min:state.min??0,max:state.max??100,step:state.step,class:'rm-slider',
   'onUpdate:modelValue':value=>commitControl(element,value,{change:false}),onChange:()=>{if(!instance.value?.dragging)emitChange(element);},onSlideend:()=>emitChange(element)});
  if(state.kind==='number')return h(InputNumber,{...base,...model,inputId:uid,min:state.min,max:state.max,step:state.step,useGrouping:false,maxFractionDigits:8,showButtons:true,class:'rm-number',inputClass:'rm-number-input',
   'onUpdate:modelValue':value=>commitControl(element,value,{change:false}),onInput:event=>commitControl(element,event.value,{change:false}),onBlur:()=>emitChange(element),onKeydown:event=>forwardKey(element,event)});
  if(state.kind==='month')return h(DatePicker,{...base,inputId:uid,modelValue:parseMonth(state.value),'onUpdate:modelValue':value=>commitControl(element,formatMonth(value)),view:'month',dateFormat:'yy-mm',showIcon:true,minDate:parseMonth(element.min),maxDate:parseMonth(element.max),appendTo:'body',class:'rm-month',pt:{panel:{class:'rm-prime-calendar'}}});
  return h(InputText,{...base,...model,id:uid,type:element.type,placeholder:element.placeholder,class:'rm-text',
   'onUpdate:modelValue':value=>commitControl(element,value,{change:false}),onChange:()=>emitChange(element),onKeydown:event=>forwardKey(element,event)});
 };
}};

function findProperty(element,key){for(let proto=Object.getPrototypeOf(element);proto;proto=Object.getPrototypeOf(proto)){const descriptor=Object.getOwnPropertyDescriptor(proto,key);if(descriptor?.get&&descriptor?.set)return descriptor;}return null;}
function createRuntime(withShell){
 if(runtime)return runtime;
 const root=document.createElement('div');root.className='rm-vue-root';root.style.display='contents';document.body.append(root);
 const controls=shallowReactive([]),registry=new Map(),shell=withShell?h(Shell):null;
 const app=createApp({setup:()=>()=>h(Fragment,[shell,...controls.map(control=>h(Teleport,{to:control.mount,key:control.uid},h(Control,{control})))])});
 app.use(PrimeVue,{theme:{preset:theme,options:{darkModeSelector:false,cssLayer:false}},ripple:false,locale:{startsWith:'开头为',contains:'包含',notContains:'不包含',endsWith:'结尾为',equals:'等于',notEquals:'不等于',noFilter:'不过滤',choose:'选择',emptyMessage:'暂无数据',emptySearchMessage:'没有匹配项',emptySelectionMessage:'未选择',selectionMessage:'已选择 {0} 项',searchMessage:'{0} 个匹配项',monthNames:['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],monthNamesShort:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],dayNames:['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],dayNamesShort:['日','一','二','三','四','五','六'],dayNamesMin:['日','一','二','三','四','五','六'],today:'今天',clear:'清除'}});
 app.mount(root);document.body.dataset.uiEngine='vue-primevue';
 const observer=new MutationObserver(records=>{
  for(const [element,control] of registry){
   if(!element.isConnected||!control.mount.isConnected){disposeControl(control);continue;}
   if(records.some(record=>record.target===element||element.contains(record.target)))control.sync();
  }
  for(const record of records)if(record.type==='childList')for(const node of record.addedNodes)if(node.nodeType===1&&!node.closest('[data-rm-prime-host]'))scan(node);
 });
 const owner=runtime={app,root,controls,registry,observer,withShell,poll:null};
 // select是浏览器的命名属性对象，不覆写其value/selectedIndex；轻量轮询补齐无事件的旧代码赋值。
 owner.poll=setInterval(()=>{for(const [element,control] of registry)if(element.tagName==='SELECT'&&(element.value!==control.state.value||element.selectedIndex!==control.selectedIndex))control.sync();},80);
 // 动态生成的期刊Cell按钮、主题选项也在同一个Vue应用中管理。
 // 不监听SVG的每帧样式变化；属性监听只挂在原生参数控件上。
 observer.observe(document.body,{subtree:true,childList:true});
 window.addEventListener('pagehide',()=>{if(runtime!==owner)return;clearInterval(owner.poll);observer.disconnect();for(const control of [...registry.values()])disposeControl(control);app.unmount();root.remove();runtime=null;},{once:true});
 return owner;
}

function disposeControl(control){
 const owner=runtime;if(!owner)return;
 for(const [key,descriptor] of control.originalProperties){if(descriptor)Object.defineProperty(control.element,key,descriptor);else delete control.element[key];}
 control.element.removeEventListener('input',control.sync);control.element.removeEventListener('change',control.sync);
 control.element.classList.remove('rm-native-control');delete control.element.dataset.primevue;
 if(control.ariaHidden===null)control.element.removeAttribute('aria-hidden');else control.element.setAttribute('aria-hidden',control.ariaHidden);
 if(control.tabIndex===null)control.element.removeAttribute('tabindex');else control.element.setAttribute('tabindex',control.tabIndex);
 if(!control.wasInert)control.element.removeAttribute('inert');
 if(control.label){if(control.labelFor===null)control.label.removeAttribute('for');else control.label.setAttribute('for',control.labelFor);}
 const index=owner.controls.indexOf(control);if(index>=0)owner.controls.splice(index,1);owner.registry.delete(control.element);
 // Vue先卸载Teleport，再移除空宿主，避免遗留弹出层。
 nextTick(()=>control.mount.remove());
}
function upgrade(element){
 const owner=runtime;if(!owner||owner.registry.has(element)||!kindOf(element)||element.closest('[data-rm-prime-host],.ws-tabs,.ws-header'))return;
 if(element.dataset.primevue!==undefined||element.closest('[data-pc-name],.rm-prime-overlay,.rm-prime-calendar'))return;
 const uid=(element.id||'control')+'--prime-'+(++serial),mount=document.createElement('span');mount.dataset.rmPrimeHost='';mount.className='rm-prime-host rm-kind-'+kindOf(element);element.after(mount);
 const control={element,mount,uid,state:reactive(readControl(element)),originalProperties:[],ariaHidden:element.getAttribute('aria-hidden'),tabIndex:element.getAttribute('tabindex'),wasInert:element.hasAttribute('inert'),label:null};
 let signature=JSON.stringify(control.state);
 control.sync=()=>{const next=readControl(element),nextSignature=JSON.stringify(next);if(nextSignature!==signature){signature=nextSignature;Object.assign(control.state,next);}mount.hidden=next.hidden;control.selectedIndex=element.selectedIndex;};
 owner.registry.set(element,control);owner.controls.push(control);element.dataset.primevue='';element.classList.add('rm-native-control');element.tabIndex=-1;element.setAttribute('aria-hidden','true');
 // 原始控件仅作数据/事件接口；aria-hidden与tabindex不能阻止label或脚本聚焦。
 element.setAttribute('inert','');
 for(const key of element.tagName==='SELECT'?[]:['value','checked']){const inherited=findProperty(element,key);if(!inherited)continue;const original=Object.getOwnPropertyDescriptor(element,key);if(original&&!original.configurable)continue;
  control.originalProperties.push([key,original]);Object.defineProperty(element,key,{configurable:true,get(){return inherited.get.call(this);},set(value){inherited.set.call(this,value);control.sync();}});
 }
 element.addEventListener('input',control.sync);element.addEventListener('change',control.sync);
 owner.observer.observe(element,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','selected','label','value','min','max','step','style','title','aria-label','aria-describedby']});
 // Select也必须解除label与隐藏原生控件的默认关联，否则点击可见选项后
 // label会再次激活隐藏select，并将页面卷到它的绝对定位位置。
 if(['select','range','checkbox','number','text','month'].includes(control.state.kind)){
  const label=element.labels?.[0]||element.closest('label');if(label){control.label=label;control.labelFor=label.getAttribute('for');label.htmlFor=uid;}
 }
 control.sync();
}
function scan(root){
 if(!runtime||root.closest?.('[data-rm-prime-host],[data-pc-name],.rm-prime-overlay,.rm-prime-calendar'))return;
 if(root.matches?.('select,input,button'))upgrade(root);
 root.querySelectorAll?.('select,input,button').forEach(upgrade);
}
export function mountWorkbench(body=document.body){
 const owner=createRuntime(true);return {header:owner.root.querySelector('.ws-header'),layout:owner.root.querySelector('.ws-layout')};
}
export function upgradeControls(){createRuntime(false);scan(document.body);}
export function ready(){return nextTick();}
export function syncControls(){for(const control of runtime?.registry.values()||[])control.sync();}
export function inspect(){return {versions,controls:runtime?.registry.size||0,shell:!!runtime?.withShell};}
