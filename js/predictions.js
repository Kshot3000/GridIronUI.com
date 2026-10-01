/* GridIronUI Predictions — market-implied probabilities, honestly labeled.
   These are NOT our picks. They are live Polymarket prices converted to probabilities.
   Series are looked up live per league so the page survives series rotation. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [["NFL","nfl"],["NBA","nba"],["MLB","mlb"],["NHL","nhl"],["EPL","epl"]];
var curKey = "nfl";
/* Kalshi snapshot file per league: NFL game-winners + MLB postseason
   game-winners, both rebuilt server-side by scripts/fetch-kalshi.py. */
var SNAP = {nfl: "data/kalshi-nfl.json", mlb: "data/kalshi-mlb.json"};
/* Render generation: every tab click bumps tabSeq, and each async callback
   only touches the DOM if its generation is still current. Without this, a
   slow response for one league can overwrite another league's cards the user
   asked for in the meantime. */
var tabSeq = 0;

/* ---- live auto-refresh machinery (same contract as markets.js v1.21.0) ----
   Polymarket prices move with the games, so the cards keep themselves fresh
   in place — no reload, no skeleton shimmer. The refresh tick only runs while
   a shown game is likely in-progress (started within the last 4 hours —
   Polymarket exposes startTime but no in-progress flag, and games rarely run
   longer). Ticks skip while the tab is hidden and resume on their own when it
   returns. Timers never stack: every load clears the old timer first. */
var PM_MS = 90000, LIVE_WINDOW_MS = 4*3600*1000, SPOT_MS = 60000;
var liveTimer = null, autoOn = true, liveN = 0, lastUpdated = null;
/* Spotlight countdown: the nearest upcoming game's kickoff countdown ticks
   every 60s without network traffic. spotIso is the featured game's kickoff
   in ISO form; null means no spotlight is showing. */
var spotTimer = null, spotIso = null;

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){
  if(liveTimer){ clearInterval(liveTimer); liveTimer = null; }
  if(spotTimer){ clearInterval(spotTimer); spotTimer = null; }
  spotIso = null;
}
/* Spotlight countdown text via the home strip's tested kickoffIn (v1.124.0);
   null when the API is unavailable — the static kickoff time still shows. */
function spotCountdown(iso){
  try{
    var hs = window.GIU && window.GIU.homeStrip;
    if(hs && hs.kickoffIn) return hs.kickoffIn(iso);
  }catch(e){}
  return null;
}
function tickSpot(){
  var el = $("spotCountdown");
  if(!el || !spotIso){ if(spotTimer){ clearInterval(spotTimer); spotTimer = null; } return; }
  var cd = spotCountdown(spotIso);
  if(cd === null){
    /* Kickoff passed while the visitor watched: rebuild silently so the
       next upcoming game is featured instead of a stale countdown. */
    load(curKey, tabSeq, true);
    return;
  }
  el.textContent = cd;
}
function likelyLive(rows){
  var now = Date.now(), n = 0;
  (rows||[]).forEach(function(r){
    var t = startOf(r.ev || {});
    if(t < now && now - t < LIVE_WINDOW_MS) n++;
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
      GIU.esc(liveN + (liveN > 1 ? " live games" : " live game") + " — auto-refresh every 90s")+
      (lastUpdated ? " · updated "+GIU.esc(fmtClock(lastUpdated)) : "");
    if(b){ b.style.display = ""; b.innerHTML = "⏸ Pause live"; b.setAttribute("aria-pressed","false"); }
  } else if(liveN > 0){
    s.className = "live-status paused";
    s.textContent = liveN + (liveN > 1 ? " games" : " game") + " · auto-refresh paused";
    if(b){ b.style.display = ""; b.innerHTML = "▶ Resume live"; b.setAttribute("aria-pressed","true"); }
  } else {
    s.className = "live-status"; s.textContent = "";
    if(b){ b.style.display = "none"; }
  }
}
function parseArr(s){ try{ var v = typeof s==="string"?JSON.parse(s):s; return Array.isArray(v)?v:[]; }catch(e){ return []; } }

function skel(){
  $("predGrid").innerHTML = '<div class="card"><div class="skel" style="height:140px"></div></div>'+
    '<div class="card"><div class="skel" style="height:140px"></div></div>';
}
/* League-aware "next game" label for the spotlight kicker. */
var SPOT_KICKER = {nfl:"Next kickoff", nba:"Next tip-off", mlb:"Next first pitch",
                   nhl:"Next puck drop", epl:"Next kick-off"};
/* The nearest upcoming game with a real future kickoff, or null. Rows are
   pre-sorted by start time; dateless rows (Infinity) are skipped, never
   featured. */
function nextUpcoming(rows){
  var now = Date.now(), r = null;
  (rows||[]).forEach(function(x){
    if(r) return;
    var t = startOf(x.ev || {});
    if(isFinite(t) && t > now) r = x;
  });
  return r;
}
/* Card HTML shared by the grid and the spotlight: matchup header, kickoff
   time, Polymarket probability bars, the Kalshi cross-check when matched,
   and the source-market link. */
function cardInner(r, dir, key){
  var t = fmtT(r.ev.startTime || r.ev.eventDate);
  var slug = r.ev.slug||"";
  var tp = String(r.ev.title||"").split(/\s+vs\.?\s+/);
  var head = (tp.length===2 && GIU.vsHeader(dir, key, tp[0], tp[1])) ||
    '<h3 style="margin:10px 0 4px;font-size:1.02rem">'+GIU.esc(r.ev.title)+'</h3>';
  var body;
  if(r.mls.length===1){
    /* classic 2-way: team vs team */
    var o = parseArr(r.mls[0].outcomes), p = parseArr(r.mls[0].outcomePrices);
    var p0 = Math.round(Number(p[0])*100);
    if(/^Yes$/i.test(o[0]) && /^No$/i.test(o[1])){
      body = probRow(shortQ(r.mls[0].question)+" — Yes", p0, r.mls[0].oneWeekPriceChange) + probRow(shortQ(r.mls[0].question)+" — No", 100-p0);
    } else {
      body = probRow(o[0], p0, r.mls[0].oneWeekPriceChange) + probRow(o[1], 100-p0);
    }
  } else {
    /* 3-way style (soccer): each market's Yes price, with its own 7d move */
    body = r.mls.map(function(m){
      var p = parseArr(m.outcomePrices);
      return probRow(shortQ(m.question), Math.round(Number(p[0])*100), m.oneWeekPriceChange);
    }).join("");
  }
  return '<span class="tag green">Market-implied</span>'+
    head+
    (t ? '<div class="game-meta" style="margin-bottom:12px"><span>'+t+'</span></div>' : '<div style="height:8px"></div>')+
    body+
    ((r.km && window.Kalshi) ? window.Kalshi.predRow(r.km.nameA, r.km.aPct, r.km.nameB, r.km.bPct, r.km.updatedAt, r.km.pmA, r.km) : "")+
    '<div class="game-meta"><span>Source: Polymarket live price</span>'+(slug?'<a href="https://polymarket.com/event/'+GIU.esc(slug)+'" target="_blank" rel="noopener">View market →</a>':"")+'</div>';
}
function fmtT(iso){
  try{ var d=new Date(iso); if(!isFinite(d)) return "";
    return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+" · "+
           d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }catch(e){ return ""; }
}
function seriesFor(key){
  return GIU.fetchJSON("https://gamma-api.polymarket.com/sports").then(function(ss){
    var s = (ss||[]).filter(function(x){ return x.sport===key; })[0];
    if(!s || !s.series) throw new Error("no-series");
    return s.series;
  });
}
function startOf(ev){
  var t = Date.parse(ev.startTime || ev.eventDate || "");
  return isFinite(t) ? t : Infinity;
}
function shortQ(q){
  return String(q||"").replace(/^Will /,"").replace(/ on \d{4}-\d{2}-\d{2}\??$/,"")
    .replace(/ end in a draw\??$/," draw").replace(/\?$/,"");
}
function probRow(label, pct, chg){
  var hot = pct>=50;
  /* 7-day price movement reported by Polymarket for this market (0-1 units).
     Shown once per market, next to the first outcome — no derived claims. */
  var c = Number(chg), chip = "";
  if(isFinite(c) && Math.abs(c) >= 0.001){
    chip = ' <span class="'+(c>0?"mv-up":"mv-dn")+'" style="font-size:.78rem" title="7-day price change for this market, reported by Polymarket — where the money has been pushing the price.">'+
      (c>0?"▲ +":"▼ −")+(Math.abs(c)*100).toFixed(1)+'¢ 7d</span>';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:.9rem">'+GIU.esc(label)+'</span><b class="num" style="font-size:1.25rem;color:'+(hot?"var(--gold-soft)":"var(--muted)")+'">'+pct+'%'+chip+'</b></div>'+
  '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);margin-bottom:12px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(hot?"linear-gradient(90deg,var(--green),var(--gold))":"rgba(255,255,255,.18)")+'"></div></div>';
}
function load(key, my, silent){
  key = key || curKey; curKey = key;
  my = (my===undefined) ? tabSeq : my;
  clearLive(); /* tab switches and silent refreshes always reschedule */
  if(!silent) skel();
  seriesFor(key).then(function(sid){
    var reqs = [
      GIU.fetchJSON(GIU.pmEventsUrl(sid)),
      GIU.teamDir()
    ];
    /* Kalshi snapshots cover NFL and MLB postseason game-winner markets.
       Fetched alongside everything else; a slow or failed snapshot resolves
       to null and simply means no Kalshi rows — the Polymarket cards never
       wait. */
    if(SNAP[key]) reqs.push(GIU.fetchJSON(SNAP[key]).catch(function(){ return null; }));
    return Promise.all(reqs);
  }).then(function(x){
    if(my !== tabSeq) return; /* user moved to another league meanwhile */
    var d = x[0], dir = x[1];
    var snap = SNAP[key] ? (x[2] || null) : null;
    var evs = Array.isArray(d) ? d : (d.events||[]);
    var rows = [];
    evs.forEach(function(ev){
      var title = ev.title||"";
      if(title.indexOf(" vs")<0 || / - /.test(title)) return;  /* main game events only */
      var mls = (ev.markets||[]).filter(function(m){
        return !m.closed && m.active!==false && m.sportsMarketType==="moneyline";
      }).filter(function(m){
        var o=parseArr(m.outcomes), p=parseArr(m.outcomePrices);
        return o.length===2 && p.length===2 && isFinite(Number(p[0])) && isFinite(Number(p[1]));
      });
      if(!mls.length) return;
      rows.push({ev:ev, mls:mls});
    });
    rows.sort(function(a,b){ return startOf(a.ev)-startOf(b.ev); });
    rows = rows.slice(0,10);
    /* Kalshi cross-check (NFL + MLB postseason): match each Polymarket game
       to the snapshot via the tested Disagree.matches; unmatchable games are
       dropped, never guessed. Only 2-way rows get a row — a clean
       side-by-side comparison. */
    if(snap && snap.games && window.Disagree && window.Kalshi){
      /* Settled games never cross-check: a finished game has no live
         Polymarket price to compare against, and its 99c side is a result,
         not a prediction. */
      var klGames = snap.games.filter(function(g){ return !window.Kalshi.settled(g); });
      /* "What moved" wiring (v1.129.0): the fetch script bakes a
         snapshot-to-snapshot diff into the file (K.diffMoves contract).
         K.moveIndex turns it into an exact event-ticker + team-abbr lookup
         so each Kalshi row can badge sides whose price moved 2c+ since the
         previous snapshot — the same treatment the markets page cards got.
         A team that can't be joined exactly gets no badge, never a guess. */
      var mi = window.Kalshi.moveIndex(snap, window.Disagree.kalshiTeamAbbr);
      rows.forEach(function(r){
        if(r.mls.length !== 1) return;
        var m = window.Disagree.matches([r.ev], klGames, dir, GIU.teamFind, key)[0];
        if(m){
          var gm = m.kalshiTicker ? (mi.byGame[m.kalshiTicker] || {}) : {};
          r.km = {nameA: m.nameA, aPct: m.kalshiA, nameB: m.nameB,
                  bPct: m.kalshiB, updatedAt: snap.updated_at, pmA: m.pmA,
                  dA: gm[m.abbrA], dB: gm[m.abbrB], prevAt: mi.prevAt};
        }
      });
    }
    if(!rows.length){
      $("predGrid").innerHTML = '<div class="empty">No upcoming game markets with clear win probabilities for this league right now — check back closer to game day.</div>';
      var ps = $("predSpot"); if(ps) ps.innerHTML = "";
      liveN = 0; renderLiveStatus();
      return;
    }
    /* ---- "Next game" spotlight (v1.125.0) ----
       The nearest upcoming game gets a featured card above the grid: a
       live-ticking kickoff countdown, the same Polymarket probability bars
       and Kalshi cross-check as a normal card, and it's removed from the
       grid so it never appears twice. Quiet when every listed game has
       already started — the grid alone covers it. */
    var spot = nextUpcoming(rows);
    var gridRows = spot ? rows.filter(function(r){ return r !== spot; }) : rows;
    var spotEl = $("predSpot");
    if(spotEl){
      if(spot){
        var kicker = SPOT_KICKER[key] || "Next game";
        var iso = spot.ev.startTime || spot.ev.eventDate || "";
        var cd = spotCountdown(iso);
        spotIso = iso;
        spotEl.innerHTML =
          '<div class="card" style="border:1px solid var(--gold-glow);box-shadow:0 0 28px rgba(240,180,41,.12)">'+
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px">'+
          '<span class="tag" style="background:var(--gold);color:#171204;font-weight:800;letter-spacing:.05em">'+GIU.esc(kicker)+'</span>'+
          (cd ? '<span id="spotCountdown" class="num" style="color:var(--gold-soft);font-weight:800;font-size:1rem">'+GIU.esc(cd)+'</span>' : "")+
          '</div>'+
          cardInner(spot, dir, key)+
          '</div>';
        if(cd && !spotTimer){
          spotTimer = setInterval(tickSpot, SPOT_MS);
        }
      } else {
        spotEl.innerHTML = "";
      }
    }
    $("predGrid").innerHTML = gridRows.map(function(r){
      return '<div class="card">'+cardInner(r, dir, key)+'</div>';
    }).join("");
    /* ---- live auto-refresh ----
       Refresh in-place every 90s, but only while a shown game is likely
       in-progress — otherwise the timer would burn requests on dead pages. */
    liveN = likelyLive(rows);
    lastUpdated = Date.now();
    renderLiveStatus();
    if(liveN > 0 && autoOn){
      liveTimer = setInterval(function(){ if(!isHidden()) load(curKey, tabSeq, true); }, PM_MS);
    }
  }).catch(function(){
    if(my !== tabSeq) return; /* user moved to another league meanwhile */
    $("predGrid").innerHTML = GIU.failBox("Polymarket's API didn't respond, so there are no implied probabilities to show.");
    liveN = 0; renderLiveStatus();
  });
}
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn && liveN > 0){
    /* resume: refresh now; the loader reschedules the timer */
    load(curKey, tabSeq, true);
  } else { clearLive(); renderLiveStatus(); }
});
load(curKey, ++tabSeq);
Array.prototype.forEach.call($("predTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("predTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active");
    load(t.getAttribute("data-k"), ++tabSeq);
  });
});
})();
