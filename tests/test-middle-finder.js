/* Pure findMiddles logic in shipped js/odds-logic.js (v1.140.0).
   Covers: spread middle detected with the correct window, totals middle at a
   1+ point disagreement, no middle when the books agree, same-book pairs
   ignored, juice cost math (miss/hit), malformed input safety, and
   biggestMiddles ordering/caps.
   Run: node tests/test-middle-finder.js */
"use strict";
var L = require("../js/odds-logic.js");

var failures = 0;
function ok(name, cond, extra){
  if(!cond){ failures++; console.error("FAIL:", name, extra === undefined ? "" : extra); }
  else console.log("ok:", name);
}
function eq(name, a, b){
  ok(name, a === b, "got " + JSON.stringify(a) + ", want " + JSON.stringify(b));
}
function o(name, price, point){
  var r = { name: name, price: price };
  if(point !== undefined) r.point = point;
  return r;
}
function bk(key, title, markets){
  return { key: key, title: title, markets: markets };
}
function ev(id, books){
  return { id: id, away_team: "Chicago Bears", home_team: "Green Bay Packers",
           commence_time: new Date(Date.now()+2*864e5).toISOString(),
           bookmakers: books };
}
function spreads(aPt, hPt, pr){
  pr = pr === undefined ? 1.91 : pr;
  return { key: "spreads", outcomes: [ o("Chicago Bears", pr, aPt), o("Green Bay Packers", pr, hPt) ] };
}
function totals(tot, pr){
  pr = pr === undefined ? 1.91 : pr;
  return { key: "totals", outcomes: [ o("Over", pr, tot), o("Under", pr, tot) ] };
}

/* 1. spread middle: DK Bears -2.5, FD Packers +3.5 -> window (2.5, 3.5) */
var midEv = ev("mid-1", [
  bk("draftkings", "DraftKings", [ spreads(-2.5, 2.5), totals(44.5) ]),
  bk("fanduel", "FanDuel",       [ spreads(-3.5, 3.5), totals(45.5) ])
]);
var found = L.findMiddles([midEv]);
var sp = found.filter(function(m){ return m.kind === "spread"; });
eq("spread middle found exactly once", sp.length, 1);
eq("spread window lo", sp[0].lo, 2.5);
eq("spread window hi", sp[0].hi, 3.5);
eq("spread window width", sp[0].width, 1);
eq("spread leg 1 side/book", sp[0].legs[0].name + "/" + sp[0].legs[0].book,
   "Chicago Bears/draftkings");
eq("spread leg 2 side/book", sp[0].legs[1].name + "/" + sp[0].legs[1].book,
   "Green Bay Packers/fanduel");
eq("spread leg points", sp[0].legs[0].point + "/" + sp[0].legs[1].point, "-2.5/3.5");
eq("spread anchor", sp[0].anchor, "game-mid-1");
eq("spread title", sp[0].title, "Chicago Bears @ Green Bay Packers");

/* 2. juice math: -110/-110 legs, $100 each side */
eq("juice miss at -110/-110", sp[0].costMiss, -9);
eq("juice hit at -110/-110", sp[0].winBoth, 182);

/* 2b. juice math with uneven prices: 2.10 / 1.80 */
var uneven = ev("mid-2", [
  bk("draftkings", "DraftKings", [ spreads(-2.5, 2.5, 2.10), totals(44.5) ]),
  bk("fanduel", "FanDuel",       [ spreads(-3.5, 3.5, 1.80), totals(44.5) ])
]);
var u = L.findMiddles([uneven]).filter(function(m){ return m.kind === "spread"; });
eq("uneven juice found once", u.length, 1);
eq("juice miss uses cheaper leg", u[0].costMiss, -20);   /* 100*1.80-200 */
eq("juice hit uneven", u[0].winBoth, 190);               /* 100*(2.10+1.80-2) */

/* 3. totals middle at a 1-point disagreement: 44.5 vs 45.5 */
var tot = found.filter(function(m){ return m.kind === "total"; });
eq("totals middle found exactly once", tot.length, 1);
eq("totals window", tot[0].lo + "/" + tot[0].hi, "44.5/45.5");
eq("totals legs", tot[0].legs[0].name + "/" + tot[0].legs[1].name, "Over/Under");
eq("totals leg books differ", tot[0].legs[0].book !== tot[0].legs[1].book, true);

/* 4. books agree -> no middles (symmetric -3.5/+3.5 is one line, not a window) */
var flat = ev("flat-1", [
  bk("draftkings", "DraftKings", [ spreads(-3.5, 3.5), totals(44.5) ]),
  bk("fanduel", "FanDuel",       [ spreads(-3.5, 3.5), totals(44.5) ])
]);
eq("agreeing books yield no middles", L.findMiddles([flat]).length, 0);

/* 5. same-book pairs ignored: one book can't middle itself */
var solo = ev("solo-1", [ bk("draftkings", "DraftKings", [ spreads(-2.5, 2.5), totals(44.5) ]) ]);
eq("single book yields no middles", L.findMiddles([solo]).length, 0);
var soloMids = L.findMiddles([solo]);
ok("no same-book leg pairing",
   soloMids.every(function(m){ return m.legs[0].book !== m.legs[1].book; }), "");

/* 5b. every record pairs two different books */
ok("all records pair distinct books",
   found.every(function(m){ return m.legs[0].book !== m.legs[1].book; }), "");

/* 6. totals disagreeing by less than a point: not a middle */
var nearTot = ev("near-1", [
  bk("draftkings", "DraftKings", [ spreads(-3.5, 3.5), totals(44.5) ]),
  bk("fanduel", "FanDuel",       [ spreads(-3.5, 3.5), totals(45.0) ])
]);
eq("0.5-point totals disagreement is not a middle",
   L.findMiddles([nearTot]).filter(function(m){ return m.kind === "total"; }).length, 0);

/* 7. half-point spread window with no whole number inside: not a middle
      (final margins are whole numbers — (2.5, 3.0) can't cash both sides) */
var noInt = ev("noint-1", [
  bk("draftkings", "DraftKings", [ spreads(-2.5, 2.5), totals(44.5) ]),
  bk("fanduel", "FanDuel",       [ spreads(-3.5, 3.0), totals(44.5) ])
]);
eq("window (2.5,3.0) with no whole number inside is not a middle",
   L.findMiddles([noInt]).filter(function(m){ return m.kind === "spread"; }).length, 0);

/* 7b. whole-number window edges still cash: -3 vs +4.5 -> (3,4.5) holds 4 */
var wholeEdge = ev("whole-1", [
  bk("draftkings", "DraftKings", [ spreads(-3, 3), totals(44.5) ]),
  bk("fanduel", "FanDuel",       [ spreads(-3.5, 4.5), totals(44.5) ])
]);
var we = L.findMiddles([wholeEdge]).filter(function(m){ return m.kind === "spread"; });
eq("window (3,4.5) holds whole number 4 -> middle", we.length, 1);
eq("whole-edge window", we[0].lo + "/" + we[0].hi, "3/4.5");

/* 8. malformed input is safe: never throws, never invents */
[null, undefined, [], [null], [{}], [{id:"x"}],
 [{id:"x", away_team:"A", home_team:"H"}],
 [{id:"x", away_team:"A", home_team:"H", bookmakers:[{key:"dk"}]}],
 [{id:"x", away_team:"A", home_team:"H",
   bookmakers:[{key:"dk", markets:[{key:"spreads", outcomes:[{name:"A"}]}]},
               {key:"fd", markets:[{key:"spreads", outcomes:[{name:"A", point:"junk", price:1.91}]}]}]}]
].forEach(function(bad, i){
  var r = null, threw = false;
  try{ r = L.findMiddles(bad); }catch(e){ threw = true; }
  ok("malformed input #"+i+" safe", !threw && Array.isArray(r) && r.length === 0,
     threw ? "threw" : JSON.stringify(r));
});

/* 8b. bad prices keep the window but null the juice (honest, not invented) */
var badPrice = ev("bp-1", [
  bk("draftkings", "DraftKings", [ { key:"spreads", outcomes:[ o("Chicago Bears", 0.5, -2.5), o("Green Bay Packers", 1.91, 2.5) ] }, totals(44.5) ]),
  bk("fanduel", "FanDuel",       [ spreads(-3.5, 3.5), totals(44.5) ])
]);
var bp = L.findMiddles([badPrice]).filter(function(m){ return m.kind === "spread"; });
eq("window survives bad price", bp.length, 1);
eq("juice null when price unknown (miss)", bp[0].costMiss, null);
eq("juice null when price unknown (hit)", bp[0].winBoth, null);

/* 9. biggestMiddles: widest first, capped, stable title tie-break */
var recs = [
  { title: "B @ C", width: 1 }, { title: "A @ D", width: 2 },
  { title: "C @ B", width: 1 }, { title: "D @ A", width: 3 }
];
var top = L.biggestMiddles(recs, 2);
eq("biggestMiddles cap", top.length, 2);
eq("biggestMiddles widest first", top[0].title + "/" + top[1].title, "D @ A/A @ D");
var tied = L.biggestMiddles(recs, 4).map(function(r){ return r.title; }).join(",");
eq("biggestMiddles title tie-break", tied, "D @ A,A @ D,B @ C,C @ B");
eq("biggestMiddles n=0", L.biggestMiddles(recs, 0).length, 0);
eq("biggestMiddles default n", L.biggestMiddles(recs.concat(recs)).length, 5);
eq("biggestMiddles garbage safe", L.biggestMiddles(null).length, 0);

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL MIDDLE-FINDER TESTS PASS");
process.exit(failures ? 1 : 0);
