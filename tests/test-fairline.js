/* Unit tests for the no-vig fair moneyline line on the odds board
   (js/odds-logic.js fairMoneyline). Verifies the vig is actually removed
   from the consensus pair, prices keep their favorite/dog orientation,
   probabilities sum to 100%, hold math is right, and that a missing side
   yields no fair price rather than a guess.
   Run: node tests/test-fairline.js */
"use strict";
var L = require("../js/odds-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function close(a, b, tol){ return Math.abs(a-b) <= (tol||1e-6); }

/* symmetric -110/-110 consensus (decimal 1+100/110) */
var pickem = { ml: { a: {pr: 1.9090909}, h: {pr: 1.9090909} }, n: 2 };
var f = L.fairMoneyline(pickem);
assert(f !== null, "symmetric consensus yields a fair price");
assert(f.a.am === "+100" && f.h.am === "+100",
       "pick'em fair is +100/+100 (got "+f.a.am+"/"+f.h.am+")");
assert(close(f.a.prob, 50, 0.001) && close(f.h.prob, 50, 0.001),
       "pick'em fair probs are 50/50");
assert(close(f.a.prob + f.h.prob, 100, 0.01), "fair probs sum to 100%");
assert(close(f.holdPct, 4.76, 0.02),
       "standard -110/-110 hold is ~4.76% (got "+f.holdPct+")");

/* favorite/dog consensus: away 1.50 (-200), home 2.75 (+175) */
var favdog = { ml: { a: {pr: 1.50}, h: {pr: 2.75} }, n: 3 };
var g = L.fairMoneyline(favdog);
assert(g !== null, "favorite/dog consensus yields a fair price");
assert(g.a.prob > 50 && g.h.prob < 50,
       "fair probs keep favorite/dog orientation (away "+g.a.prob+"%)");
assert(g.a.am.charAt(0) === "-" && g.h.am.charAt(0) === "+",
       "fair American keeps signs (got "+g.a.am+"/"+g.h.am+")");
assert(close(g.a.prob + g.h.prob, 100, 0.01), "fav/dog fair probs sum to 100%");
assert(close(g.holdPct, 3.03, 0.05),
       "1.50/2.75 pair hold is ~3.03% (got "+g.holdPct+")");
/* the favorite's fair price is gentler than the consensus price: the
   whole point of removing the vig */
var favConsAm = -200, fairFav = parseInt(g.a.am, 10);
assert(Math.abs(fairFav) < Math.abs(favConsAm),
       "vig removal softens the favorite's price ("+g.a.am+" vs -200)");

/* degenerate inputs: never invent a fair price off one side */
assert(L.fairMoneyline(null) === null, "null consensus -> null");
assert(L.fairMoneyline({}) === null, "consensus without ml -> null");
assert(L.fairMoneyline({ml:{a:{pr:1.9},h:null}}) === null,
       "one-sided moneyline -> null");
assert(L.fairMoneyline({ml:{a:{pr:0.5},h:{pr:2.0}}}) === null,
       "impossible price (<=1) -> null");
assert(L.fairMoneyline({ml:{a:{pr:NaN},h:{pr:2.0}}}) === null,
       "NaN price -> null");

/* single-book consensus still gets a fair price (it's that book's pair) */
var solo = { ml: { a: {pr: 1.8}, h: {pr: 2.2} }, n: 1 };
var s = L.fairMoneyline(solo);
assert(s !== null && close(s.holdPct, 1.01, 0.05),
       "single-book pair holds ~1.01% (got "+(s&&s.holdPct)+")");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all fairline assertions passed");
