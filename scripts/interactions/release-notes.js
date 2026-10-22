/* 功能：读取独立版本记录，安全创建摘要卡和可折叠时间线；不把日志数据插入HTML。 */
(function(){
 const content=document.getElementById('release-content');
 const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
 const formatDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)?date.replaceAll('-','.'):'日期未记录';
 async function load(){
  try{
   const response=await fetch('changelog.json',{cache:'no-store'});if(!response.ok)throw Error('版本记录读取失败');
   const data=await response.json(),versions=data.versions;
   if(!Array.isArray(versions))throw Error('版本记录格式不正确');
   content.replaceChildren();
   if(!versions.length){content.append(element('div','empty','还没有版本记录。'));return;}
   const grid=element('section','summary-grid');grid.setAttribute('aria-label','版本摘要');
   const total=versions.reduce((sum,item)=>sum+(item.changes||[]).length,0);
   [[versions[0].version,'当前版本',formatDate(versions[0].date),'current'],[versions.length,'版本记录','次阶段更新',''],[total,'累计变更','项新增、优化与修复','']].forEach(([value,label,note,kind])=>{
    const card=element('div','stat-card '+kind);card.append(element('small','',label),element('strong','',value),element('span','',note));grid.append(card);
   });
   const section=element('section','timeline-section'),heading=element('div','section-heading'),intro=element('div');intro.append(element('h2','','版本时间线'),element('p','','从最新版本向下排列，展开查看完整变更。'));heading.append(element('span','section-number','01'),intro);section.append(heading);
   const timeline=element('div','timeline');
   versions.forEach((item,index)=>{
    const changes=item.changes||[],article=element('article','release-card'+(index===0?' is-latest':'')),body=element('div','release-body'),header=element('header','release-header'),row=element('div','version-row');
    article.append(element('span','release-dot'));row.append(element('span','version',item.version));if(index===0)row.append(element('span','latest-badge','当前版本'));
    const date=element('time','',formatDate(item.date));date.dateTime=item.date;header.append(row,date);
    body.append(header,element('h3','',item.title),element('p','release-summary',item.summary),element('div','release-meta',`${changes.length} 项变更 · ${index===0?'最新更新':'历史版本'}`));
    const details=element('details','release-detail'),summary=element('summary','','查看完整变更'),list=element('ul','changes');
    changes.forEach(change=>{const type=change.type||'更新',li=element('li'),badge=element('span','change-type'+(type==='修复'?' fix':type==='说明'?' note':''),type);li.append(badge,element('p','change-text',change.text));list.append(li);});
    details.append(summary,list);details.addEventListener('toggle',()=>{summary.textContent=details.open?'收起完整变更':'查看完整变更';});body.append(details);article.append(body);timeline.append(article);
   });
   section.append(timeline);content.append(grid,section);
   document.getElementById('history-note').textContent=data.history_note||'';
  }catch(error){content.replaceChildren(element('div','error',error.message+'，请刷新后重试。'));}
 }
 // 功能：按需显示使用说明，继续明确UTF-8解码，避免Markdown乱码再次出现。
 let usageLoaded=false;
 document.getElementById('usage').addEventListener('toggle',async function(){
  if(!this.open||usageLoaded)return;const box=document.getElementById('usage-content');
  try{const response=await fetch('../README.md',{cache:'no-store'});if(!response.ok)throw Error('使用说明读取失败');box.textContent=new TextDecoder('utf-8',{fatal:true}).decode(await response.arrayBuffer());usageLoaded=true;}catch(error){box.textContent=error.message;}
 });
 load();
})();
