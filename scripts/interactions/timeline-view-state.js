// 同一标签页、同一数据集保留显示选项；不保存论文、模型或自动触发训练。
(function(){
 const ids=['timeline-implementation','fil-variant','mode','paper-row-type'];
 const key='research-maps-timeline-view-v1:'+(window.DatasetInfo?.id||'legacy100');
 try{
  const saved=JSON.parse(sessionStorage.getItem(key)||'{}');
  for(const id of ids){const element=document.getElementById(id);if(element&&[...element.options].some(o=>o.value===saved[id]))element.value=saved[id];}
 }catch{}
 function save(){
  const state={};for(const id of ids){const element=document.getElementById(id);if(element)state[id]=element.value;}
  try{sessionStorage.setItem(key,JSON.stringify(state));}catch{}
 }
 document.addEventListener('change',event=>{if(ids.includes(event.target.id))save();});
 window.addEventListener('pagehide',save,{once:true});
})();
