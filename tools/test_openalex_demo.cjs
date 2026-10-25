// 只用合成合作数据验证筛选和源代码语法，不加载真实论文或运行真实网络捆绑。
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'scripts/charts/openalex-demo.js'),'utf8');
const context={setTimeout,clearTimeout,setInterval,clearInterval,performance};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'library/d3/d3.v7.min.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'scripts/analysis/node-collision.js'),'utf8'),context);vm.runInContext(source.slice(0,source.indexOf('const demoData')),context);
const data={nodes:[{name:'a',longitude:1,latitude:2},{name:'b',longitude:3,latitude:4},{name:'c',longitude:5,latitude:6}],edges:[{source:'a',target:'b',weight:2,paperIds:['one','two']},{source:'b',target:'c',weight:1,paperIds:['one']}]};
const before=JSON.stringify(data),filtered=context.filterOpenAlexDemo(data,2);
assert.equal(filtered.nodes.length,2);assert.equal(filtered.links.length,1);assert.equal(filtered.links[0].weight,2);assert.deepEqual(filtered.links[0].paperIds,['one','two']);
filtered.nodes[0].x=99;filtered.links[0].weight=99;assert.equal(JSON.stringify(data),before);
assert.equal(context.filterOpenAlexDemo(data,3).nodes.length,0);
// 合成节点验证力导向有限坐标、地理恢复及原边端点不被D3改写。
const forceNodes=data.nodes.map(node=>({...node,count:2})),forceLinks=data.edges.map(edge=>({...edge}));
const originalLinks=JSON.stringify(forceLinks),project=([lon,lat])=>[lon*10,lat*10];
context.layoutOpenAlexDemo(forceNodes,forceLinks,'force',project,()=>5);
assert(forceNodes.every(node=>Number.isFinite(node.x)&&Number.isFinite(node.y)));
assert.equal(JSON.stringify(forceLinks),originalLinks);
assert(forceLinks.every(edge=>typeof edge.source==='string'&&typeof edge.target==='string'));
assert(forceNodes.some(node=>Math.abs(node.x-node.longitude*10)>1));
context.layoutOpenAlexDemo(forceNodes,forceLinks,'geographic',project,()=>5);
assert(forceNodes.every(node=>node.x===node.longitude*10&&node.y===node.latitude*10));
assert(forceNodes.every(node=>!('vx' in node)&&!('fx' in node)));
context.layoutOpenAlexDemo([],[],'force',project,()=>5);
new vm.Script(source);new vm.Script(fs.readFileSync(path.join(root,'scripts/interactions/workspace.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'pages/openalex-demo.html'),'utf8');assert(html.includes('data-workspace-state="loading"'));assert(html.includes('data-demo="openalex"'));
const config=JSON.parse(html.match(/data-config='([^']+)'/)[1]);assert(config.workspace);assert.equal(config.data.openAlexDemo,'../data/demo/openalex-climate-institutions.json');
assert(config.scripts.indexOf('../scripts/analysis/label-layout.js')<config.scripts.indexOf('../scripts/charts/openalex-demo.js'));
console.log(JSON.stringify({passed:true,synthetic_filtering:true,force_layout:true,geography_restore:true,string_endpoints_preserved:true,input_unchanged:true,evidence_preserved:true,empty_state:true,syntax:true,startup_gate:true,gui_verified:false,real_bundling_run:false}));
