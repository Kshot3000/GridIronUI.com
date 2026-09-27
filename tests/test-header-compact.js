/* GridIronUI header-compact regression test.
   The sticky header used to snap the ticker/headlines strips with display:none
   at a single 140px threshold, causing a layout-shift lurch every crossing
   (reported: "bugs out when scrolling down then back up"). The fix: an
   animated max-height collapse plus hysteresis (compact >170, expand <110).
   These assertions pin that behavior so it can't regress. */
"use strict";
const fs = require("fs");
const css = fs.readFileSync(__dirname + "/../css/style.css", "utf8");
const js = fs.readFileSync(__dirname + "/../js/site.js", "utf8");
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : (fail++, console.error("FAIL:", name)); };

// 1. No display:none snap on the compact strips (the layout-shift culprit)
const compactBlock = css.match(/\.site-header\.compact[^{]*\{[^}]*\}/g) || [];
ok("compact rules exist", compactBlock.length > 0);
ok("no display:none in compact strip rules",
  !compactBlock.some(b => /display\s*:\s*none/.test(b) && /\.ticker|\.headlines/.test(css.slice(0, css.indexOf(b)) + b)));

// 2. Animated collapse instead
ok("ticker/headlines have max-height transition",
  /\.site-header\s+\.ticker[\s\S]*?transition:[^;]*max-height/.test(css));
ok("compact collapses strips to max-height:0",
  /\.site-header\.compact\s+\.ticker[\s\S]*?\.site-header\.compact\s+\.headlines\s*\{\s*max-height\s*:\s*0/.test(css));
ok("collapsed strips fade (opacity:0)", /compact[\s\S]*?opacity\s*:\s*0/.test(css));

// 3. Reduced-motion users get no animation
ok("prefers-reduced-motion disables strip transition",
  /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^}]*\.site-header\s+\.ticker/.test(css));

// 4. Hysteresis in the scroll handler: two distinct thresholds
ok("scroll handler compacts past 170", />\s*170/.test(js));
ok("scroll handler expands below 110", />\s*110/.test(js));
ok("compact class still toggled on .site-header", /classList\.toggle\(\s*["']compact["']/.test(js));

console.log(`header-compact: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
