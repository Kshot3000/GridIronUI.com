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
function marketRow(m){
  var outs = parseArr(m.outcomes), prices = parseArr(m.outcomePrices);
  if(outs.length!==2 || prices.length!==2) return "";
  var p0 = Math.round(Number(prices[0])*100), p1 = 100-p0;
  return '<div style="margin-bottom:12px"><div style="font-size:.8rem;color:var(--faint);margin-bottom:5px">'+GIU.esc(shortQ(m.question))+'</div>'+
    [["0",outs[0],p0],["1",outs[1],p1]].map(function(o){
      return '<div style="display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:4px"><span>'+GIU.esc(o[1])+'</span><b class="num" style="color:var(--gold-soft)">'+o[2]+'¢</b></div>'+
      '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-bottom:6px"><div style="height:100%;width:'+o[2]+'%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--gold))"></div></div>';
    }).join("")+
    '<div style="font-size:.76rem;color:var(--faint)">Volume '+money(m.volume)+'</div></div>';
}

function load(){
  var box = $("marketGrid");
  box.innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>'.repeat(3);
  $("marketNote").textContent = "Loading live markets — this is a large data feed, one moment…";
  var lname = LEAGUES[cur][0];
  seriesFor(LEAGUES[cur][1]).then(function(sid){
    return GIU.fetchJSON("https://gamma-api.polymarket.com/events?series_id="+sid+"&active=true&closed=false&limit=20");
  }).then(function(d){
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
      return;
    }
    $("marketNote").textContent = games.length+" games · prices live from Polymarket · volume in $";
    box.innerHTML = games.map(function(g){
      var t = fmtT(g.ev.startTime || g.ev.eventDate);
      var slug = g.ev.slug||"";
      var body = g.mls.map(marketRow).join("") +
                 (g.spread ? marketRow(g.spread) : "") +
                 (g.total ? marketRow(g.total) : "");
      return '<div class="card"><span class="tag green">Live market</span>'+
        '<h3 style="margin:10px 0 4px">'+GIU.esc(g.ev.title)+'</h3>'+
        (t ? '<div class="game-meta" style="margin-bottom:12px"><span>'+t+'</span></div>' : '<div style="height:8px"></div>')+
        body+
        '<div class="game-meta"><a href="https://polymarket.com/event/'+GIU.esc(slug)+'" target="_blank" rel="noopener">Trade on Polymarket →</a></div></div>';
    }).join("");
  }).catch(function(){
    box.innerHTML = GIU.failBox("Polymarket's API didn't respond. No prices are shown rather than stale ones.");
    $("marketNote").textContent = "";
  });
}

$("marketTabs").innerHTML = LEAGUES.map(function(q,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+q[0]+'</button>';
}).join("");
Array.prototype.forEach.call($("marketTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("marketTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); load();
  });
});
load();
})();
