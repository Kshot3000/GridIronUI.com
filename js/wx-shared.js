/* GridIronUI shared game-weather core — pure, no DOM.
   The NFL stadium dataset, neutral-site venues, venue resolution, the
   Open-Meteo game-window slicer and the wind/precip/temp impact model.
   Extracted from js/weather.js so the odds board (and any other page) can
   reuse the exact same venue truth and impact thresholds — one dataset, no
   drift. weather.js keeps the page-specific forecast/render code on top.
   Node-exportable (tests) and browser-exposed on window.GIU. */
(function(){
"use strict";
var W = {};

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
  ["WAS","Northwest Stadium","Landover, MD",38.9077,-76.8645,"open"],
  ["WSH","Northwest Stadium","Landover, MD",38.9077,-76.8645,"open"] /* ESPN uses WSH */
];
function stadiumFor(abbr){
  for(var i=0;i<STADIUMS.length;i++) if(STADIUMS[i][0]===abbr) return STADIUMS[i];
  return null;
}
/* Neutral-site / international venues: [name match, stadium, city, lat, lon, roof].
   ESPN's scoreboard carries the real venue per game — when it names one of these
   instead of the home team's stadium, we use the neutral venue's coordinates so
   the forecast matches where the game is actually played. */
var NEUTRAL_VENUES = [
  ["maracan", "Maracanã Stadium","Rio de Janeiro, Brazil",-22.9122,-43.2302,"open"],
  ["wembley","Wembley Stadium","London, UK",51.5558,-0.2796,"open"],
  ["tottenham","Tottenham Hotspur Stadium","London, UK",51.6043,-0.0664,"open"],
  ["twickenham","Twickenham Stadium","London, UK",51.4552,-0.3416,"open"],
  ["allianz arena","Allianz Arena","Munich, Germany",48.2188,11.6247,"open"],
  ["deutsche bank","Deutsche Bank Park","Frankfurt, Germany",50.0685,8.6452,"open"],
  ["bernabeu","Santiago Bernabéu Stadium","Madrid, Spain",40.4531,-3.6883,"open"],
  ["azteca","Estadio Azteca","Mexico City, Mexico",19.3029,-99.1505,"open"],
  ["croke","Croke Park","Dublin, Ireland",53.3607,-6.2507,"open"]
];
function neutralFor(venueName){
  var n = String(venueName||"").toLowerCase();
  for(var i=0;i<NEUTRAL_VENUES.length;i++) if(n.indexOf(NEUTRAL_VENUES[i][0])!==-1) return NEUTRAL_VENUES[i];
  return null;
}
/* Resolve the true venue for a game: prefer ESPN's per-game venue when it names
   a known neutral site, otherwise the home team's stadium. Returns
   {row, neutral} where row is the [abbr, stadium, city, lat, lon, roof] tuple
   (row[0] is the home abbr for neutral-site rows) or null when unknown. */
function venueFor(ev, homeAbbr){
  var espnV = ((ev||{}).competitions||[])[0] ? (ev.competitions[0].venue||{}) : {};
  var nv = neutralFor(espnV.fullName);
  if(nv) return {row:[homeAbbr, nv[1], nv[2], nv[3], nv[4], nv[5]], neutral:true};
  var st = stadiumFor(homeAbbr);
  return {row:st, neutral:false};
}
function compass(deg){
  var dirs=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg/22.5)%16];
}
/* Pure: slice the game window out of parsed Open-Meteo hourly data — the hour
   nearest kickoff plus the next three (a ~4h game).
   timezone=UTC is required on the Open-Meteo request: hourly stamps have no
   offset but parse as UTC, so the epoch comparison below matches ESPN's ISO
   kickoff regardless of the visitor's timezone. (timezone=auto returns
   stadium-local stamps, which Date.parse would misread.) */
function sliceWindow(d, kickoffISO){
  var times = d.hourly.time, target = Date.parse(kickoffISO), bi = 0, bd = Infinity;
  times.forEach(function(t,i){
    var diff = Math.abs(Date.parse(t)-target);
    if(diff<bd){ bd=diff; bi=i; }
  });
  var hrs = [];
  for(var k=0;k<4 && bi+k<times.length;k++){
    var j = bi+k;
    hrs.push({
      temp: Math.round(d.hourly.temperature_2m[j]),
      precip: d.hourly.precipitation_probability[j],
      wind: Math.round(d.hourly.wind_speed_10m[j]),
      gust: Math.round(d.hourly.wind_gusts_10m[j]),
      wdir: compass(d.hourly.wind_direction_10m[j]),
      when: times[j]
    });
  }
  return hrs;
}
/* Pure: the impact model as data. Accepts a single kickoff snapshot
   {temp,precip,wind} (legacy callers) or an array of hourly points —
   thresholds are computed over the whole game window, because a gust front
   in the 4th quarter matters as much as kickoff conditions. Returns
   [{cls, text}] — empty when there's nothing worth flagging, so callers
   can stay quiet instead of showing a meaningless "all clear" badge. */
function impactNotes(w){
  var hrs = Array.isArray(w) ? w : [w];
  var wind = 0, gust = 0, precip = 0, temp = Infinity;
  hrs.forEach(function(h){
    if(h.wind > wind) wind = h.wind;
    if(h.gust > gust) gust = h.gust;
    if(h.precip > precip) precip = h.precip;
    if(h.temp < temp) temp = h.temp;
  });
  var notes = [];
  if(gust >= 30) notes.push({cls:"tag red", text:"Gusts "+gust+" mph — strong Under lean, kicking nightmare"});
  else if(gust >= 24) notes.push({cls:"tag", text:"Gusts "+gust+" mph — field-goal risk"});
  if(wind >= 20) notes.push({cls:"tag red", text:"Wind "+wind+" mph sustained — strong Under lean"});
  else if(wind >= 13) notes.push({cls:"tag", text:"Wind "+wind+" mph — mild Under lean"});
  if(precip >= 60) notes.push({cls:"tag", text:"Rain "+precip+"% — favors run game"});
  if(temp <= 25) notes.push({cls:"tag blue", text:"Freezing "+temp+"°F"});
  else if(temp >= 90) notes.push({cls:"tag", text:"Heat "+temp+"°F"});
  return notes;
}
/* The weather page's impact HTML — same thresholds, rendered as tag chips. */
function impact(w){
  var notes = impactNotes(w);
  if(!notes.length) return '<span class="tag green">No major concerns</span>';
  return notes.map(function(n){
    return '<span class="'+n.cls+'">'+n.text+'</span>';
  }).join(" ");
}

/* Fetch the NFL scoreboard's upcoming games, surviving ESPN's week rollover.
   ESPN's default scoreboard returns the "current" week, which lags reality
   between the week's last game (late Monday) and the Tuesday rollover —
   during that window every game is post and a naive `pre` filter yields a
   dead page. When the default board has no pre games, we ask for the next
   week explicitly (week.number+1, same season type) using the payload's own
   week/season fields. fetchJSON is injected so this stays pure and testable.
   Resolves {events, week, isFallback}. Rejects only when the primary fetch
   fails — callers show their feed-failure state for that. A failed or empty
   fallback resolves to an empty event list: the page's honest "no upcoming
   games" state, not an error. */
function upcomingNfl(fetchJSON){
  var BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
  function preOf(d){
    return ((d||{}).events||[]).filter(function(ev){
      var c = ((ev||{}).competitions||[])[0]||{};
      var st = (c.status && c.status.type && c.status.type.state) || "";
      return st !== "post";
    });
  }
  return fetchJSON(BASE).then(function(d){
    var pre = preOf(d);
    var wk = Number(((d||{}).week||{}).number), st = Number(((d||{}).season||{}).type);
    if(pre.length || !isFinite(wk) || !isFinite(st) || wk < 1 || wk > 22){
      return {events: pre, week: isFinite(wk) ? wk : null, isFallback: false};
    }
    var nextWk = wk + 1;
    return fetchJSON(BASE+"?week="+nextWk+"&seasontype="+st).then(function(d2){
      var pre2 = preOf(d2);
      var wk2 = Number(((d2||{}).week||{}).number);
      return {events: pre2, week: isFinite(wk2) ? wk2 : nextWk, isFallback: true};
    }).catch(function(){
      return {events: [], week: nextWk, isFallback: true};
    });
  });
}
/* Honest label for the rollover fallback: names the week we're showing so a
   visitor never mistakes next week's slate for this week's. `esc` is injected
   (window.GIU.esc in the browser) to keep this pure. */
function fallbackNoticeHTML(week, esc){
  esc = esc || function(s){ return String(s == null ? "" : s); };
  return '<div class="notice" style="margin:0 0 14px"><strong>Next week\'s slate — Week '+
    esc(week)+'.</strong> The league board hasn\'t flipped over from last week yet, '+
    'so these are the upcoming games with their forecasts. Kickoff dates are on each card.</div>';
}

W.stadiums = STADIUMS;
W.stadiumFor = stadiumFor;
W.neutralFor = neutralFor;
W.venueFor = venueFor;
W.compass = compass;
W.sliceWindow = sliceWindow;
W.impactNotes = impactNotes;
W.impact = impact;
W.upcomingNfl = upcomingNfl;
W.fallbackNoticeHTML = fallbackNoticeHTML;

if(typeof module !== "undefined" && module.exports){ module.exports = W; }
else if(typeof window !== "undefined"){
  window.GIU = window.GIU || {};
  window.GIU.wxStadiums = STADIUMS;
  window.GIU.wxStadiumFor = stadiumFor;
  window.GIU.wxNeutralFor = neutralFor;
  window.GIU.wxVenueFor = venueFor;
  window.GIU.wxSliceWindow = sliceWindow;
  window.GIU.wxImpactNotes = impactNotes;
  window.GIU.wxImpact = impact;
  window.GIU.wxUpcomingNfl = upcomingNfl;
  window.GIU.wxFallbackNoticeHTML = fallbackNoticeHTML;
}
})();
