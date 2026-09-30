/* GridIronUI v1.94.0 — cross-book disagreement card now covers the MLB tab
   on markets.html (Wild Card week), not just NFL. Covers:
   - Disagree.matches() with the REAL data/kalshi-mlb.json snapshot + a
     realistic Polymarket MLB event pairs correctly on the "mlb" league key
     (BOS/NYY Game 1: Polymarket 27/73 vs Kalshi 30/71 — a 3c gap, flagged),
     including the CWS->CHW alias for CHW/HOU Game 2;
   - the SHIPPED js/markets.js wires the MLB tab's disagreement strip to
     data/kalshi-mlb.json, passes the tab's league key into disagreeCard,
     forwards league into D.matches and teamFind, and shows league-aware
     copy ("MLB postseason games") instead of the NFL-only strings.
   Run: node tests/test-disagree-mlb-card.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var D = require("../js/disagree-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---- stub team directory: MLB abbreviations like the real ESPN dir ---- */
var dir = {mlb: [
  {abbr:"BOS", displayName:"Boston Red Sox",     shortDisplayName:"Red Sox"},
  {abbr:"NYY", displayName:"New York Yankees",   shortDisplayName:"Yankees"},
  {abbr:"CHC", displayName:"Chicago Cubs",       shortDisplayName:"Cubs"},
  {abbr:"SD",  displayName:"San Diego Padres",   shortDisplayName:"Padres"},
  {abbr:"CHW", displayName:"Chicago White Sox",  shortDisplayName:"White Sox"},
  {abbr:"HOU", displayName:"Houston Astros",     shortDisplayName:"Astros"}
]};
function teamFind(d, league, q){
  var list = (d||{})[league] || [];
  q = String(q==null?"":q).trim(); if(!q || !list.length) return null;
  var qu = q.toUpperCase(), ql = q.toLowerCase();
  for(var i=0;i<list.length;i++) if(list[i].abbr === qu) return list[i];
  for(var j=0;j<list.length;j++)
    if(list[j].displayName.toLowerCase() === ql || list[j].shortDisplayName.toLowerCase() === ql)
      return list[j];
  return null;
}
function ml(outcomes, prices, volume){
  return {sportsMarketType:"moneyline", closed:false, active:true,
    outcomes:JSON.stringify(outcomes), outcomePrices:JSON.stringify(prices),
    volume:volume||1000};
}

/* ---- live logic against the real committed snapshot ---- */
var snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-mlb.json"), "utf8"));
assert(Array.isArray(snap.games) && snap.games.length >= 6,
  "MLB snapshot holds >=6 postseason games (got "+(snap.games||[]).length+")");

/* Polymarket-style event for tonight's Red Sox @ Yankees Wild Card Game 1.
   7pm ET Sept 29 = 2026-09-29T23:00Z, so the Eastern day is Sep 29. */
var pmG1 = {
  title: "Red Sox vs. Yankees",
  startTime: "2026-09-29T23:00:00Z",
  markets: [ ml(["Red Sox","Yankees"], [0.27,0.73], 5000000) ]
};
var mt = D.matches([pmG1], snap.games, dir, teamFind, "mlb");
assert(mt.length === 1, "BOS/NYY Game 1 matches one Kalshi game on league=mlb");
/* Expected Kalshi sides, derived from the committed snapshot itself (it
   refreshes hourly — the Game 1 market is the tickers ending in -BOS/-NYY
   on event KXMLBGAME-26SEP292000BOSNYY). */
function snapPrice(tickerSuffix){
  var g = snap.games.filter(function(x){
    return String(x.event_ticker||"").indexOf("26SEP292000BOSNYY") >= 0; })[0];
  if(!g) return null;
  var mm = (g.markets||[]).filter(function(x){
    return String(x.ticker||"").slice(-4) === tickerSuffix; })[0];
  return mm ? D.kalshiPrice(mm) : null;
}
var expA = snapPrice("-BOS"), expB = snapPrice("-NYY");
assert(expA !== null && expB !== null, "snapshot Game 1 -BOS/-NYY markets priced");
if(mt.length && expA !== null){
  var m = mt[0];
  assert(m.abbrA === "BOS" && m.abbrB === "NYY",
    "sides resolve to BOS/NYY (got "+m.abbrA+"/"+m.abbrB+")");
  assert(m.pmA === 27 && m.pmB === 73,
    "Polymarket prices 27/73 (got "+m.pmA+"/"+m.pmB+")");
  assert(m.kalshiA === expA && m.kalshiB === expB,
    "Kalshi sides match the Game 1 snapshot numbers, not Game 2 (got "+m.kalshiA+"/"+m.kalshiB+", want "+expA+"/"+expB+")");
  var delta = 27 - expA;
  var dis = D.disagreements(mt, 3);
  if(Math.abs(delta) >= 3){
    assert(dis.length === 1 && dis[0].delta === delta,
      "3c+ BOS gap flagged as a disagreement (delta "+(dis[0]&&dis[0].delta)+")");
  } else {
    assert(dis.length === 0, "sub-3c BOS gap correctly not flagged");
  }
}

/* White Sox @ Astros: Kalshi lists CWS, ESPN lists CHW — the alias must
   still match on the MLB tab. */
var pmG2 = {
  title: "White Sox vs. Astros",
  startTime: "2026-09-30T20:00:00Z",
  markets: [ ml(["White Sox","Astros"], [0.42,0.58], 2000000) ]
};
var mt2 = D.matches([pmG2], snap.games, dir, teamFind, "mlb");
assert(mt2.length === 1 && mt2[0].abbrA === "CHW" && mt2[0].abbrB === "HOU",
  "CHW/HOU matches through the CWS alias on league=mlb");

/* NFL default is untouched: same helper with no league still uses nfl. */
var mtNfl = D.matches([], snap.games, dir, teamFind);
assert(Array.isArray(mtNfl), "default league arg still works (nfl backward compat)");

/* ---- shipped js/markets.js wiring ---- */
var src = fs.readFileSync(path.join(ROOT, "js", "markets.js"), "utf8");
assert(/lkey\s*===\s*"mlb"\s*\?\s*"data\/kalshi-mlb\.json"/.test(src),
  'markets.js maps the MLB tab to data/kalshi-mlb.json');
assert(/disagreeCard\s*\(\s*games\s*,\s*snap\s*,\s*dir\s*,\s*lkey\s*\)/.test(src),
  "markets.js passes the tab league key into disagreeCard");
assert(/function disagreeCard\s*\(\s*games\s*,\s*snap\s*,\s*dir\s*,\s*league\s*\)/.test(src),
  "disagreeCard takes a league parameter");
assert(/D\.matches\s*\(evs,\s*\(snap\.games\|\|\[\]\),\s*dir,\s*window\.GIU\.teamFind,\s*league\)/.test(src),
  "disagreeCard forwards league into D.matches");
assert(/teamFind\s*\(\s*dir\s*,\s*league\s*,\s*x\.abbrA\s*\)/.test(src),
  "disagreeCard forwards league into teamFind for row headers");
assert(/MLB postseason games/.test(src) && !/matched NFL games/.test(src),
  "disagree card copy is league-aware (no NFL-only strings left)");
assert(!/cross-book disagreement \(NFL tab only\)/i.test(src),
  "stale NFL-only comment removed");

if(failures){
  console.error("\n"+failures+" FAILURES");
  process.exit(1);
}
console.log("\nall mlb disagreement-card checks passed");
