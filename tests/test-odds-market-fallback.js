/* GridIronUI v1.101.0 — no-key "market line" fallback on the odds board.
   The odds board used to show a dead board to every visitor without an Odds
   API key. For NFL/MLB it now renders real Kalshi snapshot prices (cents ->
   American moneyline via OL.centsToAm, pure HTML via OL.market*Html) with
   honest snapshot labeling; stale snapshots withhold prices; a failed fetch
   degrades to the plain no-key state. Run: node tests/test-odds-market-fallback.js */
"use strict";
var OL = require("../js/odds-logic.js");
var K = require("../js/kalshi-logic.js");
var fs = require("fs"), path = require("path");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---- centsToAm ---- */
assert(OL.centsToAm(50) === "+100", "50c is even money (+100)");
assert(OL.centsToAm(57) === "-133", "57c -> -133");
assert(OL.centsToAm(58) === "-138", "58c -> -138");
assert(OL.centsToAm(41) === "+144", "41c -> +144");
assert(OL.centsToAm(42) === "+138", "42c -> +138");
assert(OL.centsToAm(99) === "-9900", "99c -> -9900 (favorite math)");
assert(OL.centsToAm(1) === "+9900", "1c -> +9900 (longshot math)");
assert(OL.centsToAm(0) === null, "0c unpriceable -> null");
assert(OL.centsToAm(100) === null, "100c unpriceable -> null (no div-by-zero)");
assert(OL.centsToAm(-5) === null, "negative -> null");
assert(OL.centsToAm(101) === null, ">100 -> null");
assert(OL.centsToAm(NaN) === null, "NaN -> null");
assert(OL.centsToAm("abc") === null, "garbage -> null");

/* ---- marketTeamRow ---- */
var team = {name: "Pittsburgh", price: 58,
            book: {bid: 57, ask: 58, spread: 1, cls: "green", lbl: "tight book"},
            vol: "24h vol $128K"};
var row = OL.marketTeamRow(team);
assert(row.indexOf("Pittsburgh") !== -1, "row names the team");
assert(row.indexOf("58¢") !== -1 || row.indexOf("58\u00a2") !== -1, "row shows the cent price");
assert(row.indexOf("-138") !== -1, "row shows the American moneyline");
assert(row.indexOf("57") !== -1 && row.indexOf("58") !== -1, "row shows the bid/ask book");
var evil = OL.marketTeamRow({name: "<script>alert(1)</script>", price: 58, book: null, vol: ""});
assert(evil.indexOf("<script>") === -1 && evil.indexOf("&lt;script&gt;") !== -1,
       "team name is HTML-escaped (XSS)");
assert(OL.marketTeamRow({name: "X", price: null}) === "", "unpriced team -> empty row");
assert(OL.marketTeamRow({name: "X", price: 0}) === "", "0c team -> empty row");

/* ---- marketGameCard ---- */
var game = {title: "PIT Steelers vs CLE Browns", sub: "PIT vs CLE (Oct 1)",
            close: Date.parse("2026-10-04T00:15:00Z"),
            teams: [team, {name: "Cleveland", price: 42, book: {bid: 41, ask: 43}, vol: ""}]};
var card = OL.marketGameCard(game, "Sep 30 · 9:44 AM");
assert(card.indexOf("PIT Steelers vs CLE Browns") !== -1, "card carries the matchup title");
assert(card.indexOf("Kalshi") !== -1, "card carries the Kalshi tag (never a book line)");
assert(card.indexOf("Cleveland") !== -1 && card.indexOf("+138") !== -1, "card shows the dog side");
assert(card.indexOf("9:44 AM") !== -1, "card shows the snapshot time");
assert(card.indexOf("Oct 1") !== -1, "card dates the game from Kalshi's sub_title");
assert(card.indexOf("Oct 4") === -1, "card never formats close_time as the game time (Kalshi closes markets days after kickoff)");
assert(OL.marketGameCard({title: "T", teams: []}, "") === "", "game with no rows -> empty");

/* ---- marketSectionHtml: stale ---- */
var staleHtml = OL.marketSectionHtml([game], "2026-09-29T00:00:00Z", true);
assert(staleHtml.indexOf("stale") !== -1, "stale snapshot -> stale warning");
assert(staleHtml.indexOf("-138") === -1, "stale snapshot -> prices withheld, never shown as fresh");
assert(staleHtml.indexOf("Odds API key") !== -1, "stale notice still points at the key path");

/* ---- marketSectionHtml: empty ---- */
assert(OL.marketSectionHtml([], "2026-09-30T09:44:48Z", false) === "",
       "no priceable games -> empty (caller renders plain no-key state)");

/* ---- integration: real snapshot shape through K.games -> section ---- */
var snapPath = path.join(__dirname, "..", "data", "kalshi-nfl.json");
var snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
var games = K.games(snap).filter(function(g){ return !g.settled; });
assert(games.length >= 2, "real NFL snapshot yields priceable games ("+games.length+")");
var section = OL.marketSectionHtml(games, snap.updated_at, K.stale(snap.updated_at));
assert(section.indexOf("Market line") !== -1, "section header present");
assert(section.indexOf("no key needed") !== -1, "section says no key needed");
assert(section.indexOf("server snapshot") !== -1, "section is labeled as a snapshot");
assert(section.indexOf("markets.html") !== -1, "section links to the full markets page");
assert(section.indexOf("Pittsburgh") !== -1 || section.indexOf("Steelers") !== -1,
       "section carries real snapshot team names");
assert(/[-+]\d{2,}/.test(section), "section carries American moneylines");

/* ---- integration: settled games never reach the board ---- */
function mkMarkets(prices){
  return prices.map(function(p, i){
    return {team: "T"+i, kind: "winner", yes_bid: p.b, yes_ask: p.a,
            close_time: "2026-10-04T02:00:00Z"};
  });
}
var mixed = {updated_at: new Date().toISOString(), games: [
  {event_ticker: "LIVE", title: "Live Game", markets: mkMarkets([{b:43,a:44},{b:56,a:57}])},
  {event_ticker: "DONE", title: "Done Game", markets: mkMarkets([{b:0,a:1},{b:99,a:100}])}
]};
var live = K.games(mixed).filter(function(g){ return !g.settled; });
var mixedHtml = OL.marketSectionHtml(live, mixed.updated_at, false);
assert(mixedHtml.indexOf("Live Game") !== -1, "live game renders");
assert(mixedHtml.indexOf("Done Game") === -1, "settled game excluded from the board");

/* ---- odds.html wiring guards ---- */
var oddsHtml = fs.readFileSync(path.join(__dirname, "..", "odds.html"), "utf8");
assert(/js\/kalshi-logic\.js\?v=1\.128\.0/.test(oddsHtml), "odds.html loads kalshi-logic.js keyed");
assert(/js\/odds-logic\.js\?v=1\.128\.0/.test(oddsHtml), "odds.html bumps odds-logic.js key");
assert(/js\/odds\.js\?v=1\.128\.0/.test(oddsHtml), "odds.html bumps odds.js key");
var oddsJs = fs.readFileSync(path.join(__dirname, "..", "js", "odds.js"), "utf8");
assert(oddsJs.indexOf("renderMarketFallback") !== -1, "odds.js has the fallback renderer");
assert(/MARKET_SNAP\s*=\s*\{[^}]*americanfootball_nfl[^}]*baseball_mlb/.test(oddsJs),
       "fallback covers NFL and MLB snapshot sports");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all assertions passed");
