/* Verifies the "Middle finder" wiring in the SHIPPED files (v1.140.0).
   Static pins: odds.html includes js/middle-finder.js?v=1.140.0 and bumps the
   odds-logic.js/odds.js cache keys; odds.js calls MiddleFinder.paint;
   middle-finder.js calls findMiddles/biggestMiddles.
   Live pins (vm sandbox, real odds-logic.js + middle-finder.js + odds.js,
   stubbed DOM/fetch): with a key, a board whose books disagree renders the
   Middle finder panel with the window and juice; a flat board renders the
   honest empty state; without a key the panel never runs and findMiddles is
   never called. paint() places the panel after the Sure bets strip when one
   exists, else at the top of the board.
   Run: node tests/test-middle-finder-dom.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---------- static pins on the shipped files ---------- */
var oddsHtml = fs.readFileSync(path.join(ROOT, "odds.html"), "utf8");
var oddsJsSrc = fs.readFileSync(path.join(ROOT, "js", "odds.js"), "utf8");
var mfSrc = fs.readFileSync(path.join(ROOT, "js", "middle-finder.js"), "utf8");
assert(oddsHtml.indexOf('src="js/middle-finder.js?v=1.140.0"') !== -1,
       "odds.html includes js/middle-finder.js?v=1.140.0");
assert(oddsHtml.indexOf('src="js/odds-logic.js?v=1.140.0"') !== -1,
       "odds.html bumps odds-logic.js to ?v=1.140.0");
assert(oddsHtml.indexOf('src="js/odds.js?v=1.140.0"') !== -1,
       "odds.html bumps odds.js to ?v=1.140.0");
assert(oddsJsSrc.indexOf("MiddleFinder.paint") !== -1,
       "shipped odds.js calls MiddleFinder.paint");
assert(mfSrc.indexOf("findMiddles(") !== -1,
       "shipped middle-finder.js calls findMiddles");
assert(mfSrc.indexOf("biggestMiddles(") !== -1,
       "shipped middle-finder.js calls biggestMiddles");
assert(oddsHtml.indexOf("Middle finder") !== -1,
       "odds.html notice box mentions the Middle finder");

/* ---------- vm sandbox (same shape as test-arbs-dom.js) ---------- */
function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", style: {}, value: "", className: "", checked: false,
    _attrs: {}, hidden: false,
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    querySelector: function(){ return null; },
    insertAdjacentHTML: function(pos, html){
      if(pos === "afterbegin") this.innerHTML = html + this.innerHTML;
      else this.innerHTML += html;
    },
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
function o(name, price, point){
  var r = { name: name, price: price };
  if(point !== undefined) r.point = point;
  return r;
}
/* DK Bears -2.5 / FD Packers +3.5 -> spread window (2.5,3.5);
   totals 44.5 vs 45.5 -> totals window (44.5,45.5) */
function midEvent(){
  return { id:"mid-1", home_team:"Green Bay Packers", away_team:"Chicago Bears",
    commence_time:new Date(Date.now()+2*864e5).toISOString(),
    bookmakers:[
      { key:"draftkings", title:"DraftKings", markets:[
        { key:"h2h", outcomes:[ o("Chicago Bears", 1.91), o("Green Bay Packers", 1.91) ]},
        { key:"spreads", outcomes:[ o("Chicago Bears", 1.91, -2.5), o("Green Bay Packers", 1.91, 2.5) ]},
        { key:"totals", outcomes:[ o("Over", 1.91, 44.5), o("Under", 1.91, 44.5) ]}]},
      { key:"fanduel", title:"FanDuel", markets:[
        { key:"h2h", outcomes:[ o("Chicago Bears", 1.91), o("Green Bay Packers", 1.91) ]},
        { key:"spreads", outcomes:[ o("Chicago Bears", 1.91, -3.5), o("Green Bay Packers", 1.91, 3.5) ]},
        { key:"totals", outcomes:[ o("Over", 1.91, 45.5), o("Under", 1.91, 45.5) ]}]}
    ]};
}
function flatEvent(){
  return { id:"flat-1", home_team:"Dallas Cowboys", away_team:"Philadelphia Eagles",
    commence_time:new Date(Date.now()+2*864e5).toISOString(),
    bookmakers:[
      { key:"draftkings", title:"DraftKings", markets:[
        { key:"h2h", outcomes:[ o("Philadelphia Eagles", 1.91), o("Dallas Cowboys", 1.91) ]},
        { key:"spreads", outcomes:[ o("Philadelphia Eagles", 1.91, -3.5), o("Dallas Cowboys", 1.91, 3.5) ]},
        { key:"totals", outcomes:[ o("Over", 1.91, 44.5), o("Under", 1.91, 44.5) ]}]},
      { key:"fanduel", title:"FanDuel", markets:[
        { key:"h2h", outcomes:[ o("Philadelphia Eagles", 1.91), o("Dallas Cowboys", 1.91) ]},
        { key:"spreads", outcomes:[ o("Philadelphia Eagles", 1.91, -3.5), o("Dallas Cowboys", 1.91, 3.5) ]},
        { key:"totals", outcomes:[ o("Over", 1.91, 44.5), o("Under", 1.91, 44.5) ]}]}
    ]};
}

function buildSandbox(keyPresent){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  ["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
   "refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount"].forEach(getEl);
  var store = keyPresent ? { "giu_odds_key": "TESTKEY" } : {};
  var deferreds = [];
  var sandbox = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    document: { getElementById: getEl, hidden: false,
      querySelectorAll: function(){ return []; },
      querySelector: function(){ return null; } },
    fetch: function(){
      var rec = {};
      rec.promise = new Promise(function(res){ rec.resolve = res; });
      deferreds.push(rec);
      return rec.promise;
    },
    localStorage: {
      getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
      setItem: function(k, v){ store[k] = String(v); },
      removeItem: function(k){ delete store[k]; }
    },
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
        return {"&":"&amp;","&lt;":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); },
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

  var fmCalls = 0;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds-logic.js"), "utf8"),
                  sandbox, {filename: "js/odds-logic.js"});
  var OL = sandbox.window.OddsLogic, orig = OL.findMiddles;
  OL.findMiddles = function(){ fmCalls++; return orig.apply(OL, arguments); };
  vm.runInContext(mfSrc, sandbox, {filename: "js/middle-finder.js"});
  vm.runInContext(oddsJsSrc, sandbox, {filename: "js/odds.js"});
  return { sb: sandbox, getEl: getEl, deferreds: deferreds,
           tabNBA: tabNBA, fmCalls: function(){ return fmCalls; },
           MF: sandbox.window.MiddleFinder };
}

function settle(fn){ setTimeout(fn, 60); }
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}

/* ---------- paint() placement unit pins (no full render needed) ---------- */
(function placement(){
  var ctx = buildSandbox(true);
  var MF = ctx.MF;
  assert(!!MF && typeof MF.paint === "function", "window.MiddleFinder.paint is exposed");
  var html = MF.panelHtml([], null);
  assert(html.indexOf("mid-card") !== -1, "panelHtml carries the mid-card class");
  assert(html.indexOf("no middles on the current board") !== -1,
         "empty panelHtml shows the honest empty state");
  assert(html.indexOf("🎯 Middle finder") !== -1, "panel header reads Middle finder");
  /* with a Sure bets strip present -> insert after it */
  var calls = [];
  var strip = { insertAdjacentHTML: function(pos, h){ calls.push([pos, h]); } };
  var board = { querySelector: function(){ return strip; },
                insertAdjacentHTML: function(){ calls.push(["board", ""]); } };
  MF.paint(board, [], 123);
  assert(calls.length === 1 && calls[0][0] === "afterend" &&
         calls[0][1].indexOf("mid-card") !== -1,
         "paint() inserts the panel right after the Sure bets strip");
  /* no strip -> top of the board */
  var calls2 = [];
  var board2 = { querySelector: function(){ return null; },
                 insertAdjacentHTML: function(pos, h){ calls2.push([pos, h]); } };
  MF.paint(board2, [], 123);
  assert(calls2.length === 1 && calls2[0][0] === "afterbegin",
         "paint() falls back to the top of the board without a strip");
  /* missing OddsLogic -> no-op, never a broken board */
  var threw = false;
  try{ MF.paint(board2, [], 123); }catch(e){ threw = true; }
  assert(!threw, "paint() is a safe no-op when wiring is missing");
})();

/* ---------- full flow: keyed board with a real middle ---------- */
var keyed = buildSandbox(true);
settle(function(){
  assert(keyed.deferreds.length === 1, "keyed load fires one odds API fetch");
  keyed.deferreds[0].resolve(apiResponse([midEvent()]));
  settle(function(){
    var html = keyed.getEl("oddsBoard").innerHTML;
    assert(html.indexOf("mid-card") !== -1, "board renders the Middle finder panel");
    assert(html.indexOf("🎯 Middle finder") !== -1, "panel header reads Middle finder");
    assert(html.indexOf('href="#game-mid-1"') !== -1, "panel row jump-links to the game card");
    assert(html.indexOf("Spread middle") !== -1, "panel names the spread middle");
    assert(html.indexOf("Total middle") !== -1, "panel names the totals middle");
    assert(html.indexOf("win both if the final lands between 2.5 and 3.5") !== -1,
           "spread row shows the honest win-both window");
    assert(html.indexOf("win both if the final lands between 44.5 and 45.5") !== -1,
           "totals row shows the honest win-both window");
    assert(html.indexOf("DraftKings") !== -1 && html.indexOf("FanDuel") !== -1,
           "panel names both books on the legs");
    assert(html.indexOf("-$9.00") !== -1, "panel shows the miss juice (-$9.00)");
    assert(html.indexOf("+$182.00") !== -1, "panel shows the hit juice (+$182.00)");
    assert(html.indexOf("not an edge") !== -1, "panel framing disclaims any edge");
    assert(keyed.fmCalls() > 0, "render calls findMiddles (live wiring, not just strings)");

    /* flat board: honest empty state, no windows claimed */
    keyed.tabNBA._fire("click");
    settle(function(){
      assert(keyed.deferreds.length === 2, "NBA tab re-pulls the odds API");
      keyed.deferreds[1].resolve(apiResponse([flatEvent()]));
      settle(function(){
        var nbaHtml = keyed.getEl("oddsBoard").innerHTML;
        assert(nbaHtml.indexOf("mid-card") !== -1,
               "panel shell still renders on a quiet board");
        assert(nbaHtml.indexOf("no middles on the current board") !== -1,
               "quiet board shows the honest empty state");
        assert(nbaHtml.indexOf("win both if the final lands between") === -1,
               "quiet board claims no window");

        /* ---------- no key: the finder never runs ---------- */
        var nokey = buildSandbox(false);
        settle(function(){
          var nkHtml = nokey.getEl("oddsBoard").innerHTML;
          assert(nokey.deferreds.length === 0, "no key fires no odds API fetch");
          assert(nkHtml.indexOf("mid-card") === -1,
                 "no-key board renders no Middle finder panel");
          assert(nokey.fmCalls() === 0,
                 "findMiddles is never called without a key");
          console.log(failures ? ("\n"+failures+" FAILURES")
                               : "\nALL MIDDLE-FINDER DOM TESTS PASS");
          process.exit(failures ? 1 : 0);
        });
      });
    });
  });
});
