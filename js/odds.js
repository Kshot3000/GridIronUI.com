/* GridIronUI Odds Board — The Odds API v4, best-price highlighting, line movement.
   Pure math lives in js/odds-logic.js (window.OddsLogic).
   No API key is ever hardcoded. The visitor's key lives in their own localStorage. */
(function(){
"use strict";
var OL = window.OddsLogic;
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

/* ---- bet slip state (local only, never leaves the browser) ---- */
var Slip = window.OddsSlip;
var slip = [];
try{ slip = JSON.parse(localStorage.getItem("giu_slip") || "[]"); }catch(e){ slip = []; }
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

function render(opts){
  opts = opts || {};
  var setup = $("oddsSetup"), board = $("oddsBoard");
  if(!key){ setup.style.display="block"; board.innerHTML=""; $("quota").textContent=""; setStatus(""); return; }
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
    board.innerHTML = (movers.length ? renderMovers(movers) : "") + cards;
    boardHasGames = true;
    setSnap(now);
    setOpens(opens);
    setHist(hist);
    /* keep slip prices honest against the fresh board */
    if(slip.length){ Slip.reprice(slip, now); saveSlip(); }
    refreshPickMarks();
    renderSlip();
    setStatus();
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

  var anchor = "game-" + String(ev.id).replace(/[^a-zA-Z0-9_-]/g, "");
  return '<div class="card" id="'+GIU.esc(anchor)+'" style="margin-bottom:20px"><div class="section-head" style="margin-bottom:14px"><div>'+
    titleHtml+
    '<div class="game-meta"><span>'+fmtT(ev.commence_time)+'</span></div></div></div>'+
    consLineHtml()+histHtml()+bestCard+
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
    ' <span style="color:var(--faint);font-weight:400">'+p.combined.toFixed(3)+' dec</span></b></div>'+imp+
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
function renderSlip(){
  var panel = $("slipPanel"), n = slip.length;
  $("slipCount").textContent = n;
  if(!n){
    panel.innerHTML = '<div class="empty" style="padding:26px 14px">Tap any price on the board to start building a slip.<br>Your slip lives in this browser only.</div>';
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
    '<div class="slip-head"><b>Your slip</b><span class="tag">'+n+' leg'+(n>1?"s":"")+'</span></div>'+
    '<div class="slip-legs">'+rows+'</div>'+sameGameWarnHtml(slip)+
    '<div class="field" style="margin:14px 0 8px"><label for="slipStake">Stake ($)</label>'+
    '<input type="number" id="slipStake" min="0" step="1" value="'+stakeVal+'" inputmode="numeric"></div>'+
    '<div class="slip-totals" id="slipTotals">'+totalsHtml(Slip.payout(slip, stakeVal))+'</div>'+
    '<button class="btn btn-ghost btn-sm" id="slipClear" style="width:100%;justify-content:center;margin-top:12px">Clear slip</button>'+
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
/* slip: toggle legs from the board (delegated, survives re-renders) */
$("oddsBoard").addEventListener("click", function(e){
  var b = e.target && e.target.closest ? e.target.closest(".pick-btn") : null;
  if(!b) return;
  var leg = {
    id:b.getAttribute("data-slip"), game:b.getAttribute("data-game"),
    market:b.getAttribute("data-market"), side:b.getAttribute("data-side"),
    book:b.getAttribute("data-book"), bookTitle:b.getAttribute("data-booktitle"),
    label:b.getAttribute("data-label"), price:Number(b.getAttribute("data-price")),
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
/* slip panel: remove legs, clear, stake math (delegated + bubbled input) */
$("slipPanel").addEventListener("click", function(e){
  var x = e.target && e.target.closest ? e.target.closest("[data-unslip]") : null;
  if(x){
    Slip.remove(slip, x.getAttribute("data-unslip"));
    saveSlip(); refreshPickMarks(); renderSlip();
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
GIU.teamDir().then(function(d){ slipDir = d || {}; renderSlip(); });
render();
})();
