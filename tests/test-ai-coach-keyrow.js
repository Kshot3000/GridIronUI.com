/* GridIronUI — AI coach Gemini-key row mobile regression guard.
   The key row (.key-row: password input + Save + clear buttons, no wrap) sits
   inside .key-field inside the wrapping .coach-settings flex row, inside the
   single-column .coach-layout grid on phones. The password input's default
   size=20 gave it a ~212px min-content; that propagated up (.key-row 339px ->
   .key-field/.coach-settings 339px -> chat card 389px) and forced the grid's
   1fr track to 389px, so the whole page laid out at a 411px viewport on a
   390px phone (found by headless Chromium QA 2026-09-30: window.innerWidth
   411 on ai-coach.html while every other page reported 390). The input now
   carries width:100% (matching the sibling .chat-input input rule), which
   collapses its intrinsic min-content so the row shrinks with the flex layout
   it already had (flex:1 + min-width:0). This test pins the wiring. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var fails = 0, n = 0;
function ok(cond, label){
  n++;
  if(!cond){ fails++; console.error("FAIL: "+label); }
}
var html = fs.readFileSync(path.join(ROOT, "ai-coach.html"), "utf8");

/* 1. the key-row input rule constrains the password input's intrinsic width */
var rule = html.match(/\.key-row input\{[^}]*\}/);
ok(!!rule, "ai-coach.html has a .key-row input rule");
var css = rule ? rule[0] : "";
ok(/flex:1/.test(css), ".key-row input still flexes to fill the row (flex:1)");
ok(/min-width:0/.test(css), ".key-row input can shrink below content width (min-width:0)");
ok(/width:100%/.test(css), ".key-row input has width:100% so its default size=20 never forces a ~212px min-content up through the grid track");

/* 2. the row itself is unchanged: one-line flex row, input is the password field */
var rowRule = html.match(/\.key-row\{[^}]*\}/);
ok(!!rowRule && /display:flex/.test(rowRule[0]), ".key-row is still display:flex");
ok(!!rowRule && rowRule[0].indexOf("flex-wrap") === -1, ".key-row stays no-wrap (Save/clear buttons stay on the input line)");
ok(/<input[^>]*id="gemKey"[^>]*type="password"/.test(html), "#gemKey is still the password input the rule targets");

/* 3. the constraint chain the fix protects is still as designed */
ok(/\.key-field\{[^}]*min-width:230px/.test(html), ".key-field keeps min-width:230px (the row must fit inside it on phones)");
ok(/\.coach-settings\{[^}]*flex-wrap:wrap/.test(html), ".coach-settings still wraps its fields");

console.log(n - fails + "/" + n + " assertions passed");
process.exit(fails ? 1 : 0);
