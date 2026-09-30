/* GridIronUI v1.96.0 — MLB postseason Kalshi matching in js/disagree-logic.js.
   Kalshi's MLB series lists the same team pair several times (Wild Card Game
   1, Game 2, ...), so matches() takes a `league` arg (default "nfl") and,
   when several snapshot games share a pair, picks the one whose game day
   equals the Polymarket event's Eastern date — never the wrong game of a
   series. v1.96.0: a PM event with no same-day Kalshi entry (e.g. Game 3,
   when the snapshot only covers Game 2) is dropped, never borrows another
   game's prices. Run: node tests/test-disagree-mlb.js */
"use strict";
var D = require("../js/disagree-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

var dir = {mlb: [
  {abbr:"BOS", displayName:"Boston Red Sox",    shortDisplayName:"Red Sox"},
  {abbr:"NYY", displayName:"New York Yankees",  shortDisplayName:"Yankees"},
  {abbr:"CHC", displayName:"Chicago Cubs",      shortDisplayName:"Cubs"},
  {abbr:"SD",  displayName:"San Diego Padres",  shortDisplayName:"Padres"},
  {abbr:"CHW", displayName:"Chicago White Sox", shortDisplayName:"White Sox"},
  {abbr:"HOU", displayName:"Houston Astros",    shortDisplayName:"Astros"}
], nfl: [
  {abbr:"PHI", displayName:"Philadelphia Eagles", shortDisplayName:"Eagles"},
  {abbr:"CHI", displayName:"Chicago Bears",       shortDisplayName:"Bears"}
]};
function teamFind(d, league, q){
  var list = (d||{})[league] || [];
  q = String(q==null?"":q).trim();
  if(!q || !list.length) return null;
  var qu = q.toUpperCase(), ql = q.toLowerCase();
  for(var i=0;i<list.length;i++) if(list[i].abbr === qu) return list[i];
  for(var j=0;j<list.length;j++)
    if(list[j].displayName.toLowerCase() === ql || list[j].shortDisplayName.toLowerCase() === ql) return list[j];
  return null;
}
function ml(outcomes, prices, volume){
  return {sportsMarketType:"moneyline", closed:false, active:true,
    outcomes:JSON.stringify(outcomes), outcomePrices:JSON.stringify(prices), volume:volume};
}
/* Kalshi game entry shaped like the snapshot: event_ticker, sub_title,
   and winner markets whose tickers end in the team abbreviation. */
function kg(ticker, sub, aAbbr, aBid, aAsk, bAbbr, bBid, bAsk){
  return {event_ticker: ticker, sub_title: sub, markets: [
    {ticker: ticker+"-"+aAbbr, title: aAbbr+" wins", kind: "winner", yes_bid: aBid, yes_ask: aAsk},
    {ticker: ticker+"-"+bAbbr, title: bAbbr+" wins", kind: "winner", yes_bid: bBid, yes_ask: bAsk}
  ]};
}
/* prices in the snapshot are whole cents after pct(); feed them as cents */
var snapGames = [
  kg("KXMLBGAME-26SEP292000BOSNYY", "BOS vs NYY (Sep 29)", "BOS", 30, 31, "NYY", 69, 70),
  kg("KXMLBGAME-26SEP302000BOSNYY", "BOS vs NYY (Sep 30)", "BOS", 46, 47, "NYY", 53, 54)
];
function pmEv(title, startTime, outcomes, prices){
  return {title: title, startTime: startTime,
    markets: [ml(outcomes, prices, 100000)]};
}

/* ---- date helpers ---- */
assert(D.kalshiDate({event_ticker:"KXMLBGAME-26SEP292000BOSNYY"}) === "2026-09-29",
  "kalshiDate parses the MLB ticker game day");
assert(D.kalshiDate({event_ticker:"KXNFLGAME-26SEP27ARISF"}) === "2026-09-27",
  "kalshiDate parses the NFL ticker game day");
assert(D.kalshiDate({event_ticker:"KXNFLGAME-ARISF"}) === null,
  "kalshiDate returns null when the ticker carries no date");
assert(D.kalshiDate({}) === null, "kalshiDate returns null for a missing ticker");
assert(D.pmGameDay({startTime:"2026-09-30T00:00:00Z"}) === "2026-09-29",
  "pmGameDay converts the 8pm-ET startTime back to the Sept 29 game day");
assert(D.pmGameDay({startTime:"2026-10-01T00:00:00Z"}) === "2026-09-30",
  "pmGameDay converts Game 2's startTime to Sept 30");
assert(D.pmGameDay({}) === null, "pmGameDay returns null without a startTime");

/* ---- Kalshi/ESPN abbreviation aliases ---- */
assert(D.normAbbr("CWS") === "CHW",
  "CWS (Kalshi) normalizes to CHW (ESPN directory)");
assert(D.normAbbr("NYY") === "NYY", "matching abbreviations pass through");
var soxSnap = [kg("KXMLBGAME-26SEP301700CWSHOU", "CWS vs HOU (Sep 30)", "CWS", 40, 41, "HOU", 59, 60)];
var soxEv = pmEv("Chicago White Sox vs. Houston Astros", "2026-09-30T21:00:00Z",
  ["Chicago White Sox","Houston Astros"], [0.40, 0.60]);
var ms = D.matches([soxEv], soxSnap, dir, teamFind, "mlb");
assert(ms.length === 1 && ms[0].abbrA === "CHW" && ms[0].abbrB === "HOU" &&
       ms[0].kalshiA === 41 && ms[0].kalshiB === 60,
  "White Sox game matches through the CWS->CHW alias with aligned prices");

/* ---- series disambiguation: Game 1 matches Game 1, Game 2 matches Game 2 ---- */
var g1 = pmEv("Boston Red Sox vs. New York Yankees", "2026-09-30T00:00:00Z",
  ["Boston Red Sox","New York Yankees"], [0.30, 0.70]);
var g2 = pmEv("Boston Red Sox vs. New York Yankees", "2026-10-01T00:00:00Z",
  ["Boston Red Sox","New York Yankees"], [0.45, 0.55]);
var m1 = D.matches([g1], snapGames, dir, teamFind, "mlb");
assert(m1.length === 1, "Game 1 matches exactly one Kalshi entry");
assert(m1[0].kalshiA === 31 && m1[0].kalshiB === 70,
  "Game 1 gets Game 1's prices (BOS 31c, NYY 70c midpoints) — not Game 2's");
assert(m1[0].pmA === 30 && m1[0].pmB === 70, "PM prices aligned to side A (Red Sox)");
var m2 = D.matches([g2], snapGames, dir, teamFind, "mlb");
assert(m2.length === 1 && m2[0].kalshiA === 47 && m2[0].kalshiB === 54,
  "Game 2 gets Game 2's prices (BOS 47c, NYY 54c) — nearest-day disambiguation works");

/* flipped order: Kalshi lists NYY first via sub_title "NYY vs BOS" */
var flipSnap = [kg("KXMLBGAME-26SEP292000BOSNYY", "NYY vs BOS (Sep 29)", "BOS", 30, 31, "NYY", 69, 70)];
var mf = D.matches([g1], flipSnap, dir, teamFind, "mlb");
assert(mf.length === 1 && mf[0].kalshiA === 31 && mf[0].kalshiB === 70,
  "flipped Kalshi side order still aligns prices to the PM side order");

/* ---- league selection ---- */
var nflEv = {title:"Philadelphia Eagles vs. Chicago Bears", startTime:"2026-09-28T17:00:00Z",
  markets:[ml(["Philadelphia Eagles","Chicago Bears"],[0.65,0.35],100)]};
var nflSnap = [kg("KXNFLGAME-26SEP28PHICHI","PHI vs CHI (Sep 28)","PHI",65,66,"CHI",34,35)];
var mn = D.matches([nflEv], nflSnap, dir, teamFind, "nfl");
assert(mn.length === 1 && mn[0].kalshiA === 66 && mn[0].pmA === 65,
  "explicit 'nfl' league still matches");
var md = D.matches([nflEv], nflSnap, dir, teamFind);
assert(md.length === 1 && md[0].kalshiA === 66,
  "omitted league defaults to 'nfl' (backward compatible)");
var wrong = D.matches([nflEv], nflSnap, dir, teamFind, "mlb");
assert(wrong.length === 0, "NFL teams don't match under the mlb directory");

/* ---- unmatchable is dropped, never guessed ---- */
var other = pmEv("Chicago Cubs vs. San Diego Padres", "2026-09-30T02:00:00Z",
  ["Chicago Cubs","San Diego Padres"], [0.44, 0.56]);
assert(D.matches([other], snapGames, dir, teamFind, "mlb").length === 0,
  "a pair with no Kalshi entry is dropped");
var unknown = pmEv("Boston Red Sox vs. Los Angeles Dodgers", "2026-09-30T00:00:00Z",
  ["Boston Red Sox","Los Angeles Dodgers"], [0.5, 0.5]);
assert(D.matches([unknown], snapGames, dir, teamFind, "mlb").length === 0,
  "a team missing from the directory is dropped");

/* ---- a series game with no same-day Kalshi entry is dropped, never guessed ---- */
/* v1.96.0: Game 3 events (Oct 1) must not borrow Game 2's Kalshi prices */
var g3 = pmEv("Boston Red Sox vs. New York Yankees", "2026-10-02T00:00:00Z",
  ["Boston Red Sox","New York Yankees"], [0.48, 0.52]);
assert(D.pmGameDay(g3) === "2026-10-01", "Game 3's startTime maps to the Oct 1 game day");
var m3 = D.matches([g3], snapGames, dir, teamFind, "mlb");
assert(m3.length === 0,
  "a Game 3 event with no Oct 1 Kalshi entry is dropped — never borrows Game 2's prices");
/* both dates present but different: g1 (Sep 29) against a Game-2-only snapshot */
var g1only2 = pmEv("Boston Red Sox vs. New York Yankees", "2026-09-30T00:00:00Z",
  ["Boston Red Sox","New York Yankees"], [0.30, 0.70]);
assert(D.matches([g1only2], [snapGames[1]], dir, teamFind, "mlb").length === 0,
  "Game 1 is not matched to a Game-2-only snapshot entry");
/* missing dates keep the old first-pair-match fallback (nothing to compare) */
var noDateEv = pmEv("Boston Red Sox vs. New York Yankees", "",
  ["Boston Red Sox","New York Yankees"], [0.30, 0.70]);
assert(D.matches([noDateEv], snapGames, dir, teamFind, "mlb").length === 1,
  "an undated PM event still falls back to the first pair match");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all disagree-mlb assertions passed");
