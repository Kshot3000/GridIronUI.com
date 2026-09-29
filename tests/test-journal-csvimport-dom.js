/* GridIronUI journal CSV import DOM wiring test — loads the shipped js/journal.js
   (+ betmath.js) with a stubbed DOM and localStorage, then exercises the
   import flow: Import button opens the hidden file picker, a picked CSV file
   imports through BM.journalCSVImport, exact-duplicate rows are skipped, ids
   are assigned fresh, and the result message names imports/dupes/skips.
   Run: node tests/test-journal-csvimport-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");

function makeEl(id){
  const cls = new Set();
  const attrs = {};
  const handlers = {};
  const el = {
    id, attrs, handlers, textContent: "", innerHTML: "", value: "",
    style: {}, clicked: false, files: null,
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, force) => { const v = force !== undefined ? force : !cls.has(c); v ? cls.add(c) : cls.delete(c); return v; },
      contains: c => cls.has(c),
    },
    setAttribute: (k,v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k],
    addEventListener: (t,h) => { (handlers[t] = handlers[t] || []).push(h); },
    fire: function(t, ev){ (handlers[t] || []).forEach(h => h.call(this, ev || {})); return this; },
    closest: () => null, click: function(){ this.clicked = true; },
  };
  return el;
}
/* Boot a fresh "page load": seeds localStorage first, then runs the shipped
   scripts exactly the way the real journal.html does. */
function boot(seedBets){
  const els = {};
  const store = {};
  if(seedBets) store["giu.journal.v1"] = JSON.stringify(seedBets);
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
    GIU: { esc: s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") },
    setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout, console,
  };
  sandbox.window = sandbox;
  sandbox.window.confirm = () => true;
  vm.createContext(sandbox);
  sandbox.document.getElementById("jFilterSport").value = "all";
  sandbox.document.getElementById("jFilterResult").value = "all";
  vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename:"betmath.js"});
  vm.runInContext(fs.readFileSync(__dirname + "/../js/journal.js", "utf8"), sandbox, {filename:"journal.js"});
  return {
    $: id => sandbox.document.getElementById(id),
    stored: () => JSON.parse(store["giu.journal.v1"] || "[]"),
  };
}

let pass = 0, fail = 0;
function ok(name, cond, extra){ cond ? pass++ : (fail++, console.log("FAIL:", name, extra === undefined ? "" : extra)); }
const fakeFile = csv => ({ name: "journal.csv", text: () => Promise.resolve(csv) });
const tick = () => new Promise(r => setTimeout(r, 20));
async function pickCSV(page, csv){
  page.$("jImportFile").files = [fakeFile(csv)];
  page.$("jImportFile").fire("change");
  await tick();
}

(async function(){
  const HEAD = "date,sport,event,market,pick,price,close,stake,result,profit_usd";
  const CSV = HEAD + "\n" +
    "2026-09-20,NFL,Chiefs -3,Spread,Chiefs,-110,,110,win,\n" +
    "2026-09-21,NBA,Lakers ML,Moneyline,Lakers,+150,,50,pending,\n" +
    "2026-09-22,NFL,Bad price,Spread,Bears,-50,,110,win,\n";

  /* Import button opens the hidden picker */
  const page = boot();
  page.$("jImport").fire("click");
  ok("import button opens file picker", page.$("jImportFile").clicked === true);

  /* change handler imports the picked file */
  await pickCSV(page, CSV);
  const rows = page.stored();
  ok("two valid bets imported", rows.length === 2, rows.length);
  ok("ids assigned fresh and unique", rows[0].id === 1 && rows[1].id === 2, JSON.stringify(rows.map(r => r.id)));
  ok("fields preserved", rows[0].event === "Chiefs -3" && rows[0].price === -110 && rows[1].result === "pending");
  ok("message reports imports and skips",
     /Imported 2 bets/.test(page.$("jErr").textContent) && /1 row skipped/.test(page.$("jErr").textContent),
     page.$("jErr").textContent);

  /* importing the same file again imports nothing new (dedupe) */
  await pickCSV(page, CSV);
  ok("re-import adds no duplicates", page.stored().length === 2, page.stored().length);
  ok("duplicates reported", /2 duplicates/.test(page.$("jErr").textContent), page.$("jErr").textContent);

  /* a bet already in storage matches CSV rows by content, not id */
  const page2 = boot([{id:7, date:"2026-09-20", sport:"NFL", event:"Chiefs -3",
    market:"Spread", pick:"Chiefs", price:-110, stake:110, result:"win"}]);
  await pickCSV(page2, CSV);
  const rows2 = page2.stored();
  ok("pre-existing row not duplicated", rows2.length === 2, JSON.stringify(rows2));
  ok("new bet gets next id after stored max", rows2.some(r => r.id === 8 && r.event === "Lakers ML"),
     JSON.stringify(rows2.map(r => r.id)));

  /* a file with no valid rows reports honestly */
  const page3 = boot();
  await pickCSV(page3, "nope\n1,2,3\n");
  ok("garbage file imports nothing", page3.stored().length === 0);
  ok("garbage file message names missing columns",
     /Missing required/.test(page3.$("jErr").textContent), page3.$("jErr").textContent);

  console.log(fail ? "\n" + fail + " FAILURES" : "\nALL " + pass + " JOURNAL CSV IMPORT DOM TESTS PASSED");
  process.exit(fail ? 1 : 0);
})();
