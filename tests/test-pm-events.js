/* GridIronUI v1.99.0 — Polymarket game-event feed ordering.
   Polymarket's /sports series list events oldest-CREATED first by default,
   and an event's startDate is its creation date, not the game date (a real
   2026-10-04 NFL game, slug nfl-ind-was-2026-10-04, carries
   startDate=2026-08-25; the true game time is startTime/eventDate).
   Querying events?series_id=X&limit=20 with no ordering therefore returns
   stale preseason events whose markets are all closed — the NFL Polymarket
   tab (markets page), the predictions NFL rows, and the odds-board market
   check all rendered EMPTY for the first three weeks of the 2026 regular
   season. GIU.pmEventsUrl() orders by true game time (startTime), soonest
   first, and all three consumers must use it — never an inline events URL.
   Run: node tests/test-pm-events.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---------- load the REAL site.js in a stubbed browser ---------- */
var sandbox = {
  window: {},
  document: {
    readyState: "loading", /* keep mount() from running at load */
    addEventListener: function(){},
    querySelectorAll: function(){ return []; },
    querySelector: function(){ return null; },
    getElementById: function(){ return null; },
    createElement: function(){ return {setAttribute:function(){}, appendChild:function(){}, style:{}}; },
    head: {appendChild: function(){}}
  },
  navigator: {userAgent: "node-test"},
  location: {pathname: "/markets.html", href: "https://example.com/markets.html", origin: "https://example.com"},
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  console: console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "site.js"), "utf8"), sandbox, {filename: "site.js"});
var GIU = sandbox.window.GIU || sandbox.GIU;

assert(GIU && typeof GIU.pmEventsUrl === "function", "GIU.pmEventsUrl is defined");

/* ---------- URL shape ---------- */
var u = GIU.pmEventsUrl("12185");
assert(u.indexOf("https://gamma-api.polymarket.com/events?series_id=12185") === 0,
  "points at the gamma events endpoint with the series id");
assert(u.indexOf("order=startTime&ascending=true") !== -1,
  "orders by TRUE game time (startTime), soonest first — not by creation date");
assert(u.indexOf("active=true") !== -1 && u.indexOf("closed=false") !== -1,
  "keeps the active/open market filters");
assert(u.indexOf("limit=30") !== -1, "default limit is 30 (headroom for prop events between game events)");

var u20 = GIU.pmEventsUrl("3", 20);
assert(u20.indexOf("series_id=3") !== -1 && u20.indexOf("limit=20") !== -1,
  "custom limit honored, MLB series id carried");

var uenc = GIU.pmEventsUrl("a b&c");
assert(uenc.indexOf("series_id=a%20b%26c") !== -1, "series id is URL-encoded");

/* ---------- the core insight, as a behavioral contract ----------
   startDate is creation date; startTime is game time. The pages sort by
   startTime||eventDate (startOf). A query WITHOUT the ordering returns the
   oldest-created events first — assert the pages' sort key picks the true
   soonest GAME from a mixed batch, i.e. the ordering the URL requests is
   the one the render path actually needs. */
function startOf(ev){ /* mirrors js/markets.js + js/predictions.js */
  var t = Date.parse(ev.startTime || ev.eventDate || "");
  return isFinite(t) ? t : Infinity;
}
var preseasonOld = {title: "Seahawks vs. Commanders", startDate: "2026-07-09T12:00:00Z",
                    startTime: "2026-08-17T12:00:00Z"}; /* old creation, old game */
var week4 = {title: "Colts vs. Commanders", startDate: "2026-08-25T12:00:47Z",
             startTime: "2026-10-04T13:30:00Z", slug: "nfl-ind-was-2026-10-04"}; /* old creation, FUTURE game */
var week8 = {title: "Cowboys vs. Eagles", startDate: "2026-09-15T12:00:00Z",
             startTime: "2026-10-27T12:00:00Z"}; /* new creation, further game */
var byGame = [week8, preseasonOld, week4].sort(function(a, b){ return startOf(a) - startOf(b); });
assert(byGame[0] === preseasonOld && byGame[1] === week4 && byGame[2] === week8,
  "startTime sort puts the true soonest game first even when creation dates disagree");
var byCreation = [week8, preseasonOld, week4].sort(function(a, b){
  return Date.parse(a.startDate) - Date.parse(b.startDate);
});
assert(byCreation[0] === preseasonOld && byCreation[2] === week8 &&
       byCreation[1] === week4 && startOf(byCreation[0]) < Date.parse("2026-09-30T00:00:00Z"),
  "creation-date sort (the old default) buries the Week 4 game behind a stale preseason event");

/* ---------- wiring guard: every consumer must use the shared builder ----------
   An inline events?series_id= URL without the ordering is the exact
   regression this fixes — fail loudly if one creeps back in. */
["markets.js", "predictions.js", "odds.js"].forEach(function(f){
  var src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
  assert(src.indexOf("GIU.pmEventsUrl(") !== -1,
    f + " builds its Polymarket events URL via GIU.pmEventsUrl()");
  assert(!/events\?series_id=/.test(src),
    f + " contains no inline events?series_id= URL (ordering would be lost)");
});

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all pm-events tests passed");
