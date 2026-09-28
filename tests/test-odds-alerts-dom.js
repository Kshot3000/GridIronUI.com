/* Verifies the line-move alert wiring in the SHIPPED js/odds.js.
   Loads the real odds-logic.js and odds.js in a vm sandbox with stubbed
   DOM/fetch, then asserts:
   - the first pull with alerts on only seeds the baseline (no toast —
     nothing moved yet);
   - a later pull with a >=1pt consensus move fires one toast with the
     game link, the from→to line, and the direction arrow;
   - the same move never fires twice (re-baselined);
   - a started game's move stays silent;
   - toasts cap at 3 and the dismiss button removes one;
   - turning alerts off stops all toasts.
   Run: node tests/test-odds-alerts-dom.js */
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
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
 "alertThr","refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount"].forEach(getEl);

/* toasts box: DOM-ish child list for insertBefore/removeChild/cap logic */
(function(){
  var box = getEl("alertToasts");
  box.kids = [];
  box._sync = function(){
    box.children = box.kids;
    box.firstChild = box.kids[0] || null;
    box.lastChild = box.kids[box.kids.length-1] || null;
  };
  box.insertBefore = function(ch){ ch.parentNode = box; box.kids.unshift(ch); box._sync(); return ch; };
  box.removeChild = function(ch){
    box.kids = box.kids.filter(function(k){ return k !== ch; });
    box._sync(); return ch;
  };
  box.querySelectorAll = function(sel){
    return sel === ".alert-toast" ? box.kids.slice() : [];
  };
  box._sync();
})();

var store = { "giu_odds_key": "TESTKEY", "giu_odds_alert_thr": "1" };
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
function mvEvent(id, awayPt, totalPt, started){
  return { id: id, home_team: "Green Bay Packers", away_team: "Chicago Bears",
    commence_time: new Date(Date.now() + (started ? -3600e3 : 2*864e5)).toISOString(),
    bookmakers: [
      { key: "draftkings", title: "DraftKings", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", 1.91, awayPt), o("Green Bay Packers", 1.91, -awayPt) ]},
        { key: "totals", outcomes: [ o("Over", 1.91, totalPt), o("Under", 1.91, totalPt) ]}]},
      { key: "fanduel", title: "FanDuel", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", 1.91, awayPt), o("Green Bay Packers", 1.91, -awayPt) ]},
        { key: "totals", outcomes: [ o("Over", 1.91, totalPt), o("Under", 1.91, totalPt) ]}]}
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
    querySelector: function(){ return null; },
    createElement: function(){ return makeEl("toast"); } },
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
function toasts(){ return getEl("alertToasts").kids; }

settle(function(){
  assert(oddsDeferreds.length === 1, "initial NFL load fires one odds API fetch");
  assert(getEl("alertThr").value === "1",
         "alert threshold select restores the persisted 1-pt preference");
  /* pull 1: spread -3, total 44.5 — seeds the baseline, fires nothing */
  oddsDeferreds[0].resolve(apiResponse([mvEvent("mv-1", -3, 44.5)]));
  settle(function(){
    assert(toasts().length === 0,
           "first pull with alerts on only seeds the baseline — no toast");
    /* pull 2: spread steams to -4.5 (1.5-pt move) + a started game's move */
    getEl("refreshBtn")._fire("click");
    settle(function(){
      assert(oddsDeferreds.length === 2, "refresh fires the second pull");
      oddsDeferreds[1].resolve(apiResponse([
        mvEvent("mv-1", -4.5, 44.5),
        mvEvent("mv-old", -1, 50, true) /* started: -3 -> -1 is big but silent */
      ]));
      settle(function(){
        var ts = toasts();
        assert(ts.length === 1, "exactly one toast fires for the 1.5-pt spread move");
        var html = ts[0].innerHTML;
        assert(html.indexOf('href="#game-mv-1"') !== -1,
               "toast jump-links to the moved game card");
        assert(html.indexOf("Spread -3 → -4.5") !== -1,
               "toast shows the from→to consensus line");
        assert(html.indexOf("mv-dn") !== -1 && html.indexOf("▼") !== -1,
               "toast shows the down direction for the move");
        assert(html.indexOf('role="status"') !== -1 || ts[0].getAttribute("role") === "status",
               "toast carries role=status for screen readers");
        assert(html.indexOf("alert-x") !== -1,
               "toast has a dismiss button");
        assert(ts[0].getAttribute("data-alert") === "mv-1|spread",
               "toast is keyed by game+kind for dedupe");
        /* pull 3: same lines again — no re-fire */
        getEl("refreshBtn")._fire("click");
        settle(function(){
          oddsDeferreds[2].resolve(apiResponse([mvEvent("mv-1", -4.5, 44.5)]));
          settle(function(){
            assert(toasts().length === 1,
                   "identical lines on the next pull fire nothing (re-baselined)");
            /* dismiss the toast */
            var toast = toasts()[0];
            getEl("alertToasts")._fire("click", { target: { closest: function(){
              return { parentNode: toast };
            }}});
            assert(toasts().length === 0, "dismiss button removes the toast");
            /* alerts off: a fresh 2-pt move stays silent */
            getEl("alertThr").value = "0";
            getEl("alertThr")._fire("change");
            assert(store["giu_odds_alert_thr"] === "0",
                   "the off preference persists to localStorage");
            getEl("refreshBtn")._fire("click");
            settle(function(){
              oddsDeferreds[3].resolve(apiResponse([mvEvent("mv-1", -6.5, 44.5)]));
              settle(function(){
                assert(toasts().length === 0,
                       "with alerts off, even a 2-pt move fires no toast");
                console.log(failures ? ("\n"+failures+" FAILURES")
                                     : "\nALL ALERT DOM TESTS PASS");
                process.exit(failures ? 1 : 0);
              });
            });
          });
        });
      });
    });
  });
});
