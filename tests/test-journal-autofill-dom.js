/* GridIronUI bet-journal closing-line auto-fill — DOM wiring test.
   Loads the shipped js/journal.js (+ real js/betmath.js) in a stubbed DOM
   with stubbed localStorage and a stubbed team directory, then exercises:
   the "Auto-fill closing lines" button exists in journal.html and is wired
   to the fill; the fill records the latest matching snapshot's price (moneyline
   bets get their picked team's consensus price), never overwrites a manually
   entered close, leaves unmatched/unresolvable bets blank, and reports the
   honest "Filled N of M" copy. No snapshots -> all blank.
   Run: node tests/test-journal-autofill-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");

function makeEl(id){
  const cls = new Set();
  const attrs = {};
  const handlers = {};
  const el = {
    id, attrs, handlers, textContent: "", innerHTML: "", value: "",
    checked: false, style: {}, className: "", disabled: false,
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, force) => { const v = force !== undefined ? force : !cls.has(c); v ? cls.add(c) : cls.delete(c); return v; },
      contains: c => cls.has(c),
    },
    setAttribute: (k,v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k],
    addEventListener: (t,h) => { (handlers[t] = handlers[t] || []).push(h); },
    fire: function(t, ev){ (handlers[t] || []).forEach(h => h.call(this, ev || {})); return this; },
    appendChild: function(c){ return c; },
    remove: function(){},
    click: function(){},
    closest: function(){ return null; },
    querySelectorAll: () => [],
    getContext: () => null,
    clientWidth: 640, clientHeight: 220,
  };
  return el;
}
const els = {};
const store = {};
const TEAMS = {
  "kansas city chiefs": "KC", "green bay packers": "GB",
  "chicago bears": "CHI", "detroit lions": "DET",
  "new england patriots": "NE", "buffalo bills": "BUF",
  "chiefs": "KC", "packers": "GB", "bears": "CHI",
  "lions": "DET", "bills": "BUF", "patriots": "NE",
};
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
    teamDir: () => Promise.resolve({}),
    teamFind: (dir, league, q) => {
      const ab = TEAMS[String(q == null ? "" : q).toLowerCase()];
      return ab ? { abbr: ab } : null;
    },
  },
  URL: { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} },
  setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout, console,
};
sandbox.Blob = function(parts){};
sandbox.window = sandbox;
sandbox.window.confirm = () => true;
vm.createContext(sandbox);

let pass = 0, fail = 0;
function ok(name, cond, extra){ cond ? pass++ : (fail++, console.log("FAIL:", name, extra === undefined ? "" : extra)); }
const $ = id => sandbox.document.getElementById(id);

/* journal.html pins */
const html = fs.readFileSync(__dirname + "/../journal.html", "utf8");
ok("journal.html has the auto-fill button", html.includes('id="jAutofill"'));
ok("journal.html wires journal.js v1.160.0", html.includes('js/journal.js?v=1.160.0'));
ok("journal.html loads team-brand.js for pair resolution", html.includes('js/team-brand.js?v='));
ok("journal.html carries the auto-fill honesty hint", html.includes("never overwritten"));

/* seed: 6 bets — one fillable spread, one manual close, one fillable
   moneyline (picked-side price), one moneyline with an unresolvable pick,
   one moneyline against a pre-v1.145.0 snapshot (no ml map), one spread
   for teams with no snapshot */
const betT = new Date(2026, 9, 1, 23, 59, 59).getTime();
const gameIso = new Date(betT - 5 * 3600 * 1000).toISOString();
function mkBet(o){
  return Object.assign({ id: 0, date: "2026-10-01", sport: "NFL", price: -110,
                        stake: 50, result: "pending" }, o);
}
store["giu.journal.v1"] = JSON.stringify([
  mkBet({ id: 1, event: "Kansas City Chiefs @ Green Bay Packers (DraftKings)",
          market: "Spread", pick: "Chiefs -3" }),
  mkBet({ id: 2, event: "Kansas City Chiefs @ Green Bay Packers",
          market: "Spread", pick: "Packers +3", close: -105 }),
  mkBet({ id: 3, event: "Kansas City Chiefs @ Green Bay Packers",
          market: "Moneyline", pick: "Kansas City Chiefs -150" }),
  mkBet({ id: 4, event: "Chicago Bears @ Detroit Lions",
          market: "Spread", pick: "Bears +6.5" }),
  mkBet({ id: 5, event: "Kansas City Chiefs @ Green Bay Packers",
          market: "Moneyline", pick: "?" }),
  mkBet({ id: 6, event: "New England Patriots @ Buffalo Bills",
          market: "Moneyline", pick: "Bills" }),
]);
store["giu-odds-history"] = JSON.stringify([
  { t: 1000, pair: "GB|KC", date: gameIso, spread: -110, total: -110,
    ml: { KC: -145, GB: 125 } },
  { t: 2000, pair: "GB|KC", date: gameIso, spread: -115, total: -105,
    ml: { KC: -150, GB: 130 } },
  /* pre-v1.145.0 shape: no ml map — moneyline bets must stay blank */
  { t: 1000, pair: "BUF|NE", date: gameIso, spread: -110, total: -110 },
]);

sandbox.document.getElementById("jFilterSport").value = "all";
sandbox.document.getElementById("jFilterResult").value = "all";
vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename: "betmath.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/journal.js", "utf8"), sandbox, {filename: "journal.js"});

async function main(){
  const J = sandbox.Journal;
  ok("autoFillCloses exposed", typeof J.autoFillCloses === "function");
  ok("button wired with a click listener",
     ($("jAutofill").handlers.click || []).length === 1);

  const filled = await J.autoFillCloses();
  const bets = JSON.parse(store["giu.journal.v1"]);
  const byId = {}; bets.forEach(b => { byId[b.id] = b; });
  ok("returns the filled count", filled === 2);
  ok("spread bet filled with the LATEST snapshot price", byId[1].close === -115);
  ok("manually entered close never overwritten", byId[2].close === -105);
  ok("moneyline bet filled with the PICKED team's latest close", byId[3].close === -150);
  ok("moneyline bet with unresolvable pick left blank", byId[5].close == null);
  ok("moneyline bet on pre-v1.145.0 snapshot (no ml) left blank", byId[6].close == null);
  ok("bet with no matching snapshot left blank", byId[4].close == null);
  ok("report copy is honest",
     $("jErr").textContent === "Filled 2 of 5 closing lines — unmatched bets left blank.");
  ok("filled close renders the CLV chip", $("jBetsBody").innerHTML.includes("close -115"));
  ok("moneyline close renders its CLV chip", $("jBetsBody").innerHTML.includes("close -150"));

  /* no snapshots -> everything stays blank, honest zero report.
     (Module-internal bets persist: bets 1 and 3 already filled above, so the
     remaining candidates are bets 4, 5 and 6.) */
  store["giu-odds-history"] = JSON.stringify([]);
  const filled2 = await J.autoFillCloses();
  const bets2 = JSON.parse(store["giu.journal.v1"]);
  const byId2 = {}; bets2.forEach(b => { byId2[b.id] = b; });
  ok("no snapshots -> zero filled", filled2 === 0);
  ok("no snapshots -> unmatched stay blank",
     byId2[4].close == null && byId2[5].close == null && byId2[6].close == null);
  ok("zero-fill report copy",
     $("jErr").textContent === "Filled 0 of 3 closing lines — unmatched bets left blank.");

  /* the click path calls the fill (wiring, not just exposure): give bet 4 a
     matching snapshot, then fire the button's click handler */
  store["giu-odds-history"] = JSON.stringify([
    { t: 3000, pair: "CHI|DET", date: gameIso, spread: -108, total: -112 },
  ]);
  $("jAutofill").fire("click");
  await new Promise(r => setTimeout(r, 50));
  const bets3 = JSON.parse(store["giu.journal.v1"]);
  const byId3 = {}; bets3.forEach(b => { byId3[b.id] = b; });
  ok("button click runs the fill", byId3[4].close === -108);
  ok("button click reports honestly",
     $("jErr").textContent === "Filled 1 of 3 closing lines — unmatched bets left blank.");

  /* malformed history storage never throws the fill */
  store["giu-odds-history"] = "this is not json{{{";
  let threw = false;
  try{ await J.autoFillCloses(); }catch(e){ threw = true; }
  ok("malformed history storage safe", !threw);

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: harness threw", e); process.exit(1); });
