/* Verifies the week-rollover wiring in the SHIPPED js/weather.js.
   Loads the real wx-shared.js + weather.js in a vm sandbox with stubbed
   DOM/fetch, then asserts:
   - when ESPN's default board is all-post (the Tuesday-morning window), the
     page fetches week=number+1 explicitly and renders those games;
   - an honest "Next week's slate — Week N" notice is inserted before #wxGrid;
   - when the default board already has pre games, no second fetch happens
     and no notice is inserted;
   - a failed primary fetch shows the feed-failure box.
   Run: node tests/test-wx-rollover-dom.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

function esc(s){
  return String(s == null ? "" : s).replace(/[<>&"]/g, function(c){
    return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c];
  });
}
function ev(id, state, homeAbbr, awayAbbr, iso){
  return { id: id, date: iso || "2026-10-01T17:00Z",
    competitions: [{ status: { type: { state: state } }, venue: { fullName: "" },
      competitors: [
        { homeAway: "home", team: { abbreviation: homeAbbr, displayName: homeAbbr, shortDisplayName: homeAbbr } },
        { homeAway: "away", team: { abbreviation: awayAbbr, displayName: awayAbbr, shortDisplayName: awayAbbr } } ] }] };
}
function board(states, weekNum){
  return { week: { number: weekNum }, season: { type: 2 },
    events: states.map(function(s, i){ return ev("e"+i, s[0], s[1], s[2]); }) };
}
function hourlyStub(){
  var t = [], n = 48, base = Date.parse("2026-10-01T00:00Z");
  var arr = function(v){ var a = []; for(var i = 0; i < n; i++) a.push(v); return a; };
  for(var i = 0; i < n; i++) t.push(new Date(base + i * 3600e3).toISOString().slice(0, 13) + ":00");
  return { hourly: { time: t, temperature_2m: arr(55), precipitation_probability: arr(10),
    wind_speed_10m: arr(8), wind_gusts_10m: arr(12), wind_direction_10m: arr(270) } };
}

function runScenario(name, fetchFn, checks){
  var inserted = [];      /* nodes inserted before #wxGrid */
  var boxHTML = "";       /* what weather.js wrote into #wxGrid */
  function fakeCard(e){
    var home = e.competitions[0].competitors[0].team.abbreviation;
    var body = { innerHTML: "" };
    return {
      dataset: { sname: "x", scity: "y", slat: "41.8", slon: "-87.6", sroof: "open", game: e.id },
      getAttribute: function(k){ return k === "data-kick" ? e.date : null; },
      querySelector: function(sel){ return sel === ".wx-body" ? body : null; },
      _body: body, _ev: e
    };
  }
  var cards = [];
  var box = {
    get innerHTML(){ return boxHTML; },
    set innerHTML(v){
      boxHTML = v;
      /* rebuild fake cards from the last board the fetch stub served */
      cards = (fetchFn._lastEvents || []).map(fakeCard);
    },
    parentNode: { insertBefore: function(node, ref){ inserted.push(node); } },
    querySelectorAll: function(){ return cards; }
  };
  function makeEl(){
    var html = "";
    var el = {
      get innerHTML(){ return html; },
      set innerHTML(v){ html = v; },
      get firstChild(){ return { _html: html }; }
    };
    return el;
  }
  var documentStub = {
    getElementById: function(id){ return id === "wxGrid" ? box : null; },
    createElement: function(){ return makeEl(); }
  };
  var GIU = {
    esc: esc,
    fetchJSON: fetchFn,
    failBox: function(msg){ return '<div class="fail">' + esc(msg) + '</div>'; },
    teamLogo: function(){ return ""; },
    teamChip: function(tm, abbr){ return "<span>" + esc(abbr) + "</span>"; }
  };
  var sandbox = { document: documentStub, GIU: GIU, console: console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox,
    { filename: "wx-shared.js" });
  /* wx-shared.js registers on window.GIU — merge into our GIU stub */
  Object.keys(sandbox.GIU).forEach(function(k){
    if(!(k in GIU)) GIU[k] = sandbox.GIU[k];
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/weather.js"), "utf8"), sandbox,
    { filename: "weather.js" });
  return new Promise(function(res){ setTimeout(res, 50); }).then(function(){
    checks({ inserted: inserted, boxHTML: boxHTML, cards: cards });
  });
}

var BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

function scenarioAllPost(){
  var calls = [];
  var primary = board([["post","CHI","GB"],["post","DAL","PHI"]], 3);
  var next = board([["pre","CHI","GB"],["pre","DAL","PHI"],["pre","BUF","NE"]], 4);
  function fetch(url){
    calls.push(url);
    if(url.indexOf("open-meteo") !== -1) return Promise.resolve(hourlyStub());
    if(url === BASE){ fetch._lastEvents = primary.events; return Promise.resolve(primary); }
    fetch._lastEvents = next.events; return Promise.resolve(next);
  }
  return runScenario("all-post", fetch, function(r){
    assert(calls.length >= 2, "all-post: fallback fetch issued (calls=" + calls.length + ")");
    assert(calls.indexOf(BASE + "?week=4&seasontype=2") !== -1,
      "all-post: fallback URL week=4&seasontype=2 was fetched (calls: " + calls.join(" | ") + ")");
    assert(calls.indexOf("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?seasontype=3") !== -1,
      "all-post: MLB postseason board fetched independently");
    assert(r.inserted.length === 1, "all-post: one notice inserted before #wxGrid");
    var html = r.inserted[0] && r.inserted[0]._html || "";
    assert(/Next week.s slate/.test(html) && /Week 4/.test(html),
      "all-post: notice names next week's slate + Week 4");
    assert(r.cards.length === 3, "all-post: 3 next-week game cards rendered (got " + r.cards.length + ")");
    var bodies = r.cards.filter(function(c){ return /wx-strip/.test(c._body.innerHTML); });
    assert(bodies.length === 3, "all-post: every card got its forecast strip");
  });
}

function scenarioHasPre(){
  var calls = [];
  var primary = board([["pre","CHI","GB"],["post","DAL","PHI"]], 4);
  function fetch(url){
    calls.push(url);
    if(url.indexOf("open-meteo") !== -1) return Promise.resolve(hourlyStub());
    fetch._lastEvents = primary.events.filter(function(e){
      return e.competitions[0].status.type.state !== "post";
    });
    return Promise.resolve(primary);
  }
  return runScenario("has-pre", fetch, function(r){
    assert(calls.filter(function(u){ return u.indexOf("football/nfl/scoreboard") !== -1; }).length === 1,
      "has-pre: no NFL fallback fetch when the board already has pre games");
    assert(calls.indexOf("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?seasontype=3") !== -1,
      "has-pre: MLB postseason board still fetched independently");
    assert(r.inserted.length === 0, "has-pre: no notice inserted");
    assert(r.cards.length === 1, "has-pre: only the pre game rendered (got " + r.cards.length + ")");
  });
}

function scenarioPrimaryDown(){
  function fetch(url){
    if(url.indexOf("open-meteo") !== -1) return Promise.resolve(hourlyStub());
    return Promise.reject(new Error("down"));
  }
  return runScenario("primary-down", fetch, function(r){
    assert(/didn't respond/.test(r.boxHTML), "primary-down: feed-failure box shown");
    assert(r.inserted.length === 0, "primary-down: no notice inserted");
  });
}

scenarioAllPost().then(scenarioHasPre).then(scenarioPrimaryDown).then(function(){
  console.log(failures ? failures + " FAILURES" : "ALL PASS");
  process.exit(failures ? 1 : 0);
}).catch(function(e){
  console.error("HARNESS ERROR", e); process.exit(1);
});
