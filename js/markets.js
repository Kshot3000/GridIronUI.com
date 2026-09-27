/* GridIronUI Prediction Markets — Polymarket gamma API (CORS-open).
   Kalshi is intentionally NOT fetched: their public API blocks browser CORS.
   Game markets come from each league's current series (looked up live, so the
   page keeps working when Polymarket rotates series). */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["NFL","nfl"], ["NBA","nba"], ["MLB","mlb"],
  ["NHL","nhl"], ["College Football","cfb"], ["EPL","epl"]
];
var cur = 0;
/* Render generation: every tab click bumps tabSeq, and each async callback
   only touches the DOM if its generation is still current. Without this, a
   slow Polymarket response (or its error box) can overwrite a Kalshi render
   the user asked for in the meantime — or one league's cards can land on
   another league's tab. */
var tabSeq = 0;

/* ---- live auto-refresh machinery (same contract as scores.js v1.20.0) ----
   Polymarket prices move with the games, and the Kalshi snapshot gets rebuilt
   server-side roughly every 15 minutes, so both tabs keep themselves fresh in
   place — no reload, no skeleton shimmer. Ticks skip while the tab is hidden
   and resume on their own when it returns. Timers never stack: every load
   clears the old timer before scheduling a new one. */
var PM_MS = 90000, KAL_MS = 300000, LIVE_WINDOW_MS = 4*3600*1000;
var liveTimer = null, autoOn = true, liveN = 0, snapN = 0, lastUpdated = null, kalshiTab = false;

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer = null; } }
/* Polymarket events expose startTime but no explicit in-progress flag; a game
   that started within the last 4 hours is very likely live (NFL/NBA/MLB games
   rarely run longer), so prices on those games are the ones worth refreshing. */
function likelyLive(games){
  var now = Date.now(), n = 0;
  (games||[]).forEach(function(g){
    var t = startOf(g.ev || {});
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
    var what = kalshiTab ? snapN + (snapN > 1 ? " games" : " game") + " on this snapshot"
                         : liveN + (liveN > 1 ? " live games" : " live game");
    var cadence = kalshiTab ? "auto-refresh every 5 min" : "auto-refresh every 90s";
    s.innerHTML = '<span class="live-dot" aria-hidden="true"></span>'+
      GIU.esc(what + " — " + cadence)+
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

function parseArr(s){
  try{ var v = typeof s==="string" ? JSON.parse(s) : s; return Array.isArray(v)?v:[]; }
  catch(e){ return []; }
}
function money(v){
  v = Number(v)||0;
  if(v>=1e6) return "$"+(v/1e6).toFixed(1)+"M";
  if(v>=1e3) return "$"+(v/1e3).toFixed(0)+"K";
  return "$"+v.toFixed(0);
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
/* Live order-book line: bid/ask spread straight from Polymarket's book.
   A 1-2¢ spread means a deep, tight market (the quoted price is real);
   a wide spread means thin liquidity — the price may slip on real size. */
function bookLine(m){
  var b = Number(m.bestBid), a = Number(m.bestAsk);
  if(!(b>0) || !(a>=b)) return ""; /* no book posted — show nothing rather than junk */
  var bc = Math.round(b*100), ac = Math.round(a*100), sp = Math.max(0, ac-bc);
  var cls = sp<=2 ? "green" : sp<=5 ? "blue" : "red";
  var lbl = sp<=2 ? "tight book" : sp<=5 ? "decent liquidity" : "thin — price may move";
  return ' · book <b class="num" style="color:var(--text)">'+bc+'¢/'+ac+'¢</b> '+
    '<span class="tag '+cls+'" title="Live bid/ask spread from Polymarket\'s order book — the gap between the best buy and sell price right now.">'+sp+'¢ spread · '+lbl+'</span>';
}
/* 7-day price movement + 24h volume, straight from Polymarket's own fields.
   oneWeekPriceChange is the market's reported 7-day price move (0-1 units);
   volume24hr is dollars traded in the last 24h. Missing fields → show nothing. */
function chgChip(m){
  var c = Number(m.oneWeekPriceChange);
  if(!isFinite(c) || Math.abs(c) < 0.001) return "";
  var cls = c>0 ? "mv-up" : "mv-dn";
  return ' · <span class="'+cls+'" title="7-day price change for this market, reported by Polymarket — where the money has been pushing the price.">'+
    (c>0?"▲ +":"▼ −")+(Math.abs(c)*100).toFixed(1)+'¢ <span style="color:var(--faint)">7d</span></span>';
}
function volLine(m){
  var v24 = Number(m.volume24hr);
  if(isFinite(v24) && v24 > 0) return "24h vol "+money(v24)+" · all-time "+money(m.volume);
  return "Volume "+money(m.volume);
}
function marketRow(m){
  var outs = parseArr(m.outcomes), prices = parseArr(m.outcomePrices);
  if(outs.length!==2 || prices.length!==2) return "";
  var p0 = Math.round(Number(prices[0])*100), p1 = 100-p0;
  return '<div style="margin-bottom:12px"><div style="font-size:.8rem;color:var(--faint);margin-bottom:5px">'+GIU.esc(shortQ(m.question))+'</div>'+
    [["0",outs[0],p0],["1",outs[1],p1]].map(function(o){
      return '<div style="display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:4px"><span>'+GIU.esc(o[1])+'</span><b class="num" style="color:var(--gold-soft)">'+o[2]+'¢</b></div>'+
      '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-bottom:6px"><div style="height:100%;width:'+o[2]+'%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--gold))"></div></div>';
    }).join("")+
    '<div style="font-size:.76rem;color:var(--faint)">'+volLine(m)+bookLine(m)+chgChip(m)+'</div></div>';
}

function vsFor(title, leagueKey, dir){
  /* "Ravens vs. Cowboys" -> identity header; "" keeps the caller's plain title */
  var p = String(title||"").split(/\s+vs\.?\s+/);
  if(p.length !== 2) return "";
  return window.GIU.vsHeader(dir, leagueKey, p[0], p[1]);
}

/* Cross-book edge: Polymarket vs Kalshi on the same NFL game-winners.
   Fetched separately after the main board renders, so a snapshot hiccup
   never blocks the live prices. Only used on the NFL tab (the Kalshi
   snapshot is NFL-only). Returns "" when there is nothing honest to show. */
function disagreeCard(games, snap, dir){
  var D = window.Disagree;
  if(!D || !snap) return "";
  var evs = games.map(function(g){ return g.ev; });
  var mtchs = D.matches(evs, (snap.games||[]), dir, window.GIU.teamFind);
  if(!mtchs.length) return "";
  var dis = D.disagreements(mtchs, 3);
  var head = '<div class="card disagree-card"><span class="tag">Cross-book edge</span>'+
    '<h3 style="margin:10px 0 4px">Where the two markets disagree</h3>'+
    '<p class="disagree-note">Polymarket (live) and Kalshi (snapshot, rebuilt about every 15 minutes) price the same '+
    'game-winners. A gap of 3¢ or more means the books disagree — one of them is off, and that\'s where edge lives. '+
    'Kalshi\'s numbers can lag the snapshot and their fee structure differs from Polymarket\'s, so confirm both '+
    'prices are live before you bet.</p>';
  var body;
  if(!dis.length){
    body = '<div class="disagree-agree">✓ Polymarket and Kalshi agree within 3¢ on all '+
      mtchs.length+' matched NFL games right now.</div>';
  } else {
    body = '<div class="disagree-rows">'+dis.map(function(x){
      var ta = window.GIU.teamFind(dir, "nfl", x.abbrA),
          tb = window.GIU.teamFind(dir, "nfl", x.abbrB);
      var cls = x.delta > 0 ? "mv-up" : "mv-dn";
      var who = (x.delta > 0 ? "Polymarket" : "Kalshi") + " prices " + x.abbrA +
        " higher by " + Math.abs(x.delta) + " cents";
      return '<div class="disagree-row" tabindex="0" title="'+GIU.esc(who)+'">'+
        '<span class="disagree-teams">'+
          (ta ? window.GIU.teamLogo(ta, 26) : "") + window.GIU.teamChip(ta || {}, x.abbrA)+
          '<span class="vs-x">vs</span>'+
          (tb ? window.GIU.teamLogo(tb, 26) : "") + window.GIU.teamChip(tb || {}, x.abbrB)+
        '</span>'+
        '<span class="disagree-nums"><b class="num" style="color:var(--gold-soft)">'+x.pmA+'¢</b>'+
        '<span class="disagree-src">Polymarket</span>'+
        '<b class="num" style="color:var(--gold-soft)">'+x.kalshiA+'¢</b><span class="disagree-src">Kalshi</span></span>'+
        '<span class="'+cls+' num">'+(x.delta > 0 ? "▲ +" : "▼ −") + Math.abs(x.delta) + '¢</span>'+
      '</div>';
    }).join("")+'</div>';
  }
  return head + body + '</div>';
}

function load(my, silent){
  my = (my===undefined) ? tabSeq : my;
  clearLive(); /* league switches and silent refreshes always reschedule */
  var box = $("marketGrid");
  if(!silent){
    box.innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>'.repeat(3);
    $("marketNote").textContent = "Loading live markets — this is a large data feed, one moment…";
  }
  var lname = LEAGUES[cur][0], lkey = LEAGUES[cur][1];
  seriesFor(lkey).then(function(sid){
    return Promise.all([
      GIU.fetchJSON("https://gamma-api.polymarket.com/events?series_id="+sid+"&active=true&closed=false&limit=20"),
      GIU.teamDir()
    ]);
  }).then(function(x){
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    var d = x[0], dir = x[1];
    var evs = Array.isArray(d) ? d : (d.events||[]);
    var games = [];
    evs.forEach(function(ev){
      var title = ev.title||"";
      if(title.indexOf(" vs")<0 || / - /.test(title)) return;  /* main game events only */
      var live = (ev.markets||[]).filter(function(m){ return !m.closed && m.active!==false; });
      function top(type){
        var ms = live.filter(function(m){ return m.sportsMarketType===type; });
        ms = ms.filter(function(m){ var o=parseArr(m.outcomes); return o.length===2; });
        ms.sort(function(a,b){ return (Number(b.volume)||0)-(Number(a.volume)||0); });
        return ms[0]||null;
      }
      var mls = live.filter(function(m){ return m.sportsMarketType==="moneyline"; })
                    .filter(function(m){ return parseArr(m.outcomes).length===2; });
      var spread = top("spreads"), total = top("totals");
      if(!mls.length && !spread && !total) return;
      games.push({ev:ev, mls:mls, spread:spread, total:total});
    });
    games.sort(function(a,b){ return startOf(a.ev)-startOf(b.ev); });
    games = games.slice(0,10);
    if(!games.length){
      box.innerHTML = '<div class="empty">No upcoming '+GIU.esc(lname)+' game markets on Polymarket right now. Markets cluster around game days — check back mid-week.</div>';
      $("marketNote").textContent = "";
      liveN = 0; renderLiveStatus();
      return;
    }
    $("marketNote").textContent = games.length+" games · prices live from Polymarket · volume in $";
    box.innerHTML = games.map(function(g){
      var t = fmtT(g.ev.startTime || g.ev.eventDate);
      var slug = g.ev.slug||"";
      var body = g.mls.map(marketRow).join("") +
                 (g.spread ? marketRow(g.spread) : "") +
                 (g.total ? marketRow(g.total) : "");
      var head = vsFor(g.ev.title, lkey, dir) ||
        '<h3 style="margin:10px 0 4px">'+GIU.esc(g.ev.title)+'</h3>';
      return '<div class="card"><span class="tag green">Live market</span>'+
        head+
        (t ? '<div class="game-meta" style="margin-bottom:12px"><span>'+t+'</span></div>' : '<div style="height:8px"></div>')+
        body+
        '<div class="game-meta"><a href="https://polymarket.com/event/'+GIU.esc(slug)+'" target="_blank" rel="noopener">Trade on Polymarket →</a></div></div>';
    }).join("");
    /* ---- cross-book disagreement (NFL tab only) ----
       The Kalshi snapshot prices the same NFL game-winners; when the two
       books differ by 3c+ on a side, that gap is a real edge signal. This
       fetch rides along after the main board renders — a snapshot hiccup
       hides the strip, never the live prices. */
    if(lkey === "nfl" && games.length && window.Disagree){
      GIU.fetchJSON("data/kalshi-nfl.json").then(function(snap){
        if(my !== tabSeq) return; /* user moved to another tab meanwhile */
        var html = disagreeCard(games, snap, dir);
        if(html) box.insertAdjacentHTML("afterbegin", html);
      }).catch(function(){ /* optional strip — failure shows nothing, not junk */ });
    }
    /* ---- live auto-refresh ----
       Refresh in-place every 90s, but only while a shown game is likely
       in-progress — otherwise the timer would burn requests on dead pages. */
    kalshiTab = false;
    liveN = likelyLive(games);
    lastUpdated = Date.now();
    renderLiveStatus();
    if(liveN > 0 && autoOn){
      liveTimer = setInterval(function(){ if(!isHidden()) load(tabSeq, true); }, PM_MS);
    }
  }).catch(function(){
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    box.innerHTML = GIU.failBox("Polymarket's API didn't respond. No prices are shown rather than stale ones.");
    $("marketNote").textContent = "";
    liveN = 0; renderLiveStatus();
  });
}

/* Kalshi — a second prediction-market book on this page. Kalshi's public API
   rejects browser cross-origin calls, so the improvement-loop script
   scripts/fetch-kalshi.py fetches it server-side and commits a timestamped
   snapshot (data/kalshi-nfl.json), refreshed roughly every 15 minutes. This
   tab renders that snapshot honestly: a "snapshot" tag, the refresh time, and
   a stale warning if the snapshot goes cold — never presented as live. */
function agoShort(iso){
  var t = Date.parse(iso || ""); if(!isFinite(t)) return "";
  var m = Math.floor((Date.now() - t) / 60000);
  if(m < 1) return "just now";
  if(m < 60) return m + "m ago";
  var h = Math.floor(m / 60); if(h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
function kalshiAbbrs(g){
  /* sub looks like "CAR vs CLE (Sep 27)" — abbreviations are the reliable key */
  var m = String((g&&g.sub)||"").match(/^([A-Z]{2,3})\s+vs\s+([A-Z]{2,3})\b/);
  return m ? [m[1], m[2]] : null;
}
function kalshiCard(g, dir){
  var ab = kalshiAbbrs(g);
  var head = (ab && window.GIU.vsHeader(dir, "nfl", ab[0], ab[1])) ||
    '<h3 style="margin:10px 0 4px">'+GIU.esc(g.title)+'</h3>';
  var rows = g.teams.map(function(t){
    var book = t.book
      ? ' · book <b class="num" style="color:var(--text)">'+t.book.bid+'¢/'+t.book.ask+'¢</b> '+
        '<span class="tag '+t.book.cls+'" title="Live bid/ask spread from Kalshi\'s order book at snapshot time — the gap between the best buy and sell price.">'+t.book.spread+'¢ spread · '+t.book.lbl+'</span>'
      : "";
    return '<div style="margin-bottom:12px"><div style="font-size:.8rem;color:var(--faint);margin-bottom:5px">Yes — '+GIU.esc(t.name)+'</div>'+
      '<div style="display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:4px"><span>'+GIU.esc(t.name)+' wins</span><b class="num" style="color:var(--gold-soft)">'+t.price+'¢</b></div>'+
      '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-bottom:6px" role="img" aria-label="'+GIU.esc(t.name)+' priced at '+t.price+' cents"><div style="height:100%;width:'+t.price+'%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--gold))"></div></div>'+
      '<div style="font-size:.76rem;color:var(--faint)">'+(t.vol ? GIU.esc(t.vol) : "No volume reported")+book+'</div></div>';
  }).join("");
  return '<div class="card"><span class="tag green">Kalshi</span> <span class="tag blue">NFL</span> '+
    '<span class="tag" title="Prices come from a server-side snapshot because Kalshi\'s API blocks browser requests.">snapshot</span>'+
    head+
    (g.sub ? '<div class="game-meta" style="margin-bottom:12px"><span>'+GIU.esc(g.sub)+'</span></div>' : '<div style="height:8px"></div>')+
    rows+
    '<div class="game-meta"><a href="https://kalshi.com/browse" target="_blank" rel="noopener">Trade on Kalshi →</a></div></div>';
}
function loadKalshi(my, silent){
  my = (my===undefined) ? tabSeq : my;
  clearLive(); /* league switches and silent refreshes always reschedule */
  var box = $("marketGrid");
  if(!silent){
    box.innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>'.repeat(3);
    $("marketNote").textContent = "Loading the Kalshi snapshot…";
  }
  Promise.all([
    GIU.fetchJSON("data/kalshi-nfl.json"),
    GIU.teamDir()
  ]).then(function(x){
    var snap = x[0], dir = x[1];
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    var games = window.Kalshi.games(snap);
    if(!games.length){
      box.innerHTML = '<div class="empty">No priced Kalshi NFL game markets in the current snapshot. Markets cluster around game days — check back mid-week.</div>';
      $("marketNote").textContent = "";
      liveN = 0; renderLiveStatus();
      return;
    }
    var when = agoShort(snap.updated_at);
    $("marketNote").textContent = games.length+" games · snapshot refreshed "+when+" · Kalshi's API blocks browsers, so prices update when the snapshot rebuilds (~15 min)";
    var stale = window.Kalshi.stale(snap.updated_at)
      ? '<div class="notice" style="margin-bottom:16px"><strong>This snapshot is stale</strong> (over 6 hours old). Treat these prices as a rough guide until the next refresh — we\'d rather say so than let you bet on cold numbers.</div>'
      : "";
    box.innerHTML = stale + games.slice(0, 12).map(function(g){ return kalshiCard(g, dir); }).join("");
    /* ---- live auto-refresh ----
       The snapshot file is rebuilt server-side roughly every 15 minutes, so a
       silent 5-minute re-fetch picks up fresh prices between site pushes —
       no page reload, no shimmer. */
    kalshiTab = true;
    snapN = games.length; liveN = games.length;
    lastUpdated = Date.now();
    renderLiveStatus();
    if(games.length > 0 && autoOn){
      liveTimer = setInterval(function(){ if(!isHidden()) loadKalshi(tabSeq, true); }, KAL_MS);
    }
  }).catch(function(){
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    box.innerHTML = GIU.failBox("The Kalshi snapshot couldn't be loaded. Kalshi's API blocks browser requests, so this page depends on the server-side snapshot — nothing is shown rather than stale prices.");
    $("marketNote").textContent = "";
    liveN = 0; renderLiveStatus();
  });
}

$("marketTabs").innerHTML = LEAGUES.map(function(q,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+q[0]+'</button>';
}).join("")+'<button class="tab" data-kalshi="1">Kalshi · NFL</button>';
Array.prototype.forEach.call($("marketTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("marketTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active");
    var my = ++tabSeq;
    if(t.getAttribute("data-kalshi")){ loadKalshi(my); return; }
    cur = Number(t.getAttribute("data-i")); load(my);
  });
});
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn && liveN > 0){
    /* resume: refresh now; the loader reschedules the timer */
    if(kalshiTab) loadKalshi(tabSeq, true); else load(tabSeq, true);
  } else { clearLive(); renderLiveStatus(); }
});
load(++tabSeq);
})();
