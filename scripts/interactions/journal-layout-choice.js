/* 布局类别采用独立加载，保留数据集参数及公共双缓冲导航。 */
(function(){
 const select=document.getElementById('journal-layout-choice');if(!select)return;
 select.value=new URLSearchParams(location.search).get('layout')==='classic'?'classic':'semantic';
 select.addEventListener('change',()=>{
  const url=new URL(location.href);url.searchParams.set('layout',select.value);
  if(window.WorkspaceNavigation)window.WorkspaceNavigation.navigate(url.href);else location.href=url.href;
 });
})();
