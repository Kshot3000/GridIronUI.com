/* Node tests for BetMath.combinations + BetMath.roundRobin — run: node tests/test-roundrobin.js */
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
function eqA(name, got, want){
  var good = JSON.stringify(got) === JSON.stringify(want);
  if(!good){ fails++; console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
  else console.log("ok  ", name, "=", JSON.stringify(got));
}

/* ---- combinations ---- */
eqA("C(4,2) has 6 subsets", M.combinations(4, 2).map(String),
    [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]].map(String));
eqA("C(3,3) is the full set", M.combinations(3, 3), [[0,1,2]]);
eqA("C(2,2)", M.combinations(2, 2), [[0,1]]);
eq("C(5,3) count", M.combinations(5, 3).length, 10);
eq("C(6,1) count", M.combinations(6, 1).length, 6);
ok("C(3,4) invalid -> []", M.combinations(3, 4).length === 0);
ok("C(3,0) invalid -> []", M.combinations(3, 0).length === 0);
ok("C(0,2) invalid -> []", M.combinations(0, 2).length === 0);
/* subsets stay in index order (no dup / reversed pairs) */
var c42 = M.combinations(4, 2);
ok("C(4,2) all ascending", c42.every(function(s){ return s[0] < s[1]; }));

/* ---- round robin: 3 equal legs, by 2s, $10 per parlay ----
   each combo pays 4.0x -> 3 parlays, $30 risked.
   all win: $120 back, +$90. worst leg loses: 1 combo pays -> $40 back, +$10. */
var r = M.roundRobin([2.0, 2.0, 2.0], [2], 10);
eq("RR count", r.length, 1);
eq("RR k", r[0].k, 2);
eq("RR parlays", r[0].parlays, 3);
eq("RR totalRisk", r[0].totalRisk, 30);
eq("RR allWinReturn", r[0].allWinReturn, 120);
eq("RR allWinProfit", r[0].allWinProfit, 90);
eq("RR worstLoserReturn", r[0].worstLoserReturn, 40);
eq("RR worstLoserProfit", r[0].worstLoserProfit, 10);
eqA("RR richestCombo", r[0].richestCombo, [1, 2]);
eq("RR richestDec", r[0].richestDec, 4);

/* ---- 2 legs -> 1 parlay, identical to a straight parlay ---- */
var r2 = M.roundRobin([2.0, 3.0], [2], 10)[0];
eq("RR2 parlays", r2.parlays, 1);
eq("RR2 allWinReturn", r2.allWinReturn, 60);
eq("RR2 allWinProfit", r2.allWinProfit, 50);
eq("RR2 worstLoserReturn", r2.worstLoserReturn, 0); /* losing either leg kills the single parlay */
eq("RR2 worstLoserProfit", r2.worstLoserProfit, -10);
eqA("RR2 richestCombo", r2.richestCombo, [1, 2]);

/* ---- mixed legs: [1.91, 2.5, 4.0], by 2s and 3s, $5 each ----
   by 2s: combos pay 4.775, 7.64, 10.0 -> $15 risked, $112.075 back all-win.
   worst loser is leg 3 (its combos pay 17.64 — the most); survivors = only {1,2} -> 4.775.
   return $23.875. by 3s: single 19.1x parlay; a loser means $0 back (-$5). */
var r3 = M.roundRobin([1.91, 2.5, 4.0], [2, 3], 5);
eq("RR3 by2s parlays", r3[0].parlays, 3);
eq("RR3 by2s risk", r3[0].totalRisk, 15);
eq("RR3 by2s allWinReturn", r3[0].allWinReturn, 112.075, 0.01);
eq("RR3 by2s allWinProfit", r3[0].allWinProfit, 97.075, 0.01);
eq("RR3 by2s worstLoserReturn", r3[0].worstLoserReturn, 23.875, 0.01);
eq("RR3 by2s worstLoserProfit", r3[0].worstLoserProfit, 8.875, 0.01);
eqA("RR3 by2s richestCombo", r3[0].richestCombo, [2, 3]);
eq("RR3 by2s richestDec", r3[0].richestDec, 10);
eq("RR3 by3s parlays", r3[1].parlays, 1);
eq("RR3 by3s risk", r3[1].totalRisk, 5);
eq("RR3 by3s allWinReturn", r3[1].allWinReturn, 95.5, 0.01);
eq("RR3 by3s allWinProfit", r3[1].allWinProfit, 90.5, 0.01);
eq("RR3 by3s worstLoserReturn", r3[1].worstLoserReturn, 0);
eq("RR3 by3s worstLoserProfit", r3[1].worstLoserProfit, -5);
eqA("RR3 by3s richestCombo", r3[1].richestCombo, [1, 2, 3]);

/* ---- sizes outside 2..n are filtered, not fatal ---- */
var r4 = M.roundRobin([2.0, 2.0, 2.0], [1, 2, 5, "x"], 10);
eq("RR invalid sizes filtered", r4.length, 1);
eq("RR invalid sizes kept k", r4[0].k, 2);

/* ---- error paths ---- */
function throws(name, fn){
  try{ fn(); fails++; console.error("FAIL", name, "(did not throw)"); }
  catch(e){ console.log("ok  ", name, "(" + e.message + ")"); }
}
throws("RR <2 legs", function(){ M.roundRobin([2.0], [2], 10); });
throws("RR bad odds", function(){ M.roundRobin([2.0, 1.0], [2], 10); });
throws("RR no sizes", function(){ M.roundRobin([2.0, 2.0], [], 10); });
throws("RR zero stake", function(){ M.roundRobin([2.0, 2.0], [2], 0); });
throws("RR negative stake", function(){ M.roundRobin([2.0, 2.0], [2], -5); });
throws("RR stake missing", function(){ M.roundRobin([2.0, 2.0], [2], undefined); });

if(fails){ console.error(fails + " FAILURES"); process.exit(1); }
console.log("all round-robin logic tests passed");
