/* GridIronUI Kalshi tab "Show all N games" toggle (shipped v1.116.0).
   The Kalshi snapshot often lists far more games than fit comfortably above
   the fold (31 NFL games = two game weeks); the tab renders the first page
   of cards and offers the rest behind an honest per-league "Show all N
   games" toggle. This test stubs the DOM plus setInterval/clearInterval,
   loads the real kalshi-logic.js + markets.js, and asserts:
   - with a 14-game snapshot the Kalshi tab renders exactly 12 cards and a
     "Show all 14 games" button (aria-expanded=false);
   - clicking the toggle re-renders all 14 cards and flips the label to
     "Show fewer games" (aria-expanded=true);
   - a silent 5-minute refresh preserves the expanded state (still 14);
   - clicking again collapses back to 12;
   - with a 10-game snapshot no toggle is rendered at all.
   Run: node tests/test-kalshi-showall.js */
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
    _text: "", _attrs: {},
    classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {target: this}); }, this); }
  };
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

function mkGame(i){
  return {
    event_ticker: "KXNFLGAME-26OCT04G"+i, title: "Team A"+i+" vs Team B"+i,
    sub_title: "A"+i+" vs B"+i+" (Oct 4)",
    markets: [
      { kind: "winner", team: "Team A"+i, yes_bid: 60, yes_ask: 62, last: 61,
        volume: "1000000", volume_24h: "500000", close_time: new Date(Date.now()+7200*1000).toISOString() },
      { kind: "winner", team: "Team B"+i, yes_bid: 38, yes_ask: 40, last: 39,
        volume: "900000", volume_24h: "400000", close_time: new Date(Date.now()+7200*1000).toISOString() }
    ]
  };
}
function mkSnap(n){
  var games = [];
  for(var i = 0; i < n; i++) games.push(mkGame(i));
  return { updated_at: new Date().toISOString(), games: games };
}
var snapshot = mkSnap(14);

var fetchCalls = 0;
var fetchStub = function(url){
  fetchCalls++;
  if(url.indexOf("kalshi-nfl.json") !== -1) return Promise.resolve(snapshot);
  if(url.indexOf("teams.json") !== -1) return Promise.resolve({});
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
    pmEventsUrl: function(){ return ""; },
    teamDir: function(){ return Promise.resolve({}); },
    vsHeader: function(){ return ""; },
    esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

var tabK = makeEl("tab-kalshi"); tabK.setAttribute("data-kalshi", "nfl");
getEl("marketTabs")._children = [tabK];

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/kalshi-logic.js"), "utf8"), sandbox, {filename: "js/kalshi-logic.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8"), sandbox, {filename: "js/markets.js"});

function settle(fn){ setTimeout(fn, 60); }
function cards(){ return (getEl("marketGrid").innerHTML.match(/class="card"/g) || []).length; }

settle(function(){
  /* 1. 14-game snapshot: exactly 12 cards + an honest "Show all 14 games" toggle */
  tabK._fire("click");
  settle(function(){
    var html = getEl("marketGrid").innerHTML;
    assert(cards() === 12, "14-game snapshot renders the first page of 12 cards, got "+cards());
    assert(html.indexOf("Show all 14 games") !== -1, "toggle offers the remaining games by count");
    assert(html.indexOf('aria-expanded="false"') !== -1, "toggle starts collapsed (aria-expanded=false)");
    assert(getEl("marketNote").textContent.indexOf("14 games") !== -1,
           "market note still reports the true game count: "+JSON.stringify(getEl("marketNote").textContent));

    /* 2. expanding shows every card and flips the label */
    getEl("kalshiShowAll")._fire("click");
    settle(function(){
      var h2 = getEl("marketGrid").innerHTML;
      assert(cards() === 14, "expanded tab renders all 14 cards, got "+cards());
      assert(h2.indexOf("Show fewer games") !== -1, "toggle label flips to 'Show fewer games'");
      assert(h2.indexOf('aria-expanded="true"') !== -1, "toggle reports aria-expanded=true when open");

      /* 3. the silent 5-minute refresh keeps the expanded state */
      var t = activeTimers().filter(function(x){ return x.ms === 300000; })[0];
      assert(!!t, "a 5-minute Kalshi refresh timer is scheduled");
      t.fn();
      settle(function(){
        assert(cards() === 14, "silent refresh preserves the expanded view (14 cards), got "+cards());
        assert(getEl("marketGrid").innerHTML.indexOf("Show fewer games") !== -1,
               "silent refresh keeps the collapse toggle");

        /* 4. collapsing returns to the first page */
        getEl("kalshiShowAll")._fire("click");
        settle(function(){
          assert(cards() === 12, "collapsed tab returns to 12 cards, got "+cards());
          assert(getEl("marketGrid").innerHTML.indexOf("Show all 14 games") !== -1,
                 "toggle label flips back to 'Show all 14 games'");

          /* 5. fewer games than a page: no toggle at all */
          snapshot = mkSnap(10);
          tabK._fire("click");
          settle(function(){
            assert(cards() === 10, "10-game snapshot renders all 10 cards, got "+cards());
            assert(getEl("marketGrid").innerHTML.indexOf("kalshiShowAll") === -1,
                   "no toggle rendered when everything fits on one page");
            if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
            console.log("ALL KALSHI-SHOWALL TESTS PASS");
          });
        });
      });
    });
  });
});
