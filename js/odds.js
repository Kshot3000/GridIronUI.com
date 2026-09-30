/* GridIronUI Odds Board — The Odds API v4, best-price highlighting, line movement.
   Pure math lives in js/odds-logic.js (window.OddsLogic).
   No API key is ever hardcoded. The visitor's key lives in their own localStorage. */
(function(){
"use strict";
var OL = window.OddsLogic;
var WX = window.OddsWx;
var PMK = window.OddsPm;
var INJX = window.OddsInj;
var $ = function(id){ return document.getElementById(id); };
/* ---- line-movement window (pure, exported for tests) ----
   Lines move most around live games and just before kickoff: a game is
   "near" when it started within the last 4h (likely in progress) or
   commences within the next 8h. */
window.GIU = window.GIU || {};
window.GIU.oddsNearWindow = function(events, nowMs){
  nowMs = (nowMs === undefined) ? Date.now() : nowMs;
  return (events||[]).some(function(ev){
    var t = Date.parse(ev && ev.commence_time);
    if(isNaN(t)) return false;
    return t > nowMs - 4*3600*1000 && t < nowMs + 8*3600*1000;
  });
};
var SPORTS = [
  ["americanfootball_nfl","NFL"],["basketball_nba","NBA"],["baseball_mlb","MLB"],
  ["icehockey_nhl","NHL"],["americanfootball_ncaaf","NCAAF"],["basketball_ncaab","NCAAB"],
  ["soccer_epl","EPL"]
];
var BOOK_LINKS = {
  /* Only links verified as 200/301/302 on 2026-09-27. Nothing unverified goes here. */
  draftkings:"https://www.draftkings.com", fanduel:"https://www.fanduel.com",
  betmgm:"https://www.betmgm.com", caesars:"https://www.caesars.com/sportsbook-and-casino",
  betrivers:"https://www.betrivers.com",
  hardrockbet:"https://www.hardrock.bet", circasports:"https://www.circasports.com"
};
var sport = SPORTS[0][0], key = "";
try{ key = localStorage.getItem("giu_odds_key") || ""; }catch(e){}
var autoTimer = null;
/* renderSeq: generation guard — a slow response for a previous sport tab
   never overwrites the board after the visitor has switched sports.
   nearBySport: last-known "games near" state per sport, drives the
   quota-smart auto-refresh (ticks only burn API quota when lines move). */
var renderSeq = 0, boardHasGames = false, lastUpdated = null, nearBySport = {};

/* ---- line-move alerts (v1.40.0) ----
   The visitor picks a threshold (1 / 1.5 / 2 points); every re-pull
   compares this pull's consensus spread/total against the previous
   pull's (alertBase, per sport, session-local) and fires a toast for
   each threshold crossing. The baseline is REPLACED after each pull, so
   an alert always means "moved since your last look" — never a re-fire.
   Pure candidate math is OL.moveAlerts / OL.alertBaseline; toasts show
   in-page always, and a browser Notification fires only when the tab is
   hidden (permission granted). Everything is local: alerts can't work
   while the tab is closed, and the note on the control says so. */
var alertThrKey = "giu_odds_alert_thr";
var alertThr = 0;                 /* 0 = off; persisted across sessions */
var alertBase = {};               /* sport -> {eventId: {sp, tot}} */
try{ alertThr = Number(localStorage.getItem(alertThrKey)) || 0; }catch(e){ alertThr = 0; }
if(!(alertThr === 1 || alertThr === 1.5 || alertThr === 2)) alertThr = 0;

/* ---- bet slip state (local only, never leaves the browser) ---- */
var Slip = window.OddsSlip;
var slip = [];
try{ slip = JSON.parse(localStorage.getItem("giu_slip") || "[]"); }catch(e){ slip = []; }
Slip.normalize(slip); /* legs saved before `captured` existed: track from now */
var stakeVal = 100;
try{ stakeVal = Number(localStorage.getItem("giu_slip_stake")) || 100; }catch(e){}
function saveSlip(){ try{ localStorage.setItem("giu_slip", JSON.stringify(slip)); }catch(e){} }
function saveStake(){ try{ localStorage.setItem("giu_slip_stake", String(stakeVal)); }catch(e){} }

function fmtT(iso){
  try{ var d=new Date(iso);
    return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+" · "+
           d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }catch(e){ return iso; }
}
function snapKey(){ return "giu_odds_prev_"+sport; }
function getSnap(){ try{ return JSON.parse(localStorage.getItem(snapKey())||"{}"); }catch(e){ return {}; } }
function setSnap(s){ try{ localStorage.setItem(snapKey(), JSON.stringify(s)); }catch(e){} }
/* First-seen ("open") consensus per event, tracked in this browser only.
   Your personal opener: what the line was the first time YOU loaded it. */
function openKey(){ return "giu_odds_open_"+sport; }
function getOpens(){ try{ return JSON.parse(localStorage.getItem(openKey())||"{}"); }catch(e){ return {}; } }
function setOpens(o){
  var ks = Object.keys(o);
  if(ks.length > 200){
    ks.sort(function(a,b){ return (o[a].t||0)-(o[b].t||0); });
    for(var i=0;i<ks.length-200;i++) delete o[ks[i]];
  }
  try{ localStorage.setItem(openKey(), JSON.stringify(o)); }catch(e){}
}
/* Line-movement history: per-game consensus samples feeding the sparkline
   charts on each game card. Same 200-game cap discipline as the openers. */
function histKey(){ return "giu_odds_hist_"+sport; }
function getHist(){ try{ return JSON.parse(localStorage.getItem(histKey())||"{}"); }catch(e){ return {}; } }
function setHist(h){ try{ localStorage.setItem(histKey(), JSON.stringify(h)); }catch(e){} }

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function fmtClock(ts){
  try{ return new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",second:"2-digit"}); }
  catch(e){ return ""; }
}
function fmtSince(ts){
  try{ return new Date(ts).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
  catch(e){ return ""; }
}
function autoOn(){ var c = $("autoRef"); return !!(c && c.checked); }
/* Live status line under the board controls (aria-live). Honest about what
   auto-refresh is doing: re-pulling when games are near, and saying so —
   instead of silently burning the visitor's 500-request monthly quota —
   when there's nothing worth re-pulling. */
function setStatus(overrideMsg, paused){
  var s = $("oddsStatus"); if(!s) return;
  if(overrideMsg !== undefined){
    /* Explicit events (a pull in flight, a failed pull) are always worth
       showing — the visitor asked for this fetch, or it just failed. */
    s.className = "live-status" + (paused ? " paused" : "");
    s.textContent = overrideMsg; return;
  }
  if(!autoOn() || !key){
    s.className = "live-status"; s.textContent = ""; return;
  }
  var near = nearBySport[sport];
  if(near){
    s.className = "live-status";
    s.innerHTML = '<span class="live-dot" aria-hidden="true"></span>' +
      GIU.esc("Auto-refresh on — re-pulling lines every 5 min while games are near" +
      (lastUpdated ? " · updated " + fmtClock(lastUpdated) : ""));
  } else {
    s.className = "live-status paused";
    s.textContent = "Auto-refresh on — no games near kickoff, so your API quota stays untouched";
  }
}
/* The 5-minute tick: refreshes in place (no board flash) only when lines are
   actually moving; skips while the tab is hidden. */
function autoTick(){
  if(!autoOn() || !key || isHidden()) return;
  if(nearBySport[sport]){
    render({silent:true});
  } else {
    setStatus();
  }
}

/* In-place empty state for the board when no Odds API key is connected.
   The setup card above explains the key; this fills the board's own spot so
   the page never reads as a failed load — and repeats the honesty line that
   no sample or stale lines are ever shown as if they were live. */
function noKeyBoardHtml(){
  return '<div class="empty" id="oddsNoKey" role="status">'+
    '<div class="card-icon" aria-hidden="true" style="font-size:2rem">🔌</div>'+
    '<h3 style="margin:6px 0 8px;color:var(--text)">Connect your key to load live lines</h3>'+
    '<p style="max-width:580px;margin:0 auto 8px;color:var(--muted)">Paste your free Odds API key in the setup card above — live spreads, moneylines and totals from every book land right here, with best-price highlighting, consensus and no-vig fair lines.</p>'+
    '<p style="max-width:580px;margin:0 auto 18px;font-size:.85rem">Until then this board stays empty. We never show sample or stale lines as if they were live.</p>'+
    '<button class="btn btn-gold btn-sm" id="oddsNoKeyBtn" type="button">Connect my key ↑</button>'+
  '</div>';
}

function render(opts){
  opts = opts || {};
  var setup = $("oddsSetup"), board = $("oddsBoard");
  if(!key){ setup.style.display="block"; board.innerHTML=noKeyBoardHtml(); $("quota").textContent=""; setStatus(""); return; }
  setup.style.display="none";
  if($("keyInput").value !== key) $("keyInput").value = key;
  var mySeq = ++renderSeq;
  var silent = !!opts.silent && boardHasGames;
  if(!silent){
    board.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--faint)">Pulling live lines…</p>';
  } else {
    setStatus("Updating lines…");
  }
  var url = "https://api.the-odds-api.com/v4/sports/"+sport+"/odds/?apiKey="+encodeURIComponent(key)+
            "&regions=us&markets=h2h,spreads,totals&oddsFormat=decimal";
  var remaining = "?";
  /* Identity directory (ESPN logos/colors) loads in parallel; resolves to {}
     on failure so the board always renders, with or without identity. */
  var dirP = GIU.teamDir();
  var league = OL.sportLeague(sport);
  fetch(url, {cache:"no-store"}).then(function(r){
    remaining = r.headers.get("x-requests-remaining") || "?";
    if(r.status===401) throw new Error("invalid-key");
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(events){
    return dirP.then(function(dir){ return {events:events, dir:dir}; });
  }).then(function(payload){
    if(mySeq !== renderSeq) return; /* stale sport response — discard */
    var events = payload.events, dir = payload.dir;
    $("quota").textContent = "API quota remaining: "+remaining+" requests this month";
    nearBySport[sport] = window.GIU.oddsNearWindow(events);
    lastUpdated = Date.now();
    var prev = getSnap(), now = {}, opens = getOpens(), hist = getHist();
    /* Record this fetch's consensus per game — the sparkline history. Costs
       no quota: it's just localStorage on data we already pulled. */
    (events||[]).forEach(function(ev){
      var c = OL.consensus(ev.bookmakers||[], ev);
      var sp = c.spread.a ? c.spread.a.pt : null;
      var tot = c.total.o ? c.total.o.pt : null;
      if(sp !== null || tot !== null) OL.recordSample(hist, ev.id, lastUpdated, sp, tot);
    });
    var cards = events.length
      ? events.map(function(ev){ return renderGame(ev, prev, now, opens, hist, dir, league); }).join("")
      : '<div class="empty">No upcoming games with odds for this league right now.</div>';
    var movers = OL.biggestMovers(OL.moverEntries(events, opens), 5);
    var arbs = OL.biggestArbs(OL.arbEntries(events), 5);
    board.innerHTML = (arbs.length ? renderArbs(arbs, lastUpdated) : "") +
                      (movers.length ? renderMovers(movers) : "") + cards;
    boardHasGames = true;
    setSnap(now);
    setOpens(opens);
    setHist(hist);
    /* Line-move alerts: compare this pull's consensus against the last
       pull's baseline, toast every threshold crossing, then re-baseline —
       all after the board is on screen so an alert hiccup never blocks
       lines. Zero API quota: it reuses the events just pulled. */
    maybeAlerts(events, mySeq);
    /* keep slip prices honest against the fresh board */
    if(slip.length){ Slip.reprice(slip, now); saveSlip(); }
    refreshPickMarks();
    renderSlip();
    setStatus();
    /* NFL tab bonus, after the board is on screen: game-day weather badges
       on open-air game cards. One Open-Meteo fetch (no key, no quota cost),
       venue cross-checked against ESPN so neutral-site games are never
       mislabeled. A forecast hiccup leaves the badges off — the board is
       the product, weather is a bonus. */
    maybeWxBadges(events, mySeq);
    /* NFL tab bonus, after the board is on screen: market check — live
       Polymarket moneyline price on each game card, next to what the best
       book prices imply. One CORS-open gamma fetch (zero Odds-API quota);
       a hiccup leaves the lines off, never the board. */
    maybePmCheck(events, mySeq);
    /* NFL tab bonus, after the board is on screen: injury-report badges —
       key injuries from ESPN's injuries feed on each game card. One
       CORS-open fetch per board render (zero Odds-API quota); a hiccup
       leaves the badges off, never the board. */
    maybeInjBadges(events, mySeq);
  }).catch(function(e){
    if(mySeq !== renderSeq) return; /* stale sport response — discard */
    if(silent){
      /* A failed background re-pull never wipes the live board the visitor
         is reading — it keeps the last good lines and says when they're from. */
      setStatus("Re-pull failed ("+e.message+") — still showing lines from "+
        (lastUpdated ? fmtClock(lastUpdated) : "your last successful load"), true);
      return;
    }
    if(e.message==="invalid-key"){
      board.innerHTML = '<div class="notice red"><strong>That API key didn\'t work.</strong> The Odds API said the key is invalid. Double-check it, or <a href="https://the-odds-api.com" target="_blank" rel="noopener">grab a free one here</a> (500 requests/month, no card).</div>';
    } else {
      board.innerHTML = GIU.failBox("The Odds API didn't respond ("+GIU.esc(e.message)+"). Your key and quota are untouched — try again in a minute.");
    }
    setStatus();
  });
}

/* ---- game-day weather badges (NFL tab) ----
   Wind moves totals — the site's own pitch — so the odds board now shows
   the game's weather impact on open-air NFL game cards. Venues are resolved
   against ESPN's scoreboard (neutral-site games get their real venue), the
   forecast comes from one multi-location Open-Meteo request, and badges
   only appear when the shared impact model flags something real. Quiet by
   default, honest by construction: no venue confirmation, no badge. */
var espnWxP = null, espnMlbWxP = null;
function maybeWxBadges(events, mySeq){
  var isMlb = (sport === "baseball_mlb");
  if((!isMlb && sport !== "americanfootball_nfl") || !WX || !events || !events.length) return;
  var espnP, venueResolver;
  if(isMlb){
    /* October baseball: MLB postseason board (seasontype=3) cross-checked
       against the shared ballpark dataset — October wind and rain move
       totals, so Wild Card bettors should see it on the card itself. */
    if(!espnMlbWxP){
      espnMlbWxP = (GIU.wxUpcomingMlbPostseason
        ? GIU.wxUpcomingMlbPostseason(GIU.fetchJSON)
        : Promise.resolve({events:[]}))
        .then(function(r){ return r.events; })
        .catch(function(){ return []; });
    }
    espnP = espnMlbWxP;
    venueResolver = GIU.wxBallparkVenueFor;
  } else {
    if(!espnWxP){
    /* Same rollover-safe fetch as the weather page: between the week's last
       game and ESPN's Tuesday rollover the default board is all-post, which
       would silently kill every badge. A venue failure still just means no
       badges — the board already rendered fine. */
    var nflP = GIU.wxUpcomingNfl
      ? GIU.wxUpcomingNfl(GIU.fetchJSON).then(function(r){ return r.events; })
      : GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")
          .then(function(d){ return d.events || []; });
    espnWxP = nflP.catch(function(){ return []; });
    }
    espnP = espnWxP;
    venueResolver = GIU.wxVenueFor;
  }
  Promise.all([espnP, GIU.teamDir()]).then(function(r){
    if(mySeq !== renderSeq || (sport !== "americanfootball_nfl" && sport !== "baseball_mlb")) return; /* board moved on */
    var games = WX.resolveGames(events, r[0], r[1], GIU.teamFind,
      venueResolver, Date.now(), isMlb ? "mlb" : "nfl");
    if(!games.length) return;
    var url = WX.wxUrl(games);
    if(!url) return;
    return GIU.fetchJSON(url).then(function(d){
      if(mySeq !== renderSeq || (sport !== "americanfootball_nfl" && sport !== "baseball_mlb")) return;
      var arr = Array.isArray(d) ? d : [d];
      var notesFn = isMlb ? GIU.wxImpactNotesBsb : GIU.wxImpactNotes;
      games.forEach(function(g, i){
        var hourly = (arr[i] && arr[i].hourly) || {time:[]};
        var notes = notesFn(GIU.wxSliceWindow({hourly:hourly}, g.kickISO));
        if(!notes.length) return; /* calm day — nothing to say */
        var slot = document.querySelector('[data-wxbadge="'+g.oddsId+'"]');
        if(!slot) return;
        slot.innerHTML = WX.badgeHtml(g.stadium, g.city, notes, GIU.esc);
        slot.hidden = false;
      });
    });
  }).catch(function(){ /* badges stay off; the board already rendered fine */ });
}

/* ---- market check: Polymarket vs the books (NFL tab) ----
   The predictions page tells visitors to compare market-implied
   probabilities against sportsbook prices — this puts that comparison on
   the board itself, where lines are shopped. One CORS-open gamma fetch per
   board render (zero Odds-API quota), painted after the board so a hiccup
   never blocks lines; render-generation guarded like the weather badges.
   Quiet by default: unmatched or unpriced games stay silent — no badge
   beats a wrong badge. */
var pmSeriesP = null;
function pmSeriesId(){
  /* The series lookup is stable (Polymarket rotates series rarely); cache it
     for the session, but re-fetch the events on every board render so the
     prices on the cards stay live across auto-refreshes. */
  if(!pmSeriesP){
    pmSeriesP = GIU.fetchJSON("https://gamma-api.polymarket.com/sports").then(function(ss){
      var s = (ss||[]).filter(function(x){ return x.sport==="nfl"; })[0];
      return (s && s.series) || null;
    }).catch(function(){ return null; });
  }
  return pmSeriesP;
}
function maybePmCheck(events, mySeq){
  if(sport !== "americanfootball_nfl" || !PMK || !events || !events.length) return;
  Promise.all([pmSeriesId(), GIU.teamDir()]).then(function(r){
    if(mySeq !== renderSeq || sport !== "americanfootball_nfl" || !r[0]) return;
    return GIU.fetchJSON("https://gamma-api.polymarket.com/events?series_id="+r[0]+
      "&active=true&closed=false&limit=20").catch(function(){ return []; })
      .then(function(d){
        if(mySeq !== renderSeq || sport !== "americanfootball_nfl") return; /* board moved on */
        var pmEvents = Array.isArray(d) ? d : (d.events||[]);
        var map = PMK.pmPrices(pmEvents, r[1], GIU.teamFind);
        if(!map || !Object.keys(map).length) return;
        events.forEach(function(ev){
          var rec = PMK.check(ev, map, r[1], GIU.teamFind, OL.oneOutcome);
          if(!rec) return;
          var slot = document.querySelector('[data-pmcheck="'+ev.id+'"]');
          if(!slot) return;
          slot.innerHTML = PMK.badgeHtml(rec, GIU.esc);
          slot.hidden = false;
        });
      });
  }).catch(function(){ /* check stays off; the board already rendered fine */ });
}

/* ---- injury report: key injuries on each NFL game card (NFL tab) ----
   Injuries move lines — bettors shopping a price want to know a team is
   down two starters. One CORS-open ESPN fetch per board render (zero
   Odds-API quota), teams resolved through the site's team directory so an
   odds-API name like "Kansas City Chiefs" finds the ESPN injury entry.
   Quiet by default: unmatched teams, unreportable statuses, and a failed
   fetch all leave the card clean — no badge beats a wrong badge. */
var injP = null;
function maybeInjBadges(events, mySeq){
  if(sport !== "americanfootball_nfl" || !INJX || !events || !events.length) return;
  if(!injP){
    injP = GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries")
      .then(function(d){ return INJX.indexByName(d); })
      .catch(function(){ return null; });
  }
  Promise.all([injP, GIU.teamDir()]).then(function(r){
    if(mySeq !== renderSeq || sport !== "americanfootball_nfl") return; /* board moved on */
    var idx = r[0], dir = r[1] || {};
    if(!idx) return; /* feed hiccup — badges stay off */
    events.forEach(function(ev){
      var ta = GIU.teamFind(dir, "nfl", ev.away_team),
          tb = GIU.teamFind(dir, "nfl", ev.home_team);
      var ea = ta && ta.displayName && idx[String(ta.displayName).toLowerCase().trim()],
          eb = tb && tb.displayName && idx[String(tb.displayName).toLowerCase().trim()];
      var lineA = ea ? INJX.cardLine(ta, ea) : null,
          lineB = eb ? INJX.cardLine(tb, eb) : null;
      if(!lineA && !lineB) return; /* nothing reportable — silent */
      var slot = document.querySelector('[data-injcheck="'+ev.id+'"]');
      if(!slot) return;
      slot.innerHTML = INJX.badgeHtml(lineA, lineB, GIU.esc);
      slot.hidden = false;
    });
  }).catch(function(){ /* badges stay off; the board already rendered fine */ });
}

/* Sure bets: cross-book arbitrage found in this pull. Every outcome is
   covered at a different book, so the listed prices lock a guaranteed
   profit — at least until a line moves, which is why the strip says when
   the pull happened and links the guide's honest arbitrage section. Only
   renders when a real arb exists; a quiet board stays quiet. */
function renderArbs(arbs, updated){
  var rows = arbs.map(function(a){
    var legs = a.legs.map(function(l, i){
      return GIU.esc(l.name) + " @ " + GIU.esc(l.bookTitle) + " " +
             OL.dec2am(l.price) + " ($" + a.stakes[i].toFixed(2) + ")";
    }).join(" · ");
    var aria = a.title + ": " + a.marketLabel + " arbitrage — " + legs +
               ". Guaranteed profit " + a.profitPct.toFixed(2) +
               " percent on a $100 split. Jump to the game.";
    return '<a class="arb" href="#'+GIU.esc(a.anchor)+'" aria-label="'+GIU.esc(aria)+'">'+
      '<span class="mover-title">'+GIU.esc(a.title)+
      ' <span class="arb-mkt">'+GIU.esc(a.marketLabel)+'</span></span>'+
      '<span class="arb-legs">'+legs+'</span>'+
      '<span class="arb-profit">+'+a.profitPct.toFixed(2)+'%'+
      ' <span class="arb-sub">($'+a.profit.toFixed(2)+' locked on $100)</span></span></a>';
  }).join("");
  return '<section class="card arb-card" aria-label="Cross-book arbitrage opportunities">'+
    '<div class="section-head" style="margin-bottom:10px"><div>'+
    '<h3 style="margin:0">⚖️ Sure bets</h3>'+
    '<div class="game-meta"><span>Cross-book arbitrage — every outcome at a different book, '+
    'total implied probability under 100%. Stakes are the dutch-book split for $100. '+
    'Live at the last pull'+(updated ? " ("+fmtClock(updated)+")" : "")+
    ' — arbs vanish in seconds, stale lines misfire, and books limit arb bettors fast. '+
    'Confirm both prices before you bet. <a href="guides/advanced.html#arb">How arbitrage works →</a></span></div></div></div>'+
    '<div class="movers">'+rows+'</div></section>';
}

/* Steam watch: the biggest consensus line moves since this browser's
   personal opener for each game — where the money is pushing. The strip
   only renders when something actually moved (biggestMovers drops zero
   deltas), so a fresh first load stays clean and honest. */
function fmtDelta(d){
  var r = Math.round(d*10)/10;
  return (r>0?"+":"") + r;
}
function renderMovers(movers){
  var rows = movers.map(function(m){
    var dir = m.delta>0 ? "mv-up" : "mv-dn";
    var arrow = m.delta>0 ? "▲" : "▼";
    var kind = m.kind === "spread" ? "Spread" : "Total";
    var aria = m.title + ": " + kind.toLowerCase() + " opened " + m.openFmt +
               ", now moved " + fmtDelta(m.delta) + " points. Jump to the game.";
    return '<a class="mover" href="#'+GIU.esc(m.anchor)+'" aria-label="'+GIU.esc(aria)+'">'+
      '<span class="mover-title">'+GIU.esc(m.title)+'</span>'+
      '<span class="mover-d">'+GIU.esc(kind)+' opened '+GIU.esc(m.openFmt)+
      ' <span class="'+dir+'">'+arrow+' '+GIU.esc(fmtDelta(m.delta))+'</span></span></a>';
  }).join("");
  return '<section class="card movers-card" aria-label="Biggest line moves since your first look">'+
    '<div class="section-head" style="margin-bottom:10px"><div>'+
    '<h3 style="margin:0">🔥 Biggest line moves</h3>'+
    '<div class="game-meta"><span>Since this browser first saw each game — where the money is pushing. '+
    'Tap a row to jump to the game.</span></div></div></div>'+
    '<div class="movers">'+rows+'</div></section>';
}

/* ---- line-move alerts (v1.40.0) ----
   maybeAlerts runs after every successful pull. The first pull with
   alerts on only seeds the baseline (nothing moved yet — honest by
   default); later pulls toast each threshold crossing, then re-baseline
   so the same move never fires twice. */
function maybeAlerts(events, mySeq){
  if(mySeq !== renderSeq) return; /* stale sport response — discard */
  if(!(alertThr > 0)) return;
  var fresh = OL.alertBaseline(events);
  var base = alertBase[sport];
  if(base){
    var hits = OL.moveAlerts(events, base, alertThr, Date.now());
    hits.forEach(fireAlert);
  }
  alertBase[sport] = fresh;
}
function alertMoveText(a){
  var kind = a.kind === "spread" ? "Spread" : "Total";
  var from = a.kind === "spread" ? OL.fmtPt(a.from) : String(a.from);
  var to = a.kind === "spread" ? OL.fmtPt(a.to) : String(a.to);
  var d = Math.round(a.delta*10)/10;
  var arrow = a.delta > 0 ? "▲" : "▼";
  var cls = a.delta > 0 ? "mv-up" : "mv-dn";
  return { kind: kind, body: kind + " " + from + " → " + to +
           ' <span class="' + cls + '">' + arrow + " " +
           GIU.esc((d > 0 ? "+" : "") + d) + "</span>" };
}
/* Toast stack (max 3, newest first) with tap-to-jump game links and a
   dismiss button; duplicate toast for the same game+kind is never
   stacked twice. Browser Notification only when the tab is hidden and
   permission was granted — a visible tab gets the toast, not the buzz. */
function fireAlert(a){
  var t = alertMoveText(a);
  var body = t.body;
  var toast = document.createElement("div");
  toast.className = "alert-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("data-alert", a.id + "|" + a.kind);
  toast.innerHTML = '<span aria-hidden="true">🔔</span><span><b>Line move</b> — ' +
    '<a href="#' + GIU.esc(a.anchor) + '">' + GIU.esc(a.title) + "</a>: " + body + "</span>" +
    '<button class="alert-x" aria-label="Dismiss alert">×</button>';
  var box = $("alertToasts");
  if(box){
    var kids = box.querySelectorAll ? box.querySelectorAll(".alert-toast") : [];
    for(var i = 0; i < kids.length; i++){
      if(kids[i].getAttribute("data-alert") === a.id + "|" + a.kind) return;
    }
    box.insertBefore(toast, box.firstChild);
    while(box.children && box.children.length > 3)
      box.removeChild(box.lastChild);
  }
  notifyAlert(a, t);
}
function notifyAlert(a, t){
  try{
    if(document.hidden !== true) return;
    if(!("Notification" in window)) return;
    if(window.Notification.permission !== "granted") return;
    new window.Notification("GridIronUI line move", {
      body: a.title + ": " + t.kind + " " +
            (a.kind === "spread" ? OL.fmtPt(a.from) : a.from) + " → " +
            (a.kind === "spread" ? OL.fmtPt(a.to) : a.to),
      tag: "giu-alert-" + a.id + "-" + a.kind
    });
  }catch(e){}
}
/* Dismiss buttons on the alert toasts (delegated, survives re-renders). */
function wireAlertToasts(){
  var box = $("alertToasts");
  if(!box || box._alertWired) return;
  box._alertWired = true;
  box.addEventListener("click", function(e){
    var x = e.target && e.target.closest ? e.target.closest(".alert-x") : null;
    if(x && x.parentNode && x.parentNode.parentNode === box)
      box.removeChild(x.parentNode);
  });
}

function renderGame(ev, prev, now, opens, hist, dir, league){
  var books = ev.bookmakers||[];
  var h = ev.home_team, a = ev.away_team;
  /* GameDay identity: real ESPN logo + team-color chips when the matchup
     resolves against the identity directory; otherwise the plain title. */
  var idHead = GIU.vsHeader(dir, league, a, h);
  var titleHtml = idHead
    ? idHead
    : '<h3 style="margin:0">'+GIU.esc(a)+' @ '+GIU.esc(h)+'</h3>';
  var spreadBest = OL.bestSpread(books, ev),
      totalBest  = OL.bestTotal(books),
      mlBest     = OL.bestML(books, ev);
  var cons = OL.consensus(books, ev);
  var top = OL.topBook(books, [spreadBest, totalBest, mlBest]);
  /* personal opener: first consensus seen in this browser for this game */
  var op = (opens||{})[ev.id];
  if(!op){
    op = { t: Date.now(),
           sp: cons.spread.a ? cons.spread.a.pt : null,
           tot: cons.total.o ? cons.total.o.pt : null };
    if(opens) opens[ev.id] = op;
  }

  function cell(mkey, bkKey, bkTitle, name, side, label, idKey, price, point){
    var id = ev.id+"|"+bkKey+"|"+mkey+"|"+name;  /* book key included: movement is per-book */
    var old = prev[id];
    now[id] = price;
    var mv = "", flash = "";
    if(old !== undefined && Math.abs(old-price) > 0.0001){
      mv = price>old ? ' <span class="mv-up">▲</span>' : ' <span class="mv-dn">▼</span>';
      flash = " flash";
    }
    var off = OL.offMarket(cons, mkey, side, point, price);
    var offMark = off ? ' <span class="offmkt" title="Off the market consensus — this book\u2019s line differs from the median across the listed books. Could be a stale line or a deliberate lean; compare before you bet.">⚡</span>' : "";
    var cls = ((idKey ? "best" : "") + flash).trim();
    var picked = Slip.has(slip, id);
    var am = OL.dec2am(price);
    var aria = (picked ? "Remove " : "Add ") + name + " " + label + " (" + am + ") at " + bkTitle +
               (picked ? " from" : " to") + " your slip" + (off ? " — this line is off the market consensus" : "");
    return '<td class="'+cls+'"><button class="pick-btn'+(picked?" picked":"")+'"'+
      ' data-slip="'+GIU.esc(id)+'" data-game="'+GIU.esc(a+" @ "+h)+'"'+
      ' data-market="'+GIU.esc(mkey)+'" data-side="'+GIU.esc(name)+'"'+
      ' data-book="'+GIU.esc(bkKey)+'" data-booktitle="'+GIU.esc(bkTitle)+'"'+
      ' data-label="'+GIU.esc(label)+'" data-price="'+price+'"'+
      ' aria-pressed="'+picked+'" aria-label="'+GIU.esc(aria)+'">'+
      '<span class="num">'+label+'</span>'+mv+offMark+'</button></td>';
  }
  function isBest(mapVal, bk, extra){
    return mapVal === bk.key + (extra||"");
  }
  var rows = books.map(function(bk){
    var hML = OL.oneOutcome(bk,"h2h",h), aML = OL.oneOutcome(bk,"h2h",a);
    var hSP = OL.oneOutcome(bk,"spreads",h), aSP = OL.oneOutcome(bk,"spreads",a);
    var oT = OL.oneOutcome(bk,"totals","Over"), uT = OL.oneOutcome(bk,"totals","Under");
    return "<tr><td><b>"+GIU.esc(bk.title)+"</b></td>"+
      (aSP ? cell("spreads", bk.key, bk.title, a, "a", OL.fmtPt(aSP.point)+" · "+OL.dec2am(aSP.price), isBest(spreadBest.a,bk,"|"+aSP.point+"|"+aSP.price), aSP.price, aSP.point) : "<td>—</td>")+
      (hSP ? cell("spreads", bk.key, bk.title, h, "h", OL.fmtPt(hSP.point)+" · "+OL.dec2am(hSP.price), isBest(spreadBest.h,bk,"|"+hSP.point+"|"+hSP.price), hSP.price, hSP.point) : "<td>—</td>")+
      (oT  ? cell("totals", bk.key, bk.title, "Over", "o", "O "+OL.fmtPt(oT.point)+" · "+OL.dec2am(oT.price), isBest(totalBest.o,bk,"|"+oT.point+"|"+oT.price), oT.price, oT.point) : "<td>—</td>")+
      (uT  ? cell("totals", bk.key, bk.title, "Under", "u", "U "+OL.fmtPt(uT.point)+" · "+OL.dec2am(uT.price), isBest(totalBest.u,bk,"|"+uT.point+"|"+uT.price), uT.price, uT.point) : "<td>—</td>")+
      (aML ? cell("h2h", bk.key, bk.title, a, "a", OL.dec2am(aML.price), isBest(mlBest.a,bk,"|"+aML.price), aML.price, null) : "<td>—</td>")+
      (hML ? cell("h2h", bk.key, bk.title, h, "h", OL.dec2am(hML.price), isBest(mlBest.h,bk,"|"+hML.price), hML.price, null) : "<td>—</td>")+
      "</tr>";
  }).join("");

  var topTitle = top ? (books.filter(function(b){return b.key===top.key;})[0]||{}).title : null;
  var topLink = (top && BOOK_LINKS[top.key])
    ? ' <a href="'+BOOK_LINKS[top.key]+'" target="_blank" rel="noopener" class="btn btn-gold btn-sm">Bet at '+GIU.esc(topTitle)+' →</a>' : "";
  var bestCard = topTitle
    ? '<div class="notice green" style="margin:0 0 14px"><strong>★ Best place to bet this game: '+GIU.esc(topTitle)+'</strong> — holds '+top.count+' of the best prices on the board.'+topLink+
      '<br><span style="font-size:.82rem">Best prices are highlighted in green. ▲▼ shows movement since your last refresh.</span></div>'
    : "";

  /* Market consensus one-liner: the median number across every listed book —
     the reference point sharps use to spot stale or shaded lines. */
  function consLineHtml(){
    var parts = [];
    if(cons.spread.a) parts.push(OL.shortName(a)+" "+OL.fmtPt(cons.spread.a.pt));
    if(cons.total.o)  parts.push("O/U "+cons.total.o.pt);
    if(cons.ml.a && cons.ml.h)
      parts.push("ML "+OL.shortName(a)+" "+OL.dec2am(cons.ml.a.pr)+" · "+OL.shortName(h)+" "+OL.dec2am(cons.ml.h.pr));
    if(!parts.length) return "";
    return '<div class="game-meta cons-line"><span title="The median line across every book listed for this game — the reference point for spotting stale or shaded numbers.">📊 Market consensus ('+cons.n+' book'+(cons.n>1?"s":"")+'): '+GIU.esc(parts.join(" · "))+'</span>'+openHtml()+'</div>';
  }
  /* No-vig fair line: the vig-free moneyline implied by the book consensus —
     what a fair book would pay each side. The sharp reference: a book price
     better than the fair price is value; worse is paying extra juice. Silent
     when the moneyline consensus is incomplete — one side is not a price. */
  function fairLineHtml(){
    var f = OL.fairMoneyline(cons);
    if(!f) return "";
    return '<div class="game-meta fair-line"><span title="The vig-free price implied by the book consensus — what a fair book would pay. Derived from the listed books\u2019 median prices, so it\u2019s an estimate, not a quote: if a book beats the fair price, that\u2019s value.">📐 No-vig fair: '+
      GIU.esc(OL.shortName(a))+' '+GIU.esc(String(f.a.am))+' ('+f.a.prob+'%) · '+
      GIU.esc(OL.shortName(h))+' '+GIU.esc(String(f.h.am))+' ('+f.h.prob+'%)'+
      ' <span style="opacity:.75">— books hold ≈ '+f.holdPct+'%</span></span></div>';
  }
  /* Movement since your personal opener (first time this browser saw the game). */
  function openHtml(){
    var bits = [];
    if(op.sp!=null && cons.spread.a && cons.spread.a.pt !== op.sp){
      var d = cons.spread.a.pt - op.sp;
      bits.push("spread opened "+OL.fmtPt(op.sp)+' <span class="'+(d>0?"mv-up":"mv-dn")+'">'+(d>0?"▲":"▼")+" "+OL.fmtPt(d)+"</span>");
    }
    if(op.tot!=null && cons.total.o && cons.total.o.pt !== op.tot){
      var d2 = Math.round((cons.total.o.pt - op.tot)*10)/10;
      bits.push("total opened "+op.tot+' <span class="'+(d2>0?"mv-up":"mv-dn")+'">'+(d2>0?"▲":"▼")+" "+(d2>0?"+":"")+d2+"</span>");
    }
    if(!bits.length) return "";
    return ' <span class="open-line" title="Your personal opener — the consensus the first time this browser loaded this game. Cleared if you clear site data.">('+bits.join(" · ")+")</span>";
  }
  /* Line-movement sparkline: the consensus path since this browser first
     tracked the game — the shape of the steam, not just the delta. Only
     renders with 2+ samples: one dot is not a trend. */
  function histHtml(){
    var samples = hist && hist[ev.id];
    if(!samples || samples.length < 2) return "";
    function cell(kind, label, fmt){
      var vals = OL.sparkSeries(samples, kind);
      var g = OL.spark(vals, 132, 36);
      if(!g) return "";
      var d = vals[vals.length-1] - vals[0];
      var cls = d > 0 ? "mv-up" : (d < 0 ? "mv-dn" : "");
      var arrow = d > 0 ? "▲" : (d < 0 ? "▼" : "—");
      var aria = label+" consensus moved from "+fmt(vals[0])+" to "+fmt(vals[vals.length-1])+
                 " across "+vals.length+" line updates since "+fmtSince(samples[0][0]);
      return '<div class="spark-cell"><div class="spark-lab">'+GIU.esc(label)+
        ' <span class="'+cls+'">'+arrow+' '+GIU.esc(fmtDelta(d))+'</span></div>'+
        '<svg class="spark" width="132" height="36" viewBox="0 0 132 36" role="img" aria-label="'+GIU.esc(aria)+'">'+
        '<path class="spark-area" d="'+g.area+'"/><path class="spark-line" d="'+g.line+'"/>'+
        '<circle class="spark-dot" cx="'+g.lx+'" cy="'+g.ly+'" r="2.6"/></svg>'+
        '<div class="spark-vals" aria-hidden="true"><span>'+GIU.esc(fmt(vals[0]))+'</span><span>'+
        GIU.esc(fmt(vals[vals.length-1]))+'</span></div></div>';
    }
    var sp = cell("sp", "Spread", OL.fmtPt);
    var tot = cell("tot", "Total", function(v){ return String(Math.round(v*10)/10); });
    if(!sp && !tot) return "";
    return '<div class="spark-row">'+sp+tot+
      '<div class="spark-cap">📈 Line movement tracked since '+GIU.esc(fmtSince(samples[0][0]))+
      ' in this browser — leave auto-refresh on and the chart grows on game day.</div></div>';
  }

  /* Sure-bet flag: this game has a live cross-book arb in this pull.
     Chips name each arbed market + locked profit; the strip above has the
     full legs and stakes. Silent when there's nothing — like everything
     else on this board. */
  function arbFlagHtml(){
    var arbs = OL.arbsForEvent(ev);
    if(!arbs.length) return "";
    var chips = arbs.map(function(a){
      return '<span class="arb-chip" title="Cross-book arbitrage on the '+GIU.esc(a.marketLabel)+
        ' — every outcome at a different book, +'+a.profitPct.toFixed(2)+
        '% locked at the listed prices. See the Sure bets strip for legs and stakes.">⚖️ '+
        GIU.esc(a.marketLabel)+' +'+a.profitPct.toFixed(2)+'%</span>';
    }).join(" ");
    return '<div class="arb-flag" role="note">'+chips+'</div>';
  }

  var anchor = "game-" + String(ev.id).replace(/[^a-zA-Z0-9_-]/g, "");
  /* Weather badge slot (NFL + MLB postseason cards): filled after the board
     renders, once the venue is confirmed against ESPN and the forecast is in.
     Hidden until then — no badge is better than a placeholder. */
  var wxSlot = (sport === "americanfootball_nfl" || sport === "baseball_mlb")
    ? '<div class="wx-badge" data-wxbadge="'+GIU.esc(ev.id)+'" hidden></div>' : "";
  /* Market-check slot (NFL tab only): Polymarket's live moneyline price vs
     what the best book prices imply — filled after the board renders, once
     the gamma fetch resolves. Hidden until then: no badge beats a wrong one. */
  var pmSlot = (sport === "americanfootball_nfl")
    ? '<div class="game-meta pm-check" data-pmcheck="'+GIU.esc(ev.id)+'" hidden></div>' : "";
  /* Injury-report slot (NFL tab only): key injuries from ESPN's injuries
     feed — injuries move lines, so each game card names each team's
     reportable injuries. Filled after the board renders; hidden until then. */
  var injSlot = (sport === "americanfootball_nfl")
    ? '<div class="game-meta inj-check" data-injcheck="'+GIU.esc(ev.id)+'" hidden></div>' : "";
  return '<div class="card" id="'+GIU.esc(anchor)+'" style="margin-bottom:20px"><div class="section-head" style="margin-bottom:14px"><div>'+
    titleHtml+
    '<div class="game-meta"><span>'+fmtT(ev.commence_time)+'</span></div></div></div>'+
    arbFlagHtml()+consLineHtml()+fairLineHtml()+pmSlot+injSlot+histHtml()+wxSlot+bestCard+
    '<div class="table-scroll"><table class="data"><thead><tr><th>Book</th>'+
    '<th>'+GIU.esc(OL.shortName(a))+' spread</th><th>'+GIU.esc(OL.shortName(h))+' spread</th>'+
    '<th>Over</th><th>Under</th>'+
    '<th>'+GIU.esc(OL.shortName(a))+' ML</th><th>'+GIU.esc(OL.shortName(h))+' ML</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

/* ---- bet slip UI ---- */
/* ---- bet-slip GameDay identity ----
   The team directory loads once in parallel with everything else. Legs render
   in plain text until it arrives, then the slip re-renders with the real ESPN
   logo + team-color chip for the leg's team. Legs whose side isn't a team
   (Over/Under totals, unknown names, leagues with no directory) keep plain
   text — nothing is guessed. */
var slipDir = {};
function slipIdHtml(l){
  var t = GIU.teamFind(slipDir, OL.sportLeague(l.sport || sport), l.side);
  if(!t) return "";
  return '<span class="slip-id">'+GIU.teamLogo(t, 22)+GIU.teamChip(t, t.abbr)+'</span> ';
}
function totalsHtml(p){
  var imp = (p && p.implied != null)
    ? '<div><span>Implied probability</span><b class="num">'+(p.implied*100).toFixed(1)+
      '% <span style="color:var(--faint);font-weight:400">break-even</span></b></div>' : "";
  return '<div><span>Combined odds</span><b class="num">'+GIU.esc(String(p.combinedAm))+
    ' <span style="color:var(--faint);font-weight:400">('+p.combined.toFixed(3)+' dec)</span></b></div>'+imp+
    '<div><span>To win</span><b class="num" style="color:var(--green)">$'+p.profit.toFixed(2)+'</b></div>'+
    '<div><span>Total payout</span><b class="num">$'+p.total.toFixed(2)+'</b></div>';
}
/* Same-game legs ride together: the combined price above is independent-
   outcome math, but books price same-game legs as correlated — and most
   won't take both sides of one game in a single parlay. */
function sameGameWarnHtml(slip){
  var groups = Slip.sameGame(slip);
  if(!groups.length) return "";
  var list = groups.map(function(g){
    return GIU.esc(g.game)+' \u00d7'+g.sides.length+
      ' ('+g.sides.map(function(s){ return GIU.esc(s); }).join(', ')+')';
  }).join('; ');
  return '<div class="slip-warn" role="note"><b>\u26a0 Same-game legs.</b> '+list+
    ' \u2014 books treat these as correlated, so the combined price above '+
    '(independent-outcome math) won\u2019t match the book\u2019s, and most books '+
    'won\u2019t let you parlay both sides of one game.</div>';
}
/* Slip value summary: how the live board's prices compare to what each leg
   was captured at — the bettor's "did the lines move on me?" readout. */
function slipValueHtml(){
  var v = Slip.valueSummary(slip);
  if(!v) return "";
  var cls, txt;
  if(v.better || v.worse){
    var bits = [];
    if(v.better) bits.push(v.better + " moved your way \u25b2");
    if(v.worse) bits.push(v.worse + " moved against you \u25bc");
    cls = v.worse ? (v.better ? "mixed" : "bad") : "good";
    txt = "Line moves on your slip: " + bits.join(" \u00b7 ") +
      " \u2014 combined " + OL.dec2am(v.current) +
      " (was " + OL.dec2am(v.captured) + ")";
  }else{
    cls = "quiet";
    txt = "No line moves on your slip yet \u2014 tracking from your captured prices.";
  }
  return '<div class="slip-value ' + cls + '" role="status">' +
    GIU.esc(txt) + "</div>";
}
function renderSlip(){
  var panel = $("slipPanel"), n = slip.length;
  $("slipCount").textContent = n;
  /* Shared-slip banner: a link from a friend, or a link that failed to
     decode. The banner is honest about staleness — shared prices are from
     link-creation time, and the board's re-pricing below will flag movers. */
  var sharedHtml = "";
  if(sharedTs === -1)
    sharedHtml = '<div class="slip-shared slip-shared-bad" role="status">That share link didn’t decode — your slip is unchanged.</div>';
  else if(sharedTs)
    sharedHtml = '<div class="slip-shared" role="status">🔗 <b>Shared slip loaded.</b> These prices were captured '+
      GIU.esc(fmtSince(sharedTs))+' (your time) — lines may have moved since. The board above re-prices each leg as it pulls, and ▲▼ flags movers.'+
      '<button class="slip-x" id="sharedDismiss" style="float:right" aria-label="Dismiss shared-slip notice">✕</button></div>';
  if(!n){
    panel.innerHTML = sharedHtml + '<div class="empty" style="padding:26px 14px">Tap any price on the board to start building a slip.<br>Your slip lives in this browser only.</div>';
    return;
  }
  var rows = slip.map(function(l){
    var mv = "";
    if(l.prevPrice !== undefined){
      var up = l.price > l.prevPrice;
      mv = ' <span class="'+(up?"mv-up":"mv-dn")+'">'+(up?"▲":"▼")+'</span>';
    }
    return '<div class="slip-leg"><div><b>'+slipIdHtml(l)+GIU.esc(l.side)+'</b> '+
      '<span class="num">'+GIU.esc(l.label)+' ('+OL.dec2am(l.price)+')</span>'+mv+
      '<div class="slip-sub">'+GIU.esc(l.game)+' · '+GIU.esc(l.bookTitle)+'</div></div>'+
      '<button class="slip-x" data-unslip="'+GIU.esc(l.id)+'" aria-label="Remove '+GIU.esc(l.side)+' from slip">✕</button></div>';
  }).join("");
  panel.innerHTML =
    sharedHtml +
    '<div class="slip-head"><b>Your slip</b><span class="tag">'+n+' leg'+(n>1?"s":"")+'</span></div>'+
    slipValueHtml()+
    '<div class="slip-legs">'+rows+'</div>'+sameGameWarnHtml(slip)+
    '<div class="field" style="margin:14px 0 8px"><label for="slipStake">Stake ($)</label>'+
    '<input type="number" id="slipStake" min="0" step="1" value="'+stakeVal+'" inputmode="numeric"></div>'+
    '<div class="slip-totals" id="slipTotals">'+totalsHtml(Slip.payout(slip, stakeVal))+'</div>'+
    '<button class="btn btn-ghost btn-sm" id="slipShare" style="width:100%;justify-content:center;margin-top:8px" aria-label="Copy a share link for this slip">🔗 Share this slip</button>'+
    '<button class="btn btn-ghost btn-sm" id="slipJournal" style="width:100%;justify-content:center;margin-top:8px" aria-label="Log each slip leg as a pending bet in your bet journal" title="Each leg is logged as a single bet with the slip stake split evenly. If this slip is a parlay, log it as one Parlay entry on the journal page instead.">📓 Send to journal</button>'+
    '<p class="slip-note" id="slipJournalNote" role="status" style="display:none"></p>'+
    '<button class="btn btn-ghost btn-sm" id="slipClear" style="width:100%;justify-content:center;margin-top:8px">Clear slip</button>'+
    '<p class="slip-note">Practice slip — research only, not a wager with any book. Prices refresh from the live board above; ▲▼ marks a leg whose line moved.</p>';
}
function refreshPickMarks(){
  var btns = document.querySelectorAll("#oddsBoard .pick-btn");
  for(var i=0;i<btns.length;i++){
    var on = Slip.has(slip, btns[i].getAttribute("data-slip"));
    btns[i].classList.toggle("picked", on);
    btns[i].setAttribute("aria-pressed", on ? "true" : "false");
  }
}
/* share this slip: copy a deep link (legs + stake encoded in the hash).
   The link never carries the visitor's Odds-API key — that stays in their
   own localStorage. A friend opening the link gets the legs with the
   capture timestamp; the board re-prices them on the next pull. */
function copyText(txt, done){
  function legacy(){
    try{
      var ta = document.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "0"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      var ok = false;
      try{ ok = document.execCommand("copy"); }catch(e){}
      try{ document.body.removeChild(ta); }catch(e){}
      done(!!ok);
    }catch(e){ done(false); }
  }
  try{
    if(typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ done(true); }, legacy);
      return;
    }
  }catch(e){}
  legacy();
}
function shareSlip(){
  var btn = $("slipShare");
  var enc = Slip.encodeShare(slip, stakeVal);
  if(!enc){ if(btn) btn.textContent = "Nothing to share yet"; return; }
  var base = "";
  try{ base = String(location.href).split("#")[0]; }catch(e){}
  copyText(base + "#slip=" + enc, function(done){
    var b2 = $("slipShare");
    if(!b2) return;
    b2.textContent = done ? "✓ Link copied — paste it anywhere" : "Copy failed — share manually from the address bar";
    setTimeout(function(){
      var b3 = $("slipShare");
      if(b3) b3.textContent = "🔗 Share this slip";
    }, 2600);
  });
}

/* ---- slip -> bet journal ----
   Logs every slip leg as a pending single bet in the journal's localStorage
   (the journal page owns that key; same-origin so this works cross-page).
   Legs map through Slip.journalBets (captured American price, stake split
   evenly); each candidate is validated with BetMath.journalValid and
   de-duplicated against what's already logged, so a second click can't
   double-log. The status line says exactly what happened. */
var JRN_BETS = "giu.journal.v1";
function sportJournalLabel(key){
  for(var i = 0; i < SPORTS.length; i++) if(SPORTS[i][0] === key) return SPORTS[i][1];
  return "Other";
}
function loadJournalBets(){
  try{ var b = JSON.parse(localStorage.getItem(JRN_BETS)); return Array.isArray(b) ? b : []; }
  catch(e){ return []; }
}
function saveJournalBets(bets){
  try{ localStorage.setItem(JRN_BETS, JSON.stringify(bets)); }catch(e){}
}
function journalToday(){
  var d = new Date();
  function p2(n){ return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}
function journalDup(existing, b){
  for(var i = 0; i < existing.length; i++){
    var e = existing[i] || {};
    if(String(e.date) === String(b.date) && String(e.sport) === String(b.sport) &&
       String(e.event) === String(b.event) && String(e.market) === String(b.market) &&
       String(e.pick) === String(b.pick) && Number(e.price) === Number(b.price) &&
       Number(e.stake) === Number(b.stake)) return true;
  }
  return false;
}
function journalNote(msg){
  var n = $("slipJournalNote");
  if(!n) return;
  n.style.display = msg ? "block" : "none";
  n.textContent = msg || "";
}
function journalNoteHtml(html){
  var n = $("slipJournalNote");
  if(!n) return;
  n.style.display = html ? "block" : "none";
  n.innerHTML = html || "";
}
function exportSlipToJournal(){
  if(!slip.length){ journalNote("Your slip is empty — add picks from the board first."); return; }
  var BM = window.BetMath;
  if(!BM || !BM.journalValid || !BM.decimalToAmerican){
    journalNote("Journal export is unavailable (bet-math library failed to load).");
    return;
  }
  var res = Slip.journalBets(slip, stakeVal, sportJournalLabel(sport), journalToday(),
    function(d){ return BM.decimalToAmerican(d); });
  var existing = loadJournalBets();
  var nextId = existing.reduce(function(m, b){ return Math.max(m, Number(b.id) || 0); }, 0) + 1;
  var added = 0, dup = 0, bad = res.skipped;
  res.bets.forEach(function(b){
    if(BM.journalValid(b)){ bad++; return; }
    if(journalDup(existing, b)){ dup++; return; }
    b.id = nextId++;
    existing.push(b);
    added++;
  });
  saveJournalBets(existing);
  var per = slip.length ? Math.round((Number(stakeVal) || 0) / slip.length * 100) / 100 : 0;
  var parts = [];
  if(added) parts.push(added + " bet" + (added > 1 ? "s" : "") + " added to your journal");
  if(dup) parts.push(dup + " already logged");
  if(bad) parts.push(bad + " skipped");
  var msg = parts.length ? parts.join(" · ") + "." : "Nothing new to add.";
  if(added) msg += " Stake split evenly ($" + per.toFixed(2) + " each) — adjust in the journal if needed.";
  journalNoteHtml(GIU.esc(msg) + ' <a href="journal.html">Open your journal &rarr;</a>');
}
/* ---- shared-slip deep links ----
   Opening odds.html#slip=<payload> loads a friend's slip once: legs +
   stake decode into the local slip, the capture timestamp drives an
   honesty banner in the panel, and the hash is stripped (replaceState)
   so a refresh doesn't re-import stale legs. A bad link shows the error
   banner and leaves the local slip untouched. The visitor's API key is
   never part of the link. */
var sharedTs = 0; /* 0 = none, -1 = decode failure, >0 = capture timestamp */
(function loadSharedSlip(){
  var h = "";
  try{ h = String(location.hash || ""); }catch(e){ return; }
  if(h.indexOf("#slip=") !== 0) return;
  var d = Slip.decodeShare(h.slice(6));
  if(!d || !d.legs.length){ sharedTs = -1; }
  else{
    slip = d.legs; stakeVal = d.stake; sharedTs = d.ts;
    Slip.normalize(slip); /* captured = the shared price, matching the banner */
    saveSlip(); saveStake();
  }
  try{
    if(history && history.replaceState)
      history.replaceState(null, "", location.pathname + (location.search || ""));
  }catch(e){}
})();

/* ---- wiring ---- */
$("saveKey").addEventListener("click", function(){
  var v = $("keyInput").value.trim();
  if(!v){ alert("Paste your API key first."); return; }
  key = v;
  try{ localStorage.setItem("giu_odds_key", v); }catch(e){}
  render();
});
$("clearKey").addEventListener("click", function(){
  key = ""; try{ localStorage.removeItem("giu_odds_key"); }catch(e){}
  $("keyInput").value=""; render();
});
$("sportTabs").innerHTML = SPORTS.map(function(s,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-sport="'+s[0]+'">'+s[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("sportTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("sportTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); sport = t.getAttribute("data-sport"); render();
  });
});
$("refreshBtn").addEventListener("click", function(){ render({silent:true}); });
$("autoRef").addEventListener("change", function(){
  if(autoTimer){ clearInterval(autoTimer); autoTimer=null; }
  if(this.checked){
    /* One timer only — never stacked. The tick itself decides whether a
       fetch is worth the quota; nothing fires while the tab is hidden. */
    autoTimer = setInterval(autoTick, 5*60*1000);
    render({silent:true}); /* immediate pull so the status line reflects reality */
  } else {
    setStatus("");
  }
});
/* line-move alerts: threshold select (persisted). requestPermission is
   asked on this explicit gesture; a denial still leaves the in-page
   toasts working — only the hidden-tab browser ping needs permission. */
(function initAlerts(){
  var sel = $("alertThr");
  if(!sel) return;
  sel.value = alertThr > 0 ? String(alertThr) : "0";
  wireAlertToasts();
  sel.addEventListener("change", function(){
    var v = Number(sel.value) || 0;
    alertThr = (v === 1 || v === 1.5 || v === 2) ? v : 0;
    try{ localStorage.setItem(alertThrKey, String(alertThr)); }catch(e){}
    if(alertThr > 0){
      alertBase = {}; /* re-baseline from the next pull — no stale moves */
      try{
        if("Notification" in window && window.Notification &&
           window.Notification.permission === "default"){
          var p = window.Notification.requestPermission();
          if(p && p.catch) p.catch(function(){});
        }
      }catch(e){}
      render({silent:true}); /* seed the baseline on this pull, alert from the next */
    }
  });
})();
/* slip: toggle legs from the board (delegated, survives re-renders) */
$("oddsBoard").addEventListener("click", function(e){
  /* no-key empty state: jump back up to the setup card and focus the key field */
  var nk = e.target && e.target.closest ? e.target.closest("#oddsNoKeyBtn") : null;
  if(nk){
    var su = $("oddsSetup"), ki = $("keyInput");
    if(su && su.scrollIntoView) su.scrollIntoView({behavior:"smooth", block:"start"});
    if(ki && ki.focus) setTimeout(function(){ try{ ki.focus({preventScroll:true}); }catch(x){} }, 420);
    return;
  }
  var b = e.target && e.target.closest ? e.target.closest(".pick-btn") : null;
  if(!b) return;
  var leg = {
    id:b.getAttribute("data-slip"), game:b.getAttribute("data-game"),
    market:b.getAttribute("data-market"), side:b.getAttribute("data-side"),
    book:b.getAttribute("data-book"), bookTitle:b.getAttribute("data-booktitle"),
    label:b.getAttribute("data-label"), price:Number(b.getAttribute("data-price")),
    captured:Number(b.getAttribute("data-price")), /* line-move baseline */
    sport:sport /* league context for slip-leg GameDay identity */
  };
  var added = Slip.toggle(slip, leg);
  saveSlip();
  b.classList.toggle("picked", added);
  b.setAttribute("aria-pressed", added ? "true" : "false");
  b.setAttribute("aria-label", (added ? "Remove " : "Add ") + leg.side + " " + leg.label +
    " (" + OL.dec2am(leg.price) + ") at " + leg.bookTitle + (added ? " from" : " to") + " your slip");
  renderSlip();
});
/* slip panel: remove legs, clear, share, stake math (delegated + bubbled input) */
$("slipPanel").addEventListener("click", function(e){
  var x = e.target && e.target.closest ? e.target.closest("[data-unslip]") : null;
  if(x){
    Slip.remove(slip, x.getAttribute("data-unslip"));
    saveSlip(); refreshPickMarks(); renderSlip();
    return;
  }
  if(e.target && e.target.id === "sharedDismiss"){
    sharedTs = 0; renderSlip();
    return;
  }
  if(e.target && e.target.id === "slipShare"){
    shareSlip();
    return;
  }
  if(e.target && e.target.id === "slipJournal"){
    exportSlipToJournal();
    return;
  }
  if(e.target && e.target.id === "slipClear"){
    Slip.clear(slip); saveSlip(); refreshPickMarks(); renderSlip();
  }
});
$("slipPanel").addEventListener("input", function(e){
  if(e.target && e.target.id === "slipStake"){
    stakeVal = Number(e.target.value) || 0;
    saveStake();
    var t = $("slipTotals");
    if(t) t.innerHTML = totalsHtml(Slip.payout(slip, stakeVal));
  }
});
$("slipToggle").addEventListener("click", function(){
  var p = $("slipPanel"), open = p.hasAttribute("hidden");
  if(open){ p.removeAttribute("hidden"); this.setAttribute("aria-expanded", "true"); }
  else { p.setAttribute("hidden", ""); this.setAttribute("aria-expanded", "false"); }
});
renderSlip();
if(sharedTs){
  /* A shared slip should be visible, not hiding behind the closed panel. */
  var sp = $("slipPanel");
  if(sp) sp.removeAttribute("hidden");
  var st2 = $("slipToggle");
  if(st2) st2.setAttribute("aria-expanded", "true");
}
GIU.teamDir().then(function(d){ slipDir = d || {}; renderSlip(); });
render();
})();
