/* GridIronUI hero canvas — "market pulse".
   Drifting glowing line charts over a faint grid: a trading-terminal feel for
   the hero. Pure decoration (aria-hidden). Disabled entirely under
   prefers-reduced-motion; paused when the tab is hidden or the hero scrolls
   out of view so it never burns battery in the background. */
(function(){
"use strict";
function init(){
  var cv = document.getElementById("heroPulse");
  if(!cv || !cv.getContext) return;
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var ctx = cv.getContext("2d");
  var W=0, H=0, running=false, heroVisible=true, frame=0;

  function size(){
    var DPR = Math.min(2, window.devicePixelRatio||1);
    var r = cv.parentElement.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W*DPR; cv.height = H*DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  function makeLine(color, amp, yBase, width, stepEvery){
    var pts=[], n=90, v=0.5, i;
    for(i=0;i<n;i++){ v+=(Math.random()-0.5)*0.12; v=Math.max(0.06,Math.min(0.94,v)); pts.push(v); }
    return { color:color, amp:amp, yBase:yBase, width:width, stepEvery:stepEvery, pts:pts,
      step:function(){
        var v=this.pts[this.pts.length-1]+(Math.random()-0.5)*0.10;
        this.pts.push(Math.max(0.06,Math.min(0.94,v))); this.pts.shift();
      } };
  }
  var lines = [
    makeLine("240,180,41", 0.30, 0.56, 2.2, 3),  /* gold — hero line */
    makeLine("23,201,100", 0.22, 0.64, 1.8, 4),  /* felt green */
    makeLine("74,168,255", 0.26, 0.46, 1.4, 2)   /* ice blue */
  ];
  function draw(){
    if(!running) return;
    frame++;
    ctx.clearRect(0,0,W,H);
    /* faint terminal grid */
    ctx.strokeStyle="rgba(255,255,255,0.05)"; ctx.lineWidth=1;
    var gx, gy;
    ctx.beginPath();
    for(gx=0.5; gx<W; gx+=72){ ctx.moveTo(gx,0); ctx.lineTo(gx,H); }
    for(gy=0.5; gy<H; gy+=56){ ctx.moveTo(0,gy); ctx.lineTo(W,gy); }
    ctx.stroke();
    lines.forEach(function(L, li){
      if(frame % L.stepEvery === 0) L.step();
      var i, x, y;
      ctx.beginPath();
      for(i=0;i<L.pts.length;i++){
        x=(i/(L.pts.length-1))*W;
        y=H*(L.yBase+(L.pts[i]-0.5)*L.amp*2);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.strokeStyle="rgba("+L.color+",0.55)";
      ctx.lineWidth=L.width;
      ctx.shadowColor="rgba("+L.color+",0.75)";
      ctx.shadowBlur=14;
      ctx.stroke();
      ctx.shadowBlur=0;
      /* soft area glow under the hero (gold) line */
      if(li===0){
        ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath();
        var gr=ctx.createLinearGradient(0,0,0,H);
        gr.addColorStop(0,"rgba(240,180,41,0.10)");
        gr.addColorStop(1,"rgba(240,180,41,0)");
        ctx.fillStyle=gr; ctx.fill();
      }
    });
    requestAnimationFrame(draw);
  }
  function setRunning(on){
    if(on && !running){ running=true; requestAnimationFrame(draw); }
    else if(!on && running){ running=false; }
  }
  size();
  window.addEventListener("resize", size);
  document.addEventListener("visibilitychange", function(){
    setRunning(!document.hidden && heroVisible);
  });
  if("IntersectionObserver" in window){
    new IntersectionObserver(function(es){
      heroVisible = es[0].isIntersecting;
      setRunning(heroVisible && !document.hidden);
    }, {threshold:0}).observe(cv.parentElement);
  }
  setRunning(true);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
