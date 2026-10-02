/* GridIronUI v1.128.0 — Kalshi "what moved" badges.
   The fetch script bakes a snapshot-to-snapshot diff into each Kalshi
   snapshot ({prev_at, moves, new_games}); the markets page Kalshi tabs and
   the odds page's no-key market section badge teams whose Yes price moved
   2c+ since the previous snapshot, and tag newly listed games.
   Covers: K.diffMoves (the node-testable spec of the fetch script's Python
   diff — parity was verified by hand at implementation time), K.moveBadge
   HTML (threshold, classes, XSS), the OL rendering path with/without moves,
   the real baked snapshots' shape, and shipped wiring pins.
   Run: node tests/test-kalshi-moves.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var K = require("../js/kalshi-logic.js");
var OL = require("../js/odds-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:  ", msg);
}
function read(rel){ return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---- fixtures ---- */
function mk(et, teams, kind){
  return {event_ticker: et, title: et,
          markets: teams.map(function(t){
            return {ticker: et + "-" + t[0], kind: kind || "winner", team: t[0],
                    yes_bid: t[1], yes_ask: t[2], last: t[3]};
          })};
}
var PREV = {updated_at: "2026-10-01T10:00:00Z", games: [
  mk("G1", [["Alpha", 40, 41, 41], ["Beta", 59, 60, 60]]),   /* Alpha +3, Beta -3 */
  mk("G2", [["Gamma", 50, 51, 51], ["Delta", 49, 50, 50]]),  /* +/-1c: below the bar */
  mk("G3", [["Eps", 0, 1, 0], ["Zeta", 99, 100, 100]]),      /* settled */
  mk("G4", [["Eta", 30, 31, 31], ["Theta", 69, 70, 70]]),    /* unchanged */
  mk("G7", [["Iota", 55, 56, 56]], "other"),                 /* other-kind: ignored */
]};
var CUR = {updated_at: "2026-10-01T12:00:00Z", games: [
  mk("G1", [["Alpha", 43, 44, 44], ["Beta", 56, 57, 57]]),
  mk("G2", [["Gamma", 51, 52, 52], ["Delta", 48, 49, 49]]),
  mk("G3", [["Eps", 0, 1, 0], ["Zeta", 99, 100, 100]]),
  mk("G4", [["Eta", 30, 31, 31], ["Theta", 69, 70, 70]]),
  mk("G5", [["Kap", 55, 56, 56], ["Lam", 44, 45, 45]]),      /* new game */
  mk("G6", [["Mu", 0, 1, 1], ["Nu", 99, 100, 99]]),          /* new but settled: not "new" */
  mk("G7", [["Iota", 90, 91, 91]], "other"),
  mk("G1", [["Alpha", 43, 44, 44], ["Beta", 56, 57, 57]]),   /* dup ticker: ignored */
]};

/* ---- K.diffMoves ---- */
var d = K.diffMoves(PREV, CUR);
assert(d.prev_at === "2026-10-01T10:00:00Z", "prev_at carries the previous snapshot time");
assert(d.moves.length === 2, "exactly the two real moves surface (got " + d.moves.length + ")");
var a = d.moves.filter(function(m){ return m.team === "Alpha"; })[0];
var b = d.moves.filter(function(m){ return m.team === "Beta"; })[0];
assert(a && a.delta === 3 && a.prev === 41 && a.now === 44, "Alpha +3c with prev/now recorded");
assert(b && b.delta === -3 && b.prev === 60 && b.now === 57, "Beta -3c with prev/now recorded");
assert(a && a.event_ticker === "G1", "move carries the event ticker");
assert(!d.moves.some(function(m){ return m.team === "Gamma" || m.team === "Delta"; }),
       "1c wiggles stay below the 2c bar");
assert(!d.moves.some(function(m){ return m.team === "Eps" || m.team === "Zeta"; }),
       "settled game earns no move badges");
assert(!d.moves.some(function(m){ return m.team === "Eta" || m.team === "Theta"; }),
       "unchanged prices earn nothing");
assert(!d.moves.some(function(m){ return m.team === "Iota"; }),
       "'other'-kind markets never diff");
assert(d.new_games.length === 1 && d.new_games[0] === "G5",
       "new game flagged once (settled-at-birth G6 excluded, dup G1 not new)");
var d2 = K.diffMoves(null, CUR);
assert(d2.prev_at === null && d2.moves.length === 0 && d2.new_games.length === 0,
       "no baseline -> no badges at all (first snapshot stays quiet)");
var d3 = K.diffMoves({games: []}, CUR);
assert(d3.moves.length === 0 && d3.new_games.length === 0,
       "empty previous games list -> no phantom 'new' badges");
/* last-price fallback: book empty, last trade moves 3c */
var lp = K.diffMoves(
  {updated_at: "2026-10-01T10:00:00Z", games: [
    {event_ticker: "L1", markets: [{kind: "winner", team: "Solo", yes_bid: null, yes_ask: null, last: 50}]}]},
  {games: [
    {event_ticker: "L1", markets: [{kind: "winner", team: "Solo", yes_bid: null, yes_ask: null, last: 53}]}]});
assert(lp.moves.length === 1 && lp.moves[0].delta === 3, "last-trade fallback prices diff honestly");
/* team listed now but absent before: no badge, no crash */
var tn = K.diffMoves(
  {updated_at: "2026-10-01T10:00:00Z", games: [mk("T1", [["Known", 50, 51, 51]])]},
  {games: [mk("T1", [["Known", 53, 54, 54], ["Stranger", 46, 47, 47]])]});
assert(tn.moves.length === 1 && tn.moves[0].team === "Known",
       "team with no baseline price earns no badge (the known side still does)");
/* custom threshold honored */
var dt = K.diffMoves(PREV, CUR, 4);
assert(dt.moves.length === 0, "tighter threshold drops the 3c moves");

/* ---- K.moveBadge ---- */
var up = K.moveBadge(3, "Pittsburgh", "2026-10-01T12:57:42Z");
assert(up.indexOf("mv-up") !== -1 && up.indexOf("+3") !== -1,
       "up move renders the mv-up badge with the delta");
assert(/title="[^"]*since the [^"]*snapshot/.test(up),
       "badge title names the baseline snapshot");
var dn = K.moveBadge(-2, "Cleveland", null);
assert(dn.indexOf("mv-dn") !== -1 && dn.indexOf("2") !== -1, "down move renders mv-dn");
assert(K.moveBadge(1, "X", null) === "", "1c wiggle -> no badge");
assert(K.moveBadge(-1, "X", null) === "", "-1c wiggle -> no badge");
assert(K.moveBadge(0, "X", null) === "", "zero -> no badge");
assert(K.moveBadge(NaN, "X", null) === "" && K.moveBadge("abc", "X", null) === "",
       "garbage delta -> no badge");
var evil = K.moveBadge(3, "<script>alert(1)</script>", null);
assert(evil.indexOf("<script>") === -1 && evil.indexOf("&lt;script&gt;") !== -1,
       "team name is escaped inside the badge title (XSS)");

/* ---- OL rendering path ---- */
global.window = {Kalshi: K}; /* browser shape: odds-logic resolves moveBadge at call time */
var team = {name: "Pittsburgh", price: 58,
            book: {bid: 57, ask: 58, spread: 1, cls: "green", lbl: "tight book"},
            vol: "24h vol $128K"};
var rowB = OL.marketTeamRow(team, K.moveBadge(3, "Pittsburgh", null));
assert(rowB.indexOf("mv-up") !== -1, "marketTeamRow renders a passed badge");
var rowN = OL.marketTeamRow(team);
assert(rowN.indexOf("mv-up") === -1 && rowN.indexOf("58") !== -1,
       "marketTeamRow without a badge renders exactly as before");
var game = {title: "G", sub: "S", ticker: "T1",
            teams: [team, {name: "Cleveland", price: 42, book: null, vol: ""}]};
var card = OL.marketGameCard(game, "when", {Pittsburgh: 3, Cleveland: -1}, null);
assert(card.indexOf("mv-up") !== -1, "marketGameCard badges the moved team");
assert(card.split("mv-dn").length - 1 === 0, "the -1c team earns no badge");
var card0 = OL.marketGameCard(game, "when");
assert(card0.indexOf("mv-up") === -1 && card0.indexOf("mv-dn") === -1,
       "marketGameCard without moves renders badge-free");
var sec = OL.marketSectionHtml([game], "2026-10-01T12:00:00Z", false,
                               [{event_ticker: "T1", team: "Pittsburgh", delta: 3}],
                               "2026-10-01T10:00:00Z");
assert(sec.indexOf("mv-up") !== -1, "marketSectionHtml routes the baked diff to the right game");
var secNoMove = OL.marketSectionHtml([game], "2026-10-01T12:00:00Z", false);
assert(secNoMove.indexOf("mv-up") === -1, "marketSectionHtml without moves degrades cleanly");
delete global.window;

/* ---- real baked snapshots ---- */
["kalshi-nfl", "kalshi-mlb"].forEach(function(name){
  var snap = JSON.parse(read("data/" + name + ".json"));
  assert(typeof snap.prev_at === "string" || snap.prev_at === null,
         name + ".json carries prev_at (" + snap.prev_at + ")");
  assert(Array.isArray(snap.moves) && Array.isArray(snap.new_games),
         name + ".json carries moves/new_games arrays");
  assert(snap.moves.every(function(m){
    return m.event_ticker && m.team && Number.isInteger(m.delta) &&
           Math.abs(m.delta) >= 2 && Number.isInteger(m.prev) && Number.isInteger(m.now);
  }), name + ".json moves are well-shaped and honor the 2c bar");
});

/* ---- shipped wiring pins ---- */
var marketsJs = read("js/markets.js");
assert(marketsJs.indexOf("snap.moves") !== -1, "markets.js reads the baked moves");
assert(marketsJs.indexOf("snap.new_games") !== -1, "markets.js reads new_games");
assert(marketsJs.indexOf("moveBadge") !== -1, "markets.js renders move badges");
assert(marketsJs.indexOf("new market") !== -1, "markets.js tags newly listed games");
var oddsJs = read("js/odds.js");
assert(/d && d\.moves/.test(oddsJs), "odds.js passes the baked diff into the market section");
var marketsHtml = read("markets.html");
assert(marketsHtml.indexOf("2¢ or more") !== -1,
       "markets.html notice explains the move badges");
assert(/js\/markets\.js\?v=1.162.0/.test(marketsHtml), "markets.html keys markets.js at v1.162.0");
assert(/js\/kalshi-logic\.js\?v=1.147.0/.test(marketsHtml), "markets.html keys kalshi-logic.js at v1.147.0");
var oddsHtml = read("odds.html");
assert(/js\/odds-logic\.js\?v=1\.140\.0/.test(oddsHtml), "odds.html keys odds-logic.js at v1.140.0");
assert(/js\/kalshi-logic\.js\?v=1\.147\.0/.test(oddsHtml), "odds.html keys kalshi-logic.js at v1.147.0");
assert(/js\/odds\.js\?v=1\.145\.0/.test(oddsHtml), "odds.html keys odds.js at v1.145.0");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("\nAll kalshi-moves assertions passed.");
