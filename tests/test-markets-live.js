/* Verifies the live auto-refresh machinery in the SHIPPED js/markets.js
   (v1.21.0 — same contract as scores.js v1.20.0). Stubs the DOM plus
   setInterval/clearInterval, loads the real kalshi-logic.js + markets.js,
   and asserts:
   - a Polymarket view with a likely-live game schedules a 90s refresh tick
     and shows the live status with an "updated" clock; the pause button is
     visible;
   - the tick fires a silent reload (no skeleton shimmer) and skips while
     document.hidden is true;
   - pausing stops the timer and shows the paused state; resuming refreshes
     immediately and reschedules;
   - a view with only future games schedules nothing, hides the pause
     button, and clears the status;
   - the Kalshi tab schedules a 5-minute silent refresh of the snapshot;
   - league/tab switches clear the previous timer (no stacking). */
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
["marketGrid","marketNote","marketTabs","liveStatus","pauseBtn"].forEach(getEl);

function mkMarket(){
  return { closed: false, active: true, sportsMarketType: "moneyline",
    outcomes: '["Team A","Team B"]', outcomePrices: '["0.62","0.38"]',
    question: "Will Team A win?",
    volume: 120000, volume24hr: 9000, bestBid: 0.61, bestAsk: 0.63 };
}
function mkEvent(title, startIso){
  return { title: title, slug: title.toLowerCase().replace(/\s+/g, "-"),
           startTime: startIso, markets: [mkMarket()] };
}
var livePayload = [mkEvent("Team A vs. Team B", new Date(Date.now() - 3600*1000).toISOString())];
var upcomingPayload = [mkEvent("Team C vs. Team D", new Date(Date.now() + 2*86400*1000).toISOString())];
var currentPayload = livePayload;

var kalshiSnapshot = {
  updated_at: new Date().toISOString(),
  games: [{
    event_ticker: "KXNFLGAME-26SEP27AB", title: "Team A vs Team B",
    sub_title: "A vs B (Sep 27)",
    markets: [
      { kind: "winner", team: "Team A", yes_bid: 60, yes_ask: 62, last: 61,
        volume: "1000000", volume_24h: "500000", close_time: new Date(Date.now()+7200*1000).toISOString() },
      { kind: "winner", team: "Team B", yes_bid: 38, yes_ask: 40, last: 39,
        volume: "900000", volume_24h: "400000", close_time: new Date(Date.now()+7200*1000).toISOString() }
    ]
  }]
};

var fetchCalls = 0;
var fetchStub = function(url){
  fetchCalls++;
  if(url.indexOf("events?series_id") !== -1) return Promise.resolve(currentPayload);
  if(url.indexOf("/sports") !== -1) return Promise.resolve([{sport: "nfl", series: "SID1"}]);
  if(url.indexOf("teams.json") !== -1) return Promise.resolve({});
  if(url.indexOf("kalshi-nfl.json") !== -1) return Promise.resolve(kalshiSnapshot);
  return Promise.reject(new Error("unexpected fetch url: " + url));
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
    teamDir: function(){ return Promise.resolve({}); },
    vsHeader: function(){ return ""; },
    esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

/* two tab children so the script's tab wiring runs: Polymarket NFL + Kalshi */
var tab0 = makeEl("tab-0"); tab0.setAttribute("data-i", "0");
var tabK = makeEl("tab-kalshi"); tabK.setAttribute("data-kalshi", "1");
getEl("marketTabs")._children = [tab0, tabK];

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/kalshi-logic.js"), "utf8"), sandbox, {filename: "js/kalshi-logic.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8"), sandbox, {filename: "js/markets.js"});

function settle(fn){ setTimeout(fn, 60); }

settle(function(){
  /* 1. likely-live game present -> 90s timer, live status + updated clock, pause visible */
  assert(intervals.length === 1, "one refresh timer scheduled when a game is likely live, got "+intervals.length);
  assert(intervals[0].ms === 90000, "Polymarket timer interval is 90s, got "+intervals[0].ms);
  var st = getEl("liveStatus").textContent || getEl("liveStatus").innerHTML;
  assert(st.indexOf("live") !== -1, "status shows live state: "+JSON.stringify(st));
  assert(st.indexOf("updated") !== -1, "status shows an updated clock: "+JSON.stringify(st));
  assert(getEl("pauseBtn").style.display !== "none", "pause button visible while live");
  assert(getEl("marketGrid").innerHTML.indexOf("Team A vs") !== -1, "cards render on the Polymarket tab");

  var firstTimerId = intervals[0].id;

  /* 2. the tick does a silent reload: new fetch, no skeleton shimmer, no second timer */
  getEl("marketGrid").innerHTML = "CARDS";
  var before = fetchCalls;
  intervals[0].fn();
  settle(function(){
    assert(fetchCalls > before, "tick re-fetches Polymarket (calls "+before+" -> "+fetchCalls+")");
    assert(getEl("marketGrid").innerHTML.indexOf("skel") === -1, "silent reload shows no skeleton shimmer");
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
    var timersAfterPause = intervals.length;

    /* 5. resume: immediate refresh + timer rescheduled */
    var b3 = fetchCalls;
    getEl("pauseBtn")._fire("click");
    settle(function(){
      assert(fetchCalls > b3, "resume refreshes immediately");
      assert(intervals.length === timersAfterPause + 1, "resume reschedules the timer");
      assert(getEl("pauseBtn").getAttribute("aria-pressed") === "false", "pause button aria-pressed=false when live");

      /* 6. only future games -> no timer, status cleared, pause hidden */
      currentPayload = upcomingPayload;
      tab0._fire("click");
      settle(function(){
        var timersBefore = intervals.length;
        assert(activeTimers().length === 0, "no live timer when nothing is likely live, got "+activeTimers().length);
        assert(getEl("liveStatus").textContent === "" && getEl("liveStatus").innerHTML === "",
               "status cleared when nothing is live");
        assert(getEl("pauseBtn").style.display === "none", "pause button hidden when nothing is live");

        /* 7. Kalshi tab: silent 5-min refresh of the snapshot */
        tabK._fire("click");
        settle(function(){
          assert(intervals.length === timersBefore + 1, "Kalshi tab schedules its refresh timer");
          var ks = getEl("liveStatus").innerHTML;
          assert(intervals[intervals.length-1].ms === 300000,
                 "Kalshi timer interval is 5 min, got "+intervals[intervals.length-1].ms);
          assert(ks.indexOf("1 game on this snapshot") !== -1,
                 "Kalshi status uses correct singular: "+JSON.stringify(ks));
          assert(getEl("marketGrid").innerHTML.indexOf("Kalshi") !== -1, "Kalshi cards render on the Kalshi tab");

          /* silent Kalshi refresh: re-fetches snapshot, no shimmer */
          getEl("marketGrid").innerHTML = "CARDS";
          var bk = fetchCalls;
          intervals[intervals.length-1].fn();
          settle(function(){
            assert(fetchCalls > bk, "Kalshi tick re-fetches the snapshot");
            assert(getEl("marketGrid").innerHTML.indexOf("skel") === -1, "silent Kalshi reload shows no skeleton shimmer");

            if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
            console.log("ALL MARKETS-LIVE TESTS PASS");
          });
        });
      });
    });
  });
});
