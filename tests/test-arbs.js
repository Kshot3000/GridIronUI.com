/* Cross-book arbitrage ("sure bets") logic tests.
   Run: node tests/test-arbs.js */
"use strict";
var L = require("../js/odds-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ")"); }
function near(a, b, msg){
  assert(Math.abs(a - b) < 0.005, msg + " (got " + a + ", want ~" + b + ")");
}

function o(name, price, point){
  var r = { name: name, price: price };
  if(point !== undefined) r.point = point;
  return r;
}
function bk(key, title, markets){
  return { key: key, title: title, markets: markets };
}
function mlBooks(){
  return [
    bk("dk", "DraftKings", [{ key:"h2h", outcomes:[
      o("Chicago Bears", 2.10), o("Green Bay Packers", 1.80) ]}]),
    bk("fd", "FanDuel", [{ key:"h2h", outcomes:[
      o("Chicago Bears", 1.75), o("Green Bay Packers", 2.10) ]}])
  ];
}
function ev(books){
  return { id: "arb-ev-1", home_team: "Green Bay Packers",
           away_team: "Chicago Bears", bookmakers: books };
}

/* stakeSplit */
var sp = L.stakeSplit([2.10, 2.10], 100);
eq(sp.stakes.length, 2, "stakeSplit returns a stake per leg");
near(sp.stakes[0], 50.00, "symmetric arb splits 50/50 (leg 1)");
near(sp.stakes[1], 50.00, "symmetric arb splits 50/50 (leg 2)");
near(sp.profit, 5.00, "stakeSplit profit is $5.00 on $100 at 2.10/2.10");
near(sp.profitPct, 5.00, "stakeSplit profitPct is 5.00%");

var sp3 = L.stakeSplit([2.60, 3.50, 3.20], 100);
near(sp3.stakes[0] + sp3.stakes[1] + sp3.stakes[2], 100, "3-way stakes sum to the total");
near(sp3.profitPct, 1.75, "3-way profitPct is 1.75%");
near(sp3.profit, 1.75, "3-way profit is $1.75 on $100");

/* moneyline arb */
var arbs = L.arbsForEvent(ev(mlBooks()));
eq(arbs.length, 1, "finds the moneyline arb");
eq(arbs[0].market, "h2h", "moneyline arb market tag");
eq(arbs[0].marketLabel, "Moneyline", "moneyline arb label");
eq(arbs[0].legs[0].book, "dk", "away leg comes from DraftKings (best away price)");
eq(arbs[0].legs[1].book, "fd", "home leg comes from FanDuel (best home price)");
eq(arbs[0].legs[0].bookTitle, "DraftKings", "leg carries the book title for display");
near(arbs[0].profitPct, 5.00, "moneyline arb profitPct is 5.00%");
near(arbs[0].stakes[0], 50.00, "moneyline arb stake leg 1");

/* no arb when the books agree */
var noArb = L.arbsForEvent(ev([
  bk("dk", "DraftKings", [{ key:"h2h", outcomes:[ o("Chicago Bears", 1.91), o("Green Bay Packers", 1.91) ]}]),
  bk("fd", "FanDuel",    [{ key:"h2h", outcomes:[ o("Chicago Bears", 1.91), o("Green Bay Packers", 1.91) ]}])
]));
eq(noArb.length, 0, "1.91/1.91 both sides is no arb");

/* same-book "arb" is excluded — unplayable */
var sameBook = L.arbsForEvent(ev([
  bk("dk", "DraftKings", [{ key:"h2h", outcomes:[ o("Chicago Bears", 2.10), o("Green Bay Packers", 2.10) ]}]),
  bk("fd", "FanDuel",    [{ key:"h2h", outcomes:[ o("Chicago Bears", 1.70), o("Green Bay Packers", 1.70) ]}])
]));
eq(sameBook.length, 0, "both best prices at one book is not shown as an arb");

/* best price wins per side across books */
var pick = L.arbsForEvent(ev([
  bk("dk", "DraftKings", [{ key:"h2h", outcomes:[ o("Chicago Bears", 2.05), o("Green Bay Packers", 1.75) ]}]),
  bk("fd", "FanDuel",    [{ key:"h2h", outcomes:[ o("Chicago Bears", 2.10), o("Green Bay Packers", 1.80) ]}]),
  bk("mgm","BetMGM",     [{ key:"h2h", outcomes:[ o("Chicago Bears", 1.95), o("Green Bay Packers", 2.02) ]}])
]));
eq(pick.length, 1, "three-book board still yields one moneyline arb");
eq(pick[0].legs[0].book, "fd", "away leg is the max away price (FanDuel 2.10)");
eq(pick[0].legs[1].book, "mgm", "home leg is the max home price (BetMGM 2.02)");

/* spread arb at the same line */
var spreadArb = L.arbsForEvent(ev([
  bk("dk", "DraftKings", [{ key:"spreads", outcomes:[
    o("Chicago Bears", 2.05, -6.5), o("Green Bay Packers", 1.87, 6.5) ]}]),
  bk("fd", "FanDuel", [{ key:"spreads", outcomes:[
    o("Chicago Bears", 1.87, -6.5), o("Green Bay Packers", 2.05, 6.5) ]}])
]));
var spOnly = spreadArb.filter(function(a){ return a.market === "spreads"; });
eq(spOnly.length, 1, "finds the spread arb at -6.5/+6.5");
eq(spOnly[0].marketLabel, "Spread -6.5", "spread arb labels the line");
eq(spOnly[0].legs[0].book !== spOnly[0].legs[1].book, true, "spread arb legs are at different books");

/* spread at different lines is not an arb (no guaranteed cover) */
var spreadMiss = L.arbsForEvent(ev([
  bk("dk", "DraftKings", [{ key:"spreads", outcomes:[
    o("Chicago Bears", 2.10, -6.5), o("Green Bay Packers", 1.80, 6.5) ]}]),
  bk("fd", "FanDuel", [{ key:"spreads", outcomes:[
    o("Chicago Bears", 1.80, -7.5), o("Green Bay Packers", 2.10, 7.5) ]}])
]));
eq(spreadMiss.filter(function(a){ return a.market === "spreads"; }).length, 0,
   "away -6.5 vs home +7.5 never pairs into an arb");

/* total arb */
var totArb = L.arbsForEvent(ev([
  bk("dk", "DraftKings", [{ key:"totals", outcomes:[
    o("Over", 2.02, 44.5), o("Under", 1.87, 44.5) ]}]),
  bk("fd", "FanDuel", [{ key:"totals", outcomes:[
    o("Over", 1.87, 44.5), o("Under", 2.02, 44.5) ]}])
]));
var totOnly = totArb.filter(function(a){ return a.market === "totals"; });
eq(totOnly.length, 1, "finds the total arb at 44.5");
eq(totOnly[0].marketLabel, "Total 44.5", "total arb labels the number");

/* EPL-style 3-way moneyline */
var epl = L.arbsForEvent({ id: "epl-1", home_team: "Arsenal", away_team: "Chelsea",
  bookmakers: [
    bk("dk", "DraftKings", [{ key:"h2h", outcomes:[
      o("Chelsea", 2.90), o("Arsenal", 2.60), o("Draw", 3.20) ]}]),
    bk("fd", "FanDuel", [{ key:"h2h", outcomes:[
      o("Chelsea", 3.00), o("Arsenal", 2.50), o("Draw", 3.50) ]}]),
    bk("mgm","BetMGM", [{ key:"h2h", outcomes:[
      o("Chelsea", 3.20), o("Arsenal", 2.55), o("Draw", 3.30) ]}])
  ]});
eq(epl.length, 1, "finds the 3-way EPL arb");
eq(epl[0].legs.length, 3, "3-way arb covers all three outcomes");
near(epl[0].profitPct, 1.75, "3-way profitPct is 1.75%");
eq(epl[0].legs[2].name, "Draw", "extra outcome names (Draw) are included");

/* single book: nothing to compare */
eq(L.arbsForEvent(ev(mlBooks().slice(0, 1))).length, 0, "one book never arbs");
eq(L.arbsForEvent(ev([])).length, 0, "no books never arbs");

/* bestAt point pinning */
var bAt = L.bestAt(mlBooks(), "h2h", "Chicago Bears");
eq(bAt.price, 2.10, "bestAt picks the max price without a point pin");
var bAtMiss = L.bestAt([
  bk("dk", "DraftKings", [{ key:"spreads", outcomes:[ o("Chicago Bears", 2.05, -6.5) ]}])
], "spreads", "Chicago Bears", -7.5);
eq(bAtMiss, null, "bestAt with a point pin ignores other lines");

/* arbEntries flattening + biggestArbs ordering */
var entries = L.arbEntries([
  ev(mlBooks()),
  { id: "arb-ev-2", home_team: "Dallas Cowboys", away_team: "Philadelphia Eagles",
    bookmakers: [
      bk("dk", "DraftKings", [{ key:"h2h", outcomes:[ o("Philadelphia Eagles", 2.02), o("Dallas Cowboys", 1.90) ]}]),
      bk("fd", "FanDuel",    [{ key:"h2h", outcomes:[ o("Philadelphia Eagles", 1.90), o("Dallas Cowboys", 2.02) ]}])
    ]}
]);
eq(entries.length, 2, "arbEntries flattens one row per event arb");
eq(entries[0].anchor, "game-arb-ev-1", "entry anchor is the game-card id");
eq(entries[0].title, "Chicago Bears @ Green Bay Packers", "entry title is away @ home");
var top = L.biggestArbs(entries, 5);
eq(top[0].profitPct >= top[1].profitPct, true, "biggestArbs sorts richest first");
eq(L.biggestArbs(entries, 1).length, 1, "biggestArbs honors the cap");
var tie = L.biggestArbs([
  { title: "Zulu @ Yankee", profitPct: 1.5 }, { title: "Alpha @ Beta", profitPct: 1.5 }
], 5);
eq(tie[0].title, "Alpha @ Beta", "biggestArbs tie-breaks on title for a stable strip");

console.log(failures ? ("\n" + failures + " FAILURES") : "\nALL ARB TESTS PASS");
process.exit(failures ? 1 : 0);
