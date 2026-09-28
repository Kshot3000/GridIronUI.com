/* GridIronUI expected-value calculator DOM wiring test — loads the shipped
   js/tools.js with a stubbed DOM and exercises the EV calculator: +EV/-EV
   verdicts, dollar and edge math, break-even, format selector, default
   stake, empty note, bad-input errors.
   Run: node tests/test-ev-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");

function makeEl(id){
  const cls = new Set();
  const attrs = {};
  const handlers = {};
  const kids = [];
  return {
    id, attrs, handlers, kids, textContent: "", innerHTML: "", value: "",
    checked: false, style: {}, className: "",
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, force) => { const v = force !== undefined ? force : !cls.has(c); v ? cls.add(c) : cls.delete(c); return v; },
      contains: c => cls.has(c),
    },
    setAttribute: (k,v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k],
    addEventListener: (t,h) => { (handlers[t] = handlers[t] || []).push(h); },
    fire: function(t, ev){ (handlers[t] || []).forEach(h => h.call(this, ev || {})); },
    appendChild: function(c){ kids.push(c); return c; },
    querySelectorAll: () => [],
    closest: () => null,
    scrollIntoView: () => {},
  };
}
const els = {};
const sandbox = {
  document: {
    getElementById: id => (els[id] || (els[id] = makeEl(id))),
    createElement: tag => makeEl(tag),
    addEventListener: () => {},
  },
  GIU: {
    esc: s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
  },
  setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout, console,
  Math, JSON, Number, String, Array, Object, parseFloat, parseInt, isFinite,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename:"betmath.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/tools.js", "utf8"), sandbox, {filename:"tools.js"});

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }
const $ = id => sandbox.document.getElementById(id);

function setInputs(prob, odds, fmt, stake){
  $("evProb").value = prob; $("evOdds").value = odds;
  $("evFmt").value = fmt || "american"; $("evStake").value = stake === undefined ? "" : stake;
}

/* +EV case: 55% true at +120 (2.20) on $100 -> +$21.00, +21.00% edge */
setInputs("55", "+120", "american", "100");
$("evGo").fire("click");
let out = $("evOut");
ok("evOut shown", out.style.display === "block");
ok("+EV verdict", out.innerHTML.includes("+EV"));
ok("EV dollars +$21.00", out.innerHTML.includes("+$21.00"));
ok("edge +21.00%", out.innerHTML.includes("+21.00%"));
ok("break-even 45.45%", out.innerHTML.includes("45.45%"));
ok("kelly link", out.innerHTML.includes("#kelly"));
ok("fine print honesty", out.innerHTML.includes("only as honest as your probability"));

/* -EV case: coin flip at -110 (1.9091) on $100 -> -$4.55, -4.55% edge */
setInputs("50", "-110", "american", "100");
$("evGo").fire("click");
out = $("evOut");
ok("-EV verdict", out.innerHTML.includes("\u2212EV at your number"));
ok("EV dollars -$4.55", out.innerHTML.includes("\u2212$4.55"));
ok("edge -4.55%", out.innerHTML.includes("\u22124.55%"));
ok("break-even 52.38%", out.innerHTML.includes("52.38%"));

/* default stake: empty stake field prices it at $100 */
setInputs("55", "+120", "american", "");
$("evGo").fire("click");
ok("default stake $100", $("evOut").innerHTML.includes("+$21.00"));

/* custom stake scales: 55% @ +120 on $250 -> +$52.50 */
setInputs("55", "+120", "american", "250");
$("evGo").fire("click");
ok("stake scaling $52.50", $("evOut").innerHTML.includes("+$52.50"));

/* fractional format: 60% @ 6/4 (=2.50) -> +$50.00 on $100 */
setInputs("60", "6/4", "fractional", "100");
$("evGo").fire("click");
ok("fractional +$50.00", $("evOut").innerHTML.includes("+$50.00"));

/* decimal format: 40% @ 3.00 -> +$20.00 on $100 */
setInputs("40", "3.00", "decimal", "100");
$("evGo").fire("click");
ok("decimal +$20.00", $("evOut").innerHTML.includes("+$20.00"));

/* empty inputs: friendly note, not an error */
setInputs("", "", "american", "");
$("evGo").fire("click");
ok("empty note", $("evOut").innerHTML.includes("Calculate EV"));

/* bad probability: 0% is not a bet */
setInputs("0", "+120", "american", "100");
$("evGo").fire("click");
ok("zero prob error", $("evOut").innerHTML.includes("Win probability"));

/* bad odds: error message, no crash */
setInputs("55", "abc", "american", "100");
$("evGo").fire("click");
ok("bad odds error", $("evOut").innerHTML.includes("Enter American odds"));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
