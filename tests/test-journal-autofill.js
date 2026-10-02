/* GridIronUI bet-journal closing-line auto-fill — pure matching core tests.
   Loads the shipped js/journal.js in a stub-DOM vm and exercises the pure
   helpers: normalizePair (order-insensitive pair keys), matchSnapshot
   (30h game-date window, latest-snapshot-wins, malformed storage safety).
   Run: node tests/test-journal-autofill.js */
"use strict";
const fs = require("fs");
const vm = require("vm");

const sandbox = {
  document: {
    readyState: "complete",
    getElementById: () => null,
    createElement: () => ({}),
    addEventListener: () => {},
  },
  localStorage: {
    getItem: () => null, setItem: () => {}, removeItem: () => {},
  },
  /* stub team directory for resolveBetPair / resolvePickAbbr */
  GIU: {
    teamFind: (dir, league, q) => {
      const TEAMS = {
        "kansas city chiefs": "KC", "green bay packers": "GB",
        "chiefs": "KC", "packers": "GB",
        "dallas cowboys": "DAL", "cowboys": "DAL",
      };
      const ab = TEAMS[String(q == null ? "" : q).toLowerCase()];
      return ab ? { abbr: ab } : null;
    },
  },
  console,
};
sandbox.window = sandbox;
sandbox.window.BetMath = { closeValid: () => null };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/../js/journal.js", "utf8"), sandbox, {filename: "journal.js"});
const J = sandbox.Journal;

let pass = 0, fail = 0;
function ok(name, cond, extra){ cond ? pass++ : (fail++, console.log("FAIL:", name, extra === undefined ? "" : extra)); }

/* bet day 2026-10-01; betT = local end of that day (matches betEventEndMs) */
const betT = new Date(2026, 9, 1, 23, 59, 59).getTime();
const H = 3600 * 1000;
function gameIso(msBeforeBetT){ return new Date(betT - msBeforeBetT).toISOString(); }
function bet(pair, date){ return { pair: pair, date: date === undefined ? "2026-10-01" : date }; }
function snap(t, pair, date, spread, total){
  return { t: t, pair: pair, date: date, spread: spread === undefined ? -110 : spread,
           total: total === undefined ? -110 : total };
}

/* ---- normalizePair ---- */
ok("pair order-insensitive", J.normalizePair("gb", "kc") === J.normalizePair("kc", "gb"));
ok("pair canonical form", J.normalizePair("kc", "gb") === "GB|KC");
ok("pair trims + uppercases", J.normalizePair("  kc ", "Gb") === "GB|KC");
ok("pair null side -> null", J.normalizePair(null, "KC") === null);
ok("pair empty side -> null", J.normalizePair("", "KC") === null);
ok("pair both missing -> null", J.normalizePair(null, undefined) === null);
ok("pair same team twice", J.normalizePair("kc", "KC") === "KC|KC");

/* ---- matchSnapshot: window ---- */
const inWindow = [snap(1000, "GB|KC", gameIso(5 * H))];
ok("game 5h before bet day end matches", J.matchSnapshot(bet("GB|KC"), inWindow) === inWindow[0]);
ok("game exactly 30h before matches (boundary inclusive)",
   J.matchSnapshot(bet("GB|KC"), [snap(1, "GB|KC", gameIso(30 * H))]) !== null);
ok("game 30h+1ms before does not match",
   J.matchSnapshot(bet("GB|KC"), [snap(1, "GB|KC", gameIso(30 * H + 1))]) === null);
ok("game after the bet day does not match",
   J.matchSnapshot(bet("GB|KC"), [snap(1, "GB|KC", new Date(betT + H).toISOString())]) === null);
ok("game 3 days before does not match",
   J.matchSnapshot(bet("GB|KC"), [snap(1, "GB|KC", gameIso(72 * H))]) === null);
ok("closeWindowMs is 30h", J.closeWindowMs === 30 * 3600 * 1000);

/* ---- matchSnapshot: pair + latest-wins ---- */
const two = [snap(1000, "GB|KC", gameIso(5 * H), -110), snap(2000, "GB|KC", gameIso(5 * H), -115)];
ok("latest stored snapshot wins", J.matchSnapshot(bet("GB|KC"), two).spread === -115);
ok("older snapshot not returned", J.matchSnapshot(bet("GB|KC"), two).t === 2000);
ok("wrong pair does not match",
   J.matchSnapshot(bet("GB|KC"), [snap(1, "CHI|DET", gameIso(5 * H))]) === null);
ok("non-canonical pair string does not match (callers canonicalize first)",
   J.matchSnapshot(bet("GB|KC"), [snap(1, "KC|GB", gameIso(5 * H))]) === null);

/* ---- matchSnapshot: empty / malformed ---- */
ok("no snapshots -> null", J.matchSnapshot(bet("GB|KC"), []) === null);
ok("snaps null -> null (no throw)", J.matchSnapshot(bet("GB|KC"), null) === null);
ok("snaps non-array -> null (no throw)", J.matchSnapshot(bet("GB|KC"), {}) === null);
ok("bet without pair -> null", J.matchSnapshot(bet(null), inWindow) === null);
ok("bet with bad date -> null", J.matchSnapshot(bet("GB|KC", "not-a-date"), inWindow) === null);
ok("bet null -> null (no throw)", J.matchSnapshot(null, inWindow) === null);
const hostile = [null, 42, "x", {pair: "GB|KC"}, {pair: "GB|KC", date: "bogus", t: 99999},
                 {pair: "GB|KC", date: gameIso(5 * H), t: "not-a-number", spread: -118},
                 {pair: "XX|YY", date: gameIso(5 * H), t: 99999}];
let hostileRes = null, hostileThrew = false;
try{ hostileRes = J.matchSnapshot(bet("GB|KC"), hostile); }catch(e){ hostileThrew = true; }
ok("malformed entries skipped, no throw", !hostileThrew && hostileRes && hostileRes.spread === -118);
ok("all-malformed -> null",
   J.matchSnapshot(bet("GB|KC"), [null, {nope: 1}, {pair: "GB|KC", date: "bogus"}]) === null);

/* ---- matchSnapshot never invents: spread/total passthrough ---- */
const withTotal = [snap(7, "GB|KC", gameIso(2 * H), -110, -105)];
const m = J.matchSnapshot(bet("GB|KC"), withTotal);
ok("returns the stored snapshot object itself", m === withTotal[0] && m.total === -105);

/* ---- resolveBetPair / resolvePickAbbr (v1.145.0) ---- */
function mlBet(o){
  return Object.assign({ date: "2026-10-01", sport: "NFL",
    event: "Kansas City Chiefs @ Green Bay Packers (DraftKings)",
    market: "Moneyline" }, o || {});
}
ok("resolveBetPair still canonical after refactor",
   J.resolveBetPair({}, mlBet({})) === "GB|KC");
ok("resolvePickAbbr bare team name", J.resolvePickAbbr({}, mlBet({ pick: "Chiefs" })) === "KC");
ok("resolvePickAbbr slip-style pick with trailing price",
   J.resolvePickAbbr({}, mlBet({ pick: "Kansas City Chiefs -150" })) === "KC");
ok("resolvePickAbbr home side by label",
   J.resolvePickAbbr({}, mlBet({ pick: "Packers +125" })) === "GB");
ok("resolvePickAbbr spread-style label strips cleanly",
   J.resolvePickAbbr({}, mlBet({ pick: "Chiefs -3 · -110" })) === "KC");
ok("resolvePickAbbr '?' stays blank", J.resolvePickAbbr({}, mlBet({ pick: "?" })) === null);
ok("resolvePickAbbr empty pick stays blank", J.resolvePickAbbr({}, mlBet({ pick: "" })) === null);
ok("resolvePickAbbr third team rejected",
   J.resolvePickAbbr({}, mlBet({ pick: "Dallas Cowboys -110" })) === null);
ok("resolvePickAbbr unresolvable event stays blank",
   J.resolvePickAbbr({}, mlBet({ event: "Mystery FC @ Unknown United", pick: "Chiefs" })) === null);

/* ---- closeValueFor (v1.145.0): picked-side moneyline closes ---- */
function snapMl(t, pair, date, ml){
  return { t: t, pair: pair, date: date, spread: -110, total: -110, ml: ml };
}
const mlSnap = snapMl(1000, "GB|KC", gameIso(5 * H), { KC: -145, GB: 125 });
ok("closeValueFor spread passthrough",
   J.closeValueFor(mlBet({ market: "Spread" }), mlSnap, {}) === -110);
ok("closeValueFor total passthrough",
   J.closeValueFor(mlBet({ market: "Total" }), mlSnap, {}) === -110);
ok("closeValueFor moneyline uses the picked team's close (away)",
   J.closeValueFor(mlBet({ pick: "Chiefs +130" }), mlSnap, {}) === -145);
ok("closeValueFor moneyline uses the picked team's close (home)",
   J.closeValueFor(mlBet({ pick: "Packers +125" }), mlSnap, {}) === 125);
ok("closeValueFor moneyline pre-v1.145.0 snapshot (no ml) stays blank",
   J.closeValueFor(mlBet({ pick: "Chiefs +130" }), snap(1000, "GB|KC", gameIso(5 * H)), {}) === null);
ok("closeValueFor moneyline unresolvable pick stays blank",
   J.closeValueFor(mlBet({ pick: "?" }), mlSnap, {}) === null);
ok("closeValueFor parlay stays blank",
   J.closeValueFor(mlBet({ market: "Parlay" }), mlSnap, {}) === null);
ok("closeValueFor null snapshot stays blank", J.closeValueFor(mlBet(), null, {}) === null);
ok("closeValueFor malformed stored price stays blank",
   J.closeValueFor(mlBet({ market: "Spread" }),
     { t: 1, pair: "GB|KC", date: gameIso(5 * H), spread: NaN }, {}) === null);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
