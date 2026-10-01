/* GridIronUI Injuries — ESPN injuries feed per league, with live auto-refresh.
   The board re-pulls silently every 3 minutes while the tab is visible,
   mirroring the news wire — designations change on game days, and that's
   what moves lines. Search and severity filter survive silent refreshes;
   players new or changed since the last check get an honest badge
   (js/inj-live.js diffing), and the live-status pill carries the updated
   clock with a pause/resume control. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["football/nfl","NFL"],["basketball/nba","NBA"],["baseball/mlb","MLB"],
  ["hockey/nhl","NHL"],["football/college-football","NCAAF"],
  ["basketball/mens-college-basketball","NCAAB"],["soccer/eng.1","EPL"]
];
var cur = 0, data = [];

/* ---- live auto-refresh machinery ----
   Silent 3-minute re-pulls; ticks skip while the tab is hidden and resume on
   their own. prevStatus/changedKind are the per-league diff baseline: a
   league switch resets them, so badges always mean "since you last checked
   THIS league". */
var LIVE_MS = 3*60*1000;
var liveTimer = null, autoOn = true, lastUpdated = null;
var tabSeq = 0; /* render generation: a slow tab response never overwrites a newer tab */
var prevStatus = null, changedKind = {};
var LIV = (typeof window !== "undefined" && window.InjLive) || null;
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
      (lastUpdated ? ' · updated '+fmtClock(lastUpdated) : "");
    if(b){ b.style.display = ""; b.innerHTML = "⏸ Pause live"; b.setAttribute("aria-pressed","false"); }
  } else {
    s.className = "live-status paused";
    s.textContent = "auto-refresh paused";
    if(b){ b.style.display = ""; b.innerHTML = "▶ Resume live"; b.setAttribute("aria-pressed","true"); }
  }
}
/* Team-identity directory key per ESPN league path (NCAA leagues have no
   directory — teamHead falls back to the plain heading). */
var DIRKEY = {"football/nfl":"nfl","basketball/nba":"nba","baseball/mlb":"mlb",
              "hockey/nhl":"nhl","soccer/eng.1":"epl"};
var tdir = {};
GIU.teamDir().then(function(d){ tdir = d||{}; if(data.length) render($("injSearch").value||""); });
/* Severity ranking for betting relevance: Out > Doubtful > Questionable > everything else.
   Statuses are ESPN free text, verified live 2026-09-29: NFL uses Out / Injured Reserve /
   Doubtful / Questionable; NBA "Day-To-Day"; MLB/NHL use IL forms ("15-Day-IL", "60-Day-IL");
   plus non-injury statuses (Active, Suspension, Bereavement, Paternity) which sort last.
   Note: "Active" entries are dropped at load (see isHealthy) — they are healthy
   players, not injuries. */
function sevRank(s){
  s = String(s||"");
  if(/out|injured reserve|\bil\b|injured list/i.test(s)) return 3;
  if(/doubtful/i.test(s)) return 2;
  if(/questionable|day[- ]to[- ]day/i.test(s)) return 1;
  return 0;
}
var SEVS = [["all","All"],["out","Out"],["doubtful","Doubtful"],["questionable","Questionable"]];
var sevF = -1; /* filter rank: -1 = all */
/* ESPN's injuries endpoint lists healthy players as "Active" with fantasy-news
   blurbs (e.g. "Brissett put together one of his signature stat lines…") — they
   are not injuries, and on 2026-09-29 they were 632 of 800 NFL entries (79%),
   burying the real designations on the default view. The board drops them at
   load, so "All" means all remaining designations. Non-injury ABSENCES
   (Suspension, Paternity, Bereavement) are kept — a missing starter moves
   lines whether the reason is an injury or not. */
function isHealthy(status){
  return /^\s*active\s*$/i.test(String(status||""));
}
var SEV_RANK = {all:-1, out:3, doubtful:2, questionable:1};
function teamWeight(t){
  var w = 0;
  (t.injuries||[]).forEach(function(i){
    var r = sevRank(i.status);
    w += r===3?10 : r===2?5 : r===1?2 : 0;
  });
  return w;
}
function sevCounts(t){
  var c = [0,0,0,0];
  (t.injuries||[]).forEach(function(i){ c[sevRank(i.status)]++; });
  return c;
}
function detailText(i){
  /* ESPN injury entries carry longComment/shortComment strings, but `details`
     and `type` are OBJECTS ({type, location, detail, side, returnDate} etc).
     Rendering them raw produced "[object Object]". */
  if(i.longComment) return i.longComment;
  if(i.shortComment) return i.shortComment;
  var det = i.details || {}, parts = [];
  [det.type, det.location].forEach(function(v){
    if(v && parts.indexOf(v)===-1) parts.push(v);
  });
  if(det.detail && det.detail!=="Not Specified") parts.push(det.detail);
  if(det.side && det.side!=="Not Specified") parts.push(det.side+" side");
  var s = parts.join(" · ");
  if(det.returnDate) s += (s?" — ":"")+"expected back "+String(det.returnDate).slice(0,10);
  if(!s && i.type && i.type.description) s = i.type.description;
  return s;
}
function statusTag(s){
  s = String(s||"").toLowerCase();
  if(/out|injured reserve|ir\b/.test(s)) return '<span class="tag red">'+GIU.esc(s)+'</span>';
  if(/doubtful/.test(s)) return '<span class="tag red">'+GIU.esc(s)+'</span>';
  if(/questionable|day-to-day/.test(s)) return '<span class="tag">'+GIU.esc(s)+'</span>';
  return '<span class="tag blue">'+GIU.esc(s||"—")+'</span>';
}
function teamTag(t){
  var c = sevCounts(t), parts = [];
  if(c[3]) parts.push('<span class="tag red">'+c[3]+' out</span>');
  if(c[2]) parts.push('<span class="tag red">'+c[2]+' doubtful</span>');
  if(c[1]) parts.push('<span class="tag">'+c[1]+' questionable</span>');
  parts.push('<span class="tag blue">'+(t.injuries||[]).length+' reported</span>');
  return parts.join(" ");
}
function passSev(i){ return sevF===-1 || sevRank(i.status)===sevF; }
function load(silent){
  clearLive(); /* tab switches and silent refreshes always reschedule */
  var mySeq = ++tabSeq;
  var box = $("injGrid");
  if(!silent) box.innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>'.repeat(3);
  GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/"+LEAGUES[cur][0]+"/injuries").then(function(d){
    if(mySeq !== tabSeq) return; /* a newer tab switch already won — discard */
    data = (d.injuries||[]).map(function(t){
      /* Healthy players are not injuries — drop them before anything else. */
      t.injuries = (t.injuries||[]).filter(function(i){ return !isHealthy(i.status); });
      return t;
    }).filter(function(t){ return (t.injuries||[]).length; });
    /* Bettors care about the worst news first: teams with the most severe
       injuries top the grid, and each card lists its worst cases first. */
    data.sort(function(a,b){ return teamWeight(b)-teamWeight(a); });
    data.forEach(function(t){
      (t.injuries||[]).sort(function(a,b){ return sevRank(b.status)-sevRank(a.status); });
    });
    /* Diff against the last check for this league: new/changed designations
       get an honest badge. First load is the baseline — no false flags. */
    if(LIV){
      var diff = LIV.diffStatuses(prevStatus, data);
      changedKind = diff.changed; prevStatus = diff.next;
    }
    lastUpdated = Date.now();
    render($("injSearch").value||""); /* silent refreshes keep your search + filter */
    renderLiveStatus();
    if(autoOn) liveTimer = setInterval(function(){ if(!isHidden()) load(true); }, LIVE_MS);
  }).catch(function(){
    if(mySeq !== tabSeq) return;
    box.innerHTML = GIU.failBox("The ESPN injuries feed didn't respond for "+LEAGUES[cur][1]+".");
  });
}
function render(q){
  q = q.toLowerCase();
  var box = $("injGrid");
  var teams = data.filter(function(t){
    var injs = (t.injuries||[]).filter(passSev);
    if(!injs.length) return false;
    t._shown = injs;
    if(!q) return true;
    if((t.displayName||"").toLowerCase().indexOf(q)!==-1) return true;
    return injs.some(function(i){
      return (((i.athlete||{}).displayName||"")+" "+detailText(i)+" "+(i.status||"")).toLowerCase().indexOf(q)!==-1;
    });
  });
  var what = sevF===-1 ? "" : ' with status "'+SEVS.filter(function(s){return SEV_RANK[s[0]]===sevF;})[0][1]+'"';
  if(!teams.length){ box.innerHTML = '<div class="empty">No injuries'+GIU.esc(what)+' match "'+GIU.esc(q)+'" for '+LEAGUES[cur][1]+' right now.</div>'; return; }
  box.innerHTML = teams.map(function(t){
    var teamNm = t.displayName || t.name || "Team";
    var rows = (t._shown||t.injuries).map(function(i){
      var nm = ((i.athlete||{}).displayName)||"Unknown";
      var detail = detailText(i);
      var badge = "";
      if(LIV){
        var kind = changedKind[LIV.statusKey(teamNm, nm)];
        if(kind) badge = " "+LIV.badgeHtml(kind);
      }
      return '<div class="gloss-term" style="padding:10px 0"><h3 style="font-size:.95rem">'+GIU.esc(nm)+badge+' '+statusTag(i.status)+'</h3>'+
        '<p>'+GIU.esc(detail)+'</p>'+
        (i.date?'<p style="font-size:.78rem;color:var(--faint)">Updated '+GIU.esc(i.date.slice(0,10))+'</p>':"")+'</div>';
    }).join("");
    return '<div class="card">'+GIU.teamHead(tdir, DIRKEY[LEAGUES[cur][0]], t.displayName, teamNm)+'<p style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px">'+teamTag(t)+'</p>'+rows+'</div>';
  }).join("");
}
$("injSev").innerHTML = SEVS.map(function(s,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-sev="'+s[0]+'">'+s[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("injSev").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("injSev").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); sevF = SEV_RANK[t.getAttribute("data-sev")]; render($("injSearch").value||"");
  });
});
$("injTabs").innerHTML = LEAGUES.map(function(l,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+l[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("injTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("injTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); $("injSearch").value="";
    sevF = -1;
    prevStatus = null; changedKind = {}; /* new league, new baseline */
    Array.prototype.forEach.call($("injSev").querySelectorAll(".tab"), function(x){
      x.classList.toggle("active", x.getAttribute("data-sev")==="all");
    });
    load();
  });
});
var deb=null;
$("injSearch").addEventListener("input", function(){
  clearTimeout(deb); var v=this.value;
  deb=setTimeout(function(){ render(v); }, 220);
});
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn){ load(true); }  /* resume: refresh now, timer reschedules */
  else { clearLive(); renderLiveStatus(); }
});
load();
})();
