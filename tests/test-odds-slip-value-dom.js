/* Verifies the slip value summary wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js, odds-slip.js and odds.js in a vm sandbox
   with stubbed DOM/fetch, then asserts:
   - a legacy slip (no `captured`) normalizes at boot and claims no moves;
   - a tapped leg captures its price and starts quiet;
   - a pull with a better price shows "moved your way" with the from->to
     combined price;
   - a pull with a worse price shows "moved against you";
   - the summary carries role="status".
   Run: node tests/test-odds-slip-value-dom.js */
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
    id: id, innerHTML: "", style: {}, value: "", className: "", checked: false,
    _attrs: {}, hidden: false,
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return []; },
    _fire: function(ev, arg){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, arg || {}); }, this); }
  };
  var cls = {};
  el.classList = {
    add: function(c){ cls[c]=1; }, remove: function(c){ delete cls[c]; },
    toggle: function(c, f){ var v = f!==undefined?!!f:!cls[c]; if(v)cls[c]=1; else delete cls[c]; return v; },
    contains: function(c){ return !!cls[c]; }
  };
  return el;
}

function o(name, price, point){
  var r = { name: name, price: price };
  if(point !== undefined) r.point = point;
  return r;
}
function svEvent(spreadPrice){
  return { id: "sv-1", home_team: "Green Bay Packers", away_team: "Chicago Bears",
    commence_time: new Date(Date.now() + 2*864e5).toISOString(),
    bookmakers: [
      { key: "draftkings", title: "DraftKings", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", spreadPrice, 3), o("Green Bay Packers", 1.91, -3) ]}]},
      { key: "fanduel", title: "FanDuel", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", spreadPrice, 3), o("Green Bay Packers", 1.91, -3) ]}]}
    ]};
}
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}
function settle(fn){ setTimeout(fn, 60); }

function makeWorld(preStore){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  ["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
   "alertThr","refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount",
   "slipTotals"].forEach(getEl);
  var store = { "giu_odds_key": "TESTKEY" };
  Object.keys(preStore || {}).forEach(function(k){ store[k] = preStore[k]; });
  var localStorageStub = {
    getItem: function(k){ return k in store ? store[k] : null; },
    setItem: function(k, v){ store[k] = String(v); },
    removeItem: function(k){ delete store[k]; }
  };
  var oddsDeferreds = [];
  var fetchStub = function(){
    var rec = {};
    rec.promise = new Promise(function(res){ rec.resolve = res; });
    oddsDeferreds.push(rec);
    return rec.promise;
  };
  var sandbox = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl, hidden: false,
      querySelectorAll: function(){ return []; },
      querySelector: function(){ return null; },
      createElement: function(){ return makeEl("x"); } },
    fetch: fetchStub,
    localStorage: localStorageStub,
    window: {},
    alert: function(){},
    GIU: {
      fetchJSON: function(){ return Promise.resolve({}); },
      teamDir: function(){ return Promise.resolve({}); },
      teamFind: function(){ return null; },
      vsHeader: function(){ return ""; },
      teamLogo: function(){ return ""; },
      teamChip: function(){ return ""; },
      esc: function(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
        return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); },
      failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
    }
  };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  ["js/odds-logic.js","js/odds-slip.js","js/odds.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
  });
  return { getEl: getEl, oddsDeferreds: oddsDeferreds, store: store };
}

function pickAttrs(){
  return { "data-slip": "sv-1|draftkings|spreads|Chicago Bears",
    "data-game": "Chicago Bears @ Green Bay Packers",
    "data-market": "spreads", "data-side": "Chicago Bears",
    "data-book": "draftkings", "data-booktitle": "DraftKings",
    "data-label": "+3 \u00b7 -110", "data-price": "1.91" };
}
function tapLeg(world){
  var attrs = pickAttrs();
  var btn = makeEl("pickbtn");
  Object.keys(attrs).forEach(function(k){ btn.setAttribute(k, attrs[k]); });
  world.getEl("oddsBoard")._fire("click", { target: {
    closest: function(sel){ return sel === ".pick-btn" ? btn : null; } } });
}

/* ---- world A: legacy slip (no `captured`) boots quietly ---- */
var A = makeWorld({ "giu_slip": JSON.stringify([
  { id:"leg-old", game:"Old Game", market:"h2h", side:"Old Team",
    book:"draftkings", bookTitle:"DraftKings", label:"-110",
    price:1.91, sport:"americanfootball_nfl" } ]) });
settle(function(){
  var htmlA = A.getEl("slipPanel").innerHTML;
  assert(htmlA.indexOf("slip-value quiet") !== -1,
         "legacy slip normalizes at boot: quiet summary, no phantom moves");
  assert(htmlA.indexOf('role="status"') !== -1,
         "the summary carries role=status for screen readers");
  A.oddsDeferreds[0].resolve(apiResponse([svEvent(1.91)]));
  settle(function(){
    var htmlA2 = A.getEl("slipPanel").innerHTML;
    assert(htmlA2.indexOf("moved your way") === -1 && htmlA2.indexOf("moved against") === -1,
           "an unrelated board pull claims no moves on the legacy leg");

    /* ---- world B: tap a leg, then move the line both ways ---- */
    var B = makeWorld({});
    settle(function(){
      B.oddsDeferreds[0].resolve(apiResponse([svEvent(1.91)]));
      settle(function(){
        tapLeg(B);
        var htmlB = B.getEl("slipPanel").innerHTML;
        assert(htmlB.indexOf("slip-value quiet") !== -1,
               "a freshly tapped leg starts quiet — nothing moved yet");
        /* pull 2: the price improves to 2.05 (+105) */
        B.getEl("refreshBtn")._fire("click");
        settle(function(){
          B.oddsDeferreds[1].resolve(apiResponse([svEvent(2.05)]));
          settle(function(){
            var html2 = B.getEl("slipPanel").innerHTML;
            assert(html2.indexOf("slip-value good") !== -1,
                   "a better price paints the summary good");
            assert(html2.indexOf("1 moved your way \u25b2") !== -1,
                   "summary counts the leg that moved your way");
            assert(html2.indexOf("(was -110)") !== -1,
                   "summary shows the captured price for comparison");
            /* pull 3: the price shortens to 1.80 (-125) */
            B.getEl("refreshBtn")._fire("click");
            settle(function(){
              B.oddsDeferreds[2].resolve(apiResponse([svEvent(1.80)]));
              settle(function(){
                var html3 = B.getEl("slipPanel").innerHTML;
                assert(html3.indexOf("slip-value bad") !== -1,
                       "a worse price paints the summary bad");
                assert(html3.indexOf("1 moved against you \u25bc") !== -1,
                       "summary counts the leg that moved against you");
                assert(html3.indexOf("\u25b2") !== -1 || html3.indexOf("\u25bc") !== -1,
                       "direction glyphs render in the summary");
                console.log(failures ? ("\n"+failures+" FAILURES")
                                     : "\nALL SLIP-VALUE DOM TESTS PASS");
                process.exit(failures ? 1 : 0);
              });
            });
          });
        });
      });
    });
  });
});
