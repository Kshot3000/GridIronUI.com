/* GridIronUI v2.0.4 — Kalshi NCAAF (college football) snapshot + markets tab.
   data/kalshi-ncaaf.json is written by scripts/fetch-kalshi.py
   --series KXNCAAFGAME and powers the markets page "Kalshi · NCAAF" tab —
   the Saturday slate (250+ listed games) that the NFL/MLB-only tabs missed.
   Asserts the file is real snapshot data (timestamped, KXNCAAFGAME series,
   game-winner markets with sane prices), that js/markets.js wires the tab
   through the same KALSHI_TABS config as NFL/MLB, that the shipped
   kalshiAbbrs pattern parses college-length abbreviations (NAVY, MSST,
   CLMB — the old {2,3} pattern parsed only 71 of the first snapshot's 257
   subs, which would have silently killed follow marks on this tab), that
   the tab renders end-to-end in a fake DOM (first-page cap, Show-all,
   a seeded NAVY follow marking its card via the 4-letter code), and that
   the Kalshi joins with no college mapping (predictions Kalshi rows +
   fallback, odds with-key annotations) deliberately stay UNwired rather
   than half-wired. (The odds no-key market line joined in v2.0.5 — it
   renders the snapshot directly; the predictions NCAAF tab joined in
   v2.0.6 — Polymarket-only, no snapshot join.)
   Run: node tests/test-kalshi-ncaaf-snapshot.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function read(rel){ return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---- the fetcher's --series/--out args exist, NFL defaults intact ---- */
var fetchPy = read("scripts/fetch-kalshi.py");
assert(/"--series"/.test(fetchPy) && /"--out"/.test(fetchPy),
  "fetch-kalshi.py accepts --series/--out");
assert(/default="KXNFLGAME"/.test(fetchPy) && /kalshi-nfl\.json/.test(fetchPy),
  "fetch-kalshi.py keeps KXNFLGAME -> data/kalshi-nfl.json as the default");

/* ---- the NCAAF snapshot file is real, timestamped snapshot data ---- */
var snap = JSON.parse(read("data/kalshi-ncaaf.json"));
assert(typeof snap.updated_at === "string" && !isNaN(Date.parse(snap.updated_at)),
  "data/kalshi-ncaaf.json carries a parseable updated_at");
var ageH = (Date.now() - Date.parse(snap.updated_at)) / 3600000;
assert(ageH >= 0 && ageH < 48,
  "data/kalshi-ncaaf.json is fresh (captured " + ageH.toFixed(1) + "h ago)");
assert(snap.series_ticker === "KXNCAAFGAME",
  "snapshot series_ticker is KXNCAAFGAME");
assert(Array.isArray(snap.games) && snap.games.length > 0,
  "snapshot has a non-empty games array (" + snap.games.length + " games)");
var bad = snap.games.filter(function(g){
  return typeof g.event_ticker !== "string" || g.event_ticker.indexOf("KXNCAAFGAME-") !== 0 ||
         !Array.isArray(g.markets) || g.markets.length !== 2 ||
         !g.markets.every(function(m){
           return m.kind === "winner" &&
                  Number.isFinite(m.yes_bid) && m.yes_bid >= 0 && m.yes_bid < 100 &&
                  Number.isFinite(m.yes_ask) && m.yes_ask > 0 && m.yes_ask <= 100 &&
                  m.yes_ask >= m.yes_bid;
         });
});
assert(bad.length === 0,
  "every game is a KXNCAAFGAME event with exactly 2 priced winner markets (sane bid/ask)");
assert(snap.games.every(function(g){
  return g.markets.every(function(m){ return m.team && m.team.length > 0; });
}), "every market carries its team name");

/* ---- the shipped abbreviation pattern handles college-length codes ---- */
var marketsJs = read("js/markets.js");
var abbrFn = marketsJs.match(/function kalshiAbbrs\(g\)\{[\s\S]*?return m \? \[m\[1\], m\[2\]\] : null;/);
assert(!!abbrFn, "markets.js ships kalshiAbbrs");
var abbrRe = null;
if(abbrFn){
  var reSrc = abbrFn[0].match(/\.match\((\/.*\/)\)/);
  assert(!!reSrc, "kalshiAbbrs matches against a regex literal");
  if(reSrc) abbrRe = eval(reSrc[1]);
}
function abbrs(sub){ var m = String(sub || "").match(abbrRe); return m ? [m[1], m[2]] : null; }
if(abbrRe){
  eq(JSON.stringify(abbrs("CAR vs CLE (Sep 27)")), '["CAR","CLE"]',
     "pro sub still parses exactly as before");
  eq(JSON.stringify(abbrs("NAVY vs AFA (Oct 3)")), '["NAVY","AFA"]',
     "4-letter college code NAVY parses");
  eq(JSON.stringify(abbrs("BRWN vs URI (Oct 3)")), '["BRWN","URI"]',
     "4-letter college code BRWN parses");
  eq(JSON.stringify(abbrs("ALA vs MSST (Oct 3)")), '["ALA","MSST"]',
     "mixed 3/4-letter college codes parse");
  eq(JSON.stringify(abbrs("PRIN vs CLMB (Oct 3)")), '["PRIN","CLMB"]',
     "4/4-letter college codes parse");
  var parsed = snap.games.filter(function(g){ return !!abbrs(g.sub_title); }).length;
  assert(parsed / snap.games.length >= 0.95,
    "the shipped pattern parses " + parsed + "/" + snap.games.length + " real snapshot subs (>= 95%)");
}

/* ---- pages wire the NCAAF tab to this file (and only there) ---- */
assert(/data\/kalshi-ncaaf\.json/.test(marketsJs),
  "js/markets.js loads data/kalshi-ncaaf.json");
assert(/data-kalshi=\\"ncaaf\\">Kalshi · NCAAF/.test(marketsJs) || /data-kalshi="ncaaf">Kalshi · NCAAF/.test(marketsJs),
  "js/markets.js renders a Kalshi · NCAAF tab button");
assert(/ncaaf:\s*\{file: "data\/kalshi-ncaaf\.json", name: "NCAAF", dirKey: "ncaaf"/.test(marketsJs),
  "KALSHI_TABS carries the ncaaf entry (dirKey ncaaf — no directory entry, honest title fallback)");
assert(/kalshiShowAll = \{[^}]*ncaaf: false/.test(marketsJs),
  "kalshiShowAll starts collapsed for ncaaf like the other tabs");
var marketsHtml = read("markets.html");
assert(/Kalshi · NCAAF/.test(marketsHtml),
  "markets.html names the Kalshi · NCAAF tab");
assert(marketsHtml.indexOf("js/markets.js?v=2.0.11") !== -1,
  "markets.html keys markets.js at v2.0.4");
/* Honest gating, updated v2.0.6: predictions.js must NOT reference the
   NCAAF snapshot — there is still no ESPN<->Kalshi college matching for
   the per-game Kalshi rows or the Kalshi-only fallback, so SNAP stays
   NFL/MLB-only. (v2.0.6 adds a predictions NCAAF tab, but it is
   Polymarket-only — the live CFB series lookup, exactly like the
   NBA/NHL/EPL tabs; the snapshot join stays deliberately unwired.)
   The odds board's no-key market line is different — it renders the
   snapshot directly (no per-game mapping), so v2.0.5 wires it there
   behind a first-page cap; the with-key per-game annotations stay
   NFL-only. */
assert(!/kalshi-ncaaf/.test(read("js/predictions.js")),
  "js/predictions.js deliberately does NOT wire the NCAAF snapshot (Kalshi join stays NFL/MLB-only)");
assert(/americanfootball_ncaaf:\s*"kalshi-ncaaf"/.test(read("js/odds.js")),
  "js/odds.js wires the NCAAF snapshot into the no-key market line (v2.0.5)");

/* ---- DOM wiring: boot markets.js, click the NCAAF tab ---- */
function escStub(s){
  return String(s == null ? "" : s).replace(/[&<>\"']/g, function(c){
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function makeEl(id){
  var handlers = {};
  var el = { id: id || "", innerHTML: "", textContent: "", value: "", style: {}, hidden: false,
    _attrs: {}, _children: [],
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    insertAdjacentHTML: function(pos, html){ if(pos === "afterbegin") this.innerHTML = String(html) + this.innerHTML; else this.innerHTML += String(html); },
    querySelector: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
    _fire: function(ev, target, extra){
      var e = { target: target || this };
      if(extra) for(var k in extra) e[k] = extra[k];
      (handlers[ev] || []).forEach(function(fn){ fn.call(this, e); }, this);
    },
    _handlers: handlers };
  return el;
}
function mkGame(i){
  return { event_ticker: "KXNCAAFGAME-26OCT03G" + i, title: "School A" + i + " vs School B" + i,
    sub_title: "SA" + i + " vs SB" + i + " (Oct 3)",
    markets: [
      { kind: "winner", team: "School A" + i, yes_bid: 60, yes_ask: 62, last: 61,
        volume: "100000", volume_24h: "50000", close_time: new Date(Date.now() + 7200e3).toISOString() },
      { kind: "winner", team: "School B" + i, yes_bid: 38, yes_ask: 40, last: 39,
        volume: "90000", volume_24h: "40000", close_time: new Date(Date.now() + 7200e3).toISOString() }
    ] };
}
function mkNcaafSnap(){
  var games = [];
  for(var i = 0; i < 13; i++) games.push(mkGame(i));
  games.push({ event_ticker: "KXNCAAFGAME-26OCT03NAVYAFA", title: "Navy vs Air Force",
    sub_title: "NAVY vs AFA (Oct 3)",
    markets: [
      { kind: "winner", team: "Navy", yes_bid: 54, yes_ask: 56, last: 55,
        volume: "200000", volume_24h: "80000", close_time: new Date(Date.now() + 3600e3).toISOString() },
      { kind: "winner", team: "Air Force", yes_bid: 44, yes_ask: 46, last: 45,
        volume: "150000", volume_24h: "60000", close_time: new Date(Date.now() + 3600e3).toISOString() }
    ] });
  return { updated_at: new Date().toISOString(), games: games };
}
function buildSandbox(seed){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  ["marketGrid", "marketNote", "marketTabs", "liveStatus", "pauseBtn", "followStrip",
   "marketQ", "marketClear", "marketCount"].forEach(getEl);
  var store = {};
  if(seed != null) store["giu-followed-teams"] = seed;
  var NCAAF = mkNcaafSnap();
  var fetchJSON = function(url){
    if(url.indexOf("gamma-api.polymarket.com/sports") !== -1)
      return Promise.resolve([{ sport: "nfl", series: 999 }]);
    if(url.indexOf("pm-events") !== -1) return Promise.resolve([]);
    if(url.indexOf("kalshi-ncaaf.json") !== -1) return Promise.resolve(NCAAF);
    if(url.indexOf("kalshi-history.json") !== -1) return Promise.resolve({});
    return Promise.reject(new Error("unexpected fetch: " + url));
  };
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    localStorage: { getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
                    setItem: function(k, v){ store[k] = String(v); } },
    document: { getElementById: getEl, hidden: false }, window: {},
    GIU: { fetchJSON: fetchJSON,
           pmEventsUrl: function(){ return "pm-events"; },
           teamDir: function(){ return Promise.resolve({}); },
           vsHeader: function(){ return ""; },
           teamFind: function(){ return null; },
           esc: escStub,
           failBox: function(m){ return '<div class="fail">' + m + "</div>"; } } };
  sandbox.window.GIU = sandbox.GIU;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(read("js/kalshi-logic.js"), sandbox, { filename: "js/kalshi-logic.js" });
  vm.runInContext(read("js/disagree-logic.js"), sandbox, { filename: "js/disagree-logic.js" });
  vm.runInContext(read("js/team-follow.js"), sandbox, { filename: "js/team-follow.js" });
  var tab0 = makeEl("tab-0"); tab0.setAttribute("data-i", "0");
  var tabC = makeEl("tab-kalshi-ncaaf"); tabC.setAttribute("data-kalshi", "ncaaf");
  getEl("marketTabs")._children = [tab0, tabC];
  vm.runInContext(read("js/markets.js"), sandbox, { filename: "js/markets.js" });
  return { sandbox: sandbox, els: els, getEl: getEl, tabC: tabC };
}
function settle(fn){ setTimeout(fn, 50); }
function kmCards(html){ return (html.match(/id="km-/g) || []).length; }

var dom = buildSandbox('["NAVY"]');
settle(function(){
  var tabs = dom.getEl("marketTabs"), grid = dom.getEl("marketGrid"),
      note = dom.getEl("marketNote"), strip = dom.getEl("followStrip"),
      q = dom.getEl("marketQ");
  assert(tabs.innerHTML.indexOf('data-kalshi="ncaaf"') !== -1 &&
         tabs.innerHTML.indexOf("Kalshi · NCAAF") !== -1,
         "tab bar ships the Kalshi · NCAAF button");
  dom.tabC._fire("click");
  settle(function(){
    eq(kmCards(grid.innerHTML), 12, "NCAAF boot: first page renders 12 cards (cap holds)");
    assert(grid.innerHTML.indexOf("Show all 14 games") !== -1,
           "NCAAF boot: toggle offers all 14 games");
    assert(note.textContent.indexOf("14 games") === 0,
           "NCAAF boot: note honestly reports all 14 games in the snapshot");
    assert(grid.innerHTML.indexOf("Navy vs Air Force") !== -1,
           "NCAAF boot: the Navy game (soonest close) leads the board");
    assert(grid.innerHTML.indexOf("★ Your team") !== -1,
           "NCAAF follows: the seeded NAVY follow marks its card (4-letter code parses)");
    assert(strip.hidden === false && strip.innerHTML.indexOf("NAVY") !== -1,
           "NCAAF follows: jump strip chips the followed Navy game");
    q.value = "navy"; q._fire("input");
    eq(kmCards(grid.innerHTML), 1, "NCAAF search: 'navy' isolates the Navy game");
    q._fire("keydown", null, { key: "Escape" });
    eq(kmCards(grid.innerHTML), 12, "NCAAF Escape: first page restored");

    console.log(failures ? ("\n" + failures + " FAILURES") : "\nALL PASS");
    process.exit(failures ? 1 : 0);
  });
});
