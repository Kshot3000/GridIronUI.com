/* Unit tests for the live-strip freshness check (v1.137.0 — "Happening now"
   silently re-pulls while games are live or a kickoff slipped past).
   HS.needsRefresh(rows, now): true when any row is live ("in"), or when a
   "pre" row's kickoff has passed but the feed still lists it pre — the exact
   staleness a tab left open through kickoff shows. Everything else (all
   future pre-games, empty, malformed) stays quiet: no pointless re-pulls.
   Also re-pins the index.html home-strip.js cache key at v2.0.3.
   Run: node tests/test-home-strip-live.js */
"use strict";
var fs = require("fs"), path = require("path");
var HS = require("../js/home-strip.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
var NOW = 1788228000000; /* fixed "now" for the fixtures */
function pre(date){ return {state: "pre", date: date}; }
function iso(ms){ return new Date(ms).toISOString(); }

ok("live row -> refresh", HS.needsRefresh([{state: "in", date: iso(NOW - 3600000)}], NOW) === true);
ok("pre row with past kickoff -> refresh",
  HS.needsRefresh([pre(iso(NOW - 60000))], NOW) === true);
ok("pre row with kickoff exactly at now -> refresh",
  HS.needsRefresh([pre(iso(NOW))], NOW) === true);
ok("all-future pre rows -> quiet",
  HS.needsRefresh([pre(iso(NOW + 3600000)), pre(iso(NOW + 7200000))], NOW) === false);
ok("empty rows -> quiet", HS.needsRefresh([], NOW) === false);
ok("null/undefined rows -> quiet",
  HS.needsRefresh(null, NOW) === false && HS.needsRefresh(undefined, NOW) === false);
ok("pre row with garbage date -> quiet (no guessing)",
  HS.needsRefresh([pre("kickoff soon-ish")], NOW) === false);
ok("pre row with missing date -> quiet",
  HS.needsRefresh([{state: "pre"}], NOW) === false);
ok("post rows never trigger, even with past dates",
  HS.needsRefresh([{state: "post", date: iso(NOW - 86400000)}], NOW) === false);
ok("mixed: one live among future pre-games -> refresh",
  HS.needsRefresh([{state: "in"}, pre(iso(NOW + 3600000))], NOW) === true);
ok("mixed: one stale pre among future pre-games -> refresh",
  HS.needsRefresh([pre(iso(NOW - 120000)), pre(iso(NOW + 3600000))], NOW) === true);
ok("null rows in the array are skipped, not crashed on",
  HS.needsRefresh([null, undefined, pre(iso(NOW + 3600000))], NOW) === false);
ok("rows are not mutated by the check", (function(){
  var r = [{state: "pre", date: iso(NOW + 3600000)}];
  var before = JSON.stringify(r);
  HS.needsRefresh(r, NOW);
  return JSON.stringify(r) === before;
})());

/* shipped wiring: index.html pins the v2.0.3 key so returning visitors
   get the new refresh logic, not a cached copy of the old strip script. */
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
ok("index.html pins home-strip.js?v=2.0.8",
  html.indexOf("js/home-strip.js?v=2.0.8") !== -1);

/* the 60s master tick calls loadStrip(true) through needsRefresh — pin the
   wiring so a future edit can't silently drop the refresh. */
ok("index.html tick gates the silent re-pull on needsRefresh",
  html.indexOf("HS.needsRefresh(curRows, Date.now())") !== -1);
ok("index.html restores cached weather chips on silent re-renders",
  html.indexOf("chipCache[slot]") !== -1);
ok("index.html silent failures never nuke the strip",
  html.indexOf("if(!silent) $(\"homeGames\").innerHTML") !== -1);

if(fails){ console.error(fails + " FAILURES"); process.exit(1); }
console.log("all home-strip-live tests green");
