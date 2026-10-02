/* Verifies the Kalshi price-history sparkline wiring in the SHIPPED
   js/markets.js (v1.141.0). Stubs the DOM, loads the real kalshi-logic.js +
   markets.js, and asserts:
   - a Kalshi game whose favorite side has 3 history points renders a
     <canvas class="kalshi-spark"> with an aria-label carrying the same
     numbers as the visible caption, an honest "Kalshi price history ·
     3 snapshots · snapshot <time>" caption (never "live"), the data-fav
     point payload, and a dog series (data-dog) when the other side has
     2+ points;
   - a game with only 1 history point renders NO canvas and the honest
     "price history accumulating" note instead of a chart;
   - when the history fetch fails, the cards still render (sparkline block
     degrades to the accumulating note, nothing crashes).
   Run: node tests/test-kalshi-history-dom.js */
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

function mkGame(i, favBid, favAsk, dogBid, dogAsk){
  return {
    event_ticker: "KXNFLGAME-26OCT04G" + i, title: "Team A" + i + " vs Team B" + i,
    sub_title: "A" + i + " vs B" + i + " (Oct 4)",
    markets: [
      { ticker: "HT-A" + i, kind: "winner", team: "Team A" + i,
        yes_bid: favBid, yes_ask: favAsk, last: null, close_time: new Date(Date.now()+7200*1000).toISOString() },
      { ticker: "HT-B" + i, kind: "winner", team: "Team B" + i,
        yes_bid: dogBid, yes_ask: dogAsk, last: null, close_time: new Date(Date.now()+7200*1000).toISOString() }
    ]
  };
}
var snapshot = {
  updated_at: new Date(Date.now() - 30*60000).toISOString(),
  games: [ mkGame(0, 60, 62, 38, 40), mkGame(1, 55, 57, 43, 45) ],
  moves: [], new_games: [], prev_at: null
};
/* game0: 3 points for both sides; game1: a single point (too short for a chart) */
var history = {
  "HT-A0": [{t: "2026-10-01T18:00:00Z", yes: 58}, {t: "2026-10-01T19:00:00Z", yes: 60}, {t: "2026-10-01T20:00:00Z", yes: 61}],
  "HT-B0": [{t: "2026-10-01T18:00:00Z", yes: 42}, {t: "2026-10-01T19:00:00Z", yes: 40}, {t: "2026-10-01T20:00:00Z", yes: 39}],
  "HT-A1": [{t: "2026-10-01T20:00:00Z", yes: 56}]
};
var historyFails = false;
var fetchStub = function(url){
  if(url.indexOf("kalshi-nfl.json") !== -1) return Promise.resolve(snapshot);
  if(url.indexOf("kalshi-history.json") !== -1)
    return historyFails ? Promise.reject(new Error("404")) : Promise.resolve(history);
  if(url.indexOf("teams.json") !== -1) return Promise.resolve({});
  return Promise.reject(new Error("unexpected fetch url: " + url));
};

var intervals = [], cleared = [], nextId = 1;
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
    teamFind: function(){ return null; },
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

settle(function(){
  tabK._fire("click");
  settle(function(){
    var html = getEl("marketGrid").innerHTML;

    /* 1. game0 (3 points): canvas + honest caption */
    assert(/class="kalshi-spark"/.test(html), "3-point game renders a kalshi-spark canvas");
    assert(/Kalshi price history · 3 snapshots · snapshot /.test(html),
           "caption names the history honestly (count + snapshot time)");
    assert(!/live (price|feed|market|data)/i.test(html), "no 'live price/feed/data' language in the history block");
    assert(/aria-label="[^"]*Team A0[^"]*61 cents[^"]*not live/.test(html),
           "canvas aria-label carries the same numbers (Team A0 61 cents, not live)");
    assert(/data-fav="\[\[3,/.test(html), "canvas carries the favorite-side point payload (data-fav)");
    assert(/data-dog="\[\[3,/.test(html), "other side with 2+ points is plotted too (data-dog)");
    assert(/&gt;|Team A0/.test(html) && /<canvas[^>]*>Kalshi price history for Team A0/.test(html),
           "canvas has a text fallback (label text inside the canvas element)");

    /* 2. game1 (1 point): honest note, no chart */
    assert(/Team A1 wins/.test(html), "1-point game card still renders its prices");
    assert(/price history accumulating/.test(html), "1-point game shows the accumulating note, not a chart");
    assert((html.match(/class="kalshi-spark"/g) || []).length === 1,
           "exactly one sparkline canvas across both cards, got " +
           ((html.match(/class="kalshi-spark"/g) || []).length));

    /* 3. history fetch failure: graceful degrade, no crash */
    historyFails = true;
    tabK._fire("click");
    settle(function(){
      var h2 = getEl("marketGrid").innerHTML;
      assert(/Team A0 wins/.test(h2), "cards still render when the history fetch fails");
      assert((h2.match(/class="kalshi-spark"/g) || []).length === 0,
             "no canvas when the history file is missing — the accumulating note instead");
      assert(/price history accumulating/.test(h2), "accumulating note shown on history-fetch failure");
      if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
      console.log("ALL KALSHI-HISTORY-DOM TESTS PASS");
    });
  });
});
