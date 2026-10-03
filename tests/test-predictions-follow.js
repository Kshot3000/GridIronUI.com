/* Tests for followed teams on the Predictions page (v1.150.0, js/predictions.js).
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") already mark the scores board (v1.149.0); they now
   mark Predictions too: followed-team games get a gold rail + "★ Your team"
   tag, every card gains a #pg-<slug> anchor, and a "Your teams" strip of
   jump chips opens the board — including a chip for a followed game that
   IS the "Next game" spotlight (its anchor lives on the spotlight card,
   not in the grid). Covers:
   - the pure followedPredictions contract (both title sides resolved via
     the injected teamFind, normalization, first-followed wins, rowKey
     sanitization, garbage in -> [])
   - DOM wiring with the REAL team-follow.js + a seeded localStorage:
     strip chips anchor to the right cards (spotlight + grid), quiet
     boards stay quiet, corrupt storage degrades to a clean board
   - shipped-file pins (predictions.html wiring + cache keys + styles)
   Run: node tests/test-predictions-follow.js */
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
             "kansas city chiefs": "KC", "buffalo bills": "BUF" };
function findStub(dir, league, q){
  var a = ABBR[String(q || "").toLowerCase()];
  return a ? { abbr: a } : null;
}

/* ---------------- pure followedPredictions (captured export) ----------- */
function makeEl(id){
  var handlers = {};
  return { id: id || "", innerHTML: "", textContent: "", style: {}, hidden: false,
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(){}, getAttribute: function(){ return null; },
    querySelectorAll: function(){ return []; }, querySelector: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} } };
}
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
var FP = G.predictionsFollowed, RK = G.predictionsRowKey;
assert(typeof FP === "function", "predictionsFollowed exported on GIU");
assert(typeof RK === "function", "predictionsRowKey exported on GIU");

function row(title, slug){
  return { ev: { title: title, slug: slug, startTime: "2026-10-04T17:00:00Z" }, mls: [{}] };
}
var rows = [ row("Philadelphia Eagles vs. Chicago Bears", "nfl-eagles-bears"),
             row("Kansas City Chiefs vs. Buffalo Bills", "nfl-chiefs-bills"),
             row("Chicago Bears vs. Detroit Lions", "nfl-bears-lions") ];

var m = FP(rows, ["CHI"], {}, "nfl", findStub);
eq(m.length, 2, "followed CHI matches its away game and its home game");
eq(m[0].key, "nfl-eagles-bears", "first match key is the event slug");
eq(m[0].abbr, "CHI", "match stamps the followed abbreviation");
eq(m[0].abbrA, "PHI", "match carries side A abbreviation");
eq(m[0].abbrB, "CHI", "match carries side B abbreviation");
eq(m[0].aName, "Philadelphia Eagles", "match carries side A name");
eq(m[1].key, "nfl-bears-lions", "second match is the CHI home game");
eq(FP(rows, ["det"], {}, "nfl", findStub)[0].abbr, "DET", "lowercase follow entries are normalized");
eq(FP(rows, ["DET", "CHI"], {}, "nfl", findStub).filter(function(x){ return x.key === "nfl-bears-lions"; })[0].abbr, "DET",
   "both sides followed: the earlier follow-list entry wins");
eq(FP(rows, [], {}, "nfl", findStub).length, 0, "no follows -> no matches");
eq(FP(rows, ["SEA"], {}, "nfl", findStub).length, 0, "unresolvable followed abbr -> no matches");
eq(FP(rows, ["NYJ"], {}, "nfl", findStub).length, 0, "followed team not on the board -> no matches");
eq(FP(null, ["CHI"], {}, "nfl", findStub).length, 0, "null rows -> []");
eq(FP(rows, null, {}, "nfl", findStub).length, 0, "null follows -> []");
eq(FP(rows, ["CHI"], {}, "nfl", null).length, 0, "missing teamFind -> [] (never a guess)");
eq(FP("junk", ["CHI"], {}, "nfl", findStub).length, 0, "non-array rows -> []");
eq(FP([{ ev: { title: "No Versus Here", slug: "x" } }, { ev: {} }, null,
       row("Chicago Bears vs. Detroit Lions", "ok-slug")], ["CHI"], {}, "nfl", findStub).length, 1,
   "malformed rows are skipped, the real one still matches");
eq(FP(rows, ["CHI", 42, "", "toolongname", "CHI"], {}, "nfl", findStub).length, 2,
   "non-string / implausible / duplicate follow entries are dropped");
eq(FP(rows, ["CHI"], {}, "nfl", function(){ throw new Error("boom"); }).length, 0,
   "a throwing teamFind degrades to no matches, never a crash");
var oneSide = FP([row("Chicago Bears vs. Mystery Team", "mystery")], ["CHI"], {}, "nfl", findStub);
eq(oneSide.length, 1, "one resolvable side is enough to match");
eq(oneSide[0].abbrB, "", "the unresolvable side carries an empty abbreviation");

eq(RK(row("Anything", "NFL Eagles Bears!"), 0), "nfl-eagles-bears", "rowKey sanitizes a hostile slug");
eq(RK({ ev: { title: "Chicago Bears vs. Detroit Lions" } }, 0), "chicago-bears-vs-detroit-lions",
   "rowKey falls back to a slugified title when slug/id are missing");
eq(RK({ ev: {} }, 3), "game-3", "rowKey falls back to a positional key as a last resort");
eq(RK(null, 0), "game-0", "rowKey survives a null row");

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
  pmEvent("Kansas City Chiefs vs. Buffalo Bills", new Date(NOW + 50 * H).toISOString(), "nfl-chiefs-bills"),
  pmEvent("Philadelphia Eagles vs. Chicago Bears", new Date(NOW + 3 * H).toISOString(), "nfl-eagles-bears"),
  pmEvent("Chicago Bears vs. Detroit Lions", new Date(NOW + 30 * H).toISOString(), "nfl-bears-lions")
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
  return { els: els, sandbox: sandbox };
}
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

(async function(){
  /* followed CHI: the nearest game (PHI @ CHI) is the spotlight AND followed;
     CHI vs DET sits in the grid, also followed; KC vs BUF is untouched */
  var b1 = boot({ "giu-followed-teams": '["CHI"]' });
  await wait(40);
  var strip = b1.els["followStrip"], spot = b1.els["predSpot"], grid = b1.els["predGrid"];
  assert(strip && strip.hidden === false, "strip is shown when a followed team is on the tab");
  assert(strip.innerHTML.indexOf("Your teams") !== -1, "strip carries the 'Your teams' label");
  assert(strip.innerHTML.indexOf('href="#pg-nfl-eagles-bears"') !== -1, "strip chips link to the spotlight game");
  assert(strip.innerHTML.indexOf('href="#pg-nfl-bears-lions"') !== -1, "strip chips link to the followed grid game");
  assert(strip.innerHTML.indexOf("PHI vs CHI") !== -1 && strip.innerHTML.indexOf("CHI vs DET") !== -1,
    "chips name both matchups by abbreviation");
  assert(spot.innerHTML.indexOf('id="pg-nfl-eagles-bears"') !== -1 && spot.innerHTML.indexOf("card followed") !== -1,
    "the followed spotlight card carries the anchor id + followed class");
  assert(spot.innerHTML.indexOf("★ Your team") !== -1, "spotlight card carries the ★ Your team tag");
  assert(grid.innerHTML.indexOf('class="card followed" id="pg-nfl-bears-lions"') !== -1,
    "followed grid card gets the followed class + anchor id");
  assert(grid.innerHTML.indexOf('id="pg-nfl-chiefs-bills"') !== -1 &&
         grid.innerHTML.indexOf('class="card followed" id="pg-nfl-chiefs-bills"') === -1,
    "unfollowed card gets an anchor id but no followed mark");
  eq(((spot.innerHTML + grid.innerHTML).match(/★ Your team/g) || []).length, 2,
    "exactly the two CHI games are tagged");

  /* no follows stored: the page is exactly the old page */
  var b2 = boot({});
  await wait(40);
  assert(b2.els["followStrip"].hidden === true && b2.els["followStrip"].innerHTML === "",
    "no follows -> strip hidden and empty");
  assert((b2.els["predSpot"].innerHTML + b2.els["predGrid"].innerHTML).indexOf("Your team") === -1,
    "no follows -> no followed marks anywhere");

  /* followed team not on this tab: quiet */
  var b3 = boot({ "giu-followed-teams": '["SEA"]' });
  await wait(40);
  assert(b3.els["followStrip"].hidden === true, "followed team absent -> no strip");
  assert(b3.els["predGrid"].innerHTML.indexOf("Market-implied") !== -1, "board still renders");

  /* corrupt storage: team-follow recovers to [], board renders clean */
  var b4 = boot({ "giu-followed-teams": "{corrupt" });
  await wait(40);
  assert(b4.els["predGrid"].innerHTML.indexOf("pg-nfl-bears-lions") !== -1,
    "corrupt follow storage still renders the board");
  assert(b4.els["followStrip"].hidden === true, "corrupt follow storage -> no strip");

  /* shipped pins */
  var html = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
  assert(html.indexOf('id="followStrip"') !== -1, "predictions.html ships the followStrip container");
  assert(html.indexOf("js/team-follow.js?v=1.142.0") !== -1, "predictions.html loads team-follow.js (content unchanged since v1.142.0)");
  assert(html.indexOf('src="js/team-follow.js') < html.indexOf('src="js/predictions.js'), "team-follow.js script loads before predictions.js");
  assert(html.indexOf("js/predictions.js?v=2.0.6") !== -1, "predictions.html bumps predictions.js to ?v=2.0.6");
  assert(html.indexOf(".card.followed") !== -1 && html.indexOf(".follow-chip-link") !== -1 &&
         html.indexOf(".card:target") !== -1, "predictions.html carries the page-scoped followed styles");
  var src = fs.readFileSync(path.join(ROOT, "js/predictions.js"), "utf8");
  assert(src.indexOf("renderFollowStrip") !== -1 && src.indexOf("followedPredictions") !== -1,
    "predictions.js ships the strip renderer + pure matcher");

  if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
  console.log("ALL PREDICTIONS-FOLLOW TESTS PASS");
})().catch(function(e){ console.error("HARNESS ERROR:", e); process.exit(1); });
