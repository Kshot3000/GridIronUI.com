/* GridIronUI middling calculator DOM wiring test — loads the shipped
   js/tools.js with a stubbed DOM and exercises the middle card: classic
   -110/-110 math, asymmetric prices, free-middle verdict, decimal format,
   custom-label XSS escaping, empty-note, bad-input errors.
   Run: node tests/test-middle-dom.js */
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

function setInputs(l1, s1, o1, l2, s2, o2, fmt){
  $("mLbl1").value = l1; $("mStake1").value = s1; $("mOdds1").value = o1;
  $("mLbl2").value = l2; $("mStake2").value = s2; $("mOdds2").value = o2;
  $("mFmt").value = fmt || "american";
}

/* empty inputs -> friendly note, not an error */
setInputs("", "", "", "", "", "", "american");
$("midGo").fire("click");
let out = $("midOut");
ok("midOut shown on empty", out.style.display === "block");
ok("empty note", out.innerHTML.includes("Enter both stakes"));

/* classic: Over 45.5 $110 @ -110, Under 48.5 $110 @ -110 */
setInputs("Over 45.5", "110", "-110", "Under 48.5", "110", "-110", "american");
$("midGo").fire("click");
out = $("midOut");
ok("shown", out.style.display === "block");
ok("both-win +$200.00", out.innerHTML.includes("+$200.00"));
ok("split cost \u2212$10.00 twice", (out.innerHTML.match(/\u2212\$10\.00/g) || []).length === 2);
ok("labels echoed", out.innerHTML.includes("Over 45.5") && out.innerHTML.includes("Under 48.5"));
ok("know-your-price verdict", out.innerHTML.includes("Know your price"));
ok("worst-case dollar", out.innerHTML.includes("$10.00"));
ok("push fine print", out.innerHTML.includes("softens the worst case"));
ok("line-movement honesty", out.innerHTML.includes("moved <em>after</em> your first bet"));
ok("risked figure", out.innerHTML.includes("$220.00"));

/* free middle: both sides at +200 -> worst split still pays */
setInputs("A", "100", "+200", "B", "100", "+200", "american");
$("midGo").fire("click");
out = $("midOut");
ok("free-middle verdict", out.innerHTML.includes("Free middle"));
ok("free split +$100.00", (out.innerHTML.match(/\+\$100\.00/g) || []).length >= 2);

/* decimal format path: $100 each at 1.91 -> both +$182.00, splits \u2212$9.00 */
setInputs("", "100", "1.91", "", "100", "1.91", "decimal");
$("midGo").fire("click");
out = $("midOut");
ok("decimal both-win +$182.00", out.innerHTML.includes("+$182.00"));
ok("decimal split \u2212$9.00", out.innerHTML.includes("\u2212$9.00"));

/* label XSS is escaped, never injected */
setInputs("<img src=x onerror=1>", "110", "-110", "B", "110", "-110", "american");
$("midGo").fire("click");
out = $("midOut");
ok("label escaped", out.innerHTML.includes("&lt;img") && !out.innerHTML.includes("<img src=x"));

/* bad input -> error text */
setInputs("A", "0", "-110", "B", "110", "-110", "american");
$("midGo").fire("click");
out = $("midOut");
ok("zero stake error", out.innerHTML.includes("greater than 0"));

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("test-middle-dom: " + pass + " assertions passed");
