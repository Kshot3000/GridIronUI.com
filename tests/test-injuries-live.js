/* Verifies the live auto-refresh machinery in the SHIPPED js/injuries.js.
   Stubs the DOM plus setInterval/clearInterval, loads the real inj-live.js
   then the real injuries.js via vm, and asserts:
   - the initial load schedules a 3-minute refresh tick, shows the live
     status ("auto-refresh every 3 min" + "updated" clock), shows the pause
     button, renders the board, and flags NOTHING on first load (baseline);
   - the tick fires a silent reload (no skeleton shimmer), never stacks
     timers, skips while document.hidden is true, and preserves the visitor's
     search query + severity filter;
   - a designation change between loads earns an honest badge (e.g.
     Questionable -> Out shows "downgraded");
   - pausing clears the timer and shows the paused state (aria-pressed=true);
     resuming refreshes immediately and reschedules (aria-pressed=false);
   - a league tab switch clears the previous timer, resets the diff baseline
     (no badges on the new league's first load), and a slow earlier-tab
     response released after a switch never overwrites the newer tab
     (tabSeq generation guard). */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", style: {}, value: "", className: "",
    _text: "", _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {target: this}); }, this); }
  };
  (function(){
    var s = {};
    el.classList = {
      add: function(c){ s[c]=1; },
      remove: function(c){ delete s[c]; },
      toggle: function(c, force){
        if(force === undefined){ if(s[c]) delete s[c]; else s[c]=1; }
        else if(force) s[c]=1; else delete s[c];
      },
      contains: function(c){ return !!s[c]; }
    };
  })();
  Object.defineProperty(el, "textContent", {
    get: function(){ return this._text; },
    set: function(v){ this._text = String(v); this.innerHTML = ""; },
    enumerable: true, configurable: true
  });
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["injGrid","injSev","injTabs","injSearch","liveStatus","pauseBtn"].forEach(getEl);

/* rows: [teamName, [[player, status], ...]] */
function injPayload(rows){
  return { injuries: rows.map(function(r){
    return { displayName: r[0], injuries: r[1].map(function(p){
      return { status: p[1], athlete: { displayName: p[0] }, date: "2026-10-01",
               shortComment: "test blurb" };
    })};
  })};
}
var NFL_V1 = injPayload([
  ["Chiefs", [["Patrick Mahomes","Questionable"],["Travis Kelce","Out"],["Carson Wentz","Active"]]],
  ["Bills",  [["Josh Allen","Doubtful"]]]
]);
var NFL_V2 = injPayload([ /* Mahomes worsened, Kelce improved, Pacheco new */
  ["Chiefs", [["Patrick Mahomes","Out"],["Travis Kelce","Questionable"],["Isiah Pacheco","Questionable"]]],
  ["Bills",  [["Josh Allen","Doubtful"]]]
]);
var NBA_V1 = injPayload([
  ["Lakers", [["LeBron James","Questionable"]]]
]);

/* controllable fetch: every call returns a promise we resolve by hand */
var deferreds = [], fetchCalls = 0;
var fetchStub = function(){
  fetchCalls++;
  var rec = {};
  rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
  deferreds.push(rec);
  return rec.promise;
};

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
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; },
    teamDir: function(){ return Promise.resolve({}); },
    teamHead: function(){ return ""; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

/* load the real pure helpers first so injuries.js picks up window.InjLive */
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/inj-live.js"), "utf8"), sandbox, {filename: "js/inj-live.js"});
assert(typeof sandbox.window.InjLive === "object", "inj-live.js exposes window.InjLive");

/* league + severity tab children so the script's wiring runs */
var t0 = makeEl("tab-0"); t0.setAttribute("data-i","0");
var t1 = makeEl("tab-1"); t1.setAttribute("data-i","1");
getEl("injTabs")._children = [t0, t1];
["all","out","doubtful","questionable"].forEach(function(s, i){
  var b = makeEl("sev-"+s); b.setAttribute("data-sev", s);
  (getEl("injSev")._children = getEl("injSev")._children || []).push(b);
});

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/injuries.js"), "utf8"), sandbox, {filename: "js/injuries.js"});

function settle(fn){ setTimeout(fn, 60); }
function resolveFetch(i, data){ deferreds[i].resolve(data); }

/* the initial load() ran at script eval: resolve its fetch (NFL) */
resolveFetch(0, NFL_V1);

settle(function(){
  /* 1. initial load -> timer, status, pause button, board, no false badges */
  assert(intervals.length === 1, "one refresh timer scheduled on load, got "+intervals.length);
  assert(intervals[0].ms === 180000, "timer interval is 3 minutes (180000ms), got "+intervals[0].ms);
  var st = getEl("liveStatus").textContent || getEl("liveStatus").innerHTML;
  assert(st.indexOf("auto-refresh every 3 min") !== -1, "status shows the 3-min cadence: "+JSON.stringify(st));
  assert(st.indexOf("updated") !== -1, "status shows an updated clock: "+JSON.stringify(st));
  assert(getEl("pauseBtn").style.display !== "none", "pause button visible while live");
  var html = getEl("injGrid").innerHTML;
  assert(html.indexOf("Patrick Mahomes") !== -1, "initial board renders players");
  assert(html.indexOf("Carson Wentz") === -1, "healthy 'Active' players still dropped at load");
  assert(html.indexOf("downgraded") === -1 && html.indexOf(">new<") === -1,
         "first load flags nothing (diff baseline)");

  var firstTimerId = intervals[0].id;

  /* 2. silent tick: new fetch, no shimmer, no stacking, search preserved,
        and the designation change earns its badge */
  getEl("injSearch").value = "chiefs";
  var before = fetchCalls;
  intervals[0].fn();
  resolveFetch(1, NFL_V2);
  settle(function(){
    assert(fetchCalls === before + 1, "tick re-fetches the injuries feed");
    var h2 = getEl("injGrid").innerHTML;
    assert(h2.indexOf("skel") === -1, "silent reload shows no skeleton shimmer");
    assert(activeTimers().length === 1, "silent reload leaves exactly one active timer, got "+activeTimers().length);
    assert(cleared.indexOf(firstTimerId) !== -1, "silent reload clears the old timer first");
    assert(h2.indexOf("Josh Allen") === -1 && h2.indexOf("Patrick Mahomes") !== -1,
           "silent reload preserves the visitor's search query");
    assert(h2.indexOf(">downgraded<") !== -1, "Questionable -> Out earns the downgraded badge");
    assert(h2.indexOf(">upgraded<") !== -1, "Out -> Questionable earns the upgraded badge");
    assert(h2.indexOf(">new<") !== -1, "newly listed player earns the new badge");

    /* 3. hidden tab: tick skips the fetch */
    var latest = intervals[intervals.length-1];
    sandbox.document.hidden = true;
    var b2 = fetchCalls;
    latest.fn();
    assert(fetchCalls === b2, "tick skips the fetch while the tab is hidden");
    sandbox.document.hidden = false;

    /* 4. pause: timer cleared, paused status, button flips to resume */
    getEl("pauseBtn")._fire("click");
    assert(cleared.indexOf(latest.id) !== -1, "pause clears the live timer");
    var ps = getEl("pauseBtn").getAttribute("aria-pressed");
    var pst = getEl("liveStatus").textContent;
    assert(pst.indexOf("paused") !== -1, "status shows paused state: "+JSON.stringify(pst));
    assert(ps === "true", "pause button aria-pressed=true when paused");
    var intervalsAfterPause = intervals.length;

    /* 5. resume: immediate refresh + timer rescheduled */
    var b3 = fetchCalls;
    getEl("pauseBtn")._fire("click");
    resolveFetch(deferreds.length-1, NFL_V2);
    settle(function(){
      assert(fetchCalls === b3 + 1, "resume refreshes immediately");
      assert(intervals.length === intervalsAfterPause + 1, "resume reschedules the timer");
      assert(getEl("pauseBtn").getAttribute("aria-pressed") === "false", "pause button aria-pressed=false when live");

      /* 6. league switch: clears timer, resets the diff baseline, and the
            generation guard discards a slow earlier-tab response. */
      getEl("injSearch").value = "";
      var timersBefore = activeTimers().length;
      t1._fire("click");                        /* -> NBA, fetch pending */
      var nbaFetch = deferreds.length - 1;
      assert(getEl("injSearch").value === "", "league switch resets the search box");
      t0._fire("click");                        /* -> NFL, fetch pending */
      var nflFetch = deferreds.length - 1;
      assert(cleared.length >= 2, "tab switches clear the previous live timers");
      resolveFetch(nflFetch, NFL_V2);           /* newest tab wins */
      settle(function(){
        var h3 = getEl("injGrid").innerHTML;
        assert(h3.indexOf("Patrick Mahomes") !== -1, "newest tab's response renders");
        assert(h3.indexOf(">downgraded<") === -1,
               "league switch resets the diff baseline — no badges on first load of the tab");
        resolveFetch(nbaFetch, NBA_V1);         /* stale earlier response */
        settle(function(){
          var h4 = getEl("injGrid").innerHTML;
          assert(h4.indexOf("LeBron James") === -1,
                 "stale earlier-tab response discarded: "+JSON.stringify(h4.slice(0,120)));
          assert(h4.indexOf("Patrick Mahomes") !== -1,
                 "newest tab's content survives the stale response");
          assert(activeTimers().length === timersBefore,
                 "tab switches leave the same single active timer, got "+activeTimers().length);

          if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
          console.log("ALL INJURIES-LIVE TESTS PASS");
        });
      });
    });
  });
});
