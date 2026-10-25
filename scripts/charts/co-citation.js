// 功能：co-citation图形计算、绘制及交互；数据由bootstrap就绪后注入。

      // 功能：统计实体频次、合作关系以及包含该词的论文文献发表年份。
      // 每篇论文的同一词仅记一次；缺失年份不参与平均，频次仍计入。
      // 功能：按两个门槛筛选，并复制对象，防止D3布局改动原始统计数据。
      const papers = openAlexPapers;
      // 功能：以参考文献为节点，而非作者或引用它们的样本论文。
      const entityLabel="参考文献";
      const network=buildCoCitationNetwork(papers,referenceLabels);
      d3.select("#keyword-search").attr("placeholder","搜索被引文献标题或OpenAlex ID");
      const svg = d3.select("#network");
      const graph = svg.append("g");
      const lineLayer = graph.append("g");
      const nodeLayer = graph.append("g");
      const labelLayer = graph.append("g");
      let simulation;
      let nodes = [];
      let links = [];
      let circles, lines, labels;
      // 功能：统一原始关系权重透明度和后台边捆绑，保留绘图边对象用于证据交互。
      let edgeOpacity=()=>0.35;
      const edgeView=EdgeRendering.create(lineLayer,()=>nodes,()=>links);

      let selectedLabel=null;
      function updateLabels(){
        if(!labels)return;
        const all=d3.select('#show-all-labels').property('checked');
        LabelLayout.schedule(labels,{all,
          priority:d=>LabelLayout.weightPriority(d.count,d.name===selectedLabel)});
      }

      // 功能：固定使用整个样本的发表年份范围，筛选不会改变颜色刻度。
      const knownYears = network.nodes.map(d => d.meanYear).filter(Number.isFinite);
      const yearMin = knownYears.length ? Math.min(...knownYears) : 0;
      const yearMax = knownYears.length ? Math.max(...knownYears) : 1;
      const yearColor = d3.scaleSequential(d3.interpolateViridis)
        .domain(yearMin === yearMax ? [yearMin - 0.5, yearMax + 0.5] : [yearMin, yearMax]);

      // 功能：切换配色及同步图例，不改变节点坐标、筛选或选中状态。
      function updateColors() {
        const byYear = d3.select("#color-mode").property("value") === "year";
        circles.attr("fill", d => byYear
          ? (Number.isFinite(d.meanYear) ? yearColor(d.meanYear) : "#a7adb3")
          : "#477fae");
        d3.select("#year-legend").style("display", byYear && knownYears.length ? "block" : "none");
        d3.select("#color-description").text(byYear
          ? "包含该词的样本论文文献发表年份；不是首次出现年份。"
          : "统一颜色，不表示年份或聚类。");
        const stops = Array.from({ length: 11 }, (_, i) => `${d3.interpolateViridis(i / 10)} ${i * 10}%`);
        d3.select("#year-gradient").style("background", `linear-gradient(to right, ${stops.join(", ")})`);
        d3.select("#year-min").text(`偏早 ${yearMin.toFixed(1)}`);
        d3.select("#year-max").text(`偏晚 ${yearMax.toFixed(1)}`);
      }

      // 功能：让整张网络随滚轮缩放、空白拖动平移。
      const zoom = d3.zoom().scaleExtent([0.001, 6])
        .on("zoom", event => { graph.attr("transform", event.transform); updateLabels(); });
      svg.call(zoom);
      window.WorkspaceZoom={scaleBy:factor=>svg.call(zoom.scaleBy,factor)};

      // 功能：利用节点和标签的边界计算全图视角，初次显示及重置时调用。
      function fitGraph() {
        if (!nodes.length) {
          svg.call(zoom.transform, d3.zoomIdentity);
          return;
        }
        const box = graph.node().getBBox();
        const scale = Math.min(830 / Math.max(box.width, 1),
          450 / Math.max(box.height, 1), 1);
        svg.call(zoom.transform, d3.zoomIdentity
          .translate(450 - scale * (box.x + box.width / 2),
            260 - scale * (box.y + box.height / 2)).scale(scale));
      }

      // 功能：清除选择高亮，不改变筛选后的网络。
      function clearSelection() {
        selectedLabel=null;updateLabels();
        circles.attr("opacity", 1).attr("stroke", "white").attr("stroke-width", 1.5);
        labels.attr("opacity", 1);
        lines.attr("opacity", d=>edgeOpacity(d));
        d3.select("#selection").text("点击实体查看它的直接共被引关系。");
      }

      // 功能：根据已统计的论文ID，显示该实体或合作边对应的论文。
      function showEvidence(title, paperIds) {
        const panel=d3.select("#evidence");panel.selectAll("*").remove();
        panel.append("strong").text(title);
        const ids=new Set(paperIds);
        const list=panel.append("ul");papers.filter(p=>ids.has(p.id)).forEach(p=>{
          list.append("li").append("a").attr("href",p.id).attr("target","_blank")
            .attr("rel","noopener noreferrer").text(`${p.year} · ${p.title}`);
        });
      }

      // 功能：只按当前可见的连线找邻居，点击和搜索共用此逻辑。
      function selectKeyword(selected) {
        selectedLabel=selected.name;updateLabels();
        showEvidence(`引用《${selected.label}》的样本论文`,selected.paperIds);
        const neighbors = new Set([selected.name]);
        const connected = link => link.source.name === selected.name ||
          link.target.name === selected.name;
        links.filter(connected).forEach(link => {
          neighbors.add(link.source.name);
          neighbors.add(link.target.name);
        });
        circles.attr("opacity", d => neighbors.has(d.name) ? 1 : 0.12)
          .attr("stroke", d => d.name === selected.name ? "#17324d" : "white")
          .attr("stroke-width", d => d.name === selected.name ? 3 : 1.5);
        labels.attr("opacity", d => neighbors.has(d.name) ? 1 : 0.12);
        lines.attr("opacity", d => edgeOpacity(d,connected(d)?'focus':'dim'));
        d3.select("#selection").text(`${selected.label}：被 ${selected.count} 篇样本论文引用；发表年份 ${Number.isFinite(selected.meanYear) ? selected.meanYear.toFixed(1) : "缺失"}；当前直接共被引文献 ${neighbors.size - 1} 个。`);
      }

      // 功能：按筛选结果重建图形和布局；按开关处理孤立节点，明确显示无结果的情况。
      function renderNetwork(filtered) {
        if (simulation) simulation.stop();
        nodes = filtered.nodes;
        links = filtered.links;
        lineLayer.selectAll("*").remove();
        nodeLayer.selectAll("*").remove();
        labelLayer.selectAll("*").remove();
        d3.select("#search-message").text("");
        d3.select("#summary").text(`教学样本 ${papers.length} 篇 · ${entityLabel}实体 ${network.nodes.length} 个 · 有${entityLabel}记录 ${network.includedPapers} 篇 · 当前节点 ${nodes.length} 个 · 当前共被引关系 ${links.length} 条`);
        d3.select("#empty").style("display", nodes.length ? "none" : "block");
        const radius = d3.scaleSqrt().domain([0, d3.max(nodes, d => d.count) || 1])
          .range([0, 34]);
        edgeOpacity=EdgeRendering.opacityScale(links);
        lines = lineLayer.selectAll("path").data(links).join("path").attr("fill","none")
          .attr("stroke", "#8495a7").attr("stroke-width", d => d.weight * 1.3);
        edgeView.bind(lines);
        circles = nodeLayer.selectAll("circle").data(nodes).join("circle")
          .attr("r", d => radius(d.count)).attr("fill", "#477fae");
        // 功能：名称放在圆外，并加白色文字轮廓，提高长英文标签的可读性。
        labels = labelLayer.selectAll("text").data(nodes).join("text")
          .attr("font-size", 12).attr("fill", "#23394e")
          .attr("stroke", "white").attr("stroke-width", 3)
          .attr("paint-order", "stroke").attr("pointer-events", "none")
          .text(d => LabelLayout.truncate(d.label,6));
        circles.append("title").text(d => `${d.label}：被 ${d.count} 篇样本论文引用；发表年份 ${Number.isFinite(d.meanYear) ? d.meanYear.toFixed(1) : "缺失"}`);
        updateColors();
        clearSelection();
        circles.on("click", (event, d) => {
          event.stopPropagation();
          selectKeyword(d);
        });
        if (!nodes.length) { fitGraph(); return; }
        simulation = d3.forceSimulation(nodes)
          .force("link", d3.forceLink(links).id(d => d.name).distance(145))
          .force("charge", d3.forceManyBody().strength(-450))
          .force("center", d3.forceCenter(450, 260))
          .force("collision", NodeCollision.force(d => radius(d.count) + 25,{gap:0}));
        // 功能：每轮布局计算后同步圆、线和标签位置。
        function updatePositions() {
          edgeView.update();
          circles.attr("cx", d => d.x).attr("cy", d => d.y);
          labels.attr("x", d => d.x + radius(d.count) + 5).attr("y", d => d.y + 4);
          updateLabels();
        }
        simulation.on("tick", updatePositions).stop();
        simulation.tick(300);
        updatePositions();
        lines.append("title").text(d => `${d.source.label}—${d.target.label}：被 ${d.weight} 篇样本论文一起引用`);
        // 功能：点击共被引边，展示同时引用两端文献的样本论文。
        lines.style("cursor","pointer").on("click",(event,d)=>{
          event.stopPropagation();showEvidence(`${d.source.label}—${d.target.label}：共同引用它们的${d.weight}篇样本论文`,d.paperIds);
        });
        // 功能：拖动单个节点，坐标以缩放后的分组为参照，避免拖动错位。
        circles.call(d3.drag().container(graph.node())
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          }).on("drag", (event, d) => { NodeCollision.move(nodes,d,event.x,event.y,n=>radius(n.count)); d.fx = d.x; d.fy = d.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }));
        fitGraph();
      }

      // 功能：验证两个正整数门槛，重新筛选和绘图，并自动显示全图。
      function applyFilters() {
        const nodeMinimum = Number(d3.select("#min-count").property("value"));
        const linkMinimum = Number(d3.select("#min-weight").property("value"));
        if (![nodeMinimum, linkMinimum].every(v => Number.isInteger(v) && v >= 1)) {
          d3.select("#filter-message").text("两个门槛都需为大于等于1的整数。");
          return;
        }
        d3.select("#filter-message").text("");
        const maximum=Number(d3.select("#max-nodes").property("value"));
        if(!Number.isInteger(maximum)||maximum<1||maximum>200){d3.select("#filter-message").text("最多节点需为1–200的整数。");return;}
        const filtered=selectCoCitationNetwork(network,nodeMinimum,linkMinimum,maximum,d3.select('#show-isolates').property('checked'));
        renderNetwork(filtered);
        d3.select("#filter-message").text(`达到节点被引门槛${filtered.eligibleCount}篇，取前${filtered.candidateCount}篇候选；当前展示${filtered.nodes.length}篇，${filtered.hiddenIsolates?'已隐藏'+filtered.hiddenIsolates+'个孤立点':'包含'+filtered.isolatedCount+'个孤立点'}。`);
      }

      // 功能：在当前节点中按名称包含关系查找，不区分大小写；多项命中时提示。
      function searchKeyword() {
        const query = d3.select("#keyword-search").property("value").trim().toLowerCase();
        const matches = nodes.filter(d => d.label.toLowerCase().includes(query));
        if (!query || !matches.length) {
          d3.select("#search-message").text(query ? "当前筛选结果中未找到；可降低节点门槛。" : "请输入实体。");
          return;
        }
        const selected = matches.find(d => d.label.toLowerCase() === query) || matches[0];
        selectKeyword(selected);
        d3.select("#search-message").text(matches.length > 1 ? `找到 ${matches.length} 项，已选择 ${selected.label}；可输入更完整名称。` : `已找到：${selected.label}`);
      }

      // 功能：绑定工具栏操作；初次打开按节点频次2、合作次数1显示。
      svg.on("click", clearSelection);
      d3.select("#filter-button").on("click", applyFilters);
      // 功能：孤立点开关立即重新应用筛选，保留门槛输入。
      d3.select("#show-isolates").on("change", applyFilters);
      d3.select("#search-button").on("click", searchKeyword);
      d3.select("#keyword-search").on("keydown", event => {
        if (event.key === "Enter") searchKeyword();
      });
      d3.select("#reset-view").on("click", fitGraph);
      d3.select("#color-mode").on("change", updateColors);
      d3.select("#show-all-labels").on("change",updateLabels);
      LabelLayout.observe(svg.node(),updateLabels);
      applyFilters();
