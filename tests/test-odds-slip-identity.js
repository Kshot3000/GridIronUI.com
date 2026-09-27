/* GridIronUI bet-slip GameDay identity test — the real js/team-brand.js
   (teamFind / teamLogo / teamChip) wired into the shipped js/odds.js with a
   stubbed DOM and a fake team directory: legs for known teams render the ESPN
   logo + team-color chip; totals legs, unknown teams, and leagues without a
   directory stay plain text; a legacy leg persisted without `sport` still
   renders. */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");

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

const DIR = { nfl: [
  {abbr:"KC", displayName:"Kansas City Chiefs", shortDisplayName:"Chiefs", color:"e31837", logo:"https://x/kc.png"},
  {abbr:"LV", displayName:"Las Vegas Raiders", shortDisplayName:"Raiders", color:"000000", logo:"https://x/lv.png"}
]};

async function boot(preloadSlip){
  const els = {};
  ["oddsSetup","oddsBoard","quota","keyInput","sportTabs","refreshBtn","autoRef","saveKey","clearKey",
   "slipPanel","slipToggle","slipCount","slipTotals"].forEach(id => els[id] = makeEl(id));
  els.slipPanel.attrs.hidden = "";
  els.slipToggle.attrs["aria-expanded"] = "false";
  els.keyInput.value = "";
  const store = {};
  if(preloadSlip) store.giu_slip = JSON.stringify(preloadSlip);
  const GIU = {
    esc: s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
    failBox: m => '<div class="notice red">'+m+'</div>',
    fetchJSON: () => Promise.resolve({ leagues: DIR }), /* teamDir loads the directory from here */
  };
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
  sandbox.GIU = GIU;
  sandbox.window.GIU = GIU;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox, {filename:"team-brand.js"});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds-logic.js"), "utf8"), sandbox, {filename:"odds-logic.js"});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds-slip.js"), "utf8"), sandbox, {filename:"odds-slip.js"});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds.js"), "utf8"), sandbox, {filename:"odds.js"});
  /* let GIU.teamDir() resolve and the identity re-render land */
  await new Promise(r => setTimeout(r, 25));
  return { els, store };
}

function pickBtn(id, price, side, label, book, market){
  const b = makeEl("btn");
  Object.assign(b.attrs, { "data-slip": id, "data-game": "Kansas City Chiefs @ Las Vegas Raiders",
    "data-market": market || "h2h", "data-side": side, "data-book": book,
    "data-booktitle": book, "data-label": label, "data-price": String(price) });
  return b;
}

(async function(){
  let pass = 0, fail = 0;
  function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }

  /* 1. team leg gets logo + color chip after the directory loads */
  {
    const { els } = await boot();
    const b = pickBtn("g1|dk|h2h|Kansas City Chiefs", 1.91, "Kansas City Chiefs", "-110", "draftkings");
    els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b : null } });
    await new Promise(r => setTimeout(r, 25)); /* identity was already cached; re-render is sync, but be safe */
    const h = els.slipPanel.innerHTML;
    ok("leg renders slip-id wrapper", h.indexOf('class="slip-id"') !== -1);
    ok("leg carries the real ESPN logo", h.indexOf("https://x/kc.png") !== -1);
    ok("leg carries the real team color", h.indexOf("#e31837") !== -1);
    ok("leg carries the KC chip", h.indexOf(">KC</span>") !== -1);
    ok("side name still present", h.indexOf("Kansas City Chiefs</b>") !== -1);
  }

  /* 2. totals leg (Over) keeps plain text — Over is not a team */
  {
    const { els } = await boot();
    const b = pickBtn("g1|dk|totals|Over", 1.91, "Over", "O 48.5 · -110", "draftkings", "totals");
    els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b : null } });
    const h = els.slipPanel.innerHTML;
    ok("totals leg renders", h.indexOf(">Over</b>") !== -1);
    ok("totals leg gets no identity", h.indexOf('class="slip-id"') === -1);
  }

  /* 3. unknown team name keeps plain text, no crash */
  {
    const { els } = await boot();
    const b = pickBtn("g1|dk|h2h|Springfield Atoms", 2.5, "Springfield Atoms", "+150", "draftkings");
    els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b : null } });
    const h = els.slipPanel.innerHTML;
    ok("unknown team renders plain", h.indexOf("Springfield Atoms</b>") !== -1);
    ok("unknown team gets no identity", h.indexOf('class="slip-id"') === -1);
  }

  /* 4. legacy leg persisted without `sport` falls back to the current sport (NFL) */
  {
    const legacy = [{ id:"g1|dk|h2h|Chiefs", game:"Chiefs @ Raiders", market:"h2h",
      side:"Las Vegas Raiders", book:"draftkings", bookTitle:"draftkings",
      label:"-110", price:1.91 }];
    const { els } = await boot(legacy);
    const h = els.slipPanel.innerHTML;
    ok("legacy leg renders", h.indexOf("Las Vegas Raiders</b>") !== -1);
    ok("legacy leg gets identity via fallback sport", h.indexOf("https://x/lv.png") !== -1);
  }

  /* 5. NCAAF (no identity directory) stays plain text */
  {
    const ncaaf = [{ id:"g9|dk|h2h|Georgia Bulldogs", game:"Georgia @ Alabama", market:"h2h",
      side:"Georgia Bulldogs", book:"draftkings", bookTitle:"draftkings",
      label:"-200", price:1.5, sport:"americanfootball_ncaaf" }];
    const { els } = await boot(ncaaf);
    const h = els.slipPanel.innerHTML;
    ok("college leg renders", h.indexOf("Georgia Bulldogs</b>") !== -1);
    ok("college leg gets no identity (no directory for NCAAF)", h.indexOf('class="slip-id"') === -1);
  }

  console.log(`odds-slip-identity: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
