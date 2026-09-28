/* Node tests for BetMath.expectedValue (the EV calculator's math).
   Run: node tests/test-ev.js */
var M = require("../js/betmath.js");
var fails = 0;
function eq(name, got, want, tol){
  tol = tol || 1e-9;
  var ok = Math.abs(got-want) <= tol;
  if(!ok){ fails++; console.error("FAIL", name, "got", got, "want", want); }
  else console.log("ok  ", name, "=", got);
}
function throws(name, fn){
  try{ fn(); fails++; console.error("FAIL", name, "did not throw"); }
  catch(e){ console.log("ok  ", name, "threw:", e.message); }
}

/* fair price: 50% at 2.00 is exactly zero EV */
var r0 = M.expectedValue(0.5, 2.0);
eq("fair 50%@2.00 evPerStake", r0.evPerStake, 0);
eq("fair 50%@2.00 edgePct", r0.edgePct, 0);
eq("fair 50%@2.00 breakEven", r0.breakEven, 0.5);

/* +EV: 55% true at even money prints +10% edge */
var r1 = M.expectedValue(0.55, 2.0);
eq("55%@2.00 evPerStake", r1.evPerStake, 0.1);
eq("55%@2.00 edgePct", r1.edgePct, 10);

/* -EV: coin flip at -110 (1.9091) loses 4.55% per bet */
var r2 = M.expectedValue(0.5, 1.9090909);
eq("50%@-110 evPerStake", r2.evPerStake, -0.0454545, 1e-6);
eq("50%@-110 edgePct", r2.edgePct, -4.5454545, 1e-4);
eq("-110 breakEven", r2.breakEven, 0.5238095, 1e-6);

/* American +120 = 2.20 decimal at 55% -> EV = 0.55*2.2-1 = 0.21 */
var r3 = M.expectedValue(0.55, M.americanToDecimal(120));
eq("55%@+120 evPerStake", r3.evPerStake, 0.21, 1e-9);
eq("55%@+120 edgePct", r3.edgePct, 21, 1e-9);
eq("+120 breakEven", r3.breakEven, 1/2.2, 1e-9);

/* big dog: 30% at +300 (4.00) -> EV = 0.3*4-1 = 0.20 */
var r4 = M.expectedValue(0.3, M.americanToDecimal(300));
eq("30%@+300 evPerStake", r4.evPerStake, 0.2, 1e-9);

/* heavy chalk: 80% at -400 (1.25) -> EV = 0.8*1.25-1 = 0.0 */
var r5 = M.expectedValue(0.8, M.americanToDecimal(-400));
eq("80%@-400 evPerStake", r5.evPerStake, 0, 1e-9);

/* garbage in throws — the calculator must never silently price nonsense */
throws("p=0 throws", function(){ M.expectedValue(0, 2.0); });
throws("p=1 throws", function(){ M.expectedValue(1, 2.0); });
throws("p=1.5 throws", function(){ M.expectedValue(1.5, 2.0); });
throws("p=NaN throws", function(){ M.expectedValue(NaN, 2.0); });
throws("d=1.00 throws", function(){ M.expectedValue(0.5, 1.0); });
throws("d<1 throws", function(){ M.expectedValue(0.5, 0.9); });
throws("d=NaN throws", function(){ M.expectedValue(0.5, NaN); });

if(fails){ console.error(fails+" FAILURES"); process.exit(1); }
console.log("ALL EV MATH TESTS PASSED");
