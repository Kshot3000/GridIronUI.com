/* GridIronUI dutching calculator logic tests (js/betmath.js: BetMath.dutch).
   Dutching splits one stake across mutually-exclusive outcomes so every winner
   pays the same: stake_i = S*(1/d_i)/sum(1/d_j), return = S/sum(1/d_j).
   Run: node tests/test-dutching.js */
var BM = require("../js/betmath.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
  else console.log("ok  ", name);
}
function approx(a, b, tol){ return Math.abs(a-b) <= (tol||0.02); }

/* 1 — two even-money shots, $100: $50 each, everything flat */
var r = BM.dutch([2.0, 2.0], 100);
ok("even split stakes", r.legs[0].stake === 50 && r.legs[1].stake === 50, r.legs);
ok("even implied 50/50", r.legs[0].impliedPct === 50 && r.totalImpliedPct === 100, r);
ok("even return = stake", r.equalReturn === 100, r);
ok("even profit zero", r.profit === 0, r);
ok("even not an arb", r.isArb === false, r);
ok("even roi zero", r.roiPct === 0, r);

/* 2 — arb prices: 2.00 + 2.10 -> implied 97.62% -> guaranteed profit */
r = BM.dutch([2.0, 2.1], 100);
ok("arb detected", r.isArb === true, r);
ok("arb profit = S/sum - S", approx(r.profit, 100/(0.5+1/2.1) - 100), r.profit);
ok("arb profit positive", r.profit > 2.4 && r.profit < 2.5, r.profit);
ok("arb roi positive", r.roiPct > 0, r.roiPct);

/* 3 — the classic trap: -110/-110 -> 104.76% implied -> locked loss */
var d110 = BM.americanToDecimal(-110);
r = BM.dutch([d110, d110], 100);
ok("vig not an arb", r.isArb === false, r);
ok("vig implied over 100", r.totalImpliedPct > 104.7 && r.totalImpliedPct < 104.8, r.totalImpliedPct);
ok("vig locks a loss", r.profit < -4.5 && r.profit > -4.6, r.profit);
ok("vig roi negative", r.roiPct < 0, r.roiPct);

/* 4 — equal returns: every leg's stake x decimal ~= equalReturn */
r = BM.dutch([3.0, 4.0, 6.5], 200);
var allEqual = r.legs.every(function(l){ return approx(l.stake * l.decimal, r.equalReturn, 0.05); });
ok("three-way equal returns", allEqual, r.legs.map(function(l){ return l.stake*l.decimal; }));
ok("three-way stakes sum to S", approx(r.totalStaked, 200, 0.03), r.totalStaked);
ok("three-way arb (73.72% implied)", r.isArb === true && approx(r.totalImpliedPct, 73.72, 0.01), r.totalImpliedPct);

/* 5 — longer prices get smaller stakes */
r = BM.dutch([1.5, 8.0], 100);
ok("favorite gets the bigger stake", r.legs[0].stake > r.legs[1].stake, r.legs);
ok("longshot stake smaller", r.legs[1].stake < 20, r.legs[1].stake);

/* 6 — error paths */
function throws(fn, label){
  try{ fn(); ok(label, false, "did not throw"); }
  catch(e){ ok(label, true); }
}
throws(function(){ BM.dutch([2.0], 100); }, "fewer than 2 selections throws");
throws(function(){ BM.dutch("nope", 100); }, "non-array throws");
throws(function(){ BM.dutch([2.0, 1.0], 100); }, "decimal <= 1 throws");
throws(function(){ BM.dutch([2.0, 0.5], 100); }, "decimal < 1 throws");
throws(function(){ BM.dutch([2.0, 3.0], 0); }, "zero stake throws");
throws(function(){ BM.dutch([2.0, 3.0], -50); }, "negative stake throws");

/* 7 — implied percentages sum to the total */
r = BM.dutch([2.5, 3.5, 5.0], 100);
var sumImp = r.legs.reduce(function(a,l){ return a+l.impliedPct; }, 0);
ok("implied % sums to total", approx(sumImp, r.totalImpliedPct, 0.02), [sumImp, r.totalImpliedPct]);

if(fails){ console.log(fails + " FAILURES"); process.exit(1); }
console.log("dutching logic: all assertions passed");
