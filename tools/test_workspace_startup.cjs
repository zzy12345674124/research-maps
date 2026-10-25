// 功能：用内存界面替身验证启动状态、延迟数据与错误回退，不读取真实论文，不作为GUI视觉验收。
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),gateSource=fs.readFileSync(path.join(root,'scripts/interactions/workspace-startup.js'),'utf8'),bootstrapSource=fs.readFileSync(path.join(root,'scripts/bootstrap.js'),'utf8');
function fixture(){
 let removed=false;const fields={strong:{},p:{},button:{hidden:true}},listeners=new Map(),timers=new Map();
 const box={setAttribute(){},querySelector:k=>fields[k],remove(){removed=true;}};
 const context={document:{documentElement:{dataset:{workspaceState:'loading'}},body:{},getElementById:()=>box},window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},location:{reload(){}},setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(gateSource,context);return {context,fields,listeners,timers,removed:()=>removed};
}
let f=fixture();f.context.window.WorkspaceStartup.ready();assert.equal(f.context.document.documentElement.dataset.workspaceState,'ready');assert(f.removed());assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
f=fixture();f.context.window.WorkspaceStartup.fail('测试读取失败');assert.equal(f.context.document.documentElement.dataset.workspaceState,'error');assert.equal(f.fields.p.textContent,'测试读取失败');assert.equal(f.fields.button.hidden,false);f.context.window.WorkspaceStartup.ready();assert.equal(f.context.document.documentElement.dataset.workspaceState,'error');assert(!f.removed());
f=fixture();f.listeners.get('error')({target:{tagName:'SCRIPT'}});assert.equal(f.context.document.documentElement.dataset.workspaceState,'error');
f=fixture();f.timers.get(1)();assert.equal(f.context.document.documentElement.dataset.workspaceState,'error');assert(f.fields.p.textContent.includes('本机服务'));
async function bootstrapCase(kind){
 let ready=0,failed='',resolveFetch;const config={workspace:kind!=='standalone',data:{fixture:'fixture.json'},scripts:['chart.js','workspace.js']};
 const context={URL,URLSearchParams,location:{protocol:'http:',href:'http://127.0.0.1:8765/pages/network.html'},window:{WorkspaceStartup:kind==='standalone'?undefined:{ready:()=>ready++,fail:message=>failed=message}},document:{currentScript:{dataset:{config:kind==='bad-json'?'{':JSON.stringify(config)}},readyState:'complete',body:{dataset:{},append(script){if(kind==='script-error')script.onerror();else {if(script.src.includes('workspace.js')&&kind!=='incomplete')this.dataset.workspaceReady='true';script.onload();}},prepend(){}},createElement:()=>({})},fetch:()=>kind==='delayed'?new Promise(resolve=>resolveFetch=resolve):Promise.resolve({ok:kind!=='fetch-error',status:500,json:async()=>[]})};
 vm.createContext(context);const promise=vm.runInContext(bootstrapSource,context);
 if(kind==='delayed'){assert.equal(ready,0);resolveFetch({ok:true,json:async()=>[]});}
 await promise;return {ready,failed};
}
(async()=>{
 for(const kind of ['normal','delayed']){const result=await bootstrapCase(kind);assert.equal(result.ready,1);assert.equal(result.failed,'');}
 for(const kind of ['bad-json','fetch-error','script-error','incomplete']){const result=await bootstrapCase(kind);assert.equal(result.ready,0);assert(result.failed);}
 const standalone=await bootstrapCase('standalone');assert.equal(standalone.ready,0);assert.equal(standalone.failed,'');
 for(const name of ['network','cooperation','co-citation','timeline','dual-map']){
  const html=fs.readFileSync(path.join(root,'pages',name+'.html'),'utf8');assert(html.includes('data-workspace-state="loading"'));assert(html.indexOf('workspace-startup.js')<html.indexOf('d3.v7.min.js'));assert(html.indexOf('visibility:hidden!important')<html.indexOf('<body>'));assert(html.includes('id="workspace-startup"'));assert(JSON.parse(html.match(/data-config='([^']+)'/)[1]).workspace);
 }
 assert(!fs.readFileSync(path.join(root,'pages/airline-demo.html'),'utf8').includes('data-workspace-state'));
 new vm.Script(gateSource);new vm.Script(bootstrapSource);new vm.Script(fs.readFileSync(path.join(root,'scripts/interactions/workspace.js'),'utf8'));
 console.log(JSON.stringify({passed:true,ready_only_after_workspace:true,delayed_fetch:true,errors_visible:true,timeout:true,no_reveal_after_error:true,early_gate_in_five_pages:true,standalone_unchanged:true,js_syntax:true,gui_verified:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
