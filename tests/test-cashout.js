/* GridIronUI cash-out evaluator — pure math tests (BetMath.cashout).
   Run: node tests/test-cashout.js */
"use strict";
const BetMath = require("../js/betmath.js");
let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }
function eq(name, got, want){ ok(name + " (got " + got + ", want " + want + ")", Math.abs(got - want) < 0.005); }

/* Worked example: $100 at +150, same side now -110.
   d_bet=2.5, d_now=1.9090909..., fair value = 250/1.9090909 = 130.95 */
let r = BetMath.cashout(100, 2.5, 1 + 100/110, 120);
eq("fair value", r.fairValue, 130.95);
eq("book margin %", r.bookMarginPct, 8.36);
eq("DIY hedge stake", r.diyHedgeStake, 119.05);
eq("DIY locked return", r.diyLockedReturn, 130.95);
eq("DIY profit", r.diyProfit, 30.95);
eq("ride EV", r.rideEV, 30.95);
eq("offer profit", r.offerProfit, 20);
ok("decline verdict", r.takeOffer === false && r.close === false);

/* Generous offer above fair: take it */
r = BetMath.cashout(100, 2.5, 1 + 100/110, 135);
ok("take verdict", r.takeOffer === true && r.close === false);
eq("negative margin", r.bookMarginPct, -3.09);
eq("offer profit", r.offerProfit, 35);

/* Within 3% of fair: close call, not a take */
r = BetMath.cashout(100, 2.5, 1 + 100/110, 130);
ok("close verdict", r.takeOffer === false && r.close === true);

/* Offer at/above true fair value (130.9524): take */
r = BetMath.cashout(100, 2.5, 1 + 100/110, 130.96);
ok("at-fair take", r.takeOffer === true);

/* Longshot example: $50 at +500, now +200. value = 300/3 = 100.
   DIY hedge: 300*(2/3) = 200 on the other side at fair 1.5 -> 200*1.5 = 300 either way */
r = BetMath.cashout(50, 6, 3, 90);
eq("longshot fair value", r.fairValue, 100);
eq("longshot DIY stake", r.diyHedgeStake, 200);
eq("longshot locked", r.diyLockedReturn, 100);
ok("longshot decline", r.takeOffer === false);

/* DIY hedge equalizes payouts: stake on other side * fair two-way price = full payout */
const db = 2.5, dn = 1 + 100/110;
const rr = BetMath.cashout(100, db, dn, 120);
const oppFair = dn / (dn - 1);
eq("DIY hedge equalizes", rr.diyHedgeStake * oppFair, 100 * db);

/* Validation */
function throws(name, fn){ let t = false; try{ fn(); }catch(e){ t = true; } ok(name, t); }
throws("stake 0", () => BetMath.cashout(0, 2.5, 2, 120));
throws("stake negative", () => BetMath.cashout(-10, 2.5, 2, 120));
throws("orig decimal 1", () => BetMath.cashout(100, 1, 2, 120));
throws("now decimal 1", () => BetMath.cashout(100, 2.5, 1, 120));
throws("offer negative", () => BetMath.cashout(100, 2.5, 2, -5));
throws("stake NaN", () => BetMath.cashout(NaN, 2.5, 2, 120));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
