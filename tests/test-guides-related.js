/* GridIronUI "Keep learning" related-guides guard (v1.122.0).
   Every guide ends with a "Keep learning" card grid linking three curated
   sibling guides — the in-article discovery path between guides (SEO +
   reader flow). This test fails if any guide is missing the block, shows
   the wrong number of cards, links to itself, links to a non-existent
   guide, or ships a card with no title/blurb.
   Run: node tests/test-guides-related.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var GUIDES = path.join(ROOT, "guides");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
/* Extract the related-guides grid by balancing div depth — robust to
   whatever prose follows the grid (e.g. advanced.html's trailing line). */
function relatedGrid(html){
  var sec = html.split('id="related"')[1];
  if(!sec) return null;
  var start = sec.indexOf('<div class="grid grid-3">');
  if(start === -1) return null;
  var depth = 0, re = /<\/?div\b[^>]*>/g, m, end = -1;
  re.lastIndex = start;
  while((m = re.exec(sec)) !== null){
    if(m[0][1] === "/") depth--; else depth++;
    if(depth === 0){ end = m.index + m[0].length; break; }
  }
  return end === -1 ? null : sec.slice(start, end);
}
var slugs = ["betting-101","bet-types","bankroll","line-movement","live-betting","props","advanced"];
slugs.forEach(function(slug){
  var file = slug + ".html";
  var html = fs.readFileSync(path.join(GUIDES, file), "utf8");
  ok(file + " has #related section", html.indexOf('id="related"') !== -1);
  var grid = relatedGrid(html);
  ok(file + " has a closed card grid", grid !== null);
  if(!grid) return;
  var hrefs = [], hm, hre = /<a class="card" href="([^"]+)">/g;
  while((hm = hre.exec(grid)) !== null) hrefs.push(hm[1]);
  ok(file + " shows exactly 3 cards", hrefs.length === 3, "found=" + hrefs.length);
  hrefs.forEach(function(h){
    ok(file + " card " + h + " is a real sibling guide, not self",
       h !== file && slugs.indexOf(h.replace(".html","")) !== -1 &&
       fs.existsSync(path.join(GUIDES, h)));
  });
  var titles = grid.match(/<h3>[^<]+<\/h3>/g) || [];
  var blurbs = grid.match(/<p>[^<]{20,}<\/p>/g) || [];
  ok(file + " every card has a title", titles.length === 3, "found=" + titles.length);
  ok(file + " every card has a blurb", blurbs.length === 3, "found=" + blurbs.length);
});
/* Cards must reuse the canonical guide titles from the home page's guide grid
   (attribute order on the home cards is class-then-href). */
var home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var homeTitles = [], tm;
var tre = /guides\/[a-z0-9-]+\.html"[^>]*><div class="card-icon">[^<]*<\/div><h3>([^<]+)<\/h3>/g;
while((tm = tre.exec(home)) !== null) homeTitles.push(tm[1]);
ok("home guide grid titles extracted", homeTitles.length === 7, "found=" + homeTitles.length);
slugs.forEach(function(slug){
  var grid = relatedGrid(fs.readFileSync(path.join(GUIDES, slug + ".html"), "utf8"));
  if(!grid) return;
  var titles = (grid.match(/<h3>[^<]+<\/h3>/g) || []).map(function(s){ return s.replace(/<\/?h3>/g,""); });
  titles.forEach(function(t){
    ok(slug + ".html related card title matches home grid", homeTitles.indexOf(t) !== -1, t);
  });
});
process.exit(fails ? 1 : 0);
