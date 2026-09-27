/* Node tests for the line-movement sparkline logic in js/odds-logic.js —
   run: node tests/test-odds-spark.js */
"use strict";
var L = require("../js/odds-logic.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}

/* ---- recordSample ---- */
var h = {};
L.recordSample(h, "g1", 1000, -3, 44.5);
ok("first sample creates entry", h.g1 && h.g1.length === 1 && h.g1[0][0] === 1000 && h.g1[0][1] === -3 && h.g1[0][2] === 44.5);

L.recordSample(h, "g1", 2000, -3, 44.5);
ok("identical sample extends timestamp, no new point", h.g1.length === 1 && h.g1[0][0] === 2000, JSON.stringify(h.g1));

L.recordSample(h, "g1", 3000, -4.5, 44.5);
ok("changed spread appends", h.g1.length === 2 && h.g1[1][1] === -4.5, JSON.stringify(h.g1));

L.recordSample(h, "g1", 4000, -4.5, 46);
ok("changed total appends", h.g1.length === 3 && h.g1[2][2] === 46, JSON.stringify(h.g1));

L.recordSample(h, "g2", 5000, null, 47);
ok("null spread recorded, total kept", h.g2[0][1] === null && h.g2[0][2] === 47);

/* per-game cap: 72 samples max, oldest dropped */
var hc = {};
for(var i = 0; i < 90; i++) L.recordSample(hc, "g", i, -3 - i*0.1, 44.5);
ok("per-game cap 72", hc.g.length === 72, hc.g.length);
ok("cap drops oldest", hc.g[0][0] === 18, hc.g[0][0]);

/* game cap: 200 games max, oldest-tracked evicted */
var hg = {};
for(var j = 0; j < 205; j++) L.recordSample(hg, "game"+j, 1000+j, -3, 44.5);
ok("game cap 200", Object.keys(hg).length === 200, Object.keys(hg).length);
ok("evicts oldest-tracked game", !hg.game0 && !!hg.game204);

/* id coerced to string key */
var hs = {};
L.recordSample(hs, 12345, 1000, -3, 44.5);
ok("numeric id stringified", !!hs["12345"]);

/* ---- sparkSeries ---- */
var samples = [[1000,-3,44.5],[2000,-4.5,44.5],[3000,null,46],[4000,-6,null]];
ok("spread series skips nulls", JSON.stringify(L.sparkSeries(samples,"sp")) === JSON.stringify([-3,-4.5,-6]), JSON.stringify(L.sparkSeries(samples,"sp")));
ok("total series skips nulls", JSON.stringify(L.sparkSeries(samples,"tot")) === JSON.stringify([44.5,44.5,46]), JSON.stringify(L.sparkSeries(samples,"tot")));
ok("empty samples -> empty series", L.sparkSeries(null,"sp").length === 0);

/* ---- spark geometry ---- */
ok("fewer than 2 points -> null", L.spark([5], 132, 36) === null && L.spark([], 132, 36) === null);

var rising = L.spark([1,2,3], 100, 40);
/* w=100,h=40,pad=3 -> x: 3,50,97 ; y: v=1 -> 37, v=2 -> 20, v=3 -> 3 */
ok("rising line path", rising && rising.line === "M3,37L50,20L97,3", rising && rising.line);
ok("rising area path closes at baseline", rising && rising.area === "M3,37L50,20L97,3L97,37L3,37Z", rising && rising.area);
ok("last-point coords", rising && rising.lx === 97 && rising.ly === 3, rising && (rising.lx+","+rising.ly));

var falling = L.spark([47.5, 44], 100, 40);
ok("falling line starts high ends low", falling && falling.line === "M3,3L97,37", falling && falling.line);

var flat = L.spark([5,5,5], 100, 40);
ok("flat series -> mid-height line", flat && flat.line === "M3,20L50,20L97,20", flat && flat.line);

var two = L.spark([-6.5,-7], 132, 36);
/* x: 3,129 ; y: v=-6.5 -> 3, v=-7 -> 33 */
ok("two-point line", two && two.line === "M3,3L129,33", two && two.line);

var neg = L.spark([-3,-6.5,-3], 132, 36);
ok("negative values handled", neg && neg.line === "M3,3L66,33L129,3", neg && neg.line);

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL SPARK TESTS PASSED");
process.exit(fails ? 1 : 0);
