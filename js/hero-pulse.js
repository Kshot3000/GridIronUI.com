/* GridIronUI hero canvas — "market pulse".
   Drifting glowing line charts over a faint grid: a trading-terminal feel for
   the hero. Chart drift runs at half speed (stepEvery doubled on 2026-09-27)
   with a continuous per-frame glide between data steps so the motion is
   smooth, never choppy.
   Behind the charts falls a gentle rain of balls, bills, and tokens.
   Pure decoration (aria-hidden). Disabled entirely under
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
    if(rain.length) rain.forEach(function(p){ p.x = Math.min(p.x, W); });
    else seedRain();
  }
  function makeLine(color, amp, yBase, width, stepEvery){
    var pts=[], n=90, v=0.5, i;
    for(i=0;i<n;i++){ v+=(Math.random()-0.5)*0.12; v=Math.max(0.06,Math.min(0.94,v)); pts.push(v); }
    return { color:color, amp:amp, yBase:yBase, width:width, stepEvery:stepEvery, pts:pts, off:0,
      step:function(){
        var v=this.pts[this.pts.length-1]+(Math.random()-0.5)*0.10;
        this.pts.push(Math.max(0.06,Math.min(0.94,v))); this.pts.shift();
      } };
  }
  var lines = [
    makeLine("240,180,41", 0.30, 0.56, 2.2, 6),  /* gold — hero line (half speed) */
    makeLine("23,201,100", 0.22, 0.64, 1.8, 8),  /* felt green (half speed) */
    makeLine("74,168,255", 0.26, 0.46, 1.4, 4)   /* ice blue (half speed) */
  ];
  /* ---- falling rain: balls, bills, and tokens drifting down behind the charts ---- */
  var RAIN_GLYPHS = [
    { g:"\uD83C\uDFC8", kind:"emoji" },                          /* football */
    { g:"\u26BE",       kind:"emoji" },                          /* baseball */
    { g:"\uD83C\uDFC0", kind:"emoji" },                          /* basketball */
    { g:"\uD83D\uDCB5", kind:"emoji" },                          /* hundred-dollar bill */
    { g:"\u20BF",       kind:"token", bg:"240,180,41",  fg:"#241a05" }, /* bitcoin */
    { g:"eth",          kind:"eth",   bg:"150,170,255" }                /* ethereum */
  ];
  /* Ethereum octahedron mark: four facets in two blues, drawn with paths so
     it reads as the ETH diamond on every platform (no font glyph needed). */
  function ethDiamond(r){
    var w=r*0.62, t=-r, b=r, m=r*0.24;
    ctx.beginPath(); ctx.moveTo(0,t); ctx.lineTo(-w,0); ctx.lineTo(0,m); ctx.closePath();
    ctx.fillStyle="#a9bcfb"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,t); ctx.lineTo(w,0); ctx.lineTo(0,m); ctx.closePath();
    ctx.fillStyle="#7e96f4"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,b); ctx.lineTo(-w,0); ctx.lineTo(0,m); ctx.closePath();
    ctx.fillStyle="#627eea"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,b); ctx.lineTo(w,0); ctx.lineTo(0,m); ctx.closePath();
    ctx.fillStyle="#4a5fc4"; ctx.fill();
  }
  var rain = [];
  function scatter(p, initial){
    p.x = Math.random()*W;
    p.y = initial ? Math.random()*H : -p.size - Math.random()*H*0.25;
    p.size = 15 + Math.random()*15;                 /* 15–30px */
    p.vy = 0.35 + Math.random()*0.60;              /* gentle fall */
    p.sway = 0.2 + Math.random()*0.8;              /* horizontal drift */
    p.phase = Math.random()*Math.PI*2;
    p.rot = (Math.random()-0.5)*0.6;
    p.vr = (Math.random()-0.5)*0.01;
    p.alpha = 0.28 + Math.random()*0.17;
    p.gl = RAIN_GLYPHS[(Math.random()*RAIN_GLYPHS.length)|0];
  }
  function seedRain(){
    var n = Math.max(12, Math.min(30, Math.round(W/46)));
    rain = [];
    for(var i=0;i<n;i++){ var p={}; scatter(p, true); rain.push(p); }
  }
  function drawRain(){
    var i, p, r;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    for(i=0;i<rain.length;i++){
      p = rain[i];
      p.y += p.vy;
      p.x += Math.sin(frame/55 + p.phase)*p.sway*0.35;
      p.rot += p.vr;
      if(p.y > H + p.size + 8) scatter(p, false);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha;
      if(p.gl.kind === "eth"){
        r = p.size*0.62;
        ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
        ctx.fillStyle = "rgba("+p.gl.bg+",0.30)"; ctx.fill();
        ethDiamond(r*0.72);
      }else if(p.gl.kind === "token"){
        r = p.size*0.58;
        ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
        ctx.fillStyle = "rgba("+p.gl.bg+",0.85)"; ctx.fill();
        ctx.font = "bold "+Math.round(p.size*0.72)+"px sans-serif";
        ctx.fillStyle = p.gl.fg;
        ctx.fillText(p.gl.g, 0, 1);
      }else{
        ctx.font = Math.round(p.size)+"px serif";
        ctx.fillText(p.gl.g, 0, 0);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
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
    drawRain();   /* balls, bills, and tokens fall behind the charts */
    lines.forEach(function(L, li){
      var dx=W/(L.pts.length-1);
      if(frame % L.stepEvery === 0){ L.step(); L.off=0; }
      /* glide left a fraction of one point-width per frame between data steps,
         so the half-speed drift stays continuous instead of jumping */
      else L.off-=dx/L.stepEvery;
      var i, x, y;
      ctx.beginPath();
      for(i=0;i<L.pts.length;i++){
        x=(i/(L.pts.length-1))*W+L.off;
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
