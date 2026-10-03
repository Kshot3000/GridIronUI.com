/* Tests for find-a-game on the odds board (v1.163.0, js/odds.js + js/odds-logic.js).
   The flagship board had sport tabs but no way to find ONE game on a
   100+ card college slate. Covers:
   - the pure search contract (searchTerms / gameSearchText /
     gameMatchesSearch: blank -> all, AND-term narrowing across team
     name + directory-resolved abbreviation, a term that appears
     nowhere matches nothing, garbage in -> no match, never a throw)
   - the market-line contract in OddsLogic (marketSearchText /
     marketMatchesSearch + the data-find stamp on marketGameCard, the
     no-key fallback board's cards)
   - DOM wiring in the shipped odds.js: typing filters the pull already
     on screen (card display toggles, strip rows follow their game,
     an emptied strip steps aside), the honest "N of M games" count,
     the named empty state, Escape / Clear restoring the full board,
     and renderGame stamping data-find from the real directory
   - shipped-file pins (odds.html hooks + cache keys + styles,
     matchup.html odds-logic key)
   Run: node tests/test-odds-search.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var OL = require(path.join(ROOT, "js/odds-logic.js"));
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

/* ---------------- market-line pure contract (OddsLogic) ---------------- */
var mkGame = { title: "Pittsburgh Steelers vs Cleveland Browns", sub: "PIT vs CLE (Oct 4)",
  teams: [{ name: "Pittsburgh Steelers", price: 42 }, { name: "Cleveland Browns", price: 58 }] };
assert(OL.marketSearchText(mkGame).indexOf("pittsburgh steelers") !== -1, "market text carries the title");
assert(OL.marketSearchText(mkGame).indexOf("cle") !== -1, "market text carries the sub abbreviations");
eq(OL.marketSearchText(null), "", "null market game -> empty text");
eq(OL.marketSearchText({}), "", "field-less market game -> empty text");
eq(OL.marketMatchesSearch(mkGame, ""), true, "blank query matches a market game");
eq(OL.marketMatchesSearch(null, ""), true, "blank query matches even garbage (the unfiltered board)");
eq(OL.marketMatchesSearch(mkGame, "browns"), true, "market team name matches");
eq(OL.marketMatchesSearch(mkGame, "pit cle"), true, "market AND terms narrow across title + sub");
eq(OL.marketMatchesSearch(mkGame, "browns chiefs"), false, "a term that appears nowhere kills the market match");
eq(OL.marketMatchesSearch(null, "browns"), false, "garbage market game + real query -> no match");
var mkCard = OL.marketGameCard(mkGame, "Oct 2 · 4:00 PM");
assert(mkCard.indexOf('data-find="pittsburgh steelers vs cleveland browns') !== -1,
  "marketGameCard stamps data-find with the searchable text");
assert(mkCard.indexOf("Pittsburgh Steelers") !== -1, "market card still renders its title");

/* ---------------- odds.js harness (real shipped file, stubbed DOM) ---- */
function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", textContent: "", style: {}, value: "", className: "",
    checked: false, hidden: false, _attrs: {}, _children: [],
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    removeAttribute: function(k){ delete this._attrs[k]; },
    hasAttribute: function(k){ return this._attrs.hasOwnProperty(k); },
    querySelectorAll: function(){ return this._children || []; },
    querySelector: function(){ return null; },
    focus: function(){},
    _fire: function(ev, arg){ var self = this; (handlers[ev] || []).forEach(function(fn){ fn.call(self, arg || { target: self }); }); }
  };
  var cls = {};
  el.classList = {
    add: function(c){ cls[c] = 1; }, remove: function(c){ delete cls[c]; },
    toggle: function(c, f){ var v = f !== undefined ? !!f : !cls[c]; if(v) cls[c] = 1; else delete cls[c]; return v; },
    contains: function(c){ return !!cls[c]; }
  };
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
 "refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount",
 "oddsQ","oddsClear","oddsCount","oddsFindEmpty","followBar","alertToasts",
 "alertThr"].forEach(getEl);

var store = { "giu_odds_key": "TESTKEY" };
var localStorageStub = {
  getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v){ store[k] = String(v); },
  removeItem: function(k){ delete store[k]; }
};
function bkFor(away, home){
  return { key: "draftkings", title: "DraftKings", markets: [
    { key: "spreads", outcomes: [{ name: away, price: 1.91, point: 3 }, { name: home, price: 1.91, point: -3 }] },
    { key: "totals", outcomes: [{ name: "Over", price: 1.91, point: 44.5 }, { name: "Under", price: 1.91, point: 44.5 }] },
    { key: "h2h", outcomes: [{ name: away, price: 2.30 }, { name: home, price: 1.65 }] } ] };
}
var KICK_ISO = new Date(Date.now() + 2 * 864e5).toISOString();
function evts(){
  return [
    { id: "ev-bears", home_team: "Chicago Bears", away_team: "Green Bay Packers",
      commence_time: KICK_ISO, bookmakers: [bkFor("Green Bay Packers", "Chicago Bears")] },
    { id: "ev-boys", home_team: "New York Giants", away_team: "Dallas Cowboys",
      commence_time: KICK_ISO, bookmakers: [bkFor("Dallas Cowboys", "New York Giants")] }
  ];
}
var oddsDeferreds = [];
var fetchStub = function(){
  var rec = {};
  rec.promise = new Promise(function(res){ rec.resolve = res; });
  oddsDeferreds.push(rec);
  return rec.promise;
};
var DIR = { nfl: [
  { abbr: "CHI", displayName: "Chicago Bears", shortDisplayName: "Bears", location: "Chicago" },
  { abbr: "GB", displayName: "Green Bay Packers", shortDisplayName: "Packers", location: "Green Bay" },
  { abbr: "DAL", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", location: "Dallas" },
  { abbr: "NYG", displayName: "New York Giants", shortDisplayName: "Giants", location: "New York" },
  { abbr: "KC", displayName: "Kansas City Chiefs", shortDisplayName: "Chiefs", location: "Kansas City" }
]};
function teamFindStub(d, league, q){
  var list = (d && d[league]) || [], ql = String(q).toLowerCase();
  for(var i = 0; i < list.length; i++)
    if(list[i].abbr === String(q).toUpperCase() || list[i].displayName.toLowerCase() === ql) return list[i];
  return null;
}
var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: { getElementById: getEl, hidden: false,
    querySelectorAll: function(){ return []; },
    querySelector: function(){ return null; },
    createElement: function(){ return makeEl("dyn"); } },
  fetch: fetchStub,
  localStorage: localStorageStub,
  window: {},
  alert: function(){},
  GIU: {
    fetchJSON: function(){ return Promise.resolve({}); },
    teamDir: function(){ return Promise.resolve(DIR); },
    teamFind: teamFindStub,
    vsHeader: function(){ return ""; },
    teamLogo: function(){ return ""; },
    teamChip: function(){ return ""; },
    esc: function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
    failBox: function(m){ return '<div class="fail">' + m + "</div>"; }
  },
  OddsSlip: {
    has: function(){ return false; }, toggle: function(){ return true; },
    reprice: function(){}, sameGame: function(){ return []; },
    payout: function(){ return { combinedAm: "+100", combined: 2.0, implied: 0.5, profit: 100, total: 200 }; },
    remove: function(){}, clear: function(){},
    normalize: function(legs){ return legs; },
    valueSummary: function(){ return null; }
  }
};
sandbox.window.GIU = sandbox.GIU;
sandbox.window.OddsSlip = sandbox.OddsSlip;
vm.createContext(sandbox);
["js/odds-logic.js", "js/odds.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
});
var G = sandbox.window.GIU;

/* ---------------- keyed-board pure contract --------------------------- */
assert(typeof G.oddsGameSearch === "function", "oddsGameSearch exported on GIU");
assert(typeof G.oddsGameText === "function", "oddsGameText exported on GIU");
assert(typeof G.oddsSearchTerms === "function", "oddsSearchTerms exported on GIU");
assert(typeof G.oddsMarketSearch === "function", "oddsMarketSearch exported on GIU");
var MS = G.oddsGameSearch, GT = G.oddsGameText;
var bearsEv = { away_team: "Green Bay Packers", home_team: "Chicago Bears" };
var chiefsEv = { away_team: "Kansas City Chiefs", home_team: "Buffalo Bills" };
eq(JSON.stringify(G.oddsSearchTerms("  Bears   CHI ")), JSON.stringify(["bears", "chi"]),
   "terms split on whitespace and lowercase");
assert(GT(bearsEv, DIR, "nfl").indexOf("chicago bears") !== -1, "game text carries the team names");
assert(GT(bearsEv, DIR, "nfl").indexOf(" chi ") !== -1 || / chi$| chi /.test(GT(bearsEv, DIR, "nfl")),
   "game text carries the directory-resolved abbreviation");
eq(GT(null, DIR, "nfl"), "", "null event -> empty game text");
eq(GT({}, DIR, "nfl"), "", "team-less event -> empty game text");
eq(MS(bearsEv, "", DIR, "nfl"), true, "blank query matches a game");
eq(MS(null, "", DIR, "nfl"), true, "blank query matches even a garbage event");
eq(MS(bearsEv, "bears", DIR, "nfl"), true, "team name matches");
eq(MS(bearsEv, "CHI", DIR, "nfl"), true, "abbreviation matches, case-insensitive");
eq(MS(chiefsEv, "kc", DIR, "nfl"), true, "'kc' finds the Chiefs via the directory");
eq(MS(bearsEv, "green chi", DIR, "nfl"), true, "AND terms narrow across both sides");
eq(MS(bearsEv, "bears cowboys", DIR, "nfl"), false, "a term from another game kills the match");
eq(MS(null, "bears", DIR, "nfl"), false, "garbage event + real query -> no match, never a throw");
eq(MS(bearsEv, "zzzz", DIR, "nfl"), false, "nonsense query matches nothing");
eq(G.oddsMarketSearch(mkGame, "browns"), true, "GIU market search delegates to OddsLogic");
eq(G.oddsMarketText(mkGame).indexOf("cleveland") !== -1, true, "GIU market text delegates to OddsLogic");

/* ---------------- DOM wiring ------------------------------------------ */
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function apiResponse(events){
  return { status: 200, ok: true, headers: { get: function(){ return "499"; } },
           json: function(){ return Promise.resolve(events); } };
}
function fakeCard(id, text){
  return { id: id, style: {}, getAttribute: function(k){ return k === "data-find" ? text : null; } };
}
(async function(){
  await wait(30);
  eq(oddsDeferreds.length, 1, "boot fires one odds API fetch");
  oddsDeferreds[0].resolve(apiResponse(evts()));
  await wait(30);
  var board = getEl("oddsBoard"), q = getEl("oddsQ"), clear = getEl("oddsClear"),
      count = getEl("oddsCount"), empty = getEl("oddsFindEmpty");
  assert(board.innerHTML.indexOf("Chicago Bears") !== -1, "board renders the Bears game");
  assert(board.innerHTML.indexOf('data-find="green bay packers') !== -1 &&
         board.innerHTML.indexOf("chicago bears") !== -1,
    "renderGame stamps data-find with both teams' searchable text");
  assert(board.innerHTML.indexOf(" chi ") !== -1 || board.innerHTML.indexOf("chi ") !== -1,
    "the data-find stamp carries the resolved CHI abbreviation");
  eq(count.textContent, "", "boot: count stays silent with no search");
  eq(clear.hidden, true, "boot: Clear stays hidden with no search");

  /* Simulate the browser DOM the rendered HTML produces: two cards, one
     strip row per game inside one strip section. */
  var cards = [fakeCard("game-ev-bears", "green bay packers gb chicago bears chi"),
               fakeCard("game-ev-boys", "dallas cowboys dal new york giants nyg")];
  var rows = [{ style: {}, getAttribute: function(k){ return k === "href" ? "#game-ev-bears" : null; } },
              { style: {}, getAttribute: function(k){ return k === "href" ? "#game-ev-boys" : null; } }];
  var section = { style: {}, querySelectorAll: function(){ return rows; } };
  board.querySelectorAll = function(sel){
    if(sel === "[data-find]") return cards;
    if(sel.indexOf("a.arb") === 0) return rows;
    return [section];
  };

  q.value = "bears"; q._fire("input");
  eq(cards[0].style.display, "", "'bears' keeps the Bears card visible");
  eq(cards[1].style.display, "none", "'bears' hides the Cowboys card");
  eq(rows[0].style.display, "", "the strip row for the visible game stays");
  eq(rows[1].style.display, "none", "the strip row for the hidden game hides with it");
  eq(section.style.display, "", "the strip stays while one of its rows is visible");
  eq(count.textContent, "1 of 2 games", "honest count while searching");
  eq(clear.hidden, false, "Clear appears while searching");
  eq(empty.hidden, true, "empty state stays hidden while a game matches");

  q.value = "zzzz"; q._fire("input");
  eq(cards[0].style.display, "none", "nonsense query hides every card");
  eq(section.style.display, "none", "a strip with no visible row steps aside");
  eq(count.textContent, "No matches", "count says No matches, never a fake number");
  eq(empty.hidden, false, "named empty state appears for a nonsense query");
  assert(empty.textContent.indexOf('"zzzz"') !== -1 && empty.textContent.indexOf("all 2 games") !== -1,
    "empty state quotes the query and names the full board size");

  q._fire("keydown", { key: "Escape", target: q });
  eq(q.value, "", "Escape clears the input");
  eq(cards[1].style.display, "", "Escape restores the hidden card");
  eq(rows[1].style.display, "", "Escape restores the strip row");
  eq(section.style.display, "", "Escape restores the strip");
  eq(count.textContent, "", "Escape silences the count");
  eq(clear.hidden, true, "Escape hides Clear");
  eq(empty.hidden, true, "Escape hides the empty state");

  q.value = "cowboys"; q._fire("input");
  eq(cards[0].style.display, "none", "'cowboys' hides the Bears card");
  clear._fire("click");
  eq(q.value, "", "Clear button empties the input");
  eq(cards[0].style.display, "", "Clear button restores the full board");

  /* shipped pins */
  var html = fs.readFileSync(path.join(ROOT, "odds.html"), "utf8");
  assert(html.indexOf('id="oddsQ"') !== -1, "odds.html ships the oddsQ input");
  assert(html.indexOf('id="oddsClear"') !== -1 && html.indexOf('id="oddsCount"') !== -1 &&
         html.indexOf('id="oddsFindEmpty"') !== -1, "odds.html ships Clear + count + empty-state hooks");
  assert(html.indexOf("js/odds.js?v=2.0.5") !== -1, "odds.html bumps odds.js to ?v=2.0.5");
  assert(html.indexOf("js/odds-logic.js?v=2.0.11") !== -1, "odds.html bumps odds-logic.js to ?v=2.0.5");
  assert(html.indexOf(".odds-find") !== -1, "odds.html carries the page-scoped finder styles");
  var matchupHtml = fs.readFileSync(path.join(ROOT, "matchup.html"), "utf8");
  assert(matchupHtml.indexOf("js/odds-logic.js?v=2.0.11") !== -1,
    "matchup.html bumps the shared odds-logic.js to ?v=2.0.5");
  var src = fs.readFileSync(path.join(ROOT, "js/odds.js"), "utf8");
  assert(src.indexOf("gameMatchesSearch") !== -1 && src.indexOf("applySearch") !== -1,
    "odds.js ships the pure matcher + the DOM filter");

  if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
  console.log("ALL ODDS-SEARCH TESTS PASS");
})().catch(function(e){ console.error("HARNESS ERROR:", e && e.stack || e); process.exit(1); });
