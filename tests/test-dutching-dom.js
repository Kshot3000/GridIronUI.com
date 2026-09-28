/* GridIronUI dutching DOM wiring test — loads the shipped js/tools.js with a
   stubbed DOM and exercises the dutching calculator: selection rows, stake
   split values in the rendered table, arb vs locked-loss verdicts, empty
   note, bad-input errors. Run: node tests/test-dutching-dom.js */
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
function money(v){ return "$" + v.toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2}); }

/* three selections: +800, +1200, +2000 named, $100 total */
$("duName1").value = "Scheffler"; $("duLeg1").value = "+800"; $("duLegf1").value = "american";
$("duName2").value = "McIlroy";  $("duLeg2").value = "+1200"; $("duLegf2").value = "american";
$("duName3").value = "Rahm";      $("duLeg3").value = "+2000"; $("duLegf3").value = "american";
$("duStake").value = "100";
$("duGo").fire("click");

const out = $("duOut");
ok("duOut shown", out.style.display === "block");
const exp = BM.dutch([BM.americanToDecimal(800), BM.americanToDecimal(1200), BM.americanToDecimal(2000)], 100);
ok("names rendered", out.innerHTML.includes("Scheffler") && out.innerHTML.includes("McIlroy") && out.innerHTML.includes("Rahm"));
ok("stake per selection", out.innerHTML.includes(money(exp.legs[0].stake)) && out.innerHTML.includes(money(exp.legs[2].stake)));
ok("equal return shown", out.innerHTML.includes(money(exp.equalReturn)));
ok("combined implied shown", out.innerHTML.includes(exp.totalImpliedPct.toFixed(2) + "%"));
ok("arb verdict (prices imply under 100%)", out.innerHTML.includes("Arbitrage"));
ok("guaranteed profit shown", out.innerHTML.includes(money(exp.profit)));

/* same panel, vig-heavy prices -> locked-loss verdict */
$("duLeg1").value = "-110"; $("duLeg2").value = "-110"; $("duLeg3").value = "";
$("duGo").fire("click");
const exp2 = BM.dutch([BM.americanToDecimal(-110), BM.americanToDecimal(-110)], 100);
ok("locked-loss verdict", $("duOut").innerHTML.includes("Locked loss"));
ok("loss amount shown", $("duOut").innerHTML.includes(money(exp2.profit)));

/* empty selections -> friendly note, not an error */
for(let i = 1; i <= 3; i++){ $("duLeg"+i).value = ""; }
$("duGo").fire("click");
ok("empty selections note", $("duOut").innerHTML.includes("Add at least two selections"));

/* zero stake -> error mentioning stake */
$("duLeg1").value = "+800"; $("duLeg2").value = "+1200";
$("duStake").value = "0";
$("duGo").fire("click");
ok("zero stake error", $("duOut").innerHTML.includes("total stake"));

/* malformed odds -> error, no crash */
$("duStake").value = "100";
$("duLeg1").value = "banana";
$("duGo").fire("click");
ok("bad odds error", $("duOut").innerHTML.includes("American odds"));

/* names are escaped, not injected */
$("duLeg1").value = "+800"; $("duLeg2").value = "+1200";
$("duName1").value = "<img src=x onerror=alert(1)>";
$("duGo").fire("click");
ok("name escaped", $("duOut").innerHTML.includes("&lt;img") && !$("duOut").innerHTML.includes("<img src=x"));

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("dutching DOM wiring: " + pass + " assertions passed");
