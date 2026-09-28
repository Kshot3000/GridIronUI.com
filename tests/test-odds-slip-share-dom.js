/* GridIronUI bet-slip share-link DOM wiring tests — loads the shipped
   js/odds-slip.js + js/odds.js in a stubbed-DOM vm sandbox:
   (A) a valid #slip= hash loads a friend's legs + stake, opens the panel,
       shows the honesty banner, strips the hash;
   (B) "Share this slip" copies a decodable link of the local slip;
   (C) a bad #slip= hash shows the error banner and leaves the slip alone;
   (D) dismissing the banner works.
   Run: node tests/test-odds-slip-share-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");
const Slip = require("../js/odds-slip.js");

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }

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

function buildWorld(hash, copied){
  const els = {};
  ["oddsSetup","oddsBoard","quota","keyInput","sportTabs","refreshBtn","autoRef","saveKey","clearKey",
   "slipPanel","slipToggle","slipCount","slipTotals"].forEach(id => els[id] = makeEl(id));
  els.slipPanel.attrs.hidden = "";
  els.slipToggle.attrs["aria-expanded"] = "false";
  els.keyInput.value = "";
  const store = {};
  const location = { hash: hash, href: "https://gridironui.xyz/odds.html" + hash,
                     pathname: "/odds.html", search: "" };
  const history = { replaced: null,
    replaceState: function(st, t, url){ this.replaced = url; location.hash = ""; location.href = "https://gridironui.xyz" + url; } };
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
    navigator: { clipboard: { writeText: t => { copied.text = t; return Promise.resolve(); } } },
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
  vm.runInContext(fs.readFileSync(__dirname + "/../js/odds-slip.js", "utf8"), sandbox, {filename:"odds-slip.js"});
  vm.runInContext(fs.readFileSync(__dirname + "/../js/odds.js", "utf8"), sandbox, {filename:"odds.js"});
  return { els, store, location, history };
}

function pickBtn(id, price, side, label, book, game){
  const b = makeEl("btn");
  Object.assign(b.attrs, { "data-slip": id, "data-game": game || "Chiefs @ Raiders", "data-market": "h2h",
    "data-side": side, "data-book": book, "data-booktitle": book,
    "data-label": label, "data-price": String(price) });
  return b;
}
function clickTarget(id){
  return { id: id, closest: () => null };
}

/* ---------- A. valid share link loads ---------- */
{
  const legs = [
    { id:"g1|dk|h2h|Chiefs", game:"Chiefs @ Raiders", market:"h2h", side:"Chiefs",
      book:"draftkings", bookTitle:"DraftKings", label:"-110", price:1.91,
      sport:"americanfootball_nfl" },
    { id:"g2|fd|totals|Over 48.5", game:"Bills @ Jets", market:"totals", side:"Over 48.5",
      book:"fanduel", bookTitle:"FanDuel", label:"-105", price:1.952,
      sport:"americanfootball_nfl" }
  ];
  const enc = Slip.encodeShare(legs, 75, 1759000000000);
  const copied = {};
  const w = buildWorld("#slip=" + enc, copied);
  ok("A: 2 legs loaded from hash", String(w.els.slipCount.textContent) === "2");
  ok("A: panel auto-opened", !w.els.slipPanel.hasAttribute("hidden") &&
      w.els.slipToggle.attrs["aria-expanded"] === "true");
  ok("A: honesty banner shown", w.els.slipPanel.innerHTML.indexOf("Shared slip loaded") !== -1 &&
      w.els.slipPanel.innerHTML.indexOf("lines may have moved since") !== -1);
  ok("A: capture time shown (visitor's time)", w.els.slipPanel.innerHTML.indexOf("(your time)") !== -1);
  ok("A: banner has dismiss", w.els.slipPanel.innerHTML.indexOf('id="sharedDismiss"') !== -1);
  ok("A: leg rendered", w.els.slipPanel.innerHTML.indexOf("Chiefs") !== -1 &&
      w.els.slipPanel.innerHTML.indexOf("Over 48.5") !== -1);
  ok("A: stake loaded (75)", w.store.giu_slip_stake === "75", w.store.giu_slip_stake);
  ok("A: slip persisted", (w.store.giu_slip || "").indexOf("g1|dk|h2h|Chiefs") !== -1);
  ok("A: hash stripped from URL", w.location.hash === "" && w.history.replaced !== null, w.history.replaced);

  /* D. dismiss the banner */
  w.els.slipPanel.fire("click", { target: clickTarget("sharedDismiss") });
  ok("D: banner dismissed", w.els.slipPanel.innerHTML.indexOf("Shared slip loaded") === -1);
  ok("D: legs remain after dismiss", String(w.els.slipCount.textContent) === "2");
}

/* ---------- C. bad share link ---------- */
{
  const copied = {};
  const w = buildWorld("#slip=!!!not-valid!!!", copied);
  ok("C: slip untouched", String(w.els.slipCount.textContent) === "0");
  ok("C: decode-error banner shown", w.els.slipPanel.innerHTML.indexOf("didn\u2019t decode") !== -1 ||
      w.els.slipPanel.innerHTML.indexOf("didn’t decode") !== -1);
  ok("C: hash stripped even on failure", w.location.hash === "");
}

/* ---------- B. share button copies a decodable link ---------- */
{
  const copied = {};
  const w = buildWorld("", copied);
  const b1 = pickBtn("g1|dk|h2h|Chiefs", 1.91, "Chiefs", "-110", "draftkings");
  const b2 = pickBtn("g2|dk|h2h|Bills", 1.91, "Bills", "-110", "draftkings", "Bills @ Jets");
  w.els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b1 : null } });
  w.els.oddsBoard.fire("click", { target: { closest: sel => sel === ".pick-btn" ? b2 : null } });
  ok("B: share button rendered", w.els.slipPanel.innerHTML.indexOf('id="slipShare"') !== -1);
  w.els.slipPanel.fire("click", { target: clickTarget("slipShare") });
  setTimeout(() => {
    ok("B: clipboard got a URL", typeof copied.text === "string" &&
        copied.text.indexOf("https://gridironui.xyz/odds.html#slip=") === 0,
        (copied.text || "").slice(0, 60));
    const payload = (copied.text || "").split("#slip=")[1];
    const d = Slip.decodeShare(payload);
    ok("B: copied link decodes", !!d);
    ok("B: decoded legs match slip", !!d && d.legs.length === 2 &&
        d.legs[0].id === "g1|dk|h2h|Chiefs" && d.legs[1].side === "Bills");
    ok("B: decoded prices exact", !!d && d.legs[0].price === 1.91 && d.legs[1].price === 1.91);
    ok("B: link carries no API key", (copied.text || "").indexOf("key") === -1);
    ok("B: link is a sane length", (copied.text || "").length < 4000, (copied.text || "").length);
    console.log(`odds-slip-share-dom: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }, 50);
}
