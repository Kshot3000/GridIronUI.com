/* Verifies the MLB game-day weather badge wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js, wx-shared.js, odds-wx.js and odds.js in a vm
   sandbox with stubbed DOM/fetch, then asserts:
   - the MLB board render leaves a hidden [data-wxbadge] slot on each card;
   - the ESPN cross-check hits the MLB postseason board (seasontype=3);
   - a calm October forecast leaves the slot hidden and empty (quiet default);
   - after re-render with a gusty forecast, the badge names Yankee Stadium
     and carries the baseball wind note;
   - the ESPN postseason fetch is session-cached across re-renders;
   - the forecast is one multi-location call with the ballpark's coords;
   - the badge links to the full forecast page. */
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

function mlbBk(){
  return { key:"draftkings", title:"DraftKings", markets:[
    {key:"spreads", outcomes:[
      {name:"New York Yankees", price:1.91, point:-1.5},
      {name:"Boston Red Sox", price:1.91, point:1.5}]},
    {key:"totals", outcomes:[
      {name:"Over", price:1.91, point:8.5},
      {name:"Under", price:1.91, point:8.5}]},
    {key:"h2h", outcomes:[
      {name:"New York Yankees", price:1.65},
      {name:"Boston Red Sox", price:2.30}]}
  ]};
}
var KICK = new Date(Date.now() + 2*864e5);
var KICK_ISO = KICK.toISOString();
function mlbEvents(){
  return [{ id:"wx-mlb-1", home_team:"New York Yankees", away_team:"Boston Red Sox",
            commence_time:KICK_ISO, bookmakers:[mlbBk()] }];
}
/* controllable odds-API fetch (bare fetch in odds.js) */
var oddsDeferreds = [];
var fetchStub = function(){
  var rec = {};
  rec.promise = new Promise(function(res){ rec.resolve = res; });
  oddsDeferreds.push(rec);
  return rec.promise;
};
/* GIU.fetchJSON: ESPN scoreboard + Open-Meteo, recorded by URL */
var jsonCalls = [], espnRec = null, wxRec = null;
function fetchJSONStub(url){
  jsonCalls.push(url);
  var rec = {};
  rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
  if(url.indexOf("site.api.espn.com") !== -1) espnRec = rec;
  else if(url.indexOf("api.open-meteo.com") !== -1) wxRec = rec;
  else rec.resolve({});
  return rec.promise;
}
var DIR = { mlb: [
  {abbr:"NYY", displayName:"New York Yankees", shortDisplayName:"Yankees"},
  {abbr:"BOS", displayName:"Boston Red Sox", shortDisplayName:"Red Sox"}
]};
function teamFindStub(d, league, q){
  var list = (d[league]||[]), ql = String(q).toLowerCase();
  for(var i=0;i<list.length;i++)
    if(list[i].abbr === String(q).toUpperCase() ||
       list[i].displayName.toLowerCase() === ql) return list[i];
  return null;
}
/* badge slots: [data-wxbadge] placeholders inside the rendered board */
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
      var m = /\[data-wxbadge="([^"]+)"\]/.exec(sel);
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
    remove: function(){}, clear: function(){},
    normalize: function(legs){ return legs; },
    valueSummary: function(){ return null; }
  }
};
sandbox.window.GIU = sandbox.GIU;
sandbox.window.OddsSlip = sandbox.OddsSlip;
vm.createContext(sandbox);

var tabNFL = makeEl("tab-nfl"); tabNFL.setAttribute("data-sport","americanfootball_nfl");
var tabMLB = makeEl("tab-mlb"); tabMLB.setAttribute("data-sport","baseball_mlb");
getEl("sportTabs")._children = [tabNFL, tabMLB];

["js/odds-logic.js","js/wx-shared.js","js/odds-wx.js","js/odds.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});
var G = sandbox.window.GIU;
assert(typeof G.wxUpcomingMlbPostseason === "function",
       "wx-shared.js exposes wxUpcomingMlbPostseason");
assert(typeof G.wxBallparkVenueFor === "function",
       "wx-shared.js exposes wxBallparkVenueFor");
assert(typeof G.wxImpactNotesBsb === "function",
       "wx-shared.js exposes wxImpactNotesBsb");

function settle(fn){ setTimeout(fn, 60); }
function espnMlbPayload(){
  return { events: [{ id:"espn-mlb-1", date:KICK_ISO,
    competitions:[{ venue:{fullName:"Yankee Stadium"},
      competitors:[
        {homeAway:"home", team:{abbreviation:"NYY"}},
        {homeAway:"away", team:{abbreviation:"BOS"}}]}]}] };
}
function wxPayload(gust, wind){
  var base = new Date(KICK_ISO); base.setUTCMinutes(0,0,0);
  var times = [], n = 6;
  for(var i=0;i<n;i++) times.push(new Date(base.getTime()+i*3600e3).toISOString().slice(0,16));
  function rep(v){ var a=[]; for(var k=0;k<n;k++) a.push(v); return a; }
  return [{ hourly: {
    time: times,
    temperature_2m: rep(58), precipitation_probability: rep(5),
    wind_speed_10m: rep(wind), wind_gusts_10m: rep(gust),
    wind_direction_10m: rep(320)
  }}];
}
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}
function espnCalls(){ return jsonCalls.filter(function(u){
  return u.indexOf("site.api.espn.com") !== -1; }); }
function wxCalls(){ return jsonCalls.filter(function(u){
  return u.indexOf("api.open-meteo.com") !== -1; }); }

settle(function(){
  assert(oddsDeferreds.length === 1, "initial NFL load fires one odds API fetch");
  tabMLB._fire("click"); /* switch to the MLB tab */
  settle(function(){
    assert(oddsDeferreds.length === 2, "MLB tab re-pulls the odds API");
    oddsDeferreds[1].resolve(apiResponse(mlbEvents()));
    settle(function(){
      var html = getEl("oddsBoard").innerHTML;
      assert(html.indexOf("New York Yankees") !== -1, "MLB board renders the game");
      assert(/data-wxbadge="wx-mlb-1"[^>]*hidden/.test(html) ||
             html.indexOf('data-wxbadge="wx-mlb-1" hidden') !== -1,
             "MLB game card carries a hidden weather-badge slot");
      var ec = espnCalls();
      assert(ec.length === 1 && ec[0].indexOf("baseball/mlb/scoreboard") !== -1 &&
             ec[0].indexOf("seasontype=3") !== -1,
             "venue cross-check hits the MLB postseason board: "+(ec[0]||"none"));

      espnRec.resolve(espnMlbPayload());
      settle(function(){
        var wc = wxCalls();
        assert(wc.length === 1 && wc[0].indexOf("latitude=40.8296") !== -1 &&
               wc[0].indexOf("longitude=-73.9264") !== -1,
               "forecast is one multi-location call with Yankee Stadium coords");
        wxRec.resolve(wxPayload(8, 5)); /* genuinely calm October day */
        settle(function(){
          var slot = slotFor("wx-mlb-1");
          assert(slot.hidden === true && slot.innerHTML === "",
                 "calm forecast leaves the MLB badge hidden and empty");

          /* re-render with a gusty forecast: the badge must appear */
          resetSlots();
          tabMLB._fire("click");
          settle(function(){
            assert(oddsDeferreds.length === 3, "MLB re-click re-pulls the odds API");
            oddsDeferreds[2].resolve(apiResponse(mlbEvents()));
            settle(function(){
              assert(espnCalls().length === 1,
                     "ESPN postseason board is session-cached across re-renders");
              assert(wxCalls().length === 2 && wxRec !== null,
                     "re-render re-forecasts (fresh weather, one call)");
              wxRec.resolve(wxPayload(33, 24)); /* gust front over the Bronx */
              settle(function(){
                var s2 = slotFor("wx-mlb-1");
                assert(s2.hidden === false, "gusty forecast reveals the MLB badge");
                assert(s2.innerHTML.indexOf("Yankee Stadium") !== -1,
                       "badge names the real ballpark: "+s2.innerHTML.slice(0,90));
                assert(s2.innerHTML.indexOf("direction decides") !== -1,
                       "badge carries the baseball wind note (not football copy)");
                assert(s2.innerHTML.indexOf("weather.html") !== -1,
                       "badge links to the full forecast page");
                console.log(failures ? ("\n"+failures+" FAILURES")
                                     : "\nALL ODDS-WX-MLB DOM TESTS PASS");
                process.exit(failures ? 1 : 0);
              });
            });
          });
        });
      });
    });
  });
});
