/* GridIronUI round-robin DOM wiring test — loads the shipped js/tools.js with a
   stubbed DOM and exercises the round-robin calculator: leg rows, size boxes,
   calculate (values in the rendered table), empty-leg note, bad-stake error.
   Run: node tests/test-roundrobin-dom.js */
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
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename:"betmath.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/tools.js", "utf8"), sandbox, {filename:"tools.js"});

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }
const $ = id => sandbox.document.getElementById(id);

/* real BetMath in this process computes expectations from the same shipped code */
const BM = require("../js/betmath.js");
const d = BM.americanToDecimal(-110); /* 1.9090909... */
function money(v){ return "$" + v.toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2}); }

/* fill 3 legs with -110, check by-2s and by-3s, $10 per parlay */
for(let i = 1; i <= 3; i++){ $("rrLeg"+i).value = "-110"; $("rrLegf"+i).value = "american"; }
$("rrk2").checked = true; $("rrk3").checked = true;
$("rrStake").value = "10";
$("rrGo").fire("click");

const out = $("rrOut");
ok("rrOut shown", out.style.display === "block");
ok("by-2s row rendered", out.innerHTML.includes("by 2s"));
ok("by-3s row rendered", out.innerHTML.includes("by 3s"));

const rows = BM.roundRobin([d, d, d], [2, 3], 10);
const by2 = rows[0], by3 = rows[1];
ok("by2s parlay count", out.innerHTML.includes(by2.parlays + " × " + money(10)));
ok("by2s risk", out.innerHTML.includes(money(by2.totalRisk)));
ok("by2s all-win profit", out.innerHTML.includes("+" + money(by2.allWinProfit)));
ok("by2s all-win return", out.innerHTML.includes(money(by2.allWinReturn) + " back"));
ok("by2s worst-loser profit", out.innerHTML.includes("+" + money(by2.worstLoserProfit)));
ok("by2s richest combo", out.innerHTML.includes("legs 1+2 · " + by2.richestDec + "x"));
ok("by3s all-win profit", out.innerHTML.includes("+" + money(by3.allWinProfit)));
ok("by3s worst-loser loss", out.innerHTML.includes(money(by3.worstLoserProfit))); /* -$10.00 */
ok("vig honesty note", out.innerHTML.includes("52.38%"));

/* unchecking by-3s removes that row */
$("rrk3").checked = false;
$("rrGo").fire("click");
ok("unchecked size row dropped", !$("rrOut").innerHTML.includes("by 3s"));

/* empty legs -> friendly note, not an error */
for(let i = 1; i <= 3; i++){ $("rrLeg"+i).value = ""; }
$("rrGo").fire("click");
ok("empty legs note", $("rrOut").innerHTML.includes("Add at least two legs"));

/* bad stake -> error mentioning stake */
for(let i = 1; i <= 3; i++){ $("rrLeg"+i).value = "-110"; }
$("rrStake").value = "0";
$("rrGo").fire("click");
ok("zero stake error", $("rrOut").innerHTML.includes("stake per parlay"));

/* malformed odds -> error */
$("rrStake").value = "10";
$("rrLeg1").value = "banana";
$("rrGo").fire("click");
ok("bad odds error", $("rrOut").innerHTML.includes("American odds"));

/* size boxes render dynamically: clearing all legs removes by-2s+ */
for(let i = 1; i <= 3; i++){ $("rrLeg"+i).value = ""; $("rrLeg"+i).fire("input"); }
ok("sizes cleared when legs removed", $("rrSizes").innerHTML.includes("Add legs above"));

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("round-robin DOM wiring: " + pass + " assertions passed");
