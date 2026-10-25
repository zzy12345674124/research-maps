// 功能：timeline图形计算、绘制及交互；数据由bootstrap就绪后注入。

    // 功能：按periodIndex统计每个关键词在所选年或月对应的论文，缺失年份不进入时间轴；每篇每词只计一次。
    function buildTimeline(papers) {
      const keywords = new Map();
      papers.forEach(paper => {
        if (!Number.isInteger(paper.periodIndex)) return;
        new Set(paper.keywords).forEach(name => {
          if (!keywords.has(name)) keywords.set(name, { name, count: 0, years: new Map() });
          const item = keywords.get(name);
          item.count += 1;
          if (!item.years.has(paper.periodIndex)) item.years.set(paper.periodIndex, []);
          item.years.get(paper.periodIndex).push(paper);
        });
      });
      return [...keywords.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    // 功能：从保留关键词构建加权共现关系，贪心合并能提高模块度的群组。
    // 每词初始单独一组；增益=组间权重/m - 两组度数乘积/(2*m*m)。
    // 这是探索性自动分组，不等同于CiteSpace的聚类标签或布局算法。
    function buildClusterTimeline(papers, minimum) {
      // 功能：模块度暂停时统一使用论文主主题；后面的历史模块度算法保留但不执行。
      if (!AnalysisFeatures.modularity) return TopicStore.rows(papers,minimum,TopicStore.read(topicCorpus),openAlexPapers);
      const retained = buildTimeline(papers).filter(d => d.count >= minimum);
      const names = new Set(retained.map(d => d.name));
      const edges = new Map();
      papers.forEach(paper => {
        if (!Number.isInteger(paper.periodIndex)) return;
        const words = [...new Set(paper.keywords)].filter(d => names.has(d)).sort();
        for (let i=0; i<words.length; i++) for (let j=i+1; j<words.length; j++) {
          const key = JSON.stringify([words[i], words[j]]);
          edges.set(key, (edges.get(key) || 0) + 1);
        }
      });
      const degree = new Map(retained.map(d => [d.name, 0]));
      let m = 0;
      edges.forEach((weight, key) => {
        const [a,b] = JSON.parse(key); m += weight;
        degree.set(a, degree.get(a)+weight); degree.set(b, degree.get(b)+weight);
      });
      const groups = retained.map(d => ({ members:[d.name], degree:degree.get(d.name) }));
      while (m > 0) {
        let best = 1e-10, pair = null;
        for (let i=0; i<groups.length; i++) for (let j=i+1; j<groups.length; j++) {
          let between = 0;
          groups[i].members.forEach(a => groups[j].members.forEach(b => {
            between += edges.get(JSON.stringify([a,b].sort())) || 0;
          }));
          const gain = between/m - groups[i].degree*groups[j].degree/(2*m*m);
          if (gain > best) { best=gain; pair=[i,j]; }
        }
        if (!pair) break;
        const [i,j] = pair;
        groups[i].members.push(...groups[j].members);
        groups[i].degree += groups[j].degree;
        groups.splice(j,1);
      }
      // 功能：每个群组每年以论文ID去重，输出与关键词时间线相同的行结构。
      const counts = new Map(retained.map(d => [d.name,d.count]));
      return groups.map(group => {
        group.members.sort((a,b) => counts.get(b)-counts.get(a) || a.localeCompare(b));
        const members = new Set(group.members), years = new Map(), all = new Set();
        papers.forEach(paper => {
          if (!Number.isInteger(paper.periodIndex) || !paper.keywords.some(k => members.has(k))) return;
          if (!years.has(paper.periodIndex)) years.set(paper.periodIndex, new Map());
          years.get(paper.periodIndex).set(paper.id,paper); all.add(paper.id);
        });
        return {name:group.members[0], members:group.members, count:all.size,
          years:new Map([...years].map(([year,items]) => [year,[...items.values()]]))};
      }).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name))
        .map((row,i) => ({...row,name:`G${i+1}: ${row.name}`}));
    }

    // 功能：每次更新仅重建时间线的筛选副本，不改变100篇原始样本或其他图形。
    let activePapers=[],rows=[],periodStart=2020,periodEnd=2026,granularity='month',periodNote='';
    const availableMonths=Object.values(publicationDates).filter(Boolean).map(date=>date.slice(0,7)).sort();
    const firstMonth=availableMonths[0]||'2020-01',lastMonth=availableMonths.at(-1)||'2026-12';
    d3.select('#start-month').property('value',firstMonth);
    d3.select('#end-month').property('value',lastMonth);
    function formatPeriod(index){
      return granularity==='month'?`${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`:String(index);
    }
    // 功能：跨度较大时抽稀轴标签，但节点仍按每月精确定位。
    function timeTicks(){
      const step=Math.max(1,Math.ceil((periodEnd-periodStart)/9));
      return [...new Set([...d3.range(periodStart,periodEnd+1,step),periodEnd])];
    }
    function timeDomain(){return periodStart===periodEnd?[periodStart-0.5,periodEnd+0.5]:[periodStart,periodEnd];}
    function swarmOptions(x,options){
      if(window.DatasetInfo?.source!=='arXiv')return options;
      const periodWidth=Math.abs(x(periodStart+1)-x(periodStart));
      return {...options,spreadX:Math.min(30,periodWidth*.42),xMin:365,xMax:1030};
    }
    function paperDate(paper){return `${paper.publicationDate}${paper.dateNeedsReview?'（日期精度待核实）':''}`;}

    const svg = d3.select("#timeline");
    // 功能：四种时间线共用视图缩放；只变换画布，不重算日期、主题或关系。
    let timelineLayer;
    let timelineSelectedLabel=null;
    function updateTimelineLabels(){
      if(!timelineLayer)return;
      LabelLayout.schedule(timelineLayer.selectAll('.timeline-label'),{
        priority:d=>LabelLayout.weightPriority(d?.count??d?.papers?.length,d?.name===timelineSelectedLabel)
      });
      LabelLayout.schedule(timelineLayer.selectAll('.paper-title-label'),{
        priority:d=>LabelLayout.weightPriority(d.labelWeight,d.paper.id===timelineSelectedLabel)
      });
    }
    LabelLayout.observe(svg.node(),updateTimelineLabels);
    const timelineZoom=d3.zoom().scaleExtent([0.25,8]).clickDistance(5)
      .on('zoom',event=>{
        if(timelineLayer)timelineLayer.attr('transform',event.transform);
        updateTimelineLabels();
        d3.select('#timeline-zoom-level').text(`${Math.round(event.transform.k*100)}%`);
      });
    svg.call(timelineZoom).on('dblclick.zoom',null);
    window.WorkspaceZoom={scaleBy:factor=>svg.call(timelineZoom.scaleBy,factor)};
    // 功能：重绘时清理旧画布与变换，避免切换模式后内容留在视野之外。
    function beginTimeline(height){
      globalThis.TimelineExperimentalBeeswarm?.stop();
      globalThis.TimelineCountBeeswarm?.stop();
      globalThis.TimelineCountBeeswarm?.stop();
      svg.interrupt().attr('height',height).selectAll('*').remove();
      timelineSelectedLabel=null;
      timelineLayer=svg.append('g').attr('class','timeline-viewport');
      requestAnimationFrame(updateTimelineLabels);
      svg.call(timelineZoom.transform,d3.zoomIdentity);
    }
    d3.select('#timeline-zoom-in').on('click',()=>svg.call(timelineZoom.scaleBy,1.25));
    d3.select('#timeline-zoom-out').on('click',()=>svg.call(timelineZoom.scaleBy,0.8));
    d3.select('#timeline-reset-view').on('click',()=>svg.call(timelineZoom.transform,d3.zoomIdentity));



    // 功能：为弧线模式准备关键词节点和真实共现边，不用年度汇总圆代替关键词。
    function buildRelationData(papers, minimum, top, edgeMinimum) {
      const groups = buildClusterTimeline(papers, minimum).slice(0, top);
      const wordRows = new Map(buildTimeline(papers).map(row => [row.name,row]));
      const nodes = groups.flatMap(group => group.members.filter(name=>wordRows.has(name)).map(name => {
        const row=wordRows.get(name);
        return {name, group:group.name, count:row.count,
          firstYear:Math.min(...row.years.keys()), papers:[...row.years.values()].flat()};
      }));
      const names=new Set(nodes.map(d=>d.name)), pairs=new Map();
      papers.forEach(paper => {
        if (!Number.isInteger(paper.periodIndex)) return;
        const words=[...new Set(paper.keywords)].filter(name=>names.has(name)).sort();
        for(let i=0;i<words.length;i++) for(let j=i+1;j<words.length;j++) {
          const key=JSON.stringify([words[i],words[j]]);
          if(!pairs.has(key)) pairs.set(key,{source:words[i],target:words[j],weight:0,papers:[]});
          const pair=pairs.get(key); pair.weight++; pair.papers.push(paper);
        }
      });
      return {groups,nodes,edges:[...pairs.values()].filter(edge=>edge.weight>=edgeMinimum)};
    }

    // 功能：按群组排节点、按所选时段首次时间定位，绘制弧形共现关系及交互。
    function renderRelationTimeline(minimum, top, edgeMinimum) {
      const data=buildRelationData(activePapers,minimum,top,edgeMinimum);
      // 功能：共现弧线按原始共同论文数控制明暗，点击与悬停后恢复正确的选中状态。
      const relationOpacity=EdgeRendering.opacityScale(data.edges);
      let relationFocus=null;
      const relationEdgeOpacity=edge=>relationOpacity(edge,relationFocus?(relationFocus(edge)?'focus':'dim'):'normal');
      const x=d3.scaleLinear().domain(timeDomain()).range([385,1010]);
      const color=d3.scaleSequential(d3.interpolateYlOrBr).domain([periodEnd+0.01,periodStart]);
      const radius=d3.scaleSqrt().domain([0,d3.max(data.nodes,d=>d.count)||1]).range([0,16]);
      // 关键词关系图同样使用逐行蜂群避让；圆半径计入行高及轴边界。
      const packed=TimelineCountBeeswarm.layout(data.groups.flatMap(group=>
        data.nodes.filter(node=>node.group===group.name).map(node=>({key:group.name,d:node,x:x(node.firstYear),y:0,r:radius(node.count)}))
      ),swarmOptions(x,{stackRows:true,top:60,rowGap:24,minRowHeight:80}));
      for(const point of packed.points){point.d.x=point.x;point.d.y=point.y;}
      const bands=data.groups.map(group=>({group,center:packed.centers.get(group.name)||100}));
      const height=Math.max(250,packed.bottom+35);
      beginTimeline(height);
      d3.select("#summary").text(`${periodNote} · ${formatPeriod(periodStart)} 至 ${formatPeriod(periodEnd)} · ${data.groups.length}组 · ${data.nodes.length}个关键词节点 · ${data.edges.length}条共现弧线`);
      d3.select("#detail").text(data.nodes.length ? "圆表示关键词，首次时间以当前筛选窗口为准。悬停查看，点击节点或弧线查看对应论文。" : "没有达到门槛的关键词，请降低门槛。");
      const panel=d3.select("#groups");panel.selectAll("*").remove();
      data.groups.forEach(group=>panel.append("div").text(`${group.name}（${group.members.length}个词）：${group.members.join(" / ")}`));
      timelineLayer.append("g").attr("transform","translate(0,35)")
        .call(d3.axisTop(x).tickValues(timeTicks()).tickFormat(formatPeriod));
      timelineLayer.append("g").selectAll("line").data(timeTicks()).join("line")
        .attr("x1",d=>x(d)).attr("x2",d=>x(d)).attr("y1",45).attr("y2",height-15).attr("stroke","#edf0f3");
      bands.forEach(band=>{
        timelineLayer.append("line").attr("x1",345).attr("x2",1035).attr("y1",band.center).attr("y2",band.center).attr("stroke","#c6ced6");
        timelineLayer.append("text").datum(band.group).attr("class","timeline-label").attr("x",10).attr("y",band.center).attr("font-size",12)
          .text(`${band.group.name} [${band.group.members.length}词]`).call(LabelLayout.fitText,320).append("title").text(band.group.name);
      });
      const byName=new Map(data.nodes.map(node=>[node.name,node]));
      // 功能：跨年节点之间画上拱弧；同年节点画侧弧，年份坐标仍严格相同。
      function arcPath(edge) {
        const a=byName.get(edge.source),b=byName.get(edge.target);
        if(a.x===b.x) {
          const bow=Math.min(85,35+Math.abs(a.y-b.y)*0.15);
          return `M${a.x},${a.y} C${a.x+bow},${a.y} ${b.x+bow},${b.y} ${b.x},${b.y}`;
        }
        const lift=Math.min(100,30+Math.abs(a.x-b.x)*0.15);
        const controlY=Math.max(55,Math.min(a.y,b.y)-lift);
        return `M${a.x},${a.y} Q${(a.x+b.x)/2},${controlY} ${b.x},${b.y}`;
      }
      const arcs=timelineLayer.append("g").selectAll("path").data(data.edges).join("path")
        .attr("d",arcPath).attr("fill","none").attr("stroke","#c78b43")
        .attr("stroke-width",d=>1+Math.sqrt(d.weight)*0.7).attr("opacity",relationEdgeOpacity).style("cursor","pointer");
      arcs.append("title").text(d=>`${d.source} ↔ ${d.target}：${d.weight}篇论文中共同出现；所选时段内关系，无方向`);
      // 功能：所有文字用text写入，论文链接只指向保留的OpenAlex记录。
      function showPapers(title,papers) {
        const detail=d3.select("#detail");detail.selectAll("*").remove();detail.text("");
        detail.append("strong").text(title);
        const list=detail.append("ul");papers.forEach(paper=>list.append("li").append("a")
          .attr("href",paper.id).attr("target","_blank").attr("rel","noopener noreferrer")
          .text(`${paperDate(paper)} · ${paper.title}`));
      }
      arcs.on("mouseenter",function(event,edge){d3.select(this).attr("opacity",relationOpacity(edge,'focus'));})
        .on("mouseleave",function(event,edge){d3.select(this).attr("opacity",relationEdgeOpacity(edge));})
        .on("click",(event,d)=>{event.stopPropagation();showPapers(`${d.source}—${d.target}：共现${d.weight}篇`,d.papers);});
      const dots=timelineLayer.append("g").selectAll("circle").data(data.nodes).join("circle")
        .attr("cx",d=>d.x).attr("cy",d=>d.y).attr("r",d=>radius(d.count))
        .attr("fill",d=>color(d.firstYear)).attr("stroke","#ad8247").attr("stroke-width",1).style("cursor","pointer");
      dots.append("title").text(d=>`${d.name} · ${d.group} · 窗口内首次时间${formatPeriod(d.firstYear)} · 出现${d.count}篇`);
      const labels=timelineLayer.append("g").selectAll("text").data(data.nodes).join("text").attr("class","timeline-label")
        .attr("x",d=>d.x+radius(d.count)+4).attr("y",d=>d.y+3).attr("font-size",10)
        .attr("stroke","white").attr("stroke-width",3).attr("paint-order","stroke").attr("pointer-events","none")
        .text(d=>d.name.length>27 ? d.name.slice(0,25)+"…" : d.name);
      TimelineCountBeeswarm.animate(packed,()=>{
        dots.attr('cx',d=>d.x).attr('cy',d=>d.y);
        labels.attr('x',d=>d.x+radius(d.count)+4).attr('y',d=>d.y+3);
        arcs.attr('d',arcPath);updateTimelineLabels();
      });
      dots.on("click",(event,d)=>{
        event.stopPropagation();
        timelineSelectedLabel=d.name;updateTimelineLabels();
        const connected=edge=>edge.source===d.name||edge.target===d.name;
        const neighbors=new Set([d.name]);data.edges.filter(connected).forEach(edge=>{neighbors.add(edge.source);neighbors.add(edge.target);});
        relationFocus=connected;arcs.attr("opacity",relationEdgeOpacity);
        dots.attr("opacity",node=>neighbors.has(node.name)?1:0.15);
        labels.attr("opacity",node=>neighbors.has(node.name)?1:0.15);
        showPapers(`${d.name}：窗口内首次时间${formatPeriod(d.firstYear)}，出现${d.count}篇`,d.papers);
      });
      svg.on("click",()=>{timelineSelectedLabel=null;updateTimelineLabels();relationFocus=null;arcs.attr("opacity",relationEdgeOpacity);dots.attr("opacity",1);labels.attr("opacity",1);});
    }


    // 功能：每圆一篇论文；按原始发表年月定位，引用弧线有方向，不使用共现关系代替。
    function renderPaperCitations(minimum,top) {
      const paperRadius=new Map(activePapers.map((p,i)=>[p.id,i%2?7:4]));
      const grouped=d3.select('#paper-row-type').property('value')==='cluster';
      const definitions=(grouped?buildClusterTimeline(activePapers,minimum):buildTimeline(activePapers).filter(d=>d.count>=minimum)).slice(0,top);
      const result=buildPaperCitationTimeline(activePapers,definitions);
      const labelWeights=LabelLayout.paperWeights(openAlexPapers);
      result.nodes.forEach(node=>{node.labelWeight=labelWeights.values.get(node.paper.id)??null;});
      const x=d3.scaleLinear().domain(timeDomain()).range([385,1010]);
      const packed=TimelineCountBeeswarm.layout(result.rows.flatMap((row,index)=>
        result.nodes.filter(n=>n.row===index).map(n=>({key:index,d:n,x:x(n.paper.periodIndex),y:0,r:paperRadius.get(n.paper.id)}))
      ),swarmOptions(x,{stackRows:true,top:65,rowGap:24,minRowHeight:80}));
      for(const p of packed.points){p.d.x=p.x;p.d.y=p.y;}
      result.rows.forEach((row,index)=>{row.center=packed.centers.get(index)||100;});
      const height=Math.max(260,packed.bottom+35);beginTimeline(height);
      svg.on('click',null);
      d3.select('#summary').text(`${periodNote} · 展示${result.uniquePapers}篇不同论文 / ${result.nodes.length}个显示节点 · ${result.uniqueEdges.length}条唯一引用 / ${result.edges.length}条显示弧线 · ${result.withReferences}篇有参考文献记录`);
      d3.select('#detail').text(result.nodes.length
        ? `点击论文或弧线查看证据。${result.omitted}条引用的目标不在当前显示范围，未画线；没有连线不能直接判断没有引用。`
        : '当前时间及频次门槛下没有论文，请调整筛选。');
      const groupPanel=d3.select('#groups');groupPanel.selectAll('*').remove();
      if(grouped)definitions.forEach(row=>groupPanel.append('div').text(`${row.name}：${row.members.join(' / ')}`));
      timelineLayer.append('g').attr('transform','translate(0,35)').call(d3.axisTop(x).tickValues(timeTicks()).tickFormat(formatPeriod));
      timelineLayer.append('g').selectAll('line').data(timeTicks()).join('line')
        .attr('x1',d=>x(d)).attr('x2',d=>x(d)).attr('y1',45).attr('y2',height-15).attr('stroke','#edf1f4');
      result.rows.forEach(row=>{
        timelineLayer.append('line').attr('x1',345).attr('x2',1035).attr('y1',row.center).attr('y2',row.center).attr('stroke','#d7dee3');
        timelineLayer.append('text').datum(row).attr('class','timeline-label').attr('x',10).attr('y',row.center+4).attr('font-size',12)
          .text(`${row.name.length>42?row.name.slice(0,40)+'…':row.name} (${row.papers.length}篇)`)
          .call(LabelLayout.fitText,320).append('title').text(row.name);
      });
      // 功能：箭头指向被引用论文；端点留出圆半径，避免箭头被圆遮住。
      timelineLayer.append('defs').append('marker').attr('id','paper-citation-arrow').attr('viewBox','0 -4 8 8')
        .attr('refX',7).attr('refY',0).attr('markerWidth',7).attr('markerHeight',7)
        .attr('orient','auto').attr('markerUnits','userSpaceOnUse')
        .append('path').attr('d','M0,-3 L7,0 L0,3 Z').attr('fill','#648b9d');
      function pathFor(edge){
        const a=edge.source,b=edge.target;let cx1,cy1,cx2,cy2;
        if(a.x===b.x){const bow=Math.min(95,40+Math.abs(a.y-b.y)*0.18);cx1=a.x+bow;cx2=b.x+bow;cy1=a.y;cy2=b.y;}
        else{const lift=Math.min(110,30+Math.abs(a.x-b.x)*0.17);cx1=a.x+(b.x-a.x)*0.3;cx2=a.x+(b.x-a.x)*0.7;cy1=cy2=Math.max(55,Math.min(a.y,b.y)-lift);}
        const len=Math.hypot(b.x-cx2,b.y-cy2)||1;
        const endX=b.x-(b.x-cx2)/len*8,endY=b.y-(b.y-cy2)/len*8;
        return `M${a.x},${a.y} C${cx1},${cy1} ${cx2},${cy2} ${endX},${endY}`;
      }
      const arcs=timelineLayer.append('g').selectAll('path').data(result.edges).join('path')
        .attr('d',pathFor).attr('fill','none').attr('stroke','#648b9d').attr('stroke-width',1.1)
        .attr('opacity',0.26).attr('marker-end','url(#paper-citation-arrow)').style('cursor','pointer');
      arcs.append('title').text(d=>`${d.source.paper.title} → 引用 → ${d.target.paper.title}`);
      const fill=d3.scaleSequential(d3.interpolateViridis).domain([periodStart,periodEnd+0.01]);
      const dots=timelineLayer.append('g').selectAll('circle').data(result.nodes,n=>n.key).join('circle')
        .attr('cx',n=>n.x).attr('cy',n=>n.y).attr('r',n=>paperRadius.get(n.paper.id)).attr('fill',n=>fill(n.paper.periodIndex))
        .attr('stroke','white').attr('stroke-width',1).style('cursor','pointer');
      dots.append('title').text(n=>`${paperDate(n.paper)} · ${n.paper.title} · ${result.rows[n.row].name} · ${labelWeights.scope}：${n.labelWeight??"未知"}`);
      const seenTitles=new Set();
      const titleNodes=result.nodes.filter(n=>{if(seenTitles.has(n.paper.id))return false;seenTitles.add(n.paper.id);return true;});
      // 同一论文跨行的显示副本只保留一份标题，权重由全数据集计算，不随筛选变口径。
      const paperTitles=timelineLayer.append('g').selectAll('text').data(titleNodes).join('text')
        .attr('class','paper-title-label').attr('font-size',10).attr('fill','#35516a')
        .attr('stroke','white').attr('stroke-width',3).attr('paint-order','stroke').attr('pointer-events','none')
        .text(n=>LabelLayout.truncate(n.paper.title||n.paper.id,6));
      function updatePaperTitles(){paperTitles.attr('x',n=>n.x+paperRadius.get(n.paper.id)+4).attr('y',n=>n.y+3);updateTimelineLabels();}
      updatePaperTitles();
      d3.select('#detail').append('p').text(`标题优先级：${labelWeights.scope}；默认最多20个不重叠标题，选中论文优先。缺失权重排在已知权重之后；全部缺失时沿用稳定的行/日期顺序，不代表影响力。`);
      // 功能：列出论文实际ID与原始日期，不将引用方向解释为时间先后或因果。
      function showPaper(panel,paper,label){
        const item=panel.append('p');item.append('strong').text(label+'：');
        item.append('a').attr('href',paper.id).attr('target','_blank').attr('rel','noopener noreferrer').text(paper.title||paper.id);
        item.append('span').text(` · ${paperDate(paper)}`);
      }
      arcs.on('mouseenter',function(){d3.select(this).attr('opacity',0.95).attr('stroke-width',2);})
        .on('mouseleave',function(){d3.select(this).attr('opacity',0.26).attr('stroke-width',1.1);})
        .on('click',(event,d)=>{
          event.stopPropagation();const panel=d3.select('#detail');panel.selectAll('*').remove();panel.text('');
          panel.append('strong').text('真实引用方向：引用论文 → 被引用论文');
          showPaper(panel,d.source.paper,'引用方');showPaper(panel,d.target.paper,'被引方');
        });
      dots.on('click',(event,node)=>{
        event.stopPropagation();const id=node.paper.id;
        timelineSelectedLabel=id;updateTimelineLabels();
        // 功能：详情计数和论文列表按唯一引用统计，避免跨行显示副本造成重复。
        const related=result.uniqueEdges.filter(d=>d.sourceId===id||d.targetId===id);
        const ids=new Set([id]);related.forEach(d=>{ids.add(d.sourceId);ids.add(d.targetId);});
        dots.attr('opacity',n=>ids.has(n.paper.id)?1:0.15);
        arcs.attr('opacity',d=>d.sourceId===id||d.targetId===id?0.9:0.03);
        const panel=d3.select('#detail');panel.selectAll('*').remove();panel.text('');showPaper(panel,node.paper,'选中论文');
        panel.append('p').text(`${labelWeights.scope}：${node.labelWeight??'未知'}；此权重用于标题优先级。`);
        panel.append('p').text(`当前显示范围内：引用了${related.filter(d=>d.sourceId===id).length}篇，收到${related.filter(d=>d.targetId===id).length}篇引用。同一论文的所有行副本一并高亮。`);
        related.forEach(d=>showPaper(panel,d.sourceId===id?d.target.paper:d.source.paper,d.sourceId===id?'它引用的论文':'引用它的论文'));
      });
      svg.on('click',()=>{timelineSelectedLabel=null;updateTimelineLabels();dots.attr('opacity',1);arcs.attr('opacity',0.26);});
      d3.select('#mode-explanation').text('一圆一篇论文；各行独立X方向蜂群避让，连线与标题随节点移动。准确日期见悬停。');
      TimelineCountBeeswarm.animate(packed,()=>{
        dots.attr('cx',d=>d.x).attr('cy',d=>d.y);arcs.attr('d',pathFor);updatePaperTitles();
      });
    }

    // 功能：根据模式切换数量、关键词关系和论文引用时间线。
    function renderTimeline() {
      globalThis.TimelineExperimentalBeeswarm?.stop();
      globalThis.TimelineCountBeeswarm?.stop();
      // 功能：主题分行必须先有有效模型；不静默退回模块度或自动训练。
      const needsTopics=d3.select('#mode').property('value')!=='keyword'&&(d3.select('#mode').property('value')!=='papers'||d3.select('#paper-row-type').property('value')==='cluster');
      if(needsTopics&&!TopicStore.read(topicCorpus)){
        timelineLayer=null;svg.attr('height',180).selectAll('*').remove();
        svg.append('text').attr('x',30).attr('y',80).attr('font-size',16).text('此视图需要主题结果，请先运行主题模型，或切换为关键词分行。');
        d3.select('#groups').text('');d3.select('#summary').text('主题模型尚未运行');
        d3.select('#detail').text('主题训练完成后再显示按主题分行的时间线。');
        d3.select('#message').text('请先运行下方主题模型，或选择按单个关键词查看。');return;
      }
      const minimum = Number(d3.select("#minimum").property("value"));
      const top = Number(d3.select("#top").property("value"));
      if (![minimum, top].every(v => Number.isInteger(v) && v >= 1) || top > 417) {
        d3.select("#message").text("请输入正整数，最多显示数不超过417。"); return;
      }
      d3.select("#message").text("");
      // 功能：先筛选论文，再重新统计群组、节点频次和共现边；首次时间相对当前筛选窗口。
      let selection;
      try {
        granularity=d3.select('#time-granularity').property('value');
        selection=selectTimelinePeriod(openAlexPapers,publicationDates,
          d3.select('#start-month').property('value'),d3.select('#end-month').property('value'),
          granularity,d3.select('#exclude-jan-first').property('checked'));
      } catch(error){d3.select('#message').text(error.message);return;}
      activePapers=selection.papers;periodStart=selection.start;periodEnd=selection.end;
      rows=buildTimeline(activePapers);
      periodNote=`${openAlexPapers.length}篇中选中${activePapers.length}篇；${selection.suspect}篇为1月1日记录（已排除${selection.excluded}篇），缺失/无效日期${selection.missing}篇`;
      const relationMode=d3.select("#mode").property("value")==="relations";
      // 功能：图名与一句话解释同步切换，明确“关系节点”与“数量汇总节点”的区别。
      const descriptions={
        papers:{title:"论文引用时间线（一圆一篇论文）",text:"每行一个关键词或论文主主题；一圆一篇论文，按发表年/月定位；箭头从引用论文指向被引用论文。关键词分行可重复论文，主主题分行每篇仅一行；各行展示行内引用，唯一引用与显示弧线分别计数。"},
        relations:{title:"关键词共现关系图（按时间排列）",text:"看关键词之间的联系：一圆一词，位置是窗口内首次出现时间，弧线是共同出现关系；每行按关键词映射到的论文主题组织。"},
        keyword:{title:"单个关键词的论文数量时间线",text:"看一个词每期涉及多少篇论文：一行一个词，一圆是该词在某年或某月的论文数。"},
        cluster:{title:"论文主题数量时间线",text:"看一组词每期涉及多少篇论文：一行一个论文主主题，一圆是该主题在某年或某月的去重论文数。"}
      };
      const description=descriptions[d3.select("#mode").property("value")];
      d3.select("h2").text(description.title);
      d3.select("#mode-explanation").text(description.text);
      d3.select("#relation-legend").style("display",relationMode?"block":"none");
      d3.select("#distribution-legend").style("display",relationMode?"none":"block");
      const paperMode=d3.select('#mode').property('value')==='papers';
      d3.select('#distribution-legend').style('display',relationMode||paperMode?'none':'block');
      d3.select('#paper-legend').style('display',paperMode?'block':'none');
      if(paperMode){renderPaperCitations(minimum,top);return;}
      if(relationMode) {
        const edgeMinimum=Number(d3.select("#edge-min").property("value"));
        if(!Number.isInteger(edgeMinimum)||edgeMinimum<1){d3.select("#message").text("弧线最少共现需为正整数。");return;}
        renderRelationTimeline(minimum,top,edgeMinimum);return;
      }
      svg.on("click",null);
      const clustered = d3.select("#mode").property("value") === "cluster";
      const allRows = clustered ? buildClusterTimeline(activePapers, minimum) : rows.filter(d => d.count >= minimum);
      const selected = allRows.slice(0, top);
      const colors = d3.scaleOrdinal(d3.schemeTableau10).domain(selected.map(d => d.name));
      const groupPanel = d3.select("#groups"); groupPanel.selectAll("*").remove();
      if (clustered) {
        groupPanel.append("strong").text("主题映射关键词（行名为模型代表词）：");
        selected.forEach(row => groupPanel.append("div").text(`${row.name} — ${row.members.join(" / ")}`));
      }
      // 先避让再确定行高；时间轴两端预留最大圆半径，日期仍严格映射同一比例尺。
      const x = d3.scaleLinear().domain(timeDomain()).range([385, 1010]);
      const points = selected.flatMap(row => [...row.years].map(([year, papers]) => ({ name: row.name, year, count: papers.length, papers })));
      const radius = d3.scaleSqrt().domain([0, d3.max(points, d => d.count) || 1]).range([0, 17]);
      const packed=TimelineCountBeeswarm.layout(points.map(d=>({key:d.name,d,x:x(d.year),y:0,r:radius(d.count)})),swarmOptions(x,{stackRows:true,top:48,rowGap:16,minRowHeight:48}));
      for(const p of packed.points){p.d.x=p.x;p.d.y=p.y;}
      const y=name=>packed.centers.get(name)||72;
      const height=Math.max(180,packed.bottom+25);
      beginTimeline(height);
      d3.select("#summary").text(`${periodNote} · 当前 ${selected.length} 行（${clustered ? "论文主主题" : "关键词"}） · 时间范围 ${formatPeriod(periodStart)} 至 ${formatPeriod(periodEnd)}`);
      d3.select("#detail").text(selected.length ? "悬停圆查看数值；点击圆查看对应论文。" : "没有达到门槛的关键词，请降低门槛。");
      // 功能：固定年度刻度与网格，筛选后仍能比较同一时间范围。
      timelineLayer.append("g").attr("transform", "translate(0,30)")
        .call(d3.axisTop(x).tickValues(timeTicks()).tickFormat(formatPeriod));
      timelineLayer.append("g").selectAll("line").data(timeTicks()).join("line")
        .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 35).attr("y2", height - 25).attr("stroke", "#e3eaf0");
      selected.forEach(row => {
        const years = [...row.years.keys()].sort((a,b) => a-b);
        timelineLayer.append("text").datum(row).attr("class","timeline-label").attr("x", 12).attr("y", y(row.name) + 4).attr("font-size", 12)
          .text(`${row.name} (${row.count})`).call(LabelLayout.fitText,320).append("title").text(row.name);
        timelineLayer.append("line").attr("x1", x(years[0])).attr("x2", x(years[years.length-1]))
          .attr("y1", y(row.name)).attr("y2", y(row.name)).attr("stroke", "#bdcbd6").attr("stroke-dasharray", "4 4");
      });
      // 功能：圆面积编码当前周期篇数；悬停显示计数，点击列出可溯源的论文。
      const dots = timelineLayer.append("g").selectAll("circle").data(points).join("circle")
        .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => radius(d.count))
        .attr("fill", d => clustered ? colors(d.name) : "#477fae").attr("stroke", "white").attr("stroke-width", 1.5).style("cursor", "pointer");
      TimelineCountBeeswarm.animate(packed,()=>dots.attr('cx',d=>d.x).attr('cy',d=>d.y));
      dots.append("title").text(d => `${d.name} · ${formatPeriod(d.year)} · ${d.count}篇`);
      dots.on("click", (event, d) => {
        const panel = d3.select("#detail"); panel.selectAll("*").remove(); panel.text("");
        panel.append("strong").text(`${d.name}：${formatPeriod(d.year)}，${d.count}篇论文`);
        const list = panel.append("ul");
        d.papers.forEach(paper => {
          list.append("li").append("a").attr("href", paper.id).attr("target", "_blank")
            .attr("rel", "noopener noreferrer").text(`${paperDate(paper)} · ${paper.title}`);
        });
      });
    }
    // 功能：绑定筛选操作并绘制初始时间线。
    d3.select("#apply").on("click", renderTimeline);
    d3.select("#mode").on("change", renderTimeline);
    d3.select("#paper-row-type").on("change", renderTimeline);
    d3.select('#paper-layout').on('change',renderTimeline);
    // 功能：一键恢复样本完整日期范围，保留其他图形参数。
    d3.select('#reset-period').on('click',()=>{
      d3.select('#start-month').property('value',firstMonth);
      d3.select('#end-month').property('value',lastMonth);
      d3.select('#exclude-jan-first').property('checked',false);renderTimeline();
    });
    d3.select('#time-granularity').on('change',renderTimeline);
    // 首次进入无主题缓存时，先显示无需训练的关键词分行；后续显式选择主题时仍提示训练。
    if(!TopicStore.read(topicCorpus))d3.select('#paper-row-type').property('value','keyword');
    renderTimeline();


// 功能：三种模型共用训练入口；训练成功才更新共享结果，失败保留前次结果。
function syncTimelineMethod(){
 const method=d3.select('#timeline-topic-method').property('value'),bert=method==='bertopic';
 d3.select('#timeline-bertopic-parameters').property('hidden',!bert);
 d3.select('#timeline-topic-count').property('disabled',bert);
 d3.select('#timeline-topic-iterations').property('disabled',bert);
 d3.select('#timeline-train-topic').text('运行'+({nmf:'NMF',lda:'LDA',bertopic:'BERTopic'}[method])+'主题模型');
}
d3.select('#timeline-topic-method').on('change',syncTimelineMethod);syncTimelineMethod();
d3.select('#timeline-train-topic').on('click',async function(){
 const controls=[...document.getElementById('timeline-topic-method').closest('.toolbar').querySelectorAll('input,button,select')];
 controls.forEach(c=>c.disabled=true);
 try{
  const method=d3.select('#timeline-topic-method').property('value');
  const options={topics:Number(d3.select('#timeline-topic-count').property('value')),topWords:Number(d3.select('#timeline-topic-words').property('value')),minDf:Number(d3.select('#timeline-topic-df').property('value')),iterations:Number(d3.select('#timeline-topic-iterations').property('value')),minSize:Number(d3.select('#timeline-bertopic-min-size').property('value')),neighbors:Number(d3.select('#timeline-bertopic-neighbors').property('value'))};
  const fitted=await TopicTrainer.fit(method,topicCorpus,options,(step,total)=>d3.select('#timeline-topic-status').text(`${method.toUpperCase()}训练中 ${step}/${total}轮`),message=>d3.select('#timeline-topic-status').text(message));
  TopicStore.save(fitted,topicCorpus);
  d3.select('#timeline-topic-status').text(`${fitted.model}完成：${fitted.used}篇、${fitted.topics.length}个主题。${method==='bertopic'?`${fitted.outliers}篇未归类；成员强度不是主题占比。`:method==='lda'?'按LDA主题概率估计归主主题，不是分类准确率。':'按NMF相对强度归主主题，不是置信度。'}时间筛选不重训。`);
  renderTimeline();
 }catch(error){d3.select('#timeline-topic-status').text(`训练失败：${error.message}；保留上次结果。`);}finally{controls.forEach(c=>c.disabled=false);syncTimelineMethod();}
});
