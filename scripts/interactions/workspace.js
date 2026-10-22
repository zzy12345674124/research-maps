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
      rules['community-controls']=['topic','community'].includes(state.layout);
      rules['topic-count']=state.method!=='bertopic';rules['topic-iterations']=state.method!=='bertopic';
      rules['bertopic-parameters']=state.method==='bertopic';
    }
    if(state.page==='timeline.html'){
      const topics=state.mode==='relations'||state.mode==='cluster'||(state.mode==='papers'&&state.row==='cluster');
      rules['paper-row-type']=state.mode==='papers';rules['edge-min']=state.mode==='relations';
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
    const chart=body.querySelector('svg');if(!chart)return;
    const wrapper=chart.parentElement.classList.contains('chart')?chart.parentElement:chart;
    body.classList.add('workspace');
    // 功能：建立可键盘操作的三个侧栏标签和右侧图形容器。
    const header=document.createElement('header');header.className='ws-header';
    // 功能：共享顶部提供航空样例入口，同页跳转；演示页保留返回论文网络链接。
    header.innerHTML='<div class="ws-brand"><span class="ws-mark"></span>Research Maps <small>人工智能教育 · OpenAlex 100篇样本</small></div><nav class="ws-header-actions" aria-label="辅助页面"><a class="ws-demo-button" href="openalex-demo.html">OpenAlex合作演示</a><a class="ws-demo-button" href="airline-demo.html">航空捆绑演示</a><a class="ws-link" href="../docs/project-guide.html?v=20261021-releases18" target="_blank" rel="noopener noreferrer">工程说明 ↗</a></nav>';
    if(body.dataset.demo==='openalex')header.querySelector('.ws-brand small').textContent='气候变化 · 真实合作样本';
    const layout=document.createElement('div');layout.className='ws-layout';
    layout.innerHTML='<aside class="ws-sidebar"><div class="ws-tabs" role="tablist" aria-label="参数面板"><button class="ws-tab" role="tab" id="tab-view" aria-controls="panel-view" aria-selected="true">视图 View</button><button class="ws-tab" role="tab" id="tab-find" aria-controls="panel-find" aria-selected="false">查找 Find</button><button class="ws-tab" role="tab" id="tab-info" aria-controls="panel-info" aria-selected="false">说明 Info</button></div><div class="ws-panels"><section class="ws-panel" role="tabpanel" id="panel-view" aria-labelledby="tab-view"></section><section class="ws-panel" role="tabpanel" id="panel-find" aria-labelledby="tab-find" hidden></section><section class="ws-panel" role="tabpanel" id="panel-info" aria-labelledby="tab-info" hidden></section></div></aside><main class="ws-output"><div class="ws-output-head"><span class="ws-caption" style="margin:0">VISUALIZATION</span><span class="ws-output-label">OUTPUT</span></div><div class="ws-viewport"></div><div class="ws-status" aria-live="polite"></div><details class="ws-drawer"><summary>选择详情与论文证据</summary></details></main>';
    body.append(header,layout);
    const view=layout.querySelector('#panel-view'),find=layout.querySelector('#panel-find'),info=layout.querySelector('#panel-info');
    const viewport=layout.querySelector('.ws-viewport'),status=layout.querySelector('.ws-status'),drawer=layout.querySelector('.ws-drawer');
    if(title)layout.querySelector('.ws-output-head').insertBefore(title,layout.querySelector('.ws-output-label'));
    viewport.append(wrapper);
    if(chart.id==='timeline')viewport.classList.add('is-timeline');
    const section=document.createElement('div');section.className='ws-section';
    section.innerHTML='<div class="ws-caption">WORKSPACE</div><h3>图形选择</h3><label>图形大类<select id="workspace-category" aria-label="图形大类"></select></label><label id="network-type-label">网络类型<select id="workspace-chart" aria-label="网络类型"></select></label>';
    view.append(section);
    // 功能：一级选择可视化大类，网络图二级选择分析对象；叠加/密度仍在关键词页切换。
    const category=section.querySelector('#workspace-category'),nav=section.querySelector('#workspace-chart');
    const routes=[['关键词共现 / 叠加 / 密度','network.html'],['作者合作网络','cooperation.html?type=author'],['机构合作网络','cooperation.html?type=institution'],['文献共被引网络','co-citation.html'],['OpenAlex机构合作（捆绑对照）','openalex-demo.html']];
    const page=location.pathname.split('/').pop();
    const current=page==='cooperation.html'?page+'?type='+(new URLSearchParams(location.search).get('type')==='institution'?'institution':'author'):page;
    const currentCategory=page==='timeline.html'?'timeline':page==='dual-map.html'?'dual-map':'network';
    [['网络图','network'],['时间线图','timeline'],['期刊双图叠加','dual-map']].forEach(([name,value])=>{const option=new Option(name,value);option.selected=value===currentCategory;category.add(option);});
    routes.forEach(([name,url])=>{const option=new Option(name,url);option.selected=current===url;nav.add(option);});
    section.querySelector('#network-type-label').hidden=currentCategory!=='network';
    category.addEventListener('change',()=>{location.href=category.value==='network'?'network.html':category.value==='timeline'?'timeline.html':'dual-map.html';});
    nav.addEventListener('change',()=>{location.href=nav.value;});
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
    divider.addEventListener('dblclick',()=>setSidebarWidth(286));
    divider.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const currentWidth=layout.querySelector('.ws-sidebar').getBoundingClientRect().width;
      setSidebarWidth(event.key==='Home'?200:event.key==='End'?Infinity:currentWidth+(event.key==='ArrowRight'?20:-20));
    });
    window.addEventListener('resize',()=>setSidebarWidth(layout.querySelector('.ws-sidebar').getBoundingClientRect().width));
    setSidebarWidth(layout.querySelector('.ws-sidebar').getBoundingClientRect().width);
    const caption=document.createElement('h3');caption.textContent='参数微调';caption.style.cssText='font-size:12px;font-weight:500;text-align:center;margin:24px 0 18px';view.append(caption);
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
    // 功能：原控件就地隐藏，切换模式保留输入；训练自动切换主题布局后也同步参数。
    function syncParameters(){
      const value=id=>document.getElementById(id)?.value;
      const rules=parameterVisibility({page,view:value('view-mode'),layout:value('layout-mode'),method:value('topic-method'),mode:value('mode'),row:value('paper-row-type'),timelineMethod:value('timeline-topic-method')});
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
    const tabs=[...layout.querySelectorAll('.ws-tab')];
    function activate(index){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;layout.querySelector('#'+tab.getAttribute('aria-controls')).hidden=i!==index;});}
    tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>activate(index));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=(index+(event.key==='ArrowRight'?1:2))%3;activate(next);tabs[next].focus();}});});activate(0);
    // 功能：网络图使用已有D3缩放控制器；非网络图不提供无效缩放按钮。
    const tools=document.createElement('div');tools.className='ws-tools';
    const canZoom=typeof zoom!=='undefined'&&typeof zoom.scaleBy==='function';
    [['＋','放大',1.25],['−','缩小',0.8],['⊙','显示全图',null]].forEach(([symbol,label,factor])=>{
      const button=document.createElement('button');button.type='button';button.textContent=symbol;button.title=label;button.setAttribute('aria-label',label);button.disabled=!canZoom;
      button.addEventListener('click',()=>{if(factor)window.d3.select(chart).call(zoom.scaleBy,factor);else{const reset=document.querySelector('#reset-view');if(reset)reset.click();}});tools.append(button);
    });layout.querySelector('.ws-output').append(tools);
    // 功能：只在出现实际证据内容时展开，避免默认占用输出空间。
    const evidence=[...drawer.children].filter(el=>el.tagName!=='SUMMARY');
    evidence.forEach(el=>new MutationObserver(()=>{if(el.querySelector('li,strong'))drawer.open=true;}).observe(el,{childList:true,subtree:true}));
    // 功能：仅完成所有DOM迁移、参数同步与交互绑定后标记就绪。
    body.dataset.workspaceReady='true';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
