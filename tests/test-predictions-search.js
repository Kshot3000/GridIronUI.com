/* Tests for find-a-game on the Predictions page (v1.164.0, js/predictions.js).
   Predictions was the last game board without a finder, and the board
   silently capped at 10 games — a game outside the cap wasn't even on
   the page to find. Covers:
   - the pure search contract (searchTerms / predSearchText /
     predMatchesSearch: blank -> all, AND-term narrowing across title
     sides, directory-resolved abbreviations ("kc" finds the Chiefs),
     priced outcome names, a term that appears nowhere matches nothing,
     garbage in -> no match, never a throw)
   - DOM wiring with the real team-follow.js + seeded storage on a
     12-game board: boot keeps the 10-game cap + spotlight byte-for-byte
     in behavior, typing isolates from the FULL board (a beyond-cap game
     is findable), the spotlight steps aside while searching (its game
     joins the grid), the follow strip tracks the filtered board, the
     named empty state, honest "N of M games" count, Escape / Clear
     restoring cap + spotlight, and re-renders staying filtered —
     all without a single extra fetch (typing never re-fetches)
   - shipped-file pins (predictions.html hooks + cache key + styles)
   Run: node tests/test-predictions-search.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

var ABBR = { "kansas city chiefs": "KC", "buffalo bills": "BUF", "philadelphia eagles": "PHI",
             "chicago bears": "CHI", "detroit lions": "DET", "dallas cowboys": "DAL",
             "new york giants": "NYG", "baltimore ravens": "BAL", "cincinnati bengals": "CIN",
             "miami dolphins": "MIA", "new york jets": "NYJ", "pittsburgh steelers": "PIT",
             "cleveland browns": "CLE", "tennessee titans": "TEN", "indianapolis colts": "IND",
             "houston texans": "HOU", "jacksonville jaguars": "JAX", "green bay packers": "GB",
             "san francisco 49ers": "SF", "arizona cardinals": "ARI", "los angeles rams": "LAR",
             "denver broncos": "DEN", "las vegas raiders": "LV" };
function findStub(dir, league, q){
  var a = ABBR[String(q || "").toLowerCase()];
  return a ? { abbr: a } : null;
}

function makeEl(id){
  var handlers = {};
  return { id: id || "", innerHTML: "", textContent: "", style: {}, hidden: false, value: "",
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(){}, getAttribute: function(){ return null; },
    querySelectorAll: function(){ return []; }, querySelector: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    focus: function(){},
    _fire: function(ev, arg){ var self = this; (handlers[ev] || []).forEach(function(fn){ fn(arg || { target: self }); }); } };
}

/* ---------------- pure contract (captured via a parked load) ----------- */
function captureExports(){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl, hidden: false }, window: {},
    GIU: { fetchJSON: function(){ return new Promise(function(){}); }, /* never resolves: load() parks */
           teamDir: function(){ return Promise.resolve({}); },
           pmEventsUrl: function(){ return "x"; },
           vsHeader: function(){ return ""; },
           teamFind: findStub,
           esc: function(s){ return String(s == null ? "" : s); } } };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/predictions.js"), "utf8"), sandbox, { filename: "js/predictions.js" });
  return sandbox.GIU;
}
var G = captureExports();
assert(typeof G.predictionsMatchesSearch === "function", "predictionsMatchesSearch exported on GIU");
assert(typeof G.predictionsSearchText === "function", "predictionsSearchText exported on GIU");
assert(typeof G.predictionsSearchTerms === "function", "predictionsSearchTerms exported on GIU");
var MS = G.predictionsMatchesSearch, GT = G.predictionsSearchText, ST = G.predictionsSearchTerms;

eq(JSON.stringify(ST("  Chiefs   BILLS ")), JSON.stringify(["chiefs", "bills"]),
   "terms split on whitespace and lowercase");
eq(ST("").length, 0, "blank query -> no terms");
eq(ST(null).length, 0, "null query -> no terms");

function row(title, slug, outcomes){
  return { ev: { title: title, slug: slug, startTime: "2026-10-04T17:00:00Z" },
           mls: [{ outcomes: JSON.stringify(outcomes || title.split(/\s+vs\.?\s+/)) }] };
}
var kcRow = row("Kansas City Chiefs vs. Buffalo Bills", "nfl-chiefs-bills");
var chiRow = row("Philadelphia Eagles vs. Chicago Bears", "nfl-eagles-bears");

assert(GT(kcRow, {}, "nfl", findStub).indexOf("kansas city chiefs") !== -1, "search text carries the title");
assert(GT(kcRow, {}, "nfl", findStub).indexOf(" kc ") !== -1 || /(^|\s)kc(\s|$)/.test(GT(kcRow, {}, "nfl", findStub)),
   "search text carries the directory-resolved abbreviation");
eq(GT(null, {}, "nfl", findStub), "", "null row -> empty search text");
eq(GT({}, {}, "nfl", findStub), "", "event-less row -> empty search text");
assert(GT({ ev: { title: "Kansas City Chiefs vs. Buffalo Bills" }, mls: "junk" }, {}, "nfl", findStub).indexOf("buffalo bills") !== -1,
   "non-array mls degrades, title still searchable");

eq(MS(kcRow, "", {}, "nfl", findStub), true, "blank query matches a game");
eq(MS(null, "", {}, "nfl", findStub), true, "blank query matches even a garbage row (the unfiltered board)");
eq(MS(kcRow, "chiefs", {}, "nfl", findStub), true, "team name matches");
eq(MS(kcRow, "KC", {}, "nfl", findStub), true, "resolved abbreviation matches, case-insensitive");
eq(MS(kcRow, "buffalo", {}, "nfl", findStub), true, "the away/home other side is searchable too");
eq(MS(kcRow, "chiefs bills", {}, "nfl", findStub), true, "AND terms narrow across sides");
eq(MS(kcRow, "chiefs bears", {}, "nfl", findStub), false, "a term that appears nowhere in the game kills the match");
eq(MS(chiRow, "chiefs", {}, "nfl", findStub), false, "another game's team does not match");
eq(MS(chiRow, "bears", {}, "nfl", findStub), true, "the other game matches its own team");
eq(MS(null, "bears", {}, "nfl", findStub), false, "garbage row + real query -> no match, never a throw");
eq(MS(kcRow, "zzzz", {}, "nfl", findStub), false, "nonsense query matches nothing");
eq(MS(kcRow, "chiefs", {}, "nfl", function(){ throw new Error("boom"); }), true,
   "a throwing teamFind degrades to title text, never a crash");
eq(MS(row("Team A vs. Team B", "x", ["Team A", "Draw", "Team B"]), "draw", {}, "epl", findStub), true,
   "priced outcome names are searchable (3-way draw)");

/* ---------------- DOM wiring (real team-follow.js + seeded storage) --- */
var H = 3600 * 1000, NOW = Date.now();
function pmEvent(title, startIso, slug){
  var parts = title.split(/\s+vs\.?\s+/);
  return { title: title, slug: slug, startTime: startIso,
    markets: [{ sportsMarketType: "moneyline", closed: false, active: true,
      outcomes: JSON.stringify(parts), outcomePrices: JSON.stringify(["0.60", "0.40"]),
      question: "Will " + parts[0] + " win?", oneWeekPriceChange: "0.02" }] };
}
var EVENTS = [
  pmEvent("Kansas City Chiefs vs. Buffalo Bills",   new Date(NOW + 3 * H).toISOString(),   "g01-chiefs-bills"),
  pmEvent("Philadelphia Eagles vs. Chicago Bears",  new Date(NOW + 10 * H).toISOString(),  "g02-eagles-bears"),
  pmEvent("Dallas Cowboys vs. New York Giants",     new Date(NOW + 20 * H).toISOString(),  "g03-cowboys-giants"),
  pmEvent("Chicago Bears vs. Detroit Lions",        new Date(NOW + 30 * H).toISOString(),  "g04-bears-lions"),
  pmEvent("Baltimore Ravens vs. Cincinnati Bengals", new Date(NOW + 40 * H).toISOString(), "g05-ravens-bengals"),
  pmEvent("Miami Dolphins vs. New York Jets",       new Date(NOW + 50 * H).toISOString(),  "g06-dolphins-jets"),
  pmEvent("Pittsburgh Steelers vs. Cleveland Browns", new Date(NOW + 60 * H).toISOString(),"g07-steelers-browns"),
  pmEvent("Tennessee Titans vs. Indianapolis Colts", new Date(NOW + 70 * H).toISOString(), "g08-titans-colts"),
  pmEvent("Houston Texans vs. Jacksonville Jaguars", new Date(NOW + 80 * H).toISOString(), "g09-texans-jaguars"),
  pmEvent("Green Bay Packers vs. San Francisco 49ers", new Date(NOW + 90 * H).toISOString(),"g10-packers-49ers"),
  pmEvent("Arizona Cardinals vs. Los Angeles Rams", new Date(NOW + 100 * H).toISOString(), "g11-cardinals-rams"),
  pmEvent("Denver Broncos vs. Las Vegas Raiders",   new Date(NOW + 110 * H).toISOString(), "g12-broncos-raiders")
];
function boot(storageSeed){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  var tabs = ["nfl", "nba", "mlb", "nhl", "epl"].map(function(k){
    var t = makeEl("tab-" + k);
    t.getAttribute = function(a){ return a === "data-k" ? k : null; };
    return t;
  });
  getEl("predTabs").querySelectorAll = function(){ return tabs; };
  var store = {};
  Object.keys(storageSeed || {}).forEach(function(k){ store[k] = storageSeed[k]; });
  var fetchCount = 0;
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    localStorage: { getItem: function(k){ return k in store ? store[k] : null; },
                    setItem: function(k, v){ store[k] = String(v); },
                    removeItem: function(k){ delete store[k]; } },
    document: { hidden: false, getElementById: getEl,
      querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
      createElement: function(t){ return makeEl(t); } },
    window: {},
    GIU: { fetchJSON: function(url){
             fetchCount++;
             if(url.indexOf("/sports") !== -1) return Promise.resolve([{ sport: "nfl", series: "SID1" }]);
             if(url.indexOf("series_id=SID1") !== -1) return Promise.resolve(EVENTS);
             if(url.indexOf("kalshi") !== -1) return Promise.reject(new Error("no snapshot in test"));
             return Promise.reject(new Error("unexpected url " + url));
           },
           pmEventsUrl: function(sid){ return "https://gamma-api.polymarket.com/events?series_id=" + sid; },
           teamDir: function(){ return Promise.resolve({}); },
           teamFind: findStub,
           vsHeader: function(){ return ""; },
           esc: function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
           failBox: function(msg){ return '<div class="fail">' + msg + "</div>"; } } };
  sandbox.window.GIU = sandbox.GIU;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  ["js/team-follow.js", "js/home-strip.js", "js/predictions.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  });
  return { els: els, sandbox: sandbox, fetches: function(){ return fetchCount; } };
}
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function gridCards(html){ return (html.match(/class="card/g) || []).length; }

(async function(){
  var b = boot({ "giu-followed-teams": '["CHI"]' });
  await wait(40);
  var grid = b.els["predGrid"], spot = b.els["predSpot"], q = b.els["predQ"],
      clear = b.els["predClear"], count = b.els["predCount"], strip = b.els["followStrip"];
  eq(gridCards(grid.innerHTML), 9, "boot: grid holds cap-minus-spotlight (9 of the 10-game cap)");
  assert(spot.innerHTML.indexOf('id="pg-g01-chiefs-bills"') !== -1, "boot: the next game is the spotlight");
  assert(grid.innerHTML.indexOf("g12-broncos-raiders") === -1 && grid.innerHTML.indexOf("g11-cardinals-rams") === -1,
    "boot: games beyond the 10-game cap are not rendered (the old silent cap)");
  eq(count.textContent, "", "boot: count stays silent with no search");
  eq(clear.hidden, true, "boot: Clear stays hidden with no search");
  eq(strip.hidden, false, "boot: follow strip shows the followed Bears games");
  var bootFetches = b.fetches();

  q.value = "raiders"; q._fire("input");
  eq(gridCards(grid.innerHTML), 1, "'raiders' finds the beyond-cap game (cap lifts while searching)");
  assert(grid.innerHTML.indexOf('id="pg-g12-broncos-raiders"') !== -1, "the isolated card is the Raiders game");
  eq(spot.innerHTML, "", "spotlight steps aside while searching");
  eq(count.textContent, "1 of 12 games", "honest count names the FULL board, not the capped 10");
  eq(clear.hidden, false, "Clear appears while searching");
  eq(strip.hidden, true, "strip hides: no followed team in the filtered view");
  eq(b.fetches(), bootFetches, "typing never re-fetches");

  q.value = "chiefs bills"; q._fire("input");
  eq(gridCards(grid.innerHTML), 1, "'chiefs bills' narrows across sides to the spotlight game");
  assert(grid.innerHTML.indexOf('id="pg-g01-chiefs-bills"') !== -1, "the ex-spotlight game renders in the grid while searching");

  q.value = "kc"; q._fire("input");
  eq(gridCards(grid.innerHTML), 1, "'kc' isolates via the directory-resolved abbreviation");

  q.value = "bears"; q._fire("input");
  eq(gridCards(grid.innerHTML), 2, "'bears' isolates both Bears games");
  eq(count.textContent, "2 of 12 games", "count tracks the filtered board");
  eq(strip.hidden, false, "strip returns: the followed game is in the filtered view");
  q._fire("input"); /* a second render with the same query (the refresh path) */
  eq(gridCards(grid.innerHTML), 2, "re-render under an active search stays filtered");

  q.value = "zzzz"; q._fire("input");
  eq(gridCards(grid.innerHTML), 0, "nonsense query renders no cards");
  assert(grid.innerHTML.indexOf('No games match &quot;zzzz&quot;') !== -1, "named empty state quotes the query");
  assert(grid.innerHTML.indexOf("see all 12 games") !== -1, "empty state names the full board size");
  eq(count.textContent, "No matches", "count says No matches, never a fake number");

  q._fire("keydown", { key: "Escape", target: q });
  eq(q.value, "", "Escape clears the input");
  eq(gridCards(grid.innerHTML), 9, "Escape restores the capped grid");
  assert(spot.innerHTML.indexOf('id="pg-g01-chiefs-bills"') !== -1, "Escape restores the spotlight");
  eq(count.textContent, "", "Escape silences the count");
  eq(clear.hidden, true, "Escape hides Clear");
  eq(strip.hidden, false, "Escape restores the follow strip");

  q.value = "cowboys"; q._fire("input");
  eq(gridCards(grid.innerHTML), 1, "'cowboys' isolates the Cowboys game");
  clear._fire("click");
  eq(q.value, "", "Clear button empties the input");
  eq(gridCards(grid.innerHTML), 9, "Clear button restores the capped grid");
  assert(spot.innerHTML.indexOf('id="pg-g01-chiefs-bills"') !== -1, "Clear restores the spotlight");

  /* shipped pins */
  var html = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
  assert(html.indexOf('id="predQ"') !== -1, "predictions.html ships the predQ input");
  assert(html.indexOf('id="predClear"') !== -1 && html.indexOf('id="predCount"') !== -1,
    "predictions.html ships the Clear button + count live region");
  assert(html.indexOf("js/predictions.js?v=2.0.6") !== -1, "predictions.html bumps predictions.js to ?v=2.0.6");
  assert(html.indexOf(".pred-find") !== -1, "predictions.html carries the page-scoped finder styles");
  var src = fs.readFileSync(path.join(ROOT, "js/predictions.js"), "utf8");
  assert(src.indexOf("predMatchesSearch") !== -1 && src.indexOf("paintBoard") !== -1 && src.indexOf("lastBoard") !== -1,
    "predictions.js ships the pure matcher + cached-board painter");

  if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
  console.log("ALL PREDICTIONS-SEARCH TESTS PASS");
})().catch(function(e){ console.error("HARNESS ERROR:", e); process.exit(1); });
