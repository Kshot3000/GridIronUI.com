/* Verifies the live auto-refresh machinery in the SHIPPED js/news.js.
   Stubs the DOM plus setInterval/clearInterval, loads the real news.js,
   and asserts:
   - the initial load schedules a 3-minute refresh tick, shows the live
     status ("auto-refresh every 3 min" + "updated" clock), and shows the
     pause button;
   - the tick fires a silent reload (no skeleton shimmer), never stacks
     timers, and skips while document.hidden is true;
   - pausing clears the timer and shows the paused state (aria-pressed=true);
     resuming refreshes immediately and reschedules (aria-pressed=false);
   - a league tab switch clears the previous timer, and a slow earlier-tab
     response released after a switch never overwrites the newer tab
     (tabSeq generation guard). */
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
  /* minimal classList stub (add/remove/toggle/contains) */
  (function(){
    var s = {};
    el.classList = {
      add: function(c){ s[c]=1; },
      remove: function(c){ delete s[c]; },
      toggle: function(c){ if(s[c]) delete s[c]; else s[c]=1; },
      contains: function(c){ return !!s[c]; }
    };
  })();
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
["newsGrid","newsTabs","liveStatus","pauseBtn"].forEach(getEl);

function payload(league, headline){
  return { articles: [
    { headline: headline, description: "A "+league+" story.",
      published: new Date(Date.now()-30*60000).toISOString(),
      images: [], links: { web: { href: "https://example.com/x" } } }
  ] };
}

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
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

/* two tab children so the script's tab wiring runs */
var t0 = makeEl("tab-0"); t0.setAttribute("data-i","0");
var t1 = makeEl("tab-1"); t1.setAttribute("data-i","1");
getEl("newsTabs")._children = [t0, t1];

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/news.js"), "utf8"), sandbox, {filename: "js/news.js"});

function settle(fn){ setTimeout(fn, 60); }
function resolveFetch(i, data){ deferreds[i].resolve(data); }

/* the initial load() ran at script eval: resolve its fetch (NFL) */
resolveFetch(0, payload("NFL","NFL story 1"));

settle(function(){
  /* 1. initial load -> 3-minute timer, status + updated clock, pause visible */
  assert(intervals.length === 1, "one refresh timer scheduled on load, got "+intervals.length);
  assert(intervals[0].ms === 180000, "timer interval is 3 minutes (180000ms), got "+intervals[0].ms);
  var st = getEl("liveStatus").textContent || getEl("liveStatus").innerHTML;
  assert(st.indexOf("auto-refresh every 3 min") !== -1, "status shows the 3-min cadence: "+JSON.stringify(st));
  assert(st.indexOf("updated") !== -1, "status shows an updated clock: "+JSON.stringify(st));
  assert(getEl("pauseBtn").style.display !== "none", "pause button visible while live");
  assert(getEl("newsGrid").innerHTML.indexOf("NFL story 1") !== -1, "initial headlines rendered");

  var firstTimerId = intervals[0].id;

  /* 2. the tick does a silent reload: new fetch, no shimmer, no stacking */
  getEl("newsGrid").innerHTML = "CARDS";
  var before = fetchCalls;
  intervals[0].fn();
  resolveFetch(1, payload("NFL","NFL story 2"));
  settle(function(){
    assert(fetchCalls === before + 1, "tick re-fetches the news feed");
    assert(getEl("newsGrid").innerHTML.indexOf("skel") === -1, "silent reload shows no skeleton shimmer");
    assert(activeTimers().length === 1, "silent reload leaves exactly one active timer, got "+activeTimers().length);
    assert(cleared.indexOf(firstTimerId) !== -1, "silent reload clears the old timer first");

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
    var ps = getEl("liveStatus").textContent;
    assert(ps.indexOf("paused") !== -1, "status shows paused state: "+JSON.stringify(ps));
    assert(getEl("pauseBtn").getAttribute("aria-pressed") === "true", "pause button aria-pressed=true when paused");
    var intervalsAfterPause = intervals.length;

    /* 5. resume: immediate refresh + timer rescheduled */
    var b3 = fetchCalls;
    getEl("pauseBtn")._fire("click");
    resolveFetch(deferreds.length-1, payload("NFL","NFL story 3"));
    settle(function(){
      assert(fetchCalls === b3 + 1, "resume refreshes immediately");
      assert(intervals.length === intervalsAfterPause + 1, "resume reschedules the timer");
      assert(getEl("pauseBtn").getAttribute("aria-pressed") === "false", "pause button aria-pressed=false when live");

      /* 6. generation guard: a slow earlier-tab response never overwrites
         the newer tab. Switch to NBA (fetch pending), then back to NFL
         (fetch pending), resolve NFL first, then the stale NBA response. */
      var timersBefore = activeTimers().length;
      t1._fire("click");                       /* -> NBA, fetch N pending */
      var nbaFetch = deferreds.length - 1;
      t0._fire("click");                       /* -> NFL, fetch N+1 pending */
      var nflFetch = deferreds.length - 1;
      assert(cleared.length >= 2, "tab switches clear the previous live timers");
      resolveFetch(nflFetch, payload("NFL","NFL story latest"));
      settle(function(){
        assert(getEl("newsGrid").innerHTML.indexOf("NFL story latest") !== -1,
               "newest tab's response renders");
        resolveFetch(nbaFetch, payload("NBA","NBA stale story"));
        settle(function(){
          var html = getEl("newsGrid").innerHTML;
          assert(html.indexOf("NBA stale story") === -1,
                 "stale earlier-tab response discarded: "+JSON.stringify(html.slice(0,120)));
          assert(html.indexOf("NFL story latest") !== -1,
                 "newest tab's content survives the stale response");
          assert(activeTimers().length === timersBefore,
                 "tab switches leave the same single active timer, got "+activeTimers().length);

          if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
          console.log("ALL NEWS-LIVE TESTS PASS");
        });
      });
    });
  });
});
