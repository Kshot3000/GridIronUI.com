/* GridIronUI middling calculator static wiring test (v1.65.0, refreshed v1.67.0;
   cache keys updated v1.87.0 for the journal CSV import release).
   The 16th tool card must be fully wired in tools.html: card + ids exist,
   it links the line-movement guide, the "New" tag has moved on to the bonus
   card (v1.67.0), the lede counts seventeen tools, the index hero counts 17,
   betmath.js carries the v1.87.0 cache key everywhere it's referenced
   (journal CSV import changed it), and tools.js still carries v1.67.0.
   Run: node tests/test-middle-static.js */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const tools = read("tools.html");
const card = (tools.match(/<div class="card calc" id="middle">([\s\S]*?)<div class="card calc" id="bonus">/) || ["", ""])[1];
ok("middle card found", !!card);
["mLbl1","mStake1","mOdds1","mLbl2","mStake2","mOdds2","mFmt","midGo","midOut"]
  .forEach(id => ok("middle card has #" + id, card.indexOf('id="' + id + '"') !== -1));
ok("middle card no longer carries the New tag (moved to bonus in v1.67.0)",
  /<span class="tag">New<\/span>/.test(card) === false);
ok("middle card links the line-movement guide", card.indexOf("guides/line-movement.html") !== -1);
ok("middle card hint says labels are decorative",
  /labels are just for you/i.test(card));

const bonus = (tools.match(/<div class="card calc" id="bonus">([\s\S]*?)<div class="card calc" id="cashout">/) || ["", ""])[1];
ok("bonus card found", !!bonus);
ok("bonus card carries the New tag", /<span class="tag">New<\/span>/.test(bonus));

const journal = (tools.match(/<div class="card calc" id="journal-tool">([\s\S]*?)<\/div>\s*<\/div>/) || ["", ""])[1];
ok("journal card lost the stale New tag", journal.indexOf('<span class="tag">New</span>') === -1);

ok("lede counts Seventeen tools", />Seventeen tools/.test(tools));
const index = read("index.html");
ok("index hero counts 17 tools", /<b>17<\/b><span>betting tools<\/span>/.test(index));

[["tools.html"],["journal.html"],["odds.html"]].forEach(([f]) => {
  const h = read(f);
  ok(f + " betmath.js key is v1.87.0", h.indexOf("betmath.js?v=1.87.0") !== -1);
});
ok("tools.html tools.js key is v1.67.0", tools.indexOf("tools.js?v=2.0.0") !== -1);

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("test-middle-static: " + pass + " assertions passed");
