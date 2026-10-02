/* Tests for followed teams on the injuries board (v1.153.0, js/injuries.js).
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") now mark the injuries board: followed-team cards
   get a gold rail + "★ Your team" tag, and a "Your teams" strip of jump
   chips opens the board. Covers:
   - the pure followedInjuries contract (directory-resolved match, board
     order, counts over the shown injuries, normalization, garbage in -> [])
   - the cardKey anchor contract (abbr wins, slug fallback, garbage -> "team")
   - DOM wiring with the REAL team-brand.js + team-follow.js + a seeded
     localStorage: strip chips anchor to the right cards, quiet boards stay
     quiet, corrupt storage degrades to a clean board
   - shipped-file pins (injuries.html wiring + cache keys + styles)
   Run: node tests/test-injuries-follow.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

/* ---------------- pure exports (captured via a throwaway vm) ---------- */
function makeEl(id){
  return { id: id || "", innerHTML: "", textContent: "", style: {}, value: "", hidden: false,
    addEventListener: function(){}, setAttribute: function(){}, getAttribute: function(){ return null; },
    querySelectorAll: function(){ return []; }, querySelector: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} } };
}
function captureExports(){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  var GIU = { fetchJSON: function(){ return Promise.resolve({ injuries: [] }); },
    esc: esc, failBox: function(m){ return m; },
    teamDir: function(){ return Promise.resolve({}); },
    teamFind: function(){ return null; },
    teamHead: function(){ return ""; } };
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl, hidden: false }, window: {}, GIU: GIU };
  sandbox.window.GIU = GIU;
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(ROOT, "js/injuries.js"), "utf8");
  src = src.replace(/\nload\(\);\n\}\)\(\);/, "\n/*load suppressed*/\n})();");
  vm.runInContext(src, sandbox, {filename: "js/injuries.js"});
  return sandbox.window.GIU;
}
var G = captureExports();
assert(typeof G.injuriesFollowed === "function", "injuriesFollowed exported on GIU");
assert(typeof G.injuriesCardKey === "function", "injuriesCardKey exported on GIU");
var FI = G.injuriesFollowed, CK = G.injuriesCardKey;

function inj(status, name){ return { status: status, athlete: { displayName: name || "Player" }, longComment: "note" }; }
function team(name, injs, shown){
  var t = { displayName: name, injuries: injs };
  if(shown) t._shown = shown;
  return t;
}
var MAP = { "Chicago Bears": "CHI", "Dallas Cowboys": "DAL", "Green Bay Packers": "GB" };
function RES(name){ return MAP[name] || ""; }
var board = [
  team("Chicago Bears", [inj("Out", "A"), inj("Out", "B"), inj("Questionable", "C")]),
  team("Dallas Cowboys", [inj("Doubtful", "D")]),
  team("Mystery Team", [inj("Out", "E")]),
  team("Green Bay Packers", [inj("Out", "F"), inj("Day-To-Day", "G")])
];

var m = FI(board, ["CHI"], RES);
eq(m.length, 1, "followed CHI matches exactly its team card");
eq(m[0].abbr, "CHI", "match stamps the followed abbreviation");
eq(m[0].key, "chi", "match key is the lowercase abbreviation anchor");
eq(m[0].name, "Chicago Bears", "match carries the team display name");
eq(m[0].out, 2, "match counts Out designations");
eq(m[0].questionable, 1, "match counts Questionable designations");
eq(m[0].doubtful, 0, "match counts zero Doubtful honestly");
eq(m[0].total, 3, "match totals the shown injuries");
var both = FI(board, ["DAL", "CHI"], RES);
eq(both.length, 2, "two followed teams on the board -> two records");
eq(both[0].abbr, "CHI", "records keep board order, not follow-list order");
eq(both[1].abbr, "DAL", "second record is the later board team");
eq(FI(board, [" chi "], RES)[0].abbr, "CHI", "follow entries are trimmed + uppercased");
eq(FI(board, ["GB"], RES)[0].questionable, 1, "Day-To-Day counts as questionable-tier");
eq(FI(board, [], RES).length, 0, "no follows -> no matches");
eq(FI(board, ["SEA"], RES).length, 0, "followed team not on the board -> no matches");
eq(FI(board, ["MYSTERY"], RES).length, 0, "unresolvable team name never matches");
eq(FI(null, ["CHI"], RES).length, 0, "null teams -> []");
eq(FI(board, null, RES).length, 0, "null follows -> []");
eq(FI("junk", ["CHI"], RES).length, 0, "non-array teams -> []");
eq(FI(board, ["CHI"], null).length, 0, "missing resolver -> []");
eq(FI(board, ["CHI"], function(){ throw new Error("boom"); }).length, 0, "throwing resolver skips the team, never throws");
eq(FI([null, team("Chicago Bears", [inj("Out")])], ["CHI"], RES).length, 1, "null team entries are skipped, the real one matches");
eq(FI(board, ["CHI", 42, "", "toolongname", "CHI"], RES).length, 1, "non-string / implausible / duplicate follow entries are dropped");
var shownOnly = [ team("Chicago Bears", [inj("Out"), inj("Out"), inj("Questionable")], [inj("Questionable")]) ];
var sm = FI(shownOnly, ["CHI"], RES);
eq(sm[0].total, 1, "counts run over _shown when a severity filter narrowed the card");
eq(sm[0].out, 0, "a filtered-out Out is not promised by the chip");
eq(sm[0].questionable, 1, "the shown Questionable is counted");

/* ---------------- cardKey contract ------------------------------------- */
eq(CK("Chicago Bears", "CHI"), "chi", "cardKey prefers the resolved abbreviation");
eq(CK("New York Jets", ""), "new-york-jets", "cardKey falls back to a name slug");
eq(CK("St. Louis Battlehawks", null), "st-louis-battlehawks", "cardKey slugifies punctuation");
eq(CK("", ""), "team", "cardKey of nothing is the neutral 'team'");
eq(CK(null, undefined), "team", "cardKey of nulls is the neutral 'team'");
eq(CK("Chicago Bears", "TOOLONG"), "chicago-bears", "an implausible abbreviation falls back to the slug");

/* ---------------- DOM wiring (real team-brand + team-follow) ----------- */
function player(name, status){ return { status: status, athlete: { displayName: name }, longComment: name + " note.", date: "2026-10-01T00:00:00Z" }; }
function injPayload(){
  return { injuries: [
    { displayName: "Chicago Bears", injuries: [player("Bear One", "Out"), player("Bear Two", "Out"), player("Bear Three", "Questionable"), player("Bear Four", "Active")] },
    { displayName: "Green Bay Packers", injuries: [player("Packer One", "Out")] },
    { displayName: "Dallas Cowboys", injuries: [player("Cowboy One", "Doubtful")] }
  ] };
}
function teamsPayload(){
  return { leagues: { nfl: [
    { abbr: "CHI", displayName: "Chicago Bears", shortDisplayName: "Bears", color: "0b162a" },
    { abbr: "GB", displayName: "Green Bay Packers", shortDisplayName: "Packers", color: "203731" },
    { abbr: "DAL", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", color: "041e42" }
  ] } };
}
function boot(storageSeed){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  var store = {};
  Object.keys(storageSeed || {}).forEach(function(k){ store[k] = storageSeed[k]; });
  var GIU2 = { fetchJSON: function(url){
      if(String(url).indexOf("teams.json") !== -1) return Promise.resolve(teamsPayload());
      return Promise.resolve(injPayload());
    },
    esc: esc, failBox: function(msg){ return '<div class="fail">' + msg + "</div>"; } };
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    localStorage: { getItem: function(k){ return k in store ? store[k] : null; },
                    setItem: function(k, v){ store[k] = String(v); },
                    removeItem: function(k){ delete store[k]; } },
    document: { hidden: false, getElementById: getEl,
      querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
      createElement: function(t){ return makeEl(t); } },
    window: {}, GIU: GIU2 };
  sandbox.window.GIU = GIU2;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  ["js/team-brand.js", "js/team-follow.js", "js/injuries.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
  });
  return els;
}
function flush(){ return new Promise(function(r){ setTimeout(r, 0); }); }

(async function(){
  var els = boot({ "giu-followed-teams": JSON.stringify(["CHI"]) });
  await flush(); await flush(); await flush();
  var grid = els.injGrid.innerHTML, strip = els.followStrip;
  assert(grid.indexOf('id="inj-chi"') !== -1, "DOM: followed CHI card carries the #inj-chi anchor");
  assert(/class="card followed" id="inj-chi"/.test(grid), "DOM: followed CHI card gets the gold-rail class");
  assert(grid.indexOf("★ Your team") !== -1, "DOM: followed card shows the ★ Your team tag");
  assert(grid.indexOf('id="inj-dal"') !== -1 && !/class="card followed" id="inj-dal"/.test(grid), "DOM: unfollowed DAL card has an anchor but no followed class");
  assert(grid.indexOf("Bear Four") === -1, "DOM: healthy Active players stay dropped with follows on");
  eq(strip.hidden, false, "DOM: strip is visible when a followed team is on the board");
  assert(strip.innerHTML.indexOf('href="#inj-chi"') !== -1, "DOM: strip chip anchors to the CHI card");
  assert(strip.innerHTML.indexOf("Chicago Bears") !== -1 && strip.innerHTML.indexOf("2 out") !== -1, "DOM: chip names the team and its worst count (2 out)");

  var els2 = boot({});
  await flush(); await flush(); await flush();
  eq(els2.followStrip.hidden, true, "DOM: no follows -> strip stays hidden");
  assert(els2.injGrid.innerHTML.indexOf("followed") === -1, "DOM: no follows -> board renders exactly as before");

  var els3 = boot({ "giu-followed-teams": "{corrupt json" });
  await flush(); await flush(); await flush();
  eq(els3.followStrip.hidden, true, "DOM: corrupt follow storage degrades to a clean board");
  assert(els3.injGrid.innerHTML.indexOf('id="inj-chi"') !== -1, "DOM: corrupt storage still renders the board's cards");

  var els4 = boot({ "giu-followed-teams": JSON.stringify(["SEA"]) });
  await flush(); await flush(); await flush();
  eq(els4.followStrip.hidden, true, "DOM: followed team not on this board -> strip hidden, nothing invented");

  /* ---------------- shipped-file pins ---------------------------------- */
  var html = fs.readFileSync(path.join(ROOT, "injuries.html"), "utf8");
  assert(html.indexOf('id="followStrip"') !== -1, "pin: injuries.html carries the followStrip container");
  assert(html.indexOf("js/team-follow.js?v=1.142.0") !== -1, "pin: injuries.html loads team-follow.js at its content version");
  assert(html.indexOf("js/injuries.js?v=1.153.0") !== -1, "pin: injuries.html loads injuries.js at v1.153.0");
  assert(html.indexOf(".follow-strip") !== -1 && html.indexOf(".card.followed") !== -1 && html.indexOf(".card:target") !== -1, "pin: injuries.html carries the page-scoped follow styles");
  var js = fs.readFileSync(path.join(ROOT, "js/injuries.js"), "utf8");
  assert(js.indexOf("renderFollowStrip(fol)") !== -1, "pin: injuries.js renders the strip from the filtered view");
  assert(js.indexOf("tag-yourteam") !== -1, "pin: injuries.js marks followed cards with the ★ tag");

  console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
