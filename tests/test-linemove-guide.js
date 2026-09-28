/* GridIronUI line-movement guide test (v1.64.0).
   New 6th guide guides/line-movement.html must be fully wired: TOC anchors
   resolve, every cross-link target exists, footer/index/sitemap all point at
   it, guide math stays exact, and cache keys are current. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const guide = read("guides/line-movement.html");
ok("guide file exists", guide.length > 6000);

/* TOC anchors resolve to h2 ids */
const toc = (guide.match(/<div class="toc">([\s\S]*?)<\/div>/) || ["", ""])[1];
const anchors = [...toc.matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
ok("TOC has 8 entries", anchors.length === 8);
anchors.forEach(a => ok("anchor #" + a + " resolves to an h2",
  new RegExp('<h2 id="' + a + '"').test(guide)));

/* cross-link targets exist */
const tools = read("tools.html");
[["ev", "../tools.html#ev"], ["kelly", "../tools.html#kelly"], ["vig", "../tools.html#vig"]].forEach(([a, label]) => {
  ok(label + " target exists", new RegExp('id="' + a + '"').test(tools));
});
const advanced = read("guides/advanced.html");
[["clv", "advanced.html#clv"], ["vig", "advanced.html#vig"], ["arb", "advanced.html#arb"],
 ["shop", "advanced.html#shop"]].forEach(([a, label]) => {
  ok(label + " target exists", new RegExp('id="' + a + '"').test(advanced));
});
["odds.html", "journal.html", "weather.html", "injuries.html", "news.html"].forEach(f =>
  ok("../" + f + " exists", fs.existsSync(path.join(ROOT, f))));
["betting-101.html", "advanced.html", "live-betting.html"].forEach(f =>
  ok("sibling guide " + f + " exists", fs.existsSync(path.join(ROOT, "guides", f))));

/* guide math stays exact (guards against sloppy edits) */
ok("-110 implies 52.38% intact", guide.indexOf("52.38%") !== -1);
ok("steam example prices intact (48.5 -> 45.5)",
  guide.indexOf("48.5") !== -1 && guide.indexOf("45.5") !== -1);
ok("wind news-move example intact (47.5 -> 44.5, 22 mph)",
  guide.indexOf("47.5") !== -1 && guide.indexOf("44.5") !== -1 && guide.indexOf("22 mph") !== -1);
ok("CLV example intact (+3.5 Tuesday -> +2.5 close)",
  guide.indexOf("+3.5") !== -1 && guide.indexOf("+2.5") !== -1);
ok("key-numbers example intact (-3 to -4.5, crosses 3 and 4)",
  guide.indexOf("−3 to −4.5") !== -1);
ok("RLM example intact (70% tickets, -7 to -6.5)",
  guide.indexOf("70%") !== -1 && guide.indexOf("−7 to −6.5") !== -1);
ok("honesty: RLM section admits splits aren't shown here",
  guide.indexOf("this site doesn't show them") !== -1);

/* wiring */
const index = read("index.html");
ok("index hero counts 6 guides",
  /<b>6<\/b><span>in-depth guides<\/span>/.test(index));
ok("index hero counts 15 tools",
  /<b>15<\/b><span>betting tools<\/span>/.test(index));
ok("index links the new guide", index.indexOf('href="guides/line-movement.html"') !== -1);
ok("index moves the New tag to the new guide",
  /guides\/line-movement\.html[\s\S]{0,400}?<span class="tag">New<\/span>/.test(index));

const sitejs = read("js/site.js");
ok("footer Learn list links the new guide",
  sitejs.indexOf('guides/line-movement.html') !== -1);
ok("footer still keeps BTC tip address (not Pearl)",
  sitejs.indexOf("3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK") !== -1);

const sitemap = read("sitemap.xml");
ok("sitemap lists the new guide",
  sitemap.indexOf("https://gridironui.xyz/guides/line-movement.html") !== -1);

/* head hygiene on the new page */
ok("title present", /<title>Reading Line Movement/.test(guide));
ok("canonical points at custom domain",
  guide.indexOf('<link rel="canonical" href="https://gridironui.xyz/guides/line-movement.html">') !== -1);
ok("meta description present", /<meta name="description" content="[^"]{50,}"/.test(guide));
ok("new guide uses current site.js key",
  guide.indexOf("../js/site.js?v=1.64.0") !== -1);
ok("new guide uses current style.css key",
  guide.indexOf("../css/style.css?v=1.62.0") !== -1);
ok("footer branding via site.js (donation/21+/helpline live in footer)",
  guide.indexOf('id="site-footer"') !== -1);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
