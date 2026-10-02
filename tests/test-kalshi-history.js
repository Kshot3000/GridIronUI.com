/* Node tests for the Kalshi price-history feature (shipped v1.141.0):
   - K.appendHistory: the node-testable spec of the fetcher's history step
     (scripts/fetch-kalshi.py:append_history must stay in lockstep) — append
     shape, 168-point cap (oldest dropped), identical consecutive prices DO
     append (every point is one honest observation), stale carry-forward
     games add nothing, "other"/tickerless/unpriced markets skipped,
     missing updated_at -> no points, input not mutated, garbage in -> clean.
   - K.gameHist: per-game series extraction via game.tickers.
   - K.sparkPath: geometry (scaling, flat line, two points) and the honest
     fallback (null for <2 valid points — one dot is not a trend).
   - K.sparkCaption: honest labeling — never "live", always the snapshot
     count and snapshot time; accumulating note under 2 points.
   Run: node tests/test-kalshi-history.js */
"use strict";
var K = require("../js/kalshi-logic.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
function mkMarket(ticker, team, bid, ask, last, kind){
  return {ticker: ticker, kind: kind || "winner", team: team,
          yes_bid: bid, yes_ask: ask, last: last};
}
function mkSnap(ts, markets, stale){
  return {updated_at: ts, games: [{event_ticker: "EV1", title: "A vs B", sub_title: "A vs B",
                                  stale: !!stale, markets: markets}]};
}
var T1 = "2026-10-01T20:00:00Z", T2 = "2026-10-01T21:00:00Z";

/* ---- K.appendHistory ---- */
var h1 = K.appendHistory({}, mkSnap(T1, [mkMarket("M-A", "Team A", 60, 62, null),
                                         mkMarket("M-B", "Team B", 38, 40, null)]));
ok("append shape {ticker:[{t,yes}]}",
   h1["M-A"] && h1["M-A"].length === 1 && h1["M-A"][0].t === T1 && h1["M-A"][0].yes === 61 &&
   h1["M-B"][0].yes === 39, JSON.stringify(h1));
ok("price uses midpoint semantics (60/62 -> 61)", h1["M-A"][0].yes === 61);

var h2 = K.appendHistory(h1, mkSnap(T2, [mkMarket("M-A", "Team A", 64, 66, null),
                                         mkMarket("M-B", "Team B", 36, 38, null)]));
ok("second snapshot appends a second point",
   h2["M-A"].length === 2 && h2["M-A"][1].t === T2 && h2["M-A"][1].yes === 65,
   JSON.stringify(h2["M-A"]));
ok("does not mutate the input map", h1["M-A"].length === 1);

/* identical consecutive prices still append (pinned behavior) */
var h3 = K.appendHistory(h2, mkSnap("2026-10-01T22:00:00Z",
        [mkMarket("M-A", "Team A", 64, 66, null), mkMarket("M-B", "Team B", 36, 38, null)]));
ok("identical price appends rather than deduping",
   h3["M-A"].length === 3 && h3["M-A"][2].yes === 65, JSON.stringify(h3["M-A"]));

/* cap: 168 points, oldest dropped */
var hc = {};
for(var i = 0; i < 170; i++){
  hc = K.appendHistory(hc, mkSnap("2026-10-01T" + String(1000 + i) + "Z",
        [mkMarket("M-C", "Team C", 50, 52, null)]));
}
ok("cap at 168 points", hc["M-C"].length === 168, hc["M-C"].length);
ok("cap drops the oldest points",
   hc["M-C"][0].t === "2026-10-01T1002Z", JSON.stringify(hc["M-C"][0]));
ok("cap keeps the newest point",
   hc["M-C"][167].t === "2026-10-01T1169Z", JSON.stringify(hc["M-C"][167]));

/* skip rules */
var hs = K.appendHistory({}, mkSnap(T1, [
  mkMarket("M-S", "Team S", 60, 62, null),          /* kept */
  mkMarket("M-O", "Other M", 10, 12, null, "other"), /* "other" skipped */
  {ticker: "", kind: "winner", team: "No Tick", yes_bid: 50, yes_ask: 52, last: null}, /* tickerless */
  {ticker: "M-U", kind: "winner", team: "Unpriced", yes_bid: null, yes_ask: null, last: null} /* unpriced */
], true)); /* carried-forward stale game */
ok("stale carry-forward adds no points", Object.keys(hs).length === 0, JSON.stringify(hs));
var hs2 = K.appendHistory({}, mkSnap(T1, [
  mkMarket("M-S", "Team S", 60, 62, null),
  mkMarket("M-O", "Other M", 10, 12, null, "other"),
  {ticker: "", kind: "winner", team: "No Tick", yes_bid: 50, yes_ask: 52, last: null},
  {ticker: "M-U", kind: "winner", team: "Unpriced", yes_bid: null, yes_ask: null, last: null}
]));
ok("only the priced winner market is kept", Object.keys(hs2).length === 1 && !!hs2["M-S"],
   JSON.stringify(Object.keys(hs2)));

var hn = K.appendHistory({}, mkSnap("", [mkMarket("M-A", "Team A", 60, 62, null)]));
ok("missing updated_at -> no points invented", Object.keys(hn).length === 0);
var hg = K.appendHistory("junk", mkSnap(T1, [mkMarket("M-A", "Team A", 60, 62, null)]));
ok("garbage history map -> clean map out", !!hg["M-A"] && hg["M-A"].length === 1);
var hg2 = K.appendHistory({weird: "not-an-array"}, mkSnap(T1, [mkMarket("M-A", "Team A", 60, 62, null)]));
ok("non-array series entry ignored", !hg2.weird && !!hg2["M-A"]);

/* ---- K.gameHist ---- */
var game = {teams: [{name: "Team A"}, {name: "Team B"}],
            tickers: {"Team A": "M-A", "Team B": "M-B"}};
var gh = K.gameHist(game, {"M-A": [{t: T1, yes: 61}, {t: T2, yes: 65}, {t: "", yes: 70}, {t: T2, yes: "x"}],
                           "M-B": [{t: T1, yes: 39}]});
ok("gameHist keys by team name", gh["Team A"].length === 2 && gh["Team B"].length === 1,
   JSON.stringify(gh));
ok("gameHist drops garbage points, rounds prices",
   gh["Team A"][0].t === T1 && gh["Team A"][0].yes === 61);
ok("gameHist handles missing tickers/history", JSON.stringify(K.gameHist({teams: [{name: "X"}]}, {})) === '{"X":[]}');

/* ---- K.sparkPath ---- */
ok("fewer than 2 points -> null", K.sparkPath([], 600, 120) === null &&
   K.sparkPath([55], 600, 120) === null && K.sparkPath([null, 55], 600, 120) === null &&
   K.sparkPath(null, 600, 120) === null);

var r = K.sparkPath([1, 2, 3], 100, 40);
ok("rising geometry", r && JSON.stringify(r.pts) === JSON.stringify([[3,37],[50,20],[97,3]]),
   r && JSON.stringify(r.pts));
ok("min/max reported", r && r.min === 1 && r.max === 3);

var f = K.sparkPath([55, 55, 55], 100, 40);
ok("flat series -> mid-height line",
   f && JSON.stringify(f.pts) === JSON.stringify([[3,20],[50,20],[97,20]]),
   f && JSON.stringify(f.pts));

var two = K.sparkPath([64, 58], 600, 120);
ok("two-point path", two && two.pts.length === 2 &&
   two.pts[0][0] === 3 && two.pts[1][0] === 597 &&
   two.pts[0][1] === 3 && two.pts[1][1] === 117, two && JSON.stringify(two.pts));

/* ---- K.sparkCaption ---- */
var cap0 = K.sparkCaption(0, T1), cap1 = K.sparkCaption(1, T1), cap5 = K.sparkCaption(5, T1);
ok("0 points -> accumulating note", /accumulating/.test(cap0) && /no snapshots/.test(cap0), cap0);
ok("1 point -> accumulating note", /accumulating/.test(cap1) && /1 snapshot[^s]/.test(cap1), cap1);
ok("5 points -> honest history label",
   /Kalshi price history · 5 snapshots · snapshot /.test(cap5), cap5);
ok("caption never says live", [cap0, cap1, cap5].every(function(c){ return !/live/i.test(c); }));
ok("caption carries the snapshot time", cap5.indexOf("Oct 1") !== -1, cap5);

console.log(fails ? "\n" + fails + " FAILURES" : "\nALL KALSHI-HISTORY TESTS PASSED");
process.exit(fails ? 1 : 0);
