/* GridIronUI core guides math audit (v1.90.0).
   The three guides that shipped without a math test — guides/betting-101.html,
   guides/bet-types.html and guides/advanced.html — carry worked examples with
   real numbers that bettors trust at face value. This test re-derives every
   number in those examples against js/betmath.js's own math, and pins the
   printed copy, so a future edit can't quietly break an example.

   The v1.82.0 audit found and fixed a bad arb stake split in advanced.html
   (tests/test-advanced-arb.js); the arb example stays covered there and is
   not re-pinned here. The v1.90.0 fix caught by this audit: bet-types.html's
   parlay example used to call (1/1.91)^3 ~= 14.4% "the true probability of
   hitting all three at fair odds" — that figure is the market's vig-inclusive
   implied probability; the copy now says so and names the $10.30 parlay tax. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
var read = function(p){ return fs.readFileSync(path.join(ROOT, p), "utf8"); };
var BM = require("../js/betmath.js");

var b101 = read("guides/betting-101.html");
var bt   = read("guides/bet-types.html");
var adv  = read("guides/advanced.html");

/* ================= betting-101 ================= */
ok("betting-101 exists", b101.length > 4000);
/* TOC anchors resolve */
(function(){
  var toc = (b101.match(/<div class="toc">([\s\S]*?)<\/div>/) || ["", ""])[1];
  var anchors = [];
  toc.replace(/href="#([a-z-]+)"/g, function(_, a){ anchors.push(a); return _; });
  ok("betting-101 TOC has 5 entries", anchors.length === 5);
  anchors.forEach(function(a){
    ok("betting-101 anchor #" + a + " resolves",
      new RegExp('<h2 id="' + a + '"').test(b101));
  });
})();
/* the three-format equivalence: -110 == 1.91 == 10/11 */
var d110 = BM.americanToDecimal(-110);
ok("-110 -> decimal ~1.91 (recomputed " + d110.toFixed(4) + ")",
  Math.abs(d110 - 1.9091) < 0.001);
ok("guide says 1.91 decimal", b101.indexOf("1.91 decimal") !== -1);
ok("10/11 fractional -> decimal ~1.91 (recomputed " + BM.fractionalToDecimal(10, 11).toFixed(4) + ")",
  Math.abs(BM.fractionalToDecimal(10, 11) - 1.9091) < 0.001);
ok("guide says 10/11 fractional", b101.indexOf("10/11 fractional") !== -1);
/* implied probability of -110 */
var imp110 = BM.impliedFromAmerican(-110);
ok("-110 implies 52.38% (recomputed " + (imp110*100).toFixed(2) + "%)",
  Math.abs(imp110*100 - 52.38) < 0.01);
ok("guide prints 52.38%", b101.indexOf("52.38%") !== -1);
/* payout examples */
var p150 = BM.payout(BM.americanToDecimal(-150), 150);
ok("$150 at -150 returns $250 total (recomputed $" + p150.total + ")",
  p150.total === 250 && p150.profit === 100);
ok("guide prints $250 total ($100 profit + $150 stake)",
  b101.indexOf("$250 total ($100 profit + $150 stake)") !== -1);
var p130 = BM.payout(BM.americanToDecimal(130), 100);
ok("$100 at +130 returns $230 total (recomputed $" + p130.total + ")",
  p130.total === 230 && p130.profit === 130);
ok("guide prints $230 total ($130 profit + $100 stake)",
  b101.indexOf("$230 total ($130 profit + $100 stake)") !== -1);
var p250 = BM.payout(2.50, 50);
ok("$50 at 2.50 returns $125 (recomputed $" + p250.total + ")",
  p250.total === 125);
ok("guide prints $125 total", b101.indexOf("$125 total") !== -1);

/* ================= bet-types ================= */
ok("bet-types exists", bt.length > 4000);
(function(){
  var toc = (bt.match(/<div class="toc">([\s\S]*?)<\/div>/) || ["", ""])[1];
  var anchors = [];
  toc.replace(/href="#([a-z-]+)"/g, function(_, a){ anchors.push(a); return _; });
  ok("bet-types TOC has 8 entries", anchors.length === 8);
  anchors.forEach(function(a){
    ok("bet-types anchor #" + a + " resolves",
      new RegExp('<h2 id="' + a + '"').test(bt));
  });
})();
/* moneyline payout examples */
ok("Bills -180: $180 wins $100 (recomputed $" +
   BM.payout(BM.americanToDecimal(-180), 180).profit + ")",
  BM.payout(BM.americanToDecimal(-180), 180).profit === 100);
ok("Dolphins +155: $100 wins $155 (recomputed $" +
   BM.payout(BM.americanToDecimal(155), 100).profit + ")",
  BM.payout(BM.americanToDecimal(155), 100).profit === 155);
/* totals arithmetic: 30-24=54, 24-20=44 */
ok("30-24 = 54 combined (over 48.5)", (30 + 24) === 54 && (30 + 24) > 48.5);
ok("24-20 = 44 combined (under 48.5)", (24 + 20) === 44 && (24 + 20) < 48.5);
/* parlay example, re-derived */
var par = BM.parlayDecimal([1.91, 1.91, 1.91]);
ok("three 1.91 legs combine to ~6.97 (recomputed " + par.toFixed(3) + ")",
  Math.abs(par - 6.97) < 0.01);
ok("guide prints 6.97", bt.indexOf("6.97") !== -1);
var parPay = BM.payout(par, 10);
ok("$10 at " + par.toFixed(3) + " returns ~$69.70 (recomputed $" + parPay.total.toFixed(2) + ")",
  Math.abs(parPay.total - 69.70) < 0.05);
ok("guide prints $69.70 ($59.70 profit)",
  bt.indexOf("$69.70 ($59.70 profit)") !== -1);
var impPar = Math.pow(1 / 1.91, 3);
ok("market-implied 3-leg probability ~= 14.4% (recomputed " + (impPar*100).toFixed(2) + "%)",
  Math.abs(impPar*100 - 14.35) < 0.1);
ok("guide prints 14.4%", bt.indexOf("14.4%") !== -1);
/* v1.90.0 honesty fix: 14.4% is vig-inclusive implied, not true fair probability */
ok("guide no longer calls 14.4% the true fair probability",
  bt.indexOf("The true probability of hitting all three at fair odds") === -1);
ok("guide names vig-inclusive implied probability",
  bt.indexOf("vig-inclusive") !== -1);
ok("guide names the 12.5% true-coin-flip benchmark",
  bt.indexOf("12.5%") !== -1 && Math.abs(Math.pow(0.5, 3) * 100 - 12.5) < 1e-9);
var fairPay = BM.payout(BM.parlayDecimal([2.00, 2.00, 2.00]), 10);
ok("fair 2.00 x3 pays $80 on $10 (recomputed $" + fairPay.total + ")",
  fairPay.total === 80);
ok("guide prints $80 on $10", bt.indexOf("$80 on $10") !== -1);
var parlayTax = fairPay.total - parPay.total;
ok("parlay tax is ~$10.30 (recomputed $" + parlayTax.toFixed(2) + ")",
  Math.abs(parlayTax - 10.30) < 0.05);
ok("guide names the $10.30 gap", bt.indexOf("$10.30") !== -1);
/* futures example: +600 on $100 wins $600 */
ok("Chiefs +600: $100 wins $600 (recomputed $" +
   BM.payout(BM.americanToDecimal(600), 100).profit + ")",
  BM.payout(BM.americanToDecimal(600), 100).profit === 600);
/* teaser: 6 points moves -7.5 to -1.5 and +1.5 to +7.5 */
ok("6-pt teaser moves -7.5 to -1.5 and +1.5 to +7.5",
  (-7.5 + 6) === -1.5 && (1.5 + 6) === 7.5);
ok("guide prints teased legs", bt.indexOf("−1.5") !== -1 && bt.indexOf("+7.5") !== -1);

/* ================= advanced ================= */
ok("advanced exists", adv.length > 5000);
(function(){
  var toc = (adv.match(/<div class="toc">([\s\S]*?)<\/div>/) || ["", ""])[1];
  var anchors = [];
  toc.replace(/href="#([a-z-]+)"/g, function(_, a){ anchors.push(a); return _; });
  ok("advanced TOC has 8 entries", anchors.length === 8);
  anchors.forEach(function(a){
    ok("advanced anchor #" + a + " resolves",
      new RegExp('<h2 id="' + a + '"').test(adv));
  });
})();
/* EV example: 40% at +170 */
var ev = BM.expectedValue(0.40, BM.americanToDecimal(170));
ok("40% at +170 is +$0.08 EV per $1 (recomputed " + ev.evPerStake.toFixed(2) + ")",
  Math.abs(ev.evPerStake - 0.08) < 0.001);
ok("guide prints +$0.08 per dollar", adv.indexOf("+$0.08 per dollar") !== -1);
var imp170 = BM.impliedFromAmerican(170);
ok("+170 implies ~37.0% (recomputed " + (imp170*100).toFixed(1) + "%)",
  Math.abs(imp170*100 - 37.0) < 0.05);
ok("guide prints 37.0%", adv.indexOf("37.0%") !== -1);
/* vig example: -110/-110 */
var impA = BM.impliedFromAmerican(-110);
ok("-110/-110 implies 52.38% a side, 104.76% total (recomputed " +
   (impA*100).toFixed(2) + "% / " + (impA*200).toFixed(2) + "%)",
  Math.abs(impA*100 - 52.38) < 0.01 && Math.abs(impA*200 - 104.76) < 0.01);
ok("guide prints 52.38% and 104.76%",
  adv.indexOf("52.38%") !== -1 && adv.indexOf("104.76%") !== -1);
/* no-vig example: -150 vs +130 */
var nv = BM.noVig(-150, 130);
ok("no-vig of -150/+130 is 58.0%/42.0% (recomputed " +
   (nv.p1*100).toFixed(1) + "% / " + (nv.p2*100).toFixed(1) + "%)",
  Math.abs(nv.p1*100 - 58.0) < 0.1 && Math.abs(nv.p2*100 - 42.0) < 0.1);
ok("guide prints 58.0% and 42.0%",
  adv.indexOf("58.0%") !== -1 && adv.indexOf("42.0%") !== -1);
ok("fair odds -138/+138 (recomputed " + nv.fair1 + "/" + nv.fair2 + ")",
  nv.fair1 === -138 && nv.fair2 === 138);
ok("guide prints fair -138, +138", adv.indexOf("−138") !== -1 && adv.indexOf("+138") !== -1);
ok("guide prints 60.0% / 43.5% / 103.5%",
  adv.indexOf("60.0%") !== -1 && adv.indexOf("43.5%") !== -1 && adv.indexOf("103.5%") !== -1);
/* line shopping: 52.5% at -110 vs -105 */
function shopEV(winPct, american){
  var d = BM.americanToDecimal(american);
  return BM.expectedValue(winPct, d).evPerStake * 100; /* per $100 stake */
}
var ev110 = shopEV(0.525, -110), ev105 = shopEV(0.525, -105);
ok("52.5% at -110: +$0.23 EV per $100 (recomputed $" + ev110.toFixed(2) + ")",
  Math.abs(ev110 - 0.23) < 0.01);
ok("52.5% at -105: +$2.50 EV per $100 (recomputed $" + ev105.toFixed(2) + ")",
  Math.abs(ev105 - 2.50) < 0.01);
ok("guide prints +$0.23 and +$2.50",
  adv.indexOf("+$0.23") !== -1 && adv.indexOf("+$2.50") !== -1);
ok("1000 bets: +$227 and +$2,500 (recomputed $" +
   Math.round(ev110*1000) + " / $" + Math.round(ev105*1000) + ")",
  Math.abs(ev110*1000 - 227) < 5 && Math.abs(ev105*1000 - 2500) < 5);
ok("guide prints +$227 and +$2,500",
  adv.indexOf("+$227") !== -1 && adv.indexOf("+$2,500") !== -1);
ok("elevenfold multiple (recomputed " + (ev105/ev110).toFixed(1) + "x)",
  ev105/ev110 > 10 && ev105/ev110 < 11.5);
ok("guide prints elevenfold", adv.indexOf("elevenfold") !== -1);
/* hedge example: $100 future at +800, $390 at -130 (deliberate partial hedge —
   not equalized; re-derived with payout() rather than hedge()) */
var fut = BM.payout(BM.americanToDecimal(800), 100);
ok("$100 at +800 pays $900 total (recomputed $" + fut.total + ")",
  fut.total === 900);
ok("guide prints $900 total", adv.indexOf("$900 total") !== -1);
var hd = BM.payout(BM.americanToDecimal(-130), 390);
ok("$390 at -130 wins $300 (recomputed $" + hd.profit.toFixed(2) + ")",
  Math.abs(hd.profit - 300) < 0.01);
ok("Bills win: $900 - $390 = $510; Chiefs win: $300 - $100 = $200",
  fut.total - 390 === 510 && hd.profit - 100 === 200);
ok("guide prints $510 and $200 profit window",
  adv.indexOf("$510") !== -1 && adv.indexOf("$200") !== -1);
/* middle example: wins by 3..6 land inside (-2.5, +6.5) */
ok("margins 3,4,5,6 all beat -2.5 and +6.5 underdog",
  [3, 4, 5, 6].every(function(m){ return m > 2.5 && m < 6.5; }));
ok("guide names 3, 4, 5, 6", adv.indexOf("3, 4, 5 or 6") !== -1);
/* key numbers copy */
ok("guide names 15% (by 3) and 9% (by 7)",
  adv.indexOf("15%") !== -1 && adv.indexOf("~9%") !== -1);
ok("guide names 20-25 cents half-point value", adv.indexOf("20–25 cents") !== -1);
/* CLV example: +3.5 to +2.5 */
ok("guide CLV example: bet +3.5, closes +2.5",
  adv.indexOf("+3.5") !== -1 && adv.indexOf("+2.5") !== -1);

console.log("core guides math: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
