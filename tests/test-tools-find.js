/* GridIronUI tools finder (v1.159.0).
   tools.html stacks 17 calculators in one long grid; the finder filters
   them live by each card's own title + hint plus a synonym map. These
   tests pin:
   - the pure filter contract (title/hint/synonym matches, case-insensitive,
     trimmed, blank->all in original order, garbage-in -> no match,
     no input mutation)
   - the XSS-safe highlight helper (matches wrapped in <mark>, raw markup
     in titles/queries can never break out)
   - the mount wiring (typing hides/shows cards + honest count + empty
     state, Clear/Escape restore every card AND its original title,
     a card's display state is the only thing ever touched,
     missing hooks never break the page)
   - the shipped tools.html wiring + catalog: every .calc card on the
     real page is findable by its own title and by bettor synonyms
     ("cash out", "arb", "wong", "monte carlo", "juice"), the finder
     ids exist, tools-find.js carries ?v=1.159.0 and tools.js keeps its
     pinned ?v=1.67.0 (calculators untouched)
   Run: node tests/test-tools-find.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var TF = require("../js/tools-find.js");

var pass = 0, fail = 0;
function ok(name, cond){
  if(cond) pass++;
  else { fail++; console.log("FAIL:", name); }
}

/* ---- catalogEntry / filterTools ---- */
var CAT = [
  TF.catalogEntry("converter", "Odds converter", "Enter odds in any format."),
  TF.catalogEntry("cashout", "Cash-out evaluator", "The book flashes a cash-out number mid-game."),
  TF.catalogEntry("teaser", "Teaser calculator", "Buy points on every leg of a parlay."),
  TF.catalogEntry("hedge", "Hedge & arbitrage finder", "Lock profit or find an arb."),
  TF.catalogEntry("mystery", "Mystery tool", "Does something undisclosed.")
];
ok("title match", TF.filterTools(CAT, "teaser").length === 1 &&
   TF.filterTools(CAT, "teaser")[0].id === "teaser");
ok("hint match", TF.filterTools(CAT, "flashes").length === 1 &&
   TF.filterTools(CAT, "flashes")[0].id === "cashout");
ok("synonym: cash out (spaced) finds the hyphenated cash-out card",
   TF.filterTools(CAT, "cash out").length === 1 &&
   TF.filterTools(CAT, "cash out")[0].id === "cashout");
ok("synonym: arb finds hedge", TF.filterTools(CAT, "arb").some(function(e){ return e.id === "hedge"; }));
ok("synonym: wong finds teaser", TF.filterTools(CAT, "wong").length === 1 &&
   TF.filterTools(CAT, "wong")[0].id === "teaser");
ok("unknown-id card still matches on its own words",
   TF.filterTools(CAT, "undisclosed").length === 1 &&
   TF.filterTools(CAT, "undisclosed")[0].id === "mystery");
ok("case-insensitive", TF.filterTools(CAT, "TEASER").length === 1);
ok("trims whitespace", TF.filterTools(CAT, "  teaser  ").length === 1);
ok("id itself is searchable", TF.filterTools(CAT, "cashout").length === 1);
var all = TF.filterTools(CAT, "");
ok("empty query returns all, original order",
   all.length === CAT.length && all[0].id === "converter" && all[4].id === "mystery");
ok("blank query returns all", TF.filterTools(CAT, "   ").length === CAT.length);
ok("null query returns all", TF.filterTools(CAT, null).length === CAT.length);
ok("no match -> empty", TF.filterTools(CAT, "zyxqwv").length === 0);
ok("garbage catalog -> empty", TF.filterTools(null, "teaser").length === 0 &&
   TF.filterTools("nope", "teaser").length === 0);
ok("garbage entry never matches", TF.toolMatches(null, "x") === false &&
   TF.toolMatches({}, "x") === false);
var before = JSON.stringify(CAT);
TF.filterTools(CAT, "teaser");
ok("does not mutate input", JSON.stringify(CAT) === before);

/* ---- hlHtml ---- */
ok("highlight wraps match", TF.hlHtml("Cash-out evaluator", "cash", TF.escHtml) ===
   "<mark>Cash</mark>-out evaluator");
ok("highlight is case-insensitive + repeats",
   TF.hlHtml("Vig and vig", "vig", TF.escHtml) === "<mark>Vig</mark> and <mark>vig</mark>");
ok("highlight escapes raw markup in the title",
   TF.hlHtml("<b>Vig</b>", "vig", TF.escHtml) === "&lt;b&gt;<mark>Vig</mark>&lt;/b&gt;");
ok("hostile query cannot break out",
   TF.hlHtml("a<b", "<b", TF.escHtml) === "a<mark>&lt;b</mark>");
ok("blank query returns escaped title",
   TF.hlHtml("<b>x</b>", "", TF.escHtml) === "&lt;b&gt;x&lt;/b&gt;");
ok("escHtml escapes all five", TF.escHtml("&<>\"'") === "&amp;&lt;&gt;&quot;&#39;");

/* ---- mount wiring (fake DOM) ---- */
function fakeEl(){ return { style: {}, hidden: true, textContent: "", innerHTML: "" }; }
function fakeSearch(){
  return { value: "", _h: {},
    addEventListener: function(t, f){ this._h[t] = f; },
    fire: function(t, ev){ if(this._h[t]) this._h[t](ev || {}); },
    focus: function(){ this._focused = true; } };
}
function fakeCards(){
  return CAT.map(function(e){
    var titleEl = fakeEl(); titleEl.textContent = e.title;
    return { el: fakeEl(), titleEl: titleEl, entry: e };
  });
}
var search = fakeSearch(), count = fakeEl(), empty = fakeEl();
var clear = fakeSearch(); clear.hidden = true; empty.hidden = true;
var cards = fakeCards();
ok("mount returns true with full hooks",
   TF.mount({ search: search, clear: clear, count: count, empty: empty, cards: cards }) === true);

search.value = "cash out"; search.fire("input");
ok("filter hides non-matching cards",
   cards[0].el.style.display === "none" && cards[2].el.style.display === "none");
ok("filter shows the matching card", cards[1].el.style.display === "");
ok("honest count while filtering", count.textContent === "1 of 5 tools");
ok("clear button appears while filtering", clear.hidden === false);
ok("empty state stays hidden with a match", empty.hidden === true);

search.value = "cash"; search.fire("input");
ok("title highlight wraps the matched word",
   cards[1].titleEl.innerHTML === "<mark>Cash</mark>-out evaluator");
ok("hidden card titles are restored, not left marked",
   cards[0].titleEl.textContent === CAT[0].title);

search.value = "zyxqwv"; search.fire("input");
ok("no match hides every card", cards.every(function(c){ return c.el.style.display === "none"; }));
ok("no match shows the empty state", empty.hidden === false);
ok("no match count is honest", count.textContent === "No matches");

search.fire("keydown", { key: "Escape" });
ok("Escape restores every card", cards.every(function(c){ return c.el.style.display === ""; }));
ok("Escape clears the query", search.value === "");
ok("Escape restores original titles",
   cards.every(function(c, i){ return c.titleEl.textContent === CAT[i].title; }));
ok("Escape hides empty state + clear", empty.hidden === true && clear.hidden === true);
ok("Escape clears the count", count.textContent === "");

search.value = "teaser"; search.fire("input");
ok("re-filter after restore works", cards[2].el.style.display === "" &&
   cards[0].el.style.display === "none");
clear.fire("click");
ok("Clear button restores every card + query",
   search.value === "" && cards.every(function(c){ return c.el.style.display === ""; }));
search.value = ""; search.fire("input");
ok("blanking the box restores all", cards.every(function(c){ return c.el.style.display === ""; }));

ok("mount with no search is a no-op", TF.mount({ cards: cards }) === false);
ok("mount with no cards is a no-op", TF.mount({ search: fakeSearch(), cards: [] }) === false);
ok("mount with nothing is a no-op", TF.mount(null) === false && TF.mount({}) === false);

/* ---- shipped tools.html: wiring + real catalog ---- */
var html = fs.readFileSync(path.join(ROOT, "tools.html"), "utf8");
ok("finder input shipped", html.indexOf('id="toolQ"') !== -1);
ok("finder clear shipped", html.indexOf('id="toolClear"') !== -1);
ok("finder count shipped (live region)",
   html.indexOf('id="toolCount"') !== -1 && html.indexOf('aria-live="polite"') !== -1);
ok("finder empty state shipped", html.indexOf('id="toolEmpty"') !== -1);
ok("tools-find.js cache key is v1.159.0", html.indexOf("js/tools-find.js?v=1.159.0") !== -1);
ok("tools.js pin untouched at v1.67.0", html.indexOf("js/tools.js?v=1.67.0") !== -1);

var ids = [], m, re = /class="card calc" id="([a-z0-9-]+)"/g;
while((m = re.exec(html)) !== null) ids.push(m[1]);
ok("17 calculator cards on the page", ids.length === 17, "found=" + ids.length);
var realCat = ids.map(function(id){
  var at = html.indexOf('id="' + id + '"');
  var h3 = html.slice(at).match(/<h3>([^<]*)<\/h3>/);
  var hint = html.slice(at).match(/<p class="hint">([\s\S]*?)<\/p>/);
  var strip = function(s){ return (s || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&"); };
  return TF.catalogEntry(id, strip(h3 && h3[1]), strip(hint && hint[1]));
});
ok("every real card findable by its own title",
   realCat.every(function(e){
     var w = e.title.toLowerCase().split(/[^a-z]+/).filter(function(x){ return x.length > 3; })[0];
     return !w || TF.filterTools(realCat, w).some(function(x){ return x.id === e.id; });
   }));
[["cash out", "cashout"], ["arb", "hedge"], ["wong", "teaser"],
 ["monte carlo", "bankroll"], ["juice", "vig"], ["kelly", "kelly"],
 ["parlay", "parlay"], ["journal", "journal-tool"], ["dutch", "dutching"],
 ["rollover", "bonus"], ["round robin", "roundrobin"]].forEach(function(pair){
  ok("bettor synonym '" + pair[0] + "' finds #" + pair[1],
     TF.filterTools(realCat, pair[0]).some(function(e){ return e.id === pair[1]; }));
});
ok("nonsense finds nothing on the real page",
   TF.filterTools(realCat, "zyxqwv").length === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
