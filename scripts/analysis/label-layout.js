/* 标签防重叠：跨缩放3D R树索引；visit2仅用于预计算各尺度的无重叠集合。借鉴 Schmidt notebook 的就近遍历、命中即停和扩界剪枝；
 * 本项目独立实现，不修改 D3 原型。算法是 JS，JSON 只保存数据/配置。
 * https://observablehq.com/@bmschmidt/finding-text-occlusion-with-quadtrees
 */
(function(root){
  'use strict';
  const overlaps=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;
  const valid=b=>b&&[b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)&&b.x1>b.x0&&b.y1>b.y0;
  // 遍历最近的象限优先；回调 true 立即结束整个查询。扩界包含伸出格子的矩形。
  function visit2(tree,box,halfWidth,halfHeight){
    const extent=tree.extent(), first=tree.root();
    if(!first||!extent)return false;
    const stack=[{node:first,x0:extent[0][0],y0:extent[0][1],x1:extent[1][0],y1:extent[1][1]}];
    const cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
    while(stack.length){
      const q=stack.pop();
      if(q.x0-halfWidth>=box.x1||q.x1+halfWidth<=box.x0||q.y0-halfHeight>=box.y1||q.y1+halfHeight<=box.y0)continue;
      if(!q.node.length){
        for(let leaf=q.node;leaf;leaf=leaf.next)if(overlaps(box,leaf.data))return true;
        continue;
      }
      const xm=(q.x0+q.x1)/2,ym=(q.y0+q.y1)/2,children=[];
      for(let i=0;i<4;i++)if(q.node[i]){
        const child={node:q.node[i],x0:i&1?xm:q.x0,x1:i&1?q.x1:xm,y0:i&2?ym:q.y0,y1:i&2?q.y1:ym};
        const dx=Math.max(child.x0-cx,0,cx-child.x1),dy=Math.max(child.y0-cy,0,cy-child.y1);
        child.distance=dx*dx+dy*dy;children.push(child);
      }
      children.sort((a,b)=>b.distance-a.distance);stack.push(...children);
    }
    return false;
  }
  function select(items,{priority=d=>d.priority||0,limit=Infinity}={}){
    const tree=root.d3.quadtree().x(d=>(d.x0+d.x1)/2).y(d=>(d.y0+d.y1)/2);
    const visible=new Set();let halfWidth=0,halfHeight=0;
    const sorted=items.map((item,index)=>({item,index})).filter(d=>valid(d.item))
      .sort((a,b)=>(priority(b.item)-priority(a.item))||a.index-b.index);
    for(const {item} of sorted){
      if(visible.size>=limit)break;
      if(visit2(tree,item,halfWidth,halfHeight))continue;
      visible.add(item);tree.add(item);
      halfWidth=Math.max(halfWidth,(item.x1-item.x0)/2);halfHeight=Math.max(halfHeight,(item.y1-item.y0)/2);
    }
    return visible;
  }
  function truncate(text,words=6){
    const value=String(text||'').trim(),parts=value.split(/\s+/u);
    if(parts.length>1)return parts.length>words?parts.slice(0,words).join(' ')+'…':value;
    const chars=Array.from(value),maximum=words*3;
    return chars.length>maximum?chars.slice(0,maximum).join('')+'…':value;
  }
  // 项目独立实现：按离散缩放级别预计算，再以(x,y,缩放级别)构建静态packed R树。
  // Schmidt跨尺度思路参考：
  // https://observablehq.com/@bmschmidt/calculating-label-occlusion-across-zoom-levels-with-3d-r-tr
  const zoomLevels=Array.from({length:31},(_,i)=>2**(-10+i*.5));
  const intersects3=(a,b)=>a.x0<=b.x1&&a.x1>=b.x0&&a.y0<=b.y1&&a.y1>=b.y0&&a.z0<=b.z1&&a.z1>=b.z0;
  function packedRTree3(entries,depth=0){
    if(!entries.length)return null;
    const box={x0:Infinity,y0:Infinity,z0:Infinity,x1:-Infinity,y1:-Infinity,z1:-Infinity};
    for(const e of entries)for(const axis of ['x','y','z']){box[axis+'0']=Math.min(box[axis+'0'],e[axis+'0']);box[axis+'1']=Math.max(box[axis+'1'],e[axis+'1']);}
    if(entries.length<=8)return {...box,items:entries};
    const axis=['x','y','z'][depth%3];
    const sorted=entries.slice().sort((a,b)=>(a[axis+'0']+a[axis+'1'])-(b[axis+'0']+b[axis+'1']));
    const size=Math.ceil(sorted.length/8),children=[];
    for(let i=0;i<sorted.length;i+=size)children.push(packedRTree3(sorted.slice(i,i+size),depth+1));
    return {...box,children};
  }
  function queryRTree3(tree,box){
    const out=[],stack=tree?[tree]:[];
    while(stack.length){const n=stack.pop();if(!intersects3(n,box))continue;
      if(n.items){for(const item of n.items)if(intersects3(item,box))out.push(item);}else stack.push(...n.children);
    }
    return out;
  }
  function multiScaleIndex(items,{levels=zoomLevels}={}){
    const ranges=new Map(items.map(item=>[item,[]]));
    // 上一级已出现的标签优先保留，避免纯缩放时已显示标签来回消失。
    let retained=new Set();
    for(let z=0;z<levels.length;z++){
      const k=levels[z];
      const boxes=items.map(item=>({x0:item.x-item.halfWidth/k,x1:item.x+item.halfWidth/k,
        y0:item.y-item.halfHeight/k,y1:item.y+item.halfHeight/k,priority:item.priority,item}));
      boxes.sort((a,b)=>Number(retained.has(b.item))-Number(retained.has(a.item)));
      const visible=select(boxes,{priority:b=>retained.has(b.item)?Infinity:b.priority});
      retained=new Set([...visible].map(b=>b.item));
      for(const item of retained){const runs=ranges.get(item),last=runs[runs.length-1];if(last&&last.end===z-1)last.end=z;else runs.push({start:z,end:z});}
    }
    const entries=[];
    for(const [item,runs] of ranges)for(const run of runs){const k=levels[run.start];entries.push({item,z0:run.start,z1:run.end,x0:item.x-item.halfWidth/k,x1:item.x+item.halfWidth/k,y0:item.y-item.halfHeight/k,y1:item.y+item.halfHeight/k});}
    const tree=packedRTree3(entries);
    return {levels,entries,tree,query(k,viewport={x0:-Infinity,y0:-Infinity,x1:Infinity,y1:Infinity}){
      let z=0;while(z+1<levels.length&&levels[z+1]<=k)z++;
      return new Set(queryRTree3(tree,{...viewport,z0:z,z1:z}).map(e=>e.item));
    }};
  }
  const scaleCache=new WeakMap(),fontBases=new WeakMap(),scaleTimers=new Set();
  root.addEventListener?.('pagehide',()=>{for(const timer of scaleTimers)root.clearTimeout(timer);scaleTimers.clear();});
  function inversePoint(m,x,y){const det=m.a*m.d-m.b*m.c;return [(m.d*(x-m.e)-m.c*(y-m.f))/det,(-m.b*(x-m.e)+m.a*(y-m.f))/det];}
  function applyMultiScale(selection,options){
    const first=selection.node(),owner=first?.ownerSVGElement;
    if(!owner?.getScreenCTM||!first?.getAttribute)return false;
    const base=owner.getScreenCTM();if(!base||!Number.isFinite(base.a*base.d-base.b*base.c)||Math.abs(base.a*base.d-base.b*base.c)<1e-12)return false;
    const zoom=owner.__zoom||{k:1,x:0,y:0},k=zoom.k||1;
    const fontK=owner.__zoom?.k||owner.__workspaceLabelZoomScale||1;
    const {priority=d=>d?.count||0,eligible=()=>true,all=false,padding=2}=options;
    const items=[],excluded=[];
    selection.style('display',null).each(function(d,index){
      if(!eligible(d)){excluded.push(this);return;}
      const explicit=parseFloat(this.getAttribute('font-size'));
      let font=Number.isFinite(explicit)?explicit:fontBases.get(this);
      if(!font){font=parseFloat(root.getComputedStyle?.(this).fontSize)||12;fontBases.set(this,font);}
      this.style.fontSize=(font/fontK)+'px';
      this.style.setProperty?.('vector-effect','non-scaling-stroke');
    });
    selection.each(function(d,index){
      if(!eligible(d))return;
      const b=this.getBBox(),m=this.getScreenCTM();if(!m||!b.width||!b.height){excluded.push(this);return;}
      const ax=Number(this.getAttribute('x'))||0,ay=Number(this.getAttribute('y'))||0;
      const anchor=inversePoint(base,m.a*ax+m.c*ay+m.e,m.b*ax+m.d*ay+m.f);
      const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>inversePoint(base,m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f));
      const padX=padding/Math.max(1e-9,Math.hypot(base.a,base.b)),padY=padding/Math.max(1e-9,Math.hypot(base.c,base.d));
      items.push({element:this,x:(anchor[0]-(zoom.x||0))/k,y:(anchor[1]-(zoom.y||0))/k,
        halfWidth:(Math.max(...corners.map(p=>Math.abs(p[0]-anchor[0])))+padX)*fontK/k,
        halfHeight:(Math.max(...corners.map(p=>Math.abs(p[1]-anchor[1])))+padY)*fontK/k,priority:priority(d,index)});
    });
    const key=first.parentNode,round=n=>Math.round(n*1e4)/1e4;
    const signature=JSON.stringify(items.map(i=>[round(i.x),round(i.y),round(i.halfWidth),round(i.halfHeight),i.priority===Infinity?'selected':i.priority]));
    let cache=scaleCache.get(key);
    if(!cache||cache.signature!==signature||cache.items.length!==items.length||items.some((item,i)=>item.element!==cache.items[i].element)||cache.transientScale&&cache.transientScale!==fontK){
      if(cache?.timer){root.clearTimeout(cache.timer);scaleTimers.delete(cache.timer);}
      // 运动中仅构建当前尺度的3D切片；坐标稳定120ms后构建完整跨尺度索引。
      // 避免每个beeswarm tick都预计算31个级别。
      const deferred=typeof root.setTimeout==='function';
      cache={signature,items,index:multiScaleIndex(items,deferred?{levels:[fontK]}:{}),transientScale:deferred?fontK:null};scaleCache.set(key,cache);
      if(deferred){const own=cache;cache.timer=root.setTimeout(()=>{
        scaleTimers.delete(own.timer);
        if(scaleCache.get(key)!==own||!key.isConnected)return;
        own.index=multiScaleIndex(own.items);own.transientScale=null;own.timer=null;
        schedule(selection,options);
      },120);scaleTimers.add(cache.timer);}
    }
    let viewport;
    const clip=owner.closest?.('.ws-viewport')?.getBoundingClientRect?.()||owner.getBoundingClientRect?.();
    if(clip&&clip.width>0&&clip.height>0){
      const corners=[[clip.left,clip.top],[clip.right,clip.top],[clip.left,clip.bottom],[clip.right,clip.bottom]].map(([x,y])=>inversePoint(base,x,y));
      viewport={x0:(Math.min(...corners.map(p=>p[0]))-(zoom.x||0))/k,x1:(Math.max(...corners.map(p=>p[0]))-(zoom.x||0))/k,
        y0:(Math.min(...corners.map(p=>p[1]))-(zoom.y||0))/k,y1:(Math.max(...corners.map(p=>p[1]))-(zoom.y||0))/k};
    }
    const visible=all?new Set(cache.items):cache.index.query(fontK,viewport);
    excluded.forEach(el=>{el.style.display='none';});
    cache.items.forEach(item=>{item.element.style.display=visible.has(item)?'':'none';});
    return true;
  }
  // 用实际 SVG 字形边界和屏幕矩阵测量，隐藏标签仍参与下一轮；缩放后重新查询。
  function svg(selection,{priority=d=>d?.count||0,eligible=()=>true,all=false,limit=Infinity,padding=2}={}){
    if(!selection)return;
    if(applyMultiScale(selection,{priority,eligible,all,limit,padding}))return;
    const boxes=[], excluded=[];
    // 先集中恢复显示，再完成所有测量，最后集中写回，避免读写交错。
    selection.style('display',null).each(function(d,index){
      if(!eligible(d)){excluded.push(this);return;}
      const b=this.getBBox(),m=this.getScreenCTM();
      if(!m||!b.width||!b.height){excluded.push(this);return;}
      const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]
        .map(([x,y])=>[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f]);
      boxes.push({element:this,x0:Math.min(...points.map(p=>p[0]))-padding,y0:Math.min(...points.map(p=>p[1]))-padding,
        x1:Math.max(...points.map(p=>p[0]))+padding,y1:Math.max(...points.map(p=>p[1]))+padding,priority:priority(d,index)});
    });
    const visible=all?new Set(boxes):select(boxes,{limit});
    excluded.forEach(element=>{element.style.display='none';});
    boxes.forEach(b=>{b.element.style.display=visible.has(b)?'':'none';});
  }
  const pending=new WeakMap();
  function schedule(selection,options){
    const key=selection?.node()?.parentNode;if(!key)return;
    const previous=pending.get(key);if(previous){previous.selection=selection;previous.options=options;return;}
    const task={selection,options};pending.set(key,task);
    root.requestAnimationFrame(()=>{pending.delete(key);if(key.isConnected)svg(task.selection,task.options);});
  }
  // 行名限定在时间线左栏内，完整文本另存 title，不改变日期坐标。
  function fitText(selection,width=320){
    selection.each(function(){
      let text=this.textContent;this.textContent=text;
      if(this.getComputedTextLength()<=width)return;
      const chars=Array.from(text);let lo=0,hi=chars.length;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);this.textContent=chars.slice(0,mid).join('')+'…';
        if(this.getComputedTextLength()<=width)lo=mid;else hi=mid-1;}
      this.textContent=chars.slice(0,lo).join('')+'…';
    });
  }
  function observe(element,refresh){
    root.addEventListener('resize',refresh);
    if(root.ResizeObserver){
      let width=null,height=null;
      new root.ResizeObserver(entries=>{
        const rect=entries[0]?.contentRect;if(!rect)return;
        if(width!==null&&Math.abs(rect.width-width)<0.5&&Math.abs(rect.height-height)<0.5)return;
        width=rect.width;height=rect.height;refresh();
      }).observe(element);
    }
    root.document?.fonts?.ready.then(refresh);
  }
  // 未知权重排在真实0之后，选中项始终优先；不以日期冒充影响力。
  function weightPriority(weight,selected=false){return selected?Infinity:Number.isFinite(weight)&&weight>=0?weight:-1;}
  function paperWeights(papers){
    const unique=new Map(papers.filter(p=>p.id).map(p=>[p.id,p]));
    const total=[...unique.values()].some(p=>Number.isFinite(p.cited_by_count)&&p.cited_by_count>=0);
    const recorded=[...unique.values()].some(p=>Array.isArray(p.referenced_works)&&p.referenced_works.length);
    const scope=total?'数据源总被引次数':recorded?'样本内被引次数（仅依据已记录引用）':'被引数据缺失';
    const values=new Map([...unique].map(([id,p])=>[id,total?(Number.isFinite(p.cited_by_count)&&p.cited_by_count>=0?p.cited_by_count:null):recorded?0:null]));
    if(!total&&recorded)for(const [source,p] of unique)for(const target of new Set(p.referenced_works||[]))if(target!==source&&values.has(target))values.set(target,values.get(target)+1);
    return {values,scope};
  }
  root.LabelLayout={multiScaleIndex,packedRTree3,queryRTree3,visit2,select,svg,schedule,truncate,fitText,overlaps,observe,weightPriority,paperWeights};
})(globalThis);
