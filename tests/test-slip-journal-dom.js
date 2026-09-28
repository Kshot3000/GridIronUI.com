/* GridIronUI slip->journal export DOM wiring tests — loads the shipped
   js/odds-logic.js + js/betmath.js + js/odds-slip.js + js/odds.js in a
   stubbed-DOM vm sandbox, then exercises:
   (A) "Send to journal" maps slip legs to pending journal bets in
       localStorage with captured American prices, split stakes, ids;
   (B) a second click de-duplicates (no double-logging);
   (C) an empty slip shows a guidance note and writes nothing;
   (D) legs with invalid prices are skipped, never invented;
   (E) sport label follows the board's sport tab (NFL here).
   Run: node tests/test-slip-journal-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; }
  else{ fail++; console.log("FAIL:", name, extra === undefined ? "" : extra); }
}

function makeEl(id){
  const cls = new Set();
  const attrs = {};
  const handlers = {};
  return {
    id, attrs, handlers, textContent: "", innerHTML: "", value: "", style: {},
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, force) => { const v = force !== undefined ? force : !cls.has(c); v ? cls.add(c) : cls.delete(c); return v; },
      contains: c => cls.has(c),
    },
    setAttribute: (k,v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k],
    hasAttribute: k => k in attrs,
    removeAttribute: k => { delete attrs[k]; },
    addEventListener: (t,h) => { (handlers[t] = handlers[t] || []).push(h); },
    fire: function(t, ev){ (handlers[t] || []).forEach(h => h.call(this, ev || {})); },
    querySelectorAll: () => [],
    closest: () => null,
  };
}

function buildWorld(){
  const els = {};
  ["oddsSetup","oddsBoard","quota","keyInput","sportTabs","refreshBtn","autoRef","saveKey","clearKey",
   "slipPanel","slipToggle","slipCount","slipTotals","slipJournalNote"].forEach(id => els[id] = makeEl(id));
  els.slipPanel.attrs.hidden = "";
  els.slipToggle.attrs["aria-expanded"] = "false";
  els.keyInput.value = "";
  const store = {};
  const location = { hash: "", href: "https://gridironui.xyz/odds.html",
                     pathname: "/odds.html", search: "" };
  const history = { replaced: null,
    replaceState: function(){ this.replaced = true; location.hash = ""; } };
  const sandbox = {
    window: {},
    document: {
      getElementById: id => els[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => makeEl("ta"),
      body: { appendChild(){}, removeChild(){} },
      execCommand: () => false,
    },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    location, history,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    fetch: () => Promise.reject(new Error("no network in tests")),
    setInterval: () => 0, clearInterval: () => {},
    setTimeout, clearTimeout, console,
  };
  sandbox.window.window = sandbox.window;
  sandbox.GIU = {
    esc: s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
    failBox: m => '<div class="notice red">'+m+'</div>',
    teamDir: () => Promise.resolve({}),
    teamFind: () => null,
    teamLogo: () => "",
    teamChip: () => "",
  };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + "/../js/odds-logic.js", "utf8"), sandbox, {filename:"odds-logic.js"});
  vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename:"betmath.js"});
  vm.runInContext(fs.readFileSync(__dirname + "/../js/odds-slip.js", "utf8"), sandbox, {filename:"odds-slip.js"});
  vm.runInContext(fs.readFileSync(__dirname + "/../js/odds.js", "utf8"), sandbox, {filename:"odds.js"});
  return { els, store };
}

function pickBtn(id, price, side, label, book, game, market){
  const b = makeEl("btn");
  Object.assign(b.attrs, { "data-slip": id, "data-game": game || "Chiefs @ Raiders",
    "data-market": market || "h2h", "data-side": side, "data-book": book,
    "data-booktitle": book, "data-label": label, "data-price": String(price) });
  return b;
}
function clickTarget(id){
  return { id: id, closest: () => null };
}
function journal(w){
  try{ return JSON.parse(w.store["giu.journal.v1"] || "[]"); }
  catch(e){ return null; }
}
function todayLocal(){
  const d = new Date();
  const p2 = n => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

/* ---------- A. legs become journal bets ---------- */
{
  const w = buildWorld();
  w.els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? pickBtn("g1|dk|h2h|Chiefs", 1.91, "Chiefs", "-110", "DraftKings") : null } });
  w.els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? pickBtn("g2|fd|totals|Over", 1.952, "Over", "O 47.5 · -105", "FanDuel", "Bills @ Jets", "totals") : null } });
  ok("A: button rendered", w.els.slipPanel.innerHTML.indexOf('id="slipJournal"') !== -1);
  w.els.slipPanel.fire("click", { target: clickTarget("slipJournal") });
  const js = journal(w);
  ok("A: 2 bets written to journal storage", Array.isArray(js) && js.length === 2, JSON.stringify(js));
  ok("A: sport mapped NFL", js && js.every(b => b.sport === "NFL"));
  ok("A: date stamped today", js && js.every(b => b.date === todayLocal()), js && js[0].date);
  ok("A: markets mapped", js && js[0].market === "Moneyline" && js[1].market === "Total");
  ok("A: American prices from captured decimals", js && js[0].price === -110 && js[1].price === -105, JSON.stringify(js && js.map(b => b.price)));
  ok("A: stake split evenly (100/2)", js && js.every(b => b.stake === 50), JSON.stringify(js && js.map(b => b.stake)));
  ok("A: result pending", js && js.every(b => b.result === "pending"));
  ok("A: ids assigned", js && js[0].id === 1 && js[1].id === 2);
  ok("A: event names game + book", js && js[0].event === "Chiefs @ Raiders (DraftKings)" && js[1].event === "Bills @ Jets (FanDuel)", js && js[0].event);
  ok("A: status confirms with journal link", w.els.slipJournalNote.innerHTML.indexOf("2 bets added") !== -1 &&
      w.els.slipJournalNote.innerHTML.indexOf('href="journal.html"') !== -1, w.els.slipJournalNote.innerHTML);
  ok("A: note is visible", w.els.slipJournalNote.style.display === "block");

  /* ---------- B. second click de-duplicates ---------- */
  w.els.slipPanel.fire("click", { target: clickTarget("slipJournal") });
  const js2 = journal(w);
  ok("B: no double-logging", Array.isArray(js2) && js2.length === 2, js2 && js2.length);
  ok("B: note says already logged", w.els.slipJournalNote.innerHTML.indexOf("2 already logged") !== -1,
      w.els.slipJournalNote.innerHTML);
}

/* ---------- C. empty slip ---------- */
{
  const w = buildWorld();
  w.els.slipPanel.fire("click", { target: clickTarget("slipJournal") });
  ok("C: nothing written", !("giu.journal.v1" in w.store));
  ok("C: guidance note", w.els.slipJournalNote.textContent.indexOf("add picks") !== -1,
      w.els.slipJournalNote.textContent);
}

/* ---------- D. invalid price skipped ---------- */
{
  const w = buildWorld();
  w.els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? pickBtn("g9|dk|h2h|X", 1.0, "X", "+100", "DraftKings", "X @ Y") : null } });
  w.els.slipPanel.fire("click", { target: clickTarget("slipJournal") });
  const js = journal(w);
  ok("D: invalid leg skipped", Array.isArray(js) && js.length === 0, JSON.stringify(js));
  ok("D: note reports skip", w.els.slipJournalNote.innerHTML.indexOf("1 skipped") !== -1,
      w.els.slipJournalNote.innerHTML);
}

console.log(`slip-journal-dom: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
