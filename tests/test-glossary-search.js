/* GridIronUI glossary instant search (v1.144.0).
   The glossary was browse-only (A-Z nav over 72 terms); the new search box
   filters live across term names AND definitions. These tests pin:
   - the pure filter contract (term match, definition match, case-insensitive,
     trimmed, multi-word, empty->all in original order, no input mutation)
   - the XSS-safe highlight helper (matches wrapped in <mark>, raw markup in
     terms/queries can never break out)
   - the mount wiring (browse render identical to the page's old output,
     typing filters + count line + clear button, Escape restores browse,
     missing hooks never blank the page)
   - the shipped glossary.html wiring (script tag + cache key, input/clear/
     count ids, mount call, TERMS kept inline for test-glossary-terms.js)
   Run: node tests/test-glossary-search.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var GS = require("../js/glossary.js");

var pass = 0, fail = 0;
function ok(name, cond){
  if(cond) pass++;
  else { fail++; console.log("FAIL:", name); }
}

var TERMS = [
  ["Action", "Any live, graded bet."],
  ["Arbitrage", "Betting all outcomes across books at prices that guarantee profit."],
  ["Cash out", "A sportsbook's offer to settle your bet before the event ends."],
  ["Chalk", "The favorite."],
  ["Dime", "Slang for $1,000."],
  ["Vig / vigorish", "See Juice."],
  ["Juice", "The book's commission, usually -110."],
  ["<b>Bold</b>", "A term with <markup> in it."]
];
function esc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

/* ---- filterTerms ---- */
ok("term-name match", GS.filterTerms(TERMS, "chalk").length === 1 &&
   GS.filterTerms(TERMS, "chalk")[0][0] === "Chalk");
ok("definition match", GS.filterTerms(TERMS, "graded bet").length === 1 &&
   GS.filterTerms(TERMS, "graded bet")[0][0] === "Action");
ok("case-insensitive", GS.filterTerms(TERMS, "VIG").length === 1 &&
   GS.filterTerms(TERMS, "ViG")[0][0] === "Vig / vigorish");
ok("trims whitespace", GS.filterTerms(TERMS, "  chalk  ").length === 1);
ok("multi-word query", GS.filterTerms(TERMS, "cash out").length === 1 &&
   GS.filterTerms(TERMS, "cash out")[0][0] === "Cash out");
ok("slash term searchable by alias", GS.filterTerms(TERMS, "vigorish").length === 1);
var all = GS.filterTerms(TERMS, "");
ok("empty query returns all, original order",
   all.length === TERMS.length && all[0][0] === "Action" && all[7][0] === "<b>Bold</b>");
ok("blank query returns all", GS.filterTerms(TERMS, "   ").length === TERMS.length);
ok("null query returns all", GS.filterTerms(TERMS, null).length === TERMS.length);
ok("no match -> empty", GS.filterTerms(TERMS, "zyxqwv").length === 0);
var before = JSON.stringify(TERMS);
GS.filterTerms(TERMS, "chalk");
ok("does not mutate input", JSON.stringify(TERMS) === before);
ok("definition-only ranking keeps order",
   GS.filterTerms(TERMS, "bet").map(function(t){ return t[0]; }).join("|") ===
   "Action|Arbitrage|Cash out");

/* ---- hlHtml ---- */
ok("wraps the match in <mark>",
   GS.hlHtml("Vig / vigorish", "vig", esc) === "<mark>Vig</mark> / <mark>vig</mark>orish");
ok("case-insensitive match on original casing",
   GS.hlHtml("Cash out", "CASH", esc) === "<mark>Cash</mark> out");
ok("multiple occurrences all wrapped",
   GS.hlHtml("Bet the bet", "bet", esc) === "<mark>Bet</mark> the <mark>bet</mark>");
ok("escapes raw markup in the term",
   GS.hlHtml("<b>Bold</b>", "bold", esc) === "&lt;b&gt;<mark>Bold</mark>&lt;/b&gt;");
ok("malicious query cannot break out",
   GS.hlHtml("Chalk", "<img", esc) === "Chalk" &&
   GS.hlHtml("Chalk", "<", esc).indexOf("<img") === -1);
ok("empty query returns plain escaped term",
   GS.hlHtml("<b>Bold</b>", "", esc) === "&lt;b&gt;Bold&lt;/b&gt;");
ok("works without an esc fn", GS.hlHtml("Chalk", "chalk") === "<mark>Chalk</mark>");

/* ---- mount: fake-DOM wiring ---- */
function fakeEl(){
  var listeners = {};
  return {
    innerHTML: "", textContent: "", value: "", hidden: false,
    attrs: {},
    addEventListener: function(ev, fn){ (listeners[ev] = listeners[ev] || []).push(fn); },
    fire: function(ev, arg){ (listeners[ev] || []).forEach(function(fn){ fn(arg); }); },
    setAttribute: function(k, v){ this.attrs[k] = v; },
    focus: function(){ this.focused = true; }
  };
}
var list = fakeEl(), nav = fakeEl(), search = fakeEl(), clear = fakeEl(), count = fakeEl();
ok("mount returns true with full hooks",
   GS.mount({list: list, nav: nav, search: search, clear: clear, count: count,
             terms: TERMS, esc: esc}) === true);
ok("browse render keeps alpha groups + anchors",
   list.innerHTML.indexOf('<h2 id="L-A"') !== -1 &&
   list.innerHTML.indexOf('<h2 id="L-V"') !== -1 &&
   list.innerHTML.indexOf("Vig / vigorish") !== -1);
ok("browse render keeps the old card classes",
   list.innerHTML.indexOf('class="gloss-term"') !== -1);
ok("alpha nav built", nav.innerHTML.indexOf('<a href="#L-A">A</a>') !== -1);
ok("clear hidden on browse", clear.hidden === true);
ok("count empty on browse", count.textContent === "");
ok("placeholder names the term count",
   String(search.attrs.placeholder || "").indexOf("8 terms") !== -1);

/* type a query */
search.value = "vig";
search.fire("input");
ok("filter narrows the list",
   list.innerHTML.indexOf("<mark>Vig</mark>") !== -1 &&
   list.innerHTML.indexOf("Chalk") === -1);
ok("match highlighted", list.innerHTML.indexOf("orish") !== -1);
ok("definition still escaped+shown",
   list.innerHTML.indexOf("See Juice.") !== -1);
ok("count line is honest", count.textContent === "1 of 8 terms");
ok("clear button revealed", clear.hidden === false);
ok("nav hidden while filtering", nav.innerHTML === "");

/* a definition-only query */
search.value = "graded bet";
search.fire("input");
ok("definition-only query finds Action",
   list.innerHTML.indexOf("Action") !== -1 && count.textContent === "1 of 8 terms");

/* empty state */
search.value = "zyxqwv";
search.fire("input");
ok("empty state names the query",
   list.innerHTML.indexOf("zyxqwv") !== -1 &&
   list.innerHTML.indexOf("gloss-empty") !== -1);
ok("empty count honest", count.textContent === "No matches");

/* clear restores browse */
clear.fire("click");
ok("clear restores the alpha browse",
   list.innerHTML.indexOf('<h2 id="L-A"') !== -1 &&
   nav.innerHTML.indexOf('<a href="#L-A">A</a>') !== -1);
ok("clear empties the input", search.value === "");
ok("clear refocuses the input", search.focused === true);
ok("clear hides itself again", clear.hidden === true);

/* Escape restores browse */
search.value = "chalk"; search.fire("input");
ok("filtered before escape", list.innerHTML.indexOf("Chalk") !== -1);
search.fire("keydown", {key: "Escape"});
ok("escape restores browse", search.value === "" &&
   list.innerHTML.indexOf('<h2 id="L-A"') !== -1);

/* non-Escape keys do not reset */
search.value = "chalk"; search.fire("input");
search.fire("keydown", {key: "Enter"});
ok("enter does not reset the filter", search.value === "chalk" &&
   list.innerHTML.indexOf("Chalk") !== -1);

/* missing hooks never blank the page */
var l2 = fakeEl(), n2 = fakeEl(), s2 = fakeEl();
l2.innerHTML = "KEEPME";
ok("mount refuses without search hook",
   GS.mount({list: l2, nav: n2, search: null, terms: TERMS, esc: esc}) === false &&
   l2.innerHTML === "KEEPME");
ok("mount refuses without terms",
   GS.mount({list: l2, nav: n2, search: s2, terms: [], esc: esc}) === false);

/* ---- shipped glossary.html wiring pins ---- */
var html = fs.readFileSync(path.join(ROOT, "glossary.html"), "utf8");
ok("glossary.html loads js/glossary.js?v=1.144.1",
   html.indexOf('src="js/glossary.js?v=1.144.1"') !== -1);
ok("search input shipped", html.indexOf('id="glossQ"') !== -1 &&
   html.indexOf('type="search"') !== -1);
ok("clear button shipped", html.indexOf('id="glossClear"') !== -1);
ok("live count region shipped",
   html.indexOf('id="glossCount"') !== -1 && html.indexOf('aria-live="polite"') !== -1);
ok("label for the input", html.indexOf('for="glossQ"') !== -1);
ok("mount called with the TERMS array",
   html.indexOf("GlosSearch.mount") !== -1 && html.indexOf("terms: TERMS") !== -1);
ok("TERMS still inline for test-glossary-terms.js",
   /var TERMS = (\[[\s\S]*?\]);\s*\(function/.test(html));
ok("search styles page-scoped", html.indexOf(".gloss-search") !== -1);
ok("sr-only label styled", html.indexOf("sr-only") !== -1);

console.log("test-glossary-search: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
