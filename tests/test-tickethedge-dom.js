/* GridIronUI ticket-hedge DOM wiring test — loads the shipped js/tools.js with a
   stubbed DOM and exercises the ticket hedge planner: three plans render,
   custom stake fills the third card, empty/bad input is handled honestly.
   Run: node tests/test-tickethedge-dom.js */
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
function money2(v){ return "$" + v.toFixed(2); }

/* $100 ticket paying $2,400 in full, hedge at -110, custom hedge stake $500 */
$("thStake").value = "100";
$("thPays").value = "2400";
$("thHedge").value = "-110";
$("thFmt").value = "american";
$("thCustom").value = "500";
$("thGo").fire("click");

const out = $("thOut");
const r = BM.ticketHedge(100, 2400, d);
ok("thOut shown", out.style.display === "block");
ok("equal lock label", out.innerHTML.includes("Equal lock"));
ok("equal lock stake", out.innerHTML.includes(money2(r.equalStake)));
ok("equal lock profit", out.innerHTML.includes(money2(r.equalProfit)));
ok("free-roll label", out.innerHTML.includes("Free-roll"));
ok("free-roll stake", out.innerHTML.includes(money2(r.freeStake)));
ok("custom plan label", out.innerHTML.includes("Your stake"));
const c = r.outcomes(500);
ok("custom stake", out.innerHTML.includes(money2(c.stake)));
ok("custom miss", out.innerHTML.includes(money2(c.profitMiss)));
ok("let-it-ride line", out.innerHTML.includes("Let it ride instead"));
ok("ride upside", out.innerHTML.includes(money2(r.rideProfit)));
ok("insurance cost", out.innerHTML.includes(money2(r.insuranceCost)));
ok("vig-twice honesty note", out.innerHTML.includes("vig twice"));

/* no custom stake -> third card is a placeholder, not an error */
$("thCustom").value = "";
$("thGo").fire("click");
ok("no custom stake placeholder", $("thOut").innerHTML.includes("Type a hedge stake above"));

/* short hedge price -> planner says the lock guarantees a loss, honestly */
$("thStake").value = "100";
$("thPays").value = "300";
$("thHedge").value = "-400";
$("thCustom").value = "";
$("thGo").fire("click");
const r2 = BM.ticketHedge(100, 300, BM.americanToDecimal(-400));
ok("short-price loss warning", $("thOut").innerHTML.includes("guarantees a"));
ok("short-price loss amount", $("thOut").innerHTML.includes(money2(Math.abs(r2.equalProfit))));

/* empty fields -> friendly note, not an error */
$("thStake").value = "";
$("thPays").value = "2400";
$("thHedge").value = "-110";
$("thGo").fire("click");
ok("empty fields note", $("thOut").innerHTML.includes("Enter your stake"));

/* bad hedge odds -> error mentioning the format */
$("thStake").value = "100";
$("thPays").value = "2400";
$("thHedge").value = "banana";
$("thGo").fire("click");
ok("bad hedge odds error", $("thOut").innerHTML.includes("American odds"));

/* payout <= stake -> validation error */
$("thHedge").value = "-110";
$("thPays").value = "100";
$("thGo").fire("click");
ok("payout<=stake error", $("thOut").innerHTML.includes("exceed the original stake"));

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("ticket-hedge DOM wiring: " + pass + " assertions passed");
