/* Verifies the quota-smart live refresh + race guard in the SHIPPED js/odds.js.
   Stubs the DOM plus setInterval/clearInterval, loads the real odds-logic.js
   and odds.js, and asserts:
   - the initial load renders loud (spinner) while the fetch is pending;
   - checking auto-refresh schedules ONE 5-minute tick and pulls immediately,
     with no board flash (silent re-render, no spinner shimmer);
   - the tick re-fetches while games are near and shows the updated clock;
   - the quota gate: when no game is in progress or near kickoff, the tick
     does NOT burn an API request and the status line says the quota is
     untouched; the tick also skips while the tab is hidden;
   - unchecking clears the timer; re-checking never stacks timers;
   - render-generation guard: a slow earlier-sport response released after a
     sport switch never overwrites the newer sport's board;
   - a failed silent re-pull keeps the last good board and says when its
     lines are from (never wipes the board the visitor is reading);
   - GIU.oddsNearWindow pure logic: in-progress / near-kickoff windows. */
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
    id: id, innerHTML: "", style: {}, value: "", className: "", checked: false,
    _text: "",
    _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {}); }, this); }
  };
  (function(){
    var s = {};
    el.classList = {
      add: function(c){ s[c]=1; },
      remove: function(c){ delete s[c]; },
      toggle: function(c, force){
        var v = force !== undefined ? !!force : !s[c];
        if(v) s[c]=1; else delete s[c];
        return v;
      },
      contains: function(c){ return !!s[c]; }
    };
  })();
  /* mirror DOM semantics both ways: setting textContent replaces children,
     and setting innerHTML clears textContent */
  var _html = "";
  Object.defineProperty(el, "innerHTML", {
    get: function(){ return _html; },
    set: function(v){ _html = String(v); this._text = ""; },
    enumerable: true, configurable: true
  });
  Object.defineProperty(el, "textContent", {
    get: function(){ return this._text !== "" ? this._text : _html.replace(/<[^>]*>/g,""); },
    set: function(v){ this._text = String(v); _html = ""; },
    enumerable: true, configurable: true
  });
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
 "refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount"].forEach(getEl);

var store = { "giu_odds_key": "TESTKEY" };
var localStorageStub = {
  getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v){ store[k] = String(v); },
  removeItem: function(k){ delete store[k]; }
};

/* fixture: one game with a full bookmaker row */
function bkFixture(){
  return { key:"draftkings", title:"DraftKings", markets:[
    {key:"spreads", outcomes:[
      {name:"Kansas City Chiefs", price:1.91, point:-6.5},
      {name:"Las Vegas Raiders", price:1.91, point:6.5}]},
    {key:"totals", outcomes:[
      {name:"Over", price:1.91, point:47.5},
      {name:"Under", price:1.91, point:47.5}]},
    {key:"h2h", outcomes:[
      {name:"Kansas City Chiefs", price:1.40},
      {name:"Las Vegas Raiders", price:2.90}]}
  ]};
}
function evFixture(home, commenceISO){
  return { id:"ev-"+home, home_team:home, away_team:"Kansas City Chiefs",
           commence_time:commenceISO, bookmakers:[bkFixture()] };
}
function apiResponse(events){
  return {
    status: 200, ok: true,
    headers: { get: function(){ return "499"; } },
    json: function(){ return Promise.resolve(events); }
  };
}

/* controllable fetch: every call returns a promise we resolve by hand */
var deferreds = [], fetchCalls = 0;
var fetchStub = function(){
  fetchCalls++;
  var rec = {};
  rec.promise = new Promise(function(res){ rec.resolve = res; });
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
  document: { getElementById: getEl, hidden: false,
              querySelectorAll: function(){ return []; } },
  fetch: fetchStub,
  localStorage: localStorageStub,
  window: {},
  alert: function(){},
  GIU: {
    teamDir: function(){ return Promise.resolve({}); },
    vsHeader: function(){ return ""; },
    teamFind: function(){ return null; },
    teamLogo: function(){ return ""; },
    teamChip: function(){ return ""; },
    esc: function(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  },
  OddsSlip: {
    has: function(){ return false; }, toggle: function(){ return true; },
    reprice: function(){},
    payout: function(){ return {combinedAm:"+100", combined:2.0, profit:100, total:200}; },
    remove: function(){}, clear: function(){},
    normalize: function(legs){ return legs; },
    valueSummary: function(){ return null; }
  }
};
sandbox.window.GIU = sandbox.GIU;
sandbox.window.OddsSlip = sandbox.OddsSlip;
vm.createContext(sandbox);

/* two sport tabs so the script's tab wiring runs */
var tabNFL = makeEl("tab-nfl"); tabNFL.setAttribute("data-sport","americanfootball_nfl");
var tabNBA = makeEl("tab-nba"); tabNBA.setAttribute("data-sport","basketball_nba");
getEl("sportTabs")._children = [tabNFL, tabNBA];

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds-logic.js"), "utf8"),
                sandbox, {filename: "js/odds-logic.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds.js"), "utf8"),
                sandbox, {filename: "js/odds.js"});

function settle(fn){ setTimeout(fn, 80); }
var nowISO = function(h){ return new Date(Date.now()+h*3600*1000).toISOString(); };
var nearNFL = [evFixture("NFL Home Team", nowISO(2))];   /* kickoff in 2h: near */
var nearNBA = [evFixture("NBA Home Team", nowISO(3))];
var farNFL  = [evFixture("NFL Home Team", nowISO(72))];  /* 3 days out: not near */

settle(function(){
  /* 1. initial load with a key: loud render (spinner) while fetching */
  assert(fetchCalls === 1, "initial load fires one odds API fetch, got "+fetchCalls);
  assert(getEl("oddsBoard").innerHTML.indexOf("spinner") !== -1,
         "initial render shows the spinner while fetching");

  sandbox.window.GIU && deferreds[0].resolve(apiResponse(nearNFL));
  settle(function(){
    assert(getEl("oddsBoard").innerHTML.indexOf("NFL Home Team") !== -1,
           "board renders the fetched game");
    assert(getEl("quota").textContent.indexOf("499") !== -1,
           "quota line shows x-requests-remaining: "+getEl("quota").textContent);
    assert(getEl("oddsStatus").textContent === "",
           "status line empty while auto-refresh is off");

    /* 2. pure window logic, exported on GIU */
    var nw = sandbox.window.GIU.oddsNearWindow;
    assert(nw([evFixture("X", nowISO(2))]) === true, "kickoff in 2h is near");
    assert(nw([evFixture("X", nowISO(-2))]) === true, "started 2h ago (likely live) is near");
    assert(nw([evFixture("X", nowISO(-6))]) === false, "started 6h ago is not near");
    assert(nw([evFixture("X", nowISO(72))]) === false, "kickoff in 3 days is not near");
    assert(nw([evFixture("X", "not-a-date")]) === false, "bad commence_time is not near");
    assert(nw([]) === false, "no events is not near");

    /* 3. check auto-refresh: one 5-min timer, immediate silent pull */
    getEl("autoRef").checked = true;
    getEl("autoRef")._fire("change");
    assert(intervals.length === 1 && intervals[0].ms === 300000,
           "one 5-minute tick scheduled, got "+JSON.stringify(intervals.map(function(i){return i.ms;})));
    var f = fetchCalls;
    assert(f === 2, "checking auto-refresh pulls immediately, fetchCalls="+f);
    var tick = intervals[0];
    assert(getEl("oddsBoard").innerHTML.indexOf("spinner") === -1,
           "silent pull shows no spinner shimmer");
    assert(getEl("oddsBoard").innerHTML.indexOf("NFL Home Team") !== -1,
           "silent pull keeps the old board visible while fetching");
    assert(getEl("oddsStatus").textContent.indexOf("Updating lines") !== -1,
           "status says Updating lines… during the silent pull: "+JSON.stringify(getEl("oddsStatus").textContent));

    deferreds[1].resolve(apiResponse(nearNFL));
    settle(function(){
      var st = getEl("oddsStatus").textContent || getEl("oddsStatus").innerHTML;
      assert(st.indexOf("re-pulling lines every 5 min") !== -1,
             "status shows the live cadence when games are near: "+JSON.stringify(st));
      assert(st.indexOf("updated") !== -1, "status shows an updated clock: "+JSON.stringify(st));

      /* 4. tick with near games re-fetches; far games gate the quota */
      var b = fetchCalls;
      tick.fn();
      assert(fetchCalls === b + 1, "tick re-fetches while games are near");
      deferreds[2].resolve(apiResponse(farNFL));
      settle(function(){
        var st2 = getEl("oddsStatus").textContent;
        assert(st2.indexOf("quota") !== -1,
               "status says the quota is untouched when no game is near: "+JSON.stringify(st2));
        var b2 = fetchCalls;
        tick.fn();
        assert(fetchCalls === b2, "tick does NOT burn an API request when no game is near");

        /* 5. hidden tab: tick skips even when games are near.
           Flip the sport back to near first via a manual refresh. */
        getEl("refreshBtn")._fire("click");
        assert(fetchCalls === b2 + 1, "manual refresh always fetches");
        deferreds[deferreds.length-1].resolve(apiResponse(nearNFL));
        settle(function(){
          var b3 = fetchCalls;
          sandbox.document.hidden = true;
          tick.fn();
          assert(fetchCalls === b3, "tick skips the fetch while the tab is hidden");
          sandbox.document.hidden = false;

          /* 6. uncheck: timer cleared, status cleared; re-check: no stacking */
          var tid = tick.id;
          getEl("autoRef").checked = false;
          getEl("autoRef")._fire("change");
          assert(cleared.indexOf(tid) !== -1, "unchecking clears the live timer");
          assert(getEl("oddsStatus").textContent === "", "status cleared when auto-refresh is off");
          getEl("autoRef").checked = true;
          getEl("autoRef")._fire("change");
          assert(activeTimers().length === 1,
                 "re-checking leaves exactly one active timer, got "+activeTimers().length);

          /* 7. generation guard: slow earlier-sport response never overwrites
             the newer sport's board. */
          getEl("autoRef").checked = false;   /* keep the tick out of the way */
          getEl("autoRef")._fire("change");
          tabNBA._fire("click");               /* -> NBA, fetch pending */
          var nbaIdx = deferreds.length - 1;
          tabNFL._fire("click");               /* -> NFL, fetch pending */
          var nflIdx = deferreds.length - 1;
          deferreds[nflIdx].resolve(apiResponse(nearNFL));
          settle(function(){
            assert(getEl("oddsBoard").innerHTML.indexOf("NFL Home Team") !== -1,
                   "newest sport's response renders");
            deferreds[nbaIdx].resolve(apiResponse(nearNBA));
            settle(function(){
              var html = getEl("oddsBoard").innerHTML;
              assert(html.indexOf("NBA Home Team") === -1,
                     "stale earlier-sport response discarded");
              assert(html.indexOf("NFL Home Team") !== -1,
                     "newest sport's content survives the stale response");

              /* 8. failed silent re-pull keeps the last good board */
              getEl("refreshBtn")._fire("click");
              var failIdx = deferreds.length - 1;
              assert(getEl("oddsBoard").innerHTML.indexOf("spinner") === -1,
                     "manual refresh is silent once a board is showing");
              deferreds[failIdx].resolve(Promise.reject(new Error("HTTP 500")));
              settle(function(){
                var html2 = getEl("oddsBoard").innerHTML;
                assert(html2.indexOf("NFL Home Team") !== -1,
                       "failed silent re-pull keeps the last good board");
                var st3 = getEl("oddsStatus").textContent;
                assert(st3.indexOf("still showing lines from") !== -1,
                       "status says when the shown lines are from: "+JSON.stringify(st3));

                if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
                console.log("ALL ODDS-LIVE TESTS PASS");
              });
            });
          });
        });
      });
    });
  });
});
