/* GridIronUI hero-pulse test — static checks for the v1.46.0/v1.47.0 hero upgrade:
   - the three market-pulse chart lines drift at half speed (stepEvery 6/8/4,
     doubled from the original 3/4/2 on 2026-09-27 per Kyle's direction);
   - between data steps the lines glide a fraction of a point-width per frame
     (v1.47.0) so the drift is smooth, never choppy;
   - the rain layer carries all six requested glyphs: football, baseball,
     basketball, hundred-dollar bill, bitcoin, and a real Ethereum diamond
     mark drawn with canvas paths (v1.47.0 — no font-glyph dependency);
   - rain is drawn behind the chart lines (drawRain called before lines render);
   - the whole canvas (charts + rain) stays disabled under
     prefers-reduced-motion;
   - index.html cache key for hero-pulse.js is >= v1.47.0. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
var src = fs.readFileSync(path.join(ROOT, "js/hero-pulse.js"), "utf8");
var index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---- half-speed chart drift ---- */
var steps = [];
var re = /makeLine\("[^"]+",\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*(\d+)\)/g, m;
while((m = re.exec(src))) steps.push(parseInt(m[1], 10));
assert(steps.length === 3 && steps[0] === 6 && steps[1] === 8 && steps[2] === 4,
  "chart lines drift at half speed (stepEvery 6/8/4)" +
  (steps.length ? " (found " + steps.join("/") + ")" : " (no makeLine calls found)"));

/* ---- rain glyph set ---- */
var glyphChecks = [
  ["\\uD83C\\uDFC8", "football"],
  ["\\u26BE",       "baseball"],
  ["\\uD83C\\uDFC0", "basketball"],
  ["\\uD83D\\uDCB5", "hundred-dollar bill"],
  ["\\u20BF",       "bitcoin"]
];
glyphChecks.forEach(function(pair){
  assert(src.indexOf(pair[0]) !== -1, "rain includes " + pair[1]);
});
/* ethereum: a real diamond mark drawn with canvas paths, not a font glyph */
assert(/function\s+ethDiamond\s*\(/.test(src) &&
       (src.match(/ctx\.fillStyle="#[0-9a-fA-F]{6}"; ctx\.fill\(\);/g) || []).length >= 4,
  "rain includes a real ethereum diamond (four facets, path-drawn)");
assert(src.indexOf('"eth"') !== -1 && src.indexOf("\\u039E") === -1,
  "ethereum uses the eth mark, not the Xi text glyph");
assert(/RAIN_GLYPHS\s*=\s*\[/.test(src), "rain glyph list is a single RAIN_GLYPHS array");

/* ---- smooth glide between data steps (v1.47.0: no choppy jumps) ---- */
assert(/off:0/.test(src) && /L\.off\s*-=\s*dx\/L\.stepEvery/.test(src),
  "chart lines glide a fraction of a point-width per frame between steps");
assert(/\bL\.off\b/.test(src) && /\+L\.off/.test(src),
  "rendered x positions include the glide offset");

/* ---- rain renders behind the charts ---- */
var drawRainAt = src.indexOf("drawRain();");
var linesAt = src.indexOf("lines.forEach");
assert(drawRainAt !== -1 && linesAt !== -1 && drawRainAt < linesAt,
  "rain is drawn before (behind) the chart lines");

/* ---- reduced-motion still disables everything ---- */
assert(/prefers-reduced-motion[^]*?return;/.test(src) &&
       src.indexOf("RAIN_GLYPHS") > src.indexOf("prefers-reduced-motion"),
  "reduced-motion early return still gates the rain layer");

/* ---- respawn + bounds ---- */
assert(/p\.y\s*>\s*H\s*\+\s*p\.size/.test(src), "rain particles respawn after leaving the bottom");
assert(/p\.x\s*=\s*Math\.min\(p\.x,\s*W\)/.test(src), "rain particles re-clamped on resize");

/* ---- cache key on index.html ---- */
var key = /hero-pulse\.js\?v=([\d.]+)/.exec(index);
assert(key && key[1] === "1.47.0",
  "index.html serves hero-pulse.js at v=1.47.0" + (key ? " (found v=" + key[1] + ")" : " (no key found)"));

if(failures){ console.error(failures + " failure(s)"); process.exit(1); }
console.log("hero-pulse checks passed");
