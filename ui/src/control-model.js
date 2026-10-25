// 原生控件是现有D3模块的接口；Vue状态从接口读取，用户操作写回并派发原事件。
export function kindOf(element){
 if(element.tagName==='SELECT')return 'select';
 if(element.tagName==='BUTTON')return 'button';
 if(element.tagName!=='INPUT')return null;
 return ({number:'number',range:'range',checkbox:'checkbox',month:'month',text:'text',search:'text'})[element.type]||null;
}
export function labelOf(element){
 if(element.getAttribute('aria-label'))return element.getAttribute('aria-label');
 const label=element.labels?.[0]||element.closest('label');
 const text=label?[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim():'';
 return text||element.title||element.id||'参数';
}
function numberAttribute(element,key){const value=element.getAttribute(key);return value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value):undefined;}
export function readControl(element){
 const kind=kindOf(element),raw=element.value;
 return {kind,value:kind==='checkbox'?element.checked:['number','range'].includes(kind)?(raw===''?null:Number(raw)):raw,
  disabled:element.disabled,hidden:element.hidden||element.style.display==='none',label:labelOf(element),title:element.title||'',
  text:kind==='button'?element.textContent.trim():'',min:numberAttribute(element,'min'),max:numberAttribute(element,'max'),step:numberAttribute(element,'step')||1,
  options:kind==='select'?[...element.options].filter(o=>!o.hidden&&!o.parentElement?.hidden).map(o=>({label:o.label||o.textContent,value:o.value,disabled:o.disabled||!!o.closest('optgroup')?.disabled})):[]};
}
export function commitControl(element,value,{change=true}={}){
 if(element.disabled)return;
 if(kindOf(element)==='checkbox')element.checked=!!value;
 else element.value=value==null?'':String(value);
 const Event=element.ownerDocument.defaultView.Event;
 element.dispatchEvent(new Event('input',{bubbles:true}));
 if(change)element.dispatchEvent(new Event('change',{bubbles:true}));
}
export function parseMonth(value){if(!/^\d{4}-\d{2}$/.test(value||''))return null;const [y,m]=value.split('-').map(Number);return new Date(y,m-1,1);}
export function formatMonth(value){return value instanceof Date&&!Number.isNaN(+value)?`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`:'';}
