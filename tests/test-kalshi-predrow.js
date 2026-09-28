/* GridIronUI v1.52.0 — K.predRow tests (Kalshi "two crowds" row on the
   predictions page). Run: node tests/test-kalshi-predrow.js */
"use strict";
var K = require("../js/kalshi-logic.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
/* Freeze "now" so staleness tests are deterministic: snapshot 1h old. */
var FRESH = new Date(Date.now() - 3600*1000).toISOString();
var STALE = new Date(Date.now() - 7*3600*1000).toISOString();

var row = K.predRow("Philadelphia Eagles", 62, "Chicago Bears", 38, FRESH, 65);
ok("row rendered", row.indexOf("Kalshi") > -1);
ok("both names present", row.indexOf("Philadelphia Eagles") > -1 && row.indexOf("Chicago Bears") > -1);
ok("both percentages present", row.indexOf("62%") > -1 && row.indexOf("38%") > -1);
ok("snapshot label present", /snapshot/i.test(row));
ok("delta chip shows |65-62|=3", row.indexOf("\u03943\u00a2 vs Polymarket") > -1, row.slice(0,120));
ok("delta chip explains the gap", row.indexOf("two real-money crowds") > -1);

var agree = K.predRow("Eagles", 60, "Bears", 40, FRESH, 60);
ok("agreement still shows delta 0", agree.indexOf("\u03940\u00a2 vs Polymarket") > -1);

var noPm = K.predRow("Eagles", 60, "Bears", 40, FRESH);
ok("no pmA -> no delta chip", noPm.indexOf("vs Polymarket") === -1 && noPm.indexOf("60%") > -1);

var staleRow = K.predRow("Eagles", 62, "Bears", 38, STALE, 65);
ok("stale snapshot shows stale warning", /stale/i.test(staleRow));
ok("stale snapshot withholds prices", staleRow.indexOf("62%") === -1 && staleRow.indexOf("38%") === -1);

ok("missing aPct -> empty", K.predRow("Eagles", null, "Bears", 38, FRESH, 65) === "");
ok("missing bPct -> empty", K.predRow("Eagles", 62, "Bears", undefined, FRESH, 65) === "");
ok("garbage pct -> empty", K.predRow("Eagles", "n/a", "Bears", 38, FRESH, 65) === "");

var xss = K.predRow('<img src=x onerror=alert(1)>', 62, "Bears", 38, FRESH, 65);
ok("team names escaped", xss.indexOf("<img") === -1 && xss.indexOf("&lt;img") > -1);

var odd = K.predRow("Eagles", 62.4, "Bears", 37.6, FRESH, 65);
ok("fractional cents round to whole", odd.indexOf("62%") > -1 && odd.indexOf("38%") > -1);

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL PREDROW TESTS PASSED");
process.exit(fails ? 1 : 0);
