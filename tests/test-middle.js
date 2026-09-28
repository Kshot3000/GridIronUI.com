/* Node tests for BetMath.middle (the middling calculator's math).
   Run: node tests/test-middle.js */
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

var m110 = M.americanToDecimal(-110);   /* 1.9090909... */
var p150 = M.americanToDecimal(150);    /* 2.5 */
var p200 = M.americanToDecimal(200);    /* 3.0 */

/* classic middle: $110 each at -110 -> middle pays $200, a split costs the $10 vig */
var r1 = M.middle(110, m110, 110, m110);
eq("classic win1", r1.win1, 100, 1e-6);
eq("classic win2", r1.win2, 100, 1e-6);
eq("classic bothWin", r1.bothWin, 200, 1e-6);
eq("classic splitBet1", r1.splitBet1, -10, 1e-6);
eq("classic splitBet2", r1.splitBet2, -10, 1e-6);
eq("classic totalRisked", r1.totalRisked, 220);
eq("classic worstCase", r1.worstCase, -10, 1e-6);

/* asymmetric: $100 at +150 vs $100 at -110 -> one split wins $50, the other loses $9.09 */
var r2 = M.middle(100, p150, 100, m110);
eq("asym win1 (+150)", r2.win1, 150, 1e-6);
eq("asym win2 (-110)", r2.win2, 90.91, 1e-2);
eq("asym bothWin", r2.bothWin, 240.91, 1e-2);
eq("asym splitBet1 (dog side wins)", r2.splitBet1, 50, 1e-6);
eq("asym splitBet2 (chalk side wins)", r2.splitBet2, -9.09, 1e-2);
eq("asym worstCase", r2.worstCase, -9.09, 1e-2);

/* different stakes: $50 at -110 vs $200 at +200 */
var r3 = M.middle(50, m110, 200, p200);
eq("stakes win1", r3.win1, 45.45, 1e-2);
eq("stakes win2", r3.win2, 400, 1e-6);
eq("stakes bothWin", r3.bothWin, 445.45, 1e-2);
eq("stakes splitBet1", r3.splitBet1, -154.55, 1e-2);
eq("stakes splitBet2", r3.splitBet2, 350, 1e-6);
eq("stakes totalRisked", r3.totalRisked, 250);
eq("stakes worstCase", r3.worstCase, -154.55, 1e-2);

/* free middle: both +200 -> even the worst split pays */
var r4 = M.middle(100, p200, 100, p200);
eq("free splitBet1", r4.splitBet1, 100, 1e-6);
eq("free splitBet2", r4.splitBet2, 100, 1e-6);
eq("free worstCase", r4.worstCase, 100, 1e-6);

/* garbage in throws, never invented */
throws("zero stake 1", function(){ M.middle(0, m110, 110, m110); });
throws("zero stake 2", function(){ M.middle(110, m110, 0, m110); });
throws("negative stake", function(){ M.middle(-50, m110, 110, m110); });
throws("odds at 1.0", function(){ M.middle(100, 1.0, 100, m110); });
throws("odds below 1", function(){ M.middle(100, m110, 100, 0.9); });
throws("NaN stake", function(){ M.middle(NaN, m110, 100, m110); });
throws("empty odds", function(){ M.middle(100, "", 100, m110); });

if(fails){ console.error(fails + " FAILURES"); process.exit(1); }
console.log("test-middle: all assertions passed");
