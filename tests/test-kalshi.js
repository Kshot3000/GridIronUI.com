/* Verifies the Kalshi snapshot logic in js/kalshi-logic.js: bid/ask midpoint
   pricing, last-trade fallback, no invented prices, book-line spread tiers,
   game normalization (soonest first, unpriced games dropped), staleness. */
"use strict";
var K = require("../js/kalshi-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* price() */
assert(K.price({yes_bid: 62, yes_ask: 64}) === 63, "price is the bid/ask midpoint in cents");
assert(K.price({yes_bid: 33, yes_ask: 34}) === 34, "odd midpoint rounds (33.5 -> 34)");
assert(K.price({yes_bid: null, yes_ask: null, last: 58}) === 58, "falls back to last trade when book is empty");
assert(K.price({yes_bid: 0, yes_ask: 0, last: null}) === 0, "zero bid/ask is a real price, not 'unpriced'");
assert(K.price({yes_bid: 70, yes_ask: 60}) === null, "crossed book (ask<bid) is invalid -> null");
assert(K.price({}) === null, "empty market -> null, never invents a price");
assert(K.price(null) === null, "null market -> null");

/* book() */
var b = K.book({yes_bid: 62, yes_ask: 64});
assert(b && b.spread === 2 && b.cls === "green" && b.lbl === "tight book", "2c spread is a tight book");
b = K.book({yes_bid: 40, yes_ask: 45});
assert(b && b.spread === 5 && b.cls === "blue", "5c spread is decent liquidity");
b = K.book({yes_bid: 20, yes_ask: 30});
assert(b && b.spread === 10 && b.cls === "red" && b.lbl === "thin — price may move", "wide spread flagged thin");
assert(K.book({yes_bid: null, yes_ask: null}) === null, "no book posted -> null");
assert(K.book({yes_bid: 70, yes_ask: 60}) === null, "crossed book -> null");

/* vol() */
assert(K.vol({volume_24h: "1303124.40", volume: "1491354.44"}) === "24h vol $1.3M · all-time $1.5M", "24h + all-time volume formatted");
assert(K.vol({volume: 5200}) === "Volume $5K", "numeric volume works");
assert(K.vol({}) === "", "no volume -> empty string, no junk");

/* games() */
var snap = {
  updated_at: "2026-09-27T18:55:31Z",
  games: [
    {title: "Kansas City vs Miami", sub_title: "KC vs MIA (Sep 27)", event_ticker: "KXNFLGAME-26SEP27KCMIA",
     markets: [
       {team: "Kansas City", yes_bid: 85, yes_ask: 86, last: 85, volume: "1491354.44", volume_24h: "1303124.40", close_time: "2026-09-28T00:20:00Z"},
       {team: "Miami", yes_bid: 14, yes_ask: 15, last: 15, volume: "900000", close_time: "2026-09-28T00:20:00Z"}
     ]},
    {title: "Philadelphia vs Chicago", sub_title: "PHI vs CHI (Sep 28)", event_ticker: "KXNFLGAME-26SEP28PHICHI",
     markets: [
       {team: "Philadelphia", yes_bid: 65, yes_ask: 66, last: 66, close_time: "2026-09-29T00:15:00Z"},
       {team: "Chicago", yes_bid: 34, yes_ask: 35, last: 34, close_time: "2026-09-29T00:15:00Z"}
     ]},
    {title: "Settled Game", sub_title: "XX vs YY", event_ticker: "KXNFLGAME-OLD",
     markets: [ {team: "X", yes_bid: null, yes_ask: null, last: null} ]},
    {title: "Half Priced", sub_title: "AA vs BB", event_ticker: "KXNFLGAME-HALF",
     markets: [
       {team: "A", yes_bid: 50, yes_ask: 52, last: 51},
       {team: "B", yes_bid: null, yes_ask: null, last: null}
     ]}
  ]
};
var games = K.games(snap);
assert(games.length === 2, "drops unpriced and half-priced games, keeps 2 priced");
assert(games[0].ticker === "KXNFLGAME-26SEP27KCMIA", "soonest game first");
assert(games[0].teams[0].name === "Kansas City" && games[0].teams[0].price === 86, "favorite sorts first with midpoint price");
assert(games[0].teams[1].price === 15, "underdog priced from its own book");
assert(games[0].teams[0].vol === "24h vol $1.3M · all-time $1.5M",
  "volume carried through (got: '"+games[0].teams[0].vol+"')");
assert(K.games(null).length === 0 && K.games({}).length === 0, "null/empty snapshot -> no games, no crash");

/* stale() */
var now = new Date().toISOString();
var old = new Date(Date.now() - 7 * 3600000).toISOString();
assert(K.stale(old) === true, "7h-old snapshot is stale (default 6h)");
assert(K.stale(now) === false, "fresh snapshot is not stale");
assert(K.stale("garbage") === true, "unparseable timestamp treated as stale, never trusted");
assert(K.stale(now, 1) === false && K.stale(old, 8) === false, "custom threshold honored");

/* fmtWhen() */
assert(K.fmtWhen(Date.parse("2026-09-27T17:00:00Z")).indexOf("Sep 27") !== -1, "formats a kickoff time");
assert(K.fmtWhen(null) === "" && K.fmtWhen(undefined) === "", "null time -> empty string");

console.log(failures ? ("\n"+failures+" FAILURES") : "\nall kalshi tests passed");
process.exit(failures ? 1 : 0);
