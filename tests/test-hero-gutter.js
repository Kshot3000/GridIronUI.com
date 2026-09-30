/* Hero-gutter regression guard.
   Every .hero-inner padding declaration in css/style.css must keep a nonzero
   horizontal gutter. .hero-inner sits on .wrap (22px side gutter), and a
   padding shorthand like "padding:64px 0 48px" silently zeroes the gutter,
   gluing hero copy to the screen edges on mobile (caught 2026-09-30 at
   390px: homepage + all page heroes clipped). Run: node tests/test-hero-gutter.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var fails = 0, checked = 0;
function ok(name, cond, extra){
  checked++;
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
var css;
try{ css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8"); }
catch(e){ console.log("SKIP: css/style.css not readable"); process.exit(0); }

/* find every "padding:..." declaration whose selector line targets .hero-inner */
var lines = css.split("\n");
var re = /(^|[}\s])(\.page-hero\s+)?\.hero-inner\s*\{[^}]*?padding\s*:\s*([^;}]+)/;
var found = 0;
lines.forEach(function(line, i){
  var m = re.exec(line);
  if(!m) return;
  found++;
  var val = m[3].trim();
  var parts = val.split(/\s+/);
  /* shorthand mapping: 1 val -> all; 2 -> [v,h]; 3 -> [top,h,bottom]; 4 -> [t,r,b,l] */
  var horiz = parts.length === 1 ? parts[0]
    : parts.length === 2 ? parts[1]
    : parts.length === 3 ? parts[1]
    : parts[3];
  ok("hero-inner padding keeps horizontal gutter (line "+(i+1)+"): '"+val+"'",
     horiz !== "0" && horiz !== "0px",
     "horizontal padding is '"+horiz+"' — content would touch screen edges");
});
ok("scanned hero-inner padding rules", found >= 3, "found="+found);
console.log(fails ? "\n"+fails+" FAILURES" : "\nALL HERO-GUTTER TESTS PASSED");
process.exit(fails ? 1 : 0);
