/* GridIronUI bet journal DOM wiring test — loads the shipped js/journal.js
   (+ betmath.js) with a stubbed DOM and localStorage, then exercises:
   add-bet validation errors, adding, settling win/loss/push, undo,
   delete, filters, unit-size math, CSV export, escaping, empty states.
   Run: node tests/test-journal-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");

function makeEl(id){
  const cls = new Set();
  const attrs = {};
  const handlers = {};
  const kids = [];
  const el = {
    id, attrs, handlers, kids, textContent: "", innerHTML: "", value: "",
    checked: false, style: {}, className: "", clicked: false,
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, force) => { const v = force !== undefined ? force : !cls.has(c); v ? cls.add(c) : cls.delete(c); return v; },
      contains: c => cls.has(c),
    },
    setAttribute: (k,v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k],
    addEventListener: (t,h) => { (handlers[t] = handlers[t] || []).push(h); },
    fire: function(t, ev){ (handlers[t] || []).forEach(h => h.call(this, ev || {})); return this; },
    appendChild: function(c){ kids.push(c); return c; },
    remove: function(){},
    click: function(){ this.clicked = true; },
    closest: function(){ return null; },
    querySelectorAll: () => [],
  };
  return el;
}
const els = {};
const store = {};
const sandbox = {
  document: {
    getElementById: id => (els[id] || (els[id] = makeEl(id))),
    createElement: tag => makeEl(tag),
    addEventListener: () => {},
    body: makeEl("body"),
    readyState: "complete",
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  GIU: {
    esc: s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
  },
  URL: { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} },
  setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout, console,
};
const blobParts = [];
sandbox.Blob = function(parts){ blobParts.push((parts || []).join("")); };
sandbox.window = sandbox;
sandbox.window.confirm = () => true;
vm.createContext(sandbox);
/* pre-seed the filter selects the way the real page renders them */
sandbox.document.getElementById("jFilterSport").value = "all";
sandbox.document.getElementById("jFilterResult").value = "all";
vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename:"betmath.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/journal.js", "utf8"), sandbox, {filename:"journal.js"});

let pass = 0, fail = 0;
function ok(name, cond, extra){ cond ? pass++ : (fail++, console.log("FAIL:", name, extra === undefined ? "" : extra)); }
const $ = id => sandbox.document.getElementById(id);
function setForm(ev, mk, pk, pr, st){
  $("jSport").value = "NFL"; $("jMarket").value = mk;
  $("jEvent").value = ev; $("jPick").value = pk;
  $("jPrice").value = pr; $("jStake").value = st;
  $("jDate").value = "2026-09-28";
}
function fakeBtn(clsName, id, r){
  const b = makeEl("btn");
  b.classList.add(clsName);
  b.setAttribute("data-id", String(id));
  if(r) b.setAttribute("data-r", r);
  b.closest = () => b;
  return b;
}

/* 1 — validation errors surface in jErr and block the add */
setForm("", "Spread", "Bears +3", "-110", "50");
$("jAdd").fire("click");
ok("empty event blocked", $("jErr").style.display === "block" && /Event is required/.test($("jErr").textContent));
setForm("Bears @ Packers", "Spread", "Bears +3", "abc", "50");
$("jAdd").fire("click");
ok("bad price blocked", /whole American number/.test($("jErr").textContent));
setForm("Bears @ Packers", "Spread", "Bears +3", "-50", "50");
$("jAdd").fire("click");
ok("dead-zone price blocked", /between -100 and/.test($("jErr").textContent));
setForm("Bears @ Packers", "Spread", "Bears +3", "-110", "0");
$("jAdd").fire("click");
ok("zero stake blocked", /more than \$0/.test($("jErr").textContent));
ok("no bets added yet", /No bets logged yet/.test($("jBetsBody").innerHTML));

/* 2 — a valid bet lands in the table, pending, and clears the form */
setForm("Bears @ Packers", "Spread", "Bears +3", "-110", "50");
$("jAdd").fire("click");
ok("error cleared", $("jErr").style.display === "none");
ok("row shows event", $("jBetsBody").innerHTML.includes("Bears @ Packers"));
ok("row shows pending chip", $("jBetsBody").innerHTML.includes("Pending"));
ok("pending P/L is dash", $("jBetsBody").innerHTML.includes(">—<"));
ok("form cleared", $("jEvent").value === "" && $("jPrice").value === "");
ok("summary pending 1", $("jSummary").innerHTML.includes("<b>1</b><span>Pending</span>"));
ok("count line", $("jCount").textContent === "1 bet logged");

/* 3 — settle as win: record, profit, units */
$("jBetsBody").fire("click", {target: fakeBtn("j-settle", 1, "win")});
ok("win chip", $("jBetsBody").innerHTML.includes(">Win<"));
ok("record 1-0-0", $("jSummary").innerHTML.includes("<b>1-0-0</b>"));
ok("net profit $45.45", $("jSummary").innerHTML.includes("$45.45"));
ok("units +0.45u", $("jSummary").innerHTML.includes("(+0.45u)"));
ok("per-sport row", $("jPerSport").innerHTML.includes("NFL") && $("jPerSport").innerHTML.includes("$45.45"));
ok("persisted", /"result":"win"/.test(store["giu.journal.v1"]));

/* 4 — add a second bet, settle loss; ROI + streak math */
setForm("Cubs vs Cards", "Moneyline", "Cubs", "+150", "40");
$("jSport").value = "MLB";
$("jAdd").fire("click");
$("jBetsBody").fire("click", {target: fakeBtn("j-settle", 2, "loss")});
ok("record 1-1-0", $("jSummary").innerHTML.includes("<b>1-1-0</b>"));
ok("net $5.45", $("jSummary").innerHTML.includes("$5.45")); /* 45.45 - 40 */
ok("roi shown", /ROI<\/span>|ROI/.test($("jSummary").innerHTML) && $("jSummary").innerHTML.includes("6.1%"));
ok("win rate 50", $("jSummary").innerHTML.includes("50.0%"));
ok("streak L1", $("jSummary").innerHTML.includes("<b>L1</b>"));

/* 5 — undo back to pending, then push */
$("jBetsBody").fire("click", {target: fakeBtn("j-undo", 2)});
ok("undo to pending", $("jBetsBody").innerHTML.includes(">Pending<"));
ok("record 1-0-0 again", $("jSummary").innerHTML.includes("<b>1-0-0</b>"));
$("jBetsBody").fire("click", {target: fakeBtn("j-settle", 2, "push")});
ok("push chip", $("jBetsBody").innerHTML.includes(">Push<"));
ok("push not in record denominator", $("jSummary").innerHTML.includes("100.0%"));

/* 6 — filters */
$("jFilterSport").value = "NBA";
sandbox.window.Journal.render();
ok("NBA filter empties", /No bets match these filters/.test($("jBetsBody").innerHTML));
$("jFilterSport").value = "all"; $("jFilterResult").value = "win";
sandbox.window.Journal.render();
ok("win filter shows one", $("jBetsBody").innerHTML.includes("Bears @ Packers") && !$("jBetsBody").innerHTML.includes("Cubs vs Cards"));
$("jFilterResult").value = "all";
sandbox.window.Journal.render();

/* 7 — escaping */
setForm("<script>alert(1)</script>", "Spread", "x", "-110", "10");
$("jAdd").fire("click");
ok("event escaped", $("jBetsBody").innerHTML.includes("&lt;script&gt;") && !$("jBetsBody").innerHTML.includes("<script>alert"));

/* 8 — CSV export */
blobParts.length = 0;
$("jExport").fire("click");
ok("csv blob built", blobParts.length === 1 && blobParts[0].startsWith("date,sport,event,market,pick,price,close,stake,result,profit_usd"));
ok("csv has 3 rows", blobParts[0].split("\n").length === 4);
ok("csv escapes event", blobParts[0].includes('"<script>alert(1)</script>"') === false && blobParts[0].includes("&lt;script&gt;") === false);
ok("csv quotes the angle-bracket event", blobParts[0].includes("<script>alert(1)</script>"));

/* 9 — unit size change re-renders units */
$("jUnit").value = "50";
$("jUnit").fire("change");
ok("units at $50", $("jSummary").innerHTML.includes("(+0.91u)"));
$("jUnit").value = "-5";
$("jUnit").fire("change");
ok("bad unit size rejected", String($("jUnit").value) === "50");

/* 10 — delete + clear */
$("jBetsBody").fire("click", {target: fakeBtn("j-del", 3)});
ok("delete removes row", !$("jBetsBody").innerHTML.includes("alert(1)"));
ok("count 2", $("jCount").textContent === "2 bets logged");
$("jClear").fire("click");
ok("clear empties journal", /No bets logged yet/.test($("jBetsBody").innerHTML));
ok("clear persists", store["giu.journal.v1"] === "[]");

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail ? 1 : 0);
