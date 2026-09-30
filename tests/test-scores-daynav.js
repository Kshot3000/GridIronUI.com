/* GridIronUI — scores day-nav mobile overflow regression guard.
   The scores page's day-navigation row (prev / Today / next + date label +
   live status) was a no-wrap inline-styled flex row; the date label's
   min-width:180px pushed the whole page 13px past 390px — page-level
   horizontal scroll on phones (found by headless Chromium QA 2026-09-30,
   same class of bug as the v1.102.0 hero gutter). The row is now the
   .day-nav class: wraps freely, and on <=640px the label takes its own
   full-width line below the buttons. This test pins the wiring so the
   inline no-wrap row can never come back. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var fails = 0, n = 0;
function ok(cond, label){
  n++;
  if(!cond){ fails++; console.error("FAIL: "+label); }
}
var html = fs.readFileSync(path.join(ROOT, "scores.html"), "utf8");
var css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");

/* 1. the day-nav row uses the class, not an inline no-wrap flex style */
ok(/<div class="day-nav">/.test(html), "scores.html day-nav row uses class=\"day-nav\"");
ok(html.indexOf('<div style="display:flex;gap:8px;align-items:center">') === -1,
   "scores.html no inline no-wrap flex row left behind");
ok(/id="dayLabel"><\/span>/.test(html) || /id="dayLabel"><\//.test(html),
   "scores.html #dayLabel carries no inline style (styling lives in CSS)");

/* 2. the CSS gives the row room to wrap */
ok(/\.day-nav\{[^}]*display:flex/.test(css), "css .day-nav is flex");
ok(/\.day-nav\{[^}]*flex-wrap:wrap/.test(css), "css .day-nav wraps");
ok(/\.day-nav #dayLabel\{[^}]*min-width:180px/.test(css),
   "css .day-nav #dayLabel keeps the 180px floor on desktop");

/* 3. on phones the label drops to its own full-width line */
var mq = css.match(/@media\(max-width:640px\)\{[\s\S]*?\.day-nav #dayLabel\{[^}]*\}/);
ok(!!mq, "css has a <=640px rule for .day-nav #dayLabel");
ok(/flex:1 1 100%/.test(mq ? mq[0] : ""), "mobile label takes its own full-width line (flex:1 1 100%)");
ok(/min-width:0/.test(mq ? mq[0] : ""), "mobile label drops the 180px min-width");

/* 4. no other page regressed to the old inline pattern */
var htmlFiles = [];
(function walk(dir){
  fs.readdirSync(dir).forEach(function(f){
    if(f === ".git" || f === "node_modules") return;
    var p = path.join(dir, f), st = fs.statSync(p);
    if(st.isDirectory()) walk(p);
    else if(/\.html$/.test(f)) htmlFiles.push(p);
  });
})(ROOT);
var bad = htmlFiles.filter(function(h){
  return fs.readFileSync(h, "utf8").indexOf('<div style="display:flex;gap:8px;align-items:center">') !== -1;
});
ok(bad.length === 0, "no page uses the old inline no-wrap day-nav pattern",
   bad.map(function(h){ return path.relative(ROOT, h); }).join(", "));

console.log(fails ? ("\n"+fails+" of "+n+" FAILURES") : ("all "+n+" assertions passed"));
process.exit(fails ? 1 : 0);
