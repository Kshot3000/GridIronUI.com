/* GridIronUI props guide test (v1.66.0).
   New 7th guide guides/props.html must be fully wired: TOC anchors
   resolve, every cross-link target exists, footer/index/sitemap all point at
   it, guide math stays exact, and cache keys are current. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const guide = read("guides/props.html");
ok("guide file exists", guide.length > 6000);

/* TOC anchors resolve to h2 ids */
const toc = (guide.match(/<div class="toc">([\s\S]*?)<\/div>/) || ["", ""])[1];
const anchors = [...toc.matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
ok("TOC has 9 entries", anchors.length === 9);
anchors.forEach(a => ok("anchor #" + a + " resolves to an h2",
  new RegExp('<h2 id="' + a + '"').test(guide)));

/* cross-link targets exist */
const tools = read("tools.html");
[["ev", "../tools.html#ev"], ["kelly", "../tools.html#kelly"],
 ["implied", "../tools.html#implied"]].forEach(([a, label]) => {
  ok(label + " target exists", new RegExp('id="' + a + '"').test(tools));
});
const advanced = read("guides/advanced.html");
ok("advanced guide exists for next-link", advanced.length > 1000);
const linemove = read("guides/line-movement.html");
ok("line-movement guide #board anchor exists",
  linemove.indexOf('id="board"') !== -1);
const bettypes = read("guides/bet-types.html");
ok("bet-types guide #props anchor exists", bettypes.indexOf('id="props"') !== -1);
["odds.html", "journal.html", "weather.html", "injuries.html"].forEach(f =>
  ok("../" + f + " exists", fs.existsSync(path.join(ROOT, f))));
["betting-101.html", "bet-types.html", "bankroll.html", "advanced.html",
 "live-betting.html", "line-movement.html"].forEach(f =>
  ok("sibling guide " + f + " exists", fs.existsSync(path.join(ROOT, "guides", f))));

/* guide math stays exact (guards against sloppy edits) */
ok("-115 break-even 53.5% intact", guide.indexOf("53.5%") !== -1);
ok("-110 break-even 52.4% intact", guide.indexOf("52.4%") !== -1);
ok("-125 break-even 55.6% intact", guide.indexOf("55.6%") !== -1);
ok("-130 break-even 56.5% intact", guide.indexOf("56.5%") !== -1);
ok("median example intact (41/55/68/72/148, median 68, mean 76.8)",
  guide.indexOf("41, 55, 68, 72, and 148") !== -1 &&
  guide.indexOf("76.8") !== -1);
ok("shopping example intact (62.5 vs 63.5, median 64)",
  guide.indexOf("62.5") !== -1 && guide.indexOf("63.5") !== -1);
ok("honesty: getting limited named as the ceiling",
  guide.indexOf("getting limited") !== -1);
ok("honesty: entertainment tax named",
  guide.indexOf("entertainment tax") !== -1);

/* wiring */
const index = read("index.html");
ok("index hero counts 7 guides",
  /<b>7<\/b><span>in-depth guides<\/span>/.test(index));
ok("index hero counts 17 tools",
  /<b>17<\/b><span>betting tools<\/span>/.test(index));
const cards = (index.match(/class="card" href="guides\/[a-z0-9-]+\.html"/g) || []).length;
ok("index has 7 guide cards", cards === 7);
ok("index links the new guide", index.indexOf('href="guides/props.html"') !== -1);
ok("index moves the New tag to the new guide",
  /guides\/props\.html[\s\S]{0,500}?<span class="tag">New<\/span>/.test(index));
ok("New tag no longer on line-movement card",
  (function(){ var m = index.match(/href="guides\/line-movement\.html"[\s\S]*?<\/a>/);
    return m && m[0].indexOf('<span class="tag">New</span>') === -1; })());

const sitejs = read("js/site.js");
ok("footer Learn list links the new guide",
  sitejs.indexOf('guides/props.html') !== -1);
ok("footer still keeps BTC tip address (not Pearl)",
  sitejs.indexOf("3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK") !== -1);

const sitemap = read("sitemap.xml");
ok("sitemap lists the new guide",
  sitemap.indexOf("https://gridironui.xyz/guides/props.html") !== -1);

/* head hygiene on the new page */
ok("title present", /<title>The Player Props Playbook/.test(guide));
ok("canonical points at custom domain",
  guide.indexOf('<link rel="canonical" href="https://gridironui.xyz/guides/props.html">') !== -1);
ok("meta description present", /<meta name="description" content="[^"]{50,}"/.test(guide));
ok("new guide uses current site.js key",
  guide.indexOf("../js/site.js?v=1.85.0") !== -1);
ok("new guide uses current style.css key",
  guide.indexOf("../css/style.css?v=1.70.0") !== -1);
ok("new guide uses photo-less sport-nfl hero pattern",
  guide.indexOf('class="page-hero sport-nfl"') !== -1);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
