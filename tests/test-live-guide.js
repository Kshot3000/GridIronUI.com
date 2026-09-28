/* GridIronUI live-betting guide test (v1.59.0).
   New 5th guide guides/live-betting.html must be fully wired: TOC anchors
   resolve, every cross-link target exists, footer/index/sitemap/bet-types
   all point at it, guide math stays exact, and cache keys are current. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const guide = read("guides/live-betting.html");
ok("guide file exists", guide.length > 5000);

/* TOC anchors resolve to h2 ids */
const toc = (guide.match(/<div class="toc">([\s\S]*?)<\/div>/) || ["", ""])[1];
const anchors = [...toc.matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
ok("TOC has 8 entries", anchors.length === 8);
anchors.forEach(a => ok("anchor #" + a + " resolves to an h2",
  new RegExp('<h2 id="' + a + '"').test(guide)));

/* cross-link targets exist */
[["tools.html", "vig"], ["tools.html", "hedge"], ["tools.html", "tickethedge"],
 ["tools.html", "cashout"]].forEach(([f, a]) => {
  ok("../" + f + "#" + a + " target exists",
    new RegExp('id="' + a + '"').test(read(f)));
});
["scores.html", "journal.html", "weather.html"].forEach(f =>
  ok("../" + f + " exists", fs.existsSync(path.join(ROOT, f))));
["bankroll.html", "advanced.html"].forEach(f =>
  ok("sibling guide " + f + " exists", fs.existsSync(path.join(ROOT, "guides", f))));

/* guide math stays exact (guards against sloppy edits) */
ok("live -115/-115 hold math intact",
  guide.indexOf("53.49%") !== -1 && guide.indexOf("6.98%") !== -1);
ok("pregame -110/-110 hold math intact", guide.indexOf("4.76%") !== -1);
ok("+240 EV example intact",
  guide.indexOf("29.4%") !== -1 && guide.indexOf("+$0.19") !== -1);
ok("hedge example intact ($50 +600, $210 at -150, lock $140)",
  guide.indexOf("$210") !== -1 && guide.indexOf("$140 profit") !== -1);
ok("middle window 4-10 intact", guide.indexOf("4–10") !== -1);

/* wiring */
const index = read("index.html");
ok("index hero counts 5 guides",
  /<b>5<\/b><span>in-depth guides<\/span>/.test(index));
const cards = (index.match(/class="card" href="guides\/[a-z0-9-]+\.html"/g) || []).length;
ok("index has 5 guide cards", cards === 5);
ok("index links the new guide", index.indexOf('href="guides/live-betting.html"') !== -1);

const sitejs = read("js/site.js");
ok("footer Learn list links the new guide",
  sitejs.indexOf('guides/live-betting.html') !== -1);
ok("footer still keeps BTC tip address (not Pearl)",
  sitejs.indexOf("3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK") !== -1);

const sitemap = read("sitemap.xml");
ok("sitemap lists the new guide",
  sitemap.indexOf("https://gridironui.xyz/guides/live-betting.html") !== -1);

const bettypes = read("guides/bet-types.html");
ok("bet-types #live section links the full guide",
  bettypes.indexOf('href="live-betting.html"') !== -1);

/* head hygiene on the new page */
ok("title present", /<title>Live Betting Strategy/.test(guide));
ok("canonical points at custom domain",
  guide.indexOf('<link rel="canonical" href="https://gridironui.xyz/guides/live-betting.html">') !== -1);
ok("meta description present", /<meta name="description" content="[^"]{50,}"/.test(guide));
ok("new guide uses current site.js key",
  guide.indexOf("../js/site.js?v=1.59.0") !== -1);
ok("new guide uses current style.css key",
  guide.indexOf("../css/style.css?v=1.59.0") !== -1);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
