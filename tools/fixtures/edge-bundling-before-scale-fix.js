/* 功能：后台运行上游GPL-2.0 FDEB源码，只接收复制坐标和边，不访问论文或更改节点。 */
self.d3={};
importScripts('../../library/d3-forcebundle/d3-ForceEdgeBundling.js');
self.onmessage=function(event){
 const {id,nodes,edges}=event.data;
 try{
  // 功能：归一化坐标下使用有限迭代，端点由上游固定；大图由前端明确回退，不采样删边。
  const result=d3.ForceEdgeBundling().nodes(nodes).edges(edges).step_size(0.02).compatibility_threshold(0.6).cycles(5).iterations(35)();
  self.postMessage({id,paths:result});
 }catch(error){self.postMessage({id,error:error.message});}
};
