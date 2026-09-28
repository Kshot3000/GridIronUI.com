/* Verifies the line-movement sparkline wiring in the SHIPPED js/odds.js.
   Stubs the DOM, loads the real odds-logic.js and odds.js, seeds a
   line-movement history in localStorage, and asserts:
   - a game with 2+ tracked samples renders spread + total sparkline SVGs
     with a movement aria-label and the "tracked since" caption;
   - a game with a single sample renders NO sparkline (one dot is not a trend);
   - the fresh fetch's consensus is recorded into the history (no quota cost);
   - the new sample appears in the persisted history map. */
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
    _text: "", _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {}); }, this); }
  };
  (function(){
    var s = {};
    el.classList = {
      add: function(c){ s[c]=1; }, remove: function(c){ delete s[c]; },
      toggle: function(c, force){
        var v = force !== undefined ? !!force : !s[c];
        if(v) s[c]=1; else delete s[c]; return v;
      },
      contains: function(c){ return !!s[c]; }
    };
  })();
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

/* seed: gameA has 2 tracked samples, gameB has 1 */
var T0 = Date.now() - 3600*1000;
var store = {
  "giu_odds_key": "TESTKEY",
  "giu_odds_hist_americanfootball_nfl": JSON.stringify({
    "gameA": [[T0, -3, 44.5],[T0+1800*1000, -4.5, 44.5]],
    "gameB": [[T0, -6.5, 47.5]]
  })
};
var localStorageStub = {
  getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v){ store[k] = String(v); },
  removeItem: function(k){ delete store[k]; }
};

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
function evFixture(id, home){
  return { id:id, home_team:home, away_team:"Kansas City Chiefs",
           commence_time:new Date(Date.now()+72*3600*1000).toISOString(),
           bookmakers:[bkFixture()] };
}
function apiResponse(events){
  return { status:200, ok:true,
           headers:{ get:function(){ return "499"; } },
           json:function(){ return Promise.resolve(events); } };
}
var deferreds = [];
var fetchStub = function(){
  var rec = {};
  rec.promise = new Promise(function(res){ rec.resolve = res; });
  deferreds.push(rec);
  return rec.promise;
};

var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: { getElementById: getEl, hidden: false, querySelectorAll: function(){ return []; } },
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

var tabNFL = makeEl("tab-nfl"); tabNFL.setAttribute("data-sport","americanfootball_nfl");
getEl("sportTabs")._children = [tabNFL];

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds-logic.js"), "utf8"),
                sandbox, {filename: "js/odds-logic.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds.js"), "utf8"),
                sandbox, {filename: "js/odds.js"});

function count(re, s){ var m = s.match(re); return m ? m.length : 0; }

setTimeout(function(){
  deferreds[0].resolve(apiResponse([evFixture("gameA","Raiders A"), evFixture("gameB","Raiders B")]));
  setTimeout(function(){
    var html = getEl("oddsBoard").innerHTML;
    assert(count(/<svg class="spark"/g, html) === 2,
           "gameA (2 samples) renders exactly 2 sparkline SVGs (spread + total), got "+
           count(/<svg class="spark"/g, html));
    assert(html.indexOf("Line movement tracked since") !== -1,
           "sparkline carries the honest 'tracked since' caption");
    assert(html.indexOf("Spread consensus moved from") !== -1,
           "sparkline SVG has a movement-describing aria-label");
    assert(html.indexOf('class="spark-area"') !== -1 && html.indexOf('class="spark-line"') !== -1,
           "sparkline has area-fill and line paths");

    /* gameB had 1 sample: the card must exist but carry no sparkline */
    var bIdx = html.indexOf("Raiders B");
    assert(bIdx !== -1, "gameB card rendered");
    var afterB = html.slice(bIdx, bIdx + 4000);
    assert(afterB.indexOf("<svg class=\"spark\"") === -1,
           "gameB (1 sample) renders no sparkline — one dot is not a trend");

    /* history: the fresh fetch's consensus was recorded for gameA; gameB's
       lines didn't move, so its single sample only had its timestamp
       extended (no fake second point). */
    var hist = JSON.parse(store["giu_odds_hist_americanfootball_nfl"] || "{}");
    assert(hist.gameA && hist.gameA.length === 3,
           "gameA history grew to 3 samples, got "+(hist.gameA ? hist.gameA.length : 0));
    assert(hist.gameB && hist.gameB.length === 1 && hist.gameB[0][0] > T0,
           "gameB (unchanged lines) keeps 1 sample with an extended timestamp, got "+
           JSON.stringify(hist.gameB));
    var lastA = hist.gameA[hist.gameA.length-1];
    assert(lastA[1] === -6.5 && lastA[2] === 47.5,
           "recorded sample matches the fetched consensus (-6.5 / 47.5), got "+JSON.stringify(lastA));

    console.log(failures ? "\n"+failures+" FAILURES" : "\nALL SPARK-DOM TESTS PASSED");
    process.exit(failures ? 1 : 0);
  }, 80);
}, 80);
