/* GridIronUI sports-imagery backgrounds test — static checks for the
   v1.30.0 visual upgrade:
   - hero photos are self-hosted in img/heroes/ (no hotlinked Unsplash URLs
     anywhere in HTML);
   - the six expected hero images exist and are non-trivial files;
   - homepage hero carries the bokeh atmosphere layer;
   - photo-less page heroes carry per-sport line-art classes;
   - CSS carries the atmosphere selectors, the five sport line-art rules
     (with embedded SVG data URIs), the empty-state texture, and the card
     hairline accent;
   - the scroll-jank fix's .site-header.compact rule is untouched. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function htmlFiles(dir){
  var out = [];
  fs.readdirSync(dir).forEach(function(f){
    if(f === "node_modules" || f[0] === ".") return;
    var p = path.join(dir, f), st = fs.statSync(p);
    if(st.isDirectory()) out = out.concat(htmlFiles(p));
    else if(/\.html$/.test(f)) out.push(p);
  });
  return out;
}

var css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
var pages = htmlFiles(ROOT);

/* ---- no hotlinked hero images ---- */
var hotlinked = pages.filter(function(p){
  return fs.readFileSync(p, "utf8").indexOf("images.unsplash.com") !== -1;
});
assert(hotlinked.length === 0,
  "no Unsplash hotlinks remain in HTML" + (hotlinked.length ? " (" + hotlinked.join(", ") + ")" : ""));

/* ---- self-hosted hero images exist ---- */
var heroes = ["hero-night-pitch.jpg","hero-football.jpg","hero-hoop.jpg",
              "hero-boot.jpg","hero-stadium.jpg","hero-arena.jpg"];
var totalBytes = 0;
heroes.forEach(function(h){
  var p = path.join(ROOT, "img/heroes", h);
  var ok = fs.existsSync(p) && fs.statSync(p).size > 20000;
  if(ok) totalBytes += fs.statSync(p).size;
  assert(ok, "img/heroes/" + h + " exists and is a real image");
});
assert(totalBytes > 0 && totalBytes < 400 * 1024,
  "total hero image weight under 400KB (" + Math.round(totalBytes/1024) + "KB)");

/* ---- hero-bg divs point at local images ---- */
var heroBgPages = pages.filter(function(p){
  return fs.readFileSync(p, "utf8").indexOf('class="hero-bg"') !== -1;
});
assert(heroBgPages.length === 7, "7 pages carry photo hero backgrounds (found " + heroBgPages.length + ")");
var localBg = heroBgPages.every(function(p){
  var html = fs.readFileSync(p, "utf8");
  return /hero-bg"[^>]*>/.test(html) &&
         html.indexOf("background-image:url('img/heroes/") !== -1;
});
assert(localBg, "every .hero-bg uses a local img/heroes/ image");
var ariaHidden = heroBgPages.every(function(p){
  return fs.readFileSync(p, "utf8").indexOf('<div class="hero-bg" aria-hidden="true"') !== -1;
});
assert(ariaHidden, "decorative .hero-bg layers are aria-hidden");

/* ---- homepage hero atmosphere ---- */
var indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
assert(indexHtml.indexOf('class="hero-bokeh"') !== -1, "homepage hero has the bokeh atmosphere layer");
assert(indexHtml.indexOf('hero-bokeh" aria-hidden="true"') !== -1, "bokeh layer is aria-hidden");
assert(css.indexOf(".hero::before") !== -1, "CSS has the hero floodlight/vignette ::before layer");
assert(css.indexOf(".hero-bokeh") !== -1, "CSS has the .hero-bokeh rules");
assert(css.indexOf("hero-bokeh-drift") !== -1, "CSS has the bokeh drift keyframes");
assert(/prefers-reduced-motion\s*:\s*no-preference[\s\S]{0,200}\.hero-bokeh\s*\{[^}]*animation/.test(css),
  "bokeh drift animation only applies under no-preference reduced-motion");
assert(/prefers-reduced-motion\s*:\s*reduce[\s\S]{0,160}\.hero-bokeh\s*\{\s*animation\s*:\s*none/.test(css),
  "bokeh drift is disabled under prefers-reduced-motion");

/* ---- per-sport line-art heroes ---- */
var sports = ["sport-nfl","sport-nba","sport-mlb","sport-nhl","sport-soccer"];
sports.forEach(function(s){
  assert(css.indexOf(".page-hero." + s + "::before") !== -1,
    "CSS has the ." + s + " line-art hero rule");
});
assert((css.match(/data:image\/svg\+xml/g) || []).length >= 6,
  "CSS embeds SVG data URIs (5 line-art motifs + grain)");
var tagged = pages.filter(function(p){
  return /<section class="page-hero sport-/.test(fs.readFileSync(p, "utf8"));
});
assert(tagged.length === 13, "13 photo-less pages tagged with sport line-art classes (found " + tagged.length + ")");
var photoPagesTagged = heroBgPages.filter(function(p){
  return /<section class="page-hero sport-/.test(fs.readFileSync(p, "utf8"));
});
assert(photoPagesTagged.length === 0, "photo-hero pages do not also get line-art classes");

/* ---- empty states + card accent ---- */
assert(/\.empty\s*\{[^}]*radial-gradient/.test(css), ".empty has the atmospheric glow background");
assert(css.indexOf(".card::before") !== -1, "CSS has the card hairline accent");
assert(/\.card::before\s*\{[^}]*linear-gradient\(90deg,transparent,rgba\(240,180,41/.test(css),
  "card hairline is a subtle gold gradient");

/* ---- scroll-jank fix: header strips collapse smoothly, never display:none ----
   (v1.30.1 replaced the old snap rule; pin the smooth behavior instead) */
assert(!/\.site-header\.compact\s+\.ticker[\s\S]{0,200}?display\s*:\s*none/.test(css) &&
       /\.site-header\.compact\s+\.ticker,\s*\.site-header\.compact\s+\.headlines\s*\{\s*max-height\s*:\s*0/.test(css),
  ".site-header.compact collapses smoothly via max-height (no display:none snap)");

/* ---- hero-inner still above atmosphere layers ---- */
assert(/\.hero-inner\s*\{[^}]*z-index:\s*2/.test(css), ".hero-inner keeps z-index:2 above atmosphere layers");

if(failures){
  console.error("\n" + failures + " FAILURE(S)");
  process.exit(1);
} else {
  console.log("\nAll background tests passed.");
}
