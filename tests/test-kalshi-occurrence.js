/* GridIronUI Kalshi occurrence test — v2.0.13.
   v2.0.11 shipped Kalshi's occurrence_datetime as each game's kickoff:
   the fetcher stored it as "start" and all three Kalshi card builders
   rendered "Kickoff <time>". Cross-checks on 2026-10-04 proved the
   premise false — occurrence runs exactly the scheduled start + 3 hours
   in every check: all 16 NFL Week 5 games vs ESPN's scoreboard (the
   London game kicked 13:30Z, occurrence said 16:30Z), both MLB Division
   Series games vs ESPN, and MLB vs the scheduled time in Kalshi's own
   rules_primary ("Oct 6, 2026 at 9:30 PM EDT" = 01:30Z vs occurrence
   04:30Z). occurrence_datetime is Kalshi's expected occurrence /
   expiration stamp (it equals expected_expiration_time), NOT a start.
   Contract pinned here:
   - scripts/fetch-kalshi.py stores the earliest occurrence_datetime as
     each game's "occ" (null when Kalshi stamps none) — never "start";
   - K.occMs parses occ honestly (garbage/missing -> null, never throws)
     and still reads the legacy "start" key, which carried the same
     occurrence value in pre-rename snapshots;
   - K.games exposes occ and orders by it ahead of the close-time proxy
     (the uniform +3h shift preserves chronological order), with the
     close fallback byte-identical for occ-less snapshots and settled
     games still last — occ is an ordering proxy ONLY;
   - NO Kalshi card builder renders a clock time from snapshot data:
     OL.marketGameCard and F.cardHtml contain no "Kickoff" even when a
     game carries an occ, and markets.js has no kickoff rendering (the
     date comes from Kalshi's own sub_title, as before v2.0.11);
   - the shipped snapshots carry a parseable occ (and no "start" key) on
     every game, always before that game's close_time, and K.games
     returns them occurrence-ordered;
   - shipped cache keys for the four changed JS files are v2.0.13. */
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

/* ---- fetcher stores the occurrence, honestly named ---- */
var fetchPy = read("scripts/fetch-kalshi.py");
assert(fetchPy.indexOf("occurrence_datetime") !== -1,
  "fetch-kalshi.py reads occurrence_datetime from Kalshi markets");
assert(/"occ":\s*min\(occs\) if occs else None/.test(fetchPy),
  "fetch-kalshi.py stores the earliest occurrence as the game's occ (null when unstamped)");
assert(!/"start":\s*min\(/.test(fetchPy),
  "fetch-kalshi.py no longer stores occurrence under a 'start' key");

/* ---- K.occMs honesty ---- */
assert(K.occMs({occ: "2026-10-04T16:30:00Z"}) === Date.parse("2026-10-04T16:30:00Z"),
  "occMs parses an ISO occ");
assert(K.occMs({start: "2026-10-04T16:30:00Z"}) === Date.parse("2026-10-04T16:30:00Z"),
  "occMs reads the legacy start key (same occurrence value in old snapshots)");
assert(K.occMs({occ: null}) === null, "occMs(null occ) is null");
assert(K.occMs({}) === null, "occMs(missing occ) is null");
assert(K.occMs({occ: "not-a-date"}) === null, "occMs(garbage) is null, never NaN");
assert(K.occMs(null) === null && K.occMs(undefined) === null && K.occMs(42) === null,
  "occMs(garbage game) is null, never throws");
assert(typeof K.startMs === "undefined", "K.startMs is gone — no API may call occurrence a start");

/* ---- K.games: occ exposed, occurrence order beats the close proxy ---- */
function game(ticker, occ, close, priceA, priceB){
  return { event_ticker: ticker, title: ticker + " game", sub_title: ticker + " (Oct 4)",
    occ: occ,
    markets: [
      { ticker: ticker + "-A", kind: "winner", team: "Alpha", yes_bid: priceA - 1, yes_ask: priceA + 1, last: priceA, close_time: close },
      { ticker: ticker + "-B", kind: "winner", team: "Beta", yes_bid: priceB - 1, yes_ask: priceB + 1, last: priceB, close_time: close }
    ] };
}
var snap = { updated_at: "2026-10-04T15:00:00Z", games: [
  /* close order says EARLYCLOSE first; occurrence order says LATECLOSE first */
  game("LATECLOSE", "2026-10-04T20:00:00Z", "2026-10-06T00:00:00Z", 60, 40),
  game("EARLYCLOSE", "2026-10-04T23:00:00Z", "2026-10-05T00:00:00Z", 55, 45),
  game("NOOCC", null, "2026-10-07T00:00:00Z", 50, 50)
]};
var gs = K.games(snap);
assert(gs.length === 3, "games() keeps all three priced games");
assert(gs[0].ticker === "LATECLOSE" && gs[1].ticker === "EARLYCLOSE",
  "games() sorts by occurrence ahead of the close-time proxy");
assert(gs[0].occ === Date.parse("2026-10-04T20:00:00Z"), "games() exposes occ in ms");
assert(gs[2].ticker === "NOOCC" && gs[2].occ === null,
  "an occ-less game falls back to its close time in the order, occ null");
assert(gs.every(function(g){ return !("start" in g); }),
  "games() exposes no 'start' — occurrence must never wear that name");
var oldSnap = { updated_at: "2026-10-04T15:00:00Z", games: [
  game("B", undefined, "2026-10-06T00:00:00Z", 60, 40),
  game("A", undefined, "2026-10-05T00:00:00Z", 55, 45)
]};
var og = K.games(oldSnap);
assert(og[0].ticker === "A" && og[1].ticker === "B" && og.every(function(g){ return g.occ === null; }),
  "occ-less snapshots keep the exact old close-time ordering");

/* ---- card builders never render a clock time from snapshot data ---- */
var withOcc = gs[0], noOcc = gs[2];
var olHtml = OL.marketGameCard(withOcc, "Sun, Oct 4", null, null, false);
assert(olHtml.indexOf("Kickoff") === -1 && olHtml.indexOf(K.fmtWhen(withOcc.occ)) === -1,
  "odds market card renders no kickoff and no occurrence time, even with an occ present");
assert(olHtml.indexOf("LATECLOSE (Oct 4)") !== -1,
  "odds market card still names the date from Kalshi's sub_title");
var fbHtml = F.cardHtml(withOcc, snap, null);
assert(fbHtml.indexOf("Kickoff") === -1 && fbHtml.indexOf(K.fmtWhen(withOcc.occ)) === -1,
  "predictions fallback card renders no kickoff and no occurrence time");
assert(F.cardHtml(noOcc, snap, null).indexOf("Kickoff") === -1,
  "predictions fallback card stays time-free without an occ too");
var marketsJs = read("js/markets.js");
assert(!/Kickoff/.test(marketsJs) && !/fmtWhen\(g\.(start|occ)\)/.test(marketsJs),
  "markets.js kalshiCard renders no kickoff from snapshot stamps");
var oddsLogicJs = read("js/odds-logic.js");
assert(!/Kickoff/.test(oddsLogicJs), "odds-logic.js contains no Kickoff rendering at all");
var predFbJs = read("js/predictions-fallback.js");
assert(!/Kickoff/.test(predFbJs), "predictions-fallback.js contains no Kickoff rendering at all");

/* ---- shipped snapshots: every game carries an occ, never a "start" ---- */
["data/kalshi-nfl.json", "data/kalshi-mlb.json", "data/kalshi-ncaaf.json"].forEach(function(rel){
  var s = JSON.parse(read(rel));
  assert(Array.isArray(s.games) && s.games.length > 0, rel + " has games");
  assert(s.games.every(function(g){ return K.occMs(g) !== null; }),
    rel + ": every game carries a parseable occ");
  assert(s.games.every(function(g){ return !("start" in g); }),
    rel + ": no game carries a legacy 'start' key after the rename refresh");
  assert(s.games.every(function(g){
    var oc = K.occMs(g);
    return (g.markets || []).every(function(m){
      var c = Date.parse(m.close_time || "");
      return !isFinite(c) || oc < c;
    });
  }), rel + ": every occ precedes its markets' close_time (occ is ordering-only, before close)");
  var ordered = K.games(s).filter(function(g){ return !g.settled; });
  var mono = ordered.every(function(g, i){ return i === 0 || ordered[i - 1].occ <= g.occ; });
  assert(mono, rel + ": K.games returns unsettled games in occurrence order");
});

/* ---- shipped cache keys ---- */
function key(html, file){
  var m = html.match(new RegExp("js/" + file.replace(".", "\\.") + "\\?v=([\\d.]+)"));
  return m && m[1];
}
assert(key(read("markets.html"), "kalshi-logic.js") === "2.0.13", "markets.html kalshi-logic key is v2.0.13");
assert(key(read("markets.html"), "markets.js") === "2.0.13", "markets.html markets.js key is v2.0.13");
assert(key(read("odds.html"), "kalshi-logic.js") === "2.0.13", "odds.html kalshi-logic key is v2.0.13");
assert(key(read("odds.html"), "odds-logic.js") === "2.0.13", "odds.html odds-logic key is v2.0.13");
assert(key(read("matchup.html"), "odds-logic.js") === "2.0.13", "matchup.html odds-logic key is v2.0.13");
assert(key(read("predictions.html"), "kalshi-logic.js") === "2.0.13", "predictions.html kalshi-logic key is v2.0.13");
assert(key(read("predictions.html"), "predictions-fallback.js") === "2.0.13", "predictions.html predictions-fallback key is v2.0.13");

if(failures){ console.error(failures + " failure(s)"); process.exit(1); }
console.log("test-kalshi-occurrence: all assertions passed");
