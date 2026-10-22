/* 功能：保留原select及事件，使用玻璃按钮和浮层显示；不克隆参数或改变选项值。 */
(function(){
  'use strict';
  const controls=new Map();let active=null,serial=0;
  const make=(tag,className)=>{const el=document.createElement(tag);el.className=className;return el;};
  const textOf=option=>option.label||option.textContent;
  const visibleOptions=select=>[...select.options].filter(option=>!option.hidden&&!option.parentElement?.hidden);
  const enabled=option=>!option.disabled&&!(option.parentElement?.tagName==='OPTGROUP'&&option.parentElement.disabled);
  function setAttribute(el,key,value){if(el.getAttribute(key)!==String(value))el.setAttribute(key,String(value));}
  function sync(control){
    const {select,button,title}=control;
    const value=select.selectedOptions[0]?textOf(select.selectedOptions[0]):'请选择';
    if(title.textContent!==value)title.textContent=value;
    button.disabled=select.disabled;
    control.wrapper.hidden=select.hidden;
    const label=select.getAttribute('aria-label')||(select.labels?.[0]?[...select.labels[0].childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim():'')||select.title||'选择';
    setAttribute(button,'aria-label',`${label}：${value}`);
    const described=select.getAttribute('aria-describedby');
    if(described)setAttribute(button,'aria-describedby',described);
    else button.removeAttribute('aria-describedby');
    if(active===control){
      if(select.disabled||!select.isConnected||!button.getClientRects().length)close();
      else {
        const signature=[...select.options].map(o=>[o.value,textOf(o),o.hidden,o.disabled,o.parentElement?.hidden,o.parentElement?.disabled]);
        const key=JSON.stringify([select.selectedIndex,signature]);
        if(control.key!==key){control.key=key;renderOptions(control);}
      }
    }
  }
  function close(restoreFocus=false){
    if(!active)return;
    const control=active;active=null;
    control.menu.remove();control.menu=null;control.key=null;
    control.button.setAttribute('aria-expanded','false');control.button.removeAttribute('aria-activedescendant');
    control.button.classList.remove('is-open');control.button.removeAttribute('aria-controls');
    if(restoreFocus&&control.button.isConnected)control.button.focus({preventScroll:true});
  }
  function position(){
    if(!active)return;
    const {button,menu}=active,box=button.getBoundingClientRect();
    if(!box.width||!button.getClientRects().length){close();return;}
    const margin=10,below=window.innerHeight-box.bottom-margin,above=box.top-margin;
    const up=below<Math.min(240,menu.scrollHeight)&&above>below;
    const width=Math.min(window.innerWidth-margin*2,Math.max(box.width,220));
    const height=Math.max(40,Math.min(330,up?above-8:below-8));
    menu.style.width=width+'px';menu.style.maxHeight=height+'px';
    menu.style.left=Math.max(margin,Math.min(box.left,window.innerWidth-width-margin))+'px';
    menu.style.top=up?'auto':box.bottom+7+'px';menu.style.bottom=up?window.innerHeight-box.top+7+'px':'auto';
    menu.style.transformOrigin=up?'bottom center':'top center';menu.style.setProperty('--lg-enter-y',up?'5px':'-5px');
  }
  function highlight(control,index,scroll=true){
    control.index=index;
    control.rows.forEach((row,i)=>row.classList.toggle('is-active',i===index));
    const row=control.rows[index];
    if(row){control.button.setAttribute('aria-activedescendant',row.id);if(scroll)row.scrollIntoView({block:'nearest'});}
  }
  function choose(control,index){
    const option=control.options[index];if(!option||!enabled(option)||control.select.disabled)return;
    const changed=control.select.selectedIndex!==option.index;
    control.select.selectedIndex=option.index;close(true);sync(control);
    if(changed){control.select.dispatchEvent(new Event('input',{bubbles:true}));control.select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function renderOptions(control){
    control.options=visibleOptions(control.select);control.rows=[];control.menu.replaceChildren();
    control.options.forEach((option,index)=>{
      const row=make('div','lg-option');row.id=`${control.id}-option-${option.index}`;row.setAttribute('role','option');
      row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(!enabled(option)));
      const name=make('span','lg-option-title');name.textContent=textOf(option);
      const check=make('span','lg-option-check');check.setAttribute('aria-hidden','true');check.textContent=option.selected?'✓':'';
      row.append(name,check);row.addEventListener('pointermove',()=>{if(enabled(option))highlight(control,index,false);});
      row.addEventListener('pointerdown',event=>event.preventDefault());row.addEventListener('click',()=>choose(control,index));
      control.rows.push(row);control.menu.append(row);
    });
    const index=control.options.findIndex(option=>option.selected&&enabled(option));
    highlight(control,index>=0?index:control.options.findIndex(enabled),false);position();
  }
  function open(control){
    if(control.select.disabled)return;
    close();active=control;control.menu=make('div','lg-menu');control.menu.id=control.id+'-menu';
    control.menu.setAttribute('role','listbox');control.menu.setAttribute('aria-label',control.button.getAttribute('aria-label'));
    document.body.append(control.menu);control.button.setAttribute('aria-expanded','true');
    control.button.setAttribute('aria-controls',control.menu.id);control.button.classList.add('is-open');
    renderOptions(control);control.button.focus({preventScroll:true});
    requestAnimationFrame(()=>{if(active===control)highlight(control,control.index);});
  }
  function keydown(event,control){
    if(event.key==='Tab'){close();return;}
    if(event.key==='Escape'){if(active===control){event.preventDefault();close(true);}return;}
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
      event.preventDefault();
      if(active!==control){open(control);return;}
      if(event.key==='Enter'||event.key===' '){choose(control,control.index);return;}
      const choices=control.options.map((o,i)=>enabled(o)?i:-1).filter(i=>i>=0);if(!choices.length)return;
      let offset=choices.indexOf(control.index);
      if(event.key==='Home')offset=0;else if(event.key==='End')offset=choices.length-1;
      else offset=Math.max(0,Math.min(choices.length-1,offset+(event.key==='ArrowDown'?1:-1)));
      highlight(control,choices[offset]);
    }else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();if(active!==control)open(control);
      const now=Date.now();control.search=now-(control.searchTime||0)>650?event.key:(control.search||'')+event.key;control.searchTime=now;
      const index=control.options.findIndex(option=>enabled(option)&&textOf(option).toLocaleLowerCase().startsWith(control.search.toLocaleLowerCase()));
      if(index>=0)highlight(control,index);
    }
  }
  function upgrade(select){
    if(controls.has(select)||select.multiple||select.size>1)return;
    const wrapper=make('span','lg-select'),button=make('button','lg-trigger'),title=make('span','lg-trigger-title');
    const arrow=make('span','lg-trigger-arrow');arrow.setAttribute('aria-hidden','true');
    button.type='button';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    button.append(title,arrow);select.before(wrapper);wrapper.append(select,button);
    const control={select,wrapper,button,title,id:'lg-select-'+(++serial),menu:null,options:[],rows:[],index:-1};controls.set(select,control);
    select.classList.add('lg-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    button.addEventListener('click',event=>{event.preventDefault();active===control?close():open(control);});
    button.addEventListener('keydown',event=>keydown(event,control));
    select.addEventListener('change',()=>sync(control));select.addEventListener('input',()=>sync(control));
    select.addEventListener('focus',()=>button.focus());
    // 截获当前控件的程序赋值，主题训练完成后自动更新显示；不更改浏览器全局原型。
    for(const property of ['value','selectedIndex']){
      const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,property);
      if(descriptor?.get&&descriptor?.set)Object.defineProperty(select,property,{configurable:true,
        get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);sync(control);}});
    }
    new MutationObserver(()=>sync(control)).observe(select,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','selected','label','value','aria-label','aria-describedby']});
    sync(control);
  }
  function scan(root){if(root.nodeType!==1&&root!==document)return;if(root.matches?.('select'))upgrade(root);root.querySelectorAll?.('select').forEach(upgrade);}
  function init(){
    scan(document);
    new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)scan(node);
      for(const [select] of controls)if(!select.isConnected){if(active?.select===select)close();controls.delete(select);}
    }).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('pointerdown',event=>{if(active&&!active.wrapper.contains(event.target)&&!active.menu.contains(event.target))close();},true);
    document.addEventListener('focusin',event=>{if(active&&!active.wrapper.contains(event.target)&&!active.menu.contains(event.target))close();});
    // 容器滚动时关闭，浮层本身滚动可继续查看选项。
    document.addEventListener('scroll',event=>{if(active&&event.target!==active.menu&&!active.menu.contains(event.target))close();},true);
    window.addEventListener('resize',()=>close());window.addEventListener('pagehide',()=>close());
    document.addEventListener('reset',()=>requestAnimationFrame(()=>controls.forEach(sync)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
