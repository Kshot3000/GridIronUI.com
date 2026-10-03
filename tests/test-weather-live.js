/* GridIronUI v2.0.7 — live auto-refresh on the weather page.
   The weather page was the last live-data page that froze at load:
   every sibling (scores, news, injuries, markets, predictions, odds)
   silently re-pulls while open. Verifies the shipped js/weather.js
   contract in a vm sandbox with captured timers:
   - a 15-minute interval arms at boot and the live-status pill +
     pause button render the sibling contract (updated clock included);
   - a tick re-pulls BOTH slates and re-fetches forecasts (the
     forecast cache is cleared — a replayed cache would be theatre);
   - ticks skip while the tab is hidden;
   - the find-a-game query survives a tick (the refreshed board is
     re-filtered, not reset);
   - a failed silent NFL re-pull keeps the cards already on screen,
     and the next good tick lands the new slate;
   - pause clears the timer and flips the pill; resume refreshes
     immediately and re-arms;
   - the week-rollover fallback notice never stacks on re-pulls
     (replaced, not duplicated);
   - shipped weather.html pins (pill markup + weather.js v2.0.7).
   Run: node tests/test-weather-live.js */
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
function ev(id, away, home, awayName, homeName, iso, state){
  return { id: id, date: iso,
    competitions: [{ status: { type: { state: state || "pre" } }, venue: { fullName: "" },
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
function flush(){
  var p = Promise.resolve(), i;
  for(i = 0; i < 14; i++) p = p.then(function(){ return new Promise(function(r){ setImmediate(r); }); });
  return p;
}

function boot(opts){
  opts = opts || {};
  var WX = require(path.join(ROOT, "js/wx-shared.js"));
  var counts = { nfl: 0, nflNext: 0, mlb: 0, meteo: 0 };
  var nflBoard = opts.nflBoard, mlbBoard = opts.mlbBoard;
  var state = { failNfl: false, nflBoard: nflBoard };
  var fetchJSON = function(url){
    if(url.indexOf("baseball/mlb") !== -1){ counts.mlb++; return Promise.resolve(mlbBoard); }
    if(url.indexOf("football/nfl/scoreboard") !== -1){
      if(url.indexOf("week=") !== -1){ counts.nflNext++; return Promise.resolve(opts.nflNextBoard); }
      counts.nfl++;
      if(state.failNfl) return Promise.reject(new Error("espn down"));
      return Promise.resolve(state.nflBoard);
    }
    if(url.indexOf("api.open-meteo.com") !== -1){ counts.meteo++; return Promise.resolve(hourly(22, 33, 10, 55)); }
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
        ds = venueRow ? { sname: venueRow[1], scity: venueRow[2], slat: String(venueRow[3]),
               slon: String(venueRow[4]), sroof: venueRow[5], away: away, home: home } : {};
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
    var parent = { children: [], insertCalls: 0,
      insertBefore: function(node){ node.parentNode = parent; parent.children.push(node); parent.insertCalls++; },
      removeChild: function(node){ node.parentNode = null;
        parent.children = parent.children.filter(function(c){ return c !== node; }); } };
    return {
      get innerHTML(){ return html; },
      set innerHTML(v){ html = v; cards = events.map(function(e){ return fakeCard(e); }); },
      parentNode: parent,
      querySelectorAll: function(){ return cards; },
      _cards: function(){ return cards; }, _parent: parent
    };
  }
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
      querySelectorAll: function(){ return chips; }
    };
  }
  var followBox = chipBox(), watchBox = chipBox(), mlbWatchBox = chipBox();
  var mlbWrap = { hidden: true, innerHTML: "", style: {} };
  var nflGrid = fakeGrid(state.nflBoard.events || [], "nfl");
  var mlbGrid = fakeGrid(mlbBoard.events || [], "mlb");
  var qInput = { value: "", _l: {},
    addEventListener: function(k, f){ this._l[k] = f; }, focus: function(){ this._focused = true; } };
  var clearBtn = { hidden: true, _l: {}, addEventListener: function(k, f){ this._l[k] = f; } };
  var countEl = { textContent: "" };
  var emptyEl = { hidden: true, textContent: "" };
  var liveEl = { className: "", innerHTML: "", textContent: "" };
  var pauseBtn = { style: {}, innerHTML: "", _attrs: {}, _l: {},
    setAttribute: function(k, v){ this._attrs[k] = v; },
    addEventListener: function(k, f){ this._l[k] = f; } };
  var timers = [];
  var documentStub = {
    hidden: false,
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
      if(id === "liveStatus") return liveEl;
      if(id === "pauseBtn") return pauseBtn;
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
    setInterval: function(cb, ms){ var t = { cb: cb, ms: ms, cleared: false }; timers.push(t); return t; },
    clearInterval: function(t){ if(t) t.cleared = true; },
    localStorage: { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-follow.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8"), sandbox);
  return { counts: counts, state: state, timers: timers, documentStub: documentStub,
    nflGrid: nflGrid, mlbGrid: mlbGrid, mlbWrap: mlbWrap, qInput: qInput,
    countEl: countEl, liveEl: liveEl, pauseBtn: pauseBtn,
    tick: function(){ timers.forEach(function(t){ if(!t.cleared) t.cb(); }); } };
}

var NFL_BOARD = { week: { number: 5 }, season: { type: 2 }, events: [
  ev("e1", "GB", "CHI", "Green Bay Packers", "Chicago Bears", "2026-10-04T17:00:00Z"),
  ev("e2", "KC", "BUF", "Kansas City Chiefs", "Buffalo Bills", "2026-10-04T20:25:00Z"),
  ev("e3", "DAL", "DET", "Dallas Cowboys", "Detroit Lions", "2026-10-05T00:20:00Z")
]};
var MLB_BOARD = { events: [ ev("m1", "STL", "CHC", "St. Louis Cardinals", "Chicago Cubs", "2026-10-03T18:00:00Z") ] };

(async function main(){
  /* ---------- main scenario: cadence, re-pull, search, failure, pause --- */
  var b = boot({ nflBoard: NFL_BOARD, mlbBoard: MLB_BOARD });
  await flush();
  assert(b.counts.nfl === 1 && b.counts.mlb === 1, "boot pulls both slates once");
  assert(b.timers.length === 1 && !b.timers[0].cleared, "one live timer armed at boot");
  assert(b.timers[0].ms === 15 * 60 * 1000, "timer cadence is 15 minutes (got " + b.timers[0].ms + ")");
  assert(b.liveEl.innerHTML.indexOf("auto-refresh every 15 min") !== -1, "pill names the cadence");
  assert(b.liveEl.innerHTML.indexOf("updated") !== -1, "pill carries the updated clock after first load");
  assert(b.pauseBtn.style.display === "" && b.pauseBtn._attrs["aria-pressed"] === "false", "pause button offered, not pressed");
  var meteoBoot = b.counts.meteo;
  assert(meteoBoot > 0, "boot fetched real forecasts (" + meteoBoot + ")");

  /* search first, then tick: the query must survive the re-pull */
  b.qInput.value = "bears"; b.qInput._l.input();
  assert(b.countEl.textContent === "1 of 4 games", "search narrows to 1 of 4 before the tick (got '" + b.countEl.textContent + "')");
  b.tick(); await flush();
  assert(b.counts.nfl === 2 && b.counts.mlb === 2, "tick re-pulls both slates");
  assert(b.counts.meteo > meteoBoot, "tick re-fetches forecasts — the cache was cleared, not replayed");
  var cards = b.nflGrid._cards();
  assert(cards[0].style.display === "" && cards[1].style.display === "none" && cards[2].style.display === "none",
    "find-a-game filter survives the silent refresh");
  assert(b.countEl.textContent === "1 of 4 games", "honest count survives the refresh");

  /* hidden tab: ticks skip */
  var nflBefore = b.counts.nfl;
  b.documentStub.hidden = true; b.tick(); await flush();
  assert(b.counts.nfl === nflBefore, "hidden-tab tick burns no fetches");
  b.documentStub.hidden = false;

  /* silent failure keeps the board; the next good tick lands a new slate */
  var htmlBefore = b.nflGrid.innerHTML;
  b.state.failNfl = true; b.tick(); await flush();
  assert(b.nflGrid.innerHTML === htmlBefore, "failed silent re-pull keeps the cards on screen");
  b.state.failNfl = false;
  b.state.nflBoard = { week: { number: 5 }, season: { type: 2 }, events: [
    ev("e9", "MIA", "NYJ", "Miami Dolphins", "New York Jets", "2026-10-04T17:00:00Z") ] };
  b.qInput.value = ""; b.qInput._l.input();
  b.tick(); await flush();
  assert(b.nflGrid.innerHTML.indexOf("wxg-e9") !== -1, "next good tick lands the new slate");

  /* pause / resume */
  b.pauseBtn._l.click();
  assert(b.timers[0].cleared, "pause clears the live timer");
  assert(b.liveEl.textContent === "auto-refresh paused", "pill reports paused");
  assert(b.pauseBtn._attrs["aria-pressed"] === "true", "pause button pressed state flips");
  var nflAtPause = b.counts.nfl;
  b.pauseBtn._l.click();
  await flush();
  assert(b.counts.nfl === nflAtPause + 1, "resume refreshes immediately, no tick needed");
  assert(b.timers.length === 2 && !b.timers[1].cleared, "resume re-arms the timer");
  assert(b.liveEl.innerHTML.indexOf("auto-refresh every 15 min") !== -1, "pill back to live after resume");

  /* ---------- fallback scenario: the rollover notice never stacks ------ */
  var post = { week: { number: 5 }, season: { type: 2 }, events: [
    ev("p1", "GB", "CHI", "Green Bay Packers", "Chicago Bears", "2026-09-28T17:00:00Z", "post") ] };
  var next = { week: { number: 6 }, season: { type: 2 }, events: [
    ev("n1", "GB", "CHI", "Green Bay Packers", "Chicago Bears", "2026-10-11T17:00:00Z") ] };
  var f = boot({ nflBoard: post, nflNextBoard: next, mlbBoard: { events: [] } });
  await flush();
  assert(f.nflGrid._parent.children.length === 1, "fallback notice inserted once at boot");
  f.tick(); await flush();
  assert(f.counts.nflNext === 2, "fallback slate re-pulled on the tick");
  assert(f.nflGrid._parent.children.length === 1, "fallback notice replaced on re-pull — never stacked");
  assert(f.nflGrid._parent.insertCalls === 2, "notice was re-inserted (fresh week label), not left stale");

  /* ---------- shipped pins --------------------------------------------- */
  var html = fs.readFileSync(path.join(ROOT, "weather.html"), "utf8");
  assert(html.indexOf('id="liveStatus"') !== -1 && html.indexOf('id="pauseBtn"') !== -1,
    "weather.html ships the live-status pill + pause button");
  assert(html.indexOf('src="js/weather.js?v=2.0.7"') !== -1, "weather.html pins weather.js at v2.0.7");
  var src = fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8");
  assert(src.indexOf("LIVE_MS = 15*60*1000") !== -1 && src.indexOf("function refreshWx") !== -1,
    "weather.js ships the 15-minute silent re-pull");

  console.log(failures ? ("FAILURES: " + failures) : "all weather-live checks passed");
  process.exit(failures ? 1 : 0);
})().catch(function(e){ console.error("ERROR:", e && e.stack || e); process.exit(1); });
