/* GridIronUI Injuries — ESPN injuries feed per league. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["football/nfl","NFL"],["basketball/nba","NBA"],["baseball/mlb","MLB"],
  ["hockey/nhl","NHL"],["football/college-football","NCAAF"],
  ["basketball/mens-college-basketball","NCAAB"],["soccer/eng.1","EPL"]
];
var cur = 0, data = [];
function detailText(i){
  /* ESPN injury entries carry longComment/shortComment strings, but `details`
     and `type` are OBJECTS ({type, location, detail, side, returnDate} etc).
     Rendering them raw produced "[object Object]". */
  if(i.longComment) return i.longComment;
  if(i.shortComment) return i.shortComment;
  var det = i.details || {}, parts = [];
  [det.type, det.location].forEach(function(v){
    if(v && parts.indexOf(v)===-1) parts.push(v);
  });
  if(det.detail && det.detail!=="Not Specified") parts.push(det.detail);
  if(det.side && det.side!=="Not Specified") parts.push(det.side+" side");
  var s = parts.join(" · ");
  if(det.returnDate) s += (s?" — ":"")+"expected back "+String(det.returnDate).slice(0,10);
  if(!s && i.type && i.type.description) s = i.type.description;
  return s;
}
function statusTag(s){
  s = String(s||"").toLowerCase();
  if(/out|injured reserve|ir\b/.test(s)) return '<span class="tag red">'+GIU.esc(s)+'</span>';
  if(/doubtful/.test(s)) return '<span class="tag red">'+GIU.esc(s)+'</span>';
  if(/questionable|day-to-day/.test(s)) return '<span class="tag">'+GIU.esc(s)+'</span>';
  return '<span class="tag blue">'+GIU.esc(s||"—")+'</span>';
}
function load(){
  var box = $("injGrid");
  box.innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>'.repeat(3);
  GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/"+LEAGUES[cur][0]+"/injuries").then(function(d){
    data = (d.injuries||[]).filter(function(t){ return (t.injuries||[]).length; });
    render("");
  }).catch(function(){
    box.innerHTML = GIU.failBox("The ESPN injuries feed didn't respond for "+LEAGUES[cur][1]+".");
  });
}
function render(q){
  q = q.toLowerCase();
  var box = $("injGrid");
  var teams = data.filter(function(t){
    if(!q) return true;
    if((t.displayName||"").toLowerCase().indexOf(q)!==-1) return true;
    return (t.injuries||[]).some(function(i){
      return (((i.athlete||{}).displayName||"")+" "+detailText(i)+" "+(i.status||"")).toLowerCase().indexOf(q)!==-1;
    });
  });
  if(!teams.length){ box.innerHTML = '<div class="empty">No injuries match "'+GIU.esc(q)+'".</div>'; return; }
  box.innerHTML = teams.map(function(t){
    var rows = (t.injuries||[]).map(function(i){
      var nm = ((i.athlete||{}).displayName)||"Unknown";
      var detail = detailText(i);
      return '<div class="gloss-term" style="padding:10px 0"><h3 style="font-size:.95rem">'+GIU.esc(nm)+' '+statusTag(i.status)+'</h3>'+
        '<p>'+GIU.esc(detail)+'</p>'+
        (i.date?'<p style="font-size:.78rem;color:var(--faint)">Updated '+GIU.esc(i.date.slice(0,10))+'</p>':"")+'</div>';
    }).join("");
    return '<div class="card"><h3>'+GIU.esc(t.displayName||t.name||"Team")+'</h3><span class="tag">'+(t.injuries||[]).length+' reported</span>'+rows+'</div>';
  }).join("");
}
$("injTabs").innerHTML = LEAGUES.map(function(l,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+l[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("injTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("injTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); $("injSearch").value=""; load();
  });
});
var deb=null;
$("injSearch").addEventListener("input", function(){
  clearTimeout(deb); var v=this.value;
  deb=setTimeout(function(){ render(v); }, 220);
});
load();
})();
