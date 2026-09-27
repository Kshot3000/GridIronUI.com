/* GridIronUI News — ESPN league news feeds. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["football/nfl","NFL"],["basketball/nba","NBA"],["baseball/mlb","MLB"],
  ["hockey/nhl","NHL"],["football/college-football","NCAAF"],
  ["basketball/mens-college-basketball","NCAAB"],["soccer/eng.1","EPL"]
];
var cur = 0;
function ago(iso){
  var t = Date.parse(iso); if(!isFinite(t)) return "";
  var m = Math.floor((Date.now()-t)/60000);
  if(m < 60) return m+"m ago";
  var h = Math.floor(m/60); if(h < 24) return h+"h ago";
  return Math.floor(h/24)+"d ago";
}
function load(){
  var box = $("newsGrid");
  box.innerHTML = '<div class="card"><div class="skel" style="height:150px"></div></div>'.repeat(4);
  GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/"+LEAGUES[cur][0]+"/news?limit=24").then(function(d){
    var arts = d.articles||[];
    if(!arts.length){ box.innerHTML = '<div class="empty">No headlines right now.</div>'; return; }
    box.innerHTML = arts.map(function(a){
      var img = (a.images&&a.images[0]&&a.images[0].url)
        ? '<img class="card-img" loading="lazy" src="'+a.images[0].url+'" alt="">' : "";
      var link = (a.links&&a.links.web&&a.links.web.href) || "#";
      return '<a class="card" href="'+link+'" target="_blank" rel="noopener">'+img+
        '<div class="game-meta" style="margin:8px 0 6px"><span class="tag">'+LEAGUES[cur][1]+'</span><span>'+ago(a.published)+'</span></div>'+
        '<h3>'+GIU.esc(a.headline)+'</h3><p>'+GIU.esc((a.description||"").slice(0,160))+'…</p></a>';
    }).join("");
  }).catch(function(){
    box.innerHTML = GIU.failBox("The ESPN news feed didn't respond for "+LEAGUES[cur][1]+".");
  });
}
$("newsTabs").innerHTML = LEAGUES.map(function(l,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+l[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("newsTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("newsTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); load();
  });
});
load();
})();
