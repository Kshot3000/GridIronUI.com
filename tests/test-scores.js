/* Verifies the full stat-leader line in the SHIPPED js/scores.js.
   Stubs the DOM, loads the real scores.js, feeds canned ESPN scoreboard-shaped
   data, and asserts that live games show every leader category with bettor
   labels, pre-games show no leaders line, and junk (MLB pre-game "0-0") is
   skipped while real post-game lines render as "Top performer". */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, ".."); /* test the repo this file is checked out in */

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

function makeEl(id){
  var handlers = {};
  return {
    id: id, innerHTML: "", textContent: "", style: {}, value: "",
    _children: [],
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(){},
    querySelectorAll: function(){ return this._children; },
    getAttribute: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {target: this}); }); }
  };
}
var els = {};
function getEl(id){
  if(!els[id]) els[id] = makeEl(id);
  return els[id];
}

function team(abbr, name, home, score){
  return { homeAway: home?"home":"away", score: score,
           team: { abbreviation: abbr, displayName: name } };
}
function leaderCat(name, dName, val){
  return { name: name, leaders: [{ athlete: { displayName: dName }, displayValue: val }] };
}
function game(id, state, shortDetail, leaders){
  return { id: id, name: "Away at Home",
    date: "2026-09-27T17:00:00Z",
    competitions: [{
      status: { type: { state: state, shortDetail: shortDetail } },
      competitors: [team("AWY","Away Team",false,"21"), team("HME","Home Team",true,"17")],
      broadcasts: [], odds: [], venue: { fullName: "Test Stadium" },
      leaders: leaders || []
    }] };
}
var payload = { events: [
  /* live NFL game: all three leader categories present */
  game("nfl1", "in", "6:54 - 1st", [
    leaderCat("passingYards", "Josh Allen", "2/3, 9 YDS"),
    leaderCat("rushingYards", "Omarion Hampton", "3 CAR, 13 YDS"),
    leaderCat("receivingYards", "DJ Moore", "1 REC, 8 YDS")
  ]),
  /* pre-game: no leaders at all */
  game("nfl2", "pre", "Sun 9/27 - 1:00 PM EDT", []),
  /* MLB in-progress before anyone has stats: junk "0-0" rating must be skipped */
  game("mlb1", "in", "Top 1st", [ leaderCat("MLBRating", "CJ Abrams", "0-0") ]),
  /* MLB final: real batting line shown as Top performer */
  game("mlb2", "post", "Final", [ leaderCat("MLBRating", "Ronny Mauricio", "2-4, 2 HR, 3 RBI, 2 R") ])
]};

var fetchStub = function(url){ return Promise.resolve(payload); };

var sandbox = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: { getElementById: getEl },
  window: {},
  GIU: {
    fetchJSON: fetchStub,
    esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

/* tab children before the script wires handlers */
for(var i=0;i<7;i++){
  var b = makeEl("tab-"+i);
  b.getAttribute = function(a){ return a==="data-i" ? "0" : null; };
  getEl("leagueTabs")._children.push(b);
}

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox, {filename: "js/team-brand.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/scores.js"), "utf8"), sandbox, {filename: "js/scores.js"});

setTimeout(function(){
  var html = getEl("scoreGrid").innerHTML;

  /* 1. live NFL game shows all three categories with bettor labels */
  assert(html.indexOf("<b>Pass</b>")!==-1, "passing leader labeled 'Pass'");
  assert(html.indexOf("<b>Rush</b>")!==-1, "rushing leader labeled 'Rush'");
  assert(html.indexOf("<b>Rec</b>")!==-1, "receiving leader labeled 'Rec'");
  assert(html.indexOf("Josh Allen")!==-1 && html.indexOf("Omarion Hampton")!==-1 &&
         html.indexOf("DJ Moore")!==-1, "all three NFL leader athletes shown");
  assert(html.indexOf("2/3, 9 YDS")!==-1, "leader stat line shown");
  assert(html.indexOf("passingYards")===-1 && html.indexOf("rushingYards")===-1,
         "raw ESPN category keys never rendered");

  /* 2. pre-game card has no leaders row */
  var cards = html.split('<div class="game-card">');
  assert(cards.length===5, "four game cards rendered, got "+(cards.length-1));
  assert(cards[2].indexOf('class="leaders"')===-1, "pre-game card shows no leaders row");

  /* 3. MLB junk "0-0" skipped; real post-game line kept as Top performer */
  assert(cards[3].indexOf('class="leaders"')===-1, "MLB pre-stat '0-0' rating skipped");
  assert(cards[4].indexOf("<b>Top performer</b>")!==-1, "post-game MLB line labeled 'Top performer'");
  assert(cards[4].indexOf("Ronny Mauricio")!==-1 && cards[4].indexOf("2-4, 2 HR, 3 RBI, 2 R")!==-1,
         "post-game MLB batting line shown");

  /* 4. live badge still renders on the in-progress game */
  assert(html.indexOf("live-badge")!==-1, "live badge present for in-progress game");

  if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
  console.log("ALL SCORES TESTS PASS");
}, 50);
