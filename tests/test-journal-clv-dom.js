/* GridIronUI bet journal CLV (closing line value) wiring test — loads the
   shipped js/journal.js (+ betmath.js) with a stubbed DOM and localStorage,
   then exercises: the inline closing-price editor (open/save/invalid/cancel/
   clear), the per-row ▲/▼/= close chip, the dashboard "Beat the close" stat
   and its honesty caption, and the close column in the CSV export.
   Run: node tests/test-journal-clv-dom.js */
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

/* 1 — a freshly logged bet has no close: no chip, no summary stat */
setForm("Bears @ Packers", "Spread", "Bears +3", "-110", "50");
$("jAdd").fire("click");
ok("row logged", $("jBetsBody").innerHTML.includes("Bears @ Packers"));
ok("no close chip without data", !$("jBetsBody").innerHTML.includes("close -"));
ok("beat-the-close stat hidden until first close", !$("jSummary").innerHTML.includes("Beat the close"));

/* 2 — open the inline editor, save a valid closing price */
$("jBetsBody").fire("click", {target: fakeBtn("j-close-edit", 1)});
ok("editor opens", $("jBetsBody").innerHTML.includes('id="jCloseIn"'));
$("jCloseIn").value = "-120";
$("jBetsBody").fire("click", {target: fakeBtn("j-close-save", 1)});
ok("beat chip shown", $("jBetsBody").innerHTML.includes("▲ close -120"));
ok("persisted", /"close":-120/.test(store["giu.journal.v1"]));
ok("stat appears 1/1", $("jSummary").innerHTML.includes("<b>1/1</b><span>Beat the close"));
ok("stat pct", $("jSummary").innerHTML.includes("100% of recorded closes"));
ok("honesty caption", $("jSummary").innerHTML.includes("books close differently"));

/* 3 — record a second bet with a worse close; stat becomes 1/2 */
setForm("Cubs vs Cards", "Moneyline", "Cubs", "+150", "40");
$("jSport").value = "MLB";
$("jAdd").fire("click");
$("jBetsBody").fire("click", {target: fakeBtn("j-close-edit", 2)});
$("jCloseIn").value = "+170";
$("jBetsBody").fire("click", {target: fakeBtn("j-close-save", 2)});
ok("worse chip shown", $("jBetsBody").innerHTML.includes("▼ close +170"));
ok("stat 1/2", $("jSummary").innerHTML.includes("<b>1/2</b><span>Beat the close"));
ok("stat pct 50", $("jSummary").innerHTML.includes("50% of recorded closes"));

/* 4 — invalid close: error, edit mode preserved, old value kept */
$("jBetsBody").fire("click", {target: fakeBtn("j-close-edit", 1)});
$("jCloseIn").value = "abc";
$("jBetsBody").fire("click", {target: fakeBtn("j-close-save", 1)});
ok("invalid close rejected", /Closing price must be/.test($("jErr").textContent));
ok("edit mode survives failure", $("jBetsBody").innerHTML.includes('id="jCloseIn"'));
ok("old close kept", /"close":-120/.test(store["giu.journal.v1"]));

/* 5 — cancel discards the edit */
$("jBetsBody").fire("click", {target: fakeBtn("j-close-cancel", 1)});
ok("cancel closes editor", !$("jBetsBody").innerHTML.includes('id="jCloseIn"'));
ok("chip back on row", $("jBetsBody").innerHTML.includes("▲ close -120"));

/* 6 — blank save clears the close */
$("jBetsBody").fire("click", {target: fakeBtn("j-close-edit", 2)});
$("jCloseIn").value = "   ";
$("jBetsBody").fire("click", {target: fakeBtn("j-close-save", 2)});
ok("clear removes chip", !$("jBetsBody").innerHTML.includes("▼ close"));
ok("bet 1 close kept, bet 2 cleared", /"close":-120/.test(store["giu.journal.v1"]) && !/"close":170/.test(store["giu.journal.v1"]));
ok("stat back to 1/1", $("jSummary").innerHTML.includes("<b>1/1</b><span>Beat the close"));

/* 7 — same-as-close shows the = chip */
$("jBetsBody").fire("click", {target: fakeBtn("j-close-edit", 2)});
$("jCloseIn").value = "+150";
$("jBetsBody").fire("click", {target: fakeBtn("j-close-save", 2)});
ok("same chip shown", $("jBetsBody").innerHTML.includes("= close +150"));

/* 8 — CSV export carries the close column */
blobParts.length = 0;
$("jExport").fire("click");
ok("csv header has close", blobParts[0].startsWith("date,sport,event,market,pick,price,close,stake,result,profit_usd"));
ok("csv carries close value", blobParts[0].includes(",-110,-120,50,"));

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail ? 1 : 0);
