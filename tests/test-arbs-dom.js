/* Verifies the "Sure bets" arbitrage strip wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js and odds.js in a vm sandbox with stubbed
   DOM/fetch, then asserts:
   - a board with a cross-book moneyline arb renders the arb-card strip with
     a jump link to the game card, the market label, both book legs, the
     profit %, and the "live at last pull" freshness note;
   - the arbed game card carries an arb-chip flag (the un-arbed one doesn't);
   - a board with no arbs renders no strip and no chips (quiet by default).
   Run: node tests/test-arbs-dom.js */
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
 "refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount"].forEach(getEl);

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
/* event 1: real cross-book moneyline arb (away 2.10 @DK, home 2.10 @FD) */
function arbEvent(){
  return { id:"arb-ev-1", home_team:"Green Bay Packers", away_team:"Chicago Bears",
    commence_time:new Date(Date.now()+2*864e5).toISOString(),
    bookmakers:[
      { key:"draftkings", title:"DraftKings", markets:[
        { key:"h2h", outcomes:[ o("Chicago Bears", 2.10), o("Green Bay Packers", 1.80) ]},
        { key:"spreads", outcomes:[ o("Chicago Bears", 1.91, -3), o("Green Bay Packers", 1.91, 3) ]},
        { key:"totals", outcomes:[ o("Over", 1.91, 44.5), o("Under", 1.91, 44.5) ]}]},
      { key:"fanduel", title:"FanDuel", markets:[
        { key:"h2h", outcomes:[ o("Chicago Bears", 1.80), o("Green Bay Packers", 2.10) ]},
        { key:"spreads", outcomes:[ o("Chicago Bears", 1.91, -3), o("Green Bay Packers", 1.91, 3) ]},
        { key:"totals", outcomes:[ o("Over", 1.91, 44.5), o("Under", 1.91, 44.5) ]}]}
    ]};
}
/* event 2: books agree — no arb anywhere */
function flatEvent(){
  return { id:"arb-ev-2", home_team:"Dallas Cowboys", away_team:"Philadelphia Eagles",
    commence_time:new Date(Date.now()+2*864e5).toISOString(),
    bookmakers:[
      { key:"draftkings", title:"DraftKings", markets:[
        { key:"h2h", outcomes:[ o("Philadelphia Eagles", 1.91), o("Dallas Cowboys", 1.91) ]}]},
      { key:"fanduel", title:"FanDuel", markets:[
        { key:"h2h", outcomes:[ o("Philadelphia Eagles", 1.91), o("Dallas Cowboys", 1.91) ]}]}
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
    remove: function(){}, clear: function(){}
  }
};
sandbox.window.GIU = sandbox.GIU;
sandbox.window.OddsSlip = sandbox.OddsSlip;
vm.createContext(sandbox);

var tabNFL = makeEl("tab-nfl"); tabNFL.setAttribute("data-sport","americanfootball_nfl");
var tabNBA = makeEl("tab-nba"); tabNBA.setAttribute("data-sport","basketball_nba");
getEl("sportTabs")._children = [tabNFL, tabNBA];

["js/odds-logic.js","js/odds.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});
/* window.OddsWx stays undefined -> maybeWxBadges bails; window.GIU set above */

function settle(fn){ setTimeout(fn, 60); }
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}
function count(html, sub){ return html.split(sub).length - 1; }

settle(function(){
  assert(oddsDeferreds.length === 1, "initial NFL load fires one odds API fetch");
  oddsDeferreds[0].resolve(apiResponse([arbEvent(), flatEvent()]));
  settle(function(){
    var html = getEl("oddsBoard").innerHTML;
    assert(html.indexOf("arb-card") !== -1, "board renders the Sure bets strip");
    assert(html.indexOf('href="#game-arb-ev-1"') !== -1,
           "strip row jump-links to the arbed game card");
    assert(html.indexOf("Moneyline") !== -1, "strip names the arbed market");
    assert(html.indexOf("DraftKings") !== -1 && html.indexOf("FanDuel") !== -1,
           "strip names both books on the legs");
    assert(html.indexOf("+5.00%") !== -1, "strip shows the locked profit (+5.00%)");
    assert(html.indexOf("($50.00)") !== -1, "strip shows the dutch-book stake split");
    assert(html.indexOf("Live at the last pull") !== -1,
           "strip carries the freshness note");
    assert(html.indexOf("guides/advanced.html#arb") !== -1,
           "strip links the honest arbitrage guide section");
    assert(count(html, "arb-chip") === 1, "exactly one game card carries the arb flag");
    assert(html.indexOf("arb-ev-2") !== -1, "the flat game still renders its card");
    assert(html.indexOf("Sure bets") !== -1, "strip header reads Sure bets");

    /* strip sits above the game cards */
    assert(html.indexOf("arb-card") < html.indexOf('id="game-arb-ev-1"'),
           "strip renders above the game cards");

    /* no-arb board: quiet */
    tabNBA._fire("click");
    settle(function(){
      assert(oddsDeferreds.length === 2, "NBA tab re-pulls the odds API");
      oddsDeferreds[1].resolve(apiResponse([flatEvent()]));
      settle(function(){
        var nbaHtml = getEl("oddsBoard").innerHTML;
        assert(nbaHtml.indexOf("arb-card") === -1,
               "board with no arbs renders no strip");
        assert(nbaHtml.indexOf("arb-chip") === -1,
               "board with no arbs renders no game flags");
        console.log(failures ? ("\n"+failures+" FAILURES")
                             : "\nALL ARB DOM TESTS PASS");
        process.exit(failures ? 1 : 0);
      });
    });
  });
});
