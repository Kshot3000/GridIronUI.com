/* Node tests for BetMath.ticketHedge — run: node tests/test-tickethedge.js */
"use strict";
var M = require("../js/betmath.js");
var fails = 0;
function ok(name, cond){
  if(!cond){ fails++; console.error("FAIL", name); }
  else console.log("ok  ", name);
}
function eq(name, got, want, tol){
  tol = tol || 1e-9;
  var good = Math.abs(got - want) <= tol;
  if(!good){ fails++; console.error("FAIL", name, "got", got, "want", want); }
  else console.log("ok  ", name, "=", got);
}
function throws(name, fn){
  try{ fn(); fails++; console.error("FAIL", name, "(did not throw)"); }
  catch(e){ console.log("ok  ", name, "(" + e.message + ")"); }
}

/* Classic scenario: $100 ticket paying $2,400 in full, hedge the last leg at -110.
   d(-110) = 1.9090909... */
var d = M.americanToDecimal(-110);
var r = M.ticketHedge(100, 2400, d);

eq("rideProfit = ticket minus stake", r.rideProfit, 2300);
/* equal lock: S = T/d ; profit = T - A - S */
eq("equalStake = 2400/d", r.equalStake, 2400/d, 0.011);
eq("equalProfit", r.equalProfit, 2400-100-2400/d, 0.011);
ok("equal lock profit positive here", r.equalProfit > 0);
/* insurance cost = upside given up vs riding */
eq("insuranceCost = ride - lock", r.insuranceCost, 2300-r.equalProfit, 0.011);
/* free-roll: S = A/(d-1) */
eq("freeStake = 100/(d-1)", r.freeStake, 100/(d-1), 0.011);
eq("freeProfitHit", r.freeProfitHit, 2300-100/(d-1), 0.011);
ok("freeProfitMiss is exactly 0", r.freeProfitMiss === 0);
/* custom outcomes */
var c = r.outcomes(500);
eq("custom hit = T-A-hs", c.profitHit, 2400-100-500);
eq("custom miss = hs*d-A-hs", c.profitMiss, 500*d-100-500, 0.011);

/* Short hedge price: $100 ticket paying $300 (3x), hedge at -400 (d=1.25).
   S = 300/1.25 = 240 -> lock profit = -40: the planner must say so honestly,
   not silently. */
var d2 = M.americanToDecimal(-400); /* 1.25 */
var r2 = M.ticketHedge(100, 300, d2);
ok("short-price equal lock goes negative", r2.equalProfit < 0);
eq("short lock profit", r2.equalProfit, -40);
eq("short lock stake = 240", r2.equalStake, 240);
/* free-roll stake at -400 exceeds the ticket's upside — math shows it too */
ok("short free-roll hit profit negative", r2.freeProfitHit < 0);
/* free-roll still returns the stake on a miss */
eq("short free miss still 0", r2.freeProfitMiss, 0);
var c2 = r2.outcomes(240); /* custom stake = equal-lock stake: both sides -40 */
eq("short custom hit", c2.profitHit, -40, 0.011);
eq("short custom miss", c2.profitMiss, -40, 0.011);

/* Decimal-format hedge price: evens */
var r3 = M.ticketHedge(20, 200, 2.0);
eq("evens equalStake = T/2", r3.equalStake, 100);
eq("evens equalProfit", r3.equalProfit, 200-20-100);
eq("evens freeStake = A", r3.freeStake, 20);
eq("evens free hit", r3.freeProfitHit, 200-20-20);

/* rounding: money values land on cents */
ok("equalStake is cents", Math.abs(r.equalStake*100 - Math.round(r.equalStake*100)) < 1e-6);
ok("freeStake is cents", Math.abs(r.freeStake*100 - Math.round(r.freeStake*100)) < 1e-6);

/* error paths */
throws("zero stake", function(){ M.ticketHedge(0, 2400, d); });
throws("negative stake", function(){ M.ticketHedge(-5, 2400, d); });
throws("payout <= stake", function(){ M.ticketHedge(100, 100, d); });
throws("payout < stake", function(){ M.ticketHedge(100, 50, d); });
throws("hedge dec = 1", function(){ M.ticketHedge(100, 2400, 1); });
throws("hedge dec < 1", function(){ M.ticketHedge(100, 2400, 0.9); });
throws("missing args", function(){ M.ticketHedge(100, undefined, d); });
throws("custom zero stake", function(){ r.outcomes(0); });
throws("custom negative stake", function(){ r.outcomes(-10); });

if(fails){ console.error(fails + " FAILURES"); process.exit(1); }
console.log("all ticket-hedge logic tests passed");
