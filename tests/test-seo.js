/* GridIronUI SEO pass static test (v1.68.0).
   Every HTML page must carry: non-empty <title>, a meta description of
   sane length, full Open Graph tags (type/title/description/image/url +
   image dimensions), Twitter summary_large_image cards pointing at
   @kshot9000, and a canonical URL matching the live gridironui.xyz path.
   sitemap.xml must list every page; robots.txt must reference the sitemap.
   JSON-LD: Organization+WebSite on index, Article on each guide.
   Footer branding guard: site.js must keep the BTC donation address (never
   the PRL address), @kshot9000, 21+ and 1-800-GAMBLER.
   Run: node tests/test-seo.js */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const PAGES = [
  "index.html","about.html","affiliate-disclosure.html","ai-coach.html","contact.html",
  "dfs.html","glossary.html","injuries.html","journal.html","legality.html","links.html",
  "markets.html","news.html","odds.html","partners.html","predictions.html","privacy.html",
  "responsible-gambling.html","scores.html","terms.html","tools.html","watch.html","weather.html",
  "guides/advanced.html","guides/bankroll.html","guides/bet-types.html","guides/betting-101.html",
  "guides/line-movement.html","guides/live-betting.html","guides/props.html"
];
const GUIDES = ["guides/advanced.html","guides/bankroll.html","guides/bet-types.html",
  "guides/betting-101.html","guides/line-movement.html","guides/live-betting.html","guides/props.html"];

const canonFor = p => p === "index.html" ? "https://gridironui.xyz/" : "https://gridironui.xyz/" + p;

PAGES.forEach(p => {
  const html = read(p);
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || ["",""])[1].trim();
  ok(p + " has non-empty title", title.length > 5);
  const desc = (html.match(/<meta name="description" content="([\s\S]*?)"\s*\/?>/) || ["",""])[1];
  ok(p + " has meta description", desc.length > 0);
  ok(p + " description length sane (50-320)", desc.length >= 50 && desc.length <= 320);
  // Open Graph
  ok(p + " og:type", html.indexOf('<meta property="og:type" content="website">') !== -1);
  ok(p + " og:title matches <title>", html.indexOf('<meta property="og:title" content="' + title + '">') !== -1);
  ok(p + " og:description matches meta description", html.indexOf('<meta property="og:description" content="' + desc + '">') !== -1);
  ok(p + " og:image", html.indexOf('<meta property="og:image" content="https://gridironui.xyz/img/og-image.jpg">') !== -1);
  ok(p + " og:image dimensions", html.indexOf('<meta property="og:image:width" content="1200">') !== -1 &&
     html.indexOf('<meta property="og:image:height" content="630">') !== -1);
  ok(p + " og:url", html.indexOf('<meta property="og:url" content="' + canonFor(p) + '">') !== -1);
  // Twitter cards
  ok(p + " twitter:card summary_large_image", html.indexOf('<meta name="twitter:card" content="summary_large_image">') !== -1);
  ok(p + " twitter:site @kshot9000", html.indexOf('<meta name="twitter:site" content="@kshot9000">') !== -1);
  ok(p + " twitter:title", html.indexOf('<meta name="twitter:title" content="' + title + '">') !== -1);
  ok(p + " twitter:description", html.indexOf('<meta name="twitter:description" content="' + desc + '">') !== -1);
  ok(p + " twitter:image", html.indexOf('<meta name="twitter:image" content="https://gridironui.xyz/img/og-image.jpg">') !== -1);
  // canonical
  ok(p + " canonical matches live URL", html.indexOf('<link rel="canonical" href="' + canonFor(p) + '">') !== -1);
});

// JSON-LD
const indexHtml = read("index.html");
ok("index has Organization+WebSite JSON-LD",
  indexHtml.indexOf('"@type":"Organization"') !== -1 && indexHtml.indexOf('"@type":"WebSite"') !== -1);
GUIDES.forEach(p => {
  const html = read(p);
  ok(p + " has Article JSON-LD",
    html.indexOf('"@type":"Article"') !== -1 && html.indexOf('"mainEntityOfPage":"' + canonFor(p) + '"') !== -1);
});

// sitemap + robots
const sitemap = read("sitemap.xml");
PAGES.forEach(p => ok("sitemap lists " + p, sitemap.indexOf("<loc>" + canonFor(p) + "</loc>") !== -1));
const robots = read("robots.txt");
ok("robots.txt references sitemap", robots.indexOf("Sitemap: https://gridironui.xyz/sitemap.xml") !== -1);

// footer branding guard (rendered by js/site.js; must survive every pass)
const site = read("js/site.js");
ok("footer keeps BTC donation address", site.indexOf("3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK") !== -1);
ok("footer never restores PRL address", site.indexOf("prl1p62v09vuzyd8kdz9l23jaf3kph4wwx6jqcmhkkhg8lhr2qlxky8psu3zw9d") === -1);
ok("footer keeps @kshot9000", site.indexOf("@kshot9000") !== -1 || site.indexOf("x.com/kshot9000") !== -1);
ok("footer keeps 1-800-GAMBLER", site.indexOf("1-800-GAMBLER") !== -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
