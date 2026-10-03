/* Tests for NCAAF on the homepage strip (v2.0.3 — js/home-strip.js).
   The strip carried only the four pro leagues, so on a college football
   Saturday the "Happening now" band could sit nearly empty while the
   ranked college slate played all day. v2.0.3 adds ESPN's default
   college-football scoreboard (the ranked slate — the same endpoint the
   scores board's NCAAF tab reads) as a fifth feed. The pro-only extras
   must degrade honestly for college rows: no Kalshi annotation (no NCAAF
   snapshot exists), no weather chip (the resolver is NFL/MLB only), and
   NO Matchup button — the hub has no college mapping, so HS.hubKey is
   what index.html gates the button on.
   Run: node tests/test-home-ncaaf.js */
"use strict";
var fs = require("fs");
var HS = require("../js/home-strip.js");
var HX = require("../js/home-wx.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* --- LEAGUES: NCAAF is the fifth feed, on the scores board's endpoint --- */
assert(HS.LEAGUES.length === 5, "strip now pulls five scoreboards");
var ncaaf = HS.LEAGUES.filter(function(p){ return p[1] === "NCAAF"; });
assert(ncaaf.length === 1 && ncaaf[0][0] === "football/college-football",
       "NCAAF maps to football/college-football (same path as the scores tab)");

/* --- hubKey: the hub supports the four pro leagues, never college --- */
assert(HS.hubKey("NFL") === "nfl", "hubKey: NFL -> nfl");
assert(HS.hubKey("NBA") === "nba", "hubKey: NBA -> nba");
assert(HS.hubKey("MLB") === "mlb", "hubKey: MLB -> mlb");
assert(HS.hubKey("NHL") === "nhl", "hubKey: NHL -> nhl");
assert(HS.hubKey("NCAAF") === null, "hubKey: NCAAF -> null (hub has no college mapping)");
assert(HS.hubKey(" nfl ") === "nfl", "hubKey trims + uppercases the label");
assert(HS.hubKey("EPL") === null, "hubKey: EPL -> null");
assert(HS.hubKey("") === null && HS.hubKey(null) === null &&
       HS.hubKey(undefined) === null && HS.hubKey(42) === null,
       "hubKey: garbage in -> null, never a guessed key");
assert(HS.hubKey("constructor") === null, "hubKey: prototype names are not keys");

/* --- collect: a real-shaped NCAAF slate (ESPN payload shape, Oct 3 2026
       ranked games: Notre Dame at North Carolina, Alabama at Mississippi
       State — competitors carry their own logos/colors, venue named) --- */
function cfbEv(id, date, state, awayAbbr, awayName, homeAbbr, homeName, venue){
  return { id: id, date: date, name: awayName + " at " + homeName,
    competitions: [{
      status: {type: {state: state, shortDetail: "Sat 12:00 PM"}},
      venue: {fullName: venue},
      broadcasts: [{names: ["ESPN"]}],
      competitors: [
        {homeAway: "away", score: "", team: {abbreviation: awayAbbr, displayName: awayName, color: "0c2340", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/87.png"}},
        {homeAway: "home", score: "", team: {abbreviation: homeAbbr, displayName: homeName, color: "7bafd4", logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/153.png"}}
      ]}]};
}
var slate = {events: [
  cfbEv("401858250", "2026-10-03T16:00Z", "pre", "ND", "Notre Dame Fighting Irish", "UNC", "North Carolina Tar Heels", "Kenan Stadium"),
  cfbEv("401858251", "2026-10-03T16:00Z", "pre", "ALA", "Alabama Crimson Tide", "MSST", "Mississippi State Bulldogs", "Davis Wade Stadium"),
  cfbEv("401858252", "2026-10-03T15:00Z", "post", "UGA", "Georgia Bulldogs", "AUB", "Auburn Tigers", "Jordan-Hare Stadium")
]};
var rows = HS.collect("NCAAF", slate);
assert(rows.length === 2, "collect keeps the two upcoming NCAAF games, drops the final");
assert(rows[0].league === "NCAAF" && rows[0].venue === "Kenan Stadium",
       "NCAAF rows carry the league label + venue");
assert(rows[0].away.team.abbreviation === "ND" && rows[0].home.team.abbreviation === "UNC",
       "NCAAF rows keep ESPN's competitor objects (logos/colors ride along)");
assert(rows[0].broadcast === "ESPN", "NCAAF rows keep the ESPN broadcast name");

/* --- cross-league ranking: a live pro game still leads, then kickoff --- */
function proEv(id, date, state){
  return { id: id, date: date, competitions: [{
    status: {type: {state: state, shortDetail: ""}}, venue: {fullName: "Park"},
    competitors: [
      {homeAway: "away", team: {abbreviation: "LAD", displayName: "Dodgers"}, score: "2"},
      {homeAway: "home", team: {abbreviation: "ATL", displayName: "Braves"}, score: "1"}
    ]}]};
}
var mixed = HS.top([].concat(
  HS.collect("NCAAF", slate),
  HS.collect("MLB", {events: [proEv("mlb1", "2026-10-03T17:00Z", "in")]})
), 6);
assert(mixed[0].league === "MLB" && mixed[0].state === "in",
       "a live game outranks upcoming NCAAF kickoffs");
assert(mixed.length === 3 && mixed[1].league === "NCAAF",
       "NCAAF rows fill the strip behind the live game, ordered by kickoff");

/* --- countdown noun: college football is a kickoff, not a first pitch --- */
assert(HS.gameNoun("NCAAF") === "Kickoff", "gameNoun: NCAAF -> Kickoff");

/* --- Kalshi honesty: an NFL snapshot never annotates a college row --- */
var snap = { updated_at: new Date().toISOString(), games: [{
  event_ticker: "KXNFLGAME-26OCT04NDUNC", sub_title: "ND vs UNC (Oct 4)",
  title: "ND vs UNC", markets: [
    {ticker: "KXNFLGAME-26OCT04NDUNC-ND", yes_bid: 60, yes_ask: 62, last: 61},
    {ticker: "KXNFLGAME-26OCT04NDUNC-UNC", yes_bid: 38, yes_ask: 40, last: 39}
  ]}]};
var annotated = HS.withKalshi(rows, {NFL: snap}, Date.now());
assert(annotated.every(function(r){ return !r.kp; }),
       "withKalshi leaves NCAAF rows unannotated — no snapshot, no price, no guess");

/* --- weather honesty: the chip resolver ignores college rows entirely --- */
var wxJobs = HX.resolveRows(rows, {nfl: function(){ return {lat: 1, lon: 2, stadium: "X"}; },
                                   mlb: function(){ return {lat: 1, lon: 2, stadium: "X"}; }}, Date.now());
assert(Array.isArray(wxJobs) && wxJobs.length === 0,
       "home-wx resolveRows produces no jobs for NCAAF rows");

/* --- shipped wiring: the Matchup button is gated on hubKey, keys pinned --- */
var html = fs.readFileSync(__dirname + "/../index.html", "utf8");
assert(html.indexOf("HS.hubKey") !== -1 && html.indexOf("hubLink") !== -1,
       "index.html gates the Matchup button on HS.hubKey");
assert(html.indexOf("js/home-strip.js?v=2.0.3") !== -1,
       "index.html pins home-strip.js?v=2.0.3");
["matchup.html", "predictions.html"].forEach(function(p){
  var h = fs.readFileSync(__dirname + "/../" + p, "utf8");
  assert(h.indexOf("js/home-strip.js?v=2.0.3") !== -1,
         p + " re-pins the shared home-strip.js at v2.0.3");
});

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL HOME-NCAAF TESTS PASSED");
process.exit(failures ? 1 : 0);
