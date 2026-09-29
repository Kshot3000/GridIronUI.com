/* GridIronUI bankroll guide test (v1.81.0).
   guides/bankroll.html had two broken worked examples a sharp reader would
   catch: (1) the flat-betting example carried a leftover editing artifact
   ("nets about +$8 per 100 bets after juice... wait, let's be precise:")
   that contradicted its own arithmetic; (2) the line-shopping example mixed
   stake sizes mid-comparison ($110 stakes at -110, then $105 stakes at -105)
   and its headline numbers (-$60 / +$204) were wrong on the stated stakes.
   Both are fixed: flat betting shows +$118 per 100 bets at 53%/-110, and
   the line-shopping example holds a constant $110 stake (26 wins x $104.76
   at -105 vs 26-24 at -110 = -$40 vs +$84, a $124 swing). This test pins the
   corrected copy AND re-derives the arithmetic, so a future edit can't
   quietly re-break the math. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
var read = function(p){ return fs.readFileSync(path.join(ROOT, p), "utf8"); };

var guide = read("guides/bankroll.html");
ok("guide file exists", guide.length > 4000);

/* no leftover editing artifacts anywhere in the guides */
["guides/bankroll.html", "guides/betting-101.html", "guides/bet-types.html",
 "guides/advanced.html", "guides/live-betting.html", "guides/line-movement.html",
 "guides/props.html"].forEach(function(g){
  var t = read(g);
  ok(g + " has no editing artifacts", t.indexOf("wait, let's be precise") === -1 &&
    t.indexOf("... wait,") === -1 && t.indexOf("nets about +$8 per 100 bets") === -1);
});

/* TOC anchors resolve to h2 ids */
var toc = (guide.match(/<div class="toc">([\s\S]*?)<\/div>/) || ["", ""])[1];
var anchors = (toc.match(/href="#([a-z-]+)"/g) || []).map(function(m){ return m.slice(7, -1); });
ok("TOC has 6 entries", anchors.length === 6);
anchors.forEach(function(a){
  ok("anchor #" + a + " resolves to an h2", new RegExp('<h2 id="' + a + '"').test(guide));
});

/* cross-link targets exist */
var tools = read("tools.html");
ok("tools.html#kelly target exists", tools.indexOf('id="kelly"') !== -1);
ok("../tools.html#kelly linked", guide.indexOf("../tools.html#kelly") !== -1);
ok("../odds.html linked", guide.indexOf("../odds.html") !== -1);
ok("../responsible-gambling.html linked", guide.indexOf("../responsible-gambling.html") !== -1);
ok("../responsible-gambling.html exists", fs.existsSync(path.join(ROOT, "responsible-gambling.html")));
var advanced = read("guides/advanced.html");
ok("advanced guide #clv anchor exists", advanced.indexOf('id="clv"') !== -1);
ok("advanced.html#clv linked", guide.indexOf("advanced.html#clv") !== -1);

/* ---- flat-betting example: math re-derived ---- */
/* At -110, $100 to win $90.91; 53% of 100 bets = 53 wins, 47 losses */
var flatProfit = 53 * (100 / 1.1) - 47 * 100; /* -110: win $90.9090... per $100 staked */
ok("flat-betting example nets +$118 per 100 bets (recomputed: " + flatProfit.toFixed(2) + ")",
  Math.abs(flatProfit - 118.18) < 0.05);
ok("guide prints the +$118 figure", guide.indexOf("+$118 per 100 bets") !== -1);
ok("guide shows the 53 x $90.91 - 47 x $100 working", guide.indexOf("53 wins × $90.91") !== -1 &&
  guide.indexOf("47 losses × $100") !== -1 && guide.indexOf("$4,818") !== -1 &&
  guide.indexOf("$4,700") !== -1);
ok("52.38% break-even for -110 intact", guide.indexOf("52.38%") !== -1);

/* ---- line-shopping example: math re-derived, constant $110 stake ---- */
/* -110: $110 to win $100; -105: $110 to win $104.7619... */
var at110 = 26 * 100 - 24 * 110;
ok("26-24 at -110 with $110 stakes nets -$40 (recomputed: " + at110 + ")", at110 === -40);
var at105 = 26 * (110 * 100 / 105) - 24 * 110;
ok("26-24 at -105 with $110 stakes nets +$83.76 (recomputed: " + at105.toFixed(2) + ")",
  Math.abs(at105 - 83.76) < 0.05);
ok("price-only swing is $124 (recomputed: " + (at105 - at110).toFixed(2) + ")",
  Math.abs((at105 - at110) - 123.76) < 0.05);
ok("guide prints the -$40 figure", guide.indexOf("nets −$40") !== -1);
ok("guide prints the +$84 figure", guide.indexOf("+$84") !== -1);
ok("guide prints the $124 swing", guide.indexOf("$124 swing") !== -1);
ok("guide shows the -105 working (26 x $104.76, 24 x $110)",
  guide.indexOf("26 wins × $104.76") !== -1 && guide.indexOf("24 × $110") !== -1);
ok("old broken figures (-$60 / +$204 / $264 swing) are gone",
  guide.indexOf("-$60") === -1 && guide.indexOf("+$204") === -1 &&
  guide.indexOf("$264 swing") === -1);

/* ---- other pinned guide figures ---- */
ok("Kelly worked example: 20% of bankroll at p=0.60/+100",
  guide.indexOf("f* = (1.0 × 0.60 − 0.40) / 1.0 = 0.20") !== -1 &&
  guide.indexOf("20% of bankroll") !== -1);
ok("unit = 1% of bankroll ($10 on $1,000) intact",
  guide.indexOf("1% of your bankroll") !== -1 && guide.indexOf("1 unit = $10") !== -1);

console.log("pass:", pass, "fail:", fail);
process.exit(fail ? 1 : 0);
