/* Node tests for BetMath.bonusBet / rollover / profitBoost (the bonus &
   promo value calculator's math).
   Run: node tests/test-bonus.js */
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

/* --- bonus bet, risk-free hedge ---
   $100 bonus @ 2.00, hedge @ 2.00: S = 100*1/2 = 50, G = 50*1 = 50, 50% */
var h0 = M.bonusBet(100, 2.0, 2.0);
eq("hedge stake", h0.hedgeStake, 50);
eq("hedge guaranteed", h0.guaranteed, 50);
eq("hedge conversion", h0.conversionPct, 50);

/* $100 bonus @ 2.50 (+150), hedge @ 1.6667 (-150):
   S = 100*1.5/1.6667 = 90, G = 90*0.6667 = 60, 60% conversion */
var h1 = M.bonusBet(100, 2.5, 5/3);
eq("longshot hedge stake", h1.hedgeStake, 90);
eq("longshot guaranteed", h1.guaranteed, 60);
eq("longshot conversion", h1.conversionPct, 60);

/* bonus bet, EV route: $100 @ 2.50 with a 40% win chance -> 100*0.4*1.5 = 60 */
var e1 = M.bonusBet(100, 2.5, "", 0.4);
eq("ev route", e1.ev, 60);
eq("ev conversion", e1.evConversionPct, 60);
if(e1.hedgeStake !== undefined){ fails++; console.error("FAIL no hedge key when blank"); }
else console.log("ok   no hedge key when blank");

/* longshot EV beats short-favorite EV at equal conversion odds */
var e2 = M.bonusBet(100, 5.0, "", 0.22);
eq("longshot ev 88", e2.ev, 88);

/* --- deposit match with rollover ---
   $200 bonus, 5x rollover, 4.55% hold: wager 1000, cost 45.50, value 154.50 */
var r0 = M.rollover(200, 5, 0.0455);
eq("must wager", r0.mustWager, 1000);
eq("rollover cost", r0.rolloverCost, 45.5);
eq("true value", r0.trueValue, 154.5);
eq("value pct", r0.valuePct, 77.25);
eq("break-even hold", r0.breakEvenHoldPct, 20);

/* predatory rollover: $100, 10x, 12% hold -> -$20: the promo costs money */
var r1 = M.rollover(100, 10, 0.12);
eq("negative true value", r1.trueValue, -20);

/* 1x rollover is free money minus one vig */
var r2 = M.rollover(100, 1, 0.0455);
eq("1x value", r2.trueValue, 95.45);

/* --- profit boost ---
   $50 at 1.9091 -> 2.00, default p = 1/1.9091 = 0.5238:
   extra = 50*(2-1.9091)*0.5238 = 2.381 */
var b0 = M.profitBoost(50, 1.9091, 2.0);
eq("boost extraEV (default p)", b0.extraEV, 50*(2-1.9091)/1.9091, 0.01);
eq("boost per100", b0.extraPer100, b0.extraEV/50*100, 0.01);
eq("boost implied pct", b0.impliedPct, 100/1.9091, 0.01);

/* with own number: $50, 1.9091 -> 2.0, p=0.55 -> 50*0.0909*0.55 = 2.5 */
var b1 = M.profitBoost(50, 1.9091, 2.0, 0.55);
eq("boost extraEV (own p)", b1.extraEV, 50*(2-1.9091)*0.55, 0.01);

/* --- throws --- */
throws("bonusBet zero bonus", function(){ M.bonusBet(0, 2.0, 2.0); });
throws("bonusBet price <= 1", function(){ M.bonusBet(100, 1.0, 2.0); });
throws("bonusBet bad hedge", function(){ M.bonusBet(100, 2.0, 1.0); });
throws("bonusBet bad prob", function(){ M.bonusBet(100, 2.0, "", 1.5); });
throws("rollover zero bonus", function(){ M.rollover(0, 5, 0.0455); });
throws("rollover zero multiple", function(){ M.rollover(100, 0, 0.0455); });
throws("rollover hold >= 1", function(){ M.rollover(100, 5, 1); });
throws("profitBoost zero stake", function(){ M.profitBoost(0, 1.9, 2.0); });
throws("profitBoost not improved", function(){ M.profitBoost(50, 2.0, 2.0); });
throws("profitBoost worse price", function(){ M.profitBoost(50, 2.0, 1.9); });

if(fails){ console.log(fails + " FAILURES"); process.exit(1); }
console.log("test-bonus: all assertions passed");
