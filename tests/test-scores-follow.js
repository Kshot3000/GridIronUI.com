/* Tests for followed teams on the scores board (v1.149.0, js/scores.js).
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") now mark the scores board: followed-team games
   get a gold rail + "★ Your team" tag, and a "Your teams" strip of jump
   chips opens the board. Covers:
   - the pure followedGames contract (away/home match, normalization,
     first-followed wins, garbage in -> [])
   - DOM wiring with the REAL team-follow.js + a seeded localStorage:
     strip chips anchor to the right cards, quiet boards stay quiet,
     corrupt storage degrades to a clean board
   - shipped-file pins (scores.html wiring + cache keys + styles)
   Run: node tests/test-scores-follow.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

/* ---------------- pure followedGames (captured via a throwaway vm) ------ */
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
  return sandbox.window.GIU.scoresFollowedGames;
}
var FG = captureExports();
assert(typeof FG === "function", "scoresFollowedGames exported on GIU");

function ev(id, awayAbbr, homeAbbr, state, detail){
  return { id: id, competitions: [{ status: { type: { state: state || "pre", shortDetail: detail || "" } },
    competitors: [
      { homeAway: "away", team: { abbreviation: awayAbbr } },
      { homeAway: "home", team: { abbreviation: homeAbbr } }
    ] }] };
}
var board = [ ev("g1", "GB", "CHI", "in", "4th - 2:00"), ev("g2", "DAL", "NYG", "pre", "Sun 1:00 PM"), ev("g3", "CHI", "DET", "post", "Final") ];

var m = FG(board, ["CHI"]);
eq(m.length, 2, "followed CHI matches its home game and its away game");
eq(m[0].id, "g1", "first match is the live CHI home game");
eq(m[0].abbr, "CHI", "match stamps the followed abbreviation");
eq(m[0].away, "GB", "match carries the away abbreviation");
eq(m[0].home, "CHI", "match carries the home abbreviation");
eq(m[0].state, "in", "match carries the game state");
eq(m[0].detail, "4th - 2:00", "match carries the status detail");
eq(m[1].id, "g3", "second match is the final with CHI away");
eq(FG(board, ["nyg"])[0].abbr, "NYG", "lowercase follow entries are normalized");
eq(FG(board, ["DET", "CHI"]).filter(function(x){ return x.id === "g3"; })[0].abbr, "DET",
   "both sides followed: the earlier follow-list entry wins");
eq(FG(board, []).length, 0, "no follows -> no matches");
eq(FG(board, ["SEA"]).length, 0, "followed team not on the board -> no matches");
eq(FG(null, ["CHI"]).length, 0, "null events -> []");
eq(FG(board, null).length, 0, "null follows -> []");
eq(FG("junk", ["CHI"]).length, 0, "non-array events -> []");
eq(FG([{ id: "x" }, { id: "y", competitions: [] }, null, ev("g9", "CHI", "GB")], ["CHI"]).length, 1,
   "malformed events are skipped, the real one still matches");
eq(FG(board, ["CHI", 42, "", "toolongname", "CHI"]).length, 2,
   "non-string / implausible / duplicate follow entries are dropped");
var noStatus = { id: "g7", competitions: [{ competitors: [
  { homeAway: "away", team: { abbreviation: "CHI" } },
  { homeAway: "home", team: { abbreviation: "GB" } } ] }] };
eq(FG([noStatus], ["GB"])[0].state, "", "missing status -> empty state, still a match");

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
    _fire: function(ev2, arg){ (handlers[ev2] || []).forEach(function(fn){ fn(arg || { target: this }); }.bind(this)); } };
}
function comp(state, shortDetail, awayAbbr, homeAbbr){
  return { status: { type: { state: state, shortDetail: shortDetail } },
    competitors: [
      { homeAway: "away", score: state === "pre" ? "0" : "14", team: { abbreviation: awayAbbr, displayName: awayAbbr + " Team", shortDisplayName: awayAbbr, color: "000000" } },
      { homeAway: "home", score: state === "pre" ? "0" : "21", team: { abbreviation: homeAbbr, displayName: homeAbbr + " Team", shortDisplayName: homeAbbr, color: "ffffff" } }
    ], broadcasts: [], odds: [], venue: { fullName: "Stadium" }, leaders: [] };
}
function payload(){
  return { events: [
    { id: "ev-fol", date: "2026-10-04T17:00:00Z", competitions: [comp("in", "4th - 2:00", "GB", "HME")] },
    { id: "ev-other", date: "2026-10-04T20:00:00Z", competitions: [comp("pre", "Sun 4:00 PM", "AWY", "ZZZ")] },
    { id: "ev-fol2", date: "2026-10-04T13:00:00Z", competitions: [comp("post", "Final", "HME", "QQQ")] }
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

(async function(){
  /* followed HME: two of the three games involve HME (home in one, away in the other) */
  var b1 = boot({ "giu-followed-teams": '["HME"]' });
  await wait(30);
  var strip = b1.els["followStrip"], grid = b1.els["scoreGrid"];
  assert(strip && strip.hidden === false, "strip is shown when a followed team is on the board");
  assert(strip.innerHTML.indexOf("Your teams") !== -1, "strip carries the 'Your teams' label");
  assert(strip.innerHTML.indexOf('href="#sg-ev-fol"') !== -1, "strip chips link to the followed home game card");
  assert(strip.innerHTML.indexOf('href="#sg-ev-fol2"') !== -1, "strip chips link to the followed away game card");
  assert(strip.innerHTML.indexOf("GB @ HME") !== -1 && strip.innerHTML.indexOf("Live") !== -1,
    "live chip names the matchup and says Live");
  assert(strip.innerHTML.indexOf("HME @ QQQ") !== -1 && strip.innerHTML.indexOf("Final") !== -1,
    "final chip names the matchup and its status");
  assert(grid.innerHTML.indexOf('class="game-card followed" id="sg-ev-fol"') !== -1,
    "followed home card gets the followed class + anchor id");
  assert(grid.innerHTML.indexOf("★ Your team") !== -1, "followed card carries the ★ Your team tag");
  assert(grid.innerHTML.indexOf('id="sg-ev-other"') !== -1 && grid.innerHTML.indexOf('class="game-card followed" id="sg-ev-other"') === -1,
    "unfollowed card gets an anchor id but no followed mark");
  eq((grid.innerHTML.match(/★ Your team/g) || []).length, 2, "exactly the two HME games are tagged");

  /* no follows stored: the board is exactly the old board */
  var b2 = boot({});
  await wait(30);
  assert(b2.els["followStrip"].hidden === true && b2.els["followStrip"].innerHTML === "",
    "no follows -> strip hidden and empty");
  assert(b2.els["scoreGrid"].innerHTML.indexOf("followed") === -1 &&
         b2.els["scoreGrid"].innerHTML.indexOf("Your team") === -1,
    "no follows -> no followed marks anywhere");

  /* corrupt storage: team-follow recovers to [], board renders clean */
  var b3 = boot({ "giu-followed-teams": "{corrupt" });
  await wait(30);
  assert(b3.els["scoreGrid"].innerHTML.indexOf("sg-ev-fol") !== -1,
    "corrupt follow storage still renders the board");
  assert(b3.els["followStrip"].hidden === true, "corrupt follow storage -> no strip");

  /* shipped pins */
  var html = fs.readFileSync(path.join(ROOT, "scores.html"), "utf8");
  assert(html.indexOf('id="followStrip"') !== -1, "scores.html ships the followStrip container");
  assert(html.indexOf("js/team-follow.js?v=1.142.0") !== -1, "scores.html loads team-follow.js (content unchanged since v1.142.0)");
  assert(html.indexOf("js/scores.js?v=1.161.0") !== -1, "scores.html bumps scores.js to ?v=1.161.0");
  assert(html.indexOf(".game-card.followed") !== -1 && html.indexOf(".follow-chip-link") !== -1 &&
         html.indexOf(".game-card:target") !== -1, "scores.html carries the page-scoped followed styles");
  var src = fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8");
  assert(src.indexOf("renderFollowStrip") !== -1 && src.indexOf("followedGames") !== -1,
    "scores.js ships the strip renderer + pure matcher");

  if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
  console.log("ALL SCORES-FOLLOW TESTS PASS");
})().catch(function(e){ console.error("HARNESS ERROR:", e); process.exit(1); });
