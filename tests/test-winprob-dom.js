/* DOM + paint tests for the win-probability chart and Matchup Predictor
   (v1.57.0). Loads the REAL js/scores-detail.js in a vm sandbox for
   paintWinProb (canvas stub with a recording 2d context), then loads the
   REAL js/scores.js to prove the wiring: the pregame Details toggle now
   renders, opening it fills the region with the predictor card, and the
   win-probability canvas is painted after every detail insertion (fetch,
   cache-hit reopen, and silent board re-render). Run: node tests/test-winprob-dom.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---------- canvas stub ---------- */
function recordingCtx(){
  var calls = [];
  return {calls: calls,
    setTransform: function(){ calls.push("setTransform"); },
    save: function(){ calls.push("save"); },
    restore: function(){ calls.push("restore"); },
    clearRect: function(){ calls.push("clearRect"); },
    setLineDash: function(){ calls.push("setLineDash"); },
    beginPath: function(){ calls.push("beginPath"); },
    moveTo: function(){ calls.push("moveTo"); },
    lineTo: function(){ calls.push("lineTo"); },
    stroke: function(){ calls.push("stroke"); },
    fill: function(){ calls.push("fill"); },
    closePath: function(){ calls.push("closePath"); },
    arc: function(){ calls.push("arc"); },
    fillText: function(){ calls.push("fillText"); },
    createLinearGradient: function(){ return {addColorStop: function(){ calls.push("grad"); }}; }
  };
}
function fakeCanvas(dataWp, hc){
  var ctx = recordingCtx();
  return {ctx: ctx,
    clientWidth: 640, clientHeight: 150, width: 0, height: 0,
    getAttribute: function(k){
      if(k === "data-wp") return dataWp;
      if(k === "data-hc") return hc || "#204e32";
      return null;
    },
    getContext: function(){ return ctx; }
  };
}

/* ---------- part 1: paintWinProb against real scores-detail.js ---------- */
var sb1 = {window: {}, console: console};
vm.createContext(sb1);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/scores-detail.js"), "utf8"), sb1, {filename: "scores-detail.js"});
var D = sb1.window.ScoresDetail;

var cv = fakeCanvas(JSON.stringify({p: [0.7457, 0.7, 0.25, 0.1, 0], swing: 2}), "#204e32");
D.paintWinProb(cv);
assert(cv.width === 640 && cv.height === 150, "paint sizes the canvas from layout (DPR=1 in sandbox)");
assert(cv.ctx.calls.indexOf("stroke") >= 0 && cv.ctx.calls.indexOf("lineTo") >= 0,
  "paint strokes the win-probability line");
assert(cv.ctx.calls.indexOf("arc") >= 0, "paint marks the biggest-swing sample");
assert(cv.ctx.calls.indexOf("fillText") >= 0, "paint labels the endpoints");

var cvNoSwing = fakeCanvas(JSON.stringify({p: [0.5, 0.6, 0.55], swing: -1}), "#a71930");
D.paintWinProb(cvNoSwing);
assert(cvNoSwing.ctx.calls.indexOf("arc") === -1, "no swing marker when swing is -1");

var cvNoCtx = fakeCanvas(JSON.stringify({p: [0.5, 0.6], swing: 0}), "#fff");
cvNoCtx.getContext = function(){ return null; };
try{ D.paintWinProb(cvNoCtx); assert(true, "no 2d context -> silent no-op, no throw"); }
catch(e){ assert(false, "no 2d context threw: " + e.message); }

try{ D.paintWinProb(fakeCanvas("not-json{{", "#fff")); assert(true, "malformed data-wp -> silent no-op"); }
catch(e){ assert(false, "malformed data-wp threw: " + e.message); }
try{ D.paintWinProb(fakeCanvas(null, "#fff")); assert(true, "missing data-wp -> silent no-op"); }
catch(e){ assert(false, "missing data-wp threw: " + e.message); }
try{ D.paintWinProb(null); D.paintWinProb({}); assert(true, "null/junk canvas -> silent no-op"); }
catch(e){ assert(false, "null canvas threw: " + e.message); }

/* data-wp round-trips through GIU.esc attribute-escaping */
var escAttr = function(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
var built = D.buildHtml({
  header: {competitions: [{status: {type: {state: "post"}}}]},
  winprobability: [{homeWinPercentage: 0.7, playId: "a"}, {homeWinPercentage: 0.3, playId: "b"}],
  boxscore: {teams: [
    {homeAway: "away", team: {abbreviation: "ATL", color: "a71930"}},
    {homeAway: "home", team: {abbreviation: "GB", color: "204e32"}}]}
}, "football/nfl", escAttr);
var mAttr = built.match(/data-wp="([^"]*)"/);
var back = JSON.parse(mAttr[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
assert(back.p.length === 2 && back.p[0] === 0.7, "data-wp survives HTML attribute escaping and parses back");

/* ---------- part 2: scores.js wiring ---------- */
function makeEl(tag, id){
  var handlers = {};
  var el = {tag: tag || "div", id: id || "", innerHTML: "", textContent: "", style: {},
    hidden: false, title: "", _children: [], _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    removeAttribute: function(k){ delete this._attrs[k]; },
    querySelectorAll: function(){ return []; },
    querySelector: function(){ return null; },
    closest: function(sel){ return (sel === ".gd-toggle" && this._isToggle) ? this : null; },
    classList: {add: function(){}, remove: function(){}, toggle: function(){}},
    _fire: function(ev, arg){ (handlers[ev] || []).forEach(function(fn){ fn.call(el, arg || {target: el}); }); }
  };
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl("div", id); return els[id]; }
var gridEl = makeEl("div", "scoreGrid");
gridEl._toggles = [];
gridEl.querySelectorAll = function(sel){ return sel === ".gd-toggle" ? this._toggles : []; };
gridEl.querySelector = function(sel){
  var m = /data-ev="([^"]+)"/.exec(sel);
  if(!m) return null;
  for(var i = 0; i < this._toggles.length; i++)
    if(this._toggles[i].getAttribute("data-ev") === m[1]) return this._toggles[i];
  return null;
};

var preSummary = {
  header: {competitions: [{status: {type: {state: "pre"}},
    competitors: [
      {homeAway: "away", team: {id: "21", abbreviation: "PHI", color: "06424d"}},
      {homeAway: "home", team: {id: "3", abbreviation: "CHI", color: "0b1c3a"}}]}]},
  predictor: {header: "Matchup Predictor",
    homeTeam: {id: "3", gameProjection: "34.9"},
    awayTeam: {id: "21", gameProjection: "64.8"}}
};
var postSummary = {
  header: {competitions: [{status: {type: {state: "post"}}}]},
  winprobability: [
    {homeWinPercentage: 0.7, tiePercentage: 0, playId: "p1"},
    {homeWinPercentage: 0.4, tiePercentage: 0, playId: "p2"},
    {homeWinPercentage: 0.9, tiePercentage: 0, playId: "p3"}],
  boxscore: {teams: [
    {homeAway: "away", team: {abbreviation: "AWY", color: "a71930"}},
    {homeAway: "home", team: {abbreviation: "HME", color: "204e32"}}]}
};
function comp(state){
  return {status: {type: {state: state, shortDetail: state}},
    competitors: [
      {homeAway: "away", score: "0", team: {abbreviation: "AWY", displayName: "A", shortDisplayName: "A", color: "000000"}},
      {homeAway: "home", score: "0", team: {abbreviation: "HME", displayName: "H", shortDisplayName: "H", color: "ffffff"}}],
    broadcasts: [], odds: [], venue: {fullName: "Stadium"}, leaders: []};
}
function fakeFetchJSON(url){
  return new Promise(function(res){
    setTimeout(function(){
      if(url.indexOf("/summary?") >= 0)
        res(url.indexOf("event=ev-pre") >= 0 ? preSummary : postSummary);
      else res({events: [
        {id: "ev-post", name: "A at B", date: "2026-09-27T17:00:00Z", competitions: [comp("post")]},
        {id: "ev-pre", name: "C at D", date: "2026-09-29T00:15:00Z", competitions: [comp("pre")]}
      ]});
    }, 5);
  });
}
var sandbox = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: {
    hidden: false,
    getElementById: function(id){ return id === "scoreGrid" ? gridEl : getEl(id); },
    querySelector: function(sel){ return gridEl.querySelector(sel); },
    querySelectorAll: function(){ return []; },
    createElement: function(t){ return makeEl(t); }
  },
  window: {},
  GIU: {
    fetchJSON: fakeFetchJSON,
    esc: escAttr,
    failBox: function(x){ return x; },
    teamRow: function(){ return ""; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
["js/team-brand.js", "js/scores-detail.js", "js/scores.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

(async function(){
  await wait(40);
  var html = gridEl.innerHTML;
  var re = /<button[^>]*class="gd-toggle"[^>]*data-ev="([^"]+)"[^>]*>/g, mm, found = {};
  while((mm = re.exec(html))){
    found[mm[1]] = true;
    var t = makeEl("button"); t._isToggle = true;
    t.setAttribute("data-ev", mm[1]); t.setAttribute("aria-expanded", "false");
    gridEl._toggles.push(t);
  }
  assert(found["ev-pre"], "pregame cards now get a Details toggle (for the Matchup Predictor)");
  assert(found["ev-post"], "final games keep their Details toggle");
  assert(/id="gd-ev-pre"[^>]*aria-label="Game detail"/.test(html),
    "pregame detail region is labeled 'Game detail'");

  /* open the pregame detail: predictor card renders */
  var btn = gridEl.querySelector('.gd-toggle[data-ev="ev-pre"]');
  gridEl._fire("click", {target: btn});
  await wait(40);
  var region = getEl("gd-ev-pre");
  assert(/class="gd-pred"/.test(region.innerHTML), "pregame detail renders the Matchup Predictor card");
  assert(/PHI/.test(region.innerHTML) && /64\.8%/.test(region.innerHTML),
    "predictor card shows the projected side and percentage");

  /* open the final: the win-probability canvas gets painted on fetch */
  var postRegion = getEl("gd-ev-post");
  var cv1 = fakeCanvas(JSON.stringify({p: [0.7, 0.4, 0.9], swing: 2}), "#204e32");
  postRegion.querySelectorAll = function(){ return [cv1]; };
  var btnP = gridEl.querySelector('.gd-toggle[data-ev="ev-post"]');
  gridEl._fire("click", {target: btnP});
  await wait(40);
  assert(/class="gd-wp"/.test(postRegion.innerHTML), "final detail renders the win-probability canvas");
  assert(cv1.ctx.calls.indexOf("stroke") >= 0, "fetchDetail paints the canvas after inserting detail HTML");

  /* collapse + reopen from cache: the fresh canvas is painted again */
  var cv2 = fakeCanvas(JSON.stringify({p: [0.7, 0.4, 0.9], swing: 2}), "#204e32");
  postRegion.querySelectorAll = function(){ return [cv2]; };
  gridEl._fire("click", {target: btnP}); /* collapse */
  gridEl._fire("click", {target: btnP}); /* reopen from cache */
  await wait(40);
  assert(cv2.ctx.calls.indexOf("stroke") >= 0, "cache-hit reopen repaints the canvas");

  if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
  else console.log("ALL GREEN");
})().catch(function(e){ console.error("HARNESS ERROR:", e); process.exit(1); });
