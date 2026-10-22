/* 功能：真实机构合作与地理位置的独立演示，复用生产捆绑/标签模块，不替换教学数据。 */
function filterOpenAlexDemo(data, minimum) {
  const links = data.edges.filter(edge => edge.weight >= minimum).map(edge => ({...edge}));
  const names = new Set(links.flatMap(edge => [edge.source, edge.target]));
  return {nodes: data.nodes.filter(node => names.has(node.name)).map(node => ({...node})), links};
}

// 功能：力导向只修改展示节点；D3使用边副本，证据与捆绑仍使用字符串端点原边。
function layoutOpenAlexDemo(nodes, links, mode, project, radius) {
  nodes.forEach(node=>{
    delete node.fx;delete node.fy;delete node.vx;delete node.vy;
    if(mode==='geographic')[node.x,node.y]=project([node.longitude,node.latitude]);
    else {delete node.x;delete node.y;}
  });
  if(mode==='geographic'||!nodes.length)return;
  const strength=edge=>Math.min(0.45,0.12+Math.log1p(edge.weight)*0.06);
  const simulation=d3.forceSimulation(nodes).stop()
    .force('link',d3.forceLink(links.map(edge=>({...edge}))).id(node=>node.name)
      .distance(edge=>145/Math.sqrt(Math.max(1,edge.weight))).strength(strength))
    .force('charge',d3.forceManyBody().strength(-310))
    .force('center',d3.forceCenter(600,325))
    .force('collision',d3.forceCollide().radius(node=>radius(node.count)+12));
  // 先收敛再一次性更新路径，避免捆绑计算与持续运动反复竞争。
  simulation.tick(360);
}

const demoData = openAlexDemo;
const svg = d3.select('#network'), graph = svg.append('g');
const geography = graph.append('g').attr('pointer-events', 'none');
const projection = d3.geoEquirectangular().fitExtent([[45,45],[1155,605]], {type:'Sphere'});
const geoPath = d3.geoPath(projection);
geography.append('path').datum({type:'Sphere'}).attr('d',geoPath)
  .attr('fill','none').attr('stroke','#b7ceda').attr('opacity',0.5);
geography.append('path').datum(d3.geoGraticule10()).attr('d',geoPath)
  .attr('fill','none').attr('stroke','#b7ceda').attr('stroke-width',0.65).attr('opacity',0.35);
const lineLayer = graph.append('g'), nodeLayer = graph.append('g'), labelLayer = graph.append('g');
let nodes = [], links = [], lines, circles, labels, selectedName = null, opacity = () => 0.2;
const countries = [...new Set(demoData.nodes.map(node => node.country || '未知'))].sort();
const colors = d3.scaleOrdinal().domain(countries)
  .range(d3.quantize(t => d3.interpolateRainbow(0.03+t*0.94),countries.length));
const size = d3.scaleSqrt().domain([1,d3.max(demoData.nodes,d => d.count)||1]).range([3,10]);
const paperById = new Map(demoData.papers.map(paper => [paper.id,paper]));
const edgeView = EdgeRendering.create(lineLayer,()=>nodes,()=>links,{
  description:'机构合作：共同论文越多，连线越清晰。切换捆绑只改变路线，保留原连接和当前布局端点。'
});

function updateDemoLabels() {
  if (!labels) return;
  LabelLayout.schedule(labels,{
    all:d3.select('#show-all-labels').property('checked'),
    priority:node => (node.name===selectedName?1e9:0)+node.count
  });
}
const zoom = d3.zoom().scaleExtent([0.5,16]).clickDistance(5).on('zoom',event=>{
  graph.attr('transform',event.transform);updateDemoLabels();
});
svg.call(zoom).on('dblclick.zoom',null);
LabelLayout.observe(svg.node(),updateDemoLabels);

function showDemoEvidence(title, ids) {
  const panel=d3.select('#evidence');panel.selectAll('*').remove();
  panel.append('strong').text(title);
  const list=panel.append('ul');
  [...new Set(ids)].forEach(id=>{
    const paper=paperById.get(id);if(!paper)return;
    list.append('li').append('a').attr('href',paper.id).attr('target','_blank').attr('rel','noopener noreferrer')
      .text(`${paper.publication_year} · ${paper.title}`);
  });
}
function clearDemoSelection() {
  selectedName=null;
  if(circles)circles.attr('opacity',1).attr('stroke','white').attr('stroke-width',1);
  if(labels)labels.attr('opacity',1);
  if(lines)lines.attr('opacity',edge=>opacity(edge));
  d3.select('#evidence').selectAll('*').remove();
  d3.select('#selection').text('点击机构或连线查看对应论文；地理布局看位置，力导向布局看合作结构。');
  updateDemoLabels();
}
function updateDemoPositions() {
  edgeView.update();
  circles.attr('cx',node=>node.x).attr('cy',node=>node.y);
  labels.attr('x',node=>node.x+size(node.count)+4).attr('y',node=>node.y+4);
  updateDemoLabels();
}
// 功能：全图视角随当前布局范围计算；地理布局保持原有投影视角。
function fitDemoGraph() {
  if(!nodes.length||d3.select('#demo-layout-mode').property('value')==='geographic'){
    svg.call(zoom.transform,d3.zoomIdentity);return;
  }
  const x0=d3.min(nodes,n=>n.x)-70,x1=d3.max(nodes,n=>n.x)+120;
  const y0=d3.min(nodes,n=>n.y)-40,y1=d3.max(nodes,n=>n.y)+40;
  const scale=Math.min(1100/Math.max(1,x1-x0),550/Math.max(1,y1-y0),1.5);
  svg.call(zoom.transform,d3.zoomIdentity.translate(600-scale*(x0+x1)/2,325-scale*(y0+y1)/2).scale(scale));
}
function applyDemoLayout() {
  const mode=d3.select('#demo-layout-mode').property('value');
  layoutOpenAlexDemo(nodes,links,mode,projection,size);
  geography.style('display',mode==='geographic'?null:'none');
  d3.select('#demo-relayout').property('hidden',mode!=='force');
  d3.select('#network').attr('aria-label',mode==='force'?'OpenAlex机构合作力导向网络':'OpenAlex机构合作地理网络');
  d3.select('#message').text(mode==='force'
    ?'力导向布局：按合作关系排列，位置不再代表地理；拖动后可重新计算布局。'
    :'地理布局：按机构经纬度定位；同城节点可能重合，可放大或拖动查看。');
  updateDemoPositions();fitDemoGraph();
}
function selectDemoNode(node) {
  selectedName=node.name;
  const connected=edge=>edge.source===node.name||edge.target===node.name;
  const neighbors=new Set([node.name]);
  links.filter(connected).forEach(edge=>{neighbors.add(edge.source);neighbors.add(edge.target);});
  circles.attr('opacity',item=>neighbors.has(item.name)?1:0.15)
    .attr('stroke',item=>item.name===node.name?'#244c69':'white')
    .attr('stroke-width',item=>item.name===node.name?2.5:1);
  labels.attr('opacity',item=>neighbors.has(item.name)?1:0.15);
  lines.attr('opacity',edge=>opacity(edge,connected(edge)?'focus':'dim'));
  d3.select('#selection').text(`${node.label} · ${node.country||'国家未知'} · ${node.count}篇纳入样本论文 · 当前合作机构${neighbors.size-1}个。`);
  showDemoEvidence(`${node.label}署名的样本论文`,node.paperIds);updateDemoLabels();
}
function renderOpenAlexDemo() {
  const minimum=Number(d3.select('#demo-edge-min').property('value'));
  if(!Number.isInteger(minimum)||minimum<1){d3.select('#message').text('最少共同论文需为正整数。');return;}
  const filtered=filterOpenAlexDemo(demoData,minimum);
  nodes=filtered.nodes;links=filtered.links;opacity=EdgeRendering.opacityScale(links);
  lines=lineLayer.selectAll('path').data(links).join('path').attr('fill','none')
    .attr('stroke','#5c819c').attr('stroke-width',edge=>0.65+Math.sqrt(edge.weight)*0.6)
    .style('cursor','pointer');
  edgeView.bind(lines);
  lines.selectAll('title').remove();
  const byId=new Map(nodes.map(node=>[node.name,node]));
  lines.append('title').text(edge=>`${byId.get(edge.source).label} — ${byId.get(edge.target).label}：共同${edge.weight}篇样本论文`);
  lines.on('click',(event,edge)=>{
    event.stopPropagation();clearDemoSelection();
    lines.attr('opacity',item=>opacity(item,item===edge?'focus':'dim'));
    showDemoEvidence(`${byId.get(edge.source).label} — ${byId.get(edge.target).label}：共同${edge.weight}篇`,edge.paperIds);
  });
  circles=nodeLayer.selectAll('circle').data(nodes,node=>node.name).join('circle')
    .attr('r',node=>size(node.count)).attr('fill',node=>colors(node.country||'未知')).style('cursor','pointer');
  circles.selectAll('title').remove();
  circles.append('title').text(node=>`${node.label}\n${node.country||'国家未知'} · ${node.city||'城市未知'} · ${node.count}篇\n经纬度 ${node.longitude}, ${node.latitude}`);
  circles.on('click',(event,node)=>{event.stopPropagation();selectDemoNode(node);});
  circles.call(d3.drag().container(graph.node()).on('drag',(event,node)=>{
    node.x=event.x;node.y=event.y;updateDemoPositions();
  }).on('end',()=>{
    updateDemoPositions();d3.select('#message').text(d3.select('#demo-layout-mode').property('value')==='force'
      ?'节点已手动调整，线束将按新位置更新；可点击“重新计算布局”恢复力导向排列。'
      :'机构位置已手动调整，当前不再严格代表经纬度；可点击“恢复地理位置”。');
  }));
  labels=labelLayer.selectAll('text').data(nodes,node=>node.name).join('text')
    .attr('font-size',12).attr('fill','#304b60').attr('stroke','white').attr('stroke-width',3)
    .attr('paint-order','stroke').attr('pointer-events','none').text(node=>LabelLayout.truncate(node.label,5));
  const metadata=demoData.metadata;
  d3.select('#summary').text(`OpenAlex ${metadata.sample_size}篇检索样本 · 纳入${metadata.included_papers}篇 · 当前${nodes.length}机构 / ${new Set(nodes.map(node=>node.country).filter(Boolean)).size}国家 · ${links.length}条合作关系`);
  d3.select('#empty').style('display',nodes.length?'none':'block');
  clearDemoSelection();applyDemoLayout();
}
svg.on('click',clearDemoSelection);
d3.select('#demo-apply').on('click',renderOpenAlexDemo);
d3.select('#reset-view').on('click',fitDemoGraph);
d3.select('#demo-layout-mode').on('change',applyDemoLayout);
d3.select('#demo-relayout').on('click',applyDemoLayout);
d3.select('#demo-restore').on('click',()=>{
  d3.select('#demo-layout-mode').property('value','geographic');applyDemoLayout();
  d3.select('#message').text('已恢复OpenAlex经纬度对应的地理位置。');
});
d3.select('#show-all-labels').on('change',updateDemoLabels);
renderOpenAlexDemo();
