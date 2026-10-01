/* Unit tests for the Kalshi crowd-price annotation in js/home-strip.js
   (v1.120.0 — "Today's games" strip carries the snapshot's real-money win
   probability on matched NFL rows).
   Verifies: abbreviation-pair matching (unordered, JAC/WAS alias handling),
   away/home price assignment from ticker suffixes, midpoint price math,
   stale snapshots annotate nothing, malformed snapshots never throw,
   non-NFL and unmatched rows pass through untouched, input rows are never
   mutated, and snapWhen formats a readable stamp. */
"use strict";
var HS = require("../js/home-strip.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function row(league, away, home){
  return {id: "r", league: league, state: "pre",
          away: {team: {abbreviation: away}}, home: {team: {abbreviation: home}}};
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
function freshSnap(games){
  return {updated_at: new Date(Date.now() - 30*60000).toISOString(), games: games};
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

/* --- withKalshi: the happy path --- */
var r0 = row("NFL", "PIT", "CLE");
var out = HS.withKalshi([r0], freshSnap([pitcle()]), now);
assert(out.length === 1 && out[0].kp && out[0].kp.aAbbr === "PIT" && out[0].kp.aPct === 58 &&
       out[0].kp.hAbbr === "CLE" && out[0].kp.hPct === 43,
       "matched NFL row gets away/home crowd prices from the snapshot — got "+JSON.stringify(out[0].kp));
assert(!("kp" in r0), "withKalshi never mutates the input rows");

/* order of ESPN sides doesn't matter: home/away reversed still matches */
var rev = HS.withKalshi([row("NFL", "CLE", "PIT")], freshSnap([pitcle()]), now)[0];
assert(rev.kp && rev.kp.aAbbr === "CLE" && rev.kp.aPct === 43 && rev.kp.hAbbr === "PIT" && rev.kp.hPct === 58,
       "reversed sides still match, prices follow the actual sides");

/* JAC alias end to end */
var jx = HS.withKalshi([row("NFL", "TEN", "JAX")], freshSnap([tenjax()]), now)[0];
assert(jx.kp && jx.kp.aPct === 39 && jx.kp.hAbbr === "JAX" && jx.kp.hPct === 61,
       "ESPN's JAX matches Kalshi's JAC listing");

/* --- withKalshi: the honest negatives --- */
var mlb = HS.withKalshi([row("MLB", "NYY", "TB")], freshSnap([pitcle()]), now)[0];
assert(!mlb.kp, "non-NFL rows are never annotated, even when prices exist");
var nomatch = HS.withKalshi([row("NFL", "KC", "BUF")], freshSnap([pitcle()]), now)[0];
assert(!nomatch.kp, "unmatched NFL rows pass through without prices — never guessed");
var stale = HS.withKalshi([row("NFL", "PIT", "CLE")],
  {updated_at: new Date(now - 7*3600000).toISOString(), games: [pitcle()]}, now)[0];
assert(!stale.kp, "a stale snapshot annotates nothing — never presented as fresh");
[null, {}, {games: null}, {updated_at: new Date(now).toISOString()}].forEach(function(s, i){
  var o = HS.withKalshi([row("NFL", "PIT", "CLE")], s, now);
  assert(o.length === 1 && !o[0].kp, "malformed snapshot #"+i+" passes rows through, never throws");
});
assert(HS.withKalshi(null, freshSnap([pitcle()]), now).length === 0, "null rows -> empty array");

/* game with an unpriced side */
var half = pitcle();
half.markets = [mk({ticker: "KXNFLGAME-26OCT01PITCLE-CLE", team: "Cleveland", bid: 42, ask: 43})];
var hp = HS.withKalshi([row("NFL", "PIT", "CLE")], freshSnap([half]), now)[0];
assert(!hp.kp, "a game with an unpriced side is not annotated");

/* "other" markets don't create phantom sides */
var oth = pitcle();
oth.markets.push(mk({ticker: "KXNFLGAME-26OCT01PITCLE-OTHER", team: "Other", kind: "other", bid: 5, ask: 6}));
var oo = HS.withKalshi([row("NFL", "PIT", "CLE")], freshSnap([oth]), now)[0];
assert(oo.kp && oo.kp.aPct === 58 && oo.kp.hPct === 43, "'other' markets never leak into the prices");

/* --- snapWhen --- */
var w = HS.snapWhen(new Date(now).toISOString());
assert(typeof w === "string" && w.indexOf("·") > 0, "snapWhen returns a readable stamp — got "+w);
assert(HS.snapWhen("garbage") === "", "snapWhen returns empty for garbage");

console.log(failures ? "\n"+failures+" FAILURES" : "\nALL HOME-KALSHI TESTS PASSED");
process.exit(failures ? 1 : 0);
