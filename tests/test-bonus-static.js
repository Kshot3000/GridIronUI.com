/* GridIronUI bonus & promo value static wiring test (v1.67.0; cache keys
   updated v1.87.0 for the journal CSV import release).
   The 17th tool card must be fully wired in tools.html: card + ids exist,
   the "New" tag moved here (off the middling card), the lede counts
   seventeen tools, the index hero counts 17, betmath.js carries the v1.87.0
   cache key everywhere it's referenced (journal CSV import changed it),
   tools.js still carries v1.67.0 (unchanged), and the card links the
   odds board.
   Run: node tests/test-bonus-static.js */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const tools = read("tools.html");
const card = (tools.match(/<div class="card calc" id="bonus">([\s\S]*?)<div class="card calc" id="cashout">/) || ["", ""])[1];
ok("bonus card found", !!card);
["bType","bBonus","bPrice","bFmt","bHedge","bProb",
 "rBonus","rMult","rHold",
 "pPromoStake","pOrig","pBoost","pPromoFmt","pProb",
 "bBonusFields","bRolloverFields","bBoostFields","bGo","bOut"]
  .forEach(id => ok("bonus card has #" + id, card.indexOf('id="' + id + '"') !== -1));
ok("bonus card carries the New tag", /<span class="tag">New<\/span>/.test(card));
ok("bonus card links the odds board", card.indexOf('href="odds.html"') !== -1);
ok("rollover fields start hidden", /id="bRolloverFields" style="display:none"/.test(card));
ok("boost fields start hidden", /id="bBoostFields" style="display:none"/.test(card));
ok("hold presets documented in the card", card.indexOf("4.55%") !== -1);

const middle = (tools.match(/<div class="card calc" id="middle">([\s\S]*?)<div class="card calc" id="bonus">/) || ["", ""])[1];
ok("middle card found", !!middle);
ok("middle card lost the stale New tag", middle.indexOf('<span class="tag">New</span>') === -1);

ok("lede counts Seventeen tools", />Seventeen tools/.test(tools));
const index = read("index.html");
ok("index hero counts 17 tools", /<b>17<\/b><span>betting tools<\/span>/.test(index));

[["tools.html"],["journal.html"],["odds.html"]].forEach(([f]) => {
  const h = read(f);
  ok(f + " betmath.js key is v1.87.0", h.indexOf("betmath.js?v=1.87.0") !== -1);
});
ok("tools.html tools.js key is v1.67.0", tools.indexOf("tools.js?v=2.0.0") !== -1);

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("test-bonus-static: " + pass + " assertions passed");
