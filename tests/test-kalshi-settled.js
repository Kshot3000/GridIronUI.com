/* GridIronUI v1.98.0 — settled-game detection in js/kalshi-logic.js.
   Kalshi keeps finished games in its "open" listing until settlement
   finalizes (close_time stays in the future), so the markets page must not
   show a 99c side as a live prediction. K.settled() detects the settled
   signature from prices alone; K.games() flags it and sorts settled games
   last. Run: node tests/test-kalshi-settled.js */
"use strict";
var K = require("../js/kalshi-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* fixture shapes (modeled on the real 2026-09-30 KXMLBGAME snapshot) */
function mkMarkets(prices){
  return prices.map(function(p, i){
    return {team: "T"+i, kind: "winner", yes_bid: p.b, yes_ask: p.a, last: p.l,
            close_time: "2026-10-04T02:00:00Z"};
  });
}
var settledGame = {event_ticker: "G1", markets: mkMarkets([
  {b: 0, a: 1, l: 1}, {b: 99, a: 100, l: 99}])};
var liveGame = {event_ticker: "G2", markets: mkMarkets([
  {b: 43, a: 44, l: 44}, {b: 56, a: 57, l: 57}])};
var blowoutLive = {event_ticker: "G3", markets: mkMarkets([
  {b: 85, a: 86, l: 86}, {b: 13, a: 14, l: 14}])}; /* big but live: 86/14 */

/* ---- K.settled() ---- */
assert(K.settled(settledGame) === true, "1c/99c settled game detected");
assert(K.settled(liveGame) === false, "44c/57c live game is not settled");
assert(K.settled(blowoutLive) === false, "86c/14c live blowout is not settled (threshold is 99/1)");
assert(K.settled({markets: mkMarkets([{b: 99, a: 100, l: 100}, {b: 50, a: 52, l: 51}])}) === false,
  "one side at 100 but other live at 51 -> not settled");
assert(K.settled({markets: [{team: "A", yes_bid: 1, yes_ask: 1, last: 1},
                            {team: "B", yes_bid: 99, yes_ask: 99, last: 99}]}) === true,
  "works with degenerate book (bid==ask==last)");
assert(K.settled({markets: [{team: "A", yes_bid: null, yes_ask: null, last: null},
                            {team: "B", yes_bid: 99, yes_ask: 100, last: 99}]}) === false,
  "unpriced side -> not settled, game is dropped elsewhere");
assert(K.settled({markets: [{team: "A", yes_bid: 0, yes_ask: 1, last: 1}]}) === false,
  "single extreme market alone is not a settled game");
assert(K.settled({markets: []}) === false, "empty markets -> false");
assert(K.settled(null) === false && K.settled({}) === false, "null/empty game -> false, no crash");
assert(K.settled({markets: [{team: "A", kind: "other", yes_bid: 99, yes_ask: 100, last: 99},
                            {team: "B", kind: "winner", yes_bid: 0, yes_ask: 1, last: 1},
                            {team: "C", kind: "winner", yes_bid: 50, yes_ask: 52, last: 51}]}) === false,
  "'other' markets ignored in settled detection");

/* ---- K.games() flags + ordering ---- */
var snap = {
  updated_at: "2026-09-30T05:00:00Z",
  games: [
    {title: "Game 1: Chicago C vs San Diego", sub_title: "CHC vs SD (Sep 29)",
     event_ticker: "KXMLBGAME-26SEP292200CHCSD",
     markets: mkMarkets([{b: 0, a: 1, l: 1}, {b: 99, a: 100, l: 99}]).map(function(m, i){
       m.team = i ? "San Diego" : "Chicago C"; return m; })},
    {title: "Game 2: Chicago C vs San Diego", sub_title: "CHC vs SD (Sep 30)",
     event_ticker: "KXMLBGAME-26SEP302200CHCSD",
     markets: mkMarkets([{b: 43, a: 44, l: 44}, {b: 56, a: 57, l: 57}]).map(function(m, i){
       m.team = i ? "San Diego" : "Chicago C"; m.close_time = "2026-10-04T02:00:00Z"; return m; })}
  ]
};
/* the settled game's close_time is EARLIER than the live game's in the real
   snapshot (settled Game 1 closes Oct 3, live Game 2 closes Oct 4) — plain
   close-time ordering would put the finished game first, which is exactly
   what the settled-last rule fixes */
snap.games[0].markets.forEach(function(m){ m.close_time = "2026-10-03T02:00:00Z"; });
var games = K.games(snap);
assert(games.length === 2, "settled games kept (not dropped) by K.games()");
assert(games[0].settled !== true && games[1].settled === true,
  "settled game sorts LAST even when its close_time is earlier (got order: "+
  games.map(function(g){ return g.title.split(":")[0]+(g.settled?"[settled]":""); }).join(", ")+")");
assert(games[1].teams[0].name === "San Diego" && games[1].teams[0].price === 100,
  "settled game still carries real prices; winner first (99/100 book -> 100c midpoint)");

console.log(failures ? ("\n"+failures+" FAILURES") : "\nall kalshi-settled tests passed");
process.exit(failures ? 1 : 0);
