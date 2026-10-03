/* GridIronUI v1.165.0 — find a game on the weather page.
   Verifies js/weather.js's pure finder contract (GIU.wxSearchTerms /
   GIU.wxGameText / GIU.wxGameSearch: AND-term matching over both teams'
   names + abbreviations + venue + city, blank query -> match, garbage-in
   -> no match, never throws) and the shipped DOM wiring across BOTH
   slates with the real team-follow.js + seeded follows: one query
   filters the NFL grid and the MLB postseason section together, the
   "Your teams" + Weather watch strips track the filtered board, a
   fully filtered-out MLB section steps aside, the honest count and
   named empty state narrate only while searching, Escape/Clear
   restore everything, and typing never re-fetches. weather.html pins.
   Run: node tests/test-weather-search.js */
"use strict";
process.env.TZ = "UTC";
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

/* ---------- pure contract (never-resolving fetch: bootstraps idle) --- */
(function pure(){
  var sandbox = { window: {}, GIU: {
    esc: esc,
    fetchJSON: function(){ var p = { then: function(){ return p; }, catch: function(){ return p; } }; return p; }
  } };
  sandbox.window.GIU = sandbox.GIU;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8"), sandbox);
  var G = sandbox.GIU;

  assert(typeof G.wxSearchTerms === "function", "wxSearchTerms exported");
  assert(typeof G.wxGameText === "function", "wxGameText exported");
  assert(typeof G.wxGameSearch === "function", "wxGameSearch exported");

  var g = { awayName: "Green Bay Packers", homeName: "Chicago Bears",
            awayAbbr: "GB", homeAbbr: "CHI", venue: "Soldier Field", city: "Chicago" };
  var text = G.wxGameText(g);
  assert(text.indexOf("green bay packers") !== -1 && text.indexOf("chicago bears") !== -1,
    "search text carries both teams' full names");
  assert(text.indexOf(" gb ") !== -1 || text.indexOf("gb") !== -1, "search text carries abbreviations");
  assert(text.indexOf("soldier field") !== -1, "search text carries the venue");
  eq(G.wxGameText(null), "", "garbage-in: null game -> empty text");
  eq(G.wxGameText("junk"), "", "garbage-in: non-object game -> empty text");
  eq(G.wxGameText({}), "", "empty record -> empty text");
  eq(G.wxGameText({ awayName: 42, venue: null }), "42", "non-string fields coerced, nulls skipped");

  eq(G.wxGameSearch(g, ""), true, "blank query matches everything");
  eq(G.wxGameSearch(g, "   "), true, "whitespace query matches everything");
  eq(G.wxGameSearch(null, ""), true, "blank query matches even a garbage record");
  eq(G.wxGameSearch(g, "bears"), true, "team name finds the game");
  eq(G.wxGameSearch(g, "CHI"), true, "abbreviation finds the game (case-insensitive)");
  eq(G.wxGameSearch(g, "chi soldier"), true, "terms narrow across fields (abbr + venue)");
  eq(G.wxGameSearch(g, "packers chicago"), true, "terms narrow across sides");
  eq(G.wxGameSearch(g, "bears zzzz"), false, "a term that appears nowhere matches nothing");
  eq(G.wxGameSearch(g, "cowboys"), false, "another team matches nothing");
  eq(G.wxGameSearch(null, "bears"), false, "garbage record + real query -> no match, no throw");
  eq(G.wxGameSearch(g, null), true, "null query behaves as blank");
})();

/* ---------- DOM wiring (real team-follow.js + seeded storage) ------- */
function ev(id, away, home, awayName, homeName, iso){
  return { id: id, date: iso,
    competitions: [{ status: { type: { state: "pre" } }, venue: { fullName: "" },
      competitors: [
        { homeAway: "away", team: { abbreviation: away, displayName: awayName, shortDisplayName: away } },
        { homeAway: "home", team: { abbreviation: home, displayName: homeName, shortDisplayName: home } } ] }] };
}
function hourly(wind, gust, precip, temp){
  var t = [], n = 96, base = Date.parse("2026-10-03T00:00Z");
  var arr = function(v){ var a = []; for(var i = 0; i < n; i++) a.push(v); return a; };
  for(var i = 0; i < n; i++) t.push(new Date(base + i * 3600e3).toISOString().slice(0, 13) + ":00");
  return { hourly: { time: t, temperature_2m: arr(temp), precipitation_probability: arr(precip),
    wind_speed_10m: arr(wind), wind_gusts_10m: arr(gust), wind_direction_10m: arr(320) } };
}
var NFL_BOARD = { week: { number: 5 }, season: { type: 2 }, events: [
  ev("e1", "GB", "CHI", "Green Bay Packers", "Chicago Bears", "2026-10-04T17:00:00Z"),   /* open, windy, followed */
  ev("e2", "KC", "BUF", "Kansas City Chiefs", "Buffalo Bills", "2026-10-04T20:25:00Z"),  /* open, calm */
  ev("e3", "DAL", "DET", "Dallas Cowboys", "Detroit Lions", "2026-10-05T00:20:00Z")      /* dome */
]};
var MLB_BOARD = { events: [ ev("m1", "STL", "CHC", "St. Louis Cardinals", "Chicago Cubs", "2026-10-03T18:00:00Z") ] };

function chipBox(){
  var html = "", chips = [];
  return {
    hidden: true,
    get innerHTML(){ return html; },
    set innerHTML(v){
      html = v; chips = [];
      var re = /href="#([^"]+)"/g, m;
      while((m = re.exec(v))) (function(href){
        chips.push({ style: {}, getAttribute: function(k){ return k === "href" ? href : null; } });
      })("#" + m[1]);
    },
    querySelectorAll: function(){ return chips; },
    _chips: function(){ return chips; }
  };
}
function boot(storageSeed){
  var WX = require(path.join(ROOT, "js/wx-shared.js"));
  var fetchCalls = 0;
  var fetchJSON = function(url){
    fetchCalls++;
    if(url.indexOf("baseball/mlb") !== -1) return Promise.resolve(MLB_BOARD);
    if(url.indexOf("football/nfl/scoreboard") !== -1) return Promise.resolve(NFL_BOARD);
    if(url.indexOf("api.open-meteo.com") !== -1){
      if(url.indexOf("latitude=41.8623") !== -1) return Promise.resolve(hourly(22, 33, 10, 55)); /* Soldier Field */
      return Promise.resolve(hourly(6, 9, 5, 66)); /* calm everywhere else */
    }
    return Promise.reject(new Error("unexpected fetch " + url));
  };
  function fakeGrid(events, league){
    var html = "", cards = [];
    function fakeCard(e){
      var away = e.competitions[0].competitors[0].team.abbreviation;
      var home = e.competitions[0].competitors[1].team.abbreviation;
      var anchor = (league === "nfl" ? "wxg-" : "wxb-") + e.id;
      var body = { innerHTML: "",
        getAttribute: function(k){ return k === "data-bp" ? home : null; } };
      var ds, venueRow;
      if(league === "nfl"){
        venueRow = WX.stadiumFor(home);
        ds = { sname: venueRow[1], scity: venueRow[2], slat: String(venueRow[3]),
               slon: String(venueRow[4]), sroof: venueRow[5], away: away, home: home };
      } else ds = {};
      var fm = html.match(new RegExp('id="' + anchor + '" data-find="([^"]*)"'));
      var findText = fm ? fm[1] : "";
      return { id: anchor, dataset: ds, style: {},
        getAttribute: function(k){
          if(k === "data-kick") return e.date;
          if(k === "data-game") return e.id;
          if(k === "data-find") return findText;
          return null;
        },
        querySelector: function(sel){ return sel === ".wx-body" ? body : null; },
        _body: body };
    }
    return {
      get innerHTML(){ return html; },
      set innerHTML(v){ html = v; cards = events.map(function(e){ return fakeCard(e); }); },
      parentNode: { insertBefore: function(){} },
      querySelectorAll: function(){ return cards; },
      _cards: function(){ return cards; }
    };
  }
  var followBox = chipBox(), watchBox = chipBox(), mlbWatchBox = chipBox();
  var mlbWrap = { hidden: true, innerHTML: "", style: {} };
  var nflGrid = fakeGrid(NFL_BOARD.events, "nfl");
  var mlbGrid = fakeGrid(MLB_BOARD.events, "mlb");
  var qInput = { value: "", _l: {},
    addEventListener: function(k, f){ this._l[k] = f; }, focus: function(){ this._focused = true; } };
  var clearBtn = { hidden: true, _l: {},
    addEventListener: function(k, f){ this._l[k] = f; } };
  var countEl = { textContent: "" };
  var emptyEl = { hidden: true, textContent: "" };
  var store = {};
  Object.keys(storageSeed || {}).forEach(function(k){ store[k] = storageSeed[k]; });
  var documentStub = {
    getElementById: function(id){
      if(id === "wxGrid") return nflGrid;
      if(id === "mlbWxGrid") return mlbGrid;
      if(id === "mlbWxWrap") return mlbWrap;
      if(id === "wxWatch") return watchBox;
      if(id === "mlbWxWatch") return mlbWatchBox;
      if(id === "wxFollow") return followBox;
      if(id === "wxQ") return qInput;
      if(id === "wxClear") return clearBtn;
      if(id === "wxCount") return countEl;
      if(id === "wxFindEmpty") return emptyEl;
      return null;
    },
    createElement: function(){
      var html = "";
      return { get innerHTML(){ return html; }, set innerHTML(v){ html = v; },
               get firstChild(){ return { _html: html }; } };
    }
  };
  var GIU = { esc: esc, fetchJSON: fetchJSON,
    failBox: function(msg){ return '<div class="fail">' + esc(msg) + "</div>"; } };
  var sandbox = { document: documentStub, GIU: GIU, console: console, Promise: Promise,
    localStorage: { getItem: function(k){ return k in store ? store[k] : null; },
                    setItem: function(k, v){ store[k] = String(v); },
                    removeItem: function(k){ delete store[k]; } } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-follow.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8"), sandbox);
  function type(q){
    qInput.value = q;
    qInput._l.input();
  }
  return { followBox: followBox, watchBox: watchBox, mlbWrap: mlbWrap,
           nflCards: function(){ return nflGrid._cards(); },
           mlbCards: function(){ return mlbGrid._cards(); },
           q: qInput, clearBtn: clearBtn, countEl: countEl, emptyEl: emptyEl,
           type: type,
           fetches: function(){ return fetchCalls; } };
}
async function settle(){ for(var i = 0; i < 30; i++) await new Promise(function(r){ setImmediate(r); }); }
function disp(card){ return card.style.display || ""; }

(async function(){
  var b = boot({ "giu-followed-teams": '["CHI","CHC"]' });
  await settle();

  /* boot: both slates on screen, finder idle */
  eq(b.nflCards().length, 3, "boot renders the 3-game NFL slate");
  eq(b.mlbCards().length, 1, "boot renders the MLB postseason game");
  assert(b.nflCards()[0].getAttribute("data-find").indexOf("chicago bears") !== -1 &&
         b.nflCards()[0].getAttribute("data-find").indexOf("soldier field") !== -1,
    "NFL cards are stamped with name + venue search text");
  assert(b.mlbCards()[0].getAttribute("data-find").indexOf("chicago cubs") !== -1 &&
         b.mlbCards()[0].getAttribute("data-find").indexOf("wrigley field") !== -1,
    "MLB cards are stamped with name + ballpark search text");
  assert(b.nflCards().every(function(c){ return disp(c) === ""; }) &&
         b.mlbCards().every(function(c){ return disp(c) === ""; }),
    "no query -> every card visible");
  eq(b.countEl.textContent, "", "no query -> count silent");
  assert(b.clearBtn.hidden === true, "no query -> Clear hidden");
  assert(b.emptyEl.hidden === true, "no query -> empty state hidden");
  assert(b.followBox.hidden === false, "follow strip shown at boot (CHI + CHC on the slates)");
  var bootFetches = b.fetches();
  assert(bootFetches > 0, "boot fetched its feeds (" + bootFetches + " calls)");

  /* "bears": isolates the Soldier Field game across BOTH slates */
  b.type("bears");
  eq(disp(b.nflCards()[0]), "", "'bears' keeps GB @ CHI visible");
  eq(disp(b.nflCards()[1]), "none", "'bears' hides KC @ BUF");
  eq(disp(b.nflCards()[2]), "none", "'bears' hides DAL @ DET");
  eq(disp(b.mlbCards()[0]), "none", "'bears' hides the Cubs game too — one finder, both slates");
  eq(b.mlbWrap.style.display, "none", "fully filtered-out MLB section steps aside");
  eq(b.countEl.textContent, "1 of 4 games", "honest count across both slates");
  assert(b.clearBtn.hidden === false, "Clear appears while searching");
  var fchips = b.followBox._chips();
  eq(fchips.length, 2, "follow strip still holds both chips in the DOM");
  eq(fchips[0].style.display || "", "", "follow chip for the visible game stays");
  eq(fchips[1].style.display || "", "none", "follow chip for a hidden game hides with it");
  assert(b.followBox.hidden === false, "follow strip stays while one of its games is visible");
  var wchips = b.watchBox._chips();
  assert(wchips.length === 1 && (wchips[0].style.display || "") === "",
    "weather-watch chip for the windy visible game stays");

  /* cross-field AND: abbr + venue */
  b.type("chi soldier");
  eq(disp(b.nflCards()[0]), "", "'chi soldier' narrows across abbr + venue to the same game");
  eq(b.countEl.textContent, "1 of 4 games", "cross-field count stays honest");

  /* "cubs": the MLB game alone; the section comes back */
  b.type("cubs");
  eq(disp(b.mlbCards()[0]), "", "'cubs' keeps the MLB game visible");
  eq(b.mlbWrap.style.display, "", "MLB section returns when its game matches");
  assert(b.nflCards().every(function(c){ return disp(c) === "none"; }), "'cubs' hides the whole NFL slate");
  eq(b.countEl.textContent, "1 of 4 games", "count still spans both slates");
  eq(b.followBox._chips()[1].style.display || "", "", "Cubs follow chip visible again");

  /* nonsense: named empty state, strips step aside, nothing blank-mystery */
  b.type("zzzz");
  assert(b.nflCards().every(function(c){ return disp(c) === "none"; }) &&
         b.mlbCards().every(function(c){ return disp(c) === "none"; }),
    "'zzzz' hides every card");
  assert(b.emptyEl.hidden === false, "nonsense query shows the empty state");
  assert(b.emptyEl.textContent.indexOf('No games match "zzzz"') !== -1 &&
         b.emptyEl.textContent.indexOf("all 4 games") !== -1,
    "empty state names the query and the full board size");
  eq(b.countEl.textContent, "No matches", "count narrates 'No matches'");
  assert(b.followBox.hidden === true, "follow strip steps aside when none of its games are visible");
  assert(b.watchBox.hidden === true, "watch strip steps aside when its game is hidden");
  eq(b.fetches(), bootFetches, "typing never re-fetches (forecast calls unchanged)");

  /* Escape restores the whole page */
  b.q._l.keydown({ key: "Escape" });
  eq(b.q.value, "", "Escape clears the input");
  assert(b.nflCards().every(function(c){ return disp(c) === ""; }) &&
         b.mlbCards().every(function(c){ return disp(c) === ""; }),
    "Escape restores every card");
  eq(b.mlbWrap.style.display, "", "Escape restores the MLB section");
  eq(b.countEl.textContent, "", "Escape silences the count");
  assert(b.emptyEl.hidden === true, "Escape hides the empty state");
  assert(b.followBox.hidden === false && b.watchBox.hidden === false,
    "Escape restores both strips");

  /* Clear button round-trip */
  b.type("bears");
  eq(disp(b.nflCards()[1]), "none", "search re-applies after the Escape round-trip");
  b.clearBtn._l.click();
  assert(b.nflCards().every(function(c){ return disp(c) === ""; }),
    "Clear button restores the full board");
  eq(b.fetches(), bootFetches, "no fetch across the whole search session");

  /* shipped pins */
  var html = fs.readFileSync(path.join(ROOT, "weather.html"), "utf8");
  assert(html.indexOf('id="wxQ"') !== -1 && html.indexOf('id="wxClear"') !== -1 &&
         html.indexOf('id="wxCount"') !== -1 && html.indexOf('id="wxFindEmpty"') !== -1,
    "weather.html ships the finder hooks (wxQ/wxClear/wxCount/wxFindEmpty)");
  assert(html.indexOf('src="js/weather.js?v=2.0.7"') !== -1, "weather.html pins weather.js at v2.0.7");
  assert(html.indexOf(".wx-find") !== -1 && html.indexOf(".wx-find-count") !== -1,
    "weather.html carries the page-scoped finder styles");
  var src = fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8");
  assert(src.indexOf("wxGameSearch") !== -1 && src.indexOf("data-find") !== -1 &&
         src.indexOf("applyWxSearch") !== -1,
    "weather.js ships the pure matcher + data-find stamping + DOM filter");

  console.log(failures ? ("\n" + failures + " FAILURES") : "\nALL WEATHER-SEARCH TESTS PASS");
  process.exit(failures ? 1 : 0);
})().catch(function(e){
  console.error("ERROR", e && e.stack || e);
  process.exit(1);
});
