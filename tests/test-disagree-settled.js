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
   The live fixture re-pins honestly: the snapshot listing rotates with the
   postseason (CHC@SD Game 2 settled fully and left the listing in the
   05:08Z snapshot; the ALDS matchups NYY@TB and CWS@CLE Game 1/2 joined),
   so the settlement-lag case is exercised with a synthetic clone of a REAL
   current game — the PHI vs ATL Game 3 winner-take-all, found by its
   abbreviation pair rather than by position — priced the way a settled
   game actually sits (winner 99/100, loser 0/1): the exact price shape that
   manufactured the fake edge.
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

/* ---- functional: the settlement-lag price shape is caught ----
   Clone the PHI vs ATL Game 3 game and price it the way a settled game
   actually sits: winner 99/100, loser 0/1. The fixture game is found by its
   abbreviation pair (not by position) so snapshot reorderings can't
   silently unhook the test. */
var snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-mlb.json"), "utf8"));
var live = (snap.games||[]).filter(function(g){ return !K.settled(g); });
assert(live.length >= 2, "MLB snapshot has live games to work with (got "+live.length+")");
assert(live.every(function(g){ return !K.settled(g); }),
  "no real live game is flagged settled (PHI@ATL Game 3 stays live)");
function abbrsOf(g){ return D.kalshiAbbrs((g && g.sub_title) || ""); }
var fixture = live.filter(function(g){
  var ab = abbrsOf(g);
  return ab && ((ab[0]==="PHI"&&ab[1]==="ATL")||(ab[0]==="ATL"&&ab[1]==="PHI"));
})[0];
assert(!!fixture, "fixture game (PHI vs ATL, Oct 1) is in the current MLB snapshot");
var settledClone = JSON.parse(JSON.stringify(fixture));
/* keep the real event_ticker/markets: this is the genuine settlement-lag
   price shape, only the numbers changed — the winner's book goes 99/100 */
(settledClone.markets||[]).forEach(function(m){
  if(D.kalshiTeamAbbr(m) === "ATL"){ m.yes_bid = 99; m.yes_ask = 100; m.last = 99; }
  else { m.yes_bid = 0; m.yes_ask = 1; m.last = 0; }
});
assert(K.settled(settledClone),
  "the settlement-lag clone (99/100 vs 0/1) is flagged settled by K.settled");
var mixed = live.concat([settledClone]);
var klGames = mixed.filter(function(g){ return !K.settled(g); });
assert(klGames.length === live.length && klGames.indexOf(settledClone) === -1,
  "disagreeCard's filter drops the settled clone ("+mixed.length+" -> "+klGames.length+")");
assert(klGames.every(function(g){ return !K.settled(g); }),
  "no settled game survives the filter");

/* ---- functional: a settled game can no longer seed a bogus edge ----
   Synthetic Polymarket event for the cloned game at a stale-ish live
   price: without the Kalshi-side filter this matches the clone's 99c and
   prints a giant fake disagreement. The PM-side 99c/1c guard is left alone
   here (price 25c/75c), so only the settled filter is under test. */
var dir = {mlb: [
  {abbr:"ATL", displayName:"Atlanta Braves",      shortDisplayName:"Braves"},
  {abbr:"PHI", displayName:"Philadelphia Phillies", shortDisplayName:"Phillies"}
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
var pmLag = {title: "Braves vs. Phillies", startTime: "2026-10-01T17:00:00Z",
  markets: [{sportsMarketType:"moneyline", closed:false, active:true,
    outcomes:JSON.stringify(["Atlanta Braves","Philadelphia Phillies"]),
    outcomePrices:JSON.stringify([0.25,0.75]), volume:5000}]};
/* the pure case: the lone settled clone pairs at 99c on its own … */
var lone = [settledClone];
var loneMtch = D.matches([pmLag], lone, dir, teamFind, "mlb");
assert(loneMtch.length === 1 && loneMtch[0].kalshiA >= 99,
  "sanity: the lone settled clone pairs at 99c — the exact fake edge the filter exists to kill");
/* … and after disagreeCard's filter there is nothing left to match */
var loneFiltered = lone.filter(function(g){ return !K.settled(g); });
assert(D.matches([pmLag], loneFiltered, dir, teamFind, "mlb").length === 0,
  "filtered list has no settled game — no fake edge from settlement lag");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all disagree-settled assertions passed");
