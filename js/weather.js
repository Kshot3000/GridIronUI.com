/* GridIronUI Game Weather — NFL stadium dataset + Open-Meteo hourly forecasts.
   Dome/retractable venues show "Dome — weather N/A". */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
/* [abbr, stadium, city, lat, lon, roof] — roof: open | dome | retractable */
var STADIUMS = [
  ["ARI","State Farm Stadium","Glendale, AZ",33.5277,-112.2626,"retractable"],
  ["ATL","Mercedes-Benz Stadium","Atlanta, GA",33.7554,-84.4008,"retractable"],
  ["BAL","M&T Bank Stadium","Baltimore, MD",39.2780,-76.6227,"open"],
  ["BUF","Highmark Stadium","Orchard Park, NY",42.7738,-78.7869,"open"],
  ["CAR","Bank of America Stadium","Charlotte, NC",35.2258,-80.8528,"open"],
  ["CHI","Soldier Field","Chicago, IL",41.8623,-87.6167,"open"],
  ["CIN","Paycor Stadium","Cincinnati, OH",39.0954,-84.5160,"open"],
  ["CLE","Huntington Bank Field","Cleveland, OH",41.5061,-81.6995,"open"],
  ["DAL","AT&T Stadium","Arlington, TX",32.7473,-97.0945,"retractable"],
  ["DEN","Empower Field at Mile High","Denver, CO",39.7439,-105.0201,"open"],
  ["DET","Ford Field","Detroit, MI",42.3400,-83.0456,"dome"],
  ["GB","Lambeau Field","Green Bay, WI",44.5013,-88.0622,"open"],
  ["HOU","NRG Stadium","Houston, TX",29.6847,-95.4107,"retractable"],
  ["IND","Lucas Oil Stadium","Indianapolis, IN",39.7601,-86.1639,"retractable"],
  ["JAX","EverBank Stadium","Jacksonville, FL",30.3239,-81.6373,"open"],
  ["KC","GEHA Field at Arrowhead","Kansas City, MO",39.0489,-94.4839,"open"],
  ["LV","Allegiant Stadium","Las Vegas, NV",36.0909,-115.1833,"dome"],
  ["LAC","SoFi Stadium","Inglewood, CA",33.9535,-118.3392,"open"],
  ["LAR","SoFi Stadium","Inglewood, CA",33.9535,-118.3392,"open"],
  ["MIA","Hard Rock Stadium","Miami Gardens, FL",25.9580,-80.2389,"open"],
  ["MIN","U.S. Bank Stadium","Minneapolis, MN",44.9740,-93.2581,"dome"],
  ["NE","Gillette Stadium","Foxborough, MA",42.0909,-71.2643,"open"],
  ["NO","Caesars Superdome","New Orleans, LA",29.9509,-90.0811,"dome"],
  ["NYG","MetLife Stadium","East Rutherford, NJ",40.8135,-74.0745,"open"],
  ["NYJ","MetLife Stadium","East Rutherford, NJ",40.8135,-74.0745,"open"],
  ["PHI","Lincoln Financial Field","Philadelphia, PA",39.9008,-75.1675,"open"],
  ["PIT","Acrisure Stadium","Pittsburgh, PA",40.4468,-80.0158,"open"],
  ["SF","Levi's Stadium","Santa Clara, CA",37.4030,-121.9699,"open"],
  ["SEA","Lumen Field","Seattle, WA",47.5952,-122.3316,"open"],
  ["TB","Raymond James Stadium","Tampa, FL",27.9759,-82.5033,"open"],
  ["TEN","Nissan Stadium","Nashville, TN",36.1665,-86.7713,"open"],
  ["WAS","Northwest Stadium","Landover, MD",38.9077,-76.8645,"open"]
];
function stadiumFor(abbr){
  for(var i=0;i<STADIUMS.length;i++) if(STADIUMS[i][0]===abbr) return STADIUMS[i];
  return null;
}
function compass(deg){
  var dirs=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg/22.5)%16];
}
var wxCache = {};
function forecast(st, kickoffISO){
  var key = st[0]+"|"+kickoffISO.slice(0,10);
  if(wxCache[key]) return Promise.resolve(wxCache[key]);
  var url = "https://api.open-meteo.com/v1/forecast?latitude="+st[3]+"&longitude="+st[4]+
    "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m"+
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&forecast_days=16";
  /* timezone=UTC: hourly stamps have no offset but parse as UTC, so the epoch
     comparison below matches ESPN's ISO kickoff regardless of the visitor's timezone.
     (timezone=auto returns stadium-local stamps, which Date.parse would misread.) */
  return GIU.fetchJSON(url).then(function(d){
    var times = d.hourly.time, target = Date.parse(kickoffISO), bi = 0, bd = Infinity;
    times.forEach(function(t,i){
      var diff = Math.abs(Date.parse(t)-target);
      if(diff<bd){ bd=diff; bi=i; }
    });
    var w = {
      temp: Math.round(d.hourly.temperature_2m[bi]),
      precip: d.hourly.precipitation_probability[bi],
      wind: Math.round(d.hourly.wind_speed_10m[bi]),
      wdir: compass(d.hourly.wind_direction_10m[bi]),
      when: times[bi]
    };
    wxCache[key]=w; return w;
  });
}
function impact(w){
  var notes = [];
  if(w.wind >= 20) notes.push('<span class="tag red">High wind '+w.wind+' mph — strong Under lean</span>');
  else if(w.wind >= 13) notes.push('<span class="tag">Wind '+w.wind+' mph — mild Under lean</span>');
  if(w.precip >= 60) notes.push('<span class="tag">Rain '+w.precip+'% — favors run game</span>');
  if(w.temp <= 25) notes.push('<span class="tag blue">Freezing '+w.temp+'°F</span>');
  else if(w.temp >= 90) notes.push('<span class="tag">Heat '+w.temp+'°F</span>');
  return notes.length ? notes.join(" ") : '<span class="tag green">No major concerns</span>';
}

GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard").then(function(d){
  var evs = (d.events||[]).filter(function(ev){
    var st = ev.competitions[0].status.type.state;
    return st !== "post";
  }).slice(0,16);
  var box = $("wxGrid");
  if(!evs.length){ box.innerHTML = '<div class="empty">No upcoming NFL games on the board.</div>'; return; }
  box.innerHTML = evs.map(function(ev){
    var c = ev.competitions[0];
    var home = c.competitors.filter(function(t){return t.homeAway==="home";})[0];
    var away = c.competitors.filter(function(t){return t.homeAway==="away";})[0];
    var st = stadiumFor(home.team.abbreviation);
    var when = "";
    try{ var dt=new Date(ev.date);
      when = dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+" · "+dt.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    }catch(e){}
    return '<div class="card" data-game="'+ev.id+'" data-home="'+home.team.abbreviation+'" data-kick="'+ev.date+'">'+
      '<div class="game-meta"><span>'+when+'</span></div>'+
      '<h3 style="margin:8px 0">'+GIU.esc(away.team.displayName)+' @ '+GIU.esc(home.team.displayName)+'</h3>'+
      (st ? '<p style="font-size:.86rem;color:var(--muted);margin:0 0 10px">🏟️ '+GIU.esc(st[1])+' · '+GIU.esc(st[2])+(st[5]==="open"?"":' · <span class="tag blue">'+st[5]+' roof</span>')+'</p>'
          : '<p style="color:var(--faint)">Stadium data unavailable</p>')+
      '<div class="wx-body"><div class="skel" style="height:60px"></div></div></div>';
  }).join("");
  Array.prototype.forEach.call(box.querySelectorAll("[data-game]"), function(card){
    var st = stadiumFor(card.getAttribute("data-home"));
    var body = card.querySelector(".wx-body");
    if(!st){ body.innerHTML = '<p style="color:var(--faint)">No stadium data.</p>'; return; }
    if(st[5] !== "open"){
      body.innerHTML = '<div class="notice" style="margin:0"><strong>Dome — weather N/A.</strong> '+
        GIU.esc(st[1])+' has a '+(st[5]==="dome"?"fixed":"retractable")+' roof, so wind and rain don\'t factor into the total. '+
        (st[5]==="retractable" ? 'If the roof opens, conditions apply — check the team\'s official gameday report.' : '')+'</div>';
      return;
    }
    forecast(st, card.getAttribute("data-kick")).then(function(w){
      body.innerHTML =
        '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:10px">'+
        '<div><div style="font-size:.72rem;color:var(--faint);text-transform:uppercase;letter-spacing:.08em">Kickoff temp</div><b class="num" style="font-size:1.6rem">'+w.temp+'°F</b></div>'+
        '<div><div style="font-size:.72rem;color:var(--faint);text-transform:uppercase;letter-spacing:.08em">Wind</div><b class="num" style="font-size:1.6rem">'+w.wind+' mph</b> <span style="color:var(--muted)">'+w.wdir+'</span></div>'+
        '<div><div style="font-size:.72rem;color:var(--faint);text-transform:uppercase;letter-spacing:.08em">Precip</div><b class="num" style="font-size:1.6rem">'+w.precip+'%</b></div>'+
        '</div>'+impact(w);
    }).catch(function(){
      body.innerHTML = '<p style="color:var(--faint)">Forecast unavailable for this game.</p>';
    });
  });
}).catch(function(){
  $("wxGrid").innerHTML = GIU.failBox("The ESPN schedule feed didn't respond, so there's nothing to attach weather to.");
});
})();
