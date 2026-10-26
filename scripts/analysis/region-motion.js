// 拖动仅改变坐标；将区域限制在原侧，避免施引与被引区域混在一起。
function dualRegionDelta(nodes,side,height,dx,dy){
 if(!nodes.length)return {dx:0,dy:0};
 const lo=side==='left'?35:635,hi=side==='left'?565:1165;
 const minX=Math.min(...nodes.map(n=>n.x-(n.radius||0))),maxX=Math.max(...nodes.map(n=>n.x+(n.radius||0)));
 const minY=Math.min(...nodes.map(n=>n.y-(n.radius||0))),maxY=Math.max(...nodes.map(n=>n.y+(n.radius||0)));
 return {dx:Math.max(lo-minX,Math.min(hi-maxX,dx)),dy:Math.max(65-minY,Math.min(height-25-maxY,dy))};
}
function jellyDecay(elapsed){return elapsed>=650?0:Math.exp(-elapsed/145)*Math.cos(elapsed/55);}
