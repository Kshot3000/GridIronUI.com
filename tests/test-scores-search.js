/* Tests for find-a-game on the scores board (v1.161.0, js/scores.js).
   The board had league tabs + day nav but no way to find ONE game on a
   50–100+ card college slate. Covers:
   - the pure search contract (searchTerms / gameSearchText /
     gameMatchesSearch: blank -> all, AND-term narrowing across team
     name / abbreviation / venue, a term that appears nowhere matches
     nothing, garbage in -> no match, never a throw)
   - DOM wiring with the real team-follow.js + seeded storage: typing
     isolates a game with an honest "N of M games" count, the named
     empty state for a nonsense query, Escape / Clear restoring the
     full board, the follow strip tracking the filtered board (a chip
     never promises a hidden card), and re-renders staying filtered
   - shipped-file pins (scores.html hooks + cache key + styles)
   Run: node tests/test-scores-search.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

/* ---------------- pure contract (captured via a throwaway vm) ---------- */
function captureExports(){
  var els = {};
  function getEl(id){
    if(!els[id]) els[id] = { id: id, innerHTML: "", textContent: "", style: {}, hidden: false,
      addEventListener: function(){}, setAttribute: function(){}, getAttribute: function(){ return null; },
      querySelectorAll: function(){ return []; }, querySelector: function(){ return null; },
      classList: { add: function(){}, remove: function(){}, toggle: function(){} } };
    return els[id];
  }
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl, hidden: false }, window: {},
    GIU: { fetchJSON: function(){ return Promise.resolve({events: []}); },
           esc: function(s){ return String(s == null ? "" : s); } } };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8");
  src = src.replace(/\nload\(\);\n\}\)\(\);/, "\n/*load suppressed*/\n})();");
  vm.runInContext(src, sandbox, {filename: "js/scores.js"});
  return sandbox.window.GIU;
}
var G = captureExports();
assert(typeof G.scoresGameSearch === "function", "scoresGameSearch exported on GIU");
assert(typeof G.scoresGameText === "function", "scoresGameText exported on GIU");
assert(typeof G.scoresSearchTerms === "function", "scoresSearchTerms exported on GIU");
var MS = G.scoresGameSearch, GT = G.scoresGameText, ST = G.scoresSearchTerms;

eq(JSON.stringify(ST("  Bears   SOLDIER ")), JSON.stringify(["bears", "soldier"]),
   "terms split on whitespace and lowercase");
eq(ST("").length, 0, "blank query -> no terms");
eq(ST(null).length, 0, "null query -> no terms");

function game(away, home, venue){
  return { id: "x", competitions: [{ status: { type: { state: "pre", shortDetail: "" } },
    venue: { fullName: venue || "" },
    competitors: [
      { homeAway: "away", team: away },
      { homeAway: "home", team: home } ] }] };
}
var bearsGame = game(
  { abbreviation: "GB", displayName: "Green Bay Packers", shortDisplayName: "Packers", location: "Green Bay" },
  { abbreviation: "CHI", displayName: "Chicago Bears", shortDisplayName: "Bears", location: "Chicago" },
  "Soldier Field");
var boysGame = game(
  { abbreviation: "DAL", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", location: "Dallas" },
  { abbreviation: "NYG", displayName: "New York Giants", shortDisplayName: "Giants", location: "New York" },
  "MetLife Stadium");

assert(GT(bearsGame).indexOf("chicago bears") !== -1, "search text carries the home display name");
assert(GT(bearsGame).indexOf("soldier field") !== -1, "search text carries the venue");
assert(GT(bearsGame).indexOf("packers") !== -1, "search text carries the away side too");
eq(GT(null), "", "null event -> empty search text");
eq(GT({}), "", "competition-less event -> empty search text");
eq(GT({ competitions: [{ competitors: "junk" }] }), "", "non-array competitors -> empty search text");

eq(MS(bearsGame, ""), true, "blank query matches a game");
eq(MS(null, ""), true, "blank query matches even a garbage event (the unfiltered board)");
eq(MS(bearsGame, "bears"), true, "team name matches");
eq(MS(bearsGame, "CHI"), true, "abbreviation matches, case-insensitive");
eq(MS(bearsGame, "green"), true, "the away side is searchable too");
eq(MS(bearsGame, "soldier"), true, "venue matches");
eq(MS(bearsGame, "bears soldier"), true, "AND terms narrow across fields (team + venue)");
eq(MS(bearsGame, "chi field"), true, "AND terms narrow across fields (abbr + venue word)");
eq(MS(bearsGame, "bears metlife"), false, "a term that appears nowhere in the game kills the match");
eq(MS(bearsGame, "cowboys"), false, "another game's team does not match");
eq(MS(boysGame, "cowboys"), true, "the other game matches its own team");
eq(MS(null, "bears"), false, "garbage event + real query -> no match, never a throw");
eq(MS({ competitions: [] }, "bears"), false, "competition-less event + real query -> no match");
eq(MS(bearsGame, "zzzz"), false, "nonsense query matches nothing");

/* ---------------- DOM wiring (real team-follow.js + seeded storage) ---- */
function makeEl(tag, id){
  var handlers = {};
  return { tag: tag || "div", id: id || "", innerHTML: "", textContent: "", style: {},
    value: "", hidden: false, title: "", _children: [], _attrs: {},
    addEventListener: function(ev2, fn){ (handlers[ev2] = handlers[ev2] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    removeAttribute: function(k){ delete this._attrs[k]; },
    querySelectorAll: function(){ return []; }, querySelector: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    focus: function(){},
    _fire: function(ev2, arg){ var self = this; (handlers[ev2] || []).forEach(function(fn){ fn(arg || { target: self }); }); } };
}
function comp(state, shortDetail, away, home, venue){
  return { status: { type: { state: state, shortDetail: shortDetail } },
    competitors: [
      { homeAway: "away", score: state === "pre" ? "0" : "14", team: away },
      { homeAway: "home", score: state === "pre" ? "0" : "21", team: home }
    ], broadcasts: [], odds: [], venue: { fullName: venue }, leaders: [] };
}
function payload(){
  return { events: [
    { id: "ev-bears", date: "2026-10-04T17:00:00Z", competitions: [comp("pre", "Sun 1:00 PM",
      { abbreviation: "GB", displayName: "Green Bay Packers", shortDisplayName: "Packers", location: "Green Bay", color: "204e32" },
      { abbreviation: "CHI", displayName: "Chicago Bears", shortDisplayName: "Bears", location: "Chicago", color: "0b162a" },
      "Soldier Field")] },
    { id: "ev-boys", date: "2026-10-04T20:00:00Z", competitions: [comp("pre", "Sun 4:00 PM",
      { abbreviation: "DAL", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", location: "Dallas", color: "003594" },
      { abbreviation: "NYG", displayName: "New York Giants", shortDisplayName: "Giants", location: "New York", color: "0b2265" },
      "MetLife Stadium")] },
    { id: "ev-live", date: "2026-10-02T00:20:00Z", competitions: [comp("in", "6:54 - 1st",
      { abbreviation: "KC", displayName: "Kansas City Chiefs", shortDisplayName: "Chiefs", location: "Kansas City", color: "e31837" },
      { abbreviation: "BUF", displayName: "Buffalo Bills", shortDisplayName: "Bills", location: "Buffalo", color: "00338d" },
      "Highmark Stadium")] }
  ] };
}
function boot(storageSeed){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl("div", id); return els[id]; }
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
    GIU: { fetchJSON: function(){ return Promise.resolve(payload()); },
      esc: function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
      failBox: function(msg){ return '<div class="fail">' + msg + "</div>"; } } };
  sandbox.window.GIU = sandbox.GIU;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  ["js/team-brand.js", "js/team-follow.js", "js/scores-detail.js", "js/scores.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  });
  return { els: els, sandbox: sandbox };
}
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function cards(html){ return (html.match(/class="game-card/g) || []).length; }

(async function(){
  var b = boot({ "giu-followed-teams": '["CHI"]' });
  await wait(30);
  var grid = b.els["scoreGrid"], q = b.els["scoreQ"], clear = b.els["scoreClear"],
      count = b.els["scoreCount"], strip = b.els["followStrip"];
  eq(cards(grid.innerHTML), 3, "boot renders the full board");
  eq(count.textContent, "", "boot: count stays silent with no search");
  eq(clear.hidden, true, "boot: Clear stays hidden with no search");
  eq(strip.hidden, false, "boot: follow strip shows the followed Bears game");

  q.value = "bears"; q._fire("input");
  eq(cards(grid.innerHTML), 1, "'bears' isolates the Bears game");
  assert(grid.innerHTML.indexOf('id="sg-ev-bears"') !== -1, "the isolated card is the Bears game");
  eq(count.textContent, "1 of 3 games", "honest count while searching");
  eq(clear.hidden, false, "Clear appears while searching");
  eq(strip.hidden, false, "strip still shows: the followed game is in the filtered view");

  q.value = "cowboys"; q._fire("input");
  eq(cards(grid.innerHTML), 1, "'cowboys' isolates the Cowboys game");
  eq(strip.hidden, true, "strip hides: its chip must never promise a card the search hid");

  q.value = "chi soldier"; q._fire("input");
  eq(cards(grid.innerHTML), 1, "'chi soldier' narrows across abbr + venue to the Bears game");
  assert(grid.innerHTML.indexOf('id="sg-ev-bears"') !== -1, "cross-field match is the Bears game");

  q.value = "zzzz"; q._fire("input");
  eq(cards(grid.innerHTML), 0, "nonsense query renders no cards");
  assert(grid.innerHTML.indexOf('No games match &quot;zzzz&quot;') !== -1, "named empty state quotes the query");
  assert(grid.innerHTML.indexOf("see all 3 games") !== -1, "empty state names the full board size");
  eq(count.textContent, "No matches", "count says No matches, never a fake number");

  q._fire("keydown", { key: "Escape", target: q });
  eq(q.value, "", "Escape clears the input");
  eq(cards(grid.innerHTML), 3, "Escape restores the full board");
  eq(count.textContent, "", "Escape silences the count");
  eq(clear.hidden, true, "Escape hides Clear");
  eq(strip.hidden, false, "Escape restores the follow strip");

  q.value = "bills"; q._fire("input");
  eq(cards(grid.innerHTML), 1, "'bills' isolates the live game");
  q._fire("input"); /* a second render with the same query (the refresh path) */
  eq(cards(grid.innerHTML), 1, "re-render under an active search stays filtered");
  clear._fire("click");
  eq(q.value, "", "Clear button empties the input");
  eq(cards(grid.innerHTML), 3, "Clear button restores the full board");

  /* no hooks at all: board renders untouched (GIU exports still land) */
  var b2 = boot({});
  await wait(30);
  eq(cards(b2.els["scoreGrid"].innerHTML), 3, "no follows + no search: the plain board renders");

  /* shipped pins */
  var html = fs.readFileSync(path.join(ROOT, "scores.html"), "utf8");
  assert(html.indexOf('id="scoreQ"') !== -1, "scores.html ships the scoreQ input");
  assert(html.indexOf('id="scoreClear"') !== -1 && html.indexOf('id="scoreCount"') !== -1,
    "scores.html ships the Clear button + count live region");
  assert(html.indexOf("js/scores.js?v=2.0.10") !== -1, "scores.html bumps scores.js to ?v=2.0.10");
  assert(html.indexOf(".score-find") !== -1, "scores.html carries the page-scoped finder styles");
  var src = fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8");
  assert(src.indexOf("gameMatchesSearch") !== -1 && src.indexOf("renderSearchMeta") !== -1,
    "scores.js ships the pure matcher + meta renderer");

  if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
  console.log("ALL SCORES-SEARCH TESTS PASS");
})().catch(function(e){ console.error("HARNESS ERROR:", e); process.exit(1); });
