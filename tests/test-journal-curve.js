/* Node tests for BetMath.journalCurve (v1.60.0 — the journal's bankroll
   curve). Pure: cumulative settled profit, date-ordered, pending excluded,
   pushes flat. Run: node tests/test-journal-curve.js */
var M = require("../js/betmath.js");
var fails = 0;
function eq(name, got, want){
  var ok = Math.abs(got - want) < 1e-9;
  if(!ok){ fails++; console.error("FAIL", name, "got", got, "want", want); }
  else console.log("ok  ", name, "=", got);
}
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
function bet(o){
  return Object.assign({id: 1, date: "2026-09-20", sport: "NFL", event: "E", market: "Moneyline",
                        pick: "P", price: -110, stake: 100, result: "pending"}, o);
}

/* empty / junk */
var c0 = M.journalCurve([]);
eq("empty -> settled", c0.settled, 0);
eq("empty -> final", c0.final, 0);
ok("empty -> no points", c0.points.length === 0);
var cNull = M.journalCurve(null);
eq("null -> settled", cNull.settled, 0);

/* the reference ledger: win -110 $100, loss -110 $100, win +150 $100,
   push, pending (excluded) */
var bets = [
  bet({id: 3, date: "2026-09-22", result: "win",  price: 150}),   /* +150.00 */
  bet({id: 1, date: "2026-09-20", result: "win",  price: -110}),  /* +90.91  */
  bet({id: 2, date: "2026-09-21", result: "loss", price: -110}),  /* -100    */
  bet({id: 4, date: "2026-09-23", result: "push", price: -110}),  /* 0       */
  bet({id: 5, date: "2026-09-24", result: "pending", price: -110})
];
var c = M.journalCurve(bets);
eq("settled count (pending excluded)", c.settled, 4);
ok("points in date order", c.points.map(function(p){ return p.date; }).join(",") ===
   "2026-09-20,2026-09-21,2026-09-22,2026-09-23");
eq("cumulative after 1st (-110 win)", c.points[0].cum, 90.91);
eq("cumulative after 2nd (-110 loss)", c.points[1].cum, -9.09);
eq("cumulative after 3rd (+150 win)", c.points[2].cum, 140.91);
eq("push leaves curve flat", c.points[3].cum, 140.91);
eq("final", c.final, 140.91);

/* id tiebreak on identical dates: insertion must not scramble order */
var ties = [ bet({id: 9, date: "2026-09-20", result: "loss"}),
             bet({id: 2, date: "2026-09-20", result: "win"}) ];
var ct = M.journalCurve(ties);
ok("same-date bets ordered by id", ct.points[0].id === 2 && ct.points[1].id === 9);
eq("tiebreak cum after id2 win", ct.points[0].cum, 90.91);
eq("tiebreak cum after id9 loss", ct.points[1].cum, -9.09);

/* a losing ledger stays negative all the way down */
var down = [ bet({id: 1, date: "2026-09-20", result: "loss"}),
             bet({id: 2, date: "2026-09-21", result: "loss"}) ];
var cd = M.journalCurve(down);
eq("two losses -> final", cd.final, -200);

/* junk price can't poison the curve (journalValid gates these in the UI,
   but the pure function must not emit NaN) */
var junk = [ bet({id: 1, date: "2026-09-20", result: "win", price: "abc"}) ];
var cj = M.journalCurve(junk);
eq("bad price -> skipped, settled 0", cj.settled, 0);
ok("bad price -> no NaN in points", cj.points.every(function(p){ return isFinite(p.cum); }));

/* all-pending ledger: nothing settled, curve stays hidden downstream */
var cp = M.journalCurve([ bet({id: 1, result: "pending"}) ]);
eq("all pending -> settled 0", cp.settled, 0);

if(fails){ console.error(fails + " FAILURES"); process.exit(1); }
console.log("journalCurve: all green");
