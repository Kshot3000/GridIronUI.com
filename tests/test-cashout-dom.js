/* GridIronUI cash-out evaluator DOM wiring test — loads the shipped
   js/tools.js with a stubbed DOM and exercises the cash-out calculator:
   decline/take/close verdicts, fair-value and DIY-hedge math, format selector,
   empty note, bad-input errors.
   Run: node tests/test-cashout-dom.js */
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

function setInputs(stake, offer, orig, now, fmt){
  $("coStake").value = stake; $("coOffer").value = offer;
  $("coOrig").value = orig; $("coNow").value = now; $("coFmt").value = fmt || "american";
}

/* decline case: $100 at +150, now -110, offer $120 */
setInputs("100", "120", "+150", "-110", "american");
$("coGo").fire("click");
let out = $("coOut");
ok("coOut shown", out.style.display === "block");
ok("decline verdict", out.innerHTML.includes("Decline it"));
ok("fair value $130.95", out.innerHTML.includes("$130.95"));
ok("book cut shown", out.innerHTML.includes("8.36") || out.innerHTML.includes("8.4"));
ok("DIY hedge stake $119.05", out.innerHTML.includes("$119.05"));
ok("locks in copy", out.innerHTML.includes("locks in"));
ok("odds board link", out.innerHTML.includes("odds.html"));
ok("fine print present", out.innerHTML.includes("never creates edge") || out.innerHTML.includes("vig-free"));

/* take case: offer $135 above fair */
setInputs("100", "135", "+150", "-110", "american");
$("coGo").fire("click");
ok("take verdict", $("coOut").innerHTML.includes("Take the cash-out"));

/* close case: offer $130 within 3% of fair */
setInputs("100", "130", "+150", "-110", "american");
$("coGo").fire("click");
ok("close verdict", $("coOut").innerHTML.includes("Close call"));

/* decimal format: $50 at 6.0, now 3.0, offer 90 -> decline, fair $100.00, DIY $200.00 */
setInputs("50", "90", "6.0", "3.0", "decimal");
$("coGo").fire("click");
ok("decimal decline", $("coOut").innerHTML.includes("Decline it"));
ok("decimal fair value", $("coOut").innerHTML.includes("$100.00"));
ok("decimal DIY stake", $("coOut").innerHTML.includes("$200.00"));

/* empty inputs: friendly note, not an error */
setInputs("", "", "", "", "american");
$("coGo").fire("click");
ok("empty note", $("coOut").innerHTML.includes("Evaluate the offer"));

/* bad odds: error message, no crash */
setInputs("100", "120", "abc", "-110", "american");
$("coGo").fire("click");
ok("bad input error", $("coOut").innerHTML.includes("Enter American odds"));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
