/* GridIronUI v1.157.0 — followed teams on the news wire.
   Verifies js/news.js's pure follow contract (GIU.newsArticleTeams /
   GIU.newsFollowed / GIU.newsFollowHTML / GIU.newsArticleKey) and the
   shipped DOM wiring with the REAL team-follow.js + seeded
   localStorage. The honesty core: matching runs ONLY on ESPN's
   structured team categories (type "team", team.abbreviation) — a
   headline that merely mentions a followed team's name in text is
   NOT marked (no nickname false positives). Followed stories get the
   gold rail + "★ Your team" tag and a "Your teams" jump strip with
   one chip per followed story in the current view; the strip tracks
   the headline search filter, clears on tab-switch errors, and
   no/corrupt follows leave the wire exactly as before.
   Run: node tests/test-news-follow.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function esc(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- article fixtures ---------- */
function teamCat(abbr, name){
  return { type: "team", description: name || abbr, team: { id: 1, abbreviation: abbr, description: name || abbr } };
}
function leagueCat(){ return { type: "league", description: "NFL", league: { abbreviation: "NFL" } }; }
function art(id, headline, cats){
  return { id: id, headline: headline, description: "A story.", categories: cats,
    published: new Date(Date.now() - 30 * 60000).toISOString(),
    images: [], links: { web: { href: "https://example.com/x" } } };
}

/* ---------- pure contract (GIU exports need no DOM) ---------- */
(function pure(){
  function stubEl(){
    return { innerHTML: "", value: "", hidden: false, style: {},
      addEventListener: function(){}, setAttribute: function(){},
      querySelectorAll: function(){ return []; },
      classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } } };
  }
  var pureEls = {};
  var sandbox = { window: {}, document: { hidden: false,
      getElementById: function(id){ return pureEls[id] || (pureEls[id] = stubEl()); } },
    setInterval: function(){ return 1; }, clearInterval: function(){}, setTimeout: setTimeout, clearTimeout: clearTimeout,
    GIU: { esc: esc, fetchJSON: function(){ var p = { then: function(){ return p; }, catch: function(){ return p; } }; return p; },
           failBox: function(m){ return m; } } };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/news.js"), "utf8"), sandbox, { filename: "js/news.js" });
  var G = sandbox.GIU;

  assert(typeof G.newsArticleTeams === "function", "newsArticleTeams exported");
  assert(typeof G.newsFollowed === "function", "newsFollowed exported");
  assert(typeof G.newsFollowHTML === "function", "newsFollowHTML exported");
  assert(typeof G.newsArticleKey === "function", "newsArticleKey exported");

  var jetsBears = art(401, "Jets rule out Hall vs. Bears", [leagueCat(), teamCat("NYJ", "New York Jets"), teamCat("CHI", "Chicago Bears")]);
  eq(JSON.stringify(G.newsArticleTeams(jetsBears)), JSON.stringify(["NYJ", "CHI"]),
     "articleTeams extracts team categories only, in order");
  eq(JSON.stringify(G.newsArticleTeams(art(1, "x", [leagueCat(), { type: "athlete", athlete: { id: 9 } }]))), "[]",
     "league/athlete categories are not teams");
  eq(JSON.stringify(G.newsArticleTeams(art(1, "x", [teamCat("nyj"), teamCat("NYJ"), teamCat(" ")]))), JSON.stringify(["NYJ"]),
     "abbrs normalized + deduped, blank dropped");
  eq(JSON.stringify(G.newsArticleTeams(null)), "[]", "garbage-in: null article -> []");
  eq(JSON.stringify(G.newsArticleTeams({ categories: "junk" })), "[]", "garbage-in: non-array categories -> []");
  eq(JSON.stringify(G.newsArticleTeams({})), "[]", "garbage-in: no categories -> []");

  var mentionOnly = art(402, "Bears defense dominates again", [leagueCat()]);
  var cowboys = art(403, "Cowboys roll at home", [leagueCat(), teamCat("DAL", "Dallas Cowboys")]);
  var wire = [jetsBears, mentionOnly, cowboys];
  var m = G.newsFollowed(wire, ["CHI", "NYJ"]);
  eq(m.length, 1, "one followed story: only the structured-tagged article matches");
  eq(m[0].abbr, "CHI", "both sides tagged + followed: earlier follow-list entry wins");
  eq(m[0].key, "nw-401", "match carries the article anchor key");
  eq(m[0].headline, "Jets rule out Hall vs. Bears", "match carries the headline for the chip");
  eq(G.newsFollowed(wire, ["NYJ"])[0].abbr, "NYJ", "single follow matches its tag");
  eq(G.newsFollowed(wire, ["BUF"]).length, 0, "followed team not tagged anywhere -> []");
  eq(G.newsFollowed(wire, []).length, 0, "no follows -> []");
  eq(G.newsFollowed(wire, null).length, 0, "garbage-in: null follows -> []");
  eq(G.newsFollowed(null, ["CHI"]).length, 0, "garbage-in: null wire -> []");
  eq(G.newsFollowed([null, {}, mentionOnly], ["CHI"]).length, 0,
     "malformed articles skipped; a text-only Bears mention never matches");
  eq(G.newsFollowed(wire, ["chi", 42, "", "toolongname", "CHI"]).length, 1,
     "non-string / implausible / duplicate follow entries dropped");

  eq(G.newsArticleKey({ id: 401 }, 0), "nw-401", "articleKey uses the ESPN id");
  eq(G.newsArticleKey({ id: 'a"b<c>' }, 0), "nw-abc", "articleKey sanitizes a hostile id");
  eq(G.newsArticleKey({}, 3), "nw-x3", "articleKey falls back to position without an id");
  eq(G.newsArticleKey(null, 2), "nw-x2", "articleKey tolerates a null article");

  var html = G.newsFollowHTML(m, esc);
  assert(html.indexOf("Your teams") !== -1, "strip HTML carries the 'Your teams' label");
  assert(html.indexOf('href="#nw-401"') !== -1 && html.indexOf("<b>CHI</b>") !== -1 &&
         html.indexOf("Jets rule out Hall vs. Bears") !== -1, "chip links to the card anchor with abbr + headline");
  var long = G.newsFollowHTML([{ key: "nw-9", abbr: "CHI", headline: "A very long headline that should be clipped for the chip strip display" }], esc);
  assert(long.indexOf("…") !== -1 && long.indexOf("display") === -1, "long headlines are clipped in chips");
  var hostile = G.newsFollowHTML([{ key: 'x" onmouseover="1', abbr: "CHI", headline: "<img src=x onerror=1>" }], esc);
  assert(hostile.indexOf("<img src=x") === -1 && hostile.indexOf("&lt;img") !== -1 &&
         hostile.indexOf('onmouseover="1"') === -1, "hostile key/headline escaped in chip HTML");
  eq(G.newsFollowHTML(null, esc).indexOf("Your teams") !== -1, true, "followHTML tolerates garbage matches");
})();

/* ---------- DOM wiring (real team-follow.js + seeded storage) ---------- */
function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", style: {}, value: "", className: "", hidden: false,
    _text: "", _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev, evObj){ (handlers[ev] || []).forEach(function(fn){ fn.call(this, evObj || { target: this }); }, this); }
  };
  (function(){
    var s = {};
    el.classList = {
      add: function(c){ s[c] = 1; }, remove: function(c){ delete s[c]; },
      toggle: function(c){ if(s[c]) delete s[c]; else s[c] = 1; },
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

var store = { "giu-followed-teams": JSON.stringify(["CHI", "NYJ"]) };
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["newsGrid", "newsTabs", "liveStatus", "pauseBtn", "newsSearch", "newsClear", "newsCount", "newsFollow"].forEach(getEl);
getEl("newsClear").hidden = true;
getEl("newsFollow").hidden = true;

var deferreds = [];
var sandbox2 = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 1; }, clearInterval: function(){},
  localStorage: {
    getItem: function(k){ return k in store ? store[k] : null; },
    setItem: function(k, v){ store[k] = String(v); },
    removeItem: function(k){ delete store[k]; }
  },
  document: { getElementById: getEl, hidden: false },
  window: {},
  GIU: {
    esc: esc,
    fetchJSON: function(){
      var rec = {};
      rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
      deferreds.push(rec);
      return rec.promise;
    },
    failBox: function(m){ return '<div class="fail">' + m + "</div>"; }
  }
};
sandbox2.window.GIU = sandbox2.GIU;
vm.createContext(sandbox2);
var t0 = makeEl("tab-0"); t0.setAttribute("data-i", "0");
var t1 = makeEl("tab-1"); t1.setAttribute("data-i", "1");
getEl("newsTabs")._children = [t0, t1];
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-follow.js"), "utf8"), sandbox2, { filename: "js/team-follow.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/news.js"), "utf8"), sandbox2, { filename: "js/news.js" });

function settle(fn){ setTimeout(fn, 60); }
function grid(){ return getEl("newsGrid").innerHTML; }
function strip(){ return getEl("newsFollow"); }
function type(q){ var s = getEl("newsSearch"); s.value = q; s._fire("input"); }

deferreds[0].resolve({ articles: [
  art(401, "Jets rule out Hall vs. Bears", [leagueCat(), teamCat("NYJ", "New York Jets"), teamCat("CHI", "Chicago Bears")]),
  art(402, "Bears defense dominates again", [leagueCat()]),
  art(403, "Cowboys roll at home", [leagueCat(), teamCat("DAL", "Dallas Cowboys")])
] });
settle(function(){
  assert(grid().indexOf('id="nw-401"') !== -1 && grid().indexOf("card followed") !== -1,
         "tagged followed-team story gets the followed card + anchor");
  assert(grid().indexOf("★ Your team") !== -1, "followed card carries the ★ tag");
  assert(grid().indexOf('id="nw-402"') !== -1 && grid().split("★ Your team").length === 2,
         "text-only Bears mention is NOT marked (exactly one ★ tag on the wire)");
  assert(grid().indexOf('id="nw-403"') !== -1 && grid().indexOf("Cowboys roll") !== -1,
         "unfollowed tagged story renders plain");
  assert(strip().hidden === false && strip().innerHTML.indexOf('href="#nw-401"') !== -1 &&
         strip().innerHTML.indexOf("<b>CHI</b>") !== -1, "strip opens with a chip to the followed story");

  /* search filter narrows the view: the strip must follow it honestly */
  type("cowboys");
  assert(grid().indexOf('id="nw-403"') !== -1 && grid().indexOf("nw-401") === -1, "search filters the wire");
  assert(strip().hidden === true && strip().innerHTML === "", "strip hides when the filter hides every followed story");
  type("jets");
  assert(strip().hidden === false && strip().innerHTML.indexOf('href="#nw-401"') !== -1,
         "strip returns when the filter shows the followed story again");
  getEl("newsSearch")._fire("keydown", { key: "Escape" });
  assert(strip().hidden === false, "Escape restore brings the strip back with the full wire");

  /* unfollow (storage emptied, as the odds board would write it): the
     next render — here a search keystroke — drops every mark */
  store["giu-followed-teams"] = JSON.stringify([]);
  type("x"); type("");
  assert(strip().hidden === true && grid().indexOf("followed") === -1 && grid().indexOf("★ Your team") === -1,
         "unfollow round-trip: strip hidden, no marks on re-render");

  /* corrupt storage recovers to no follows, wire renders clean */
  store["giu-followed-teams"] = "{not json";
  type("y"); type("");
  assert(grid().indexOf("Jets rule out") !== -1 && grid().indexOf("★ Your team") === -1,
         "corrupt follow storage: wire renders, nothing marked");

  /* follows back on, then a tab-switch feed error clears the strip */
  store["giu-followed-teams"] = JSON.stringify(["CHI"]);
  type("z"); type("");
  assert(strip().hidden === false, "strip live again before the error check");
  t1._fire("click");
  deferreds[deferreds.length - 1].reject(new Error("down"));
  settle(function(){
    assert(grid().indexOf("didn't respond") !== -1, "feed error renders the fail box");
    assert(strip().hidden === true && strip().innerHTML === "", "feed error clears the strip — no stale chips over the fail box");

    /* ---------- shipped pins ---------- */
    var html = fs.readFileSync(path.join(ROOT, "news.html"), "utf8");
    assert(html.indexOf('id="newsFollow"') !== -1, "news.html ships #newsFollow strip");
    assert(html.indexOf('js/team-follow.js?v=1.142.0') !== -1, "news.html loads team-follow.js (content unchanged since v1.142.0)");
    assert(html.indexOf('js/news.js?v=1.157.0') !== -1, "news.html pins news.js?v=1.157.0");
    assert(html.indexOf(".follow-strip") !== -1 && html.indexOf(".card.followed") !== -1 &&
           html.indexOf(".tag.your-team") !== -1, "news.html carries the page-scoped follow styles");

    if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
    console.log("ALL NEWS-FOLLOW TESTS PASS");
  });
});
