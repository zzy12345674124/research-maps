/* 功能：后台运行上游GPL-2.0 FDEB，保持端点与输入不变；坐标转换和绕行限制属于本工程接入策略。 */
self.d3={};
importScripts('../../library/d3-forcebundle/d3-ForceEdgeBundling.js');
self.onmessage=function(event){
 const {id,nodes,edges}=event.data;
 try{
  // 功能：将0–1的传输坐标还原到与上游航空示例相近的千像素计算尺度，避免相对步长过大。
  const span=1000,working={};
  Object.entries(nodes).forEach(([key,p])=>{working[key]={x:p.x*span,y:p.y*span};});
  const bundled=d3.ForceEdgeBundling().nodes(working).edges(edges)
   .step_size(0.1).compatibility_threshold(0.6).cycles(6).iterations(90)();
  let fallbackEdges=0;
  // 功能：对单条过度绕行路径保留原直线，不删边；1.5倍是本工程显示边界，不属于原论文算法。
  const paths=bundled.map((points,i)=>{
   const a=nodes[edges[i].source],b=nodes[edges[i].target];
   const output=points.map(p=>({x:p.x/span,y:p.y/span}));
   let length=0;for(let j=1;j<output.length;j++)length+=Math.hypot(output[j].x-output[j-1].x,output[j].y-output[j-1].y);
   const direct=Math.hypot(a.x-b.x,a.y-b.y);
   if(!output.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))||!Number.isFinite(length)||length>direct*1.5){fallbackEdges++;return [{x:a.x,y:a.y},{x:b.x,y:b.y}];}
   return output;
  });
  self.postMessage({id,paths,fallbackEdges});
 }catch(error){self.postMessage({id,error:error.message});}
};
