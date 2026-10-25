// 功能：将已有参数和输出元素迁入统一工作台，保留原节点及事件绑定。
// DOM移动不复制控件，不重新统计论文，也不改动各图的坐标、权重和关系。
(function(){
  // 功能：集中定义当前页面/模式真正使用的参数；规则只控制显示，不清空参数或触发训练。
  function parameterVisibility(state){
    const rules={};
    if(state.page==='network.html'){
      const density=state.view==='density';
      rules['density-weight']=density;rules.bandwidth=density;
      rules['edge-render-mode']=!density;rules['show-links']=!density;rules['color-mode-toolbar']=!density;
      rules['node-controls']=!density;
      rules['bubble-controls']=state.layout==='bubbles';
      rules['weight-mode']=state.layout!=='bubbles';
      rules['weight-mode-help']=true;
      rules['community-controls']=['topic','community'].includes(state.layout);
      rules['topic-panel']=state.layout==='topic';
      rules['topic-count']=state.method!=='bertopic';rules['topic-iterations']=state.method!=='bertopic';
      rules['bertopic-parameters']=state.method==='bertopic';
    }
    if(state.page==='timeline.html'){
      const comparison=state.implementation&&state.implementation!=='original';
      const topics=comparison?state.implementation==='sophia':state.mode==='relations'||state.mode==='cluster'||(state.mode==='papers'&&state.row==='cluster');
      rules['paper-row-type']=!comparison&&state.mode==='papers';rules['edge-min']=!comparison&&state.mode==='relations';
      rules['paper-layout']=false;
      for(const id of ['mode','minimum','top','time-granularity'])rules[id]=!comparison;
      rules['timeline-topic-toolbar']=topics;rules.groups=topics;
      rules['timeline-topic-count']=state.timelineMethod!=='bertopic';rules['timeline-topic-iterations']=state.timelineMethod!=='bertopic';
      rules['timeline-bertopic-parameters']=state.timelineMethod==='bertopic';
    }
    return rules;
  }
  function setup(){
    const body=document.body;if(body.classList.contains('workspace'))return;
    const original=[...body.children].filter(el=>!['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName)&&el.id!=='workspace-startup');
    const title=body.querySelector('h2');
    // 参数区可以有比例尺预览SVG，不能将首个SVG直接当作主画布。
    const chart=body.querySelector('svg[data-workspace-chart]')||[...body.querySelectorAll('svg')].find(el=>!el.closest('.toolbar'));if(!chart)return;
    const wrapper=chart.parentElement.classList.contains('chart')?chart.parentElement:chart;
    body.classList.add('workspace');
    // 功能：建立可键盘操作的三个侧栏标签和右侧图形容器。
    let header,layout;
    if(window.ResearchMapsUI){({header,layout}=ResearchMapsUI.mountWorkbench(body));}
    else{
    header=document.createElement('header');header.className='ws-header';
    // 功能：共享顶部提供航空样例入口，同页跳转；演示页保留返回论文网络链接。
    header.innerHTML='<div class="ws-brand"><span class="ws-mark"></span>Research Maps <small>人工智能教育 · OpenAlex 100篇样本</small></div><nav class="ws-header-actions" aria-label="辅助页面"><a class="ws-demo-button" href="openalex-demo.html">OpenAlex合作演示</a><a class="ws-demo-button" href="airline-demo.html">航空捆绑演示</a><a class="ws-link" href="../docs/project-guide.html?v=20261021-releases18" target="_blank" rel="noopener noreferrer">工程说明 ↗</a></nav>';
    layout=document.createElement('div');layout.className='ws-layout';
    layout.innerHTML='<aside class="ws-sidebar"><div class="ws-tabs" role="tablist" aria-label="参数面板"><button class="ws-tab" role="tab" id="tab-view" aria-controls="panel-view" aria-selected="true">视图 View</button><button class="ws-tab" role="tab" id="tab-find" aria-controls="panel-find" aria-selected="false">查找 Find</button><button class="ws-tab" role="tab" id="tab-info" aria-controls="panel-info" aria-selected="false">说明 Info</button></div><div class="ws-panels"><section class="ws-panel" role="tabpanel" id="panel-view" aria-labelledby="tab-view"></section><section class="ws-panel" role="tabpanel" id="panel-find" aria-labelledby="tab-find" hidden></section><section class="ws-panel" role="tabpanel" id="panel-info" aria-labelledby="tab-info" hidden></section></div></aside><main class="ws-output"><div class="ws-output-head"><span class="ws-caption" style="margin:0">VISUALIZATION</span><span class="ws-output-label">OUTPUT</span></div><div class="ws-viewport"></div><div class="ws-status" aria-live="polite"></div><details class="ws-drawer"><summary>选择详情与论文证据</summary></details></main>';
    body.append(header,layout);
    }
    if(body.dataset.demo==='openalex')header.querySelector('.ws-brand small').textContent='气候变化 · 真实合作样本';
    if(window.DatasetInfo)header.querySelector('.ws-brand small').textContent=`人工智能教育 · ${DatasetInfo.source} ${DatasetInfo.count}篇样本`;
    const view=layout.querySelector('#panel-view'),find=layout.querySelector('#panel-find'),info=layout.querySelector('#panel-info');
    const viewport=layout.querySelector('.ws-viewport'),status=layout.querySelector('.ws-status'),drawer=layout.querySelector('.ws-drawer');
    if(title)layout.querySelector('.ws-output-head').insertBefore(title,layout.querySelector('.ws-output-label'));
    viewport.append(wrapper);
    if(chart.id==='timeline')viewport.classList.add('is-timeline');
    const section=document.createElement('div');section.className='ws-section';
    section.innerHTML='<div class="ws-caption">WORKSPACE</div><h3>图形选择</h3><label>图形大类<select id="workspace-category" aria-label="图形大类"></select></label><label id="network-type-label">网络类型<select id="workspace-chart" aria-label="网络类型"></select></label>';
    view.append(section);
    if(window.DatasetInfo){
      const box=document.createElement('label');box.textContent='论文数据集';
      const select=document.createElement('select');select.id='workspace-dataset';
      if(!window.OfflineLocation)select.add(new Option('arXiv 1000篇（摘要/时间线/作者）','arxiv-ai-education-1000'));
      select.add(new Option('OpenAlex 100篇（完整图表样本）','legacy100'));
      select.value=DatasetInfo.id;box.append(select);section.append(box);
      select.addEventListener('change',()=>{const url=new URL(location.href);url.searchParams.set('dataset',select.value);if(select.value!=='legacy100'&&DatasetInfo.fallback){url.pathname=url.pathname.replace(/[^/]+$/,'network.html');url.searchParams.delete('type');}if(window.WorkspaceNavigation)WorkspaceNavigation.navigate(url.href);else location.href=url.href;});
      const note=document.createElement('p');note.style.cssText='font-size:12px;line-height:1.6';note.textContent=DatasetInfo.fallback||DatasetInfo.scope_note||'原OpenAlex样本，包含参考文献及机构关系。';section.append(note);
      if(DatasetInfo.source==='arXiv'&&title)title.textContent=title.textContent.replace('关键词共现','学科分类共现');
      if(DatasetInfo.source==='arXiv')for(const note of body.querySelectorAll('.note')){
        if(note.textContent.includes('同一批OpenAlex 100篇'))note.textContent='arXiv 1000篇检索候选 · 日期为首次提交日期，支持时间线和摘要主题分析。';
        if(note.textContent.includes('月份按OpenAlex返回日期'))note.textContent='日期按arXiv首次提交时间筛选，非期刊正式出版日期。修改后点击“更新图形”。';
      }
    }
    // 功能：一级选择可视化大类，网络图二级选择分析对象；叠加/密度仍在关键词页切换。
    const category=section.querySelector('#workspace-category'),nav=section.querySelector('#workspace-chart');
    const routes=[['关键词共现','network.html?view=network'],['关键词密度','network.html?view=density'],['作者合作网络','cooperation.html?type=author'],['机构合作网络','cooperation.html?type=institution'],['文献共被引网络','co-citation.html'],['OpenAlex机构合作（捆绑对照）','openalex-demo.html']];
    const page=location.pathname.split('/').pop();
    const current=page==='network.html'?page+'?view='+(new URLSearchParams(location.search).get('view')==='density'?'density':'network'):page==='cooperation.html'?page+'?type='+(new URLSearchParams(location.search).get('type')==='institution'?'institution':'author'):page;
    const currentCategory=page==='timeline.html'?'timeline':page==='dual-map.html'?'dual-map':'network';
    [['网络图','network'],['时间线图','timeline'],['期刊双图叠加','dual-map']].forEach(([name,value])=>{const option=new Option(name,value);option.selected=value===currentCategory;category.add(option);});
    routes.forEach(([name,url])=>{const option=new Option(name,url);option.selected=current===url;nav.add(option);});
    section.querySelector('#network-type-label').hidden=currentCategory!=='network';
    const navigate=url=>{const target=new URL(url,location.href);const selected=new URLSearchParams(location.search).get('dataset');if(selected)target.searchParams.set('dataset',selected);if(window.WorkspaceNavigation)WorkspaceNavigation.navigate(target.href);else location.href=target.href;};
    category.addEventListener('change',()=>{navigate(category.value==='network'?'network.html':category.value==='timeline'?'timeline.html':'dual-map.html');});
    nav.addEventListener('change',()=>{navigate(nav.value);});
    // 功能：分隔条调整左右空间，不改图形数据、布局坐标或筛选；SVG随容器自适应。
    const divider=document.createElement('div');divider.className='ws-divider';divider.tabIndex=0;
    divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');
    divider.setAttribute('aria-label','调整参数面板宽度');divider.title='左右拖动调整宽度；方向键微调；双击恢复';
    layout.insertBefore(divider,layout.querySelector('.ws-output'));
    // 功能：仅在真实插入分隔条后启用第三列，兼容旧缓存页面。
    layout.classList.add('has-divider');
    function setSidebarWidth(value){
      const width=layout.getBoundingClientRect().width;
      const minimum=Math.min(200,width*0.4),maximum=Math.max(minimum,width-Math.min(320,width*0.45)-8);
      const next=Math.max(minimum,Math.min(maximum,value));
      layout.style.setProperty('--side',next+'px');
      divider.setAttribute('aria-valuemin',Math.round(minimum));divider.setAttribute('aria-valuemax',Math.round(maximum));divider.setAttribute('aria-valuenow',Math.round(next));
    }
    let dragging=false;
    divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();dragging=true;divider.setPointerCapture(event.pointerId);body.classList.add('ws-resizing');});
    divider.addEventListener('pointermove',event=>{if(dragging)setSidebarWidth(event.clientX-layout.getBoundingClientRect().left);});
    function stopResize(){dragging=false;body.classList.remove('ws-resizing');}
    divider.addEventListener('pointerup',stopResize);divider.addEventListener('pointercancel',stopResize);divider.addEventListener('lostpointercapture',stopResize);
    divider.addEventListener('dblclick',()=>setSidebarWidth(layout.getBoundingClientRect().width*.26));
    divider.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const currentWidth=layout.querySelector('.ws-sidebar').getBoundingClientRect().width;
      setSidebarWidth(event.key==='Home'?200:event.key==='End'?Infinity:currentWidth+(event.key==='ArrowRight'?20:-20));
    });
    window.addEventListener('resize',()=>setSidebarWidth(layout.querySelector('.ws-sidebar').getBoundingClientRect().width));
    setSidebarWidth(layout.getBoundingClientRect().width*.26);
    // 功能：按用途分类现有控件；保留原ID，原图事件不需重新绑定。
    original.forEach(el=>{
      if(el===title||el===wrapper||el===chart)return;
      if(el.matches('#summary,#stats,#selection,#message')){status.append(el);return;}
      if(el.matches('#detail,#details,#evidence')){drawer.append(el);return;}
      if(el.matches('#empty')){viewport.append(el);el.classList.add('ws-empty');return;}
      if(el.classList.contains('toolbar')){
        (el.querySelector('#keyword-search')?find:view).append(el);return;
      }
      if(el.matches('#year-legend,#density-legend,#cluster-legend')){view.append(el);return;}
      info.append(el);
    });
    // 演示区图例：移动现有节点与事件，不克隆控件。
    const legend=document.createElement('aside');legend.className='ws-plot-legend';legend.setAttribute('aria-label','图例与显示');
    const legendHeading=document.createElement('strong');legendHeading.textContent='图例';legend.append(legendHeading);
    layout.querySelector('.ws-output').append(legend);
    for(const id of ['year-legend','density-legend','cluster-legend']){
      const el=document.getElementById(id);if(el)legend.append(el);
    }
    const displayBar=document.createElement('div');displayBar.className='ws-legend-switches';
    for(const id of ['show-all-labels','show-links']){
      const input=document.getElementById(id),label=input?.closest('label');if(!label)continue;
      const old=label.closest('.toolbar');
      [...label.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());
      label.append(document.createTextNode(id==='show-links'?'连线':'全部标签'));displayBar.append(label);
      // 原卡片余下的说明不再占参数区空间。
      if(old&&!old.querySelector('input,select,button'))old.remove();
    }
    if(displayBar.children.length)legend.append(displayBar);
    const edgeSelect=document.getElementById('edge-render-mode');
    if(edgeSelect)view.append(edgeSelect.closest('.toolbar'));
    for(const el of document.querySelectorAll('#paper-legend,#relation-legend,#distribution-legend,.legend'))el.remove();
    // 没有颜色键或显示开关的图，不保留空图例标题。
    if(legend.children.length===1)legend.hidden=true;
    if(page==='network.html'){
      const color=document.getElementById('color-mode')?.closest('.toolbar');
      const sizes=document.getElementById('size-mapping-controls');
      if(color&&sizes){
        const nodeCard=document.createElement('div');nodeCard.className='toolbar ws-node-controls';nodeCard.id='node-controls';
        const heading=document.createElement('strong');heading.textContent='节点';nodeCard.append(heading);
        color.before(nodeCard);nodeCard.append(color,sizes);
        color.querySelector('#color-description')?.remove();
        color.querySelector('label')?.childNodes.forEach(n=>{if(n.nodeType===3)n.textContent='颜色';});
        sizes.querySelectorAll('strong,p.note').forEach(el=>el.remove());
        document.getElementById('node-size-help')?.remove();
        // 实时更新数值保留，解释性文案移除后不影响原节点尺寸逻辑。
        color.classList.add('ws-node-color');
      }
      const viewControl=document.getElementById('view-mode');
      if(viewControl){viewControl.closest('label').hidden=true;}
      const layoutSelect=document.getElementById('layout-mode'),weightSelect=document.getElementById('weight-mode');
      if(layoutSelect&&weightSelect){
        const row=document.createElement('div');row.className='ws-layout-row';layoutSelect.closest('.toolbar').prepend(row);
        row.append(layoutSelect.closest('label'),weightSelect.closest('label'));
        const help=document.getElementById('weight-mode-help');if(help)info.append(help);
        for(const option of weightSelect.options)option.textContent=option.value==='strength'?'关联强度':'原始次数';
      }
      const densityLegend=document.getElementById('density-legend');
      if(densityLegend)[...densityLegend.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.textContent='低密度 → 高密度');
    }
    // 同一筛选模块使用一行：两个门槛与应用按钮；原控件只移动，事件不重绑。
    const filterButton=document.getElementById('filter-button');
    const minimum=document.getElementById('min-count'),weight=document.getElementById('min-weight');
    if(filterButton&&minimum&&weight){
      const toolbar=filterButton.closest('.toolbar'),row=document.createElement('div');row.className='ws-filter-row';
      toolbar.prepend(row);
      const captions=page==='co-citation.html'?['最少被引','最少共被引']:page==='cooperation.html'?['最少参与','最少合作']:['最少出现','最少共现'];
      [minimum,weight].forEach((input,index)=>{
        const label=input.closest('label');label.title=label.textContent.trim();input.setAttribute('aria-label',label.title);
        [...label.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());
        label.prepend(document.createTextNode(captions[index]+'（篇）'));row.append(label);
      });
      const filterHost=filterButton.nextElementSibling?.matches('[data-rm-prime-host]')?filterButton.nextElementSibling:null;
      row.append(filterButton);if(filterHost)row.append(filterHost);
      filterButton.textContent='应用';filterButton.title='应用筛选';filterButton.setAttribute('aria-label','应用筛选');
    }
    // 重置视角属于画布操作，统一放在OUTPUT旁边。
    const resetControl=document.querySelector('#reset-view,#timeline-reset-view,#dual-map-reset-view');
    if(resetControl){
      const resetHost=resetControl.nextElementSibling?.matches('[data-rm-prime-host]')?resetControl.nextElementSibling:null;
      resetControl.textContent='显示全图';resetControl.setAttribute('aria-label','显示全图');
      const resetSlot=document.createElement('div');resetSlot.className='ws-header-reset';
      resetSlot.append(resetControl);if(resetHost)resetSlot.append(resetHost);
      layout.querySelector('.ws-output-head').append(resetSlot);
    }
    // 功能：原控件就地隐藏，切换模式保留输入；训练自动切换主题布局后也同步参数。
    function syncParameters(){
      const value=id=>document.getElementById(id)?.value;
      const rules=parameterVisibility({page,view:value('view-mode'),layout:value('layout-mode'),method:value('topic-method'),mode:value('mode'),row:value('paper-row-type'),timelineMethod:value('timeline-topic-method'),implementation:value('timeline-implementation')});
      Object.entries(rules).forEach(([id,visible])=>{
        let target;
        if(id==='edge-render-mode')target=document.getElementById(id)?.closest('.toolbar');
        else if(id==='color-mode-toolbar')target=document.getElementById('color-mode')?.closest('.toolbar');
        else if(id==='timeline-topic-toolbar')target=document.getElementById('timeline-topic-method')?.closest('.toolbar');
        else {const element=document.getElementById(id);target=element?.closest('label')||element;}
        if(target)target.hidden=!visible;
      });
      // 功能：暂时禁用的模块度选项不占参数菜单，原算法与选项节点保留。
      if(page==='network.html'){
        document.querySelector('#color-mode option[value="cluster"]')?.setAttribute('hidden','');
        document.querySelector('#layout-mode option[value="community"]')?.setAttribute('hidden','');
      }
    }
    layout.addEventListener('change',syncParameters);
    layout.addEventListener('click',syncParameters);
    ['topic-status','timeline-topic-status'].forEach(id=>{
      const element=document.getElementById(id);
      if(element)new MutationObserver(syncParameters).observe(element,{childList:true,subtree:true,characterData:true});
    });
    syncParameters();
    if(!find.children.length){const note=document.createElement('p');note.className='note';note.textContent='当前图形可在“视图”中按学科、年份或群组筛选，点击输出中的节点与路径查看关联。';find.append(note);}
    const infoTitle=document.createElement('div');infoTitle.className='ws-caption';infoTitle.textContent='图形含义与数据口径';info.prepend(infoTitle);
    // 功能：显示侧栏切换状态，隐藏面板不会清空参数。
    if(!window.ResearchMapsUI){
    const tabs=[...layout.querySelectorAll('.ws-tab')];
    function activate(index){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;layout.querySelector('#'+tab.getAttribute('aria-controls')).hidden=i!==index;});}
    tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>activate(index));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=(index+(event.key==='ArrowRight'?1:2))%3;activate(next);tabs[next].focus();}});});activate(0);
    }
    // 独立实验SVG没有公共D3控制器时，按画布中心调整viewBox，不更改节点坐标。
    window.WorkspaceSVGZoom=(target,factor)=>{
      if(!target)return;
      const values=(target.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
      const box=values.length===4&&values.every(Number.isFinite)&&values[2]>0&&values[3]>0?values:
        [0,0,Number(target.getAttribute('width'))||1200,Number(target.getAttribute('height'))||650];
      const [x,y,w,h]=box,cx=x+w/2,cy=y+h/2;
      const initial=target.__workspaceInitialViewBox||(target.__workspaceInitialViewBox=box.slice());
      const scale=Math.max(.25,Math.min(8,initial[2]/w*factor));
      const nextW=initial[2]/scale,nextH=initial[3]/scale;
      target.setAttribute('viewBox',[cx-nextW/2,cy-nextH/2,nextW,nextH].join(' '));
      target.__workspaceLabelZoomScale=scale;
      if(window.LabelLayout&&window.d3)LabelLayout.schedule(d3.select(target).selectAll('text').filter(d=>d&&typeof d==='object'&&!(d instanceof Date)),{priority:d=>LabelLayout.weightPriority(d.count||d.labelWeight)});
    };
    // 旧侧栏缩放卡片保留原事件节点但不再呈现，显示全图已迁至输出标题。
    for(const id of ['timeline-zoom-in','dual-map-zoom-in']){
      const bar=document.getElementById(id)?.closest('.toolbar');if(bar)bar.hidden=true;
    }
    const tools=document.createElement('div');tools.className='ws-tools';
    [['＋','放大',1.25],['−','缩小',0.8]].forEach(([symbol,label,factor])=>{
      const button=document.createElement('button');button.type='button';button.textContent=symbol;button.title=label;button.setAttribute('aria-label',label);
      button.disabled=!window.WorkspaceZoom;
      button.addEventListener('click',()=>window.WorkspaceZoom?.scaleBy(factor));tools.append(button);
    });layout.querySelector('.ws-output').append(tools);
    if(page==='timeline.html'){
      const dates=document.createElement('div');dates.className='ws-date-row';
      const start=document.getElementById('start-month');start.closest('.toolbar').prepend(dates);
      for(const id of ['start-month','end-month','time-granularity'])dates.append(document.getElementById(id).closest('label'));
      document.getElementById('exclude-jan-first').closest('label').hidden=true;
      document.getElementById('exclude-jan-first').checked=false;
      document.getElementById('reset-period').hidden=true;
      const paperLayout=document.getElementById('paper-layout');if(paperLayout)paperLayout.value='experimental';
      const viewTools=document.querySelector('.timeline-view-tools');if(viewTools)viewTools.hidden=true;
    }
    // 搜索仍使用原事件；从侧栏搬到工作台顶端。
    const search=document.createElement('div');search.className='ws-top-search';
    while(find.firstChild)search.append(find.firstChild);
    if(!search.querySelector('input')){
      search.replaceChildren();const input=document.createElement('input');input.type='search';input.placeholder='查找图中文字';input.setAttribute('aria-label','查找图中文字');
      const run=()=>{const term=input.value.trim().toLowerCase();chart.querySelectorAll('text').forEach(text=>{if(!text.hasAttribute('data-search-weight'))text.setAttribute('data-search-weight',text.style.fontWeight||'');text.style.fontWeight=term&&text.textContent.toLowerCase().includes(term)?'700':text.getAttribute('data-search-weight');});};
      const button=document.createElement('button');button.type='button';button.textContent='查找';button.setAttribute('aria-label','查找');button.addEventListener('click',run);
      input.addEventListener('input',run);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();run();}});search.append(input,button);
    }
    const searchRow=search.querySelector('.toolbar')||search;
    searchRow.classList.add('ws-search-row');
    const searchInput=searchRow.querySelector('input'),searchButton=searchRow.querySelector('button');
    // 保留网络原有搜索事件，明确输入框、按钮的同排顺序。
    if(searchInput&&searchButton){searchRow.prepend(searchInput);searchInput.after(searchButton);}
    header.append(search);
    layout.querySelector('.ws-tabs').hidden=true;view.hidden=false;find.hidden=true;info.hidden=true;
    // 功能：只在出现实际证据内容时展开，避免默认占用输出空间。
    const evidence=[...drawer.children].filter(el=>el.tagName!=='SUMMARY');
    evidence.forEach(el=>new MutationObserver(()=>{if(el.querySelector('li,strong'))drawer.open=true;}).observe(el,{childList:true,subtree:true}));
    // 功能：仅完成所有DOM迁移、参数同步与交互绑定后标记就绪。
    window.ResearchMapsUI?.upgradeControls();
    body.dataset.workspaceReady='true';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
