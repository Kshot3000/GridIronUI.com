/* GridIronUI glossary instant search (v1.144.0).
   node + browser: window.GlosSearch in the page, module.exports for tests.
   The glossary page was browse-only (A-Z jump nav over 72 terms) — a bettor
   who hears "steam" or "dime" mid-show had to scroll to find it. Now typing
   filters the list live, matching term names AND definitions, with the match
   highlighted and a live result count. Clearing (button or Escape) restores
   the alphabetical browse view. Nothing here invents data: it only filters
   the page's own TERMS array. */
(function(){
"use strict";

function norm(q){
  return String(q == null ? "" : q).trim().toLowerCase();
}

/* Pure: terms whose name or definition contains the query (case-insensitive).
   Blank query returns every term in original order — the browse view calls
   renderBrowse() itself, but the contract is explicit for tests. The input
   array is never mutated. */
function filterTerms(terms, q){
  var needle = norm(q);
  var src = Array.isArray(terms) ? terms : [];
  if(!needle) return src.slice();
  return src.filter(function(t){
    var name = String((t && t[0]) || "").toLowerCase();
    var def = String((t && t[1]) || "").toLowerCase();
    return name.indexOf(needle) !== -1 || def.indexOf(needle) !== -1;
  });
}

/* Pure, XSS-safe: escape the raw term, then wrap every case-insensitive
   occurrence of the query in <mark>. Escaping happens per-segment so a query
   like "<" can never break out of the markup. */
function hlHtml(term, q, esc){
  var raw = String(term == null ? "" : term);
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

/* Group key: first ASCII letter of the term, like the page's original render. */
function groupKey(name){
  return String(name || "").replace(/^[^A-Za-z]*/, "").charAt(0).toUpperCase() || "#";
}

/* The original alphabetical browse render, byte-for-byte the page's old
   output (same ids, same classes) so bookmarks and the alpha nav keep working. */
function renderBrowse(list, nav, terms, esc){
  var letters = {};
  terms.forEach(function(t){
    var L = groupKey(t[0]);
    (letters[L] = letters[L] || []).push(t);
  });
  var abc = Object.keys(letters).sort();
  nav.innerHTML = abc.map(function(L){
    return '<a href="#L-' + L + '">' + L + "</a>";
  }).join("");
  list.innerHTML = abc.map(function(L){
    return '<h2 id="L-' + L + '" style="margin-top:1.6em">' + L + "</h2>" +
      letters[L].map(function(t){
        return '<div class="gloss-term"><h3>' + esc(t[0]) + "</h3><p>" + esc(t[1]) + "</p></div>";
      }).join("");
  }).join("");
}

/* Filtered view: flat list (alphabetical by term, like the browse), matched
   term names highlighted, honest count line, helpful empty state. */
function renderFiltered(list, nav, matches, q, total, esc){
  nav.innerHTML = "";
  var needle = norm(q);
  if(!matches.length){
    list.innerHTML =
      '<div class="gloss-empty"><h3>No terms match &ldquo;' + esc(String(q).trim()) + "&rdquo;</h3>" +
      "<p>Try &ldquo;juice&rdquo;, &ldquo;CLV&rdquo; or &ldquo;steam&rdquo; — or clear the search to browse A&ndash;Z.</p></div>";
    return 0;
  }
  var sorted = matches.slice().sort(function(a, b){
    var x = String(a[0]).toLowerCase(), y = String(b[0]).toLowerCase();
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  list.innerHTML = sorted.map(function(t){
    return '<div class="gloss-term"><h3>' + hlHtml(t[0], needle, esc) + "</h3><p>" + esc(t[1]) + "</p></div>";
  }).join("");
  return matches.length;
}

/* Wire the shipped page. els: {list, nav, search, clear, count, terms, esc}.
   No-op (leaves the page's server-rendered fallback alone) if anything is
   missing — the page must never go blank because a script hiccuped. */
function mount(els){
  var list = els && els.list, nav = els && els.nav, search = els && els.search;
  var clear = els && els.clear, count = els && els.count;
  var terms = (els && els.terms) || [];
  var esc = (els && els.esc) || function(s){ return String(s); };
  if(!list || !nav || !search || !terms.length) return false;
  function setCount(n, q){
    if(!count) return;
    if(q == null){ count.textContent = ""; return; }
    count.textContent = n === 0
      ? "No matches"
      : n + " of " + terms.length + " term" + (terms.length === 1 ? "" : "s");
  }
  function browse(){
    renderBrowse(list, nav, terms, esc);
    if(clear) clear.hidden = true;
    setCount(null);
  }
  function apply(){
    var q = search.value;
    if(!norm(q)){ browse(); return; }
    var n = renderFiltered(list, nav, filterTerms(terms, q), q, terms.length, esc);
    if(clear) clear.hidden = false;
    setCount(n, q);
  }
  function reset(){
    search.value = "";
    browse();
    if(typeof search.focus === "function") search.focus();
  }
  try{ search.setAttribute("placeholder", "Search " + terms.length + " terms \u2014 try \u201cvig\u201d, \u201csteam\u201d, \u201ccash out\u201d\u2026"); }catch(e){}
  search.addEventListener("input", apply);
  search.addEventListener("keydown", function(ev){
    if(ev && ev.key === "Escape") reset();
  });
  if(clear) clear.addEventListener("click", reset);
  browse();
  return true;
}

var api = { norm: norm, filterTerms: filterTerms, hlHtml: hlHtml,
            renderBrowse: renderBrowse, renderFiltered: renderFiltered,
            mount: mount };
if(typeof module !== "undefined" && module.exports) module.exports = api;
if(typeof window !== "undefined") window.GlosSearch = api;
})();
