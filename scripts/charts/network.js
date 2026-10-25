// 功能：network图形计算、绘制及交互；数据由bootstrap就绪后注入。

      // 功能：统计关键词频次、共现关系以及包含该词的论文平均发表年份。
      // 每篇论文的同一词仅记一次；缺失年份不参与平均，频次仍计入。
      function buildKeywordNetwork(paperList) {
        // ② 建立“关键词 → 次数”的计数表
        const keywordCounts = new Map();
        const keywordYears = new Map();

        paperList.forEach(paper => {
          // 同一篇论文里，同一个关键词只计算一次
          const uniqueKeywords = new Set(paper.keywords);

          uniqueKeywords.forEach(keyword => {
            const previousCount = keywordCounts.get(keyword) || 0;
            keywordCounts.set(keyword, previousCount + 1);
            if (Number.isInteger(paper.year)) {
              const years = keywordYears.get(keyword) || [];
              years.push(paper.year);
              keywordYears.set(keyword, years);
            }
          });
        });

        // ③ 将计数表转换为绘图使用的节点列表
        const keywordNodes = Array.from(
          keywordCounts,
          ([name, count]) => {
            const years = keywordYears.get(name) || [];
            return {
              name, count,
              meanYear: years.length ? years.reduce((sum, year) => sum + year, 0) / years.length : null,
              yearCount: years.length
            };
          }
        );


        // ④ 建立“关键词对 → 共现关系数据”的计数表
        const pairCounts = new Map();

        paperList.forEach(paper => {
          // 去重并排序，使同一对关键词的顺序保持一致
          const keywords = [...new Set(paper.keywords)].sort();

          // 两两配对，每一对只处理一次
          for (let i = 0; i < keywords.length; i++) {
            for (let j = i + 1; j < keywords.length; j++) {
              const source = keywords[i];
              const target = keywords[j];

              // 将两个词组合成唯一的计数标识
              const key = JSON.stringify([source, target]);

              if (!pairCounts.has(key)) {
                pairCounts.set(key, {
                  source,
                  target,
                  weight: 0
                });
              }

              pairCounts.get(key).weight += 1;
            }
          }
        });

        // ⑤ 转换为绘图使用的连线列表
        const keywordLinks = [...pairCounts.values()];



        return { nodes: keywordNodes, links: keywordLinks };
      }


      // 功能：按两个门槛筛选，并复制对象，防止D3布局改动原始统计数据。
      function filterKeywordNetwork(network, nodeMinimum, linkMinimum) {
        const nodes = network.nodes.filter(d => d.count >= nodeMinimum)
          .map(d => ({ ...d }));
        const names = new Set(nodes.map(d => d.name));
        const links = network.links.filter(d => names.has(d.source) &&
          names.has(d.target) && d.weight >= linkMinimum)
          .map(d => ({ ...d }));
        return { nodes, links };
      }

      const papers = openAlexPapers;
      const network = buildKeywordNetwork(papers);
      const svg = d3.select("#network");
      const graph = svg.append("g");
      const densityLayer = graph.append("g");
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
      // 功能：保存交互焦点，切换复选框时保留所选节点/群组。
      let visualFocus = null;

      // 功能：visit2 按频次自适应显示，选中词优先；全部标签为显式对照开关。
      function updateVisualClarity() {
        const all = d3.select('#show-all-labels').property('checked');
        const focus = visualFocus && visualFocus.members;
        labels.attr('opacity', d => !focus || focus.has(d.name) ? 1 : 0.12);
        LabelLayout.schedule(labels, {
          all,
          eligible:d=>all||!focus||focus.has(d.name),
          priority:d=>LabelLayout.weightPriority(d.count,d.name===visualFocus?.selected)
        });
        lines.attr('opacity', d => edgeOpacity(d,!visualFocus?'normal':visualFocus.connected(d)?'focus':'dim'));
        lineLayer.style('display', densityActive() || !d3.select('#show-links').property('checked') ? 'none' : null);
        // 功能：密度图保留关键词标签；文字显示范围仍由高频/全部标签开关决定。
        labelLayer.style('display', null);
      }

      // 功能：固定使用整个样本的平均年份范围，筛选不会改变颜色刻度。
      const knownYears = network.nodes.map(d => d.meanYear).filter(Number.isFinite);
      const yearMin = knownYears.length ? Math.min(...knownYears) : 0;
      const yearMax = knownYears.length ? Math.max(...knownYears) : 1;
      const yearColor = d3.scaleSequential(d3.interpolateViridis)
        .domain(yearMin === yearMax ? [yearMin - 0.5, yearMax + 0.5] : [yearMin, yearMax]);

      // 功能：群组配色盘。按群组规模降序分配颜色，规模相同的按组内高频词排序，保证可复现。
      // 功能：具体调色板由createClusterPalette按当前群组数量生成，避免第11组起循环重色。
      // 功能：当前筛选结果对应的社区划分结果；recomputeClusters 在每次重建网络后刷新。
      let clusterInfo = { groups: [], isolated: [], memberColors: new Map() };

      // 功能：对当前可见的节点与边重跑贪心模块度，得到群组归属。
      // 只使用拓扑（谁和谁连、连得密不密），不涉及语义或年份；删除边会改变分组，这是模块度自身的性质。
      // 孤立点（在当前门槛下没有任何边）不并入任何群组，用灰色显示。
      function recomputeClusters() {
        // 功能：全图暂时停用模块度计算，保留后续原算法以便未来恢复。
        if (!AnalysisFeatures.modularity) {clusterInfo={groups:[],isolated:[],memberColors:new Map()};return;}
        // 功能：力布局会把连线的 source/target 改写成节点对象，这里统一取回关键词名。
        const endpoint = value => (value && typeof value === "object") ? value.name : value;
        const nameEdges = links.map(link => ({
          source: endpoint(link.source), target: endpoint(link.target), weight: link.weight
        }));
        // 功能：当前可见节点中出现论文数的查表，供群组内排序使用。
        const countByName = new Map(nodes.map(d => [d.name, d.count]));
        // 功能：组内按论文数降序、名字升序，取首位作为代表词；用于给群组稳定排序。
        const leaderOf = group => group.members.slice()
          .sort((a, b) => ((countByName.get(b) || 0) - (countByName.get(a) || 0)) || a.localeCompare(b))[0];
        const result = clusterByModularity(nodes.map(d => d.name), nameEdges);
        // 功能：群组按规模降序、规模相同按代表词排序，使颜色分配稳定且大组优先。
        const ordered = result.groups.map(group => ({ group, leader: leaderOf(group) }))
          .sort((a, b) => b.group.members.length - a.group.members.length ||
            a.leader.localeCompare(b.leader));
        const memberColors = new Map();
        const palette = createClusterPalette(ordered.length);
        ordered.forEach((entry, rank) => {
          const color = palette[rank];
          entry.group.members.forEach(name => memberColors.set(name, color));
        });
        clusterInfo = {
          memberColors,
          groups: ordered.map((entry, rank) => ({
            rank, color: palette[rank], members: entry.group.members
          })),
          isolated: result.isolated
        };
      }

      // 功能：取某词在整个样本中的出现论文数，用于图例排序；未知词回退为0。
      const sampleCount = new Map(network.nodes.map(d => [d.name, d.count]));
      function countOf(name) {
        return sampleCount.get(name) || 0;
      }

      // 功能：切换配色及同步图例，不改变节点坐标、筛选或选中状态。
      function updateColors() {
        const mode = d3.select("#color-mode").property("value");
        const byYear = mode === "year", byCluster = mode === "cluster";
        circles.attr("fill", d => mode === "topic" ? TopicPanel.color(d.name) : byCluster
          ? (clusterInfo.memberColors.get(d.name) || "#c3cad1")
          : byYear
            ? (Number.isFinite(d.meanYear) ? yearColor(d.meanYear) : "#a7adb3")
            : "#477fae");
        d3.select("#year-legend").style("display", byYear && knownYears.length && !densityActive() ? "block" : "none");
        d3.select("#cluster-legend").style("display", byCluster && !densityActive() ? "block" : "none");
        d3.select("#color-description").text(mode === "topic"
          ? "T编号对应下方当前模型主题。关键词按所属论文映射：NMF汇总相对强度，BERTopic统计已分类论文归属；灰色表示无有效主题。网络筛选不重新训练。"
          : byCluster
          ? "同一色为一组：在当前节点与连线门槛下按共现拓扑做贪心模块度划分；不是主题标签，需人工解释，改门槛会改变分组。灰色为当前无连线的词。"
          : byYear
            ? "包含该词的样本论文平均发表年份；不是首次出现年份。"
            : "统一颜色，不表示年份或聚类。");
        const stops = Array.from({ length: 11 }, (_, i) => `${d3.interpolateViridis(i / 10)} ${i * 10}%`);
        d3.select("#year-gradient").style("background", `linear-gradient(to right, ${stops.join(", ")})`);
        d3.select("#year-min").text(`偏早 ${yearMin.toFixed(1)}`);
        d3.select("#year-max").text(`偏晚 ${yearMax.toFixed(1)}`);
        renderClusterLegend();
      }

      // 功能：列出当前群组、规模与代表词，并提供点击隔离；说明措辞保持“群组”而非“主题”。
      function renderClusterLegend() {
        const box = d3.select("#cluster-legend");
        box.selectAll("*").remove();
        if (d3.select("#color-mode").property("value") !== "cluster" || densityActive()) return;
        if (!clusterInfo.groups.length) {
          box.append("div").text("当前门槛下没有可划分的群组（可能只剩孤立词）。");
          return;
        }
        clusterInfo.groups.forEach(group => {
          const counts = group.members.slice().sort((a, b) => (countOf(b) - countOf(a)) || a.localeCompare(b));
          const row = box.append("div").style("cursor", "pointer")
            .on("click", () => highlightGroup(group));
          row.append("span").attr("style",
            `display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:${group.color}`)
            .text("");
          row.append("span").text(`G${group.rank + 1}（${group.members.length}词）：`);
          row.append("span").attr("style", "color:#7d888f").text(counts.slice(0, 5).join("、") + (counts.length > 5 ? " …" : ""));
        });
        if (clusterInfo.isolated.length) {
          box.append("div").attr("style", "color:#8a959b").text(`未连线词 ${clusterInfo.isolated.length} 个：${clusterInfo.isolated.slice(0, 6).map(n => n).join("、")}${clusterInfo.isolated.length > 6 ? " …" : ""}`);
        }
      }

      // 功能：点击图例中的群组时高亮该组成员，其余淡化；不改动布局与筛选。
      function highlightGroup(group) {
        clearKeywordEvidence();
        const members = new Set(group.members);
        visualFocus = {members, connected: d => members.has(endpointName(d.source)) && members.has(endpointName(d.target))};
        circles.attr("opacity", d => members.has(d.name) ? 1 : 0.1)
          .attr("stroke", d => members.has(d.name) ? "#17324d" : "white")
          .attr("stroke-width", d => members.has(d.name) ? 2 : 1.5);
        labels.attr("opacity", d => members.has(d.name) ? 1 : 0.1);
        lines.attr("opacity", d => edgeOpacity(d,members.has(endpointName(d.source))&&members.has(endpointName(d.target))?'focus':'dim'));
        updateVisualClarity();
        d3.select("#selection").text(`G${group.rank + 1}：${group.members.length} 个关键词。该组由共现拓扑的模块度划分得到，不是主题模型结果，需人工解释。`);
      }



      // 功能：判断当前是否处于密度视图；图例显隐与配色联动都以此为准。
      // 网络类型直接决定共现/密度，保留原view-mode作为内部兼容接口。
      d3.select('#view-mode').property('value',new URLSearchParams(location.search).get('view')==='density'?'density':'network');
      function densityActive() {
        return d3.select("#view-mode").property("value") === "density";
      }

      // 功能：把节点坐标平移到非负栅格，并为核密度估计留出四周平滑边界。
      function densityFrame(points, bandwidth) {
        if (!points.length) return null;
        const pad=bandwidth*3;
        const x0=Math.min(...points.map(d=>d.x))-pad;
        const y0=Math.min(...points.map(d=>d.y))-pad;
        return {x0,y0,width:Math.ceil(Math.max(...points.map(d=>d.x))-x0+pad),
          height:Math.ceil(Math.max(...points.map(d=>d.y))-y0+pad)};
      }

      // 功能：在同一网络坐标上进行加权核密度估计，绘制从浅黄到深红的等密度区域。
      // 权重可取论文频次或每节点等权；色标在当前图内归一，不跨筛选结果比较绝对密度。
      function drawDensity() {
        densityLayer.selectAll("*").remove();
        const active=densityActive();
        // 功能：密度/网络切换及每轮布局更新均遵守复选框，不意外重新显示已隐藏的连线。
        lineLayer.style("display",active || !d3.select('#show-links').property('checked')?"none":null);
        // 功能：热区上方保留标签层，节点和连线仍在密度模式隐藏。
        labelLayer.style("display",null);
        nodeLayer.style("display",active?"none":null);
        densityLayer.style("display",active?null:"none");
        d3.select("#density-legend").style("display",active?"block":"none");
        d3.select("#year-legend").style("display",!active && d3.select("#color-mode").property("value")==="year" && knownYears.length?"block":"none");
        d3.select("#cluster-legend").style("display",!active && d3.select("#color-mode").property("value")==="cluster"?"block":"none");
        d3.select("#color-mode").property("disabled",active);
        const bandwidth=Number(d3.select("#bandwidth").property("value"));
        d3.select("#bandwidth-value").text(bandwidth);
        if(!active||!nodes.length)return;
        const frame=densityFrame(nodes,bandwidth);
        const weighted=d3.select("#density-weight").property("value")==="frequency";
        const contours=d3.contourDensity().x(d=>d.x-frame.x0).y(d=>d.y-frame.y0)
          .weight(d=>weighted?d.count:1).size([frame.width,frame.height])
          .bandwidth(bandwidth).thresholds(20)(nodes);
        const maximum=d3.max(contours,d=>d.value)||1;
        const colors=d3.scaleSequential(d3.interpolateYlOrRd).domain([0,maximum]);
        densityLayer.attr("transform",`translate(${frame.x0},${frame.y0})`)
          .selectAll("path").data(contours).join("path")
          .attr("d",d3.geoPath()).attr("fill",d=>colors(d.value)).attr("stroke","none")
          .on("click",event=>{
            event.stopPropagation();
            clearKeywordEvidence();
            const [x,y]=d3.pointer(event,graph.node());
            const nearby=nodes.filter(d=>Math.hypot(d.x-x,d.y-y)<=bandwidth)
              .sort((a,b)=>b.count-a.count);
            d3.select("#selection").text(nearby.length
              ? `当前平滑半径内${nearby.length}个词：${nearby.map(d=>`${d.name}（${d.count}篇）`).join("；")}`
              : "点击位置的当前平滑半径内无节点；色块可能来自更远节点的平滑贡献。");
          });
      }

      // 功能：切换展示方式时使用原坐标，不重新计算布局；范围与权重只影响热区。
      function updateView() {
        clearSelection();
        drawDensity();
        // 功能：返回网络时重新生成年份/群组图例，恢复在密度模式中被清空的图例内容。
        updateColors();
        fitGraph();
      }

      // 功能：让整张网络随滚轮缩放、空白拖动平移。
      const zoom = d3.zoom().scaleExtent([0.001, 6])
        .on("zoom", event => { graph.attr("transform", event.transform); if(labels)updateVisualClarity(); });
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

      // 功能：按完整关键词精确匹配原样本，每篇按ID去重；网络显示门槛不改变论文证据口径。
      function keywordEvidence(paperList,name) {
        return [...new Map(paperList.filter(p=>(p.keywords||[]).includes(name)).map(p=>[p.id,p])).values()]
          .sort((a,b)=>(Number.isInteger(b.year)?b.year:-Infinity)-(Number.isInteger(a.year)?a.year:-Infinity)||String(a.title||a.id).localeCompare(String(b.title||b.id)));
      }
      // 功能：清除旧关键词证据，避免取消选择、换组或筛选后仍显示上一个节点的论文。
      function clearKeywordEvidence(){
        d3.select('#evidence').selectAll('*').remove();
        d3.select('#evidence').text('选中关键词节点后，这里列出包含该词的样本论文。');
      }
      // 功能：用安全文字节点列出标题、年份和OpenAlex链接，保留论文ID以便溯源。
      function showKeywordEvidence(name){
        const matches=keywordEvidence(papers,name),panel=d3.select('#evidence');
        panel.selectAll('*').remove();panel.text('');
        panel.append('strong').text(`${name}：${matches.length}篇样本论文`);
        panel.append('p').text('以下论文均包含该完整关键词；与节点出现篇数使用同一批样本，不因隐藏连线或调整网络门槛而减少。');
        if(!matches.length){panel.append('p').text('当前样本中未匹配到论文。');return;}
        const list=panel.append('ol');
        matches.forEach(paper=>{
          const item=list.append('li');
          item.append('span').text(`${Number.isInteger(paper.year)?paper.year:'年份缺失'} · `);
          if(/^https:\/\/(openalex\.org\/W\d+|arxiv\.org\/abs\/[\w.\/-]+)$/i.test(String(paper.id)))
            item.append('a').attr('href',paper.id).attr('target','_blank').attr('rel','noopener noreferrer').text(paper.title||paper.id);
          else item.append('span').text(paper.title||paper.id||'标题缺失');
        });
      }

      // 功能：清除选择高亮，不改变筛选后的网络。
      function clearSelection() {
        clearKeywordEvidence();
        visualFocus = null;
        circles.attr("opacity", 1).attr("stroke", "white").attr("stroke-width", 1.5);
        labels.attr("opacity", 1);
        lines.attr("opacity", d=>edgeOpacity(d));
        updateVisualClarity();
        d3.select("#selection").text("点击关键词查看它的直接共现关系。");
      }

      // 功能：只按当前可见的连线找邻居，点击和搜索共用此逻辑。
      function selectKeyword(selected) {
        showKeywordEvidence(selected.name);
        const neighbors = new Set([selected.name]);
        const connected = link => endpointName(link.source) === selected.name ||
          endpointName(link.target) === selected.name;
        links.filter(connected).forEach(link => {
          neighbors.add(endpointName(link.source));
          neighbors.add(endpointName(link.target));
        });
        visualFocus = {members: neighbors, connected, selected:selected.name};
        circles.attr("opacity", d => neighbors.has(d.name) ? 1 : 0.12)
          .attr("stroke", d => d.name === selected.name ? "#17324d" : "white")
          .attr("stroke-width", d => d.name === selected.name ? 3 : 1.5);
        labels.attr("opacity", d => neighbors.has(d.name) ? 1 : 0.12);
        lines.attr("opacity", d => edgeOpacity(d,connected(d)?'focus':'dim'));
        updateVisualClarity();
        d3.select("#selection").text(`${selected.name}：出现于 ${selected.count} 篇论文；平均年份 ${Number.isFinite(selected.meanYear) ? selected.meanYear.toFixed(1) : "缺失"}（有年份 ${selected.yearCount} 篇）；当前直接相连关键词 ${neighbors.size - 1} 个。`);
      }

      // 同一面积映射同时供绘制、碰撞、打包与标签偏移使用。
      let currentRadius=()=>3, sizeFrame=0;
      function nodeRadius(){
        const strength=Math.max(0,Math.min(100,Number(document.getElementById('node-size-strength').value)||0))/100;
        const nonlinear=document.getElementById('node-size-scale').value==='power';
        const domain=d3.extent(nodes,d=>d.count);
        const maximum=nonlinear?1800:30+1770*strength;
        const scale=(nonlinear?d3.scalePow().exponent(.2+2.8*strength):d3.scaleLinear()).domain(domain).range([30,maximum]).clamp(true);
        const same=!nodes.length||domain[0]===domain[1];
        currentRadius=count=>Math.sqrt((same?(30+maximum)/2:scale(count))/Math.PI);
        return count=>currentRadius(count);
      }
      function labelFontScale(){
        const maximum=Math.max(10,Math.min(40,Number(document.getElementById('label-font-size').value)||24));
        const domain=d3.extent(nodes,d=>d.count);
        // 使用节点原始权重，不依赖节点面积选项；同权重保持同字号。
        return !nodes.length||domain[0]===domain[1]?()=> (8+maximum)/2:
          d3.scaleLinear().domain(domain).range([8,maximum]).clamp(true);
      }
      function syncSizeControls(){
        const nonlinear=document.getElementById('node-size-scale').value==='power';
        const strength=Number(document.getElementById('node-size-strength').value)/100;
        document.getElementById('node-size-value').textContent=nonlinear?'指数 '+(.2+2.8*strength).toFixed(2):'差异 '+Math.round(strength*100)+'%';
        const sizeHelp=document.getElementById('node-size-help');
        if(sizeHelp)sizeHelp.textContent=nonlinear?'向右拖动强化高权重节点，向左拖动抬高中低权重节点的相对面积。':'向右拖动拉大面积差异，向左拖动减小差异；最左侧节点等大。';
        document.getElementById('label-font-size-value').textContent='8–'+document.getElementById('label-font-size').value+' px';
      }
      function updateSizeMapping(){
        sizeFrame=0;syncSizeControls();
        if(!circles||!labels)return;
        const radius=nodeRadius();
        circles.attr('r',d=>radius(d.count));
        const font=labelFontScale();
        labels.attr('font-size',d=>font(d.count)).attr('x',d=>d.x+radius(d.count)+5).attr('y',d=>d.y+4);
        const collision=simulation?.force('collision');
        if(collision)collision.radius(d=>radius(d.count)+(['community','topic'].includes(d3.select('#layout-mode').property('value'))?16:25));
        // 保留坐标与视角，D3逐tick松弛，不在滑块每次输入时同步预跑300轮。
        if(nodes.length)simulation?.alpha(.18).alphaTarget(0).restart();
        updateVisualClarity();
      }
      function scheduleSizeMapping(){if(!sizeFrame)sizeFrame=requestAnimationFrame(updateSizeMapping);}

      // 功能：按筛选结果重建图形和布局；保留孤立节点，明确显示无结果的情况。
      function renderNetwork(filtered) {
        if (simulation) simulation.stop();
        nodes = filtered.nodes;
        links = filtered.links;
        lineLayer.selectAll("*").remove();
        nodeLayer.selectAll("*").remove();
        labelLayer.selectAll("*").remove();
        d3.select("#search-message").text("");
        d3.select("#summary").text(`教学样本 ${papers.length} 篇 · 原始关键词 ${network.nodes.length} 个 · 当前节点 ${nodes.length} 个 · 当前连线 ${links.length} 条`);
        d3.select("#empty").style("display", nodes.length ? "none" : "block");
        const radius = nodeRadius();
        const font = labelFontScale();

        edgeOpacity=EdgeRendering.opacityScale(links);
        lines = lineLayer.selectAll("path").data(links).join("path").attr("fill","none")
          // 功能：线宽仍随共现次数增加，采用平方根压缩并限制最大值，避免粗线遮住节点。
          .attr("stroke", "#8495a7").attr("stroke-width", d => Math.min(3, 0.35 + Math.sqrt(d.weight) * 0.35));
        edgeView.bind(lines);
        circles = nodeLayer.selectAll("circle").data(nodes).join("circle")
          .attr("r", d => radius(d.count)).attr("fill", "#477fae");
        // 功能：名称放在圆外，并加白色文字轮廓，提高长英文标签的可读性。
        labels = labelLayer.selectAll("text").data(nodes).join("text")
          .attr("font-size", d=>font(d.count)).attr("fill", "#23394e")
          .attr("stroke", "white").attr("stroke-width", 3)
          .attr("paint-order", "stroke").attr("pointer-events", "none")
          .text(d => d.name);
        circles.append("title").text(d => `${d.name}：出现在 ${d.count} 篇论文中；平均年份 ${Number.isFinite(d.meanYear) ? d.meanYear.toFixed(1) : "缺失"}；有年份记录 ${d.yearCount} 篇`);
        // 功能：节点重建后按当前可见的节点与边重跑模块度，再上色；门槛变化会得到新的分组。
        // 分组结果同时写入 groupId，供“按群组排布”使用。
        recomputeClusters();
        applyGroupIds();
        updateColors();
        clearSelection();
        circles.on("click", (event, d) => {
          event.stopPropagation();
          selectKeyword(d);
        });
        if (!nodes.length) { drawDensity(); fitGraph(); return; }
        buildSimulation();
        // 功能：连线提示按真实共现次数显示；布局若使用归一化权重，不影响这里的口径。
        lines.append("title").text(d => `${endpointName(d.source)}—${endpointName(d.target)}：在 ${d.weight} 篇论文中共同出现`);
        // 功能：拖动单个节点；坐标以缩放后的分组为参照，避免拖动错位。
        // 拖动会以当前节点位置为起点继续受力，群落引力随之实时更新质心，不重跑整张布局。
        circles.call(d3.drag().container(graph.node())
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          }).on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }));
        fitGraph();
      }

      // 功能：把当前群组划分写回节点对象的 groupId，供“按群组分开”布局使用。
      // 未进入任何群组的孤立词标记为 null，布局时排到外圈。
      function applyGroupIds() {
        // 功能：主题布局使用与主题颜色相同的关键词映射；缺主题的节点留在外圈。
        if (["topic","bubbles"].includes(d3.select("#layout-mode").property("value")) && window.TopicPanel) {
          nodes.forEach(node => { node.groupId = TopicPanel.group(node.name); });
          return;
        }
        if (!AnalysisFeatures.modularity) {nodes.forEach(node=>{node.groupId=null;});return;}
        const groupOfName = new Map();
        clusterInfo.groups.forEach(group => group.members.forEach(name => groupOfName.set(name, group.rank)));
        nodes.forEach(node => { node.groupId = groupOfName.has(node.name) ? groupOfName.get(node.name) : null; });
      }

      // 功能：按“关联归一化”选项准备连线权重；只影响布局受力，不改变线宽与提示中的真实共现次数。
      // 关联强度 = 共现次数 /(两端词频相乘)，抵消高频词的天然高共现偏置。
      function layoutLinks() {
        const nodeWeights = new Map(nodes.map(d => [d.name, d.count]));
        const useStrength = d3.select("#weight-mode").property("value") === "strength";
        const endpoint = value => (value && typeof value === "object") ? value.name : value;
        if (!useStrength) {
          return links.map(link => ({source: endpoint(link.source), target: endpoint(link.target),
            weight: link.weight, strength: link.weight}));
        }
        return associationStrength(nodeWeights, links);
      }

      // 功能：按当前布局选项建立力模拟；拖动与滚轮缩放由外层控制器保留，不受影响。
      // 布局只改变坐标，“按群组分开”的团块位置不含相似度含义。
      function buildSimulation({reseed=true}={}) {
        // 功能：每次布局、筛选或重新训练后刷新分组依据，避免沿用旧的模块度/主题编号。
        applyGroupIds();
        const radius = nodeRadius();
        if (simulation) simulation.stop();
        const prepared = layoutLinks();
        const bubbles=d3.select("#layout-mode").property("value")==="bubbles";
        const useCommunity = ["community", "topic"].includes(d3.select("#layout-mode").property("value"));
        const attraction = Number(d3.select("#community-attraction").property("value"));
        const separation = Number(d3.select("#community-separation").property("value"));
        d3.select("#community-attraction-value").text(attraction);
        d3.select("#community-separation-value").text(separation);
        d3.select("#community-controls").style("display", useCommunity ? null : "none");
        d3.select("#bubble-controls").property("hidden",!bubbles);
        if (reseed&&(useCommunity||bubbles)) seedPackedTopicPositions(nodes,d=>radius(d.count),{
          innerGap:bubbles?Number(d3.select('#bubble-inner-gap').property('value')):3,
          outerGap:bubbles?Number(d3.select('#bubble-outer-gap').property('value')):28
        });
        // 功能：力布局只改写传入连线的 source/target；这里传入的是副本，
        // 所以绘制用的原始 lines 仍需按关键词名找回节点，不能直接读 d.source.x。
        const nodeByName = new Map(nodes.map(node => [node.name, node]));
        const endpoint = value => (value && typeof value === "object") ? value.name : value;
        const endpoints = new Map();
        links.forEach(link => {
          const a = nodeByName.get(endpoint(link.source)), b = nodeByName.get(endpoint(link.target));
          if (a && b) endpoints.set(link, [a, b]);
        });
        simulation = d3.forceSimulation(nodes)
          .force("link", d3.forceLink(prepared).id(d => d.name)
            .distance(link => useCommunity ? 62 : 145)
            // 功能：两种布局均使用所选权重；限制最大链接强度，避免高权重造成数值不稳定。
            .strength(link => Math.min(1, link.strength * (useCommunity ? 0.45 : 0.25))))
          .force("charge", d3.forceManyBody().strength(useCommunity ? -260 : -450))
          .force("center", d3.forceCenter(450, 260))
          .force("collision", d3.forceCollide().radius(d => radius(d.count) + (useCommunity ? 16 : 25)));
        if (useCommunity) {
          simulation.force("communities", forceCommunities({attraction, separation}));
        }
        if(bubbles){
          simulation.force('link',null).force('charge',null).force('collision',null)
            .force('bubble-cluster',forceTopicBubbles(d=>radius(d.count),{
              innerGap:Number(d3.select('#bubble-inner-gap').property('value')),
              outerGap:Number(d3.select('#bubble-outer-gap').property('value'))
            }));
        }
        // 功能：每轮布局计算后同步圆、线和标签位置。
        const updatePositions = () => {
          edgeView.update();
          circles.attr("cx", d => d.x).attr("cy", d => d.y);
          labels.attr("x", d => d.x + radius(d.count) + 5).attr("y", d => d.y + 4);
          drawDensity();
          updateVisualClarity();
        };
        simulation.on("tick", updatePositions).on("end",updatePositions);
        if(useCommunity){
          // D3定时器逐tick绘制；有限降温，不在主线程预跑到最终位置。
          updatePositions();
          simulation.alpha(0.75).alphaTarget(0).restart();
        }else{
          simulation.stop();
          simulation.tick(300);
          updatePositions();
        }
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
        renderNetwork(filterKeywordNetwork(network, nodeMinimum, linkMinimum));
      }

      // 功能：在当前节点中按名称包含关系查找，不区分大小写；多项命中时提示。
      function searchKeyword() {
        const query = d3.select("#keyword-search").property("value").trim().toLowerCase();
        const matches = nodes.filter(d => d.name.toLowerCase().includes(query));
        if (!query || !matches.length) {
          d3.select("#search-message").text(query ? "当前筛选结果中未找到；可降低节点门槛。" : "请输入关键词。");
          return;
        }
        const selected = matches.find(d => d.name.toLowerCase() === query) || matches[0];
        selectKeyword(selected);
        d3.select("#search-message").text(matches.length > 1 ? `找到 ${matches.length} 项，已选择 ${selected.name}；可输入更完整名称。` : `已找到：${selected.name}`);
      }

      // 功能：绑定工具栏操作；初次打开按节点频次2、共现次数1显示。
      svg.on("click", clearSelection);
      d3.select("#filter-button").on("click", applyFilters);
      d3.select("#search-button").on("click", searchKeyword);
      d3.select("#keyword-search").on("keydown", event => {
        if (event.key === "Enter") searchKeyword();
      });
      d3.select("#reset-view").on("click", fitGraph);
      d3.select("#color-mode").on("change", updateColors);
      // 功能：复选框只更新显示，保留选择和坐标，不触发模型训练、筛选或重新布局。
      d3.select('#show-all-labels').on('change', updateVisualClarity);
      d3.select('#show-links').on('change', updateVisualClarity);
      d3.select("#view-mode").on("change",updateView);
      d3.select("#density-weight").on("change",updateView);
      let densityFramePending=0;
      d3.select("#bandwidth").on("input",()=>{if(!densityFramePending)densityFramePending=requestAnimationFrame(()=>{densityFramePending=0;drawDensity();});});
      // 功能：切换布局或调整群落参数时保留缩放视角；按钮用于按当前参数重跑一次布局。
      d3.select("#layout-mode").on("change",()=>{if(nodes.length){buildSimulation();fitGraph();}});
      d3.select("#weight-mode").on("change",()=>{if(nodes.length){buildSimulation();fitGraph();}});
      // 布局滑块每帧合并输入；只替换现有模拟受力，不重建、不预跑、不重置视角。
      let layoutFrame=0;
      function updateLiveLayoutParameters(){
        layoutFrame=0;
        for(const id of ['community-attraction','community-separation','bubble-inner-gap','bubble-outer-gap'])
          d3.select('#'+id+'-value').text(d3.select('#'+id).property('value'));
        if(!nodes.length||!simulation)return;
        const mode=d3.select('#layout-mode').property('value');
        if(['community','topic'].includes(mode)){
          simulation.force('communities',forceCommunities({
            attraction:Number(d3.select('#community-attraction').property('value')),
            separation:Number(d3.select('#community-separation').property('value'))
          }));
        }else if(mode==='bubbles'){
          const radius=nodeRadius();
          simulation.force('bubble-cluster',forceTopicBubbles(d=>radius(d.count),{
            innerGap:Number(d3.select('#bubble-inner-gap').property('value')),
            outerGap:Number(d3.select('#bubble-outer-gap').property('value'))
          }));
        }else return;
        simulation.alpha(.3).alphaTarget(0).restart();
      }
      function scheduleLiveLayoutParameters(){if(!layoutFrame)layoutFrame=requestAnimationFrame(updateLiveLayoutParameters);}
      for(const id of ['community-attraction','community-separation','bubble-inner-gap','bubble-outer-gap'])
        d3.select('#'+id).on('input',scheduleLiveLayoutParameters);
      d3.select("#relayout").on("click",()=>{buildSimulation();fitGraph();});
      window.addEventListener('pagehide',()=>{
        if(layoutFrame)cancelAnimationFrame(layoutFrame);layoutFrame=0;
        if(densityFramePending)cancelAnimationFrame(densityFramePending);densityFramePending=0;
      });
      LabelLayout.observe(svg.node(),()=>{if(labels)updateVisualClarity();});
      window.addEventListener('pagehide',()=>simulation?.stop());
      d3.select('#node-size-scale').on('change',scheduleSizeMapping);
      for(const id of ['node-size-strength','label-font-size'])d3.select('#'+id).on('input',scheduleSizeMapping);
      window.addEventListener('pagehide',()=>{if(sizeFrame)cancelAnimationFrame(sizeFrame);sizeFrame=0;});
      syncSizeControls();
      applyFilters();
