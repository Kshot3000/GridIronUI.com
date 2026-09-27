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

function fmtT(iso){
  try{ var d=new Date(iso);
    return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+" · "+
           d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }catch(e){ return iso; }
}
function snapKey(){ return "giu_odds_prev_"+sport; }
function getSnap(){ try{ return JSON.parse(localStorage.getItem(snapKey())||"{}"); }catch(e){ return {}; } }
function setSnap(s){ try{ localStorage.setItem(snapKey(), JSON.stringify(s)); }catch(e){} }

function render(){
  var setup = $("oddsSetup"), board = $("oddsBoard");
  if(!key){ setup.style.display="block"; board.innerHTML=""; $("quota").textContent=""; return; }
  setup.style.display="none";
  if($("keyInput").value !== key) $("keyInput").value = key;
  var url = "https://api.the-odds-api.com/v4/sports/"+sport+"/odds/?apiKey="+encodeURIComponent(key)+
            "&regions=us&markets=h2h,spreads,totals&oddsFormat=decimal";
  board.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--faint)">Pulling live lines…</p>';
  var remaining = "?";
  fetch(url, {cache:"no-store"}).then(function(r){
    remaining = r.headers.get("x-requests-remaining") || "?";
    if(r.status===401) throw new Error("invalid-key");
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(events){
    $("quota").textContent = "API quota remaining: "+remaining+" requests this month";
    var prev = getSnap(), now = {};
    var html = events.length
      ? events.map(function(ev){ return renderGame(ev, prev, now); }).join("")
      : '<div class="empty">No upcoming games with odds for this league right now.</div>';
    board.innerHTML = html;
    setSnap(now);
  }).catch(function(e){
    if(e.message==="invalid-key"){
      board.innerHTML = '<div class="notice red"><strong>That API key didn\'t work.</strong> The Odds API said the key is invalid. Double-check it, or <a href="https://the-odds-api.com" target="_blank" rel="noopener">grab a free one here</a> (500 requests/month, no card).</div>';
    } else {
      board.innerHTML = GIU.failBox("The Odds API didn't respond ("+GIU.esc(e.message)+"). Your key and quota are untouched — try again in a minute.");
    }
  });
}

function renderGame(ev, prev, now){
  var books = ev.bookmakers||[];
  var h = ev.home_team, a = ev.away_team;
  var spreadBest = OL.bestSpread(books, ev),
      totalBest  = OL.bestTotal(books),
      mlBest     = OL.bestML(books, ev);
  var top = OL.topBook(books, [spreadBest, totalBest, mlBest]);

  function cell(mkey, bkKey, name, label, idKey, price){
    var id = ev.id+"|"+bkKey+"|"+mkey+"|"+name;  /* book key included: movement is per-book */
    var old = prev[id];
    now[id] = price;
    var mv = "", flash = "";
    if(old !== undefined && Math.abs(old-price) > 0.0001){
      mv = price>old ? ' <span class="mv-up">▲</span>' : ' <span class="mv-dn">▼</span>';
      flash = " flash";
    }
    var cls = ((idKey ? "best" : "") + flash).trim();
    return '<td class="'+cls+'"><span class="num">'+label+'</span>'+mv+'</td>';
  }
  function isBest(mapVal, bk, extra){
    return mapVal === bk.key + (extra||"");
  }
  var rows = books.map(function(bk){
    var hML = OL.oneOutcome(bk,"h2h",h), aML = OL.oneOutcome(bk,"h2h",a);
    var hSP = OL.oneOutcome(bk,"spreads",h), aSP = OL.oneOutcome(bk,"spreads",a);
    var oT = OL.oneOutcome(bk,"totals","Over"), uT = OL.oneOutcome(bk,"totals","Under");
    return "<tr><td><b>"+GIU.esc(bk.title)+"</b></td>"+
      (aSP ? cell("spreads", bk.key, a, OL.fmtPt(aSP.point)+" · "+OL.dec2am(aSP.price), isBest(spreadBest.a,bk,"|"+aSP.point+"|"+aSP.price), aSP.price) : "<td>—</td>")+
      (hSP ? cell("spreads", bk.key, h, OL.fmtPt(hSP.point)+" · "+OL.dec2am(hSP.price), isBest(spreadBest.h,bk,"|"+hSP.point+"|"+hSP.price), hSP.price) : "<td>—</td>")+
      (oT  ? cell("totals", bk.key, "Over","O "+OL.fmtPt(oT.point)+" · "+OL.dec2am(oT.price), isBest(totalBest.o,bk,"|"+oT.point+"|"+oT.price), oT.price) : "<td>—</td>")+
      (uT  ? cell("totals", bk.key, "Under","U "+OL.fmtPt(uT.point)+" · "+OL.dec2am(uT.price), isBest(totalBest.u,bk,"|"+uT.point+"|"+uT.price), uT.price) : "<td>—</td>")+
      (aML ? cell("h2h", bk.key, a, OL.dec2am(aML.price), isBest(mlBest.a,bk,"|"+aML.price), aML.price) : "<td>—</td>")+
      (hML ? cell("h2h", bk.key, h, OL.dec2am(hML.price), isBest(mlBest.h,bk,"|"+hML.price), hML.price) : "<td>—</td>")+
      "</tr>";
  }).join("");

  var topTitle = top ? (books.filter(function(b){return b.key===top.key;})[0]||{}).title : null;
  var topLink = (top && BOOK_LINKS[top.key])
    ? ' <a href="'+BOOK_LINKS[top.key]+'" target="_blank" rel="noopener" class="btn btn-gold btn-sm">Bet at '+GIU.esc(topTitle)+' →</a>' : "";
  var bestCard = topTitle
    ? '<div class="notice green" style="margin:0 0 14px"><strong>★ Best place to bet this game: '+GIU.esc(topTitle)+'</strong> — holds '+top.count+' of the best prices on the board.'+topLink+
      '<br><span style="font-size:.82rem">Best prices are highlighted in green. ▲▼ shows movement since your last refresh.</span></div>'
    : "";

  return '<div class="card" style="margin-bottom:20px"><div class="section-head" style="margin-bottom:14px"><div>'+
    '<h3 style="margin:0">'+GIU.esc(a)+' @ '+GIU.esc(h)+'</h3>'+
    '<div class="game-meta"><span>'+fmtT(ev.commence_time)+'</span></div></div></div>'+
    bestCard+
    '<div class="table-scroll"><table class="data"><thead><tr><th>Book</th>'+
    '<th>'+GIU.esc(OL.shortName(a))+' spread</th><th>'+GIU.esc(OL.shortName(h))+' spread</th>'+
    '<th>Over</th><th>Under</th>'+
    '<th>'+GIU.esc(OL.shortName(a))+' ML</th><th>'+GIU.esc(OL.shortName(h))+' ML</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
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
render();
})();
