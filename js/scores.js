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

function load(){
  var box = $("scoreGrid");
  box.innerHTML = '<div class="card"><div class="skel" style="height:110px"></div></div>'.repeat(3);
  $("dayLabel").textContent = dayLabel();
  var d = new Date(); d.setDate(d.getDate()+dayOffset);
  var url = "https://site.api.espn.com/apis/site/v2/sports/"+LEAGUES[cur][0]+"/scoreboard?dates="+ymd(d);
  GIU.fetchJSON(url).then(function(data){
    var evs = data.events||[];
    if(!evs.length){
      box.innerHTML = '<div class="empty">No games on '+GIU.esc(dayLabel())+'. Try another day or league.</div>';
      return;
    }
    box.innerHTML = evs.map(function(ev){
      var c = ev.competitions[0], st = c.status.type;
      var home = c.competitors.filter(function(t){return t.homeAway==="home";})[0] || c.competitors[0];
      var away = c.competitors.filter(function(t){return t.homeAway==="away";})[0] || c.competitors[1] || {};
      var badge = st.state==="in" ? '<span class="live-badge"><i></i>'+GIU.esc(st.shortDetail||"Live")+'</span>'
        : st.state==="post" ? '<span class="tag">Final</span>'
        : '<span class="tag blue">'+GIU.esc(st.shortDetail||"Scheduled")+'</span>';
      var bc = ((c.broadcasts||[])[0]||{}).names;
      var odds = (c.odds&&c.odds[0]) ? '<span>Line: '+GIU.esc(c.odds[0].details||"")+(c.odds[0].overUnder? " · O/U "+c.odds[0].overUnder : "")+'</span>' : "";
      var lead = "";
      if(c.leaders && c.leaders.length && c.leaders[0].leaders && c.leaders[0].leaders.length){
        var L = c.leaders[0].leaders[0];
        lead = '<span>'+GIU.esc(c.leaders[0].name||"Leader")+': '+GIU.esc((L.athlete||{}).displayName||"")+" "+GIU.esc(L.displayValue||"")+'</span>';
      }
      function teamRow(t, winner){
        return '<div class="teams"><div class="team"><span class="abbr">'+GIU.esc(teamName(t.team||{}))+'</span>'+
          '<span class="nm">'+GIU.esc((t.team||{}).displayName||"")+'</span></div>'+
          '<span class="sc num" style="'+(winner?"color:var(--gold)":"")+'">'+GIU.esc(t.score==null?"–":t.score)+'</span></div>';
      }
      var hw = st.state==="post" && Number(home.score)>Number(away.score);
      var aw = st.state==="post" && Number(away.score)>Number(home.score);
      return '<div class="game-card">'+badge+
        teamRow(away, aw)+ teamRow(home, hw)+
        '<div class="game-meta"><span>'+GIU.esc((c.venue||{}).fullName||"")+'</span>'+
        (bc?'<span>📺 '+GIU.esc(bc.join(", "))+'</span>':"")+odds+lead+'</div></div>';
    }).join("");
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
load();
})();
