/* GridIronUI v1.129.0 — predictions-page Kalshi "what moved" badges.
   The fetch script bakes a snapshot-to-snapshot diff (K.diffMoves contract)
   into the snapshot file as {moves, prev_at, new_games}. These tests verify
   the plumbing that carries it onto the predictions page's Kalshi cross-check
   rows: D.matches exposes the matched game's exact event ticker, K.moveIndex
   joins moves to (ticker, team abbr) with exact team-name joins only, and
   K.predRow renders the badges — quietly when nothing moved.
   Run: node tests/test-predictions-moves.js */
"use strict";
var fs = require("fs"), path = require("path");
var D = require("../js/disagree-logic.js");
var K = require("../js/kalshi-logic.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
var ROOT = path.join(__dirname, "..");
function src(p){ return fs.readFileSync(path.join(ROOT, p), "utf8"); }

/* ---- fixtures ---- */
var dir = {nfl: [
  {abbr:"KC",  displayName:"Kansas City Chiefs",      shortDisplayName:"Chiefs"},
  {abbr:"BUF", displayName:"Buffalo Bills",          shortDisplayName:"Bills"},
  {abbr:"JAX", displayName:"Jacksonville Jaguars",   shortDisplayName:"Jaguars"},
  {abbr:"WSH", displayName:"Washington Commanders",  shortDisplayName:"Commanders"}
]};
function teamFind(d, league, q){
  var list = (d||{})[league] || [];
  q = String(q==null?"":q).trim();
  if(!q || !list.length) return null;
  var qu = q.toUpperCase(), ql = q.toLowerCase();
  for(var i=0;i<list.length;i++) if(list[i].abbr === qu) return list[i];
  for(var j=0;j<list.length;j++)
    if(list[j].displayName.toLowerCase() === ql || list[j].shortDisplayName.toLowerCase() === ql) return list[j];
  return null;
}
function ml(outcomes, prices, volume){
  return {sportsMarketType:"moneyline", outcomes:JSON.stringify(outcomes),
          outcomePrices:JSON.stringify(prices), volume:volume};
}
function kgame(et, sub, mks){
  return {event_ticker: et, sub_title: sub, markets: mks};
}
function kmkt(ticker, team, bid, ask, kind){
  return {ticker: ticker, kind: kind || "winner", team: team, yes_bid: bid, yes_ask: ask, last: null};
}
var ET = "KXNFLGAME-26OCT04KBUF-KC";
var game = kgame(ET, "KC vs BUF (Oct 4)", [
  kmkt(ET+"-KC",  "Kansas City", 70, 74),
  kmkt(ET+"-BUF", "Buffalo",     26, 30)
]);
var snap = {
  updated_at: new Date(Date.now() - 3600*1000).toISOString(),
  prev_at: new Date(Date.now() - 2*3600*1000).toISOString(),
  games: [game],
  moves: [
    {event_ticker: ET, team: "Kansas City", delta: 3,  prev: 69, now: 72},
    {event_ticker: ET, team: "Buffalo",     delta: -2, prev: 28, now: 26},
    {event_ticker: ET, team: "Nobody",      delta: 9,  prev: 10, now: 19}  /* no such market: must not join */
  ],
  new_games: []
};

/* ---- D.kalshiSides carries the event ticker ---- */
var ks = D.kalshiSides(game);
ok("kalshiSides carries et", ks && ks.et === ET, ks && ks.et);
ok("kalshiSides without event_ticker -> et null",
  D.kalshiSides({sub_title:"KC vs BUF (Oct 4)", markets: game.markets}).et === null);

/* ---- D.matches exposes kalshiTicker ---- */
var pmEv = {title: "Chiefs vs. Bills", markets: [ml(["Chiefs","Bills"],[0.72,0.28],500)]};
var m = D.matches([pmEv], [game], dir, teamFind)[0];
ok("matches returns exactly one match", !!m);
ok("matches exposes kalshiTicker", m && m.kalshiTicker === ET, m && m.kalshiTicker);
ok("matches still aligns prices", m && m.kalshiA === 72 && m.kalshiB === 28);

/* ---- K.moveIndex: exact joins only ---- */
var mi = K.moveIndex(snap, D.kalshiTeamAbbr);
ok("moveIndex prevAt passthrough", mi.prevAt === snap.prev_at);
ok("moveIndex joins KC move by ticker+abbr",
  mi.byGame[ET] && mi.byGame[ET].KC === 3, JSON.stringify(mi.byGame[ET]));
ok("moveIndex joins BUF move by ticker+abbr",
  mi.byGame[ET] && mi.byGame[ET].BUF === -2);
ok("moveIndex drops the move for a team with no market (no guessing)",
  mi.byGame[ET] && mi.byGame[ET].Nobody === undefined);
ok("moveIndex ignores moves for unknown tickers",
  Object.keys(K.moveIndex({games: [], moves: [{event_ticker:"NOPE", team:"X", delta:5}]}).byGame).length === 0);
ok("moveIndex skips 'other' markets",
  (function(){
    var g2 = kgame("ET2", "JAC vs WSH (Oct 4)", [
      {ticker:"ET2-JAC", kind:"other", team:"Jacksonville", yes_bid:58, yes_ask:60},
      {ticker:"ET2-WSH", kind:"winner", team:"Washington", yes_bid:40, yes_ask:42}
    ]);
    var s2 = {prev_at: "p", games: [g2],
              moves: [{event_ticker:"ET2", team:"Jacksonville", delta:5}]};
    return K.moveIndex(s2, D.kalshiTeamAbbr).byGame.ET2 === undefined;
  })());
ok("moveIndex aliases ticker-suffix abbrs to ESPN space",
  (function(){
    var g3 = kgame("ET3", "JAC vs WSH (Oct 4)", [
      kmkt("ET3-JAC", "Jacksonville", 58, 60),
      kmkt("ET3-WSH", "Washington", 40, 42)
    ]);
    var s3 = {prev_at: "p", games: [g3],
              moves: [{event_ticker:"ET3", team:"Jacksonville", delta:4}]};
    return K.moveIndex(s3, D.kalshiTeamAbbr).byGame.ET3.JAX === 4;
  })());
ok("moveIndex survives null/empty snapshots",
  K.moveIndex(null).prevAt === null && Object.keys(K.moveIndex({}).byGame).length === 0);

/* ---- K.predRow renders the badges ---- */
var FRESH = snap.updated_at;
var withMoves = K.predRow("Chiefs", 72, "Bills", 28, FRESH, 70, {dA: 3, dB: -2, prevAt: snap.prev_at});
ok("predRow badges a side that moved +3c", withMoves.indexOf("mv-up") > -1 && withMoves.indexOf("+3\u00a2") > -1);
ok("predRow badges a side that moved -2c", withMoves.indexOf("mv-dn") > -1 && withMoves.indexOf("\u22122\u00a2") > -1);
ok("predRow badge title names the baseline", withMoves.indexOf("snapshot") > -1);
ok("predRow keeps the two-crowd gap chip alongside badges", withMoves.indexOf("\u03942\u00a2 vs Polymarket") > -1);
var subBar = K.predRow("Chiefs", 72, "Bills", 28, FRESH, 70, {dA: 1, dB: 0, prevAt: snap.prev_at});
ok("predRow stays quiet for sub-bar moves", subBar.indexOf("mv-up") === -1 && subBar.indexOf("mv-dn") === -1);
var noMoves = K.predRow("Chiefs", 72, "Bills", 28, FRESH, 70);
ok("predRow backward compatible without the moves arg", noMoves.indexOf("mv-up") === -1 && noMoves.indexOf("72%") > -1);
var noMoves2 = K.predRow("Chiefs", 72, "Bills", 28, FRESH, 70, {});
ok("predRow backward compatible with an empty moves object", noMoves2 === noMoves);
var xss = K.predRow("Chiefs", 72, "Bills", 28, FRESH, 70, {dA: 3, dB: 0, prevAt: snap.prev_at});
ok("badge team names are escaped", xss.indexOf("<img") === -1);

/* ---- shipped wiring pins ---- */
var html = src("predictions.html");
ok("predictions.html pins kalshi-logic.js?v=1.141.0", html.indexOf("js/kalshi-logic.js?v=1.141.0") > -1);
ok("predictions.html pins disagree-logic.js?v=1.129.0", html.indexOf("js/disagree-logic.js?v=1.129.0") > -1);
ok("predictions.html pins predictions.js?v=1.135.0", html.indexOf("js/predictions.js?v=1.135.0") > -1);
var pj = src("js/predictions.js");
ok("predictions.js builds the move index", pj.indexOf("moveIndex(snap") > -1);
ok("predictions.js passes the row's moves to predRow", pj.indexOf("r.km.pmA, r.km)") > -1);
ok("predictions.js looks up moves by the exact kalshiTicker", pj.indexOf("mi.byGame[m.kalshiTicker]") > -1);
var kj = src("js/kalshi-logic.js");
ok("kalshi-logic.js defines K.moveIndex", kj.indexOf("K.moveIndex = function") > -1);

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL PREDICTIONS-MOVES TESTS PASSED");
process.exit(fails ? 1 : 0);
