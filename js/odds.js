/* GridIronUI Odds Board — The Odds API v4, best-price highlighting, line movement.
   Pure math lives in js/odds-logic.js (window.OddsLogic).
   No API key is ever hardcoded. The visitor's key lives in their own localStorage. */
(function(){
"use strict";
var OL = window.OddsLogic;
var $ = function(id){ return document.getElementById(id); };
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

function render(){
  var setup = $("oddsSetup"), board = $("oddsBoard");
  if(!key){ setup.style.display="block"; board.innerHTML=""; $("quota").textContent=""; return; }
  setup.style.display="none";
  if($("keyInput").value !== key) $("keyInput").value = key;
  var url = "https://api.the-odds-api.com/v4/sports/"+sport+"/odds/?apiKey="+encodeURIComponent(key)+
            "&regions=us&markets=h2h,spreads,totals&oddsFormat=decimal";
  board.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--faint)">Pulling live lines…</p>';
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
    var events = payload.events, dir = payload.dir;
    $("quota").textContent = "API quota remaining: "+remaining+" requests this month";
    var prev = getSnap(), now = {}, opens = getOpens();
    var html = events.length
      ? events.map(function(ev){ return renderGame(ev, prev, now, opens, dir, league); }).join("")
      : '<div class="empty">No upcoming games with odds for this league right now.</div>';
    board.innerHTML = html;
    setSnap(now);
    setOpens(opens);
    /* keep slip prices honest against the fresh board */
    if(slip.length){ Slip.reprice(slip, now); saveSlip(); }
    refreshPickMarks();
    renderSlip();
  }).catch(function(e){
    if(e.message==="invalid-key"){
      board.innerHTML = '<div class="notice red"><strong>That API key didn\'t work.</strong> The Odds API said the key is invalid. Double-check it, or <a href="https://the-odds-api.com" target="_blank" rel="noopener">grab a free one here</a> (500 requests/month, no card).</div>';
    } else {
      board.innerHTML = GIU.failBox("The Odds API didn't respond ("+GIU.esc(e.message)+"). Your key and quota are untouched — try again in a minute.");
    }
  });
}

function renderGame(ev, prev, now, opens, dir, league){
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

  return '<div class="card" style="margin-bottom:20px"><div class="section-head" style="margin-bottom:14px"><div>'+
    titleHtml+
    '<div class="game-meta"><span>'+fmtT(ev.commence_time)+'</span></div></div></div>'+
    consLineHtml()+bestCard+
    '<div class="table-scroll"><table class="data"><thead><tr><th>Book</th>'+
    '<th>'+GIU.esc(OL.shortName(a))+' spread</th><th>'+GIU.esc(OL.shortName(h))+' spread</th>'+
    '<th>Over</th><th>Under</th>'+
    '<th>'+GIU.esc(OL.shortName(a))+' ML</th><th>'+GIU.esc(OL.shortName(h))+' ML</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

/* ---- bet slip UI ---- */
function totalsHtml(p){
  return '<div><span>Combined odds</span><b class="num">'+GIU.esc(String(p.combinedAm))+
    ' <span style="color:var(--faint);font-weight:400">'+p.combined.toFixed(3)+' dec</span></b></div>'+
    '<div><span>To win</span><b class="num" style="color:var(--green)">$'+p.profit.toFixed(2)+'</b></div>'+
    '<div><span>Total payout</span><b class="num">$'+p.total.toFixed(2)+'</b></div>';
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
    return '<div class="slip-leg"><div><b>'+GIU.esc(l.side)+'</b> '+
      '<span class="num">'+GIU.esc(l.label)+' ('+OL.dec2am(l.price)+')</span>'+mv+
      '<div class="slip-sub">'+GIU.esc(l.game)+' · '+GIU.esc(l.bookTitle)+'</div></div>'+
      '<button class="slip-x" data-unslip="'+GIU.esc(l.id)+'" aria-label="Remove '+GIU.esc(l.side)+' from slip">✕</button></div>';
  }).join("");
  panel.innerHTML =
    '<div class="slip-head"><b>Your slip</b><span class="tag">'+n+' leg'+(n>1?"s":"")+'</span></div>'+
    '<div class="slip-legs">'+rows+'</div>'+
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
$("refreshBtn").addEventListener("click", render);
$("autoRef").addEventListener("change", function(){
  if(autoTimer){ clearInterval(autoTimer); autoTimer=null; }
  if(this.checked){
    autoTimer = setInterval(function(){ if(key) render(); }, 5*60*1000);
    alert("Auto-refresh on: the board reloads every 5 minutes. Each reload uses API quota — the free tier is 500 requests/month.");
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
    label:b.getAttribute("data-label"), price:Number(b.getAttribute("data-price"))
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
render();
})();
