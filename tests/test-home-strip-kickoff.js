/* Unit tests for the home-strip watch info (v1.124.0 — "Today's games" rows
   carry the ESPN broadcast network and the nearest upcoming kickoff gets a
   live countdown).
   Verifies: collect() captures broadcast names (single, joined multiples,
   missing -> ""), kickoffIn formatting + boundaries (hours, days, minutes,
   past/unparseable -> null), nearestPre selection (earliest future pre only,
   skips live/post/dateless, null when none), and the shipped index.html
   wiring pins (cache key, data-kickoff countdown slot, tv chip). */
"use strict";
var fs = require("fs"), path = require("path");
var HS = require("../js/home-strip.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
var MIN = 60000, NOW = 1727750400000; /* fixed clock for determinism */

/* ---- broadcastNames via collect() ---- */
function payload(bc){
  var comp = {status: {type: {state: "pre", shortDetail: "10/1 - 8:15 PM EDT"}},
              venue: {fullName: "Huntington Bank Field"},
              competitors: [
                {homeAway: "away", team: {abbreviation: "PIT"}},
                {homeAway: "home", team: {abbreviation: "CLE"}}]};
  if(bc !== undefined) comp.broadcasts = [{names: bc}];
  return {events: [{id: "g1", date: "2026-10-02T00:15Z", competitions: [comp]}]};
}
var r1 = HS.collect("NFL", payload(["Prime Video"]))[0];
assert(r1.broadcast === "Prime Video", "collect: single broadcast name captured ("+r1.broadcast+")");
var r2 = HS.collect("NFL", payload(["ESPN", "ABC"]))[0];
assert(r2.broadcast === "ESPN / ABC", "collect: multiple names joined ("+r2.broadcast+")");
var r3 = HS.collect("NFL", payload(undefined))[0];
assert(r3.broadcast === "", "collect: missing broadcasts -> empty string");
var r4 = HS.collect("NFL", payload([]))[0];
assert(r4.broadcast === "", "collect: empty names array -> empty string");

/* ---- kickoffIn ---- */
assert(HS.kickoffIn(new Date(NOW + (13*60+42)*MIN).toISOString(), NOW) === "Kickoff in 13h 42m",
  "kickoffIn: 13h42m -> 'Kickoff in 13h 42m'");
assert(HS.kickoffIn(new Date(NOW + (2*1440+5*60)*MIN).toISOString(), NOW) === "Kickoff in 2d 5h",
  "kickoffIn: 2d5h -> 'Kickoff in 2d 5h'");
assert(HS.kickoffIn(new Date(NOW + 45*MIN).toISOString(), NOW) === "Kickoff in 45m",
  "kickoffIn: 45m -> 'Kickoff in 45m'");
assert(HS.kickoffIn(new Date(NOW + 90*MIN).toISOString(), NOW) === "Kickoff in 1h 30m",
  "kickoffIn: 90m -> 'Kickoff in 1h 30m'");
assert(HS.kickoffIn(new Date(NOW - 1000).toISOString(), NOW) === null,
  "kickoffIn: past kickoff -> null");
assert(HS.kickoffIn("not-a-date", NOW) === null, "kickoffIn: garbage date -> null");
assert(HS.kickoffIn("", NOW) === null, "kickoffIn: empty date -> null");
assert(HS.kickoffIn(new Date(NOW + 1440*MIN).toISOString(), NOW) === "Kickoff in 1d 0h",
  "kickoffIn: exactly 24h -> day format");

/* ---- kickoffIn noun arg (v1.129.1 sport-aware countdown) ---- */
assert(HS.kickoffIn(new Date(NOW + 90*MIN).toISOString(), NOW, "First pitch") === "First pitch in 1h 30m",
  "kickoffIn: noun arg replaces the leading noun");
assert(HS.kickoffIn(new Date(NOW + 45*MIN).toISOString(), NOW, "Tip-off") === "Tip-off in 45m",
  "kickoffIn: noun arg works in the minutes format");
assert(HS.kickoffIn(new Date(NOW + 3*1440*MIN).toISOString(), NOW, "Puck drop") === "Puck drop in 3d 0h",
  "kickoffIn: noun arg works in the day format");
assert(HS.kickoffIn(new Date(NOW + 90*MIN).toISOString(), NOW, undefined) === "Kickoff in 1h 30m",
  "kickoffIn: undefined noun keeps the Kickoff default");
assert(HS.kickoffIn(new Date(NOW + 90*MIN).toISOString(), NOW, "") === "Kickoff in 1h 30m",
  "kickoffIn: empty noun keeps the Kickoff default");
assert(HS.kickoffIn("not-a-date", NOW, "First pitch") === null,
  "kickoffIn: garbage date still -> null with a noun");

/* ---- gameNoun (v1.129.1 sport-aware countdown) ---- */
assert(HS.gameNoun("NFL") === "Kickoff", "gameNoun: NFL -> Kickoff");
assert(HS.gameNoun("MLB") === "First pitch", "gameNoun: MLB -> First pitch");
assert(HS.gameNoun("NBA") === "Tip-off", "gameNoun: NBA -> Tip-off");
assert(HS.gameNoun("NHL") === "Puck drop", "gameNoun: NHL -> Puck drop");
assert(HS.gameNoun("mlb") === "First pitch", "gameNoun: case-insensitive (mlb)");
assert(HS.gameNoun("Mlb") === "First pitch", "gameNoun: case-insensitive (Mlb)");
assert(HS.gameNoun("EPL") === "Kick-off", "gameNoun: EPL -> Kick-off");
assert(HS.gameNoun("CFB") === "Kickoff", "gameNoun: unknown league -> Kickoff");
assert(HS.gameNoun("") === "Kickoff", "gameNoun: empty -> Kickoff");
assert(HS.gameNoun(null) === "Kickoff", "gameNoun: null -> Kickoff");
assert(HS.gameNoun(undefined) === "Kickoff", "gameNoun: undefined -> Kickoff");
assert(HS.gameNoun(42) === "Kickoff", "gameNoun: non-string -> Kickoff");
/* The shipped leagues each get a real noun, never the default by accident. */
HS.LEAGUES.forEach(function(pair){
  assert(typeof HS.gameNoun(pair[1]) === "string" && HS.gameNoun(pair[1]).length > 0,
    "gameNoun: shipped league label has a noun ("+pair[1]+")");
});

/* ---- nearestPre ---- */
function mkrow(id, state, dateIso){
  return {id: id, league: "NFL", state: state, date: dateIso,
          away: {team: {abbreviation: "A"}}, home: {team: {abbreviation: "H"}}};
}
var rows = [
  mkrow("live1", "in", new Date(NOW - 30*MIN).toISOString()),
  mkrow("far", "pre", new Date(NOW + 3*1440*MIN).toISOString()),
  mkrow("soon", "pre", new Date(NOW + 60*MIN).toISOString()),
  mkrow("sooner", "pre", new Date(NOW + 20*MIN).toISOString()),
  mkrow("past", "pre", new Date(NOW - 60*MIN).toISOString()),
  mkrow("post1", "post", new Date(NOW - 3*3600000).toISOString()),
  mkrow("nodate", "pre", "")
];
var np = HS.nearestPre(rows, NOW);
assert(np && np.id === "sooner", "nearestPre: picks earliest future pre kickoff");
assert(HS.nearestPre(rows.filter(function(x){ return x.id !== "sooner" && x.id !== "soon"; }), NOW).id === "far",
  "nearestPre: falls back to the next future pre");
assert(HS.nearestPre([mkrow("live1", "in", new Date(NOW - 5*MIN).toISOString())], NOW) === null,
  "nearestPre: no pre rows -> null");
assert(HS.nearestPre([], NOW) === null, "nearestPre: empty rows -> null");

/* ---- shipped wiring pins ---- */
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert(html.indexOf("js/home-strip.js?v=2.0.3") !== -1, "index.html pins home-strip.js?v=2.0.3");
assert(html.indexOf("data-kickoff") !== -1, "index.html renders the countdown slot");
assert(html.indexOf('data-league="') !== -1, "index.html tags the countdown slot with its league");
assert(html.indexOf("HS.gameNoun(") !== -1, "index.html passes the league through the noun for the ticker");
assert(html.indexOf("setInterval(tick, 60000)") !== -1, "index.html arms the 60s master tick");
assert(html.indexOf("\uD83D\uDCFA") !== -1, "index.html renders the TV chip");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all green");
