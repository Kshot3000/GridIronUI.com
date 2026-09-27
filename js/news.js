/* GridIronUI News — ESPN league news feeds, with live auto-refresh.
   The wire re-pulls silently every 3 minutes while the tab is visible, so
   headlines stay fresh on game days without a reload. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["football/nfl","NFL"],["basketball/nba","NBA"],["baseball/mlb","MLB"],
  ["hockey/nhl","NHL"],["football/college-football","NCAAF"],
  ["basketball/mens-college-basketball","NCAAB"],["soccer/eng.1","EPL"]
];
var cur = 0;

/* ---- live auto-refresh machinery ----
   The news feed re-pulls silently every 3 minutes — no skeleton shimmer.
   Ticks skip while the tab is hidden and resume on their own. */
var LIVE_MS = 3*60*1000;
var liveTimer = null, autoOn = true, lastUpdated = null;
var tabSeq = 0; /* render generation: a slow tab response never overwrites a newer tab */

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer = null; } }
function fmtClock(ts){
  try{ return new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",second:"2-digit"}); }
  catch(e){ return ""; }
}
function renderLiveStatus(){
  var s = $("liveStatus"), b = $("pauseBtn");
  if(!s) return;
  if(autoOn){
    s.className = "live-status live";
    s.innerHTML = '<span class="live-dot" aria-hidden="true"></span>'+
      'auto-refresh every 3 min'+
      (lastUpdated ? ' · updated '+GIU.esc(fmtClock(lastUpdated)) : "");
    if(b){ b.style.display = ""; b.innerHTML = "⏸ Pause live"; b.setAttribute("aria-pressed","false"); }
  } else {
    s.className = "live-status paused";
    s.textContent = "auto-refresh paused";
    if(b){ b.style.display = ""; b.innerHTML = "▶ Resume live"; b.setAttribute("aria-pressed","true"); }
  }
}

function ago(iso){
  var t = Date.parse(iso); if(!isFinite(t)) return "";
  var m = Math.floor((Date.now()-t)/60000);
  if(m < 60) return m+"m ago";
  var h = Math.floor(m/60); if(h < 24) return h+"h ago";
  return Math.floor(h/24)+"d ago";
}
function renderArticles(arts){
  var box = $("newsGrid");
  if(!arts.length){ box.innerHTML = '<div class="empty">No headlines right now.</div>'; return; }
  box.innerHTML = arts.map(function(a){
    var img = (a.images&&a.images[0]&&a.images[0].url)
      ? '<img class="card-img" loading="lazy" src="'+a.images[0].url+'" alt="">' : "";
    var link = (a.links&&a.links.web&&a.links.web.href) || "#";
    var desc = a.description||"";
    desc = desc.length>160 ? desc.slice(0,160)+"…" : desc;
    return '<a class="card" href="'+link+'" target="_blank" rel="noopener">'+img+
      '<div class="game-meta" style="margin:8px 0 6px"><span class="tag">'+LEAGUES[cur][1]+'</span><span>'+ago(a.published)+'</span></div>'+
      '<h3>'+GIU.esc(a.headline)+'</h3><p>'+GIU.esc(desc)+'</p></a>';
  }).join("");
}
function load(silent){
  clearLive(); /* tab switches and silent refreshes always reschedule */
  var mySeq = ++tabSeq;
  var box = $("newsGrid");
  if(!silent) box.innerHTML = '<div class="card"><div class="skel" style="height:150px"></div></div>'.repeat(4);
  GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/"+LEAGUES[cur][0]+"/news?limit=24").then(function(d){
    if(mySeq !== tabSeq) return; /* a newer tab switch already won — discard */
    renderArticles(d.articles||[]);
    lastUpdated = Date.now();
    renderLiveStatus();
    if(autoOn) liveTimer = setInterval(function(){ if(!isHidden()) load(true); }, LIVE_MS);
  }).catch(function(){
    if(mySeq !== tabSeq) return;
    box.innerHTML = GIU.failBox("The ESPN news feed didn't respond for "+LEAGUES[cur][1]+".");
  });
}
$("newsTabs").innerHTML = LEAGUES.map(function(l,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+l[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("newsTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("newsTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); load();
  });
});
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn){ load(true); }  /* resume: refresh now, timer reschedules */
  else { clearLive(); renderLiveStatus(); }
});
load();
})();
