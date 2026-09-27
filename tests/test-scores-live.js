/* Verifies the live auto-refresh machinery in the SHIPPED js/scores.js.
   Stubs the DOM plus setInterval/clearInterval, loads the real scores.js,
   and asserts:
   - a view with an in-progress game schedules a 60s refresh tick and shows
     the live status with an "updated" clock; the pause button is visible;
   - the tick fires a silent reload (no skeleton shimmer) and skips while
     document.hidden is true;
   - pausing stops the timer and shows the paused state; resuming refreshes
     immediately and reschedules;
   - a view with no live games schedules nothing, hides the pause button,
     and clears the status;
   - league/day navigation clears the previous timer. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, ".."); /* test the repo this file is checked out in */

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", style: {}, value: "", className: "",
    _text: "",
    _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {target: this}); }, this); }
  };
  /* mirror DOM semantics: setting textContent replaces all children */
  Object.defineProperty(el, "textContent", {
    get: function(){ return this._text; },
    set: function(v){ this._text = String(v); this.innerHTML = ""; },
    enumerable: true, configurable: true
  });
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["scoreGrid","dayLabel","leagueTabs","prevDay","nextDay","todayBtn","liveStatus","pauseBtn"]
  .forEach(getEl);

function team(abbr, name, home, score){
  return { homeAway: home?"home":"away", score: score,
           team: { abbreviation: abbr, displayName: name } };
}
function game(id, state, shortDetail){
  return { id: id, name: "Away at Home", date: "2026-09-27T17:00:00Z",
    competitions: [{
      status: { type: { state: state, shortDetail: shortDetail } },
      competitors: [team("AWY","Away Team",false,"21"), team("HME","Home Team",true,"17")],
      broadcasts: [], odds: [], venue: { fullName: "Test Stadium" }, leaders: []
    }] };
}

var livePayload = { events: [
  game("g1","in","6:54 - 1st"),
  game("g2","post","Final")
]};
var finalsPayload = { events: [
  game("g1","post","Final"),
  game("g2","post","Final")
]};
var currentPayload = livePayload;
var fetchCalls = 0;
var fetchStub = function(){ fetchCalls++; return Promise.resolve(currentPayload); };

var intervals = [], cleared = [], nextId = 1;
function activeTimers(){ return intervals.filter(function(x){ return cleared.indexOf(x.id) === -1; }); }
var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(fn, ms){ var id = nextId++; intervals.push({id: id, fn: fn, ms: ms}); return id; },
  clearInterval: function(id){ cleared.push(id); },
  document: { getElementById: getEl, hidden: false },
  window: {},
  GIU: {
    fetchJSON: fetchStub,
    esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

/* one tab child so the script's tab wiring runs */
var t = makeEl("tab-0");
t.setAttribute("data-i","0");
getEl("leagueTabs")._children = [t];

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox, {filename: "js/team-brand.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8"), sandbox, {filename: "js/scores.js"});

function settle(fn){ setTimeout(fn, 60); }

settle(function(){
  /* 1. live game present -> 60s timer scheduled, status shown, pause visible */
  assert(intervals.length === 1, "one refresh timer scheduled when a game is live, got "+intervals.length);
  assert(intervals[0].ms === 60000, "timer interval is 60s, got "+intervals[0].ms);
  var st = getEl("liveStatus").textContent || getEl("liveStatus").innerHTML;
  assert(st.indexOf("live") !== -1, "status shows live state: "+JSON.stringify(st));
  assert(st.indexOf("updated") !== -1, "status shows an updated clock: "+JSON.stringify(st));
  assert(getEl("pauseBtn").style.display !== "none", "pause button visible while live");

  var firstTimerId = intervals[0].id;

  /* 2. the tick does a silent reload: new fetch, no skeleton shimmer, no second timer */
  getEl("scoreGrid").innerHTML = "CARDS";
  var before = fetchCalls;
  intervals[0].fn();
  settle(function(){
    assert(fetchCalls === before + 1, "tick re-fetches the scoreboard");
    assert(getEl("scoreGrid").innerHTML.indexOf("skel") === -1, "silent reload shows no skeleton shimmer");
    assert(activeTimers().length === 1, "silent reload leaves exactly one active timer, got "+activeTimers().length);
    assert(cleared.indexOf(firstTimerId) !== -1, "silent reload clears the old timer first");

    /* 3. hidden tab: tick skips the fetch */
    sandbox.document.hidden = true;
    var b2 = fetchCalls;
    intervals[0].fn();
    assert(fetchCalls === b2, "tick skips the fetch while the tab is hidden");
    sandbox.document.hidden = false;

    /* 4. pause: timer cleared, paused status, button flips to resume */
    getEl("pauseBtn")._fire("click");
    assert(cleared.indexOf(intervals[0].id) !== -1, "pause clears the live timer");
    var ps = getEl("liveStatus").textContent;
    assert(ps.indexOf("paused") !== -1, "status shows paused state: "+JSON.stringify(ps));
    assert(getEl("pauseBtn").getAttribute("aria-pressed") === "true", "pause button aria-pressed=true when paused");
    var intervalsAfterPause = intervals.length;

    /* 5. resume: immediate refresh + timer rescheduled */
    var b3 = fetchCalls;
    getEl("pauseBtn")._fire("click");
    settle(function(){
      assert(fetchCalls === b3 + 1, "resume refreshes immediately");
      assert(intervals.length === intervalsAfterPause + 1, "resume reschedules the timer");
      assert(getEl("pauseBtn").getAttribute("aria-pressed") === "false", "pause button aria-pressed=false when live");

      /* 6. no live games -> no timer, status cleared, pause hidden */
      currentPayload = finalsPayload;
      getEl("prevDay")._fire("click");
      settle(function(){
        assert(intervals.length === intervalsAfterPause + 1, "no new timer when nothing is live");
        assert(getEl("liveStatus").textContent === "" && getEl("liveStatus").innerHTML === "",
               "status cleared when nothing is live");
        assert(getEl("pauseBtn").style.display === "none", "pause button hidden when nothing is live");
        assert(cleared.length >= 2, "day navigation clears the previous live timer");

        if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
        console.log("ALL SCORES-LIVE TESTS PASS");
      });
    });
  });
});
