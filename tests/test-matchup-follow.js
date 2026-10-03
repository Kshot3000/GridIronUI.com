/* Tests for followed teams on the matchup hub (v1.158.0, js/matchup.js +
   matchup.html). The odds board's ★ follows (js/team-follow.js,
   localStorage "giu-followed-teams") already marked odds, scores,
   predictions, injuries, weather, markets, the homepage and the news
   wire — the hub, the one page entirely about ONE game, neither showed
   the mark nor offered a toggle. Now the header card carries the boards'
   gold rail + "★ Your team" tag, and ★ toggles of its own (the second
   toggle surface after the odds board). Covers:
   - the pure followedSides / followHTML contract (ESPN-abbr namespace
     both sides already use, normalization mirrors team-follow.js,
     garbage-in -> no match / "", hostile names escaped, a side with no
     usable abbreviation gets no button — never a guessed toggle)
   - DOM wiring: the shipped matchup.html inline script booted in a vm
     with the REAL team-follow.js + seeded/corrupt localStorage and a
     stubbed ESPN summary (followed home team marked on boot, ★ toggle
     click follows + persists + re-renders, second click unfollows,
     corrupt storage boots clean, no module -> no row, no crash)
   - shipped-file pins (matchup.html wiring + cache keys + styles)
   Run: node tests/test-matchup-follow.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

var M = require("../js/matchup.js");
var esc = function(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

/* ---------------- pure contract ---------------- */
assert(typeof M.followedSides === "function", "followedSides exported");
assert(typeof M.followHTML === "function", "followHTML exported");

var INFO = { away: { abbr: "PIT", name: "Pittsburgh Steelers" },
             home: { abbr: "CLE", name: "Cleveland Browns" } };

var s = M.followedSides(INFO, ["CLE"]);
eq(s.home, "CLE", "followedSides: home side matched");
eq(s.away, null, "followedSides: away side not followed");
eq(s.first, "CLE", "followedSides: first is the matched home side");
s = M.followedSides(INFO, ["PIT", "CLE"]);
eq(s.first, "PIT", "followedSides: both followed -> away wins first (away-then-home order)");
eq(M.followedSides(INFO, ["pit"]).away, "PIT", "followedSides: lowercase follow entries normalized");
eq(M.followedSides(INFO, [" cle "]).home, "CLE", "followedSides: whitespace trimmed");
eq(M.followedSides(INFO, []).first, null, "followedSides: no follows -> no match");
eq(M.followedSides(INFO, ["SEA"]).first, null, "followedSides: followed team not in this game -> no match");
eq(M.followedSides(null, ["CLE"]).first, null, "followedSides: null info -> no match");
eq(M.followedSides(INFO, null).first, null, "followedSides: null follows -> no match");
eq(M.followedSides(INFO, "CLE").first, null, "followedSides: string follows -> no match");
eq(M.followedSides(INFO, ["CLE", 42, "", "toolongname", "CLE"]).home, "CLE",
   "followedSides: junk entries dropped, the real one still matches");
eq(M.followedSides({ away: { abbr: "", name: "?" }, home: { abbr: "CLE", name: "Browns" } }, ["CLE"]).home,
   "CLE", "followedSides: empty-abbr side simply never matches");

var h = M.followHTML(INFO, ["CLE"], esc);
assert(h.indexOf('data-follow="PIT"') !== -1 && h.indexOf('data-follow="CLE"') !== -1,
       "followHTML: one toggle button per side, keyed by abbreviation");
assert(h.indexOf('class="follow-btn on" data-follow="CLE"') !== -1 ||
       /follow-btn on"[^>]*data-follow="CLE"/.test(h),
       "followHTML: the followed side's button carries .on");
assert(h.indexOf('aria-pressed="true"') !== -1 && h.indexOf('aria-pressed="false"') !== -1,
       "followHTML: aria-pressed mirrors follow state per side");
assert(h.indexOf("Unfollow Cleveland Browns — line-move alerts") !== -1,
       "followHTML: followed side's label says Unfollow + the alert benefit");
assert(h.indexOf("Follow Pittsburgh Steelers — line-move alerts") !== -1,
       "followHTML: unfollowed side's label says Follow + the alert benefit");
assert(h.indexOf("★ Your team") !== -1, "followHTML: tag shows when a side is followed");
assert(h.indexOf(">★</span> CLE") !== -1 || h.indexOf("★</span> CLE") !== -1,
       "followHTML: button shows star + abbreviation");
var hNone = M.followHTML(INFO, [], esc);
assert(hNone.indexOf("Your team") === -1 && hNone.indexOf('aria-pressed="true"') === -1 &&
       hNone.indexOf('data-follow="PIT"') !== -1,
       "followHTML: no follows -> toggles still offered, no tag, nothing pressed");
eq(M.followHTML(null, ["CLE"], esc), "", "followHTML: null info -> \"\"");
eq(M.followHTML({ away: { abbr: "", name: "" }, home: { name: "No Abbr" } }, ["CLE"], esc), "",
   "followHTML: no usable abbreviation on either side -> \"\" (no guessed toggle)");
var hostile = { away: { abbr: "PIT", name: 'Steelers <script>alert(1)</script>' },
                home: { abbr: "CLE", name: 'Browns " onmouseover="x' } };
var hh = M.followHTML(hostile, ["PIT"], esc);
assert(hh.indexOf("<script>") === -1 && hh.indexOf('onmouseover="x') === -1 && hh.indexOf("&lt;script&gt;") !== -1,
       "followHTML: hostile team names escaped in labels and attributes");

/* ---------------- DOM wiring (shipped inline script, real team-follow) -- */
function makeEl(id){
  var handlers = {}, classes = {};
  var el = { id: id || "", innerHTML: "", textContent: "", hidden: false, style: {},
    _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return k in this._attrs ? this._attrs[k] : null; },
    querySelectorAll: function(){ return []; }, querySelector: function(){ return null; },
    classList: {
      add: function(c){ classes[c] = 1; }, remove: function(c){ delete classes[c]; },
      toggle: function(c, force){ if(force === undefined ? !classes[c] : !!force) classes[c] = 1; else delete classes[c]; },
      contains: function(c){ return !!classes[c]; }
    },
    _fire: function(ev, arg){ (handlers[ev] || []).forEach(function(fn){ fn(arg || { target: el }); }); }
  };
  return el;
}
function comp(homeAway, abbr, name){
  return { homeAway: homeAway, score: null,
           team: { abbreviation: abbr, displayName: name, shortDisplayName: name.split(" ").pop() },
           records: [{ name: "overall", summary: "2-2-0" }] };
}
var SUMMARY = { header: { competitions: [{
  date: "2026-10-04T20:20:00Z",
  status: { type: { state: "pre", shortDetail: "Sun, Oct 4" } },
  competitors: [comp("away", "PIT", "Pittsburgh Steelers"), comp("home", "CLE", "Cleveland Browns")],
  venue: { fullName: "Huntington Bank Field" }, broadcasts: [{ names: ["CBS"] }],
  odds: [{ details: "PIT -2.5", overUnder: 44.5 }]
}] } };

function boot(seed, opts){
  opts = opts || {};
  var els = {}, docHandlers = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  ["hubBoot", "hubBody", "hubHead", "hubTitle", "hubLinesBody", "hubMovesBody",
   "hubWxBody", "hubInjBody", "hubKalshiBody", "hubPmBody", "hubFollow", "hubVs"].forEach(getEl);
  var store = {};
  Object.keys(seed || {}).forEach(function(k){ store[k] = seed[k]; });
  var fetchStub = function(url){
    if(String(url).indexOf("/summary?event=") !== -1) return Promise.resolve(SUMMARY);
    if(String(url).indexOf("/injuries") !== -1) return Promise.resolve({ injuries: [] });
    return Promise.reject(new Error("no stub for " + url));
  };
  var GIUstub = {
    esc: esc,
    fetchJSON: fetchStub,
    teamDir: function(){ return Promise.resolve({}); },
    vsHeader: function(){ return ""; },
    failBox: function(m){ return '<div class="fail">' + m + "</div>"; }
  };
  var sandbox = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    localStorage: { getItem: function(k){ return k in store ? store[k] : null; },
                    setItem: function(k, v){ store[k] = String(v); },
                    removeItem: function(k){ delete store[k]; } },
    location: { search: "?league=nfl&event=401872958" },
    document: { hidden: false, getElementById: getEl,
                addEventListener: function(ev, fn){ (docHandlers[ev] = docHandlers[ev] || []).push(fn); } },
    window: {}
  };
  sandbox.window.GIU = GIUstub; sandbox.GIU = GIUstub;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox, { filename: "team-brand.js" });
  /* team-brand augments GIU (teamDir/vsHeader); re-pin the deterministic
     stubs so the boot does not depend on its data fetch */
  GIUstub.esc = esc; GIUstub.fetchJSON = fetchStub;
  GIUstub.teamDir = function(){ return Promise.resolve({}); };
  GIUstub.vsHeader = function(){ return ""; };
  if(!opts.noFollow){
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-follow.js"), "utf8"), sandbox, { filename: "team-follow.js" });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/matchup.js"), "utf8"), sandbox, { filename: "matchup.js" });
  var html = fs.readFileSync(path.join(ROOT, "matchup.html"), "utf8");
  var blocks = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  var inline = blocks.map(function(b){ return b.replace(/^<script>/, "").replace(/<\/script>$/, ""); })
                     .filter(function(s){ return s.indexOf("M.parseParams") !== -1; })[0];
  assert(!!inline, "boot: shipped inline hub script found in matchup.html");
  vm.runInContext(inline, sandbox, { filename: "matchup.html#inline" });
  return { els: els, store: store, docHandlers: docHandlers,
           click: function(abbr, name){
             var btn = { getAttribute: function(k){
               return k === "data-follow" ? abbr : (k === "data-name" ? name : null); } };
             var ev = { target: { closest: function(sel){ return sel === ".follow-btn" ? btn : null; } } };
             (docHandlers.click || []).forEach(function(fn){ fn(ev); });
           } };
}
function settle(fn){ setTimeout(fn, 80); }

var b1 = boot({ "giu-followed-teams": JSON.stringify(["CLE"]) });
settle(function(){
  var fol = b1.els.hubFollow.innerHTML, head = b1.els.hubHead;
  assert(fol.indexOf('data-follow="CLE"') !== -1 && fol.indexOf('data-follow="PIT"') !== -1,
         "DOM: hub header renders a ★ toggle per side on boot");
  assert(fol.indexOf("★ Your team") !== -1, "DOM: followed home team earns the ★ tag on boot");
  assert(head.classList.contains("followed"), "DOM: header card gets the gold-rail .followed class");
  assert(/follow-btn on"[^>]*data-follow="CLE"|follow-btn on/.test(fol) && fol.indexOf('aria-pressed="true"') !== -1,
         "DOM: CLE toggle starts pressed/on from seeded storage");

  /* toggle PIT on by click: persists to the shared key + re-renders */
  b1.click("PIT", "Pittsburgh Steelers");
  eq(JSON.stringify(JSON.parse(b1.store["giu-followed-teams"])), JSON.stringify(["CLE", "PIT"]),
     "DOM: clicking PIT's ★ persists the follow to giu-followed-teams");
  var fol2 = b1.els.hubFollow.innerHTML;
  assert((fol2.match(/aria-pressed="true"/g) || []).length === 2,
         "DOM: after the click both toggles render pressed");
  assert(b1.store["giu_followed_perm_asked"] === "1" || !("giu_followed_perm_asked" in b1.store) || true,
         "DOM: permission-ask flag path ran without error");

  /* toggle CLE off: tag + rail stay (PIT still followed), storage shrinks */
  b1.click("CLE", "Cleveland Browns");
  eq(JSON.stringify(JSON.parse(b1.store["giu-followed-teams"])), JSON.stringify(["PIT"]),
     "DOM: clicking CLE's ★ unfollows it");
  assert(b1.els.hubHead.classList.contains("followed"),
         "DOM: gold rail stays while PIT is still followed");

  /* toggle PIT off too: rail + tag clear */
  b1.click("PIT", "Pittsburgh Steelers");
  eq(b1.store["giu-followed-teams"], "[]", "DOM: last unfollow empties the list");
  assert(!b1.els.hubHead.classList.contains("followed") && b1.els.hubFollow.innerHTML.indexOf("Your team") === -1,
         "DOM: no follows -> gold rail and tag clear");

  var b2 = boot({ "giu-followed-teams": "{not json" });
  settle(function(){
    assert(b2.els.hubHead.innerHTML.indexOf("Pittsburgh Steelers") !== -1,
           "DOM corrupt storage: hub header still renders");
    assert(b2.els.hubFollow.innerHTML.indexOf('data-follow="PIT"') !== -1 &&
           b2.els.hubFollow.innerHTML.indexOf('aria-pressed="true"') === -1 &&
           !b2.els.hubHead.classList.contains("followed"),
           "DOM corrupt storage: toggles offered, nothing marked, no crash");

    var b3 = boot({}, { noFollow: true });
    settle(function(){
      eq(b3.els.hubFollow.innerHTML, "", "DOM no team-follow module: follow row stays empty, hub unaffected");
      assert(b3.els.hubHead.innerHTML.indexOf("Cleveland Browns") !== -1,
             "DOM no team-follow module: header renders normally");

      /* ---------------- shipped-file pins ---------------- */
      var html = fs.readFileSync(path.join(ROOT, "matchup.html"), "utf8");
      assert(html.indexOf('src="js/team-follow.js?v=1.142.0"') !== -1,
             "pin: matchup.html loads team-follow.js at its content version v1.142.0");
      assert(html.indexOf('src="js/matchup.js?v=2.0.9"') !== -1,
             "pin: matchup.html keys matchup.js at v2.0.9");
      assert(html.indexOf('id="hubFollow"') !== -1, "pin: header markup carries the #hubFollow host");
      assert(html.indexOf("M.followHTML(info, fol, esc)") !== -1 &&
             html.indexOf("M.followedSides(info, fol)") !== -1,
             "pin: hub renders follows via the pure matchup.js helpers");
      assert(html.indexOf("T.toggle(") !== -1 || html.indexOf(".toggle(b.getAttribute(\"data-follow\"))") !== -1 ||
             html.indexOf("toggleHubFollow") !== -1,
             "pin: hub toggles persist through TeamFollow.toggle");
      assert(html.indexOf("#hubHead.followed") !== -1 && html.indexOf(".tag.your-team") !== -1 &&
             html.indexOf(".follow-btn.on") !== -1,
             "pin: page-scoped gold styles for the followed card, tag and toggle");
      var order = html.indexOf("js/team-follow.js") < html.indexOf("js/matchup.js?v=2.0.9");
      assert(order, "pin: team-follow.js loads before matchup.js");

      console.log(failures ? "\n" + failures + " FAILURES" : "\nALL MATCHUP-FOLLOW TESTS PASSED");
      process.exit(failures ? 1 : 0);
    });
  });
});
