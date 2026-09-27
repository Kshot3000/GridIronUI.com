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

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL WEATHER TESTS PASS");
process.exit(failures ? 1 : 0);
