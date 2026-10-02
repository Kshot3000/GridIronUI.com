/* GridIronUI journal ledger search tests (v1.160.0) — pure search/highlight
   contract + DOM wiring in the shipped js/journal.js: live text search over
   event/pick/sport/market/date with AND terms, combined with the sport and
   result filters, XSS-safe <mark> highlights, honest shown-count and named
   empty state, Escape/Clear restore, search state surviving settle renders,
   and the shipped journal.html pins.
   Run: node tests/test-journal-search.js */
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
sandbox.Blob = function(){};
sandbox.window = sandbox;
sandbox.window.confirm = () => true;
vm.createContext(sandbox);
sandbox.document.getElementById("jFilterSport").value = "all";
sandbox.document.getElementById("jFilterResult").value = "all";
vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename:"betmath.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/journal.js", "utf8"), sandbox, {filename:"journal.js"});
const J = sandbox.window.Journal;

let pass = 0, fail = 0;
function ok(name, cond, extra){ cond ? pass++ : (fail++, console.log("FAIL:", name, extra === undefined ? "" : extra)); }
const $ = id => sandbox.document.getElementById(id);
const bet = o => Object.assign({id:1, date:"2026-09-20", sport:"NFL", event:"Bears @ Packers",
  market:"Spread", pick:"Bears +3", price:-110, stake:100, result:"pending"}, o || {});

/* ---- pure: searchTerms ---- */
ok("terms blank -> []", J.searchTerms("").length === 0 && J.searchTerms("   ").length === 0);
ok("terms null -> []", J.searchTerms(null).length === 0 && J.searchTerms(undefined).length === 0);
ok("terms split + lowercase", JSON.stringify(J.searchTerms("  NFL  Bears ")) === '["nfl","bears"]');

/* ---- pure: betMatchesSearch ---- */
ok("blank query matches everything", J.betMatchesSearch(bet(), "") === true && J.betMatchesSearch(bet(), null) === true);
ok("event term, case-insensitive", J.betMatchesSearch(bet(), "BEARS") === true);
ok("pick term", J.betMatchesSearch(bet(), "+3") === true);
ok("market term", J.betMatchesSearch(bet({market:"Prop", pick:"Mahomes o2.5 TD"}), "prop") === true);
ok("sport term", J.betMatchesSearch(bet({sport:"MLB"}), "mlb") === true);
ok("date term", J.betMatchesSearch(bet(), "2026-09") === true);
ok("multi-term AND across fields", J.betMatchesSearch(bet(), "nfl bears") === true);
ok("multi-term one miss -> no match", J.betMatchesSearch(bet(), "nfl cubs") === false);
ok("absent term -> no match, never all", J.betMatchesSearch(bet(), "zzzz") === false);
ok("garbage bet -> no throw, blank still matches", J.betMatchesSearch(null, "x") === false && J.betMatchesSearch(null, "") === true);
ok("null fields coerced", J.betMatchesSearch({event:null, pick:undefined}, "x") === false);
ok("betMatches composes sport+result+search",
  J.betMatches(bet(), "all", "all", "bears") === true &&
  J.betMatches(bet(), "NBA", "all", "bears") === false &&
  J.betMatches(bet(), "all", "win", "bears") === false &&
  J.betMatches(bet({result:"win"}), "all", "win", "packers") === true);

/* ---- pure: hlHtml ---- */
ok("hl no query -> plain escaped", J.hlHtml("Bears & <Co>", "") === "Bears &amp; &lt;Co&gt;");
ok("hl wraps the match", J.hlHtml("Bears @ Packers", "bears") === "<mark>Bears</mark> @ Packers");
ok("hl case-insensitive, keeps original case", J.hlHtml("BEARS win", "bears") === "<mark>BEARS</mark> win");
ok("hl every occurrence", J.hlHtml("Bears bears", "bears") === "<mark>Bears</mark> <mark>bears</mark>");
ok("hl hostile text stays escaped inside and out",
  J.hlHtml("<script>Bears</script>", "bears") === "&lt;script&gt;<mark>Bears</mark>&lt;/script&gt;");
ok("hl longest term wins, no nested marks",
  J.hlHtml("Bears", "bear bears") === "<mark>Bears</mark>");
ok("hl multi-term highlights both", J.hlHtml("Bears +3", "bears +3") === "<mark>Bears</mark> <mark>+3</mark>");
ok("hl no match -> plain", J.hlHtml("Cubs", "bears") === "Cubs");

/* ---- shipped pins ---- */
const html = fs.readFileSync(__dirname + "/../journal.html", "utf8");
ok("page has search input", html.includes('id="jSearch"'));
ok("page has clear button", html.includes('id="jSearchClear"'));
ok("page has live count", html.includes('id="jMatchCount"') && html.includes('aria-live="polite"'));
ok("page wires journal.js v1.160.0", html.includes("js/journal.js?v=1.160.0"));
ok("page styles the marks", html.includes("#jBetsBody mark"));

/* ---- DOM wiring: seed three bets through the real form ---- */
function setForm(ev, sport, mk, pk, pr, st){
  $("jSport").value = sport; $("jMarket").value = mk;
  $("jEvent").value = ev; $("jPick").value = pk;
  $("jPrice").value = pr; $("jStake").value = st;
  $("jDate").value = "2026-09-28";
}
setForm("Bears @ Packers", "NFL", "Spread", "Bears +3", "-110", "50"); $("jAdd").fire("click");
setForm("Cubs vs Cards", "MLB", "Moneyline", "Cubs", "+150", "40"); $("jAdd").fire("click");
setForm("Chiefs @ Bills", "NFL", "Prop", "Mahomes o2.5 TD", "-120", "25"); $("jAdd").fire("click");
ok("seeded 3 rows", ($("jBetsBody").innerHTML.match(/<tr>/g) || []).length === 3);
ok("no count narration at rest", $("jMatchCount").textContent === "");

function search(q){ $("jSearch").value = q; $("jSearch").fire("input"); }
function rows(){ return ($("jBetsBody").innerHTML.match(/<tr>/g) || []).length; }

search("bears");
ok("search isolates the Bears bet", rows() === 1 && $("jBetsBody").innerHTML.includes("Packers"));
ok("match is marked", $("jBetsBody").innerHTML.includes("<mark>Bears</mark>"));
ok("honest shown count", $("jMatchCount").textContent === "1 of 3 bets shown");
ok("heading count still totals all", $("jCount").textContent === "3 bets logged");

search("nfl");
ok("sport term finds both NFL bets", rows() === 2 && !$("jBetsBody").innerHTML.includes("Cubs vs Cards"));

search("nfl prop");
ok("AND terms narrow across fields", rows() === 1 && $("jBetsBody").innerHTML.includes("Mahomes"));

search("zzzz");
ok("nonsense query -> named empty state",
  /No bets match/.test($("jBetsBody").innerHTML) && $("jBetsBody").innerHTML.includes("zzzz"));
ok("empty state count is honest", $("jMatchCount").textContent === "0 of 3 bets shown");

$("jSearch").fire("keydown", {key: "Escape"});
ok("Escape restores the full ledger", rows() === 3 && $("jSearch").value === "" && $("jMatchCount").textContent === "");

search("cubs");
ok("search before clear-button test", rows() === 1);
$("jSearchClear").fire("click");
ok("Clear button restores all", rows() === 3 && $("jSearch").value === "");

/* search survives a settle re-render; filters compose with search */
search("bears");
function fakeBtn(clsName, id, r){
  const b = makeEl("btn");
  b.classList.add(clsName);
  b.setAttribute("data-id", String(id));
  if(r) b.setAttribute("data-r", r);
  b.closest = () => b;
  return b;
}
$("jBetsBody").fire("click", {target: fakeBtn("j-settle", 1, "win")});
ok("settle under search keeps the row + query", rows() === 1 && $("jBetsBody").innerHTML.includes(">Win<") && $("jSearch").value === "bears");
$("jFilterResult").value = "loss"; sandbox.window.Journal.render();
ok("result filter composes (win hidden under loss)", rows() === 0 || /No bets match/.test($("jBetsBody").innerHTML));
$("jFilterResult").value = "win"; sandbox.window.Journal.render();
ok("result filter composes (win shown)", rows() === 1 && $("jBetsBody").innerHTML.includes("Packers"));

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail ? 1 : 0);
