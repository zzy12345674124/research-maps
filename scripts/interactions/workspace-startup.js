/* 功能：页面解析早期显示统一加载状态，工作台全部组装后才展示；保持隐藏元素布局可测量。 */
(function(){
 const root=document.documentElement;let finished=false;
 function fail(reason){
  if(finished||root.dataset.workspaceState==='error')return;
  clearTimeout(timer);root.dataset.workspaceState='error';
  const show=()=>{
   const box=document.getElementById('workspace-startup');if(!box)return;
   box.setAttribute('role','alert');box.querySelector('strong').textContent='工作台加载未完成';
   box.querySelector('p').textContent=String(reason||'加载遇到问题，请刷新重试。');
   const retry=box.querySelector('button');retry.hidden=false;retry.onclick=()=>location.reload();
  };
  if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
 }
 function onError(event){
  if(event.message)fail(event.message);
  else if(event.target?.tagName==='SCRIPT')fail('图形资源读取失败，请刷新后重试。');
 }
 function onRejection(event){fail(event.reason?.message||'图形初始化失败，请刷新重试。');}
 const timer=setTimeout(()=>fail('加载时间较长。请确认本机服务仍在运行，再刷新重试。'),45000);
 window.addEventListener('error',onError,true);window.addEventListener('unhandledrejection',onRejection);
 window.WorkspaceStartup={fail,ready(){
  if(root.dataset.workspaceState==='error')return;
  finished=true;clearTimeout(timer);
  window.removeEventListener('error',onError,true);window.removeEventListener('unhandledrejection',onRejection);
  root.dataset.workspaceState='ready';document.getElementById('workspace-startup')?.remove();
 }};
})();
