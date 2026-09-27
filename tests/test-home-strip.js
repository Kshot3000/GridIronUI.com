/* Unit tests for js/home-strip.js — the homepage "Today's games" strip.
   Verifies: finished games are dropped, malformed events are skipped (never
   guessed), live games rank before scheduled ones, ties break by kickoff
   time, unparseable dates sink, league labels survive, and top() caps. */
"use strict";
var HS = require("../js/home-strip.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function ev(o){
  o = o || {};
  return {
    id: o.id || "1",
    date: o.date === undefined ? "2026-09-27T17:00:00Z" : o.date,
    competitions: o.comp === undefined ? [{
      status: {type: {state: o.state || "pre", shortDetail: o.sd || "Sun 1:00 PM"}},
      venue: {fullName: "Stadium"},
      competitors: o.comps === undefined ? [
        {homeAway: "away", team: {abbreviation: "KC", displayName: "Chiefs"}, score: "14"},
        {homeAway: "home", team: {abbreviation: "BUF", displayName: "Bills"}, score: "10"}
      ] : o.comps
    }] : o.comp
  };
}
var P = function(evs){ return {events: evs}; };

/* --- collect: filtering --- */
var rows = HS.collect("NFL", P([ev({state:"post"}), ev({state:"pre"}), ev({state:"in"})]));
assert(rows.length === 2, "collect drops finished (post) games, keeps pre + in");
assert(rows.every(function(r){ return r.state !== "post"; }), "no post rows survive");

rows = HS.collect("MLB", P([ev({comp: []}), ev({comps: [
  {homeAway: "away", team: {abbreviation: "NYY", displayName: "Yankees"}, score: "3"}
]}), ev()]));
assert(rows.length === 1, "collect skips events with no competition or no home team");

rows = HS.collect("NBA", P([ev()]));
assert(rows[0].league === "NBA", "collect tags rows with the league label");
assert(rows[0].away.team.abbreviation === "KC" && rows[0].home.team.abbreviation === "BUF",
       "collect keeps the original competitor objects (away/home)");

rows = HS.collect("NHL", null);
assert(Array.isArray(rows) && rows.length === 0, "collect tolerates a null payload");
rows = HS.collect("NHL", P([]));
assert(rows.length === 0, "collect tolerates zero events");

/* --- rankRows: live first, then kickoff --- */
var live = ev({id:"L", state:"in", date:"2026-09-27T20:00:00Z"});
var early = ev({id:"E", state:"pre", date:"2026-09-27T17:00:00Z"});
var late = ev({id:"L2", state:"pre", date:"2026-09-27T23:00:00Z"});
var nodate = ev({id:"N", state:"pre", date:"garbage"});
var r = HS.top(HS.collect("NFL", P([late, nodate, early, live])), 10).map(function(x){ return x.id; });
assert(r.join(",") === "L,E,L2,N", "top(): live first, then by kickoff, unparseable dates last — got "+r.join(","));

/* stable under input order shuffles */
var r2 = HS.top(HS.collect("NFL", P([nodate, live, late, early])), 10).map(function(x){ return x.id; });
assert(r2.join(",") === r.join(","), "ranking is input-order independent");

/* --- top: cap --- */
var many = [];
for(var i = 0; i < 12; i++) many.push(ev({id: "g"+i, state: "pre", date: "2026-09-27T17:0"+(i%10)+":00Z"}));
assert(HS.top(HS.collect("NFL", P(many)), 6).length === 6, "top() caps at n rows");
assert(HS.top(HS.collect("NFL", P(many))).length === 6, "top() defaults to 6 rows");

/* --- scoreUrl / LEAGUES --- */
assert(HS.LEAGUES.length === 4, "four leagues covered");
assert(HS.scoreUrl("football/nfl") === "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
       "scoreUrl builds the ESPN scoreboard URL");

console.log(failures ? "\n"+failures+" FAILURES" : "\nALL HOME-STRIP TESTS PASSED");
process.exit(failures ? 1 : 0);
