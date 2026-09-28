/* GridIronUI bonus & promo value DOM wiring test — loads the shipped
   js/tools.js with a stubbed DOM and exercises the bonus card: promo-type
   field toggling, bonus-bet hedge math (+150/-150), the EV route, the
   missing-input nudge, rollover math and its negative verdict, the profit
   boost with default vs supplied win chance, and bad-input errors.
   Run: node tests/test-bonus-dom.js */
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

function mode(t){
  $("bType").value = t;
  $("bType").fire("change");
}

/* promo-type toggling */
mode("bonus");
ok("bonus fields visible", $("bBonusFields").style.display === "");
ok("rollover hidden in bonus mode", $("bRolloverFields").style.display === "none");
mode("rollover");
ok("rollover fields visible", $("bRolloverFields").style.display === "");
ok("bonus hidden in rollover mode", $("bBonusFields").style.display === "none");
mode("boost");
ok("boost fields visible", $("bBoostFields").style.display === "");

/* bonus bet, hedged: $100 @ +150, hedge @ -150 -> $90.00 hedge, $60.00 locked, 60.0% */
mode("bonus");
$("bBonus").value = "100"; $("bPrice").value = "+150"; $("bFmt").value = "american";
$("bHedge").value = "-150"; $("bProb").value = "";
$("bGo").fire("click");
let out = $("bOut");
ok("shown", out.style.display === "block");
ok("risk-free hedge row", out.innerHTML.includes("Risk-free hedge"));
ok("hedge stake $90.00", out.innerHTML.includes("$90.00"));
ok("locked $60.00", out.innerHTML.includes("$60.00"));
ok("60.0% conversion", out.innerHTML.includes("60.0%"));

/* bonus bet, EV route: $100 @ +150 with 40% -> $60.00 expected, no hedge row */
$("bHedge").value = ""; $("bProb").value = "40";
$("bGo").fire("click");
out = $("bOut");
ok("your-number row", out.innerHTML.includes("Your-number value"));
ok("ev $60.00", out.innerHTML.includes("$60.00"));
ok("no hedge row when blank", !out.innerHTML.includes("Risk-free hedge"));

/* neither hedge nor prob -> friendly nudge, not an error */
$("bHedge").value = ""; $("bProb").value = "";
$("bGo").fire("click");
out = $("bOut");
ok("nudge asks for hedge or prob", out.innerHTML.includes("can't be priced from the offer alone"));

/* empty bonus -> example nudge */
$("bBonus").value = ""; $("bPrice").value = "";
$("bGo").fire("click");
out = $("bOut");
ok("empty nudge", out.innerHTML.includes("Enter the bonus amount"));

/* rollover: $200 bonus, 5x, 4.55% -> $154.50 true value, $45.50 cost, 20.0% break-even */
mode("rollover");
$("rBonus").value = "200"; $("rMult").value = "5"; $("rHold").value = "4.55";
$("bGo").fire("click");
out = $("bOut");
ok("true value $154.50", out.innerHTML.includes("$154.50"));
ok("playthrough cost $45.50", out.innerHTML.includes("$45.50"));
ok("break-even 20.0%", out.innerHTML.includes("20.0%"));
ok("genuinely valuable verdict", out.innerHTML.includes("Genuinely valuable"));

/* predatory rollover: $100, 10x, 12% -> -$20.00 verdict */
$("rBonus").value = "100"; $("rMult").value = "10"; $("rHold").value = "12";
$("bGo").fire("click");
out = $("bOut");
ok("costs-you-money verdict", out.innerHTML.includes("costs you money"));

/* profit boost: $50, -110 -> +100, default prob -> extra $2.50-ish, per-dollar cents */
mode("boost");
$("pStake").value = "50"; $("pOrig").value = "-110"; $("pBoost").value = "+100";
$("pFmt").value = "american"; $("pProb").value = "";
$("bGo").fire("click");
out = $("bOut");
ok("boost value row", out.innerHTML.includes("Boost value"));
ok("boost extra $2.38", out.innerHTML.includes("$2.38"));
ok("default-prob disclaimer", out.innerHTML.includes("52.4%"));
ok("per-dollar row", out.innerHTML.includes("Per dollar staked"));

/* boost with own number: 55% -> extra 50*0.0909*0.55 = $2.50, custom disclaimer */
$("pProb").value = "55";
$("bGo").fire("click");
out = $("bOut");
ok("own-number disclaimer", out.innerHTML.includes("55.0%"));

/* boost that doesn't improve -> error text */
$("pOrig").value = "+100"; $("pBoost").value = "-110"; $("pProb").value = "";
$("bGo").fire("click");
out = $("bOut");
ok("worse boost error", out.innerHTML.includes("must beat the original price"));

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("test-bonus-dom: " + pass + " assertions passed");
