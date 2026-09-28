/* GridIronUI bankroll-curve DOM tests (v1.60.0). Loads the shipped
   js/betmath.js + js/journal.js in a vm sandbox with a stubbed DOM and a
   recording canvas 2d context, then proves: the curve block hides with no
   settled bets, paints a DPR-aware chart once bets settle (sizing,
   aria-label, caption), and never throws when getContext() is null.
   Run: node tests/test-journal-curve-dom.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---------- recording 2d context (from test-winprob-dom.js) ---------- */
function recordingCtx(){
  var calls = [];
  function push(n){ return function(){ calls.push(n); }; }
  return { calls: calls,
    setTransform: push("setTransform"), save: push("save"), restore: push("restore"),
    clearRect: push("clearRect"), setLineDash: push("setLineDash"),
    beginPath: push("beginPath"), moveTo: push("moveTo"), lineTo: push("lineTo"),
    stroke: push("stroke"), fill: push("fill"), closePath: push("closePath"),
    arc: push("arc"), fillText: push("fillText"),
    createLinearGradient: function(){ return {addColorStop: function(){ calls.push("grad"); }}; }
  };
}

/* ---------- stub DOM ---------- */
var nullCtx = false; /* flip to simulate a canvas with no 2d context */
function makeEl(id){
  var attrs = {}, handlers = {};
  return {
    id: id, attrs: attrs, handlers: handlers, textContent: "", innerHTML: "",
    value: "", style: {}, className: "",
    clientWidth: 640, clientHeight: 220, width: 0, height: 0,
    setAttribute: function(k, v){ attrs[k] = String(v); },
    getAttribute: function(k){ return attrs[k]; },
    addEventListener: function(t, h){ (handlers[t] = handlers[t] || []).push(h); },
    getContext: function(){ return nullCtx ? null : this._ctx; },
    _ctx: recordingCtx(),
    appendChild: function(c){ return c; }, remove: function(){},
    closest: function(){ return null; }, querySelectorAll: function(){ return []; }
  };
}
var els = {};
var store = {};
var sandbox = {
  document: {
    getElementById: function(id){ return els[id] || (els[id] = makeEl(id)); },
    createElement: function(t){ return makeEl(t); },
    addEventListener: function(){},
    body: makeEl("body"),
    readyState: "complete"
  },
  localStorage: {
    getItem: function(k){ return k in store ? store[k] : null; },
    setItem: function(k, v){ store[k] = String(v); },
    removeItem: function(k){ delete store[k]; }
  },
  GIU: { esc: function(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); } },
  window: {}, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){}
};
sandbox.window = sandbox;
sandbox.window.GIU = sandbox.GIU;
sandbox.window.devicePixelRatio = 2;
sandbox.window.confirm = function(){ return true; };
vm.createContext(sandbox);

function loadShipped(){
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/betmath.js"), "utf8"), sandbox, {filename: "betmath.js"});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/journal.js"), "utf8"), sandbox, {filename: "journal.js"});
}
function B(o){
  return Object.assign({id: 1, date: "2026-09-20", sport: "NFL", event: "Bears @ Packers",
    market: "Moneyline", pick: "Bears", price: -110, stake: 100, result: "pending"}, o);
}
function seedBets(bets){ store["giu.journal.v1"] = JSON.stringify(bets); }
function render(){
  els = {}; /* fresh DOM handles, same localStorage */
  loadShipped();
  sandbox.window.Journal.render();
}

/* ---------- 1: no settled bets -> block hidden ---------- */
seedBets([ B({id: 1, result: "pending"}) ]);
render();
assert(els["jCurveWrap"].style.display === "none", "pending-only ledger hides the curve block");
assert(!els["jCurve"].attrs["aria-label"] || els["jCurve"].attrs["aria-label"] === "Bankroll curve",
  "no aria summary painted when hidden (got: " + els["jCurve"].attrs["aria-label"] + ")");

/* ---------- 2: settled bets -> DPR chart, aria, caption ---------- */
seedBets([
  B({id: 1, date: "2026-09-20", result: "win",  price: -110}), /* +90.91  */
  B({id: 2, date: "2026-09-21", result: "loss", price: -110}), /* -100    */
  B({id: 3, date: "2026-09-22", result: "win",  price: 150})   /* +150    */
]);
render();
assert(els["jCurveWrap"].style.display === "", "curve block visible once bets settle");
assert(els["jCurve"].width === 1280 && els["jCurve"].height === 440,
  "canvas sized from layout x DPR=2 (got " + els["jCurve"].width + "x" + els["jCurve"].height + ")");
var calls = els["jCurve"]._ctx.calls;
["clearRect","beginPath","lineTo","stroke","fill","arc","fillText","setLineDash"].forEach(function(c){
  assert(calls.indexOf(c) >= 0, "paint issues " + c);
});
var aria = els["jCurve"].attrs["aria-label"] || "";
assert(/3 settled bets/.test(aria) && /2026-09-20/.test(aria) && /2026-09-22/.test(aria),
  "aria-label carries the story (got: " + aria + ")");
assert(/cumulative/.test(els["jCurveCap"].textContent) && /140\.91/.test(els["jCurveCap"].textContent),
  "caption shows cumulative total (got: " + els["jCurveCap"].textContent + ")");

/* ---------- 3: losing ledger -> red line path still paints, no throw ---------- */
seedBets([ B({id: 1, date: "2026-09-20", result: "loss"}) ]);
try{
  render();
  assert(els["jCurveWrap"].style.display === "", "losing ledger still paints the curve");
  assert(/1 settled bets?/.test(els["jCurve"].attrs["aria-label"]), "aria counts the loss");
}catch(e){ assert(false, "losing ledger threw: " + e.message); }

/* ---------- 4: null 2d context -> silent no-op ---------- */
seedBets([ B({id: 1, date: "2026-09-20", result: "win"}) ]);
nullCtx = true;
try{
  render();
  assert(els["jCurveWrap"].style.display === "", "block stays visible even without a 2d context");
  assert(true, "null getContext() -> silent no-op");
}catch(e){ assert(false, "null context threw: " + e.message); }
nullCtx = false;

/* ---------- 5: empty ledger -> hidden, no crash ---------- */
seedBets([]);
try{
  render();
  assert(els["jCurveWrap"].style.display === "none", "empty ledger hides the curve block");
}catch(e){ assert(false, "empty ledger threw: " + e.message); }

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("journal bankroll curve DOM: all green");
