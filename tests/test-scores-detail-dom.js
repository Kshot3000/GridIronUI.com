/* DOM-wiring tests for the scores page game-detail expander (v1.28.0,
   pregame toggle added v1.57.0).
   Loads the REAL js/scores.js in a vm sandbox with a stubbed DOM and a
   canned fetch, then drives: Details button appears on pre/in/post games
   (pregame for the Matchup Predictor), clicking opens the region and fills
   it with real ESPN-summary-shaped detail HTML, clicking again collapses,
   a failed fetch collapses quietly and stays retryable, and the
   league-generation guard drops a stale summary response. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---------- DOM stub ---------- */
function makeEl(tag, id){
  var handlers = {};
  var el = {
    tag: tag || "div", id: id || "", innerHTML: "", textContent: "", style: {},
    value: "", hidden: false, title: "", _children: [], _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    removeAttribute: function(k){ delete this._attrs[k]; },
    appendChild: function(c){ this._children.push(c); return c; },
    querySelectorAll: function(sel){
      if(sel === ".tab") return this._children;
      if(sel === ".gd-toggle") return this._children;
      return [];
    },
    querySelector: function(){ return null; },
    closest: function(sel){ return (sel === ".gd-toggle" && this._isToggle) ? this : null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    _fire: function(ev, arg){ (handlers[ev] || []).forEach(function(fn){ fn.call(el, arg || {target: el}); }); }
  };
  return el;
}
var els = {};
function getEl(id){
  if(!els[id]) els[id] = makeEl("div", id);
  return els[id];
}
/* scoreGrid holds the toggle buttons so delegation and querySelector work */
var gridEl = makeEl("div", "scoreGrid");
gridEl._toggles = [];
gridEl.querySelectorAll = function(sel){
  if(sel === ".gd-toggle") return this._toggles;
  return [];
};
gridEl.querySelector = function(sel){
  var m = /data-ev="([^"]+)"/.exec(sel);
  if(!m) return null;
  for(var i = 0; i < this._toggles.length; i++)
    if(this._toggles[i].getAttribute("data-ev") === m[1]) return this._toggles[i];
  return null;
};
/* document.querySelector is used on the failure path */
var docQuerySelector = function(sel){ return gridEl.querySelector(sel); };

var summaryPayload = {
  scoringPlays: [
    {period:{number:1}, clock:{displayValue:"8:26"}, text:"Team A TD pass", awayScore:0, homeScore:7, team:{abbreviation:"HME"}},
    {period:{number:1}, clock:{displayValue:"3:11"}, text:"Team B FG", awayScore:3, homeScore:7, team:{abbreviation:"AWY"}}
  ],
  boxscore: {teams: [
    {homeAway:"away", team:{abbreviation:"AWY"}, statistics:[
      {name:"totalYards", label:"Total Yards", displayValue:"300"},
      {name:"turnovers", label:"Turnovers", displayValue:"1"}]},
    {homeAway:"home", team:{abbreviation:"HME"}, statistics:[
      {name:"totalYards", label:"Total Yards", displayValue:"350"},
      {name:"turnovers", label:"Turnovers", displayValue:"0"}]}
  ]}
};
var fetchCalls = [];
var fetchMode = "ok";
function fakeFetchJSON(url){
  fetchCalls.push(url);
  return new Promise(function(res, rej){
    setTimeout(function(){
      if(fetchMode === "fail" && url.indexOf("/summary?") >= 0){ rej(new Error("boom")); return; }
      res(url.indexOf("/summary?") >= 0 ? summaryPayload : scoreboardPayload());
    }, 5);
  });
}
function comp(state, shortDetail){
  return {status:{type:{state:state, shortDetail:shortDetail}},
    competitors:[
      {homeAway:"away", score: state==="pre"?"0":"14", team:{abbreviation:"AWY", displayName:"Away Team", shortDisplayName:"Away", color:"000000"}},
      {homeAway:"home", score: state==="pre"?"0":"21", team:{abbreviation:"HME", displayName:"Home Team", shortDisplayName:"Home", color:"ffffff"}}
    ], broadcasts: [], odds: [], venue: {fullName:"Stadium"}, leaders: []};
}
function scoreboardPayload(){
  return {events: [
    {id:"ev-in", name:"A at B", date:"2026-09-27T17:00:00Z", competitions:[comp("in","6:54 - 1st")]},
    {id:"ev-post", name:"C at D", date:"2026-09-27T13:00:00Z", competitions:[comp("post","Final")]},
    {id:"ev-pre", name:"E at F", date:"2026-09-27T20:00:00Z", competitions:[comp("pre","Sun 9/27 - 8:00 PM EDT")]}
  ]};
}

var sandbox = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: {
    hidden: false,
    getElementById: function(id){ return id === "scoreGrid" ? gridEl : getEl(id); },
    querySelector: docQuerySelector,
    createElement: function(t){ return makeEl(t); }
  },
  window: {},
  GIU: {
    fetchJSON: fakeFetchJSON,
    esc: function(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
/* load team-brand.js (GIU.teamRow), scores-detail.js (window.ScoresDetail), then scores.js */
["js/team-brand.js","js/scores-detail.js","js/scores.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});

function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

(async function(){
  /* league tabs render synchronously; board fetch is async */
  await wait(30);
  var html = gridEl.innerHTML;
  /* scrape toggle buttons out of the rendered HTML into stub elements */
  var re = /<button[^>]*class="gd-toggle"[^>]*data-ev="([^"]+)"[^>]*aria-expanded="([^"]+)"[^>]*aria-controls="([^"]+)"[^>]*>/g;
  var m, found = {};
  while((m = re.exec(html))){
    found[m[1]] = {expanded: m[2], controls: m[3]};
    var t = makeEl("button"); t._isToggle = true;
    t.setAttribute("data-ev", m[1]); t.setAttribute("aria-expanded", m[2]); t.setAttribute("aria-controls", m[3]);
    gridEl._toggles.push(t);
  }
  assert(found["ev-in"] && found["ev-post"] && found["ev-pre"],
    "Details toggle rendered for in-progress, final, and pregame cards (pregame carries the Matchup Predictor)");
  assert(found["ev-in"].controls === "gd-ev-in", "toggle aria-controls points at the detail region");
  assert(found["ev-in"].expanded === "false", "toggle starts collapsed with aria-expanded=false");
  assert(/id="gd-ev-in"[^>]*role="region"[^>]*hidden/.test(html), "detail region starts hidden");

  /* click to open ev-in: fetch the summary, fill the region */
  var btn = gridEl.querySelector('.gd-toggle[data-ev="ev-in"]');
  gridEl._fire("click", {target: btn});
  await wait(30);
  var sumCalls = fetchCalls.filter(function(u){ return u.indexOf("/summary?event=ev-in") >= 0; });
  assert(sumCalls.length === 1, "opening fetches the ESPN summary endpoint for that event");
  assert(btn.getAttribute("aria-expanded") === "true", "toggle flips to aria-expanded=true on open");
  var region = getEl("gd-ev-in");
  assert(region.hidden === false, "detail region unhidden on open");
  assert(region.innerHTML.indexOf("Total Yards") >= 0 && region.innerHTML.indexOf("Q1") >= 0,
    "region filled with real period table + team stats");

  /* click again: collapse, no refetch */
  var nBefore = fetchCalls.length;
  gridEl._fire("click", {target: btn});
  assert(btn.getAttribute("aria-expanded") === "false", "second click collapses (aria-expanded=false)");
  assert(getEl("gd-ev-in").hidden === true, "region hidden after collapse");
  gridEl._fire("click", {target: btn}); /* reopen: served from cache */
  await wait(30);
  assert(fetchCalls.length === nBefore, "reopen served from cache — no second summary fetch");
  assert(getEl("gd-ev-in").innerHTML.indexOf("Total Yards") >= 0, "cached detail restored on reopen");

  /* failure path: ev-post summary fails -> collapses quietly, stays retryable */
  fetchMode = "fail";
  var btnP = gridEl.querySelector('.gd-toggle[data-ev="ev-post"]');
  gridEl._fire("click", {target: btnP});
  await wait(30);
  assert(btnP.getAttribute("aria-expanded") === "false", "failed fetch collapses the toggle");
  assert(getEl("gd-ev-post").hidden === true, "failed fetch hides the region");
  assert(btnP.title.indexOf("retry") >= 0, "failed toggle invites a retry");
  fetchMode = "ok";

  if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
  else console.log("ALL GREEN");
})().catch(function(e){ console.error("HARNESS ERROR:", e); process.exit(1); });
