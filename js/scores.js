/* GridIronUI Scores — ESPN scoreboard across leagues, with day navigation. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["football/nfl","NFL"],["basketball/nba","NBA"],["baseball/mlb","MLB"],
  ["hockey/nhl","NHL"],["football/college-football","NCAAF"],
  ["basketball/mens-college-basketball","NCAAB"],["soccer/eng.1","EPL"]
];
var cur = 0, dayOffset = 0;

function ymd(d){
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
}
function dayLabel(){
  var d = new Date(); d.setDate(d.getDate()+dayOffset);
  return d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
}
function teamName(t){ return t.abbreviation || t.shortDisplayName || t.displayName; }

/* Stat-leader labels, verified against ESPN's real scoreboard payloads
   (NFL: passingYards/rushingYards/receivingYards; MLB: MLBRating).
   Unknown category keys are prettified from camelCase so nothing renders raw. */
var LEAD_LABELS = {
  passingYards:"Pass", rushingYards:"Rush", receivingYards:"Rec",
  points:"PTS", rebounds:"REB", assists:"AST", steals:"STL", blocks:"BLK",
  goals:"Goals", shots:"Shots", saves:"Saves",
  MLBRating:"Top performer"
};
function leadLabel(name){
  if(LEAD_LABELS[name]) return LEAD_LABELS[name];
  return String(name||"Leader").replace(/([a-z0-9])([A-Z])/g,"$1 $2")
    .replace(/^./, function(m){ return m.toUpperCase(); });
}
/* Full stat-leader line: one entry per ESPN leader category (first athlete each).
   Entries missing a name or stat — or the pre-game "0-0" MLB placeholder — are
   skipped rather than shown as junk. */
function leaderHtml(c){
  var cats = c.leaders||[], out = [];
  cats.forEach(function(cat){
    var L = (cat.leaders||[])[0];
    if(!L) return;
    var nm = GIU.esc((L.athlete||{}).displayName||""), val = GIU.esc(L.displayValue||"");
    if(!nm || !val || val==="0-0") return;
    out.push('<span><b>'+GIU.esc(leadLabel(cat.name))+'</b> '+nm+' <span class="num">'+val+'</span></span>');
  });
  return out.length ? '<div class="leaders">'+out.join("")+'</div>' : "";
}

/* ---- live auto-refresh machinery ----
   Scores for in-progress games re-pull the ESPN scoreboard every 60s, in
   place — no page reload, no spinner shimmer. The tick skips while the tab
   is hidden and carries on by itself when the tab returns. */
var LIVE_MS = 60000;
var liveTimer = null, autoOn = true, liveN = 0, lastUpdated = null;

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer = null; } }
function liveCount(evs){
  var n = 0;
  (evs||[]).forEach(function(ev){
    var c = ev.competitions && ev.competitions[0];
    if(c && c.status && c.status.type && c.status.type.state === "in") n++;
  });
  return n;
}
function fmtClock(ts){
  try{ return new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",second:"2-digit"}); }
  catch(e){ return ""; }
}
function renderLiveStatus(){
  var s = $("liveStatus"), b = $("pauseBtn");
  if(!s) return;
  if(liveN > 0 && autoOn){
    s.className = "live-status live";
    s.innerHTML = '<span class="live-dot" aria-hidden="true"></span>'+
      GIU.esc(liveN)+ ' live — auto-refresh every 60s'+
      (lastUpdated ? ' · updated '+GIU.esc(fmtClock(lastUpdated)) : "");
    if(b){ b.style.display = ""; b.innerHTML = "⏸ Pause live"; b.setAttribute("aria-pressed","false"); }
  } else if(liveN > 0){
    s.className = "live-status paused";
    s.textContent = liveN + " live game" + (liveN > 1 ? "s" : "") + " · auto-refresh paused";
    if(b){ b.style.display = ""; b.innerHTML = "▶ Resume live"; b.setAttribute("aria-pressed","true"); }
  } else {
    s.className = "live-status"; s.textContent = "";
    if(b){ b.style.display = "none"; }
  }
}

function load(silent){
  clearLive(); /* league/day switches and silent refreshes always reschedule */
  var box = $("scoreGrid");
  if(!silent) box.innerHTML = '<div class="card"><div class="skel" style="height:110px"></div></div>'.repeat(3);
  $("dayLabel").textContent = dayLabel();
  var d = new Date(); d.setDate(d.getDate()+dayOffset);
  var url = "https://site.api.espn.com/apis/site/v2/sports/"+LEAGUES[cur][0]+"/scoreboard?dates="+ymd(d);
  GIU.fetchJSON(url).then(function(data){
    var evs = data.events||[];
    if(!evs.length){
      box.innerHTML = '<div class="empty">No games on '+GIU.esc(dayLabel())+'. Try another day or league.</div>';
    } else {
      box.innerHTML = evs.map(function(ev){
      var c = ev.competitions[0], st = c.status.type;
      var home = c.competitors.filter(function(t){return t.homeAway==="home";})[0] || c.competitors[0];
      var away = c.competitors.filter(function(t){return t.homeAway==="away";})[0] || c.competitors[1] || {};
      var badge = st.state==="in" ? '<span class="live-badge"><i></i>'+GIU.esc(st.shortDetail||"Live")+'</span>'
        : st.state==="post" ? '<span class="tag">Final</span>'
        : '<span class="tag blue">'+GIU.esc(st.shortDetail||"Scheduled")+'</span>';
      var bc = ((c.broadcasts||[])[0]||{}).names;
      var odds = (c.odds&&c.odds[0]) ? '<span>Line: '+GIU.esc(c.odds[0].details||"")+(c.odds[0].overUnder? " · O/U "+c.odds[0].overUnder : "")+'</span>' : "";
      var leaders = leaderHtml(c);
      var hw = st.state==="post" && Number(home.score)>Number(away.score);
      var aw = st.state==="post" && Number(away.score)>Number(home.score);
      return '<div class="game-card">'+badge+
        GIU.teamRow(away, aw)+ GIU.teamRow(home, hw)+
        '<div class="game-meta"><span>'+GIU.esc((c.venue||{}).fullName||"")+'</span>'+
        (bc?'<span>📺 '+GIU.esc(bc.join(", "))+'</span>':"")+odds+'</div>'+leaders+'</div>';
      }).join("");
    }
    /* ---- live auto-refresh ----
       In-progress games keep the board fresh every 60s. Ticks skip while the
       tab is hidden (nothing to see), and resume on their own when it comes
       back — no visibility listeners needed. */
    liveN = liveCount(evs);
    lastUpdated = Date.now();
    renderLiveStatus();
    if(liveN > 0 && autoOn){
      liveTimer = setInterval(function(){ if(!isHidden()) load(true); }, LIVE_MS);
    }
  }).catch(function(){
    box.innerHTML = GIU.failBox("The ESPN scoreboard feed didn't respond for "+LEAGUES[cur][1]+".");
  });
}

$("leagueTabs").innerHTML = LEAGUES.map(function(l,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+l[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("leagueTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("leagueTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); load();
  });
});
$("prevDay").addEventListener("click", function(){ dayOffset--; load(); });
$("nextDay").addEventListener("click", function(){ dayOffset++; load(); });
$("todayBtn").addEventListener("click", function(){ dayOffset=0; load(); });
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn && liveN > 0){ load(true); }  /* resume: refresh now, timer reschedules */
  else { clearLive(); renderLiveStatus(); }
});
load();
})();
