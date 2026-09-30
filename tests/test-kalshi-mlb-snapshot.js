/* GridIronUI v1.93.0 — Kalshi MLB postseason snapshot honesty test.
   data/kalshi-mlb.json is written by scripts/fetch-kalshi.py --series KXMLBGAME
   and powers the markets page "Kalshi · MLB" tab plus the predictions page's
   MLB two-crowds rows. Asserts the file is real snapshot data (timestamped,
   MLB series, game-winner markets with sane prices), not invented numbers —
   and that the fetcher's --series/--out args exist with the NFL defaults
   intact so the existing NFL pipeline is unchanged.
   Run: node tests/test-kalshi-mlb-snapshot.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function read(rel){ return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---- the fetcher supports a second series with NFL defaults intact ---- */
var fetchPy = read("scripts/fetch-kalshi.py");
assert(/"--series"/.test(fetchPy) && /"--out"/.test(fetchPy),
  "fetch-kalshi.py accepts --series/--out");
assert(/default="KXNFLGAME"/.test(fetchPy) && /kalshi-nfl\.json/.test(fetchPy),
  "fetch-kalshi.py keeps KXNFLGAME -> data/kalshi-nfl.json as the default");

/* ---- the MLB snapshot file is real, timestamped snapshot data ---- */
var snap = JSON.parse(read("data/kalshi-mlb.json"));
assert(typeof snap.updated_at === "string" && !isNaN(Date.parse(snap.updated_at)),
  "data/kalshi-mlb.json carries a parseable updated_at");
var ageH = (Date.now() - Date.parse(snap.updated_at)) / 3600000;
assert(ageH >= 0 && ageH < 48,
  "data/kalshi-mlb.json is fresh (captured " + ageH.toFixed(1) + "h ago)");
assert(snap.series_ticker === "KXMLBGAME",
  "snapshot series_ticker is KXMLBGAME");
assert(Array.isArray(snap.games) && snap.games.length > 0,
  "snapshot has a non-empty games array (" + snap.games.length + " games)");
var bad = snap.games.filter(function(g){
  return typeof g.event_ticker !== "string" || g.event_ticker.indexOf("KXMLBGAME-") !== 0 ||
         !Array.isArray(g.markets) || g.markets.length !== 2 ||
         !g.markets.every(function(m){
           return m.kind === "winner" &&
                  Number.isFinite(m.yes_bid) && m.yes_bid > 0 && m.yes_bid < 100 &&
                  Number.isFinite(m.yes_ask) && m.yes_ask > 0 && m.yes_ask < 100 &&
                  m.yes_ask >= m.yes_bid;
         });
});
assert(bad.length === 0,
  "every game is a KXMLBGAME event with exactly 2 priced winner markets (sane bid/ask)");
assert(snap.games.every(function(g){
  return g.markets.every(function(m){ return m.team && m.team.length > 0; });
}), "every market carries its team name");

/* ---- pages wire the MLB tab/rows to this file ---- */
var marketsJs = read("js/markets.js");
assert(/data\/kalshi-mlb\.json/.test(marketsJs),
  "js/markets.js loads data/kalshi-mlb.json");
assert(/Kalshi · MLB/.test(marketsJs),
  "js/markets.js renders a Kalshi · MLB tab");
assert(/Disagree\.normAbbr/.test(marketsJs),
  "js/markets.js normalizes Kalshi abbreviations through the shared alias map (CWS->CHW)");
var predJs = read("js/predictions.js");
assert(/data\/kalshi-mlb\.json/.test(predJs),
  "js/predictions.js fetches the MLB snapshot for the MLB tab");
var marketsHtml = read("markets.html");
assert(/Kalshi · MLB/.test(marketsHtml),
  "markets.html names the Kalshi · MLB tab");
var predHtml = read("predictions.html");
assert(/MLB postseason/.test(predHtml),
  "predictions.html mentions the MLB postseason Kalshi rows");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all kalshi-mlb-snapshot assertions passed");
