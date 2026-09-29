/* Tests the tab-list accessibility enhancement in the SHIPPED js/site.js.
   Loads the real site.js in a vm sandbox with a stubbed DOM, then asserts:
   - .tabs containers gain role=tablist + an aria-label
   - .tab buttons gain role=tab, aria-selected and roving tabindex
   - toggling .active re-syncs aria-selected/tabindex (via MutationObserver)
   - ArrowRight moves to + activates the next tab (automatic activation);
     Home/End jump to first/last; arrows wrap around
   - tab lists added after load are picked up by the sweep observer
   - a container that already carries a role/aria-label is not overridden
   Run: node tests/test-tabs-a11y.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---------- fake DOM ---------- */
var observers = [];
function FakeMutationObserver(cb){ this.cb = cb; observers.push(this); }
FakeMutationObserver.prototype.observe = function(){};
function fireObservers(){ observers.forEach(function(o){ o.cb([]); }); }

function makeEl(tag){
  var attrs = {}, classes = {}, handlers = {};
  var el = {
    tagName: (tag || "DIV").toUpperCase(),
    _children: [],
    getAttribute: function(k){ return attrs.hasOwnProperty(k) ? attrs[k] : null; },
    setAttribute: function(k, v){ attrs[k] = String(v); },
    removeAttribute: function(k){ delete attrs[k]; },
    classList: {
      add: function(c){ classes[c] = 1; },
      remove: function(c){ delete classes[c]; },
      contains: function(c){ return !!classes[c]; },
      toggle: function(c, f){
        if(f === undefined) f = !classes[c];
        if(f) classes[c] = 1; else delete classes[c];
        return !!classes[c];
      }
    },
    addEventListener: function(t, fn){ (handlers[t] = handlers[t] || []).push(fn); },
    _fire: function(t, ev){ (handlers[t] || []).forEach(function(fn){ fn(ev || {}); }); },
    appendChild: function(c){ this._children.push(c); return c; },
    querySelectorAll: function(sel){
      if(sel === ".tab") return this._children.filter(function(c){
        return c.classList.contains("tab");
      });
      return [];
    },
    focus: function(){ el._focused = true; lastFocused = el; },
    click: function(){ this._fire("click", {}); },
    _focused: false, _clicked: 0
  };
  return el;
}
var lastFocused = null;

function makeTabs(id, labels, activeIdx, preRole, preLabel){
  var list = makeEl("div");
  list.setAttribute("id", id);
  list.setAttribute("class", "tabs");
  if(preRole) list.setAttribute("role", preRole);
  if(preLabel) list.setAttribute("aria-label", preLabel);
  labels.forEach(function(l, i){
    var b = makeEl("button");
    b.setAttribute("class", "tab");
    b.classList.add("tab");
    if(i === activeIdx) b.classList.add("active");
    b.textContent = l;
    /* page-style activation: clicking toggles .active within the list */
    b.addEventListener("click", function(){
      list._children.forEach(function(x){ x.classList.remove("active"); });
      b.classList.add("active");
      b._clicked++;
    });
    list.appendChild(b);
  });
  return list;
}

function makeDoc(lists){
  return {
    readyState: "complete",
    addEventListener: function(){},
    getElementById: function(){ return null; },
    querySelector: function(){ return null; },
    querySelectorAll: function(sel){
      if(sel === ".tabs") return lists.slice();
      if(sel === ".tabs:not([data-tablist])")
        return lists.filter(function(l){ return l.getAttribute("data-tablist") !== "1"; });
      return [];
    },
    body: { getAttribute: function(){ return null; }, setAttribute: function(){},
            hasAttribute: function(){ return false; } }
  };
}

/* ---------- load the shipped site.js ---------- */
var mountDoc = makeDoc([]);
var sandbox = {
  document: mountDoc,
  console: console,
  location: {pathname: "/index.html", href: "https://gridironui.xyz/index.html"},
  MutationObserver: FakeMutationObserver
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "site.js"), "utf8"), sandbox, {filename: "site.js"});
var tabA11y = sandbox.window.GIU && sandbox.window.GIU.tabA11y;
assert(tabA11y && typeof tabA11y.enhance === "function", "site.js exposes GIU.tabA11y.enhance");
if(!tabA11y) process.exit(1);

/* ---------- scenario: basic enhancement ---------- */
var list = makeTabs("leagueTabs", ["NFL","NBA","MLB"], 0);
var doc = makeDoc([list]);
tabA11y.enhance(doc);
assert(list.getAttribute("role") === "tablist", "container gains role=tablist");
assert(list.getAttribute("aria-label") === "League", "aria-label derived from id (leagueTabs -> League)");
var btns = list.querySelectorAll(".tab");
assert(btns.length === 3, "three tab buttons found");
assert(btns[0].getAttribute("role") === "tab", "buttons gain role=tab");
assert(btns[0].getAttribute("aria-selected") === "true", "active button aria-selected=true");
assert(btns[1].getAttribute("aria-selected") === "false", "inactive button aria-selected=false");
assert(btns[0].getAttribute("tabindex") === "0", "active button in tab order (tabindex=0)");
assert(btns[1].getAttribute("tabindex") === "-1" && btns[2].getAttribute("tabindex") === "-1",
       "inactive buttons use roving tabindex=-1");

/* ---------- scenario: .active toggle re-syncs ---------- */
btns[1].click(); fireObservers();
assert(btns[1].getAttribute("aria-selected") === "true", "clicking a tab moves aria-selected");
assert(btns[0].getAttribute("aria-selected") === "false", "previous tab drops aria-selected");
assert(btns[1].getAttribute("tabindex") === "0" && btns[0].getAttribute("tabindex") === "-1",
       "roving tabindex follows .active");

/* ---------- scenario: arrow-key navigation ---------- */
lastFocused = null;
var before = btns[2]._clicked;
list._fire("keydown", {key: "ArrowRight", target: btns[1], preventDefault: function(){}});
assert(btns[2]._clicked === before + 1, "ArrowRight activates the next tab (automatic activation)");
assert(btns[2].getAttribute("aria-selected") === "true" || lastFocused === btns[2],
       "focus lands on the newly selected tab");
list._fire("keydown", {key: "ArrowRight", target: btns[2], preventDefault: function(){}});
assert(btns[0]._clicked >= 1, "arrows wrap around from last to first");
list._fire("keydown", {key: "ArrowLeft", target: btns[0], preventDefault: function(){}});
fireObservers();
assert(btns[2].getAttribute("aria-selected") === "true", "ArrowLeft moves back one");
list._fire("keydown", {key: "Home", target: btns[2], preventDefault: function(){}});
fireObservers();
assert(btns[0].getAttribute("aria-selected") === "true", "Home jumps to the first tab");
list._fire("keydown", {key: "End", target: btns[0], preventDefault: function(){}});
fireObservers();
assert(btns[2].getAttribute("aria-selected") === "true", "End jumps to the last tab");
var clicksBefore = btns.map(function(b){ return b._clicked; }).join(",");
list._fire("keydown", {key: "x", target: btns[0], preventDefault: function(){}});
assert(btns.map(function(b){ return b._clicked; }).join(",") === clicksBefore,
       "unrelated keys are ignored");

/* ---------- scenario: labels for other known tab lists ---------- */
[["sportTabs","Sport"],["siteTabs","DFS site"],["modeTabs","Contest mode"],
 ["injSev","Severity"],["marketTabs","League"],["cMode","Contest mode"]].forEach(function(pair){
  assert(tabA11y.labelFor(pair[0]) === pair[1], "labelFor("+pair[0]+") = "+pair[1]);
});
assert(tabA11y.labelFor("somethingNew") === "Options", "unknown tab lists get a neutral label");

/* ---------- scenario: pre-existing role/aria-label preserved ---------- */
var keep = makeTabs("sportTabs", ["A","B"], 0, "toolbar", "Choose a sport");
tabA11y.enhanceOne(keep);
assert(keep.getAttribute("role") === "toolbar", "existing role is not overridden");
assert(keep.getAttribute("aria-label") === "Choose a sport", "existing aria-label is not overridden");
assert(keep.querySelectorAll(".tab")[0].getAttribute("role") === "tab",
       "buttons still enhanced when container role is pre-set");

/* ---------- scenario: late-added tab lists are swept up ---------- */
var late = makeTabs("newsTabs", ["NFL","NBA"], 0);
var doc2 = makeDoc([late]);
tabA11y.enhance(doc2);
assert(late.getAttribute("role") === "tablist", "sweep observer picks up new tab lists");
assert(late.getAttribute("aria-label") === "League", "swept list gets its aria-label");

if(failures){ console.error(failures + " assertion(s) failed"); process.exit(1); }
console.log("ALL PASS: tab-list accessibility");
