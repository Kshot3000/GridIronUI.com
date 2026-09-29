/* GridIronUI advanced-guide arbitrage test (v1.82.0).
   guides/advanced.html's arbitrage worked example used to tell readers to
   "stake proportionally ($515/$485 on $1,000)" while claiming "~$23 no
   matter who wins". That split is not proportional: $515 on Chiefs -105
   wins $490.48 ($1,005.48 back) while $485 on Raiders +115 wins $557.75
   ($1,042.75 back) -- a $5.48 vs $42.75 split, not an equal ~$23.
   The corrected split is $524/$476 (verified against js/betmath.js's own
   hedge math: $524 at -105 needs a $475.84 hedge, total $999.84, guaranteed
   profit $23.21). This test pins the corrected copy AND re-derives the
   arithmetic, so a future edit can't quietly re-break the math. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
var read = function(p){ return fs.readFileSync(path.join(ROOT, p), "utf8"); };

var guide = read("guides/advanced.html");
ok("guide file exists", guide.length > 4000);

/* ---- arb example: implied probabilities re-derived ---- */
function americanImplied(a){
  return a < 0 ? (-a) / ((-a) + 100) : 100 / (a + 100);
}
var impA = americanImplied(-105), impB = americanImplied(115);
ok("Chiefs -105 implies ~51.2% (recomputed " + (impA*100).toFixed(2) + "%)",
  Math.abs(impA*100 - 51.22) < 0.01);
ok("Raiders +115 implies ~46.5% (recomputed " + (impB*100).toFixed(2) + "%)",
  Math.abs(impB*100 - 46.51) < 0.01);
var tot = impA + impB;
ok("total implied ~97.7% < 100% so it IS an arb (recomputed " + (tot*100).toFixed(2) + "%)",
  tot < 1 && Math.abs(tot*100 - 97.73) < 0.01);
ok("guide prints 51.2%", guide.indexOf("51.2%") !== -1);
ok("guide prints 46.5%", guide.indexOf("46.5%") !== -1);
ok("guide prints 97.7%", guide.indexOf("97.7%") !== -1);

/* ---- corrected stake split re-derived ---- */
/* stake split must equalize returns: sA * dA = sB * dB with sA + sB = 1000 */
var dA = 1 + 100/105, dB = 1 + 115/100;
var sA = 1000 * impA / tot, sB = 1000 * impB / tot;
ok("proportional split on $1,000 is $524/$476 (recomputed " + sA.toFixed(1) + "/" + sB.toFixed(1) + ")",
  Math.abs(sA - 524) < 1 && Math.abs(sB - 476) < 1);
var retA = 524 * dA, retB = 476 * dB;
ok("both outcomes return ~$1,023 (recomputed " + retA.toFixed(2) + " / " + retB.toFixed(2) + ")",
  Math.abs(retA - 1023) < 1 && Math.abs(retB - 1023) < 1);
var profA = retA - 1000, profB = retB - 1000;
ok("profit is ~$23 either way (recomputed " + profA.toFixed(2) + " / " + profB.toFixed(2) + ")",
  profA > 22 && profA < 24 && profB > 22 && profB < 24);
ok("profits are nearly equal (difference " + Math.abs(profA - profB).toFixed(2) + ")",
  Math.abs(profA - profB) < 1);

/* ---- the old broken split is gone, the corrected one is printed ---- */
ok("guide prints the corrected $524/$476 split", guide.indexOf("$524/$476") !== -1);
ok("guide no longer prints the broken $515/$485 split", guide.indexOf("$515/$485") === -1);

/* ---- light pins on the other verified worked examples (v1.82.0 audit) ---- */
ok("EV example prints +$0.08 per dollar", guide.indexOf("+$0.08 per dollar") !== -1);
ok("no-vig fair odds print -138 / +138", guide.indexOf("Fair odds: Chiefs −138, Raiders +138") !== -1);
ok("line-shopping example prints +$0.23 and +$2.50", guide.indexOf("+$0.23") !== -1 &&
  guide.indexOf("+$2.50") !== -1);
ok("line-shopping prints the elevenfold claim", guide.indexOf("elevenfold") !== -1);
ok("hedging example prints the $200-$510 locked window", guide.indexOf("$200–$510") !== -1);
ok("TOC arb anchor resolves", new RegExp('<h2 id="arb"').test(guide));

console.log(pass + "/" + (pass + fail) + " assertions passed");
process.exit(fail ? 1 : 0);
