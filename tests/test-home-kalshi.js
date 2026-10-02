/* Unit tests for the Kalshi crowd-price annotation in js/home-strip.js
   (v1.120.0 — "Today's games" strip carries the snapshot's real-money win
   probability on matched NFL rows; v1.138.0 — MLB rows ride the MLB
   snapshot too, with series-game date disambiguation).
   Verifies: abbreviation-pair matching (unordered, JAC/WAS alias handling),
   away/home price assignment from ticker suffixes, midpoint price math,
   stale snapshots annotate nothing, malformed snapshots never throw,
   unmatched rows and snapshot-less leagues pass through untouched, input
   rows are never mutated, duplicate-pair series games resolve by game day
   (a Game 2 row never wears Game 1's prices; no date match means no
   annotation), and snapWhen formats a readable stamp. */
"use strict";
var HS = require("../js/home-strip.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function row(league, away, home, date){
  var r = {id: "r", league: league, state: "pre",
           away: {team: {abbreviation: away}}, home: {team: {abbreviation: home}}};
  if(date) r.date = date;
  return r;
}
function mk(o){
  o = o || {};
  return {ticker: o.ticker || "KX-XXX", team: o.team || "X", kind: o.kind || "winner",
          yes_bid: o.bid, yes_ask: o.ask, last: o.last};
}
/* Tonight's real fixture shape: PIT@CLE, CLE 42/43, PIT 57/58. */
function pitcle(){
  return {event_ticker: "KXNFLGAME-26OCT01PITCLE", title: "PIT Steelers vs CLE Browns",
          sub_title: "PIT vs CLE (Oct 1)",
          markets: [mk({ticker: "KXNFLGAME-26OCT01PITCLE-CLE", team: "Cleveland", bid: 42, ask: 43, last: 43}),
                    mk({ticker: "KXNFLGAME-26OCT01PITCLE-PIT", team: "Pittsburgh", bid: 57, ask: 58, last: 58})]};
}
function tenjax(){
  return {event_ticker: "KXNFLGAME-26OCT04TENJAC", title: "TEN Titans vs JAC Jaguars",
          sub_title: "TEN vs JAC (Oct 4)",
          markets: [mk({ticker: "KXNFLGAME-26OCT04TENJAC-JAC", team: "Jacksonville", bid: 60, ask: 62}),
                    mk({ticker: "KXNFLGAME-26OCT04TENJAC-TEN", team: "Tennessee", bid: 38, ask: 40})]};
}
/* Tonight's real MLB fixture shape: PHI@ATL NLDS Game 3, ATL 95/96, PHI 4/5. */
function phiatl(){
  return {event_ticker: "KXMLBGAME-26OCT011400PHIATL", title: "Game 3: Philadelphia vs Atlanta",
          sub_title: "PHI vs ATL (Oct 1)",
          markets: [mk({ticker: "KXMLBGAME-26OCT011400PHIATL-ATL", team: "Atlanta", bid: 95, ask: 96, last: 96}),
                    mk({ticker: "KXMLBGAME-26OCT011400PHIATL-PHI", team: "Philadelphia", bid: 4, ask: 5, last: 5})]};
}
/* Same pair, two series games: SD@MIL Game 1 (Oct 3) and Game 2 (Oct 4). */
function sdmilG1(){
  return {event_ticker: "KXMLBGAME-26OCT031830SDMIL", title: "Game 1: San Diego vs Milwaukee",
          sub_title: "SD vs MIL (Oct 3)",
          markets: [mk({ticker: "KXMLBGAME-26OCT031830SDMIL-MIL", team: "Milwaukee", bid: 65, ask: 67}),
                    mk({ticker: "KXMLBGAME-26OCT031830SDMIL-SD", team: "San Diego", bid: 34, ask: 35})]};
}
function sdmilG2(){
  return {event_ticker: "KXMLBGAME-26OCT041830SDMIL", title: "Game 2: San Diego vs Milwaukee",
          sub_title: "SD vs MIL (Oct 4)",
          markets: [mk({ticker: "KXMLBGAME-26OCT041830SDMIL-MIL", team: "Milwaukee", bid: 70, ask: 72}),
                    mk({ticker: "KXMLBGAME-26OCT041830SDMIL-SD", team: "San Diego", bid: 29, ask: 31})]};
}
function freshSnap(games){
  return {updated_at: new Date(Date.now() - 30*60000).toISOString(), games: games};
}
function snaps(nflGames, mlbGames){
  return {NFL: freshSnap(nflGames || []), MLB: freshSnap(mlbGames || [])};
}

/* --- kalshiPair: abbreviation extraction --- */
assert(HS.kalshiPair(pitcle()).join(",") === "CLE,PIT",
       "kalshiPair parses sub_title into a sorted normalized pair");
assert(HS.kalshiPair(tenjax()).join(",") === "JAX,TEN",
       "kalshiPair normalizes Kalshi's JAC to ESPN's JAX");
assert(HS.kalshiPair({event_ticker: "KXNFLGAME-26OCT04WASDAL", title: "WAS Commanders vs DAL Cowboys"})
       .join(",") === "DAL,WSH",
       "kalshiPair falls back to the full title and normalizes WAS->WSH");
assert(HS.kalshiPair({event_ticker: "KXNFLGAME-26OCT01PITCLE"}).join(",") === "CLE,PIT",
       "kalshiPair falls back to the event ticker tail");
assert(HS.kalshiPair({title: "Division winner"}) === null, "kalshiPair returns null without a pair");
assert(HS.kalshiPair(null) === null, "kalshiPair tolerates null");
assert(HS.normKalshiAbbr("jac") === "JAX" && HS.normKalshiAbbr("BUF") === "BUF",
       "normKalshiAbbr is case-insensitive and passes through the rest");

/* --- kalshiPrice / kalshiSideAbbr --- */
assert(HS.kalshiPrice({yes_bid: 42, yes_ask: 43}) === 43, "price is the rounded bid/ask midpoint");
assert(HS.kalshiPrice({yes_bid: "", yes_ask: "", last: 61}) === 61, "price falls back to the last trade");
assert(HS.kalshiPrice({yes_bid: null, yes_ask: null, last: null}) === null, "price is null when unpriced");
assert(HS.kalshiSideAbbr({ticker: "KXNFLGAME-26OCT01PITCLE-CLE"}) === "CLE",
       "side abbreviation comes from the ticker suffix");
assert(HS.kalshiSideAbbr({ticker: "KXNFLGAME-26OCT04TENJAC-JAC"}) === "JAX",
       "side abbreviation normalizes JAC->JAX");

/* --- snapStale --- */
var now = Date.now();
assert(HS.snapStale(new Date(now - 30*60000).toISOString(), now) === false, "30-minute snapshot is fresh");
assert(HS.snapStale(new Date(now - 7*3600000).toISOString(), now) === true, "7-hour snapshot is stale");
assert(HS.snapStale("garbage", now) === true, "unparseable stamp counts as stale");

/* --- kalshiDate: ticker -> Eastern game day --- */
assert(HS.kalshiDate({event_ticker: "KXMLBGAME-26OCT011400PHIATL"}) === "2026-10-01",
       "kalshiDate reads the YYMONDD game day from an MLB ticker");
assert(HS.kalshiDate({event_ticker: "KXNFLGAME-26OCT04TENJAC"}) === "2026-10-04",
       "kalshiDate reads the YYMONDD game day from an NFL ticker");
assert(HS.kalshiDate({event_ticker: "KXNFLGAME-26SEP27ARISF"}) === "2026-09-27",
       "kalshiDate maps SEP correctly");
assert(HS.kalshiDate({event_ticker: "DIVISION-WINNER"}) === null, "kalshiDate is null without a date segment");
assert(HS.kalshiDate(null) === null, "kalshiDate tolerates null");

/* --- rowGameDay: row date -> Eastern game day --- */
assert(HS.rowGameDay({date: "2026-10-01T23:00:00Z"}) === "2026-10-01",
       "rowGameDay keeps an evening-ET game on its local day");
assert(HS.rowGameDay({date: "2026-10-04T17:00:00Z"}) === "2026-10-04",
       "rowGameDay keeps an afternoon-ET game on its local day");
assert(HS.rowGameDay({}) === null, "rowGameDay is null without a date");
assert(HS.rowGameDay({date: "garbage"}) === null, "rowGameDay is null for garbage dates");
assert(HS.rowGameDay(null) === null, "rowGameDay tolerates null");

/* --- withKalshi: the happy path --- */
var r0 = row("NFL", "PIT", "CLE");
var out = HS.withKalshi([r0], snaps([pitcle()]), now);
assert(out.length === 1 && out[0].kp && out[0].kp.aAbbr === "PIT" && out[0].kp.aPct === 58 &&
       out[0].kp.hAbbr === "CLE" && out[0].kp.hPct === 43,
       "matched NFL row gets away/home crowd prices from the snapshot — got "+JSON.stringify(out[0].kp));
assert(!("kp" in r0), "withKalshi never mutates the input rows");

/* order of ESPN sides doesn't matter: home/away reversed still matches */
var rev = HS.withKalshi([row("NFL", "CLE", "PIT")], snaps([pitcle()]), now)[0];
assert(rev.kp && rev.kp.aAbbr === "CLE" && rev.kp.aPct === 43 && rev.kp.hAbbr === "PIT" && rev.kp.hPct === 58,
       "reversed sides still match, prices follow the actual sides");

/* JAC alias end to end */
var jx = HS.withKalshi([row("NFL", "TEN", "JAX")], snaps([tenjax()]), now)[0];
assert(jx.kp && jx.kp.aPct === 39 && jx.kp.hAbbr === "JAX" && jx.kp.hPct === 61,
       "ESPN's JAX matches Kalshi's JAC listing");

/* MLB happy path: the same machinery, the MLB snapshot */
var m0 = row("MLB", "PHI", "ATL", "2026-10-01T23:00:00Z");
var mout = HS.withKalshi([m0], snaps([pitcle()], [phiatl()]), now)[0];
assert(mout.kp && mout.kp.aAbbr === "PHI" && mout.kp.aPct === 5 &&
       mout.kp.hAbbr === "ATL" && mout.kp.hPct === 96,
       "matched MLB row gets crowd prices from the MLB snapshot — got "+JSON.stringify(mout.kp));
assert(!("kp" in m0), "withKalshi never mutates MLB input rows");

/* old single-snapshot call shape still means the NFL snapshot */
var legacy = HS.withKalshi([row("NFL", "PIT", "CLE")], freshSnap([pitcle()]), now)[0];
assert(legacy.kp && legacy.kp.aPct === 58, "bare-snapshot call keeps annotating NFL rows");

/* --- withKalshi: series-game date disambiguation --- */
var series = snaps([], [sdmilG1(), sdmilG2()]);
var g1 = HS.withKalshi([row("MLB", "SD", "MIL", "2026-10-03T22:30:00Z")], series, now)[0];
assert(g1.kp && g1.kp.hPct === 66 && g1.kp.aPct === 35,
       "Game 1 row wears Game 1 prices, not Game 2's — got "+JSON.stringify(g1.kp));
var g2 = HS.withKalshi([row("MLB", "SD", "MIL", "2026-10-04T22:30:00Z")], series, now)[0];
assert(g2.kp && g2.kp.hPct === 71 && g2.kp.aPct === 30,
       "Game 2 row wears Game 2 prices, not Game 1's — got "+JSON.stringify(g2.kp));
var nodate = HS.withKalshi([row("MLB", "SD", "MIL")], series, now)[0];
assert(!nodate.kp, "ambiguous pair + dateless row -> no annotation, never a guess");
var wrongday = HS.withKalshi([row("MLB", "SD", "MIL", "2026-10-05T22:30:00Z")], series, now)[0];
assert(!wrongday.kp, "ambiguous pair + unmatched game day -> no annotation");

/* --- withKalshi: the honest negatives --- */
var noMlbSnap = HS.withKalshi([row("MLB", "PHI", "ATL", "2026-10-01T23:00:00Z")],
                               {NFL: freshSnap([pitcle()])}, now)[0];
assert(!noMlbSnap.kp, "MLB rows stay clean when the MLB snapshot is missing");
var nba = HS.withKalshi([row("NBA", "LAL", "BOS")], snaps([pitcle()], [phiatl()]), now)[0];
assert(!nba.kp, "leagues without a snapshot are never annotated");
var nomatch = HS.withKalshi([row("NFL", "KC", "BUF")], snaps([pitcle()]), now)[0];
assert(!nomatch.kp, "unmatched NFL rows pass through without prices — never guessed");
var stale = HS.withKalshi([row("NFL", "PIT", "CLE")],
  {NFL: {updated_at: new Date(now - 7*3600000).toISOString(), games: [pitcle()]}}, now)[0];
assert(!stale.kp, "a stale NFL snapshot annotates nothing — never presented as fresh");
var staleMlb = HS.withKalshi([row("MLB", "PHI", "ATL", "2026-10-01T23:00:00Z")],
  {MLB: {updated_at: new Date(now - 7*3600000).toISOString(), games: [phiatl()]}}, now)[0];
assert(!staleMlb.kp, "a stale MLB snapshot annotates nothing either");
[null, {}, {games: null}, {updated_at: new Date(now).toISOString()}].forEach(function(s, i){
  var o = HS.withKalshi([row("NFL", "PIT", "CLE")], s, now);
  assert(o.length === 1 && !o[0].kp, "malformed snapshot #"+i+" passes rows through, never throws");
});
assert(HS.withKalshi(null, snaps([pitcle()]), now).length === 0, "null rows -> empty array");

/* game with an unpriced side */
var half = pitcle();
half.markets = [mk({ticker: "KXNFLGAME-26OCT01PITCLE-CLE", team: "Cleveland", bid: 42, ask: 43})];
var hp = HS.withKalshi([row("NFL", "PIT", "CLE")], snaps([half]), now)[0];
assert(!hp.kp, "a game with an unpriced side is not annotated");

/* "other" markets don't create phantom sides */
var oth = pitcle();
oth.markets.push(mk({ticker: "KXNFLGAME-26OCT01PITCLE-OTHER", team: "Other", kind: "other", bid: 5, ask: 6}));
var oo = HS.withKalshi([row("NFL", "PIT", "CLE")], snaps([oth]), now)[0];
assert(oo.kp && oo.kp.aPct === 58 && oo.kp.hPct === 43, "'other' markets never leak into the prices");

/* --- snapWhen --- */
var w = HS.snapWhen(new Date(now).toISOString());
assert(typeof w === "string" && w.indexOf("·") > 0, "snapWhen returns a readable stamp — got "+w);
assert(HS.snapWhen("garbage") === "", "snapWhen returns empty for garbage");

console.log(failures ? "\n"+failures+" FAILURES" : "\nALL HOME-KALSHI TESTS PASSED");
process.exit(failures ? 1 : 0);
