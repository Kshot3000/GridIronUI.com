/* Unit tests for js/team-follow.js — the follow-list pure module.
   add dedupes, remove is a no-op for unknown teams, corrupt JSON recovers
   to [], case normalization, the storage key, and the followed-team move
   matcher. Run: node tests/test-team-follow.js */
"use strict";
var TF = require("../js/team-follow.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL", msg); }
  else console.log("ok  ", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ")"); }

/* storage key */
eq(TF.KEY, "giu-followed-teams", "storage key is giu-followed-teams");

/* case normalization */
eq(TF.norm(" chi "), "CHI", "norm trims and uppercases");
eq(TF.norm("gb"), "GB", "norm uppercases short abbr");
eq(TF.norm(null), "", "norm of null is empty");

/* list cleanup */
assert(JSON.stringify(TF.list(["CHI","chi"," Chi ","GB",null,42,""])) === '["CHI","GB"]',
  "list normalizes, dedupes, drops junk");
assert(JSON.stringify(TF.list("CHI")) === "[]", "list of a string is []");
assert(JSON.stringify(TF.list(null)) === "[]", "list of null is []");
assert(JSON.stringify(TF.list({})) === "[]", "list of a non-array is []");

/* corrupt-storage recovery */
assert(JSON.stringify(TF.parse("{bad json")) === "[]", "corrupt JSON -> []");
assert(JSON.stringify(TF.parse("null")) === "[]", "JSON null -> []");
assert(JSON.stringify(TF.parse("[\"CHI\", 7]")) === '["CHI"]', "JSON array keeps valid entries");
assert(JSON.stringify(TF.parse(null)) === "[]", "parse(null) -> []");
assert(JSON.stringify(TF.parse("")) === "[]", "parse('') -> []");

/* add / remove / has */
assert(JSON.stringify(TF.follow([], "chi")) === '["CHI"]', "follow adds normalized");
assert(JSON.stringify(TF.follow(["CHI"], "chi")) === '["CHI"]', "follow dedupes case-insensitively");
assert(JSON.stringify(TF.follow(["CHI"], "GB")) === '["CHI","GB"]', "follow appends a second team");
var before = ["CHI"];
TF.follow(before, "GB");
assert(JSON.stringify(before) === '["CHI"]', "follow does not mutate the input");
assert(JSON.stringify(TF.unfollow(["CHI","GB"], "chi")) === '["GB"]', "unfollow removes case-insensitively");
assert(JSON.stringify(TF.unfollow(["CHI"], "GB")) === '["CHI"]', "unfollow of unknown team is a no-op");
assert(TF.has(["CHI"], "chi") === true, "has matches case-insensitively");
assert(TF.has(["CHI"], "GB") === false, "has misses cleanly");

/* storage-backed load/save/toggle with a fake store */
function fakeStore(seed){
  var data = seed || {};
  return {
    getItem: function(k){ return data.hasOwnProperty(k) ? data[k] : null; },
    setItem: function(k, v){ data[k] = String(v); },
    _data: data
  };
}
var s1 = fakeStore();
assert(JSON.stringify(TF.load(s1)) === "[]", "load from empty store -> []");
TF.save(["chi","GB","chi"], s1);
assert(s1._data["giu-followed-teams"] === '["CHI","GB"]',
  "save writes normalized, deduped JSON under the key");
assert(JSON.stringify(TF.load(s1)) === '["CHI","GB"]', "load reads back what save wrote");
var s2 = fakeStore({"giu-followed-teams": "{corrupt"});
assert(JSON.stringify(TF.load(s2)) === "[]", "load recovers corrupt blob to []");
var r = TF.toggle("chi", fakeStore());
assert(r.followed === true && JSON.stringify(r.list) === '["CHI"]', "toggle adds when absent");
var s3 = fakeStore({"giu-followed-teams": '["CHI"]'});
r = TF.toggle("CHI", s3);
assert(r.followed === false && JSON.stringify(r.list) === "[]", "toggle removes when present");

/* abbrOf: never guesses */
function fakeFind(dir, league, name){
  var m = {"Chicago Bears": {abbr: "CHI"}, "Green Bay Packers": {abbr: "GB"}};
  return m[name] || null;
}
eq(TF.abbrOf(fakeFind, {}, "nfl", "Chicago Bears"), "CHI", "abbrOf resolves a known team");
eq(TF.abbrOf(fakeFind, {}, "nfl", "Springfield Atoms"), null, "abbrOf returns null for unknown teams");
eq(TF.abbrOf(null, {}, "nfl", "Chicago Bears"), null, "abbrOf returns null without a find fn");

/* followedInGame */
eq(TF.followedInGame(["CHI"], "CHI", "GB"), "CHI", "followedInGame matches the away side");
eq(TF.followedInGame(["gb"], "CHI", "GB"), "GB", "followedInGame matches the home side, normalized");
eq(TF.followedInGame(["CHI"], "DET", "GB"), null, "followedInGame null when neither side is followed");
eq(TF.followedInGame([], "CHI", "GB"), null, "followedInGame null with an empty follow list");

/* involvedMoves: stamps .followed only on moves involving a followed team */
function stubMoveAlerts(events, baseline, threshold, tsNow){
  return [
    {id: "g1", kind: "spread", delta: 1.5},
    {id: "g2", kind: "total", delta: 2.0}
  ];
}
var events = [
  {id: "g1", away_team: "Chicago Bears", home_team: "Green Bay Packers"},
  {id: "g2", away_team: "Detroit Lions", home_team: "Minnesota Vikings"}
];
var hits = TF.involvedMoves(fakeFind, {}, "nfl", events, {}, ["CHI"], 1, 0, stubMoveAlerts);
eq(hits.length, 1, "involvedMoves keeps only the followed team's game");
eq(hits[0].followed, "CHI", "involvedMoves stamps .followed with the matched abbr");
assert(JSON.stringify(TF.involvedMoves(fakeFind, {}, "nfl", events, {}, [], 1, 0, stubMoveAlerts)) === "[]",
  "involvedMoves empty with no followed teams");
assert(JSON.stringify(TF.involvedMoves(fakeFind, {}, "nfl", events, {}, ["CHI"], 1, 0, null)) === "[]",
  "involvedMoves empty without a moveAlerts fn");

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL TEAM-FOLLOW TESTS PASSED");
process.exit(failures ? 1 : 0);
