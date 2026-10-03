/* GridIronUI predictions-page Kalshi-only fallback tests.
   When Polymarket's API fails, predictions.js falls back to the
   server-side Kalshi snapshot via js/predictions-fallback.js (pure module).
   These tests pin the honesty contract:
   - usable() is false for missing/empty/stale snapshots or a missing Kalshi module
   - games() excludes settled games (a 99c price is a result, not a prediction), soonest first, capped at 10
   - render() returns null when nothing honest can be shown
   - render() output never mentions Polymarket data ("Market-implied"), carries a Kalshi tag + snapshot timestamp, and says the page retries automatically
   - all text is HTML-escaped (XSS probe)
   - "what moved" badges render for 2c+ snapshot-to-snapshot moves via exact ticker+abbr joins
   - shipped wiring pins: predictions.html loads predictions-fallback.js (keyed) before predictions.js, and predictions.js calls window.PredFallback
   Run: node tests/test-predictions-fallback.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

var K = require(path.join(ROOT, "js", "kalshi-logic.js"));
var D = require(path.join(ROOT, "js", "disagree-logic.js"));
global.window = {Kalshi: K, Disagree: D};
var F = require(path.join(ROOT, "js", "predictions-fallback.js"));

function freshSnap(){
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-nfl.json"), "utf8"));
}
function staleSnap(){
  var s = freshSnap();
  s.updated_at = new Date(Date.now() - 7*3600*1000).toISOString();
  return s;
}
function mkGame(ticker, title, sub, teams){
  return {event_ticker: ticker, title: title, sub_title: sub, markets: teams.map(function(t, i){
    return {ticker: ticker+"-"+t.abbr, title: t.name+" wins", kind: "winner", team: t.name,
            yes_bid: t.bid, yes_ask: t.ask, last: t.bid, volume: "1000", volume_24h: "500",
            close_time: "2026-10-04T00:15:00Z"};
  })};
}

/* ---- usable() ---- */
assert(F.usable(null) === false, "usable: null snapshot is not usable");
assert(F.usable({}) === false, "usable: empty object is not usable");
assert(F.usable({games: []}) === false, "usable: zero games is not usable");
assert(F.usable(staleSnap()) === false, "usable: 7h-old snapshot is stale, not usable");
assert(F.usable({games: [{event_ticker: "X", markets: []}]}) === false,
  "usable: snapshot without updated_at is treated as stale, not usable");
var real = freshSnap();
assert(F.usable(real) === true, "usable: the real NFL snapshot (fresh) is usable");
var savedK = global.window.Kalshi;
global.window.Kalshi = null;
assert(F.usable(real) === false, "usable: false when the Kalshi module is missing");
global.window.Kalshi = savedK;

/* ---- games() ---- */
var games = F.games(real);
assert(games.length > 0 && games.length <= 10, "games: real snapshot yields 1-10 games (got "+games.length+")");
assert(games.every(function(g){ return !g.settled; }), "games: no settled games in the fallback list");
var closes = games.map(function(g){ return g.close === null ? Infinity : g.close; });
var sorted = closes.every(function(c, i){ return i === 0 || closes[i-1] <= c; });
assert(sorted, "games: sorted soonest-first");
/* settled exclusion, pinned with a synthetic snapshot */
var synth = {updated_at: new Date().toISOString(), games: [
  mkGame("KXSET-1", "AAA Testers vs BBB Testers", "AAA vs BBB (Oct 2)",
    [{abbr: "AAA", name: "AAA Testers", bid: 99, ask: 99}, {abbr: "BBB", name: "BBB Testers", bid: 1, ask: 1}]),
  mkGame("KXLIVE-1", "CCC Testers vs DDD Testers", "CCC vs DDD (Oct 2)",
    [{abbr: "CCC", name: "CCC Testers", bid: 60, ask: 62}, {abbr: "DDD", name: "DDD Testers", bid: 38, ask: 40}])
]};
var sg = F.games(synth);
assert(sg.length === 1 && sg[0].ticker === "KXLIVE-1",
  "games: the settled 99c/1c game is excluded, the live game remains");
/* 10-game cap */
var many = {updated_at: new Date().toISOString(), games: []};
for(var i = 0; i < 14; i++){
  many.games.push(mkGame("KXCAP-"+i, "Team A"+i+" vs Team B"+i, "A"+i+" vs B"+i+" (Oct 3)",
    [{abbr: "TA"+i, name: "Team A"+i, bid: 55, ask: 57}, {abbr: "TB"+i, name: "Team B"+i, bid: 43, ask: 45}]));
}
assert(F.games(many).length === 10, "games: capped at 10 cards like the live path");

/* ---- render() null cases ---- */
assert(F.render(null) === null, "render: null for a null snapshot");
assert(F.render(staleSnap()) === null, "render: null for a stale snapshot");
assert(F.render(synth) !== null && F.render(synth).indexOf("CCC Testers") !== -1,
  "render: synthetic live game renders");

/* ---- render() honesty contract on the real snapshot ---- */
var html = F.render(real);
assert(typeof html === "string" && html.length > 500, "render: real snapshot produces banner + cards");
assert(html.indexOf("Polymarket didn\u2019t respond") !== -1,
  "render: banner names the failed feed honestly");
assert(html.indexOf("Kalshi crowd\u2019s prices only") !== -1,
  "render: banner says Kalshi-only, never implies Polymarket data");
assert(html.indexOf("Market-implied") === -1,
  "render: no 'Market-implied' tag on fallback cards (that tag means Polymarket)");
assert(html.indexOf("Trying Polymarket again automatically") !== -1,
  "render: banner promises the automatic retry the loader performs");
assert(html.indexOf("server-side snapshot") !== -1,
  "render: prices labeled as a server-side snapshot, not live");
/* "real game content present" is derived from the snapshot itself — the
   board rotates (tonight's TNF game was PIT/CLE; after the final it left
   the board), so hard-coding a team name kept expiring. The first game is
   always rendered by render(), so this stays green through every rotation. */
var firstGameTitle = (real.games[0] && real.games[0].title) || "";
assert(firstGameTitle !== "" && html.indexOf(firstGameTitle) !== -1,
  "render: real game content present (from the current snapshot: "+firstGameTitle+")");
assert(html.indexOf("Trade on Kalshi") !== -1, "render: Kalshi outbound link present");
/* no cross-crowd gap chip without Polymarket prices */
assert(html.indexOf("vs Polymarket") === -1,
  "render: no cross-crowd gap chip — there is no Polymarket price to gap against");

/* ---- XSS ---- */
var xss = {updated_at: new Date().toISOString(), games: [
  mkGame("KXXSS-1", "<script>alert(1)</script> vs BBB", "X vs Y (Oct 2)",
    [{abbr: "XAA", name: "<img src=x onerror=alert(1)>", bid: 55, ask: 57},
     {abbr: "YBB", name: "BBB", bid: 43, ask: 45}])
]};
var xh = F.render(xss);
assert(xh !== null, "render: XSS-probe snapshot still renders");
assert(xh.indexOf("<img src=x") === -1 && xh.indexOf("&lt;img") !== -1,
  "render: team names are HTML-escaped");
assert(xh.indexOf("<script>alert") === -1,
  "render: titles are HTML-escaped");

/* ---- "what moved" badges ---- */
var mv = {updated_at: new Date().toISOString(), prev_at: new Date(Date.now()-3600*1000).toISOString(),
  moves: [{event_ticker: "KXMV-1", team: "Movers FC", delta: 3},
          {event_ticker: "KXMV-1", team: "Others FC", delta: 1}],
  games: [mkGame("KXMV-1", "Movers FC vs Others FC", "MOV vs OTH (Oct 2)",
    [{abbr: "MOV", name: "Movers FC", bid: 60, ask: 62}, {abbr: "OTH", name: "Others FC", bid: 38, ask: 40}])]};
var mh = F.render(mv);
assert(mh !== null && mh.indexOf("mv-up") !== -1,
  "render: 3c snapshot-to-snapshot move earns the up badge");
assert(mh.indexOf("mv-dn") === -1, "render: 1c move stays below the 2c badge bar");

/* ---- shipped wiring pins ---- */
var predHtml = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
var fbIdx = predHtml.indexOf("js/predictions-fallback.js");
var pIdx = predHtml.indexOf("js/predictions.js?v=");
assert(fbIdx !== -1 && pIdx !== -1 && fbIdx < pIdx,
  "wiring: predictions.html loads predictions-fallback.js BEFORE predictions.js");
var keyM = predHtml.match(/js\/predictions-fallback\.js\?v=([0-9.]+)/);
assert(keyM && keyM[1] === "2.0.11",
  "wiring: predictions-fallback.js carries the v2.0.11 cache key (kickoff times; v1.135.0 at ship)");
var pjs = fs.readFileSync(path.join(ROOT, "js", "predictions.js"), "utf8");
assert(pjs.indexOf("window.PredFallback") !== -1,
  "wiring: predictions.js calls window.PredFallback on the Polymarket failure path");
assert(pjs.indexOf("setTimeout(function(){ load(key, tabSeq, true); }, PM_MS)") !== -1,
  "wiring: fallback mode schedules one silent Polymarket retry on the refresh beat");
assert(pjs.indexOf("var snapP = SNAP[key]") !== -1,
  "wiring: the snapshot fetch starts with the page load, not after the failure");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all assertions passed");
