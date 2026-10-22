// 功能：校验年月输入并转换为整数月序号；只做索引，不使用时区换算。
function monthIndex(value) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return null;
  const [year,month]=value.split('-').map(Number);return year*12+month-1;
}
// 功能：按首尾月份（均包含）筛选论文，保留原始year，并新增统计周期索引。
// 1月1日仅标记为精度待核实，不自动判定为错误；排除由用户勾选。
function selectTimelinePeriod(papers,dates,start,end,granularity,excludeJanuaryFirst) {
  const from=monthIndex(start),to=monthIndex(end);
  if(from===null||to===null||from>to)throw Error('请选择有效的起止月份，开始月份不能晚于结束月份。');
  if(!['year','month'].includes(granularity))throw Error('时间粒度无效。');
  let missing=0,suspect=0,excluded=0;
  const selected=[];
  papers.forEach(paper=>{
    const date=dates[paper.id];
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)){missing++;return;}
    const month=monthIndex(date.slice(0,7));
    const [yy,mm,dd]=date.split('-').map(Number),valid=new Date(Date.UTC(yy,mm-1,dd));
    if(month===null||valid.getUTCFullYear()!==yy||valid.getUTCMonth()!==mm-1||valid.getUTCDate()!==dd){missing++;return;}
    if(month<from||month>to)return;
    const uncertain=date.slice(5)==='01-01';if(uncertain)suspect++;
    if(uncertain&&excludeJanuaryFirst){excluded++;return;}
    selected.push({...paper,publicationDate:date,dateNeedsReview:uncertain,
      periodIndex:granularity==='month'?month:yy});
  });
  const first=granularity==='month'?from:Math.floor(from/12),last=granularity==='month'?to:Math.floor(to/12);
  return {papers:selected,start:first,end:last,missing,suspect,excluded};
}
