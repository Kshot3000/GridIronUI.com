/* Verifies the injury-badge wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js, wx-shared.js, odds-wx.js, odds-pm.js,
   odds-inj.js and odds.js in a vm sandbox with stubbed DOM/fetch, then asserts:
   - NFL board render leaves a hidden [data-injcheck] slot on each game card;
   - after the ESPN injuries fetch resolves, a team with reportable injuries
     injects the badge line (counts + injury-wire link) and unhides the slot;
   - a healthy team stays silent; an unmatchable team name stays silent;
   - switching to a non-NFL tab fires no injuries fetch at all;
   - an injuries-feed failure never breaks the board (badge stays off).
   The failure case runs in a second, fresh sandbox so the session-level
   injuries cache doesn't cross-contaminate. */
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
  return [{ id:"inj-ev-1", home_team:"Chicago Bears", away_team:"Green Bay Packers",
            commence_time:KICK_ISO, bookmakers:[bkFixture()] }];
}
function mysteryEvents(){
  return [{ id:"inj-ev-2", home_team:"Shelbyville Sharks", away_team:"Springfield Atoms",
            commence_time:KICK_ISO, bookmakers:[bkFixture()] }];
}
function nbaEvents(){
  return [{ id:"inj-ev-nba", home_team:"Chicago Bulls", away_team:"Boston Celtics",
            commence_time:KICK_ISO, bookmakers:[bkFixture()] }];
}
function injuriesPayload(){
  return {injuries:[
    {displayName:"Chicago Bears", injuries:[
      {status:"Out"}, {status:"Out"}, {status:"Questionable"}, {status:"Active"}]},
    {displayName:"Green Bay Packers", injuries:[{status:"Active"}]}
  ]};
}

function setup(){
  var st = {
    els: {}, oddsDeferreds: [], jsonCalls: [], injRec: null, slots: {},
    tabNFL: null, tabNBA: null
  };
  function getEl(id){ if(!st.els[id]) st.els[id] = makeEl(id); return st.els[id]; }
  st.getEl = getEl;
  ["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
   "refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount"].forEach(getEl);
  var store = { "giu_odds_key": "TESTKEY" };
  var localStorageStub = {
    getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
    setItem: function(k, v){ store[k] = String(v); },
    removeItem: function(k){ delete store[k]; }
  };
  var fetchStub = function(){
    var rec = {};
    rec.promise = new Promise(function(res){ rec.resolve = res; });
    st.oddsDeferreds.push(rec);
    return rec.promise;
  };
  function fetchJSONStub(url){
    st.jsonCalls.push(url);
    var rec = {};
    rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
    if(url.indexOf("/injuries") !== -1) st.injRec = rec;
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
  function slotFor(oddsId){
    if(!st.slots[oddsId]) st.slots[oddsId] = { innerHTML:"", hidden:true };
    return st.slots[oddsId];
  }
  st.slotFor = slotFor;
  st.resetSlots = function(){ st.slots = {}; };
  var sandbox = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl, hidden: false,
      querySelectorAll: function(){ return []; },
      querySelector: function(sel){
        var m = /\[data-injcheck="([^"]+)"\]/.exec(sel);
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
      payout: function(){ return {combinedAm:"+100", combined:2.0, implied:0.5,
                                  profit:100, total:200}; },
      remove: function(){}, clear: function(){},
      normalize: function(legs){ return legs; },
      valueSummary: function(){ return null; }
    }
  };
  sandbox.window.GIU = sandbox.GIU;
  sandbox.window.OddsSlip = sandbox.OddsSlip;
  vm.createContext(sandbox);
  st.sandbox = sandbox;
  st.tabNFL = makeEl("tab-nfl"); st.tabNFL.setAttribute("data-sport","americanfootball_nfl");
  st.tabNBA = makeEl("tab-nba"); st.tabNBA.setAttribute("data-sport","basketball_nba");
  getEl("sportTabs")._children = [st.tabNFL, st.tabNBA];
  ["js/odds-logic.js","js/wx-shared.js","js/odds-wx.js","js/odds-pm.js",
   "js/odds-inj.js","js/odds.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
  });
  st.apiResponse = function(events){
    return { status:200, ok:true, headers:{get:function(){ return "499"; }},
             json:function(){ return Promise.resolve(events); } };
  };
  return st;
}

function settle(fn){ setTimeout(fn, 60); }

/* ---------------- phase 1: happy path, quiet cases, non-NFL silence ---------------- */
var s = setup();
assert(typeof s.sandbox.window.OddsInj === "object", "odds-inj.js exposes window.OddsInj");

settle(function(){
  assert(s.oddsDeferreds.length === 1, "initial NFL load fires one odds API fetch");
  s.oddsDeferreds[0].resolve(s.apiResponse(nflEvents()));
  settle(function(){
    var html = s.getEl("oddsBoard").innerHTML;
    assert(html.indexOf('data-injcheck="inj-ev-1"') !== -1,
           "NFL game card carries a hidden injury slot");
    assert(/data-injcheck="inj-ev-1"[^>]*hidden/.test(html),
           "injury slot starts hidden");
    var injCalls = s.jsonCalls.filter(function(u){ return u.indexOf("/injuries") !== -1; });
    assert(injCalls.length === 1, "injuries feed fires once, after the board renders");
    assert(injCalls[0].indexOf("football/nfl/injuries") !== -1,
           "injuries URL targets the ESPN NFL feed: "+injCalls[0]);
    assert(s.injRec !== null, "injuries fetch is in flight");
    s.injRec.resolve(injuriesPayload());
    settle(function(){
      var slot = s.slotFor("inj-ev-1");
      assert(slot.hidden === false, "reportable injuries reveal the badge");
      assert(slot.innerHTML.indexOf("<b>CHI</b> 2 out, 1 questionable") !== -1,
             "badge shows Bears counts (Active dropped): "+slot.innerHTML.slice(0,150));
      assert(slot.innerHTML.indexOf("GB") === -1,
             "healthy Packers stay silent on the badge");
      assert(slot.innerHTML.indexOf("injuries.html") !== -1,
             "badge links the injury wire");

      /* non-NFL tab: no injuries traffic at all */
      s.resetSlots();
      s.tabNBA._fire("click");
      settle(function(){
        assert(s.oddsDeferreds.length === 2, "NBA tab re-pulls the odds API");
        s.oddsDeferreds[1].resolve(s.apiResponse(nbaEvents()));
        settle(function(){
          var nbaHtml = s.getEl("oddsBoard").innerHTML;
          assert(nbaHtml.indexOf("data-injcheck") === -1,
                 "non-NFL cards get no injury slot at all");
          var ic = s.jsonCalls.filter(function(u){ return u.indexOf("/injuries") !== -1; }).length;
          assert(ic === 1, "switching to NBA fires no injuries fetch");

          /* unmatchable team name: stays silent */
          s.tabNFL._fire("click");
          settle(function(){
            s.oddsDeferreds[2].resolve(s.apiResponse(mysteryEvents()));
            settle(function(){
              var s2 = s.slotFor("inj-ev-2");
              assert(s2.hidden === true && s2.innerHTML === "",
                     "unmatchable team name leaves the badge hidden and empty");
              phase2();
            });
          });
        });
      });
    });
  });
});

/* ---------------- phase 2: feed failure in a fresh sandbox ---------------- */
function phase2(){
  var f = setup();
  settle(function(){
    f.oddsDeferreds[0].resolve(f.apiResponse(nflEvents()));
    settle(function(){
      assert(f.injRec !== null, "fresh sandbox attempts the injuries fetch");
      f.injRec.reject(new Error("blocked"));
      settle(function(){
        var slot = f.slotFor("inj-ev-1");
        assert(slot.hidden === true && slot.innerHTML === "",
               "feed failure keeps the badge off, board intact");
        assert(f.getEl("oddsBoard").innerHTML.indexOf("Chicago Bears") !== -1,
               "the odds board itself still rendered after the failure");
        console.log(failures ? ("\n"+failures+" FAILURES")
                             : "\nALL ODDS-INJ DOM TESTS PASS");
        process.exit(failures ? 1 : 0);
      });
    });
  });
}
