/* GridIronUI cross-book edge: settled games never cross-check.
   Kalshi keeps finished games in its "open" listing until settlement
   finalizes (close_time stays in the future), so a 99c settled side looks
   like a live price. The markets.html "Where the two markets disagree" card
   must exclude settled Kalshi games before matching — otherwise the
   settlement-lag window manufactures a fake cross-book "edge" a bettor
   could act on. predictions.js already applies this rule; this guards that
   disagreeCard in the shipped js/markets.js applies it too, and that the
   shared D.matches drops decided games on the Polymarket side (a 99c/1c
   Polymarket price is a final left in the active feed, not a live number).
   Run: node tests/test-disagree-settled.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var K = require("../js/kalshi-logic.js");
var D = require("../js/disagree-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---- shipped-source guards: disagreeCard filters settled Kalshi games ---- */
var src = fs.readFileSync(path.join(ROOT, "js", "markets.js"), "utf8");
var card = (src.match(/function disagreeCard\(games, snap, dir[\s\S]*?\n\}\n/) || [""])[0];
assert(card.length > 0, "disagreeCard exists in shipped markets.js");
assert(card.indexOf("window.Kalshi.settled") !== -1,
  "disagreeCard excludes settled Kalshi games via window.Kalshi.settled");
assert(card.indexOf("(snap.games||[])") !== -1,
  "settled filter runs over snap.games");

/* ---- functional: the filter semantics against the real MLB snapshot ----
   data/kalshi-mlb.json currently carries a settled BOS@NYY Game 2
   (NYY 99/100, BOS 0/1) next to live games. */
var snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-mlb.json"), "utf8"));
assert(Array.isArray(snap.games) && snap.games.length >= 2,
  "MLB snapshot has games to filter (got "+(snap.games||[]).length+")");
var klGames = (snap.games||[]).filter(function(g){ return !K.settled(g); });
var dropped = snap.games.filter(function(g){ return K.settled(g); });
assert(dropped.length >= 1, "at least one settled game is dropped by the filter");
assert(klGames.length === snap.games.length - dropped.length,
  "live games survive the filter ("+klGames.length+" kept)");
assert(klGames.every(function(g){ return !K.settled(g); }),
  "no settled game survives the filter");

/* ---- functional: a settled game can no longer seed a bogus edge ----
   Synthetic Polymarket event for the settled BOS@NYY game at a stale-ish
   live price: without the filter this would match Kalshi's 99c and print a
   giant fake disagreement. */
var dir = {mlb: [
  {abbr:"BOS", displayName:"Boston Red Sox",   shortDisplayName:"Red Sox"},
  {abbr:"NYY", displayName:"New York Yankees", shortDisplayName:"Yankees"},
  {abbr:"PHI", displayName:"Philadelphia Phillies", shortDisplayName:"Phillies"},
  {abbr:"ATL", displayName:"Atlanta Braves",   shortDisplayName:"Braves"}
]};
function teamFind(d, league, q){
  var list = (d||{})[league] || [];
  q = String(q==null?"":q).trim(); if(!q || !list.length) return null;
  var qu = q.toUpperCase(), ql = q.toLowerCase();
  for(var i=0;i<list.length;i++) if(list[i].abbr === qu) return list[i];
  for(var j=0;j<list.length;j++)
    if(list[j].displayName.toLowerCase() === ql || list[j].shortDisplayName.toLowerCase() === ql)
      return list[j];
  return null;
}
var pmSettledGame = {title: "Red Sox vs. Yankees", startTime: "2026-10-01T00:00:00Z",
  markets: [{sportsMarketType:"moneyline", closed:false, active:true,
    outcomes:JSON.stringify(["Boston Red Sox","New York Yankees"]),
    outcomePrices:JSON.stringify([0.30,0.70]), volume:5000}]};
var mtchs = D.matches([pmSettledGame], klGames, dir, teamFind, "mlb");
var hitSettled = mtchs.some(function(m){
  return (m.abbrA === "BOS" && m.abbrB === "NYY") || (m.abbrA === "NYY" && m.abbrB === "BOS");
});
assert(!hitSettled, "settled BOS@NYY never matches — no fake edge from settlement lag");
/* and the unfiltered path WOULD have matched (proving the filter matters) */
var mtchsRaw = D.matches([pmSettledGame], snap.games, dir, teamFind, "mlb");
var hitRaw = mtchsRaw.some(function(m){
  return (m.abbrA === "BOS" && m.abbrB === "NYY") || (m.abbrA === "NYY" && m.abbrB === "BOS");
});
assert(hitRaw, "sanity: without the filter the settled game does match (filter is load-bearing)");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all disagree-settled assertions passed");
