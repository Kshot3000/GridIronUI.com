/* Tests for the scores-page smart default day (js/scores.js).
   On a no-game day the NFL tab used to land on a dead "No games" board —
   exactly the Tuesday–Wednesday window when bettors start handicapping the
   weekend. smartDay() scans forward for the next day with events; the page
   jumps there with an honest notice instead of the dead board.
   Run: node tests/test-scores-smartday.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0, pending = 0;
function ok(name, cond){
  if(!cond){ failures++; console.error("FAIL", name); }
  else console.log("ok  ", name);
}
function async(name, fn){
  pending++;
  Promise.resolve().then(fn).then(function(){ console.log("ok  ", name); pending--; },
    function(e){ failures++; console.error("FAIL", name, "-", (e && e.message) || e); pending--; });
}
process.on("exit", function(){
  if(pending){ failures++; console.error("FAIL: hung async tests:", pending); }
  if(failures){ console.error(failures + " FAILURES"); process.exitCode = 1; }
  else console.log("ALL SCORES-SMARTDAY TESTS PASS");
});

/* ---------- pure helper tests (no DOM needed) ---------- */
var S = null; /* captured scoresSmartDay / scoresBoardUrl from a throwaway vm */
(function(){
  /* stub DOM: the script wires tabs/nav handlers at load; only load() itself
     is suppressed so the export block still runs and attaches to window.GIU */
  var els = {};
  function getEl(id){
    if(!els[id]) els[id] = {
      id: id, innerHTML: "", textContent: "", style: {},
      addEventListener: function(){}, setAttribute: function(){},
      querySelectorAll: function(){ return []; },
      getAttribute: function(){ return null; },
      classList: { add: function(){}, remove: function(){} }
    };
    return els[id];
  }
  var sandbox = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl },
    window: {}, GIU: { fetchJSON: function(){ return Promise.resolve({events:[]}); } }
  };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8");
  src = src.replace(/\nload\(\);\n\}\)\(\);/, "\n/*load suppressed in helper tests*/\n})();");
  vm.runInContext(src, sandbox, {filename: "js/scores.js"});
  S = { smartDay: sandbox.window.GIU.scoresSmartDay,
        boardUrl: sandbox.window.GIU.scoresBoardUrl };
})();

ok("smartDay and scoreboardUrl exported on GIU", !!(S && S.smartDay && S.boardUrl));

/* scoreboardUrl shape: correct league path + 8-digit dates param */
(function(){
  var u = S.boardUrl("football/nfl", 2);
  var d = new Date(); d.setDate(d.getDate() + 2);
  var expect = d.getFullYear() + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0");
  ok("boardUrl path", u === "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=" + expect);
  ok("boardUrl dates is 8 digits", /dates=\d{8}$/.test(u));
  ok("boardUrl other league", S.boardUrl("baseball/mlb", 0).indexOf("/sports/baseball/mlb/scoreboard?dates=") !== -1);
})();

/* first hit stops the scan (offset 3 -> exactly 3 fetches) */
async("smartDay returns first offset with events, stops early", function(){
  var calls = 0;
  var fetch = function(url){
    calls++;
    var hit = /dates=(\d{8})/.exec(url)[1];
    var want = (function(){ var d = new Date(); d.setDate(d.getDate()+3);
      return d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0"); })();
    return Promise.resolve({ events: hit === want ? [{id:"g"}] : [] });
  };
  return S.smartDay(fetch, "football/nfl", 0, 7).then(function(hit){
    ok("  hit offset is 3", hit && hit.offset === 3);
    ok("  exactly 3 fetches", calls === 3);
  });
});

/* nothing within window -> null after maxDays fetches */
async("smartDay null when no games in window (7 fetches)", function(){
  var calls = 0;
  return S.smartDay(function(){ calls++; return Promise.resolve({events:[]}); },
                    "football/nfl", 0, 7).then(function(hit){
    ok("  null hit", hit === null);
    ok("  7 fetches", calls === 7);
  });
});

/* failures and garbage payloads are swallowed, not thrown */
async("smartDay swallows fetch failures", function(){
  return S.smartDay(function(){ return Promise.reject(new Error("down")); },
                    "football/nfl", 0, 3).then(function(hit){
    ok("  failure -> null", hit === null);
  });
});
async("smartDay treats missing/garbage events as empty", function(){
  return S.smartDay(function(){ return Promise.resolve({foo: 1}); },
                    "football/nfl", 0, 2).then(function(hit){
    ok("  garbage -> null", hit === null);
  });
});

/* fromOffset honored */
async("smartDay scans relative to fromOffset", function(){
  var seen = [];
  return S.smartDay(function(url){ seen.push(url); return Promise.resolve({events:[]}); },
                    "football/nfl", 5, 2).then(function(hit){
    ok("  null", hit === null);
    ok("  2 fetches from offset 6..7",
       seen.length === 2 &&
       seen[0].indexOf("dates=" + ymdOff(6)) !== -1 &&
       seen[1].indexOf("dates=" + ymdOff(7)) !== -1);
  });
});
function ymdOff(off){
  var d = new Date(); d.setDate(d.getDate() + off);
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
}

/* ---------- DOM-level tests: the jump + honest notice ---------- */
function makeEl(id){
  var handlers = {};
  return {
    id: id, innerHTML: "", textContent: "", style: {}, value: "",
    _children: [],
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(){}, removeAttribute: function(){},
    querySelectorAll: function(){ return this._children; },
    getAttribute: function(a){ return a === "data-i" ? "0" : null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {target: this}); }); }
  };
}
function loadSandbox(route){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  var fetchStub = function(url){ return route(url); };
  var sandbox = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl },
    window: {},
    GIU: {
      fetchJSON: fetchStub,
      esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
      failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
    }
  };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  for(var i=0;i<7;i++){
    var b = makeEl("tab-"+i);
    b.getAttribute = function(a){ return a==="data-i" ? "0" : null; };
    getEl("leagueTabs")._children.push(b);
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox, {filename: "js/team-brand.js"});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8"), sandbox, {filename: "js/scores.js"});
  return { sandbox: sandbox, getEl: getEl };
}
function preGame(id){
  return { id: id, date: "2026-10-01T17:00:00Z",
    competitions: [{ status: { type: { state: "pre", shortDetail: "Sun 1:00 PM EDT" } },
      competitors: [
        { homeAway: "away", score: "0", team: { abbreviation: "GB", displayName: "Green Bay Packers" } },
        { homeAway: "home", score: "0", team: { abbreviation: "CHI", displayName: "Chicago Bears" } }
      ],
      broadcasts: [], odds: [], venue: { fullName: "Test Stadium" }, leaders: [] }] };
}
function dayParam(url){ var m = /dates=(\d{8})/.exec(url); return m ? m[1] : ""; }

/* A: dead day-0 board jumps to the next game day with the honest notice */
async("empty NFL day-0 jumps to next game day with notice", function(){
  var want2 = ymdOff(2);
  var boardCalls = 0;
  var sb = loadSandbox(function(url){
    if(url.indexOf("scoreboard") !== -1) boardCalls++;
    return Promise.resolve(dayParam(url) === want2 ? { events: [preGame("g1")] } : { events: [] });
  });
  return new Promise(function(res){ setTimeout(res, 150); }).then(function(){
    var html = sb.getEl("scoreGrid").innerHTML;
    ok("  notice shown", html.indexOf("No NFL games today.") !== -1);
    ok("  notice names the game day honestly",
       html.indexOf("Showing the next game day") !== -1 && html.indexOf("Today</b> button") !== -1);
    ok("  game day label advanced",
       sb.getEl("dayLabel").textContent === new Date(new Date().setDate(new Date().getDate()+2))
         .toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}));
    ok("  cards rendered", html.indexOf("game-card") !== -1);
    ok("  stops at first hit (3 scoreboard fetches)", boardCalls === 3);
  });
});

/* B: nothing within 7 days -> honest empty state, no notice */
async("no games all week: honest empty state, no jump", function(){
  var sb = loadSandbox(function(){ return Promise.resolve({events:[]}); });
  return new Promise(function(res){ setTimeout(res, 200); }).then(function(){
    var html = sb.getEl("scoreGrid").innerHTML;
    ok("  empty state", html.indexOf("No games on") !== -1);
    ok("  no jump notice", html.indexOf("No NFL games today.") === -1);
  });
});

/* C: day-0 fetch fails during scan -> honest empty state, no crash */
async("scan failure -> honest empty state", function(){
  var first = true;
  var sb = loadSandbox(function(){
    if(first){ first = false; return Promise.resolve({events:[]}); }
    return Promise.reject(new Error("down"));
  });
  return new Promise(function(res){ setTimeout(res, 200); }).then(function(){
    var html = sb.getEl("scoreGrid").innerHTML;
    ok("  empty state after failure", html.indexOf("No games on") !== -1);
  });
});

/* D: clicking Today after a jump clears the notice (explicit choice wins) */
async("Today button clears the notice", function(){
  var want2 = ymdOff(2), boardCalls = 0;
  var sb = loadSandbox(function(url){
    if(url.indexOf("scoreboard") !== -1) boardCalls++;
    return Promise.resolve(dayParam(url) === want2 ? { events: [preGame("g1")] } : { events: [] });
  });
  return new Promise(function(res){ setTimeout(res, 150); }).then(function(){
    ok("  notice present before Today", sb.getEl("scoreGrid").innerHTML.indexOf("No NFL games today.") !== -1);
    sb.getEl("todayBtn")._fire("click");
    return new Promise(function(res2){ setTimeout(res2, 80); }).then(function(){
      var html = sb.getEl("scoreGrid").innerHTML;
      ok("  notice cleared after Today", html.indexOf("No NFL games today.") === -1);
      ok("  honest empty today shown", html.indexOf("No games on") !== -1);
      /* no re-scan on explicit Today: only the one day-0 fetch (4 total) */
      ok("  no re-scan fired (4 scoreboard fetches)", boardCalls === 4);
    });
  });
});

/* E: explicit day navigation (->) never triggers the scan */
async("nextDay click does not trigger scan", function(){
  var boardCalls = 0;
  var sb = loadSandbox(function(url){
    if(url.indexOf("scoreboard") !== -1) boardCalls++;
    return Promise.resolve({events:[]});
  });
  return new Promise(function(res){ setTimeout(res, 200); }).then(function(){
    var afterJump = boardCalls; /* day-0 + 7-day scan = 8 */
    sb.getEl("nextDay")._fire("click");
    return new Promise(function(res2){ setTimeout(res2, 60); }).then(function(){
      ok("  scan ran once on load", afterJump === 8);
      ok("  nextDay added exactly one fetch", boardCalls === afterJump + 1);
    });
  });
});
