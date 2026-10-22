/* 标签防重叠：统一 visit2。借鉴 Schmidt notebook 的就近遍历、命中即停和扩界剪枝；
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
  // 用实际 SVG 字形边界和屏幕矩阵测量，隐藏标签仍参与下一轮；缩放后重新查询。
  function svg(selection,{priority=d=>d?.count||0,eligible=()=>true,all=false,limit=Infinity,padding=2}={}){
    if(!selection)return;
    const boxes=[];
    selection.style('display',null).each(function(d,index){
      if(!eligible(d)){this.style.display='none';return;}
      const b=this.getBBox(),m=this.getScreenCTM();
      if(!m||!b.width||!b.height){this.style.display='none';return;}
      const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]
        .map(([x,y])=>[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f]);
      boxes.push({element:this,x0:Math.min(...points.map(p=>p[0]))-padding,y0:Math.min(...points.map(p=>p[1]))-padding,
        x1:Math.max(...points.map(p=>p[0]))+padding,y1:Math.max(...points.map(p=>p[1]))+padding,priority:priority(d,index)});
    });
    const visible=all?new Set(boxes):select(boxes,{limit});
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
    if(root.ResizeObserver)new root.ResizeObserver(refresh).observe(element);
    root.document?.fonts?.ready.then(refresh);
  }
  root.LabelLayout={visit2,select,svg,schedule,truncate,fitText,overlaps,observe};
})(globalThis);
