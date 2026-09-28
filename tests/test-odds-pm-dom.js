/* Verifies the market-check wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js, wx-shared.js, odds-wx.js, odds-pm.js and
   odds.js in a vm sandbox with stubbed DOM/fetch, then asserts:
   - NFL board render leaves a hidden [data-pmcheck] slot on each game card;
   - after the gamma sports + events fetches resolve, a live Polymarket
     moneyline injects the market-check line (PM price + no-vig fair % +
     gap chip) and unhides the slot;
   - a pinned 1/0 moneyline (today's final, a resolved market) leaves the
     slot hidden — a settled market is not a price;
   - switching to a non-NFL tab fires no Polymarket fetches at all;
   - a gamma failure never breaks the board (check stays off). */
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

function bkFixture(){
  return { key:"draftkings", title:"DraftKings", markets:[
    {key:"spreads", outcomes:[
      {name:"Chicago Bears", price:1.91, point:-3},
      {name:"Green Bay Packers", price:1.91, point:3}]},
    {key:"totals", outcomes:[
      {name:"Over", price:1.91, point:44.5},
      {name:"Under", price:1.91, point:44.5}]},
    {key:"h2h", outcomes:[
      {name:"Chicago Bears", price:1.65},
      {name:"Green Bay Packers", price:2.30}]}
  ]};
}
var KICK_ISO = new Date(Date.now() + 2*864e5).toISOString();
function nflEvents(){
  return [{ id:"pm-ev-1", home_team:"Chicago Bears", away_team:"Green Bay Packers",
            commence_time:KICK_ISO, bookmakers:[bkFixture()] }];
}
function nbaEvents(){
  return [{ id:"pm-ev-nba", home_team:"Chicago Bulls", away_team:"Boston Celtics",
            commence_time:KICK_ISO, bookmakers:[bkFixture()] }];
}
/* controllable odds-API fetch (bare fetch in odds.js) */
var oddsDeferreds = [];
var fetchStub = function(){
  var rec = {};
  rec.promise = new Promise(function(res){ rec.resolve = res; });
  oddsDeferreds.push(rec);
  return rec.promise;
};
/* GIU.fetchJSON: gamma sports + events, recorded by URL */
var jsonCalls = [], sportsRec = null, eventsRecs = [];
function fetchJSONStub(url){
  jsonCalls.push(url);
  var rec = {};
  rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
  if(url.indexOf("gamma-api.polymarket.com/sports") !== -1) sportsRec = rec;
  else if(url.indexOf("gamma-api.polymarket.com/events") !== -1) eventsRecs.push(rec);
  else rec.resolve({});
  return rec.promise;
}
var DIR = { nfl: [
  {abbr:"CHI", displayName:"Chicago Bears", shortDisplayName:"Bears"},
  {abbr:"GB", displayName:"Green Bay Packers", shortDisplayName:"Packers"}
]};
function teamFindStub(d, league, q){
  var list = (d[league]||[]), ql = String(q).toLowerCase();
  for(var i=0;i<list.length;i++){
    var t = list[i];
    if(t.abbr === String(q).toUpperCase() ||
       t.displayName.toLowerCase() === ql ||
       t.shortDisplayName.toLowerCase() === ql) return t;
  }
  return null;
}
/* market-check slots: [data-pmcheck] placeholders inside the rendered board */
var slots = {};
function resetSlots(){ slots = {}; }
function slotFor(oddsId){
  if(!slots[oddsId]) slots[oddsId] = { innerHTML:"", hidden:true };
  return slots[oddsId];
}

var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: { getElementById: getEl, hidden: false,
    querySelectorAll: function(){ return []; },
    querySelector: function(sel){
      var m = /\[data-pmcheck="([^"]+)"\]/.exec(sel);
      return m ? slotFor(m[1]) : null;
    } },
  fetch: fetchStub,
  localStorage: localStorageStub,
  window: {},
  alert: function(){},
  GIU: {
    fetchJSON: fetchJSONStub,
    teamDir: function(){ return Promise.resolve(DIR); },
    teamFind: teamFindStub,
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

["js/odds-logic.js","js/wx-shared.js","js/odds-wx.js","js/odds-pm.js","js/odds.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});
assert(typeof sandbox.window.OddsPm === "object", "odds-pm.js exposes window.OddsPm");

function settle(fn){ setTimeout(fn, 60); }
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}
/* live moneyline: Bears 65c / Packers 35c, high volume */
function pmLive(){
  return [{ title:"Bears vs. Packers", markets:[{
    sportsMarketType:"moneyline", closed:false, active:true, volume:12000,
    outcomes:JSON.stringify(["Bears","Packers"]),
    outcomePrices:JSON.stringify(["0.65","0.35"]) }]}];
}
/* pinned 1/0: today's final — a resolved market, not a price */
function pmPinned(){
  return [{ title:"Bears vs. Packers", markets:[{
    sportsMarketType:"moneyline", closed:false, active:true, volume:99000,
    outcomes:JSON.stringify(["Bears","Packers"]),
    outcomePrices:JSON.stringify(["1","0"]) }]}];
}

settle(function(){
  assert(oddsDeferreds.length === 1, "initial NFL load fires one odds API fetch");
  oddsDeferreds[0].resolve(apiResponse(nflEvents()));
  settle(function(){
    var html = getEl("oddsBoard").innerHTML;
    assert(html.indexOf('data-pmcheck="pm-ev-1"') !== -1,
           "game card carries a hidden market-check slot");
    assert(/data-pmcheck="pm-ev-1"[^>]*hidden/.test(html),
           "market-check slot starts hidden");
    var gammaSports = jsonCalls.filter(function(u){
      return u.indexOf("gamma-api.polymarket.com/sports") !== -1; });
    assert(gammaSports.length === 1,
           "series lookup fires once, after the board renders");
    assert(sportsRec !== null, "series lookup is in flight");
    sportsRec.resolve([{sport:"nfl", series:"12185"}]);
    settle(function(){
      assert(eventsRecs.length === 1, "live events fetch follows the series lookup");
      var eu = jsonCalls.filter(function(u){
        return u.indexOf("gamma-api.polymarket.com/events") !== -1; })[0];
      assert(eu.indexOf("series_id=12185") !== -1 && eu.indexOf("closed=false") !== -1,
             "events fetch targets the live NFL series: "+eu);
      eventsRecs[0].resolve(pmLive());
      settle(function(){
        var slot = slotFor("pm-ev-1");
        assert(slot.hidden === false, "live moneyline reveals the market check");
        /* books: Bears 1.65 / Packers 2.30 -> no-vig fair CHI = 58.2% -> 58%;
           PM has CHI at 65c -> gap 7 -> chip */
        assert(slot.innerHTML.indexOf("65&cent;") !== -1,
               "badge shows the Polymarket price: "+slot.innerHTML.slice(0,120));
        assert(slot.innerHTML.indexOf("58%") !== -1,
               "badge shows the no-vig fair % from the best book prices");
        assert(slot.innerHTML.indexOf("7-pt gap") !== -1,
               "badge flags the 7-point market-vs-books gap");
        assert(slot.innerHTML.indexOf("CHI") !== -1,
               "badge names the Polymarket favorite side");

        /* non-NFL tab: no Polymarket traffic at all */
        resetSlots();
        tabNBA._fire("click");
        settle(function(){
          assert(oddsDeferreds.length === 2, "NBA tab re-pulls the odds API");
          oddsDeferreds[1].resolve(apiResponse(nbaEvents()));
          settle(function(){
            var nbaHtml = getEl("oddsBoard").innerHTML;
            assert(nbaHtml.indexOf("data-pmcheck") === -1,
                   "non-NFL cards get no market-check slot at all");
            var gCount = jsonCalls.filter(function(u){
              return u.indexOf("gamma-api.polymarket.com") !== -1; }).length;
            assert(gCount === 2, "switching to NBA fires no Polymarket fetches");

            /* back to NFL with a pinned (resolved) moneyline: stays silent */
            tabNFL._fire("click");
            settle(function(){
              oddsDeferreds[2].resolve(apiResponse(nflEvents()));
              settle(function(){
                resetSlots();
                settle(function(){
                  assert(eventsRecs.length === 2,
                         "NFL re-render re-fetches live events (series lookup stays cached)");
                  eventsRecs[1].resolve(pmPinned());
                  settle(function(){
                    var s2 = slotFor("pm-ev-1");
                    assert(s2.hidden === true && s2.innerHTML === "",
                           "pinned 1/0 moneyline leaves the check hidden and empty");
                    console.log(failures ? ("\n"+failures+" FAILURES")
                                         : "\nALL ODDS-PM DOM TESTS PASS");
                    process.exit(failures ? 1 : 0);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
