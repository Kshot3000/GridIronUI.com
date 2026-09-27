/* GridIronUI Predictions — market-implied probabilities, honestly labeled.
   These are NOT our picks. They are live Polymarket prices converted to probabilities.
   Series are looked up live per league so the page survives series rotation. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [["NFL","nfl"],["NBA","nba"],["MLB","mlb"],["NHL","nhl"],["EPL","epl"]];
function parseArr(s){ try{ var v = typeof s==="string"?JSON.parse(s):s; return Array.isArray(v)?v:[]; }catch(e){ return []; } }

function skel(){
  $("predGrid").innerHTML = '<div class="card"><div class="skel" style="height:140px"></div></div>'+
    '<div class="card"><div class="skel" style="height:140px"></div></div>';
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
function probRow(label, pct){
  var hot = pct>=50;
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:.9rem">'+GIU.esc(label)+'</span><b class="num" style="font-size:1.25rem;color:'+(hot?"var(--gold-soft)":"var(--muted)")+'">'+pct+'%</b></div>'+
  '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);margin-bottom:12px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(hot?"linear-gradient(90deg,var(--green),var(--gold))":"rgba(255,255,255,.18)")+'"></div></div>';
}
function load(key){
  skel();
  seriesFor(key).then(function(sid){
    return GIU.fetchJSON("https://gamma-api.polymarket.com/events?series_id="+sid+"&active=true&closed=false&limit=20");
  }).then(function(d){
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
    if(!rows.length){
      $("predGrid").innerHTML = '<div class="empty">No upcoming game markets with clear win probabilities for this league right now — check back closer to game day.</div>';
      return;
    }
    $("predGrid").innerHTML = rows.map(function(r){
      var t = fmtT(r.ev.startTime || r.ev.eventDate);
      var slug = r.ev.slug||"";
      var body;
      if(r.mls.length===1){
        /* classic 2-way: team vs team */
        var o = parseArr(r.mls[0].outcomes), p = parseArr(r.mls[0].outcomePrices);
        var p0 = Math.round(Number(p[0])*100);
        if(/^Yes$/i.test(o[0]) && /^No$/i.test(o[1])){
          body = probRow(shortQ(r.mls[0].question)+" — Yes", p0) + probRow(shortQ(r.mls[0].question)+" — No", 100-p0);
        } else {
          body = probRow(o[0], p0) + probRow(o[1], 100-p0);
        }
      } else {
        /* 3-way style (soccer): each market's Yes price */
        body = r.mls.map(function(m){
          var p = parseArr(m.outcomePrices);
          return probRow(shortQ(m.question), Math.round(Number(p[0])*100));
        }).join("");
      }
      return '<div class="card"><span class="tag green">Market-implied</span>'+
        '<h3 style="margin:10px 0 4px;font-size:1.02rem">'+GIU.esc(r.ev.title)+'</h3>'+
        (t ? '<div class="game-meta" style="margin-bottom:12px"><span>'+t+'</span></div>' : '<div style="height:8px"></div>')+
        body+
        '<div class="game-meta"><span>Source: Polymarket live price</span>'+(slug?'<a href="https://polymarket.com/event/'+GIU.esc(slug)+'" target="_blank" rel="noopener">View market →</a>':"")+'</div></div>';
    }).join("");
  }).catch(function(){
    $("predGrid").innerHTML = GIU.failBox("Polymarket's API didn't respond, so there are no implied probabilities to show.");
  });
}
load("nfl");
Array.prototype.forEach.call($("predTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("predTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active");
    load(t.getAttribute("data-k"));
  });
});
})();
