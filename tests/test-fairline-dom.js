/* Verifies the no-vig fair line wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js and odds.js in a vm sandbox with stubbed
   DOM/fetch, then asserts:
   - a game with a moneyline consensus on both sides renders the fair line
     with the vig-free prices, fair implied probs, and the book-hold figure;
   - the fair line renders once per game card;
   - a game missing one moneyline side renders NO fair line (no guesses).
   Run: node tests/test-fairline-dom.js */
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
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {}); }, this); }
  };
  var cls = {};
  el.classList = {
    add: function(c){ cls[c]=1; }, remove: function(c){ delete cls[c]; },
    toggle: function(c, f){ var v = f!==undefined?!!f:!cls[c]; if(v)cls[c]=1; else delete cls[c]; return v; },
    contains: function(c){ return !!cls[c]; }
  };
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
 "alertThr","refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount"].forEach(getEl);

var store = { "giu_odds_key": "TESTKEY" };
var localStorageStub = {
  getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v){ store[k] = String(v); },
  removeItem: function(k){ delete store[k]; }
};

function o(name, price, point){
  var r = { name: name, price: price };
  if(point !== undefined) r.point = point;
  return r;
}
/* game 1: both books post the same -110/-110 moneyline -> fair +100/+100 */
function fairEvent(){
  return { id:"fair-ev-1", home_team:"Green Bay Packers", away_team:"Chicago Bears",
    commence_time:new Date(Date.now()+2*864e5).toISOString(),
    bookmakers:[
      { key:"draftkings", title:"DraftKings", markets:[
        { key:"h2h", outcomes:[ o("Chicago Bears", 1.9090909), o("Green Bay Packers", 1.9090909) ]}]},
      { key:"fanduel", title:"FanDuel", markets:[
        { key:"h2h", outcomes:[ o("Chicago Bears", 1.9090909), o("Green Bay Packers", 1.9090909) ]}]}
    ]};
}
/* game 2: only the away moneyline posted -> no fair line, no guesses */
function oneSidedEvent(){
  return { id:"fair-ev-2", home_team:"Dallas Cowboys", away_team:"Philadelphia Eagles",
    commence_time:new Date(Date.now()+2*864e5).toISOString(),
    bookmakers:[
      { key:"draftkings", title:"DraftKings", markets:[
        { key:"h2h", outcomes:[ o("Philadelphia Eagles", 1.75) ]}]}
    ]};
}
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
    querySelector: function(){ return null; } },
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
  },
  OddsSlip: {
    has: function(){ return false; }, toggle: function(){ return true; },
    reprice: function(){}, sameGame: function(){ return []; },
    payout: function(){ return {combinedAm:"+100", combined:2.0, implied:0.5, profit:100, total:200}; },
    remove: function(){}, clear: function(){},
    normalize: function(legs){ return legs; },
    valueSummary: function(){ return null; }
  }
};
sandbox.window.GIU = sandbox.GIU;
sandbox.window.OddsSlip = sandbox.OddsSlip;
vm.createContext(sandbox);

var tabNFL = makeEl("tab-nfl"); tabNFL.setAttribute("data-sport","americanfootball_nfl");
getEl("sportTabs")._children = [tabNFL];

["js/odds-logic.js","js/odds.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});

function settle(fn){ setTimeout(fn, 60); }
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}
function count(html, sub){ return html.split(sub).length - 1; }

settle(function(){
  assert(oddsDeferreds.length === 1, "initial NFL load fires one odds API fetch");
  oddsDeferreds[0].resolve(apiResponse([fairEvent(), oneSidedEvent()]));
  settle(function(){
    var html = getEl("oddsBoard").innerHTML;
    assert(count(html, "fair-line") === 1,
           "exactly one game card carries the fair line");
    assert(html.indexOf("No-vig fair") !== -1, "fair line is labeled honestly");
    assert(html.indexOf("Bears +100 (50%)") !== -1,
           "fair line shows the away fair price (Bears +100 (50%))");
    assert(html.indexOf("Packers +100 (50%)") !== -1,
           "fair line shows the home fair price (Packers +100 (50%))");
    assert(html.indexOf("books hold ≈ 4.76%") !== -1,
           "fair line shows the average book hold (4.76%)");
    assert(html.indexOf("vig-free price implied by the book consensus") !== -1,
           "fair line carries the honest estimate tooltip");
    assert(html.indexOf("id=\"game-fair-ev-2\"") !== -1,
           "one-sided game still renders its card");
    var secondCard = html.slice(html.indexOf("id=\"game-fair-ev-2\""));
    assert(secondCard.indexOf("fair-line") === -1,
           "one-sided game renders no fair line (no guesses)");
    console.log(failures ? ("\n"+failures+" FAILURES")
                         : "\nALL FAIRLINE DOM TESTS PASS");
    process.exit(failures ? 1 : 0);
  });
});
