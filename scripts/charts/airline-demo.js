/* 功能：使用上游airlines公开样例验证同一捆绑接入；复制数据，不修改原JSON/XML，位置转换参照原示例。 */
(function(){
 const data=airlineData,nodes=data.nodes.map(n=>({...n})),edges=data.edges.map(e=>({...e}));
 const x=d3.scaleLinear().domain(d3.extent(nodes,n=>Math.abs(n.x))).range([1000,50]);
 const y=d3.scaleLinear().domain(d3.extent(nodes,n=>Math.abs(n.y))).range([560,50]);
 nodes.forEach(n=>{n.x=x(Math.abs(n.x));n.y=y(Math.abs(n.y));n.homeX=n.x;n.homeY=n.y;});
 const byId=new Map(nodes.map(n=>[n.name,n]));
 const svg=d3.select('#airline-chart'),graph=svg.append('g'),lineLayer=graph.append('g'),nodeLayer=graph.append('g'),labelLayer=graph.append('g');
 const view=EdgeRendering.create(lineLayer,()=>nodes,()=>edges,{maximumEdges:2500,maximumMs:60000,description:'航空数据未提供频次权重，所有航线等权；用固定明暗比较普通与捆绑路线。'});
 // 功能：上游示例没有关系次数，全部等权；使用原示例的红线、深底、黄色机场以便比较。
 const lines=lineLayer.selectAll('path').data(edges).join('path').attr('fill','none').attr('stroke','#ff2222').attr('stroke-width',1).attr('opacity',0.115).style('cursor','pointer');
 lines.append('title').text(e=>`${byId.get(e.source).label} — ${byId.get(e.target).label}`);
 const dots=nodeLayer.selectAll('circle').data(nodes).join('circle').attr('r',2.5).attr('fill','#ffee00').style('cursor','pointer');
 dots.append('title').text(n=>n.tooltip);
 const labels=labelLayer.selectAll('text').data(nodes).join('text').attr('class','airport-label').text(n=>n.label).style('display','none');
 view.bind(lines);
 function update(){view.update();dots.attr('cx',n=>n.x).attr('cy',n=>n.y);labels.attr('x',n=>n.x+4).attr('y',n=>n.y-4);}
 const zoom=d3.zoom().scaleExtent([0.25,8]).clickDistance(5).on('zoom',event=>graph.attr('transform',event.transform));svg.call(zoom);
 function clear(){lines.attr('opacity',0.115);dots.attr('opacity',1);d3.select('#airline-selection').text('所有航线等权；普通/捆绑只改变路线，不改变节点位置和连接端点。');}
 dots.on('click',(event,node)=>{
  event.stopPropagation();const related=e=>e.source===node.name||e.target===node.name;
  const matches=edges.filter(related),neighbors=new Set([node.name,...matches.flatMap(e=>[e.source,e.target])]);
  lines.attr('opacity',e=>related(e)?0.85:0.018);dots.attr('opacity',n=>neighbors.has(n.name)?1:0.2);
  d3.select('#airline-selection').text(`${node.label}：该数据中连接${matches.length}条航线；捆绑不会增加或删除连接。`);
 });
 lines.on('click',(event,edge)=>{event.stopPropagation();lines.attr('opacity',e=>e===edge?1:0.025);d3.select('#airline-selection').text(`${byId.get(edge.source).label} — ${byId.get(edge.target).label}；航线编号${edge.id}。`);});
 dots.call(d3.drag().container(graph.node()).on('drag',(event,n)=>{NodeCollision.move(nodes,n,event.x,event.y,()=>2.5,{gap:1});update();}).on('end',update));
 svg.on('click',clear);d3.select('#airline-clear').on('click',clear);
 d3.select('#airline-reset').on('click',()=>{nodes.forEach(n=>{n.x=n.homeX;n.y=n.homeY;});update();svg.call(zoom.transform,d3.zoomIdentity);clear();});
 d3.select('#airline-labels').on('change',function(){labels.style('display',this.checked?null:'none');});
 d3.select('#airline-stats').text(`${nodes.length}个机场 · ${edges.length}条航线 · 数据与算法均来自d3.ForceBundle项目，本地加载。`);
 update();
})();
