/* News wire headline search (v1.152.0).
   Pure contract: GIU.newsFilter matches headline OR description,
   case-insensitive; blank query returns all (a copy); garbage in -> [].
   GIU.newsHl is XSS-safe <mark> highlighting (escape per segment).
   DOM wiring (real shipped news.js, stubbed DOM + deferred ESPN fetch):
   typing filters the loaded wire with an honest "N of M <league>
   headlines" count, the query survives a league tab switch, Clear and
   Escape restore the full wire, and a feed error is never overwritten
   by stale previous-league cards on the next keystroke. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", style: {}, value: "", className: "", hidden: false,
    _text: "", _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev, evObj){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, evObj || {target: this}); }, this); }
  };
  (function(){
    var s = {};
    el.classList = {
      add: function(c){ s[c]=1; },
      remove: function(c){ delete s[c]; },
      toggle: function(c){ if(s[c]) delete s[c]; else s[c]=1; },
      contains: function(c){ return !!s[c]; }
    };
  })();
  Object.defineProperty(el, "textContent", {
    get: function(){ return this._text; },
    set: function(v){ this._text = String(v); this.innerHTML = ""; },
    enumerable: true, configurable: true
  });
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["newsGrid","newsTabs","liveStatus","pauseBtn","newsSearch","newsClear","newsCount"].forEach(getEl);
getEl("newsClear").hidden = true;

var deferreds = [], fetchCalls = 0;
var fetchStub = function(){
  fetchCalls++;
  var rec = {};
  rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
  deferreds.push(rec);
  return rec.promise;
};
var intervals = [], cleared = [], nextId = 1;
var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(fn, ms){ var id = nextId++; intervals.push({id: id, fn: fn, ms: ms}); return id; },
  clearInterval: function(id){ cleared.push(id); },
  document: { getElementById: getEl, hidden: false },
  window: {},
  GIU: {
    fetchJSON: fetchStub,
    esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
var t0 = makeEl("tab-0"); t0.setAttribute("data-i","0");
var t1 = makeEl("tab-1"); t1.setAttribute("data-i","1");
getEl("newsTabs")._children = [t0, t1];
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/news.js"), "utf8"), sandbox, {filename: "js/news.js"});

var G = sandbox.GIU;

/* ---------- pure contract ---------- */
assert(typeof G.newsFilter === "function", "GIU.newsFilter exported");
assert(typeof G.newsHl === "function", "GIU.newsHl exported");
assert(G.newsNorm("  MaHoMeS ") === "mahomes", "newsNorm trims + lowercases");
assert(G.newsNorm(null) === "", "newsNorm(null) -> ''");

var ARTS = [
  { headline: "Mahomes throws 3 TDs", description: "Kansas City rolls." },
  { headline: "Trade deadline looms", description: "Jets acquire a back." },
  { headline: "Injury report", description: "Mahomes questionable Sunday." },
  { headline: null, description: null },
  null
];
var all = G.newsFilter(ARTS, "");
assert(all.length === 5 && all !== ARTS, "blank query returns a copy of every article");
assert(G.newsFilter(ARTS, "mahomes").length === 2, "filter matches headline AND description (2 hits)");
assert(G.newsFilter(ARTS, "MAHOMES").length === 2, "filter is case-insensitive");
assert(G.newsFilter(ARTS, "jets").length === 1, "description-only match counts");
assert(G.newsFilter(ARTS, "zzz").length === 0, "no match -> []");
assert(G.newsFilter(null, "x").length === 0, "garbage articles -> []");
assert(G.newsFilter("nope", "x").length === 0, "non-array articles -> []");
assert(ARTS.length === 5, "input array never mutated");

var esc = sandbox.GIU.esc;
assert(G.newsHl("Plain", "", esc) === "Plain", "hl with blank query is plain escape");
assert(G.newsHl("<b>bold</b>", "", esc) === "&lt;b&gt;bold&lt;/b&gt;", "hl escapes markup when blank");
assert(G.newsHl("Mahomes and mahomes", "mahomes", esc) === "<mark>Mahomes</mark> and <mark>mahomes</mark>",
       "hl wraps every occurrence, original case preserved");
assert(G.newsHl("<script>", "<", esc) === "<mark>&lt;</mark>script&gt;",
       "hl: a '<' query can never break out of the markup");
assert(G.newsHl(null, "x", esc) === "", "hl(null) -> ''");

/* ---------- DOM wiring ---------- */
function art(h, d){ return { headline: h, description: d,
  published: new Date(Date.now()-30*60000).toISOString(),
  images: [], links: { web: { href: "https://example.com/x" } } }; }
function nflWire(){ return { articles: [
  art("Mahomes throws 3 TDs in Chiefs win", "Kansas City rolls."),
  art("Trade deadline: Jets acquire RB", "New York adds depth."),
  art("Injury report: star QB questionable", "Mahomes ankle watch in Kansas City.")
] }; }
function settle(fn){ setTimeout(fn, 60); }
function grid(){ return getEl("newsGrid").innerHTML; }
function type(q){ var s = getEl("newsSearch"); s.value = q; s._fire("input"); }

deferreds[0].resolve(nflWire());
settle(function(){
  assert(grid().indexOf("Mahomes throws") !== -1 && grid().indexOf("Trade deadline") !== -1,
         "initial wire renders all headlines");
  assert(getEl("newsCount").textContent === "", "count is blank with no query");
  assert(getEl("newsClear").hidden === true, "clear button hidden with no query");

  type("mahomes");
  assert(grid().indexOf("<mark>Mahomes</mark> throws 3 TDs") !== -1, "filter keeps the headline match");
  assert(grid().indexOf("star QB questionable") !== -1, "filter keeps the description match");
  assert(grid().indexOf("Trade deadline") === -1, "filter drops the non-match");
  assert(grid().indexOf("<mark>Mahomes</mark>") !== -1, "matches are <mark>-highlighted");
  assert(getEl("newsCount").textContent === "2 of 3 NFL headlines",
         "honest count: " + JSON.stringify(getEl("newsCount").textContent));
  assert(getEl("newsClear").hidden === false, "clear button appears while searching");

  type("zzz");
  assert(grid().indexOf("No headlines match") !== -1 && grid().indexOf("zzz") !== -1,
         "empty state names the query");
  assert(getEl("newsCount").textContent === "No matches in NFL", "zero count is honest");

  getEl("newsSearch")._fire("keydown", { key: "Escape" });
  assert(getEl("newsSearch").value === "", "Escape clears the input");
  assert(grid().indexOf("Trade deadline") !== -1, "Escape restores the full wire");
  assert(getEl("newsCount").textContent === "", "Escape clears the count");

  /* query survives a tab switch: filter re-applies to the new league */
  type("trade");
  t1._fire("click");
  deferreds[deferreds.length-1].resolve({ articles: [
    art("Lakers trade for a wing", "Los Angeles moves."),
    art("Celtics cruise at home", "Boston wins big.")
  ] });
  settle(function(){
    assert(grid().indexOf("Lakers <mark>trade</mark>") !== -1, "tab switch keeps the matching story");
    assert(grid().indexOf("Celtics cruise") === -1, "tab switch still filters the new wire");
    assert(getEl("newsCount").textContent === "1 of 2 NBA headlines",
           "count follows the new league: " + JSON.stringify(getEl("newsCount").textContent));

    getEl("newsClear")._fire("click");
    assert(grid().indexOf("Celtics cruise") !== -1, "Clear button restores the full wire");
    assert(getEl("newsClear").hidden === true, "Clear hides itself after resetting");

    /* feed error: a keystroke must not resurrect the previous league */
    type("celtics");
    t0._fire("click");
    deferreds[deferreds.length-1].reject(new Error("down"));
    settle(function(){
      assert(grid().indexOf("didn't respond") !== -1, "feed error renders the fail box");
      type("lakers");
      assert(grid().indexOf("Lakers trade") === -1, "keystroke after an error does not resurrect stale cards");
      assert(grid().indexOf("didn't respond") !== -1, "fail box survives the keystroke");

      /* ---------- shipped pins ---------- */
      var html = fs.readFileSync(path.join(ROOT, "news.html"), "utf8");
      assert(html.indexOf('id="newsSearch"') !== -1, "news.html ships #newsSearch");
      assert(html.indexOf('id="newsClear"') !== -1, "news.html ships #newsClear");
      assert(html.indexOf('id="newsCount"') !== -1, "news.html ships #newsCount");
      assert(html.indexOf('aria-describedby="newsCount"') !== -1, "search input is described by the count");
      assert(html.indexOf('js/news.js?v=1.152.0') !== -1, "news.html pins news.js?v=1.152.0");

      if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
      console.log("ALL NEWS-SEARCH TESTS PASS");
    });
  });
});
