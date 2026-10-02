/* GridIronUI v1.154.0 — followed teams on the weather page.
   Verifies js/weather.js's pure follow contract (GIU.wxFollowed /
   GIU.wxFollowHTML: ESPN-abbr namespace, normalization, first-followed
   wins, garbage-in -> [], escaped chips) and the shipped DOM wiring
   with the REAL team-follow.js + seeded localStorage: followed NFL and
   MLB postseason games get the gold rail + "★ Your team" tag, one
   combined "Your teams" strip chips to both sections' card anchors,
   dome games count (weather N/A is the answer), and no/corrupt
   follows leave the page exactly as before. weather.html pins too.
   Run: node tests/test-weather-follow.js */
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

  assert(typeof G.wxFollowed === "function", "wxFollowed exported");
  assert(typeof G.wxFollowHTML === "function", "wxFollowHTML exported");

  var games = [
    { anchor: "wxg-1", away: "GB", home: "CHI", venue: "Soldier Field" },
    { anchor: "wxg-2", away: "KC", home: "BUF", venue: "Highmark Stadium" },
    { anchor: "wxb-1", away: "STL", home: "CHC", venue: "Wrigley Field" },
    { anchor: "wxg-3", away: "DAL", home: "DET", venue: "Ford Field" }
  ];
  var m = G.wxFollowed(games, ["CHI", "CHC"]);
  eq(m.length, 2, "one match per followed game across both slates");
  eq(m[0].anchor, "wxg-1", "NFL match keeps its card anchor");
  eq(m[0].abbr, "CHI", "match stamps the followed abbreviation (home side)");
  eq(m[0].venue, "Soldier Field", "match carries the venue for the chip");
  eq(m[1].anchor, "wxb-1", "MLB match keeps its card anchor");
  eq(G.wxFollowed(games, ["gb"])[0].abbr, "GB", "lowercase follow entries normalized (away side)");
  eq(G.wxFollowed(games, ["DET", "DAL"])[0].abbr, "DET", "both sides followed: earlier follow-list entry wins");
  eq(G.wxFollowed(games, ["DET"])[0].anchor, "wxg-3", "dome game matches — weather N/A is still the answer");
  eq(G.wxFollowed(games, []).length, 0, "no follows -> no matches");
  eq(G.wxFollowed(games, ["SEA"]).length, 0, "followed team not on either slate -> no matches");
  eq(G.wxFollowed(null, ["CHI"]).length, 0, "garbage-in: null games -> []");
  eq(G.wxFollowed(games, null).length, 0, "garbage-in: null follows -> []");
  eq(G.wxFollowed("junk", ["CHI"]).length, 0, "garbage-in: non-array games -> []");
  eq(G.wxFollowed([null, {}, { anchor: "a" }, { anchor: "b", away: "CHI" }], ["CHI"]).length, 1,
    "malformed game records skipped, the real one still matches");
  eq(G.wxFollowed(games, ["CHI", 42, "", "toolongname", "CHI"]).length, 1,
    "non-string / implausible / duplicate follow entries dropped");

  var html = G.wxFollowHTML(m);
  assert(html.indexOf("Your teams") !== -1, "strip HTML carries the 'Your teams' label");
  assert(html.indexOf('href="#wxg-1"') !== -1 && html.indexOf("GB @ CHI") !== -1 &&
         html.indexOf("Soldier Field") !== -1, "NFL chip links to the card anchor with matchup + venue");
  assert(html.indexOf('href="#wxb-1"') !== -1 && html.indexOf("STL @ CHC") !== -1,
    "MLB chip links to its own section's anchor");
  var hostile = G.wxFollowHTML(G.wxFollowed(
    [{ anchor: 'x" onmouseover="1', away: "<b>A</b>", home: "CHI", venue: "<img src=x>" }], ["CHI"]));
  assert(hostile.indexOf("<img src=x") === -1 && hostile.indexOf("&lt;img") !== -1 &&
         hostile.indexOf('onmouseover="1"') === -1 && hostile.indexOf("<b>A</b>") === -1,
    "hostile anchor/matchup/venue escaped in chip HTML");
})();

/* ---------- DOM wiring (real team-follow.js + seeded storage) ------- */
function ev(id, away, home, iso){
  return { id: id, date: iso,
    competitions: [{ status: { type: { state: "pre" } }, venue: { fullName: "" },
      competitors: [
        { homeAway: "away", team: { abbreviation: away, displayName: away+" Team", shortDisplayName: away } },
        { homeAway: "home", team: { abbreviation: home, displayName: home+" Team", shortDisplayName: home } } ] }] };
}
function hourly(wind, gust, precip, temp){
  var t = [], n = 96, base = Date.parse("2026-10-03T00:00Z");
  var arr = function(v){ var a = []; for(var i = 0; i < n; i++) a.push(v); return a; };
  for(var i = 0; i < n; i++) t.push(new Date(base + i * 3600e3).toISOString().slice(0, 13) + ":00");
  return { hourly: { time: t, temperature_2m: arr(temp), precipitation_probability: arr(precip),
    wind_speed_10m: arr(wind), wind_gusts_10m: arr(gust), wind_direction_10m: arr(320) } };
}
var NFL_BOARD = { week: { number: 5 }, season: { type: 2 }, events: [
  ev("e1", "GB", "CHI", "2026-10-04T17:00:00Z"),   /* open, windy, followed (CHI) */
  ev("e2", "KC", "BUF", "2026-10-04T20:25:00Z"),   /* open, calm */
  ev("e3", "DAL", "DET", "2026-10-05T00:20:00Z")   /* dome */
]};
var MLB_BOARD = { events: [ ev("m1", "STL", "CHC", "2026-10-03T18:00:00Z") ] }; /* Wrigley, followed (CHC) */

function boot(storageSeed){
  var WX = require(path.join(ROOT, "js/wx-shared.js"));
  var fetchJSON = function(url){
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
      var body = { innerHTML: "",
        getAttribute: function(k){ return k === "data-bp" ? home : null; } };
      var ds, venueRow;
      if(league === "nfl"){
        venueRow = WX.stadiumFor(home);
        ds = { sname: venueRow[1], scity: venueRow[2], slat: String(venueRow[3]),
               slon: String(venueRow[4]), sroof: venueRow[5], away: away, home: home };
      } else ds = {};
      return { dataset: ds,
        getAttribute: function(k){
          if(k === "data-kick") return e.date;
          if(k === "data-game") return e.id;
          return null;
        },
        querySelector: function(sel){ return sel === ".wx-body" ? body : null; },
        _body: body };
    }
    return {
      get innerHTML(){ return html; },
      set innerHTML(v){ html = v; cards = events.map(function(e){ return fakeCard(e); }); },
      parentNode: { insertBefore: function(){} },
      querySelectorAll: function(){ return cards; }
    };
  }
  var followBox = { hidden: true, innerHTML: "" };
  var watchBox = { hidden: true, innerHTML: "" };
  var mlbWatchBox = { hidden: true, innerHTML: "" };
  var mlbWrap = { hidden: true, innerHTML: "" };
  var nflGrid = fakeGrid(NFL_BOARD.events, "nfl");
  var mlbGrid = fakeGrid(MLB_BOARD.events, "mlb");
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
  return { followBox: followBox, watchBox: watchBox, mlbWrap: mlbWrap,
           nflHTML: function(){ return nflGrid.innerHTML; },
           mlbHTML: function(){ return mlbGrid.innerHTML; } };
}
async function settle(){ for(var i = 0; i < 30; i++) await new Promise(function(r){ setImmediate(r); }); }

(async function(){
  /* follows on both slates: CHI (NFL home) + CHC (MLB home) */
  var b1 = boot({ "giu-followed-teams": '["CHI","CHC"]' });
  await settle();
  assert(b1.followBox.hidden === false, "strip shown when followed teams are on the slates");
  assert(b1.followBox.innerHTML.indexOf("Your teams") !== -1, "strip carries the 'Your teams' label");
  assert(b1.followBox.innerHTML.indexOf('href="#wxg-e1"') !== -1 &&
         b1.followBox.innerHTML.indexOf("GB @ CHI") !== -1 &&
         b1.followBox.innerHTML.indexOf("Soldier Field") !== -1,
    "NFL chip anchors to the followed card with matchup + venue");
  assert(b1.followBox.innerHTML.indexOf('href="#wxb-m1"') !== -1 &&
         b1.followBox.innerHTML.indexOf("STL @ CHC") !== -1 &&
         b1.followBox.innerHTML.indexOf("Wrigley Field") !== -1,
    "MLB chip anchors to the postseason card with matchup + ballpark");
  assert(b1.followBox.innerHTML.indexOf("KC @ BUF") === -1 &&
         b1.followBox.innerHTML.indexOf("DAL @ DET") === -1,
    "unfollowed games stay out of the strip");
  assert(b1.nflHTML().indexOf('class="card followed" id="wxg-e1"') !== -1,
    "followed NFL card gets the followed class + its anchor id");
  assert(b1.mlbHTML().indexOf('class="card followed" id="wxb-m1"') !== -1,
    "followed MLB card gets the followed class + its anchor id");
  eq((b1.nflHTML().match(/★ Your team/g) || []).length, 1, "exactly one NFL card is tagged");
  eq((b1.mlbHTML().match(/★ Your team/g) || []).length, 1, "exactly one MLB card is tagged");
  assert(b1.watchBox.innerHTML.indexOf("GB @ CHI") !== -1,
    "weather watch strip still renders alongside the follow strip");

  /* no follows stored: the page is exactly the old page */
  var b2 = boot({});
  await settle();
  assert(b2.followBox.hidden === true && b2.followBox.innerHTML === "",
    "no follows -> strip hidden and empty");
  assert(b2.nflHTML().indexOf("followed") === -1 && b2.mlbHTML().indexOf("followed") === -1 &&
         b2.nflHTML().indexOf("Your team") === -1,
    "no follows -> no followed marks anywhere");

  /* corrupt storage: team-follow recovers to [], page renders clean */
  var b3 = boot({ "giu-followed-teams": "{corrupt" });
  await settle();
  assert(b3.nflHTML().indexOf('id="wxg-e1"') !== -1, "corrupt follow storage still renders the NFL grid");
  assert(b3.followBox.hidden === true, "corrupt follow storage -> no strip");

  /* shipped pins */
  var html = fs.readFileSync(path.join(ROOT, "weather.html"), "utf8");
  assert(html.indexOf('id="wxFollow"') !== -1, "weather.html ships the wxFollow strip container");
  assert(html.indexOf("js/team-follow.js?v=1.142.0") !== -1, "weather.html loads team-follow.js (content unchanged since v1.142.0)");
  assert(html.indexOf('src="js/weather.js?v=1.165.0"') !== -1, "weather.html pins weather.js at v1.165.0");
  assert(html.indexOf(".follow-chip-link") !== -1 && html.indexOf(".card.followed") !== -1 &&
         html.indexOf(".tag-yourteam") !== -1, "weather.html carries the page-scoped followed styles");
  var src = fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8");
  assert(src.indexOf("renderFollowStrip") !== -1 && src.indexOf("wxFollowed") !== -1,
    "weather.js ships the strip renderer + pure matcher");

  console.log(failures ? ("\n" + failures + " FAILURES") : "\nALL WEATHER-FOLLOW TESTS PASS");
  process.exit(failures ? 1 : 0);
})().catch(function(e){
  console.error("ERROR", e && e.stack || e);
  process.exit(1);
});
