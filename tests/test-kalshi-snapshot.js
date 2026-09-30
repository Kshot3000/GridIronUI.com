/* GridIronUI Kalshi snapshot honesty test — static checks for the v1.93.0
   snapshot refresh:
   - the site makes no specific-minute refresh promises it can't keep:
     no "~15 min", "~30 min", "every 15 minutes" or "about every 30 minutes"
     claims remain in markets.js or markets.html — the copy says the
     snapshot is rebuilt "regularly", and the page shows the real capture
     time plus a stale warning past 6h;
   - scripts/fetch-kalshi.py documents the loop-run refresh rule;
   - data/kalshi-nfl.json is valid JSON with a timestamp and games;
   - markets.html cache key for markets.js is >= v1.48.0 (copy changed).

   (A scheduled GitHub Actions workflow that rebuilds the snapshot every
   ~30 min is the planned long-term fix, but the deploy token lacks the
   `workflow` scope to push .github/workflows/ files — the workflow file
   is staged in the goal workspace notes until that scope is granted.) */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function read(rel){ return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---- no specific-minute cadence promises ---- */
var marketsJs = read("js/markets.js");
var marketsHtml = read("markets.html");
["~15 min", "~30 min", "every 15 minutes", "every ~15 minutes",
 "about every 30 minutes", "every ~30 minutes"].forEach(function(phrase){
  assert(marketsJs.indexOf(phrase) === -1,
    "js/markets.js makes no \"" + phrase + "\" promise");
  assert(marketsHtml.indexOf(phrase) === -1,
    "markets.html makes no \"" + phrase + "\" promise");
});
assert(/rebuilt regularly/.test(marketsJs),
  "js/markets.js says the snapshot is rebuilt regularly");
assert(/refreshed regularly/.test(marketsHtml),
  "markets.html says the snapshot is refreshed regularly");
assert(marketsJs.indexOf("over 6 hours old") !== -1,
  "js/markets.js keeps the >6h stale warning");

/* ---- fetch script documents the loop-run rule ---- */
var fetchPy = read("scripts/fetch-kalshi.py");
assert(/older than about two hours/.test(fetchPy),
  "fetch-kalshi.py docstring states the loop-run refresh rule");

/* ---- snapshot file is valid and shaped right ---- */
var snap = JSON.parse(read("data/kalshi-nfl.json"));
assert(typeof snap.updated_at === "string" && !isNaN(Date.parse(snap.updated_at)),
  "data/kalshi-nfl.json carries a parseable updated_at");
assert(Array.isArray(snap.games) && snap.games.length > 0,
  "data/kalshi-nfl.json has a non-empty games array (" + snap.games.length + " games)");
assert(snap.games.every(function(g){ return Array.isArray(g.markets) && g.markets.length > 0; }),
  "every snapshot game carries markets");

/* ---- cache key ---- */
var keyMatch = marketsHtml.match(/js\/markets\.js\?v=([\d.]+)/);
assert(keyMatch && keyMatch[1] === "1.99.0",
  "markets.html cache key for markets.js is v1.99.0 (Polymarket boards order by true game time; settled Kalshi games render as results, not predictions)");

if(failures){ console.error(failures + " failure(s)"); process.exit(1); }
console.log("all kalshi-snapshot checks passed");
