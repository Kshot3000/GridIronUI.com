/* Tests for find-a-game on the Markets page (v1.162.0, js/markets.js).
   Every other game board had a finder; this page was the last one where
   finding ONE game meant scrolling — the Kalshi tabs list 30 NFL games
   (12 on the first page) and the Polymarket tabs cap at the 10 soonest
   games, so a game outside the cap wasn't even on the page. Covers:
   - the pure search contract (AND terms over title + priced outcomes +
     directory-resolved abbreviations on Polymarket games; title + sub
     abbreviations + team names on Kalshi games; blank -> all,
     garbage-in -> no match on a real query, never everything)
   - DOM wiring on the Polymarket tab (stubbed gamma feed, 12 games):
     boot cap of 10 with an honest "12 games" note, search isolating a
     game beyond the cap, abbreviation search, honest N-of-M count,
     named empty state, Escape/Clear round-trips, and the "Your teams"
     strip tracking the filtered board (real team-follow.js)
   - DOM wiring on the Kalshi tab (14-game snapshot): first page of 12
     + toggle, search reaching the game behind "Show all", the toggle
     stepping aside while searching, strip tracking, Escape restore
   - shipped-file pins (markets.html finder hooks + styles + cache key)
   Run: node tests/test-markets-search.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

var ABBR = { "philadelphia eagles": "PHI", "chicago bears": "CHI", "detroit lions": "DET",
             "kansas city chiefs": "KC", "buffalo bills": "BUF", "washington commanders": "WSH" };
function findStub(dir, league, q){
  var a = ABBR[String(q || "").toLowerCase()];
  return a ? { abbr: a } : null;
}
function escStub(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
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

/* ---------------- fixtures ---------------- */
function pmEvent(title, slug, days){
  var sides = title.split(/\s+vs\.?\s+/);
  return { title: title, slug: slug,
    startTime: new Date(Date.now() + days * 864e5).toISOString(),
    markets: [{ sportsMarketType: "moneyline", active: true, closed: false,
      question: "Will " + sides[0] + " win?",
      outcomes: JSON.stringify(sides), outcomePrices: '["0.55","0.45"]', volume: 5000 }] };
}
var PM_TITLES = [
  "Philadelphia Eagles vs. Detroit Lions",
  "Chicago Bears vs. Detroit Lions",
  "Detroit Lions vs. Washington Commanders",
  "Philadelphia Eagles vs. Washington Commanders",
  "Chicago Bears vs. Philadelphia Eagles",
  "Washington Commanders vs. Detroit Lions",
  "Detroit Lions vs. Philadelphia Eagles",
  "Washington Commanders vs. Chicago Bears",
  "Philadelphia Eagles vs. Detroit Lions",
  "Washington Commanders vs. Philadelphia Eagles",
  "Detroit Lions vs. Washington Commanders",
  "Kansas City Chiefs vs. Buffalo Bills" /* game 12: beyond the 10-game cap */
];
var PM_EVENTS = PM_TITLES.map(function(t, i){ return pmEvent(t, "nfl-g" + (i + 1), i + 1); });

function mkKalshiGame(i){
  return { event_ticker: "KXNFLGAME-26OCT04G" + i, title: "Team A" + i + " vs Team B" + i,
    sub_title: "A" + i + " vs B" + i + " (Oct 4)",
    markets: [
      { kind: "winner", team: "Team A" + i, yes_bid: 60, yes_ask: 62, last: 61,
        volume: "1000000", volume_24h: "500000", close_time: new Date(Date.now() + 7200e3).toISOString() },
      { kind: "winner", team: "Team B" + i, yes_bid: 38, yes_ask: 40, last: 39,
        volume: "900000", volume_24h: "400000", close_time: new Date(Date.now() + 7200e3).toISOString() }
    ] };
}
function mkSnap(){
  var games = [];
  for(var i = 0; i < 13; i++) games.push(mkKalshiGame(i));
  games.push({ event_ticker: "KXNFLGAME-26OCT04KCBUF", title: "Kansas City vs Buffalo",
    sub_title: "KC vs BUF (Oct 4)",
    markets: [
      { kind: "winner", team: "Kansas City", yes_bid: 60, yes_ask: 62, last: 61,
        volume: "1000000", volume_24h: "500000", close_time: new Date(Date.now() + 7200e3).toISOString() },
      { kind: "winner", team: "Buffalo", yes_bid: 38, yes_ask: 40, last: 39,
        volume: "900000", volume_24h: "400000", close_time: new Date(Date.now() + 7200e3).toISOString() }
    ] });
  return { updated_at: new Date().toISOString(), games: games };
}
var SNAP = mkSnap();

function buildSandbox(seed){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  ["marketGrid", "marketNote", "marketTabs", "liveStatus", "pauseBtn", "followStrip",
   "marketQ", "marketClear", "marketCount"].forEach(getEl);
  var store = {};
  if(seed != null) store["giu-followed-teams"] = seed;
  var fetchJSON = function(url){
    if(url.indexOf("gamma-api.polymarket.com/sports") !== -1)
      return Promise.resolve([{ sport: "nfl", series: 999 }]);
    if(url.indexOf("pm-events") !== -1) return Promise.resolve(PM_EVENTS);
    if(url.indexOf("kalshi-nfl.json") !== -1) return Promise.resolve(SNAP);
    if(url.indexOf("kalshi-history.json") !== -1) return Promise.resolve({});
    if(url.indexOf("kalshi-mlb.json") !== -1) return Promise.reject(new Error("no mlb snap in fixture"));
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
           teamFind: findStub,
           esc: escStub,
           failBox: function(m){ return '<div class="fail">' + m + "</div>"; } } };
  sandbox.window.GIU = sandbox.GIU;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/kalshi-logic.js"), "utf8"), sandbox, { filename: "js/kalshi-logic.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/disagree-logic.js"), "utf8"), sandbox, { filename: "js/disagree-logic.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-follow.js"), "utf8"), sandbox, { filename: "js/team-follow.js" });
  var tab0 = makeEl("tab-0"); tab0.setAttribute("data-i", "0");
  var tabK = makeEl("tab-kalshi"); tabK.setAttribute("data-kalshi", "nfl");
  getEl("marketTabs")._children = [tab0, tabK];
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8"), sandbox, { filename: "js/markets.js" });
  return { sandbox: sandbox, els: els, getEl: getEl, tabK: tabK, tab0: tab0 };
}
function parkedFetch(){ return new Promise(function(){}); }
function settle(fn){ setTimeout(fn, 50); }
function pmCards(html){ return (html.match(/id="pm-/g) || []).length; }
function kmCards(html){ return (html.match(/id="km-/g) || []).length; }

/* ---------------- pure contract ---------------- */
var cap = buildSandbox(null);
/* boot with a parked fetch never resolves; exports are already attached */
var G = cap.sandbox.window.GIU;
var ST = G.marketsSearchTerms, PT = G.marketsPmSearchText, KT = G.marketsKalshiSearchText,
    PM = G.marketsPmMatchesSearch, KM = G.marketsKalshiMatchesSearch;
assert(typeof ST === "function" && typeof PT === "function" && typeof KT === "function" &&
       typeof PM === "function" && typeof KM === "function", "search helpers exported on GIU");
eq(ST("  Chiefs   BILLS ").join(","), "chiefs,bills", "searchTerms splits + lowercases");
eq(ST(null).length + ST("").length + ST("   ").length, 0, "searchTerms: blank/null -> no terms");

var chiefsPM = { ev: { title: "Kansas City Chiefs vs. Buffalo Bills", slug: "x" },
  mls: [{ outcomes: '["Kansas City Chiefs","Buffalo Bills"]' }], spread: null, total: null };
assert(PM(chiefsPM, "chiefs") === true, "PM: team name matches");
assert(PM(chiefsPM, "chiefs bills") === true, "PM: AND terms across both title sides");
assert(PM(chiefsPM, "chiefs eagles") === false, "PM: a term nowhere in the game matches nothing");
assert(PM(chiefsPM, "kc", {}, "nfl", findStub) === true, "PM: directory-resolved abbreviation matches");
assert(PM(chiefsPM, "kc") === false, "PM: without a directory the abbreviation is not guessed");
assert(PM(chiefsPM, "") === true && PM(null, "") === true, "PM: blank query matches everything");
assert(PM(null, "chiefs") === false && PM({}, "chiefs") === false && PM({ ev: null }, "x") === false,
       "PM: garbage game + real query -> no match, never a throw");
assert(PT(null) === "" && PT({}) === "", "PM: garbage in -> empty search text");

var chiefsK = { title: "Kansas City vs Buffalo", sub: "KC vs BUF (Oct 4)",
  teams: [{ name: "Kansas City" }, { name: "Buffalo" }] };
assert(KM(chiefsK, "kc") === true, "Kalshi: sub abbreviation matches");
assert(KM(chiefsK, "kansas buffalo") === true, "Kalshi: AND terms across title sides");
assert(KM(chiefsK, "kansas denver") === false, "Kalshi: absent term matches nothing");
assert(KM(chiefsK, "") === true && KM(null, "") === true, "Kalshi: blank query matches everything");
assert(KM(null, "kc") === false && KM({}, "kc") === false, "Kalshi: garbage game + real query -> no match");
assert(KT(null) === "" && KT({}) === "", "Kalshi: garbage in -> empty search text");

/* ---------------- DOM: Polymarket tab ---------------- */
var pm = buildSandbox('["CHI"]');
settle(function(){
  var grid = pm.getEl("marketGrid"), note = pm.getEl("marketNote"),
      q = pm.getEl("marketQ"), cnt = pm.getEl("marketCount"), clr = pm.getEl("marketClear"),
      strip = pm.getEl("followStrip");
  eq(pmCards(grid.innerHTML), 10, "PM boot: 10-game cap renders 10 cards");
  assert(note.textContent.indexOf("12 games") === 0, "PM boot: note honestly reports all 12 games");
  eq(cnt.textContent, "", "PM boot: no count narrated without a search");
  assert(clr.hidden === true, "PM boot: Clear hidden without a search");
  assert(strip.hidden === false && (strip.innerHTML.match(/follow-chip-link/g) || []).length === 3,
         "PM boot: follow strip chips all three Bears games");

  q.value = "chiefs"; q._fire("input");
  eq(pmCards(grid.innerHTML), 1, "PM search: 'chiefs' isolates the game beyond the cap");
  assert(grid.innerHTML.indexOf("Kansas City Chiefs") !== -1, "PM search: the Chiefs card is the one shown");
  eq(cnt.textContent, "1 of 12 games", "PM search: honest count");
  assert(clr.hidden === false, "PM search: Clear appears");
  assert(strip.hidden === true, "PM search: follow strip hides when its games are filtered out");

  q.value = "kc"; q._fire("input");
  eq(pmCards(grid.innerHTML), 1, "PM search: 'kc' finds the Chiefs game by abbreviation");

  q.value = "chiefs eagles"; q._fire("input");
  eq(pmCards(grid.innerHTML), 0, "PM search: impossible AND query shows no cards");
  assert(grid.innerHTML.indexOf('No markets match &quot;chiefs eagles&quot;') !== -1,
         "PM search: named empty state, never a blank grid");
  eq(cnt.textContent, "No matches", "PM search: count narrates no matches");

  q._fire("keydown", null, { key: "Escape" });
  eq(pmCards(grid.innerHTML), 10, "PM Escape: full capped board restored");
  eq(q.value, "", "PM Escape: input cleared");
  eq(cnt.textContent, "", "PM Escape: count cleared");
  assert(strip.hidden === false, "PM Escape: follow strip restored");

  q.value = "lions"; q._fire("input");
  eq(pmCards(grid.innerHTML), 7, "PM search: 'lions' renders all 7 matches (cap lifted)");
  eq(cnt.textContent, "7 of 12 games", "PM search: count tracks matches");
  clr._fire("click");
  eq(pmCards(grid.innerHTML), 10, "PM Clear: full capped board restored");
  eq(cnt.textContent, "", "PM Clear: count cleared");

  /* ---------------- DOM: Kalshi tab (same sandbox, tab switch) ---------- */
  pm.tabK._fire("click");
  settle(function(){
    eq(kmCards(grid.innerHTML), 12, "Kalshi boot: first page renders 12 cards");
    assert(grid.innerHTML.indexOf("Show all 14 games") !== -1, "Kalshi boot: toggle offers all 14");
    eq(cnt.textContent, "", "Kalshi boot: search count stays quiet (query was cleared)");

    q.value = "kc"; q._fire("input");
    eq(kmCards(grid.innerHTML), 1, "Kalshi search: 'kc' reaches the game behind Show all");
    assert(grid.innerHTML.indexOf("Kansas City") !== -1, "Kalshi search: the Chiefs card is shown");
    eq(cnt.textContent, "1 of 14 games", "Kalshi search: honest count over the whole snapshot");
    assert(grid.innerHTML.indexOf("kalshiShowAll") === -1, "Kalshi search: Show-all toggle steps aside");

    q.value = "kansas buffalo"; q._fire("input");
    eq(kmCards(grid.innerHTML), 1, "Kalshi search: AND terms across the title match once");

    q.value = "zzzz"; q._fire("input");
    eq(kmCards(grid.innerHTML), 0, "Kalshi search: nonsense query shows no cards");
    assert(grid.innerHTML.indexOf('No markets match &quot;zzzz&quot;') !== -1,
           "Kalshi search: named empty state");
    eq(cnt.textContent, "No matches", "Kalshi search: count narrates no matches");

    q._fire("keydown", null, { key: "Escape" });
    eq(kmCards(grid.innerHTML), 12, "Kalshi Escape: first page restored");
    assert(grid.innerHTML.indexOf("Show all 14 games") !== -1, "Kalshi Escape: toggle restored");

    /* -------- Kalshi follow strip tracks the filtered board -------- */
    var k2 = buildSandbox('["KC"]');
    k2.tabK._fire("click");
    settle(function(){
      var strip2 = k2.getEl("followStrip"), q2 = k2.getEl("marketQ"), grid2 = k2.getEl("marketGrid");
      assert(strip2.hidden === false && strip2.innerHTML.indexOf("KC") !== -1,
             "Kalshi follows: strip chips the followed Chiefs game on boot");
      q2.value = "team"; q2._fire("input");
      eq(kmCards(grid2.innerHTML), 13, "Kalshi search: 'team' matches the 13 generic games");
      assert(strip2.hidden === true, "Kalshi follows: strip hides when the followed game is filtered out");
      q2.value = ""; q2._fire("input");
      assert(strip2.hidden === false, "Kalshi follows: clearing the search restores the strip");

      /* ---------------- shipped pins ---------------- */
      var html = fs.readFileSync(path.join(ROOT, "markets.html"), "utf8");
      var src = fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8");
      assert(html.indexOf('id="marketQ"') !== -1, "markets.html ships the finder input");
      assert(html.indexOf('id="marketClear"') !== -1 && html.indexOf('id="marketCount"') !== -1,
             "markets.html ships Clear + count hooks");
      assert(html.indexOf(".market-find{") !== -1, "markets.html ships page-scoped finder styles");
      assert(html.indexOf("js/markets.js?v=2.0.4") !== -1, "markets.html keys markets.js at v2.0.4");
      assert(src.indexOf("marketsPmMatchesSearch") !== -1 && src.indexOf("function renderPM") !== -1 &&
             src.indexOf("function renderKalshi") !== -1, "markets.js ships the search core + render split");

      console.log(failures ? ("\n" + failures + " FAILURES") : "\nALL PASS");
      process.exit(failures ? 1 : 0);
    });
  });
});
