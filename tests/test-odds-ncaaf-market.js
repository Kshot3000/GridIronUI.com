/* GridIronUI v2.0.5 — NCAAF joins the odds board's no-key "market line".
   The NCAAF tab used to dead-end for keyless visitors ("this board stays
   empty") even though the site has carried a real 257-game Kalshi college
   snapshot since v2.0.4. The market line renders a snapshot directly (no
   per-game mapping), so NCAAF wires in exactly like NFL/MLB — behind a
   first-page cap so the big Saturday slate doesn't flood the board:
   cards past the cap render hidden + flagged (data-cap-extra), an honest
   count + Show-all toggle ships with the section, and find-a-game lifts
   the cap while a search is active. Stale snapshots still withhold.
   Run: node tests/test-odds-ncaaf-market.js */
"use strict";
var OL = require("../js/odds-logic.js");
var K = require("../js/kalshi-logic.js");
var fs = require("fs"), path = require("path");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function read(rel){ return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }
function mkGame(i){
  return { title: "Team" + i + " vs Team" + (i + 100), sub: "T" + i + " vs T" + (i + 100) + " (Oct 3)",
           ticker: "EV" + i, close: 1760000000000 + i * 60000,
           teams: [ {name: "Team" + i, price: 58, book: {bid: 57, ask: 58}, vol: ""},
                    {name: "Team" + (i + 100), price: 42, book: {bid: 41, ask: 43}, vol: ""} ] };
}
function count(hay, needle){ return hay.split(needle).length - 1; }

/* ---- cap contract (pure) ---- */
var games30 = []; for(var i = 0; i < 30; i++) games30.push(mkGame(i));
var capped = OL.marketSectionHtml(games30, "2026-10-03T07:48:55Z", false, null, null, 12);
assert(count(capped, "game-card") === 30, "capped section still renders every game card (search + toggle need them in the DOM)");
assert(count(capped, 'data-cap-extra="1"') === 18, "exactly the 18 games past the cap are flagged cap-extra");
assert(capped.indexOf("Showing the 12 soonest of 30 games") !== -1, "honest showing-count ships with the section");
assert(capped.indexOf('id="marketMoreBtn"') !== -1, "Show-all toggle ships with the section");
assert(capped.indexOf('data-total="30"') !== -1 && capped.indexOf('data-cap="12"') !== -1,
       "toggle carries the total + cap for its label/note updates");
assert(capped.indexOf('aria-expanded="false"') !== -1, "toggle starts collapsed for assistive tech");
var firstExtra = capped.indexOf('data-cap-extra="1"');
assert(capped.indexOf("Team11 vs Team111") !== -1 && capped.indexOf("Team11 vs Team111") < firstExtra,
       "the 12th game renders visible, before the first cap-extra card");
assert(capped.indexOf("Team29 vs Team129") > firstExtra, "the last game sits behind the cap, still in the DOM");

/* ---- no cap / loose cap: byte-level discipline of the old behavior ---- */
var plain = OL.marketSectionHtml(games30, "2026-10-03T07:48:55Z", false);
assert(plain.indexOf("data-cap-extra") === -1 && plain.indexOf("marketMoreBtn") === -1,
       "no cap -> no hidden cards, no toggle (NFL/MLB render exactly as before)");
var loose = OL.marketSectionHtml(games30.slice(0, 5), "2026-10-03T07:48:55Z", false, null, null, 12);
assert(loose.indexOf("data-cap-extra") === -1 && loose.indexOf("marketMoreBtn") === -1,
       "cap above the game count -> no cap UI");
[0, -3, NaN, "12", null, undefined].forEach(function(bad){
  var h = OL.marketSectionHtml(games30.slice(0, 3), "2026-10-03T07:48:55Z", false, null, null, bad);
  assert(h.indexOf("data-cap-extra") === -1, "garbage cap " + String(bad) + " -> treated as no cap, never throws");
});

/* ---- stale still withholds, cap or not ---- */
var stale = OL.marketSectionHtml(games30, "2026-10-02T00:00:00Z", true, null, null, 12);
assert(stale.indexOf("stale") !== -1 && stale.indexOf("Team0") === -1 && stale.indexOf("marketMoreBtn") === -1,
       "stale snapshot withholds prices AND the toggle — nothing to expand");

/* ---- card-level flag ---- */
var extraCard = OL.marketGameCard(mkGame(1), "Oct 3 · 2:48 AM", null, null, true);
assert(extraCard.indexOf('data-cap-extra="1"') !== -1 && extraCard.indexOf("display:none") !== -1,
       "cap-extra card renders hidden + flagged");
var visCard = OL.marketGameCard(mkGame(1), "Oct 3 · 2:48 AM");
assert(visCard.indexOf("data-cap-extra") === -1 && visCard.indexOf("display:none") === -1,
       "ordinary card carries no cap flag (unchanged)");

/* ---- real snapshot integration ---- */
var snap = JSON.parse(read("data/kalshi-ncaaf.json"));
var real = K.games(snap).filter(function(g){ return !g.settled; });
assert(real.length >= 100, "real NCAAF snapshot yields a full slate (" + real.length + " games)");
var realHtml = OL.marketSectionHtml(real, snap.updated_at, K.stale(snap.updated_at), snap.moves, snap.prev_at, 12);
assert(count(realHtml, 'data-cap-extra="1"') === real.length - 12,
       "real section hides exactly games 13..N behind the cap");
assert(realHtml.indexOf('data-total="' + real.length + '"') !== -1, "toggle total matches the real slate size");
var lastTitle = real[real.length - 1].title;
assert(realHtml.indexOf(lastTitle.replace(/&/g, "&amp;")) !== -1,
       "the latest game of the slate is in the section (find-a-game covers the whole snapshot)");

/* ---- shipped wiring pins ---- */
var oddsJs = read("js/odds.js");
assert(/americanfootball_ncaaf:\s*"kalshi-ncaaf"/.test(oddsJs), "MARKET_SNAP wires NCAAF to the kalshi-ncaaf snapshot");
assert(/MARKET_CAP\s*=\s*\{\s*"kalshi-ncaaf":\s*12\s*\}/.test(oddsJs), "only the NCAAF slate carries a first-page cap (12)");
assert(/MARKET_CAP\[snap\]/.test(oddsJs), "the fallback passes the per-snapshot cap into marketSectionHtml");
assert(oddsJs.indexOf('getAttribute("data-cap-extra")') !== -1 && oddsJs.indexOf("marketExpanded") !== -1,
       "applySearch is cap-aware (cap holds un-searched + un-expanded; an active search lifts it)");
assert(oddsJs.indexOf('closest("#marketMoreBtn")') !== -1 && oddsJs.indexOf('setAttribute("aria-expanded"') !== -1,
       "the board's delegated click handler owns the Show-all toggle + aria state");
assert(!/kalshi-ncaaf/.test(read("js/predictions.js")), "predictions.js stays deliberately unwired (no college matching there)");
var oddsHtml = read("odds.html");
assert(oddsHtml.indexOf('src="js/odds.js?v=2.0.5"') !== -1, "odds.html keys odds.js at v2.0.5");
assert(oddsHtml.indexOf('src="js/odds-logic.js?v=2.0.5"') !== -1, "odds.html keys odds-logic.js at v2.0.5");
assert(read("matchup.html").indexOf('src="js/odds-logic.js?v=2.0.5"') !== -1,
       "matchup.html keys the shared odds-logic.js at v2.0.5");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all assertions passed");
