/* Tests for the full college slates on the scores board (v2.0.10, js/scores.js).
   ESPN's DEFAULT college scoreboards are a ranked subset only — verified
   live 2026-10-03 against real Saturdays: college-football default = 16
   games vs 54 with groups=80 (FBS) for 2026-10-03; mens-college-basketball
   default = 21 vs 145 with groups=50 (Division I) for 2026-01-17 — while
   scores.html promises "Every game, every league". Covers:
   - the scoreboardUrl contract: the two college paths gain their group +
     generous limit, composed AFTER the dates param; the five pro/EPL
     paths stay byte-identical to the pre-fix shape (no group param —
     their default boards are already the full slate)
   - offset composition (day navigation and the smart-day scan ride the
     same builder, so a jumped-to college day is the full slate too —
     proven by recording the URLs a smartDay scan requests)
   - garbage / prototype-name league paths never gain a group param and
     never throw (hasOwnProperty discipline, not a prototype-chain read)
   - shipped pins: scores.html cache key + the FULL_SLATE wiring in scores.js
   Run: node tests/test-scores-fullslate.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

function captureExports(fetchJSON){
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
    GIU: { fetchJSON: fetchJSON || function(){ return Promise.resolve({events: []}); },
           esc: function(s){ return String(s == null ? "" : s); } } };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8");
  src = src.replace(/\nload\(\);\n\}\)\(\);/, "\n/*load suppressed*/\n})();");
  vm.runInContext(src, sandbox, {filename: "js/scores.js"});
  return sandbox.window.GIU;
}
var G = captureExports();
assert(typeof G.scoresBoardUrl === "function", "scoresBoardUrl exported on GIU");
var U = G.scoresBoardUrl;

function ymdPlus(off){
  var d = new Date(); d.setDate(d.getDate() + off);
  return d.getFullYear() + String(d.getMonth()+1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}
var BASE = "https://site.api.espn.com/apis/site/v2/sports/";

/* ---- the college paths gain the full-slate group ---- */
eq(U("football/college-football", 0),
   BASE + "football/college-football/scoreboard?dates=" + ymdPlus(0) + "&groups=80&limit=200",
   "NCAAF board URL is the full FBS slate (groups=80)");
eq(U("basketball/mens-college-basketball", 0),
   BASE + "basketball/mens-college-basketball/scoreboard?dates=" + ymdPlus(0) + "&groups=50&limit=400",
   "NCAAB board URL is the full Division I slate (groups=50)");

/* ---- the other five leagues stay byte-identical (no group param) ---- */
["football/nfl", "basketball/nba", "baseball/mlb", "hockey/nhl", "soccer/eng.1"].forEach(function(p){
  eq(U(p, 0), BASE + p + "/scoreboard?dates=" + ymdPlus(0),
     p + " URL unchanged — default board is already the full slate");
});

/* ---- day offsets compose with the group (day nav + smart-day) ---- */
eq(U("football/college-football", 3),
   BASE + "football/college-football/scoreboard?dates=" + ymdPlus(3) + "&groups=80&limit=200",
   "NCAAF +3d URL keeps the group after the shifted date");
eq(U("basketball/mens-college-basketball", -1),
   BASE + "basketball/mens-college-basketball/scoreboard?dates=" + ymdPlus(-1) + "&groups=50&limit=400",
   "NCAAB -1d URL keeps the group after the shifted date");

/* ---- garbage / prototype names never gain a group, never throw ---- */
["constructor", "toString", "__proto__", "", null, undefined].forEach(function(p){
  var threw = false, u = null;
  try { u = U(p, 0); } catch(e){ threw = true; }
  assert(!threw, "boardUrl(" + JSON.stringify(p) + ") does not throw");
  assert(typeof u === "string" && u.indexOf("groups=") === -1,
         "boardUrl(" + JSON.stringify(p) + ") gains no group param");
});

/* ---- smartDay scans ride the same builder (full slate on jumped days) ---- */
var scanned = [];
function recordingFetch(url){
  scanned.push(url);
  /* only the +2d scan day has games */
  return Promise.resolve(url.indexOf("dates=" + ymdPlus(2)) !== -1 ? { events: [{ id: "g1" }] } : { events: [] });
}
var G2 = captureExports(recordingFetch);
assert(typeof G2.scoresSmartDay === "function", "scoresSmartDay exported on GIU");
G2.scoresSmartDay(recordingFetch, "football/college-football", 0, 7).then(function(hit){
  assert(hit && hit.offset === 2, "smartDay finds the +2d college game day");
  eq(scanned.length, 2, "smartDay stopped at the first hit (2 fetches)");
  assert(scanned.every(function(u){ return u.indexOf("&groups=80&limit=200") !== -1; }),
         "every smartDay scan URL for NCAAF carries the full-slate group");
  finish();
}).catch(function(e){
  assert(false, "smartDay promise rejected: " + (e && e.message));
  finish();
});

/* ---- shipped pins ---- */
function finish(){
  var html = fs.readFileSync(path.join(ROOT, "scores.html"), "utf8");
  assert(html.indexOf("js/scores.js?v=2.0.10") !== -1, "scores.html keys scores.js at v2.0.10");
  var js = fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8");
  assert(js.indexOf('"football/college-football": "groups=80&limit=200"') !== -1,
         "scores.js FULL_SLATE pins the FBS group for college football");
  assert(js.indexOf('"basketball/mens-college-basketball": "groups=50&limit=400"') !== -1,
         "scores.js FULL_SLATE pins the Division I group for college basketball");
  console.log(failures ? ("\n" + failures + " FAILURE(S)") : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}
