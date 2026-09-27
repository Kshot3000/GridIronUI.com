/* Tests for the odds board's GameDay identity: Odds API sport keys map to the
   identity directory's leagues, and the directory resolves real Odds-API-style
   full team names to logo+color headers. Run: node tests/test-odds-identity.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond, extra){ if(!cond){ failures++; console.error("FAIL", name, extra||""); } else console.log("ok  ", name); }

var L = require(path.join(ROOT, "js/odds-logic.js"));
ok("sportLeague: NFL key -> nfl", L.sportLeague("americanfootball_nfl") === "nfl");
ok("sportLeague: NBA key -> nba", L.sportLeague("basketball_nba") === "nba");
ok("sportLeague: MLB key -> mlb", L.sportLeague("baseball_mlb") === "mlb");
ok("sportLeague: NHL key -> nhl", L.sportLeague("icehockey_nhl") === "nhl");
ok("sportLeague: EPL key -> epl", L.sportLeague("soccer_epl") === "epl");
ok("sportLeague: NCAAF key -> null (no identity dir)", L.sportLeague("americanfootball_ncaaf") === null);
ok("sportLeague: NCAAB key -> null (no identity dir)", L.sportLeague("basketball_ncaab") === null);
ok("sportLeague: unknown key -> null", L.sportLeague("cricket_ipl") === null);
ok("sportLeague: blank -> null", L.sportLeague("") === null);

var sandbox = {
  window: {},
  GIU: { esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); } }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
var G = sandbox.GIU;

var dir = JSON.parse(fs.readFileSync(path.join(ROOT, "data/teams.json"), "utf8")).leagues;

function check(league, away, home, abbrA, abbrH){
  var vh = G.vsHeader(dir, L.sportLeague(league), away, home);
  ok("vsHeader "+league+": "+away+" vs "+home+" resolves both chips",
     vh.indexOf(abbrA) !== -1 && vh.indexOf(abbrH) !== -1, vh.slice(0,120));
  ok("vsHeader "+league+": carries ESPN logos",
     vh.indexOf("teamlogos") !== -1, vh.slice(0,120));
}
check("americanfootball_nfl", "Kansas City Chiefs", "Philadelphia Eagles", "KC", "PHI");
check("basketball_nba", "Los Angeles Lakers", "Boston Celtics", "LAL", "BOS");
check("baseball_mlb", "New York Yankees", "Boston Red Sox", "NYY", "BOS");
check("icehockey_nhl", "Boston Bruins", "Toronto Maple Leafs", "BOS", "TOR");
check("soccer_epl", "Arsenal", "Manchester City", "ARS", "MNC");

/* college teams are not in the directory -> "" so the odds page keeps its
   plain-text title instead of a half-rendered identity header */
var nc = G.vsHeader(dir, L.sportLeague("americanfootball_ncaaf"), "Alabama Crimson Tide", "Georgia Bulldogs");
ok("vsHeader NCAAF: unknown teams -> empty string (plain-title fallback)", nc === "", nc);
var ncaab = G.vsHeader(dir, L.sportLeague("basketball_ncaab"), "Duke Blue Devils", "North Carolina Tar Heels");
ok("vsHeader NCAAB: unknown teams -> empty string (plain-title fallback)", ncaab === "", ncaab);

if(failures){ console.error(failures + " failure(s)"); process.exit(1); }
console.log("all odds-identity tests passed");
