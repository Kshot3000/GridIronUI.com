/* GridIronUI odds-board honesty test — the homepage sells the odds board as a
   "Live" flagship, but the board only loads live lines with the visitor's own
   free Odds API key (v1.69.0 empty state). This guards the expectation-setting
   copy on the homepage card: it must name the key requirement up front, so a
   first-time visitor isn't surprised by the setup screen. Also guards the
   v1.72.0 combined-odds format (decimal parenthesized) in the shipped
   js/odds.js totals renderer. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }

const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
/* isolate the odds-board card (the anchor pointing at odds.html) */
const card = (index.match(/<a class="card" href="odds\.html">[\s\S]*?<\/a>/) || [""])[0];
ok("homepage has an odds-board card", card.length > 0);
ok("odds card names the free API-key requirement",
  /free odds api key/i.test(card));
ok("odds card keeps the never-sample-lines honesty line",
  /never sample lines/i.test(card));
ok("odds card keeps its Live tag", card.indexOf(">Live<") !== -1);

const oddsJs = fs.readFileSync(path.join(ROOT, "js", "odds.js"), "utf8");
ok("combined odds decimal is parenthesized in totalsHtml",
  oddsJs.indexOf("toFixed(3)+' dec)</span>") !== -1);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
