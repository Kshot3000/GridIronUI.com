/* Verifies the no-key empty state in the SHIPPED js/odds.js (v1.69.0).
   Fresh visual QA caught the real-world gap: with no Odds API key connected,
   the board area rendered as a blank void (plus an unfilled ad slot), which
   reads like a failed load. The fix renders an in-place empty panel with a
   "Connect my key" CTA instead of empty markup. Asserts:
   - with no key: the setup card is shown, the board carries the #oddsNoKey
     panel (CTA button + the "never show sample or stale lines" honesty line,
     role="status"), no spinner, no API fetch fires, quota line stays empty;
   - clicking the CTA scrolls the setup card into view and focuses the key
     input (defensive: no crash when scrollIntoView/focus are absent);
   - after the key is saved via the setup card, the empty panel is replaced
     by the loading spinner and the API fetch fires (no stuck empty state).
   Run: node tests/test-odds-nokey.js */
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
    _text: "", _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    hasAttribute: function(k){ return this._attrs.hasOwnProperty(k); },
    removeAttribute: function(k){ delete this._attrs[k]; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev, evt){ (handlers[ev]||[]).forEach(function(fn){ fn.call(el, evt || {}); }); }
  };
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
 "refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount","alertThr",
 "alertToasts"].forEach(getEl);

/* no Odds API key in localStorage: the visitor hasn't connected one */
var store = {};
var localStorageStub = {
  getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v){ store[k] = String(v); },
  removeItem: function(k){ delete store[k]; }
};

var fetchCalls = 0;
var fetchStub = function(){ fetchCalls++; return new Promise(function(){}); };

var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: { getElementById: getEl, hidden: false,
              querySelectorAll: function(){ return []; } },
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
    sameGame: function(){ return []; },
    valueSummary: function(){ return null; }
  }
};
sandbox.window.GIU = sandbox.GIU;
sandbox.window.OddsSlip = sandbox.OddsSlip;
vm.createContext(sandbox);

/* two sport tabs so the script's tab wiring runs */
var tabNFL = makeEl("tab-nfl"); tabNFL.setAttribute("data-sport","americanfootball_nfl");
getEl("sportTabs")._children = [tabNFL];

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds-logic.js"), "utf8"),
                sandbox, {filename: "js/odds-logic.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds.js"), "utf8"),
                sandbox, {filename: "js/odds.js"});

function settle(fn){ setTimeout(fn, 80); }

settle(function(){
  var boardHtml = getEl("oddsBoard").innerHTML;

  assert(fetchCalls === 0,
         "no API fetch fires without a key (quota untouched), got "+fetchCalls);
  assert(getEl("oddsSetup").style.display === "block",
         "setup card is shown when no key is connected");
  assert(boardHtml.indexOf('id="oddsNoKey"') !== -1,
         "board renders the in-place no-key empty panel, not blank markup");
  assert(boardHtml.indexOf('id="oddsNoKeyBtn"') !== -1,
         "empty panel carries the 'Connect my key' CTA button");
  assert(boardHtml.indexOf("never show sample or stale lines") !== -1,
         "empty panel keeps the honesty line about sample/stale lines");
  assert(boardHtml.indexOf('role="status"') !== -1,
         "empty panel is exposed as a status region for assistive tech");
  assert(boardHtml.indexOf("spinner") === -1 && boardHtml.indexOf("Pulling live lines") === -1,
         "no loading spinner is shown when nothing is loading");
  assert(getEl("quota").textContent === "",
         "quota line stays empty with no key");

  /* CTA click: scrolls the setup card into view, focuses the key input */
  var scrolled = null, focused = false;
  getEl("oddsSetup").scrollIntoView = function(opts){ scrolled = opts || {}; };
  getEl("keyInput").focus = function(){ focused = true; };
  var fakeBtn = { id: "oddsNoKeyBtn" };
  getEl("oddsBoard")._fire("click", { target: { closest: function(sel){
    return sel === "#oddsNoKeyBtn" ? fakeBtn : null;
  }}});
  assert(scrolled && scrolled.behavior === "smooth",
         "CTA click smooth-scrolls to the setup card");
  setTimeout(function(){
    assert(focused, "key input is focused after the scroll");

    /* key-save transition: empty panel gives way to the loading spinner */
    getEl("keyInput").value = "K2TESTKEY";
    getEl("saveKey")._fire("click");
    settle(function(){
      var after = getEl("oddsBoard").innerHTML;
      assert(after.indexOf('id="oddsNoKey"') === -1,
             "empty panel is replaced once the key is saved");
      assert(after.indexOf("Pulling live lines") !== -1,
             "board shows the loading state after the key is saved");
      assert(fetchCalls === 1,
             "saving the key fires the odds API fetch, got "+fetchCalls);
      assert(getEl("oddsSetup").style.display === "none",
             "setup card hides once the key is connected");
      console.log(failures ? ("\n"+failures+" FAILURES") : "\nall no-key empty-state assertions passed");
      process.exit(failures ? 1 : 0);
    });
  }, 550);
});
