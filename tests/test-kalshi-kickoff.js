/* GridIronUI Kalshi kickoff-time test — v2.0.11.
   Before this change a Kalshi card named only the date ("(Oct 3)"): the
   snapshot fetcher dropped Kalshi's occurrence_datetime (the real,
   scheduled start — every market of a game carries the same one, verified
   live 2026-10-03 across KXNFLGAME/KXMLBGAME/KXNCAAFGAME: every game,
   exactly one value), so no Kalshi surface could show a kickoff time,
   while the Polymarket cards beside them showed start times. close_time
   is NOT the start (Kalshi sets it ~2 days later for the in-play window)
   and must never be rendered as one.
   Contract pinned here:
   - scripts/fetch-kalshi.py stores the earliest occurrence_datetime as
     each game's "start" (null when Kalshi stamps none);
   - K.startMs parses it honestly (garbage/missing -> null, never throws);
   - K.games exposes start and sorts by it ahead of the close-time proxy,
     with the close fallback byte-identical for start-less snapshots and
     settled games still last;
   - all three Kalshi card builders (markets kalshiCard via markets.js
     source pin, OL.marketGameCard, F.cardHtml) render "Kickoff <time>"
     when a start exists and omit it when none does;
   - the shipped snapshots carry a parseable start on every game, always
     before that game's close_time, and K.games returns them kickoff-
     ordered;
   - shipped cache keys for the four changed JS files are v2.0.11. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function read(rel){ return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

var K = require("../js/kalshi-logic.js");
var OL = require("../js/odds-logic.js");
global.window = { Kalshi: K }; /* predictions-fallback resolves K via window */
var F = require("../js/predictions-fallback.js");

/* ---- fetcher stores the real start ---- */
var fetchPy = read("scripts/fetch-kalshi.py");
assert(fetchPy.indexOf("occurrence_datetime") !== -1,
  "fetch-kalshi.py reads occurrence_datetime from Kalshi markets");
assert(/"start":\s*min\(starts\) if starts else None/.test(fetchPy),
  "fetch-kalshi.py stores the earliest occurrence as the game's start (null when unstamped)");

/* ---- K.startMs honesty ---- */
assert(K.startMs({start: "2026-10-03T19:00:00Z"}) === Date.parse("2026-10-03T19:00:00Z"),
  "startMs parses an ISO start");
assert(K.startMs({start: null}) === null, "startMs(null start) is null");
assert(K.startMs({}) === null, "startMs(missing start) is null");
assert(K.startMs({start: "not-a-date"}) === null, "startMs(garbage) is null, never NaN");
assert(K.startMs(null) === null && K.startMs(undefined) === null && K.startMs(42) === null,
  "startMs(garbage game) is null, never throws");

/* ---- K.games: start exposed, kickoff order beats the close proxy ---- */
function game(ticker, start, close, priceA, priceB){
  return { event_ticker: ticker, title: ticker + " game", sub_title: ticker + " (Oct 3)",
    start: start,
    markets: [
      { ticker: ticker + "-A", kind: "winner", team: "Alpha", yes_bid: priceA - 1, yes_ask: priceA + 1, last: priceA, close_time: close },
      { ticker: ticker + "-B", kind: "winner", team: "Beta", yes_bid: priceB - 1, yes_ask: priceB + 1, last: priceB, close_time: close }
    ] };
}
var snap = { updated_at: "2026-10-03T13:00:00Z", games: [
  /* close order says EARLYCLOSE first; kickoff order says LATECLOSE first */
  game("LATECLOSE", "2026-10-03T17:00:00Z", "2026-10-06T00:00:00Z", 60, 40),
  game("EARLYCLOSE", "2026-10-03T20:00:00Z", "2026-10-05T00:00:00Z", 55, 45),
  game("NOSTART", null, "2026-10-04T00:00:00Z", 50, 50)
]};
var gs = K.games(snap);
assert(gs.length === 3, "games() keeps all three priced games");
assert(gs[0].ticker === "LATECLOSE" && gs[1].ticker === "EARLYCLOSE",
  "games() sorts by real kickoff ahead of the close-time proxy");
assert(gs[0].start === Date.parse("2026-10-03T17:00:00Z"), "games() exposes start in ms");
assert(gs[2].ticker === "NOSTART" && gs[2].start === null,
  "a start-less game falls back to its close time in the order, start null");
var oldSnap = { updated_at: "2026-10-03T13:00:00Z", games: [
  game("B", undefined, "2026-10-06T00:00:00Z", 60, 40),
  game("A", undefined, "2026-10-05T00:00:00Z", 55, 45)
]};
var og = K.games(oldSnap);
assert(og[0].ticker === "A" && og[1].ticker === "B" && og.every(function(g){ return g.start === null; }),
  "start-less snapshots keep the exact old close-time ordering");

/* ---- card builders render the kickoff, and only a real one ---- */
var withStart = gs[0], noStart = gs[2];
var olHtml = OL.marketGameCard(withStart, "Sat, Oct 3", null, null, false);
assert(olHtml.indexOf("Kickoff ") !== -1 && olHtml.indexOf(K.fmtWhen(withStart.start)) !== -1,
  "odds market card shows 'Kickoff ' + the formatted real start");
assert(OL.marketGameCard(noStart, "Sat, Oct 3", null, null, false).indexOf("Kickoff") === -1,
  "odds market card omits kickoff when the snapshot has no start");
var fbHtml = F.cardHtml(withStart, snap, null);
assert(fbHtml.indexOf("Kickoff ") !== -1 && fbHtml.indexOf(K.fmtWhen(withStart.start)) !== -1,
  "predictions fallback card shows the kickoff");
assert(F.cardHtml(noStart, snap, null).indexOf("Kickoff") === -1,
  "predictions fallback card omits kickoff when the snapshot has no start");
var marketsJs = read("js/markets.js");
assert(marketsJs.indexOf("Kickoff ") !== -1 && /Kalshi\.fmtWhen\(g\.start\)/.test(marketsJs),
  "markets.js kalshiCard renders the kickoff from g.start via K.fmtWhen");

/* ---- shipped snapshots: every game carries a real start ---- */
["data/kalshi-nfl.json", "data/kalshi-mlb.json", "data/kalshi-ncaaf.json"].forEach(function(rel){
  var s = JSON.parse(read(rel));
  assert(Array.isArray(s.games) && s.games.length > 0, rel + " has games");
  assert(s.games.every(function(g){ return K.startMs(g) !== null; }),
    rel + ": every game carries a parseable start");
  assert(s.games.every(function(g){
    var st = K.startMs(g);
    return (g.markets || []).every(function(m){
      var c = Date.parse(m.close_time || "");
      return !isFinite(c) || st < c;
    });
  }), rel + ": every start precedes its markets' close_time (start is kickoff, not close)");
  var ordered = K.games(s).filter(function(g){ return !g.settled; });
  var mono = ordered.every(function(g, i){ return i === 0 || ordered[i - 1].start <= g.start; });
  assert(mono, rel + ": K.games returns unsettled games in kickoff order");
});

/* ---- shipped cache keys ---- */
function key(html, file){
  var m = html.match(new RegExp("js/" + file.replace(".", "\\.") + "\\?v=([\\d.]+)"));
  return m && m[1];
}
assert(key(read("markets.html"), "kalshi-logic.js") === "2.0.11", "markets.html kalshi-logic key is v2.0.11");
assert(key(read("markets.html"), "markets.js") === "2.0.11", "markets.html markets.js key is v2.0.11");
assert(key(read("odds.html"), "kalshi-logic.js") === "2.0.11", "odds.html kalshi-logic key is v2.0.11");
assert(key(read("odds.html"), "odds-logic.js") === "2.0.11", "odds.html odds-logic key is v2.0.11");
assert(key(read("matchup.html"), "odds-logic.js") === "2.0.11", "matchup.html odds-logic key is v2.0.11");
assert(key(read("predictions.html"), "kalshi-logic.js") === "2.0.11", "predictions.html kalshi-logic key is v2.0.11");
assert(key(read("predictions.html"), "predictions-fallback.js") === "2.0.11", "predictions.html predictions-fallback key is v2.0.11");

if(failures){ console.error(failures + " failure(s)"); process.exit(1); }
console.log("test-kalshi-kickoff: all assertions passed");
