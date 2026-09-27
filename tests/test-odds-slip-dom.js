/* GridIronUI bet-slip DOM wiring test — loads the shipped js/odds.js with a
   stubbed DOM and exercises the slip: toggle legs from the board, aria-pressed,
   counts, totals, stake input, remove, clear, localStorage persistence. */
"use strict";
const fs = require("fs");
const vm = require("vm");

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
const els = {};
["oddsSetup","oddsBoard","quota","keyInput","sportTabs","refreshBtn","autoRef","saveKey","clearKey",
 "slipPanel","slipToggle","slipCount","slipTotals"].forEach(id => els[id] = makeEl(id));
els.slipPanel.attrs.hidden = "";
els.slipToggle.attrs["aria-expanded"] = "false"; /* mirrors shipped odds.html */
els.keyInput.value = "";

const store = {};
const sandbox = {
  window: {},
  document: {
    getElementById: id => els[id] || null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  fetch: () => Promise.reject(new Error("no network in tests")),
  setInterval: () => 0, clearInterval: () => {},
  setTimeout, clearTimeout, console,
};
sandbox.window.window = sandbox.window;
const GIUstub = {
  esc: s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
  failBox: m => '<div class="notice red">'+m+'</div>',
  /* identity stubs: dir resolves empty, nothing matches — legs render plain */
  teamDir: () => Promise.resolve({}),
  teamFind: () => null,
  teamLogo: () => "",
  teamChip: () => "",
};
sandbox.GIU = GIUstub;
sandbox.window.GIU = GIUstub;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/../js/odds-logic.js", "utf8"), sandbox, {filename:"odds-logic.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/odds-slip.js", "utf8"), sandbox, {filename:"odds-slip.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/odds.js", "utf8"), sandbox, {filename:"odds.js"});

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }

/* fake pick button on the board */
function pickBtn(id, price, side, label, book, game){
  const b = makeEl("btn");
  Object.assign(b.attrs, { "data-slip": id, "data-game": game || "Chiefs @ Raiders", "data-market": "h2h",
    "data-side": side, "data-book": book, "data-booktitle": book,
    "data-label": label, "data-price": String(price) });
  return b;
}

/* 1. initial: empty slip, panel hidden, count 0 */
ok("panel starts hidden", els.slipPanel.hasAttribute("hidden"));
ok("toggle starts aria-expanded=false", els.slipToggle.attrs["aria-expanded"] === "false");
ok("count starts 0", els.slipCount.textContent === "0" || els.slipCount.textContent === 0);
ok("empty slip message", els.slipPanel.innerHTML.indexOf("Tap any price") !== -1);

/* 2. add a leg from the board */
const b1 = pickBtn("g1|dk|h2h|Chiefs", 1.91, "Chiefs", "-110", "draftkings");
els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b1 : null } });
ok("count 1 after add", String(els.slipCount.textContent) === "1");
ok("aria-pressed=true", b1.attrs["aria-pressed"] === "true");
ok("picked class", b1.classList.contains("picked"));
ok("slip shows leg", els.slipPanel.innerHTML.indexOf("Chiefs") !== -1);
ok("slip shows combined odds", els.slipPanel.innerHTML.indexOf("Combined odds") !== -1);
ok("single-leg american -110", els.slipPanel.innerHTML.indexOf("-110") !== -1);
ok("persisted to localStorage", (store.giu_slip || "").indexOf("g1|dk|h2h|Chiefs") !== -1);

/* 3. toggle off */
els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b1 : null } });
ok("count 0 after toggle-off", String(els.slipCount.textContent) === "0");
ok("aria-pressed=false", b1.attrs["aria-pressed"] === "false");

/* 4. two legs + stake math */
const b2 = pickBtn("g1|fd|h2h|Raiders", 2.10, "Raiders", "+110", "fanduel");
els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b1 : null } });
els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b2 : null } });
ok("count 2", String(els.slipCount.textContent) === "2");
ok("parlay american +301", els.slipPanel.innerHTML.indexOf("+301") !== -1);
/* v1.31.0: implied break-even probability on the totals (1/4.011 = 24.9%) */
ok("implied probability row shown", els.slipPanel.innerHTML.indexOf("Implied probability") !== -1 &&
                                    els.slipPanel.innerHTML.indexOf("24.9%") !== -1);
/* v1.31.0: both legs share "Chiefs @ Raiders" -> same-game correlation warning */
ok("same-game warning shown", els.slipPanel.innerHTML.indexOf("slip-warn") !== -1 &&
                              els.slipPanel.innerHTML.indexOf("Same-game legs") !== -1 &&
                              els.slipPanel.innerHTML.indexOf("correlated") !== -1);
/* stake input -> totals update live (1.91*2.10=4.011, $50 -> payout 200.55, profit 150.55) */
const totalsBefore = els.slipPanel.innerHTML;
els.slipPanel.fire("input", { target: { id: "slipStake", value: "50" } });
ok("stake persisted", store.giu_slip_stake === "50");
ok("totals updated with $50 math", els.slipTotals.innerHTML.indexOf("$200.55") !== -1 &&
                                   els.slipTotals.innerHTML.indexOf("$150.55") !== -1);

/* 5. remove one leg via ✕ */
els.slipPanel.fire("click", { target: { closest: sel => sel === "[data-unslip]"
  ? { getAttribute: k => k === "data-unslip" ? "g1|dk|h2h|Chiefs" : null } : null } });
ok("count 1 after remove", String(els.slipCount.textContent) === "1");
ok("removed leg gone, other stays",
  els.slipPanel.innerHTML.indexOf("Chiefs</b>") === -1 &&
  els.slipPanel.innerHTML.indexOf("Raiders</b>") !== -1);

/* 6. clear */
els.slipPanel.fire("click", { target: { id: "slipClear", closest: () => null } });
ok("count 0 after clear", String(els.slipCount.textContent) === "0");
ok("cleared storage", store.giu_slip === "[]");

/* 7. panel toggle */
els.slipToggle.fire("click");
ok("panel opens", !els.slipPanel.hasAttribute("hidden") && els.slipToggle.attrs["aria-expanded"] === "true");
els.slipToggle.fire("click");
ok("panel closes", els.slipPanel.hasAttribute("hidden") && els.slipToggle.attrs["aria-expanded"] === "false");

/* 8. legs from different games -> no correlation warning */
const b3 = pickBtn("g2|dk|h2h|Bills", 1.91, "Bills", "-110", "draftkings", "Bills @ Jets");
const b4 = pickBtn("g3|dk|h2h|Packers", 1.91, "Packers", "-110", "draftkings", "Packers @ Bears");
els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b3 : null } });
els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b4 : null } });
ok("count 2 (different games)", String(els.slipCount.textContent) === "2");
ok("no same-game warning across games", els.slipPanel.innerHTML.indexOf("slip-warn") === -1);
ok("implied shown for cross-game parlay", els.slipPanel.innerHTML.indexOf("Implied probability") !== -1);

console.log(`odds-slip-dom: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
