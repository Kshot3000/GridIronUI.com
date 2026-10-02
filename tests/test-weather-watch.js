/* GridIronUI v1.151.0 — Weather watch strip on the weather page.
   Verifies js/weather.js's pure watch contract (GIU.wxWatchEntries /
   GIU.wxWatchHTML: flagged-only, red-first, garbage-in -> [], escaped chips)
   and the shipped DOM wiring: with stubbed ESPN + Open-Meteo feeds, a windy
   open-air game lands in #wxWatch with a chip pointing at its card anchor,
   while a calm open-air game and a dome game stay out; weather.html carries
   both strip containers and the v1.151.0 cache key.
   Run: node tests/test-weather-watch.js */
"use strict";
process.env.TZ = "UTC";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function esc(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- pure contract (never-resolving fetch: page bootstrap idles) --- */
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

  assert(typeof G.wxWatchEntries === "function", "wxWatchEntries exported");
  assert(typeof G.wxWatchHTML === "function", "wxWatchHTML exported");

  assert(G.wxWatchEntries(null).length === 0, "garbage-in: null -> []");
  assert(G.wxWatchEntries("x").length === 0, "garbage-in: string -> []");
  assert(G.wxWatchEntries([null, {}, {id: "a"}, {id: "a", label: "A @ B"}]).length === 0,
    "garbage-in: entries without notes dropped");
  assert(G.wxWatchEntries([{id: "a", label: "A @ B", notes: []}]).length === 0,
    "empty notes -> not flagged (calm game stays out)");
  assert(G.wxWatchEntries([{id: "a", label: "A @ B", notes: [null, {text: ""}, {cls: "tag"}]}]).length === 0,
    "notes without text dropped");

  var mild = {id: "wxg-2", label: "KC @ BUF", notes: [{cls: "tag", text: "Wind 14 mph — mild Under lean"}]};
  var wild = {id: "wxg-1", label: "GB @ CHI", notes: [
    {cls: "tag red", text: "Gusts 33 mph — strong Under lean, kicking nightmare"},
    {cls: "tag", text: "Rain 70% — favors run game"}]};
  var out = G.wxWatchEntries([mild, wild]);
  assert(out.length === 2 && out[0].id === "wxg-1" && out[1].id === "wxg-2",
    "red-flagged game sorts ahead of a mild one regardless of kickoff order");
  assert(out[0].red === true && out[1].red === false, "red flag derived from note class");

  var html = G.wxWatchHTML(out);
  assert(html.indexOf('href="#wxg-1"') !== -1 && html.indexOf("GB @ CHI") !== -1,
    "chip links to the card anchor with the matchup label");
  assert(html.indexOf("Gusts 33 mph") !== -1 && html.indexOf("+1 more") !== -1,
    "chip shows the top note plus a +N more hint");
  assert(html.indexOf("Weather watch") !== -1, "strip carries its label");

  var hostile = G.wxWatchHTML(G.wxWatchEntries([
    {id: 'x" onmouseover="1', label: "<img src=x>", notes: [{cls: "tag", text: "<b>wind</b>"}]}]));
  assert(hostile.indexOf("<img src=x") === -1 && hostile.indexOf("&lt;img") !== -1 &&
         hostile.indexOf('onmouseover="1"') === -1 && hostile.indexOf("<b>wind</b>") === -1,
    "hostile label/note/id escaped in chip HTML");
})();

/* ---------- DOM wiring with stubbed feeds ---------- */
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

function runDom(){
  var BOARD = { week: { number: 5 }, season: { type: 2 }, events: [
    ev("e1", "GB", "CHI", "2026-10-04T17:00:00Z"),   /* open, windy */
    ev("e2", "KC", "BUF", "2026-10-04T20:25:00Z"),   /* open, calm */
    ev("e3", "DAL", "DET", "2026-10-05T00:20:00Z")   /* dome */
  ]};
  var WX = require(path.join(ROOT, "js/wx-shared.js"));
  var fetchJSON = function(url){
    if(url.indexOf("baseball/mlb") !== -1) return Promise.resolve({ events: [] });
    if(url.indexOf("football/nfl/scoreboard") !== -1) return Promise.resolve(BOARD);
    if(url.indexOf("api.open-meteo.com") !== -1){
      if(url.indexOf("latitude=41.8623") !== -1) return Promise.resolve(hourly(22, 33, 10, 55)); /* Soldier Field */
      return Promise.resolve(hourly(6, 9, 5, 66)); /* calm everywhere else */
    }
    return Promise.reject(new Error("unexpected fetch " + url));
  };

  var watchBox = { hidden: true, innerHTML: "" };
  var gridHTML = "";
  var cards = [];
  function fakeCard(e){
    var away = e.competitions[0].competitors[0].team.abbreviation;
    var home = e.competitions[0].competitors[1].team.abbreviation;
    var st = WX.stadiumFor(home);
    var body = { innerHTML: "" };
    return {
      dataset: { sname: st[1], scity: st[2], slat: String(st[3]), slon: String(st[4]),
                 sroof: st[5], away: away, home: home },
      getAttribute: function(k){
        if(k === "data-kick") return e.date;
        if(k === "data-game") return e.id;
        return null;
      },
      querySelector: function(sel){ return sel === ".wx-body" ? body : null; },
      _body: body
    };
  }
  var box = {
    get innerHTML(){ return gridHTML; },
    set innerHTML(v){ gridHTML = v; cards = BOARD.events.map(fakeCard); },
    parentNode: { insertBefore: function(){} },
    querySelectorAll: function(){ return cards; }
  };
  var documentStub = {
    getElementById: function(id){
      if(id === "wxGrid") return box;
      if(id === "wxWatch") return watchBox;
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
  var sandbox = { document: documentStub, GIU: GIU, console: console, Promise: Promise };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8"), sandbox);

  return (async function(){
    for(var i = 0; i < 30; i++) await new Promise(function(r){ setImmediate(r); });
    assert(gridHTML.indexOf('id="wxg-e1"') !== -1 && gridHTML.indexOf('data-away="GB"') !== -1,
      "NFL cards carry the watch anchor id + abbr data");
    assert(watchBox.hidden === false, "watch strip revealed when a game is flagged");
    assert(watchBox.innerHTML.indexOf('href="#wxg-e1"') !== -1 &&
           watchBox.innerHTML.indexOf("GB @ CHI") !== -1,
      "windy GB @ CHI game chipped in the strip");
    assert(/Gusts 33 mph|Wind 22 mph/.test(watchBox.innerHTML),
      "chip carries the computed impact note, not invented copy");
    assert(watchBox.innerHTML.indexOf("KC @ BUF") === -1, "calm game stays out of the strip");
    assert(watchBox.innerHTML.indexOf("DAL @ DET") === -1, "dome game stays out of the strip");
    assert(cards[0]._body.innerHTML.indexOf("strong Under lean") !== -1,
      "flagged card body still renders its full window + impact tags");
  })();
}

/* ---------- shipped wiring pins ---------- */
(function pins(){
  var html = fs.readFileSync(path.join(ROOT, "weather.html"), "utf8");
  assert(html.indexOf('id="wxWatch"') !== -1, "weather.html carries the NFL watch container");
  assert(html.indexOf('id="mlbWxWatch"') !== -1, "weather.html carries the MLB watch container");
  assert(html.indexOf('src="js/weather.js?v=1.151.0"') !== -1, "weather.html pins weather.js at v1.151.0");
  var js = fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8");
  assert(js.indexOf('renderWatch("wxWatch"') !== -1 && js.indexOf('renderWatch("mlbWxWatch"') !== -1,
    "both bootstraps render their watch strip");
  assert(js.indexOf("wxImpactNotes(hrs)") !== -1 && js.indexOf("wxImpactNotesBsb(hrs)") !== -1,
    "watch entries derive from the real impact models (NFL + MLB)");
})();

runDom().then(function(){
  console.log(failures ? ("\n" + failures + " FAILURES") : "\nALL WEATHER-WATCH TESTS PASS");
  process.exit(failures ? 1 : 0);
}).catch(function(e){
  console.error("ERROR", e && e.stack || e);
  process.exit(1);
});
