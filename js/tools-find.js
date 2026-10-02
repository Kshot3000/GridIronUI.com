/* GridIronUI tools finder (v1.159.0).
   node + browser: window.ToolsFind in the page, module.exports for tests.
   tools.html stacks 17 calculators in one long grid — on a phone that is
   17 screens of scrolling, usually mid-game, when the bettor needs ONE
   tool (the cash-out evaluator, the ticket hedge planner) right now.
   Typing filters the cards live: the catalog is built from the cards
   actually on the page (each card's own title + hint text) plus a
   synonym map keyed by card id, so a new card is searchable by its own
   words the day it ships and the count can never promise a tool the
   page does not have. Filtering only toggles display — a calculator's
   inputs and results survive a search untouched. Clearing (button or
   Escape) restores every card. Nothing here invents data. */
(function(){
"use strict";

/* Synonyms bettors actually type, keyed by the card's id in tools.html.
   A card with no entry still matches on its own title + hint. */
var KEYWORDS = {
  "converter": "convert american decimal fractional format",
  "implied": "probability chance percent break even breakeven",
  "payout": "profit return winnings stake",
  "parlay": "combined legs accumulator acca",
  "roundrobin": "round robin by 2s by 3s",
  "kelly": "kelly criterion stake sizing edge bankroll",
  "ev": "expected value edge plus ev minus ev",
  "vig": "juice no-vig novig fair odds hold devig remover",
  "hedge": "arbitrage arb guaranteed profit lock",
  "tickethedge": "ticket last leg parlay freeroll free roll planner",
  "middle": "middling both sides window split",
  "bonus": "promo promotion bonus bet deposit match rollover boost conversion",
  "cashout": "cash out settle offer fair value buyout",
  "dutching": "dutch split stake multiple outcomes equal payout",
  "teaser": "wong key numbers buy points teaser",
  "bankroll": "risk simulator monte carlo simulation ruin losing streak",
  "journal-tool": "journal log record track bets roi"
};

function norm(q){
  return String(q == null ? "" : q).trim().toLowerCase();
}

/* Pure: build one catalog entry from a card's parts. `text` is the card's
   own hint copy; keywords come from the synonym map (unknown id -> ""). */
function catalogEntry(id, title, text){
  var i = String(id == null ? "" : id);
  return {
    id: i,
    title: String(title == null ? "" : title),
    hay: norm(i + " " + (title || "") + " " + (text || "") + " " + (KEYWORDS[i] || ""))
  };
}

/* Pure: does this catalog entry match the query? Blank query matches
   everything (the unfiltered page). Substring over the haystack, the
   same discipline as the glossary/news searches. */
function toolMatches(entry, q){
  var needle = norm(q);
  if(!needle) return true;
  if(!entry || typeof entry.hay !== "string") return false;
  return entry.hay.indexOf(needle) !== -1;
}

/* Pure: the entries matching the query, original order, input untouched. */
function filterTools(catalog, q){
  var src = Array.isArray(catalog) ? catalog : [];
  if(!norm(q)) return src.slice();
  return src.filter(function(e){ return toolMatches(e, q); });
}

/* Pure, XSS-safe: escape the raw title, then wrap every case-insensitive
   occurrence of the query in <mark>. Escaping happens per-segment so a
   query like "<" can never break out of the markup. Same helper shape
   as glossary.js hlHtml. */
function hlHtml(title, q, esc){
  var raw = String(title == null ? "" : title);
  var e = typeof esc === "function" ? esc : function(s){ return String(s); };
  var needle = norm(q);
  if(!needle) return e(raw);
  var low = raw.toLowerCase(), out = "", i = 0, j;
  while((j = low.indexOf(needle, i)) !== -1){
    out += e(raw.slice(i, j)) + "<mark>" + e(raw.slice(j, j + needle.length)) + "</mark>";
    i = j + needle.length;
  }
  return out + e(raw.slice(i));
}

function escHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

/* Wire the shipped page. els: {search, clear, count, empty, cards} where
   cards is an array of {el, titleEl, entry} built by the boot code below
   from the real DOM. No-op (returns false, page untouched) if the hooks
   are missing — the calculators are static HTML and must work with this
   script absent or broken. */
function mount(els){
  var search = els && els.search, clear = els && els.clear;
  var count = els && els.count, empty = els && els.empty;
  var cards = (els && els.cards) || [];
  if(!search || !cards.length) return false;
  var total = cards.length;
  function setCount(n, q){
    if(!count) return;
    if(q == null){ count.textContent = ""; return; }
    count.textContent = n === 0
      ? "No matches"
      : n + " of " + total + " tool" + (total === 1 ? "" : "s");
  }
  function restoreTitles(){
    cards.forEach(function(c){ if(c.titleEl) c.titleEl.textContent = c.entry.title; });
  }
  function showAll(){
    cards.forEach(function(c){ if(c.el) c.el.style.display = ""; });
    restoreTitles();
    if(empty) empty.hidden = true;
    if(clear) clear.hidden = true;
    setCount(null);
  }
  function apply(){
    var q = search.value;
    if(!norm(q)){ showAll(); return; }
    var hits = {};
    filterTools(cards.map(function(c){ return c.entry; }), q)
      .forEach(function(e){ hits[e.id] = 1; });
    var n = 0;
    cards.forEach(function(c){
      var on = !!hits[c.entry.id];
      if(c.el) c.el.style.display = on ? "" : "none";
      if(on){
        n++;
        if(c.titleEl) c.titleEl.innerHTML = hlHtml(c.entry.title, q, escHtml);
      } else if(c.titleEl){
        c.titleEl.textContent = c.entry.title;
      }
    });
    if(empty) empty.hidden = n !== 0;
    if(clear) clear.hidden = false;
    setCount(n, q);
  }
  function reset(){
    search.value = "";
    showAll();
    if(typeof search.focus === "function") search.focus();
  }
  search.addEventListener("input", apply);
  search.addEventListener("keydown", function(ev){
    if(ev && ev.key === "Escape") reset();
  });
  if(clear) clear.addEventListener("click", reset);
  return true;
}

/* Browser boot: build the catalog from the cards on the page and mount.
   Runs only in a real document; in node the module just exports. */
function boot(){
  var search = document.getElementById("toolQ");
  if(!search) return;
  var nodes = document.querySelectorAll(".calc[id]");
  var cards = [];
  for(var i = 0; i < nodes.length; i++){
    var el = nodes[i];
    var h = el.querySelector("h3");
    var hint = el.querySelector(".hint");
    cards.push({
      el: el,
      titleEl: h || null,
      entry: catalogEntry(el.id, h ? h.textContent : "", hint ? hint.textContent : "")
    });
  }
  mount({
    search: search,
    clear: document.getElementById("toolClear"),
    count: document.getElementById("toolCount"),
    empty: document.getElementById("toolEmpty"),
    cards: cards
  });
}

var api = { norm: norm, KEYWORDS: KEYWORDS, catalogEntry: catalogEntry,
            toolMatches: toolMatches, filterTools: filterTools,
            hlHtml: hlHtml, escHtml: escHtml, mount: mount };
if(typeof module !== "undefined" && module.exports) module.exports = api;
if(typeof window !== "undefined"){
  window.ToolsFind = api;
  if(typeof document !== "undefined"){
    if(document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
}
})();
