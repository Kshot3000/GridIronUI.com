/* Unit tests for the MLB leg of js/odds-wx.js — the odds-board weather badges.
   resolveGames() with league="mlb" uses the injected MLB team dir + the real
   wx-shared.js ballparkVenueFor (raw-tuple shape, not the NFL {row} shape):
   ESPN venue cross-check, retractable/dome skip, relocated-game venue wins
   over the home team's park, pre-game + 16-day horizon only. Also pins that
   the default (no league arg) path is still NFL-identical, and that the NFL
   {row} shape still normalizes. */
"use strict";
var path = require("path");
var ROOT = path.join(__dirname, "..");
var WX = require(path.join(ROOT, "js/odds-wx.js"));
var WS = require(path.join(ROOT, "js/wx-shared.js"));

var failures = 0;
function ok(name, cond){
  if(!cond){ failures++; console.error("FAIL", name); }
  else console.log("ok  ", name);
}

var dir = { nfl: [
  {abbr:"CHI", displayName:"Chicago Bears", shortDisplayName:"Bears"},
  {abbr:"GB", displayName:"Green Bay Packers", shortDisplayName:"Packers"}
], mlb: [
  {abbr:"NYY", displayName:"New York Yankees", shortDisplayName:"Yankees"},
  {abbr:"BOS", displayName:"Boston Red Sox", shortDisplayName:"Red Sox"},
  {abbr:"HOU", displayName:"Houston Astros", shortDisplayName:"Astros"},
  {abbr:"CHW", displayName:"Chicago White Sox", shortDisplayName:"White Sox"},
  {abbr:"TB", displayName:"Tampa Bay Rays", shortDisplayName:"Rays"},
  {abbr:"SD", displayName:"San Diego Padres", shortDisplayName:"Padres"}
]};
function teamFind(d, league, q){
  var list = (d[league]||[]), ql = String(q).toLowerCase();
  for(var i=0;i<list.length;i++)
    if(list[i].abbr === String(q).toUpperCase() ||
       list[i].displayName.toLowerCase() === ql) return list[i];
  return null;
}
var NOW = Date.now();
function kickISO(offsetMs){ return new Date(NOW + offsetMs).toISOString(); }
function oddsEv(id, home, away, iso){
  return {id:id, home_team:home, away_team:away, commence_time:iso};
}
function espnEv(homeAbbr, awayAbbr, iso, venueName){
  return { id:"espn-"+homeAbbr+awayAbbr, date:iso,
    competitions:[{ venue:{fullName:venueName||""},
      competitors:[
        {homeAway:"home", team:{abbreviation:homeAbbr}},
        {homeAway:"away", team:{abbreviation:awayAbbr}}
      ]}]};
}

var iso3d = kickISO(3*864e5);

/* 1. Wild Card Game 1 at an open-air park resolves through the ballpark dataset. */
var g1 = WX.resolveGames(
  [oddsEv("m1","New York Yankees","Boston Red Sox", iso3d)],
  [espnEv("NYY","BOS", iso3d, "Yankee Stadium")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: Yankee Stadium game resolves",
  g1.length === 1 && g1[0].stadium === "Yankee Stadium" &&
  g1[0].city === "Bronx, NY" && g1[0].lat === 40.8296 &&
  g1[0].lon === -73.9264 && g1[0].oddsId === "m1" && g1[0].league === "mlb");

/* 2. Retractable roof: weather can't touch the game — no badge. */
var g2 = WX.resolveGames(
  [oddsEv("m2","Houston Astros","Chicago White Sox", iso3d)],
  [espnEv("HOU","CHW", iso3d, "Daikin Park")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: retractable roof (Daikin Park) skipped", g2.length === 0);

/* 3. Dome: no badge. */
var g3 = WX.resolveGames(
  [oddsEv("m3","Tampa Bay Rays","New York Yankees", iso3d)],
  [espnEv("TB","NYY", iso3d, "Tropicana Field")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: dome (Tropicana Field) skipped", g3.length === 0);

/* 4. Relocated game: ESPN names a different park — the real park wins,
   never the listed home team's forecast. */
var g4 = WX.resolveGames(
  [oddsEv("m4","New York Yankees","Boston Red Sox", iso3d)],
  [espnEv("NYY","BOS", iso3d, "Petco Park")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: relocated game uses ESPN's venue, not the home team's park",
  g4.length === 1 && g4[0].stadium === "Petco Park" && g4[0].city === "San Diego, CA");

/* 5. Unrecognized ESPN venue falls back to the home team's park. */
var g5 = WX.resolveGames(
  [oddsEv("m5","New York Yankees","Boston Red Sox", iso3d)],
  [espnEv("NYY","BOS", iso3d, "")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: blank ESPN venue falls back to home park",
  g5.length === 1 && g5[0].stadium === "Yankee Stadium");

/* 6. No ESPN match -> nothing. */
var g6 = WX.resolveGames(
  [oddsEv("m6","New York Yankees","Boston Red Sox", iso3d)],
  [espnEv("NYY","SD", iso3d, "Yankee Stadium")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: no ESPN match -> no badge", g6.length === 0);

/* 7. Post-first-pitch -> nothing. */
var g7 = WX.resolveGames(
  [oddsEv("m7","New York Yankees","Boston Red Sox", kickISO(-36e5))],
  [espnEv("NYY","BOS", kickISO(-36e5), "Yankee Stadium")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: past first pitch skipped", g7.length === 0);

/* 8. Beyond the 16-day Open-Meteo horizon -> nothing. */
var g8 = WX.resolveGames(
  [oddsEv("m8","New York Yankees","Boston Red Sox", kickISO(17*864e5))],
  [espnEv("NYY","BOS", kickISO(17*864e5), "Yankee Stadium")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: beyond 16-day horizon skipped", g8.length === 0);

/* 9. Default league is still NFL — identical behavior, {row} shape. */
var g9 = WX.resolveGames(
  [oddsEv("e1","Chicago Bears","Green Bay Packers", iso3d)],
  [espnEv("CHI","GB", iso3d, "Soldier Field")],
  dir, teamFind, WS.venueFor, NOW);
ok("default (no league arg): NFL path unchanged",
  g9.length === 1 && g9[0].stadium === "Soldier Field" && g9[0].league === "nfl");

/* 10. Explicit nfl league works the same. */
var g10 = WX.resolveGames(
  [oddsEv("e2","Chicago Bears","Green Bay Packers", iso3d)],
  [espnEv("CHI","GB", iso3d, "Soldier Field")],
  dir, teamFind, WS.venueFor, NOW, "nfl");
ok("explicit nfl league matches default", g10.length === 1 && g10[0].league === "nfl");

/* 11. ESPN game on a different UTC day never lends its prices to the card
   (Wild Card series list the same pair twice — Game 1 must not borrow
   Game 2's forecast). */
var g11 = WX.resolveGames(
  [oddsEv("m9","New York Yankees","Boston Red Sox", iso3d)],
  [espnEv("NYY","BOS", kickISO(4*864e5), "Yankee Stadium")],
  dir, teamFind, WS.ballparkVenueFor, NOW, "mlb");
ok("mlb: different UTC day -> no match", g11.length === 0);

/* 12. wxUrl is unchanged: one multi-location Open-Meteo call. */
var url = WX.wxUrl(g1.concat(g9));
ok("wxUrl: multi-location forecast URL for mixed games",
  typeof url === "string" && url.indexOf("latitude=40.8296,41.8623") !== -1 &&
  url.indexOf("wind_gusts_10m") !== -1);
ok("wxUrl: empty game list -> null", WX.wxUrl([]) === null);

/* 13. badgeHtml escapes hostile note text (baseball copy included). */
var html = WX.badgeHtml("Yankee Stadium", "Bronx, NY",
  [{cls:"tag", text:"Wind 24 mph <script>alert(1)</script>"}], function(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; });
  });
ok("badgeHtml: hostile note text escaped",
  html.indexOf("<script>") === -1 && html.indexOf("&lt;script&gt;") !== -1 &&
  html.indexOf("Yankee Stadium") !== -1 && html.indexOf("weather.html") !== -1);

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL PASS");
process.exit(failures ? 1 : 0);
