/* Node tests for js/betmath.js — run: node tests/test-betmath.js */
var M = require("../js/betmath.js");
var fails = 0;
function eq(name, got, want, tol){
  tol = tol || 1e-9;
  var ok = Math.abs(got-want) <= tol;
  if(!ok){ fails++; console.error("FAIL", name, "got", got, "want", want); }
  else console.log("ok  ", name, "=", got);
}
function eqArr(name, got, want){
  var ok = got[0]===want[0] && got[1]===want[1];
  if(!ok){ fails++; console.error("FAIL", name, "got", got, "want", want); }
  else console.log("ok  ", name, "=", got.join("/"));
}

/* task's reference values: -110 = 1.91 decimal = 10/11 fractional = 52.38% implied */
eq("-110 -> decimal", M.americanToDecimal(-110), 1.9090909, 1e-4);
eq("decimal 1.9091 -> american", M.decimalToAmerican(1.9090909), -110);
eqArr("1.9091 -> fractional", M.decimalToFractional(1.9090909), [10,11]);
eq("-110 implied", M.impliedFromAmerican(-110), 0.5238095, 1e-4);
eq("+150 -> decimal", M.americanToDecimal(150), 2.5);
eqArr("2.5 -> fractional", M.decimalToFractional(2.5), [3,2]);
eq("+130 implied", M.impliedFromAmerican(130), 100/230, 1e-6);
eq("fractional 10/11 -> decimal", M.fractionalToDecimal(10,11), 1.9090909, 1e-6);
eq("fractional implied", M.impliedFromFractional(10,11), 11/21, 1e-6);

var po = M.payout(1.9090909, 110);
eq("payout -110 $110 profit", po.profit, 100, 0.01);
eq("payout -110 $110 total", po.total, 210, 0.01);

var pl = M.parlayDecimal([1.9090909, 1.9090909, 1.9090909]);
eq("3-leg -110 parlay", pl, 6.967, 0.01);
eq("parlay -> american", M.decimalToAmerican(pl), 597, 1);

eq("kelly full (p=.6, +100)", M.kelly(0.6, 2.0, 1), 0.2);
eq("kelly half", M.kelly(0.6, 2.0, 0.5), 0.1);
eq("kelly no edge -> 0", M.kelly(0.4, 2.0, 1), 0);

var nv = M.noVig(-150, 130);
eq("no-vig p1 (Chiefs -150)", nv.p1, 0.5797, 0.001);
eq("no-vig p2 (Raiders +130)", nv.p2, 0.4203, 0.001);
eq("no-vig fair1", nv.fair1, -138, 1);
eq("no-vig fair2", nv.fair2, 138, 1);
eq("no-vig hold %", nv.hold, 3.48, 0.05);

/* error cases */
[["zero american",function(){M.americanToDecimal(0);}],
 ["decimal <1",function(){M.decimalToAmerican(0.9);}],
 ["empty parlay",function(){M.parlayDecimal([]);}],
 ["bad p",function(){M.kelly(1.5,2.0,1);}]
].forEach(function(c){
  try{ c[1](); fails++; console.error("FAIL", c[0], "did not throw"); }
  catch(e){ console.log("ok  ", c[0], "throws"); }
});

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL BETMATH TESTS PASSED");
process.exit(fails ? 1 : 0);
