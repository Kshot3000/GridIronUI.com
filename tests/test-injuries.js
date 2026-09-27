/* Verifies the injury severity filter + severity sorting in the SHIPPED js/injuries.js.
   Stubs the DOM, loads the real injuries.js, feeds canned ESPN-shaped data, and
   asserts that teams sort worst-injuries-first, players sort worst-first within a
   team, and the All/Out/Doubtful/Questionable filter chips filter correctly. */
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
  var el = {
    innerHTML: "", textContent: "", style: {}, value: "",
    _children: [],
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    querySelectorAll: function(){ return this._children; },
    getAttribute: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(el, {target: el}); }); }
  };
  return el;
}
var els = {};
function getEl(id){
  if(!els[id]) els[id] = makeEl(id);
  return els[id];
}

/* canned ESPN injuries-shaped data */
function inj(name, status, date){
  return { athlete: {displayName: name}, status: status, date: date || "2026-09-26T00:39Z",
          longComment: name+" "+status+" comment" };
}
var teams = [
  { id: "12", displayName: "Kansas City Chiefs", injuries: [
    inj("Player A", "Questionable"), inj("Player B", "Out"),
    inj("Player C", "Active"), inj("Player D", "Questionable")
  ]},
  { id: "20", displayName: "New York Jets", injuries: [
    inj("Player E", "Doubtful"), inj("Player F", "Out"), inj("Player G", "Out")
  ]},
  { id: "21", displayName: "Miami Dolphins", injuries: [ inj("Player H", "Active") ] }
];

var fetchStub = function(url){
  if(url.indexOf("/injuries") >= 0) return Promise.resolve({ injuries: teams });
  return Promise.reject(new Error("unexpected url "+url));
};

var sandbox = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: { getElementById: getEl },
  window: {},
  GIU: {
    fetchJSON: fetchStub,
    esc: function(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

/* give the tab containers fake button children BEFORE the script wires handlers */
["all","out","doubtful","questionable"].forEach(function(k){
  var b = makeEl("sev-"+k);
  b.getAttribute = function(a){ return a==="data-sev" ? k : null; };
  getEl("injSev")._children.push(b);
});
for(var i=0;i<7;i++){
  var b2 = makeEl("tab-"+i);
  b2.getAttribute = function(a){ return a==="data-i" ? "0" : null; };
  getEl("injTabs")._children.push(b2);
}

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox, {filename: "js/team-brand.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/injuries.js"), "utf8"), sandbox, {filename: "js/injuries.js"});

function clickSev(k){
  getEl("injSev")._children.forEach(function(b){
    if(b.getAttribute("data-sev")===k) b._fire("click");
  });
}

setTimeout(function(){
  var html = getEl("injGrid").innerHTML;

  /* 1. teams sort worst-first: Jets (2 out + 1 doubtful) before Chiefs (1 out, 2 questionable) */
  assert(html.indexOf("New York Jets")!==-1 && html.indexOf("Kansas City Chiefs")!==-1, "all three teams rendered");
  assert(html.indexOf("New York Jets") < html.indexOf("Kansas City Chiefs"), "Jets (worse injuries) sort before Chiefs");
  assert(html.indexOf("Kansas City Chiefs") < html.indexOf("Miami Dolphins"), "Chiefs sort before Dolphins (no severity)");

  /* 2. players sort worst-first within a team: B(Out) before A(Questionable) before C(Active) */
  assert(html.indexOf("Player B") < html.indexOf("Player A"), "Out player sorts before Questionable player");
  assert(html.indexOf("Player A") < html.indexOf("Player C"), "Questionable player sorts before Active player");

  /* 3. team header shows severity counts */
  assert(/2 out/.test(html), "Jets card shows '2 out'");
  assert(/2 questionable/.test(html), "Chiefs card shows questionable count");

  /* 4. Out filter: only out players shown; Dolphins (no out) drops out */
  clickSev("out");
  var h2 = getEl("injGrid").innerHTML;
  assert(h2.indexOf("Player B")!==-1, "Out filter keeps Player B");
  assert(h2.indexOf("Player F")!==-1 && h2.indexOf("Player G")!==-1, "Out filter keeps Jets out players");
  assert(h2.indexOf("Player A")===-1, "Out filter hides Questionable Player A");
  assert(h2.indexOf("Miami Dolphins")===-1, "Out filter hides team with no out injuries");

  /* 5. Questionable filter: only questionable players */
  clickSev("questionable");
  var h3 = getEl("injGrid").innerHTML;
  assert(h3.indexOf("Player A")!==-1 && h3.indexOf("Player D")!==-1, "Questionable filter keeps A and D");
  assert(h3.indexOf("Player B")===-1, "Questionable filter hides Out Player B");
  assert(h3.indexOf("Player H")===-1, "Questionable filter hides Active Player H");

  /* 6. Doubtful filter */
  clickSev("doubtful");
  var h4 = getEl("injGrid").innerHTML;
  assert(h4.indexOf("Player E")!==-1 && h4.indexOf("Player B")===-1, "Doubtful filter keeps only Player E");

  /* 7. All resets */
  clickSev("all");
  var h5 = getEl("injGrid").innerHTML;
  assert(h5.indexOf("Player C")!==-1 && h5.indexOf("Miami Dolphins")!==-1, "All filter restores everything");

  /* 8. search still works combined with filter */
  getEl("injSearch").value = "Player F";
  getEl("injSearch")._fire("input");
  setTimeout(function(){
    var h6 = getEl("injGrid").innerHTML;
    assert(h6.indexOf("Player F")!==-1 && h6.indexOf("Player B")===-1, "search narrows to Player F");
    if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
    console.log("all injuries tests passed");
  }, 400);
}, 100);
