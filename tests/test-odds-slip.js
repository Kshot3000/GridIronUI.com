/* Node tests for js/odds-slip.js — run: node tests/test-odds-slip.js */
var S = require("../js/odds-slip.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra||""); }
  else console.log("ok  ", name);
}
function leg(id, price, side){
  return { id:id, game:"Chiefs @ Raiders", market:"h2h", side:side||id,
           book:"draftkings", bookTitle:"DraftKings", label:"test", price:price };
}

/* dec2am */
ok("dec2am 1.91 = -110", S.dec2am(1.91) === -110, S.dec2am(1.91));
ok("dec2am 2.5 = +150", S.dec2am(2.5) === "+150", S.dec2am(2.5));
ok("dec2am 2.0 = +100", S.dec2am(2.0) === "+100", S.dec2am(2.0));
ok("dec2am 1 = — (guard)", S.dec2am(1) === "—", S.dec2am(1));
ok("dec2am NaN = — (guard)", S.dec2am(NaN) === "—", S.dec2am(NaN));

/* combined + payout */
var slip = [leg("a", 1.91), leg("b", 2.10)];
ok("combined 1.91*2.10 ≈ 4.011", Math.abs(S.combined(slip) - 4.011) < 1e-9, S.combined(slip));
var p = S.payout(slip, 50);
ok("payout total = 200.55", Math.abs(p.total - 200.55) < 1e-9, p.total);
ok("payout profit = 150.55", Math.abs(p.profit - 150.55) < 1e-9, p.profit);
ok("payout combinedAm = +301", p.combinedAm === "+301", p.combinedAm);
var p1 = S.payout([leg("a", 1.91)], 100);
ok("single leg: total 191, profit 91", Math.abs(p1.total-191)<1e-9 && Math.abs(p1.profit-91)<1e-9, JSON.stringify(p1));
ok("single leg american -110", p1.combinedAm === -110, p1.combinedAm);
ok("payout empty -> null", S.payout([], 100) === null);
ok("payout bad stake -> 0", S.payout([leg("a",1.91)], "abc").total === 0);

/* toggle / has / remove / clear */
var t = [];
ok("toggle add -> true", S.toggle(t, leg("x", 1.5)) === true);
ok("has after add", S.has(t, "x") === true);
ok("toggle same -> false (removed)", S.toggle(t, leg("x", 1.5)) === false);
ok("has after remove", S.has(t, "x") === false);
S.toggle(t, leg("x", 1.5)); S.toggle(t, leg("y", 2.0));
S.remove(t, "x");
ok("remove keeps other", t.length === 1 && t[0].id === "y");
S.remove(t, "nope");
ok("remove missing -> no crash", t.length === 1);
S.clear(t);
ok("clear empties", t.length === 0);

/* reprice */
var r = [leg("x", 1.91), leg("y", 2.00)];
var moved = S.reprice(r, {"x": 1.87, "y": 2.00, "z": 5.0});
ok("moved flags only x", moved.length === 1 && moved[0] === "x", JSON.stringify(moved));
ok("price updated, prevPrice kept", r[0].price === 1.87 && r[0].prevPrice === 1.91, JSON.stringify(r[0]));
ok("unchanged leg untouched", r[1].prevPrice === undefined && r[1].price === 2.00);
var r2 = [leg("q", 1.5)];
ok("reprice empty map -> none moved", S.reprice(r2, {}).length === 0 && r2[0].price === 1.5);

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL ODDS-SLIP TESTS PASSED");
process.exit(fails ? 1 : 0);
