/* GridIronUI v1.96.0 — cross-book disagreement card now covers the MLB tab
   on markets.html (Wild Card week), not just NFL. Covers:
   - Disagree.matches() with the REAL data/kalshi-mlb.json snapshot + a
     realistic Polymarket MLB event pairs correctly on the "mlb" league key;
     the CWS->CHW alias is covered by a self-contained synthetic Kalshi
     fixture, since the live snapshot delists decided games;
   - v1.96.0: the PM event is driven off the snapshot itself (the snapshot
     evolves as series progress — settled games leave the board), and the
     same-day rule is verified end-to-end: a PM event on the snapshot game
     day matches, a PM event on a day with no Kalshi entry is dropped;
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
  {abbr:"HOU", displayName:"Houston Astros",     shortDisplayName:"Astros"},
  {abbr:"PHI", displayName:"Philadelphia Phillies", shortDisplayName:"Phillies"},
  {abbr:"ATL", displayName:"Atlanta Braves",     shortDisplayName:"Braves"}
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
/* ---- live logic against the real committed snapshot ----
   The snapshot evolves as the series progresses (settled games leave the
   board), so the Polymarket event is driven off the snapshot itself: the
   latest-dated game both of whose abbreviations resolve in the directory. */
assert(Array.isArray(snap.games) && snap.games.length >= 1,
  "MLB snapshot holds at least 1 postseason game (got "+(snap.games||[]).length+")");
function fullName(ab){
  var t = teamFind({mlb: dir.mlb}, "mlb", ab);
  return t ? t.displayName : null;
}
var target = null, targetDate = "";
snap.games.forEach(function(g){
  var ab = D.kalshiAbbrs(g.sub_title);
  if(!ab || !fullName(ab[0]) || !fullName(ab[1])) return;
  var dt = D.kalshiDate(g);
  if(!dt) return;
  if(!target || dt > targetDate){ target = g; targetDate = dt; }
});
assert(target !== null, "snapshot holds a game whose teams resolve in the test directory");
var tAb = D.kalshiAbbrs(target.sub_title), aAb = tAb[0], bAb = tAb[1];
var aNm = fullName(aAb), bNm = fullName(bAb);
/* Expected Kalshi sides, derived from the committed snapshot itself. */
function snapPrice(g, ab){
  var mm = (g.markets||[]).filter(function(x){ return D.kalshiTeamAbbr(x) === ab; })[0];
  return mm ? D.kalshiPrice(mm) : null;
}
var expA = snapPrice(target, aAb), expB = snapPrice(target, bAb);
assert(expA !== null && expB !== null,
  "snapshot markets priced for "+aAb+"/"+bAb+" ("+target.event_ticker+")");
/* Polymarket-style event on the same game day: 7pm ET == the ticker day. */
function pmOn(aCents){
  return {
    title: aNm + " vs. " + bNm,
    startTime: targetDate + "T23:00:00Z",
    markets: [ ml([aNm, bNm], [aCents/100, (100-aCents)/100], 5000000) ]
  };
}
var gapDir = (expA - 4 > 0) ? -4 : 4; /* keep the PM price inside 1..99 */
/* Strictly inside (1, 99): the decided-game filter (v1.117.0) drops PM
   prices at exactly 1 or 99, so when the snapshot game's price runs to the
   edge (e.g. PHI at 5 -> synthetic 1), clamp rather than pin a figure. */
var pmA = Math.max(2, Math.min(98, expA + gapDir));
var mt = D.matches([pmOn(pmA)], snap.games, dir, teamFind, "mlb");
assert(mt.length === 1,
  aAb+"/"+bAb+" on the snapshot game day matches one Kalshi game on league=mlb");
if(mt.length && expA !== null){
  var m = mt[0];
  assert(m.abbrA === aAb && m.abbrB === bAb,
    "sides resolve to "+aAb+"/"+bAb+" (got "+m.abbrA+"/"+m.abbrB+")");
  assert(m.pmA === pmA && m.pmB === 100 - pmA,
    "Polymarket prices carried through (got "+m.pmA+"/"+m.pmB+")");
  assert(m.kalshiA === expA && m.kalshiB === expB,
    "Kalshi sides match the snapshot numbers (got "+m.kalshiA+"/"+m.kalshiB+", want "+expA+"/"+expB+")");
  var dis = D.disagreements(mt, 3);
  assert(dis.length === 1 && dis[0].delta === pmA - expA,
    "gap flagged as a disagreement (delta "+(dis[0]&&dis[0].delta)+")");
  var mtAgree = D.matches([pmOn(expA)], snap.games, dir, teamFind, "mlb");
  assert(D.disagreements(mtAgree, 3).length === 0,
    "0c gap correctly not flagged");
  /* Same-day rule: a PM event on a day with no Kalshi entry for THIS pair is
     dropped, never borrows another game of the series. The off-day is found
     by scanning forward from the target day, so later rounds can't collide. */
  function pairHasGame(day){
    return snap.games.some(function(g){
      var ab = D.kalshiAbbrs(g.sub_title);
      var samePair = ab && ((ab[0]===aAb && ab[1]===bAb) || (ab[0]===bAb && ab[1]===aAb));
      return samePair && D.kalshiDate(g) === day;
    });
  }
  var offD = new Date(Date.parse(targetDate+"T12:00:00Z") + 86400000), offDayStr = "";
  for(var i = 0; i < 14 && !offDayStr; i++){
    var ds = offD.toISOString().slice(0, 10);
    if(!pairHasGame(ds)) offDayStr = ds;
    offD = new Date(offD.getTime() + 86400000);
  }
  assert(offDayStr !== "", "found an off-day with no Kalshi entry for "+aAb+"/"+bAb);
  var offDay = {
    title: aNm + " vs. " + bNm,
    startTime: offDayStr + "T23:00:00Z",
    markets: [ ml([aNm, bNm], [0.5, 0.5], 5000000) ]
  };
  assert(D.pmGameDay(offDay) === offDayStr,
    "off-day event maps to "+offDayStr+" ("+D.pmGameDay(offDay)+")");
  assert(D.matches([offDay], snap.games, dir, teamFind, "mlb").length === 0,
    "a PM event with no same-day Kalshi entry is dropped, never guessed");
}

/* White Sox @ Astros: Kalshi lists CWS, ESPN lists CHW — the alias must
   still match on the MLB tab. Self-contained synthetic Kalshi fixture (the
   same shape as a real snapshot entry): the live snapshot delists decided
   games, so this must never depend on CWS@HOU being on the board. */
var synthG2 = {
  event_ticker: "KXMLBGAME-26SEP301700CWSHOU",
  title: "Game 2: Chicago WS vs Houston",
  sub_title: "CWS vs HOU (Sep 30)",
  markets: [
    {ticker: "KXMLBGAME-26SEP301700CWSHOU-CWS", title: "Chicago WS wins",
     kind: "winner", yes_bid: 41, yes_ask: 43, last: 42},
    {ticker: "KXMLBGAME-26SEP301700CWSHOU-HOU", title: "Houston wins",
     kind: "winner", yes_bid: 57, yes_ask: 59, last: 58}
  ]
};
var pmG2 = {
  title: "White Sox vs. Astros",
  startTime: "2026-09-30T20:00:00Z",
  markets: [ ml(["White Sox","Astros"], [0.42,0.58], 2000000) ]
};
var mt2 = D.matches([pmG2], [synthG2], dir, teamFind, "mlb");
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
assert(/D\.matches\s*\(evs,\s*klGames,\s*dir,\s*window\.GIU\.teamFind,\s*league\)/.test(src),
  "disagreeCard forwards league into D.matches (over the settled-filtered klGames)");
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
