/* GridIronUI — desktop header nav overflow regression guard.
   The header (brand + 15-link nav + feed pill) needed ~1396px inside a 1200px
   wrap, so EVERY desktop viewport got page-level horizontal scroll (found by
   headless Chromium QA 2026-09-30 at 1280px: nav right edge 1302, pill
   1408-1516 — in every pill state, not just the degraded one). The nav now
   flexes into the free space between brand and pill and scrolls internally
   (overflow-x:auto) instead of pushing the page sideways; the pill is pushed
   right with margin-left:auto and never shrinks; site.js scrolls the active
   tab into view on load without moving the page. This test pins the wiring. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var fails = 0, n = 0;
function ok(cond, label){
  n++;
  if(!cond){ fails++; console.error("FAIL: "+label); }
}
var css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
var site = fs.readFileSync(path.join(ROOT, "js", "site.js"), "utf8");

/* 1. the nav flexes into free space and scrolls internally, never pushing the page */
var navRule = css.match(/\.main-nav\{[^}]*\}/);
ok(!!navRule, "css has a .main-nav rule");
var navCss = navRule ? navRule[0] : "";
ok(/flex:1 1 auto/.test(navCss), ".main-nav flexes into the free space (flex:1 1 auto)");
ok(/min-width:0/.test(navCss), ".main-nav can shrink below content width (min-width:0)");
ok(/overflow-x:auto/.test(navCss), ".main-nav scrolls internally (overflow-x:auto)");
ok(navCss.indexOf("margin-left:auto") === -1, ".main-nav no longer right-aligns via margin-left:auto (it left-aligns so Home/Odds/Markets stay visible)");

/* 2. children can't be squeezed by the flex row */
var linkRule = css.match(/\.main-nav a\{[^}]*\}/);
ok(!!linkRule && /flex:none/.test(linkRule[0]), ".main-nav a is flex:none (links never shrink)");
ok(/\.brand\{[^}]*flex:none/.test(css), ".brand is flex:none");
var pillRule = css.match(/\.feed-pill\{[^}]*\}/);
ok(!!pillRule && /flex:none/.test(pillRule[0]), ".feed-pill is flex:none (status text never squeezed)");
ok(!!pillRule && /margin-left:auto/.test(pillRule[0]), ".feed-pill keeps margin-left:auto (pushed right of the nav)");

/* 3. the scrollbar stays subtle and theme-matched */
ok(/\.main-nav::-webkit-scrollbar\{[^}]*height:6px/.test(css), "webkit scrollbar is thin (6px)");
ok(/scrollbar-width:thin/.test(navCss), "firefox scrollbar-width:thin");

/* 4. the mobile dropdown behavior is untouched */
var mq860 = css.match(/@media\(max-width:860px\)\{[\s\S]*?\.main-nav\.open\{display:flex\}/);
ok(!!mq860, "<=860px mobile dropdown (.main-nav.open) still wired");
var mq640 = css.match(/@media\(max-width:640px\)\{[\s\S]*?\.feed-pill #feedTxt\{display:none\}/);
ok(!!mq640, "<=640px feed-pill dot-only collapse still wired");

/* 5. site.js scrolls the active tab into view without moving the page */
ok(/nav\.scrollLeft/.test(site), "site.js adjusts nav.scrollLeft for the active tab");
ok(/querySelector\("a\.active"\)/.test(site), "site.js finds the active nav link");
ok(/getBoundingClientRect/.test(site), "site.js measures tab visibility with getBoundingClientRect");

/* 6. no page pins a stale style.css / site.js key (both changed this release) */
function htmlFiles(dir, out){
  out = out || [];
  fs.readdirSync(dir).forEach(function(f){
    if(f === ".git" || f === "node_modules") return;
    var p = path.join(dir, f), st = fs.statSync(p);
    if(st.isDirectory()) htmlFiles(p, out);
    else if(/\.html$/.test(f)) out.push(p);
  });
  return out;
}
var bad = [];
htmlFiles(ROOT).forEach(function(h){
  var t = fs.readFileSync(h, "utf8");
  if(t.indexOf("css/style.css?v=1.104.0") === -1 && /css\/style\.css\?v=/.test(t)) bad.push(path.relative(ROOT, h)+" css");
  if(t.indexOf("js/site.js?v=1.104.0") === -1 && /js\/site\.js\?v=/.test(t)) bad.push(path.relative(ROOT, h)+" site.js");
});
ok(bad.length === 0, "all pages pin style.css and site.js at v1.104.0" + (bad.length ? " — "+bad.slice(0,5).join(", ") : ""));

console.log(n - fails + "/" + n + " assertions passed");
process.exit(fails ? 1 : 0);
