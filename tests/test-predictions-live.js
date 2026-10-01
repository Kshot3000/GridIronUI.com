/* Verifies the live auto-refresh machinery in the SHIPPED js/predictions.js
   (v1.22.0 — same contract as markets.js v1.21.0). Stubs the DOM plus
   setInterval/clearInterval, loads the real predictions.js, and asserts:
   - the render-generation guard: a slow first-tab response cannot overwrite
     a tab the user switched to meanwhile;
   - a view with a likely-live game schedules a 90s refresh tick and shows
     the live status with an "updated" clock; the pause button is visible;
   - the tick fires a silent reload (no skeleton shimmer) and skips while
     document.hidden is true;
   - pausing stops the timer and shows the paused state; resuming refreshes
     immediately and reschedules;
   - a view with only future games schedules nothing, hides the pause
     button, and clears the status;
   - switching tabs clears the previous timer (no stacking). */
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
    classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
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
["predGrid","predTabs","liveStatus","pauseBtn"].forEach(getEl);

function mkMarket(){
  return { closed: false, active: true, sportsMarketType: "moneyline",
    outcomes: '["Team A","Team B"]', outcomePrices: '["0.62","0.38"]',
    question: "Will Team A win?", oneWeekPriceChange: "0.02" };
}
function mkEvent(title, startIso){
  return { title: title, slug: title.toLowerCase().replace(/\s+/g, "-"),
           startTime: startIso, markets: [mkMarket()] };
}
var nflLive = [mkEvent("Team A vs. Team B", new Date(Date.now() - 3600*1000).toISOString())];
var nbaUpcoming = [mkEvent("Team E vs. Team F", new Date(Date.now() + 2*86400*1000).toISOString())];
/* the NFL events call hangs until the test releases it, so the test can
   switch tabs first and prove the stale response lands nowhere */
var releaseNfl = null, nflDeferred = true;
var fetchCalls = 0;
var fetchStub = function(url){
  fetchCalls++;
  if(url.indexOf("/sports") !== -1)
    return Promise.resolve([{sport:"nfl", series:"SID1"},{sport:"nba", series:"SID2"}]);
  if(url.indexOf("series_id=SID1") !== -1){
    if(nflDeferred) return new Promise(function(res){ releaseNfl = res; });
    return Promise.resolve(nflLive);
  }
  if(url.indexOf("series_id=SID2") !== -1) return Promise.resolve(nbaUpcoming);
  if(url.indexOf("teams.json") !== -1) return Promise.resolve({});
  return Promise.reject(new Error("unexpected fetch url: "+url));
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
    pmEventsUrl: function(sid, limit){ return "https://gamma-api.polymarket.com/events?series_id="+encodeURIComponent(sid)+"&active=true&closed=false&limit="+(limit||30)+"&order=startTime&ascending=true"; },
    teamDir: function(){ return Promise.resolve({}); },
    vsHeader: function(){ return ""; },
    esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

var tabNfl = makeEl("tab-nfl"); tabNfl.setAttribute("data-k", "nfl");
var tabNba = makeEl("tab-nba"); tabNba.setAttribute("data-k", "nba");
getEl("predTabs")._children = [tabNfl, tabNba];

/* v1.125.0: the spotlight countdown reuses home-strip's kickoffIn, so the
   real home-strip.js loads here too — the sandbox then exercises the true
   countdown path, not the degraded one. */
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/home-strip.js"), "utf8"), sandbox, {filename: "js/home-strip.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/predictions.js"), "utf8"), sandbox, {filename: "js/predictions.js"});

function settle(fn){ setTimeout(fn, 60); }

settle(function(){
  /* 1. generation guard: the NFL response is still hanging when the user
     switches to NBA — NFL's cards must never land on the NBA tab. */
  assert(getEl("predGrid").innerHTML.indexOf("skel") !== -1, "NFL cards still pending: skeleton showing");
  tabNba._fire("click");
  settle(function(){
    /* v1.125.0: the tab's single future game is featured in the #predSpot
       spotlight (countdown ticking), not in the grid — the generation guard
       is about the response landing on the right tab, not which slot. */
    assert(getEl("predSpot").innerHTML.indexOf("Team E vs. Team F") !== -1,
           "NBA tab renders its own cards (in the next-game spotlight)");
    releaseNfl(nflLive);
    settle(function(){
      assert(getEl("predSpot").innerHTML.indexOf("Team E vs. Team F") !== -1,
             "stale NFL response does not overwrite the NBA tab");
      var at = activeTimers();
      assert(at.length === 1 && at[0].ms === 60000,
             "only the 60s spotlight countdown ticks when nothing is live, got "+JSON.stringify(at.map(function(t){return t.ms;})));
      assert(getEl("liveStatus").textContent === "" && getEl("liveStatus").innerHTML === "",
             "status cleared when nothing is live");
      assert(getEl("pauseBtn").style.display === "none", "pause button hidden when nothing is live");

      /* 2. back to NFL (live game present) -> 90s timer, live status, pause visible */
      nflDeferred = false;
      tabNfl._fire("click");
      settle(function(){
        /* v1.125.0: the 60s spotlight countdown coexists with the 90s live
           refresh — select the live timer by interval, not position. */
        function liveT(){ var a = activeTimers().filter(function(t){ return t.ms === 90000; }); return a[0] || null; }
        var lt = liveT();
        assert(!!lt, "a 90s refresh timer is scheduled when a game is likely live");
        var st = getEl("liveStatus").innerHTML;
        assert(st.indexOf("live") !== -1, "status shows live state: "+JSON.stringify(st));
        assert(st.indexOf("updated") !== -1, "status shows an updated clock: "+JSON.stringify(st));
        assert(getEl("pauseBtn").style.display !== "none", "pause button visible while live");
        var firstTimerId = lt.id;

        /* 3. the tick does a silent reload: new fetch, no shimmer, old timer cleared */
        getEl("predGrid").innerHTML = "CARDS";
        var before = fetchCalls;
        lt.fn();
        settle(function(){
          assert(fetchCalls > before, "tick re-fetches Polymarket (calls "+before+" -> "+fetchCalls+")");
          assert(getEl("predGrid").innerHTML.indexOf("skel") === -1, "silent reload shows no skeleton shimmer");
          var lt2 = liveT();
          assert(!!lt2, "silent reload reschedules the live timer");
          assert(cleared.indexOf(firstTimerId) !== -1, "silent reload clears the old timer first");

          /* 4. hidden tab: tick skips the fetch */
          sandbox.document.hidden = true;
          var b2 = fetchCalls;
          lt2.fn();
          assert(fetchCalls === b2, "tick skips the fetch while the tab is hidden");
          sandbox.document.hidden = false;

          /* 5. pause: timer cleared, paused status, button flips to resume */
          getEl("pauseBtn")._fire("click");
          assert(cleared.indexOf(lt2.id) !== -1, "pause clears the live timer");
          var ps = getEl("liveStatus").textContent;
          assert(ps.indexOf("paused") !== -1, "status shows paused state: "+JSON.stringify(ps));
          assert(getEl("pauseBtn").getAttribute("aria-pressed") === "true", "pause button aria-pressed=true when paused");
          var timersAfterPause = intervals.length;

          /* 6. resume: immediate refresh + timer rescheduled */
          var b3 = fetchCalls;
          getEl("pauseBtn")._fire("click");
          settle(function(){
            assert(fetchCalls > b3, "resume refreshes immediately");
            assert(intervals.length === timersAfterPause + 1, "resume reschedules the timer");
            assert(getEl("pauseBtn").getAttribute("aria-pressed") === "false", "pause button aria-pressed=false when live");

            /* 7. switch to NBA (future games) -> the 90s live timer is cleared
               and the 60s spotlight countdown is scheduled instead */
            tabNba._fire("click");
            settle(function(){
              assert(cleared.indexOf(firstTimerId) !== -1, "tab switch clears the live timer");
              var at7 = activeTimers();
              assert(at7.length === 1 && at7[0].ms === 60000,
                     "tab switch leaves only the spotlight countdown, got "+JSON.stringify(at7.map(function(t){return t.ms;})));
              assert(getEl("liveStatus").textContent === "" && getEl("liveStatus").innerHTML === "",
                     "status cleared after switching away from live games");
              assert(getEl("pauseBtn").style.display === "none", "pause button hidden when nothing is live");

              if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
              console.log("ALL PREDICTIONS-LIVE TESTS PASS");
            });
          });
        });
      });
    });
  });
});
