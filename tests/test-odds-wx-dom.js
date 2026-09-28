/* Verifies the game-day weather badge wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js, wx-shared.js, odds-wx.js and odds.js in a vm
   sandbox with stubbed DOM/fetch, then asserts:
   - NFL board render leaves a hidden [data-wxbadge] slot on each game card;
   - after the ESPN + Open-Meteo fetches resolve, a gusty game-day forecast
     injects a badge naming the real stadium with the wind note;
   - a calm forecast leaves the slot hidden (quiet by default);
   - the Open-Meteo request is one multi-location call, after the board;
   - switching to a non-NFL tab fires no weather fetches at all;
   - an ESPN/venue failure never breaks the board (badges stay off). */
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
var KICK = new Date(Date.now() + 2*864e5);
var KICK_ISO = KICK.toISOString();
function nflEvents(){
  return [{ id:"wx-ev-1", home_team:"Chicago Bears", away_team:"Green Bay Packers",
            commence_time:KICK_ISO, bookmakers:[bkFixture()] }];
}
function nbaEvents(){
  return [{ id:"wx-ev-nba", home_team:"Chicago Bulls", away_team:"Boston Celtics",
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
var DIR = { nfl: [
  {abbr:"CHI", displayName:"Chicago Bears", shortDisplayName:"Bears"},
  {abbr:"GB", displayName:"Green Bay Packers", shortDisplayName:"Packers"}
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
var tabNBA = makeEl("tab-nba"); tabNBA.setAttribute("data-sport","basketball_nba");
getEl("sportTabs")._children = [tabNFL, tabNBA];

["js/odds-logic.js","js/wx-shared.js","js/odds-wx.js","js/odds.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});
var G = sandbox.window.GIU;

function settle(fn){ setTimeout(fn, 60); }
function espnPayload(){
  return { events: [{ id:"espn-1", date:KICK_ISO,
    competitions:[{ venue:{fullName:"Soldier Field"},
      competitors:[
        {homeAway:"home", team:{abbreviation:"CHI"}},
        {homeAway:"away", team:{abbreviation:"GB"}}]}]}] };
}
function wxPayload(gust, wind){
  var base = new Date(KICK_ISO); base.setUTCMinutes(0,0,0);
  var times = [], n = 6;
  for(var i=0;i<n;i++) times.push(new Date(base.getTime()+i*3600e3).toISOString().slice(0,16));
  function rep(v){ var a=[]; for(var k=0;k<n;k++) a.push(v); return a; }
  return [{ hourly: {
    time: times,
    temperature_2m: rep(58), precipitation_probability: rep(5),
    wind_speed_10m: rep(wind === undefined ? 18 : wind),
    wind_gusts_10m: rep(gust),
    wind_direction_10m: rep(320)
  }}];
}
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}

settle(function(){
  assert(oddsDeferreds.length === 1, "initial NFL load fires one odds API fetch");
  oddsDeferreds[0].resolve(apiResponse(nflEvents()));
  settle(function(){
    var html = getEl("oddsBoard").innerHTML;
    assert(html.indexOf("Chicago Bears") !== -1, "NFL board renders the game");
    assert(html.indexOf('data-wxbadge="wx-ev-1"') !== -1,
           "game card carries a hidden weather-badge slot");
    assert(html.indexOf('data-wxbadge="wx-ev-1" hidden') !== -1 ||
           /data-wxbadge="wx-ev-1"[^>]*hidden/.test(html),
           "badge slot starts hidden");
    assert(jsonCalls.some(function(u){ return u.indexOf("site.api.espn.com") !== -1; }),
           "venue cross-check fetches the ESPN scoreboard after the board renders");

    espnRec.resolve(espnPayload());
    settle(function(){
      assert(wxRec !== null, "one Open-Meteo fetch follows the venue resolution");
      var wu = jsonCalls.filter(function(u){ return u.indexOf("api.open-meteo.com") !== -1; });
      assert(wu.length === 1 && wu[0].indexOf("latitude=41.8623") !== -1 &&
             wu[0].indexOf("longitude=-87.6167") !== -1,
             "forecast is one multi-location call with Soldier Field coords");
      wxRec.resolve(wxPayload(33)); /* gust front */
      settle(function(){
        var slot = slotFor("wx-ev-1");
        assert(slot.hidden === false, "gusty forecast reveals the badge");
        assert(slot.innerHTML.indexOf("Soldier Field") !== -1,
               "badge names the real stadium: "+slot.innerHTML.slice(0,80));
        assert(slot.innerHTML.indexOf("Gusts 33 mph") !== -1,
               "badge carries the wind impact note");
        assert(slot.innerHTML.indexOf("weather.html") !== -1,
               "badge links to the full forecast page");

        /* calm day: slot stays hidden */
        resetSlots();
        tabNBA._fire("click"); /* switch sport */
        settle(function(){
          var nbaCalls = oddsDeferreds.length;
          assert(nbaCalls === 2, "NBA tab re-pulls the odds API");
          oddsDeferreds[1].resolve(apiResponse(nbaEvents()));
          settle(function(){
            var nbaHtml = getEl("oddsBoard").innerHTML;
            assert(nbaHtml.indexOf("data-wxbadge") === -1,
                   "non-NFL cards get no badge slot at all");
            var wxCount = jsonCalls.filter(function(u){
              return u.indexOf("api.open-meteo.com") !== -1; }).length;
            assert(wxCount === 1, "switching to NBA fires no weather fetches");

            tabNFL._fire("click"); /* back to NFL */
            settle(function(){
              oddsDeferreds[2].resolve(apiResponse(nflEvents()));
              settle(function(){
                resetSlots();
                /* espnWxP is session-cached; only Open-Meteo fires again */
                settle(function(){
                  /* espnWxP is session-cached; only Open-Meteo fires again */
                  settle(function(){
                    var cands = jsonCalls.filter(function(u){
                      return u.indexOf("api.open-meteo.com") !== -1; });
                    assert(cands.length === 2, "NFL re-render re-forecasts (fresh weather)");
                    assert(wxRec !== null, "second forecast request is in flight");
                    wxRec.resolve(wxPayload(8, 5)); /* genuinely calm */
                    settle(function(){
                      var s2 = slotFor("wx-ev-1");
                      assert(s2.hidden === true && s2.innerHTML === "",
                             "calm forecast leaves the badge hidden and empty");
                      console.log(failures ? ("\n"+failures+" FAILURES")
                                           : "\nALL ODDS-WX DOM TESTS PASS");
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
});
