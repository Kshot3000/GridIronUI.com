/* Unit tests for js/weather.js — GameDay matchup header builder + forecast
   impact tags. Loads team-brand.js first so GIU.teamLogo/teamChip exist, with
   GIU.fetchJSON stubbed so the live ESPN fetch never fires in tests. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond){ if(!cond){ failures++; console.error("FAIL", name); } else console.log("ok  ", name); }

var sandbox = {
  window: {},
  GIU: {
    esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    fetchJSON: function(){ var p = { then: function(){ return p; }, catch: function(){ return p; } }; return p; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8"), sandbox);
var G = sandbox.GIU;

ok("wxMatchupHTML exported", typeof G.wxMatchupHTML === "function");
ok("wxImpact exported", typeof G.wxImpact === "function");

var away = {team:{abbreviation:"GB", displayName:"Green Bay Packers", color:"203731",
  logo:"https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/gb.png"}};
var home = {team:{abbreviation:"CHI", displayName:"Chicago Bears", color:"0b162a",
  logo:"https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/chi.png"}};
var h = G.wxMatchupHTML(away, home);
ok("matchup: wrapper + both logos", h.indexOf('class="wx-matchup"') !== -1 &&
  h.indexOf("gb.png") !== -1 && h.indexOf("chi.png") !== -1);
ok("matchup: both full names", h.indexOf("Green Bay Packers") !== -1 && h.indexOf("Chicago Bears") !== -1);
ok("matchup: real team colors inlined", h.indexOf("#203731") !== -1 && h.indexOf("#0b162a") !== -1);
ok("matchup: 'at' separator present", h.indexOf('class="at"') !== -1);
ok("matchup: away listed before home", h.indexOf("Green Bay Packers") < h.indexOf("Chicago Bears"));

var hostile = G.wxMatchupHTML({team:{displayName:'<img src=x onerror=1>', abbreviation:"XX"}}, {team:{}});
ok("matchup: hostile name escaped", hostile.indexOf("<img src=x") === -1 && hostile.indexOf("&lt;img") !== -1);

var missing = G.wxMatchupHTML({}, {});
ok("matchup: missing teams degrade gracefully (no undefined, neutral chips)",
  missing.indexOf("undefined") === -1 && missing.indexOf('class="abbr"') !== -1);

var imp = G.wxImpact({wind:22, precip:10, temp:60});
ok("impact: wind 22 -> strong Under lean", imp.indexOf("strong Under lean") !== -1);
var imp2 = G.wxImpact({wind:14, precip:70, temp:30});
ok("impact: wind 14 + rain 70 -> mild lean + run-game note",
  imp2.indexOf("mild Under lean") !== -1 && imp2.indexOf("favors run game") !== -1);
var imp3 = G.wxImpact({wind:8, precip:40, temp:24});
ok("impact: freezing temp flagged", imp3.indexOf("Freezing") !== -1);
var imp4 = G.wxImpact({wind:5, precip:5, temp:72});
ok("impact: calm day -> no major concerns", imp4.indexOf("No major concerns") !== -1);

/* Game-window mode: impact over the whole 4-hour window, gusts included. */
ok("wxWindowHTML exported", typeof G.wxWindowHTML === "function");
var win = [
  {temp:61, precip:5,  wind:12, gust:20, wdir:"NW", when:"2026-10-04T17:00"},
  {temp:58, precip:10, wind:15, gust:24, wdir:"NW", when:"2026-10-04T18:00"},
  {temp:55, precip:20, wind:18, gust:33, wdir:"N",  when:"2026-10-04T19:00"},
  {temp:53, precip:25, wind:16, gust:28, wdir:"N",  when:"2026-10-04T20:00"}
];
var wh = G.wxWindowHTML(win);
ok("window: 4 hour columns", (wh.match(/Kickoff|\+1h|\+2h|\+3h/g)||[]).length === 4);
ok("window: temps + wind + gusts + precip per column",
  wh.indexOf("61°F") !== -1 && wh.indexOf("gusts 33") !== -1 && wh.indexOf("25%") !== -1);
var wimp = G.wxImpact(win);
ok("window impact: gust front in 3rd hour flags strong Under + kicking note",
  wimp.indexOf("Gusts 33 mph") !== -1 && wimp.indexOf("kicking nightmare") !== -1);
var wimp2 = G.wxImpact([
  {temp:60, precip:5, wind:10, gust:22, wdir:"S"},
  {temp:59, precip:5, wind:11, gust:25, wdir:"S"}
]);
ok("window impact: gust 25 -> field-goal risk (window max, not kickoff)",
  wimp2.indexOf("field-goal risk") !== -1 && wimp2.indexOf("kicking nightmare") === -1);
var wimp3 = G.wxImpact([
  {temp:40, precip:5, wind:8, gust:12, wdir:"E"},
  {temp:24, precip:5, wind:9, gust:14, wdir:"E"}
]);
ok("window impact: freezing later in the game still flagged", wimp3.indexOf("Freezing 24°F") !== -1);
var wimp4 = G.wxImpact([{temp:70, precip:0, wind:5, gust:8, wdir:"E"}]);
ok("window impact: calm window -> no major concerns", wimp4.indexOf("No major concerns") !== -1);
ok("window impact: legacy single-snapshot calls still work (no array, no gust)",
  G.wxImpact({wind:22, precip:10, temp:60}).indexOf("strong Under lean") !== -1);

/* sliceWindow: hour containing kickoff + next three, with clamping. */
function fakeWx(hours){
  function arr(f){ var a=[]; for(var i=0;i<hours.length;i++) a.push(f(i)); return a; }
  return {hourly:{
    time: arr(function(i){ return hours[i]; }),
    temperature_2m: arr(function(i){ return 60+i; }),
    precipitation_probability: arr(function(i){ return i*10; }),
    wind_speed_10m: arr(function(i){ return 10+i; }),
    wind_gusts_10m: arr(function(i){ return 15+i; }),
    wind_direction_10m: arr(function(){ return 320; })
  }};
}
var d8 = fakeWx(["2026-10-04T12:00","2026-10-04T13:00","2026-10-04T14:00",
                "2026-10-04T15:00","2026-10-04T16:00","2026-10-04T17:00",
                "2026-10-04T18:00","2026-10-04T19:00"]);
var sw = G.wxSliceWindow(d8, "2026-10-04T14:25:00Z");
ok("sliceWindow: starts at hour containing kickoff, 4 points",
  sw.length === 4 && sw[0].when === "2026-10-04T14:00" && sw[3].when === "2026-10-04T17:00");
ok("sliceWindow: per-hour values round + gusts included",
  sw[0].temp === 62 && sw[0].wind === 12 && sw[0].gust === 17 && sw[0].wdir === "NW" && sw[0].precip === 20);
var swEnd = G.wxSliceWindow(d8, "2026-10-04T19:00:00Z");
ok("sliceWindow: kickoff at last hour -> clamps to 1 point",
  swEnd.length === 1 && swEnd[0].when === "2026-10-04T19:00");
var swPast = G.wxSliceWindow(d8, "2026-10-20T19:00:00Z");
ok("sliceWindow: kickoff beyond forecast -> clamps to last hour",
  swPast.length === 1 && swPast[0].when === "2026-10-04T19:00");

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL WEATHER TESTS PASS");
process.exit(failures ? 1 : 0);
