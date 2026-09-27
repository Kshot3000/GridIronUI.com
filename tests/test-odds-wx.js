/* Unit tests for js/odds-wx.js — the odds-board weather badges.
   Pure module: resolveGames() (venue confirmed against ESPN, open-air only,
   pre-game within the forecast horizon — everything else dropped silently),
   wxUrl() (one multi-location Open-Meteo request) and badgeHtml()
   (escaped output). Uses the REAL wx-shared.js venueFor so the neutral-site
   and dome logic is the same code the weather page runs. */
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
  {abbr:"GB", displayName:"Green Bay Packers", shortDisplayName:"Packers"},
  {abbr:"DET", displayName:"Detroit Lions", shortDisplayName:"Lions"},
  {abbr:"LV", displayName:"Las Vegas Raiders", shortDisplayName:"Raiders"},
  {abbr:"ARI", displayName:"Arizona Cardinals", shortDisplayName:"Cardinals"},
  {abbr:"DAL", displayName:"Dallas Cowboys", shortDisplayName:"Cowboys"}
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
var games = WX.resolveGames(
  [oddsEv("e1","Chicago Bears","Green Bay Packers", iso3d)],
  [espnEv("CHI","GB", iso3d, "Soldier Field")],
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: basic match resolves", games.length === 1);
ok("resolveGames: stadium + coords from dataset",
  games[0] && games[0].stadium === "Soldier Field" && games[0].lat === 41.8623 &&
  games[0].city === "Chicago, IL" && games[0].oddsId === "e1" && games[0].kickISO === iso3d);

var dome = WX.resolveGames(
  [oddsEv("e2","Detroit Lions","Chicago Bears", iso3d)],
  [espnEv("DET","CHI", iso3d, "Ford Field")],
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: dome (Ford Field) skipped", dome.length === 0);

var retr = WX.resolveGames(
  [oddsEv("e3","Arizona Cardinals","Dallas Cowboys", iso3d)],
  [espnEv("ARI","DAL", iso3d, "State Farm Stadium")],
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: retractable roof skipped (weather N/A)", retr.length === 0);

var nomatch = WX.resolveGames(
  [oddsEv("e4","Chicago Bears","Green Bay Packers", iso3d)],
  [espnEv("CHI","DET", iso3d, "Soldier Field")], /* different away team */
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: no ESPN match -> no badge (never guesses)", nomatch.length === 0);

var past = WX.resolveGames(
  [oddsEv("e5","Chicago Bears","Green Bay Packers", kickISO(-36e5))],
  [espnEv("CHI","GB", kickISO(-36e5), "Soldier Field")],
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: past kickoff skipped", past.length === 0);

var far = WX.resolveGames(
  [oddsEv("e6","Chicago Bears","Green Bay Packers", kickISO(17*864e5))],
  [espnEv("CHI","GB", kickISO(17*864e5), "Soldier Field")],
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: kickoff beyond 16-day forecast skipped", far.length === 0);

var neutral = WX.resolveGames(
  [oddsEv("e7","Chicago Bears","Green Bay Packers", iso3d)],
  [espnEv("CHI","GB", iso3d, "Maracanã Stadium")],
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: neutral site uses real venue, not home stadium",
  neutral.length === 1 && neutral[0].stadium === "Maracanã Stadium" &&
  neutral[0].lat === -22.9122);

var unknown = WX.resolveGames(
  [oddsEv("e8","Springfield Atoms","Shelbyville Sharks", iso3d)],
  [espnEv("CHI","GB", iso3d, "Soldier Field")],
  dir, teamFind, WS.venueFor, NOW);
ok("resolveGames: unresolvable team names skipped", unknown.length === 0);

/* wxUrl */
var url = WX.wxUrl([{lat:41.8623, lon:-87.6167},{lat:39.278, lon:-76.6227}]);
ok("wxUrl: multi-location coords in one request",
  url.indexOf("latitude=41.8623,39.278") !== -1 &&
  url.indexOf("longitude=-87.6167,-76.6227") !== -1);
ok("wxUrl: params match the weather page (UTC, mph, 16d)",
  url.indexOf("timezone=UTC") !== -1 && url.indexOf("wind_speed_unit=mph") !== -1 &&
  url.indexOf("forecast_days=16") !== -1 && url.indexOf("wind_gusts_10m") !== -1);
ok("wxUrl: empty games -> null (no pointless fetch)", WX.wxUrl([]) === null);

/* badgeHtml */
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
var badge = WX.badgeHtml('Evil"><script>alert(1)</script>', "Nowhere, ZZ",
  [{cls:"tag red", text:"Gusts 33 mph — strong Under lean"}], esc);
ok("badgeHtml: hostile stadium name escaped",
  badge.indexOf("<script>") === -1 && badge.indexOf("&lt;script") !== -1);
ok("badgeHtml: note text + full-forecast link",
  badge.indexOf("Gusts 33 mph") !== -1 && badge.indexOf("weather.html") !== -1);

/* shared core still behaves (regression pin through the new home) */
ok("wx-shared: impactNotes calm day -> empty (badge stays off)",
  WS.impactNotes([{temp:70, precip:0, wind:5, gust:8}]).length === 0);
ok("wx-shared: impactNotes gust front -> notes",
  WS.impactNotes([{temp:60, precip:5, wind:18, gust:33}]).length >= 1);
ok("wx-shared: venueFor neutral flag",
  WS.venueFor(espnEv("CHI","GB", iso3d, "Wembley Stadium"), "CHI").neutral === true);
ok("wx-shared: venueFor unknown abbr -> null row",
  WS.venueFor(espnEv("ZZZ","YYY", iso3d, "Somewhere"), "ZZZ").row === null);

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL ODDS-WX TESTS PASS");
process.exit(failures ? 1 : 0);
