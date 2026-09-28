/* Verifies the DFS Lab pool usability wiring in the SHIPPED js/dfs.js.
   Loads the real js/dfs-opt.js, js/dfs-injuries.js and js/dfs.js in a vm
   sandbox with stubbed DOM/localStorage, then asserts:
   - the pool filter bar (search + position select) renders once the pool
     is non-empty, and position options come from the current roster slots;
   - every pool row carries a Value cell (projected points per $1k) with
     the right number;
   - exactly the top-3 values in the FULL pool get the ★ top-value marker,
     even when a filter hides them;
   - the search box filters by name/team (case-insensitive) and updates
     the "Showing N of M" count;
   - the position filter narrows rows to that position;
   - search + position compose;
   - a filter with no matches shows honest guidance instead of an empty table. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", textContent: "", style: {}, value: "", className: "",
    _attrs: {},
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    querySelector: function(){ return null; },
    closest: function(){ return null; },
    _fire: function(ev){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, {}); }, this); }
  };
  var cls = {};
  el.classList = {
    add: function(c){ cls[c]=1; }, remove: function(c){ delete cls[c]; },
    toggle: function(c, f){ var v = f!==undefined?!!f:!cls[c]; if(v)cls[c]=1; else delete cls[c]; return v; },
    contains: function(c){ return !!cls[c]; }
  };
  return el;
}

var EL_IDS = ["siteTabs","sportTabs","modeTabs","csvFile","mapWrap","mapBox","importInfo",
  "doImport","mName","mPos","mTeam","mOpp","mSalary","mProj","mFloor","mCeil","mOwn",
  "addPlayer","demoBtn","clearPool","poolCount","rulesLine","poolFilters","poolSearch",
  "poolPosFilter","poolShowCount","poolWrap","injBanner",
  "results","exportWrap","exportBtn","runOpt","numLineups","maxExp","minUni","volPen"];
function P(id,name,pos,team,sal,proj){
  return { id:id, name:name, pos:pos, team:team, opp:"OPP", salary:sal, proj:proj,
           floor:7, ceil:24, own:10, locked:false, banned:false };
}
function seedStore(){
  var pool = [
    P(1,"Patrick Mahomes",["QB"],"KC",7000,14),   /* 2.00 */
    P(2,"Isiah Pacheco",["RB"],"KC",6000,14),     /* 2.33 */
    P(3,"James Cook",["RB"],"BUF",5500,14),       /* 2.55 */
    P(4,"Tyreek Hill",["WR"],"MIA",6500,14),      /* 2.15 */
    P(5,"CeeDee Lamb",["WR"],"DAL",6000,14),      /* 2.33 */
    P(6,"Ja'Marr Chase",["WR"],"CIN",5500,14),    /* 2.55 */
    P(7,"T. Kelce",["TE"],"KC",4500,14),         /* 3.11 -> top */
    P(8,"Rashee Rice",["WR"],"KC",5000,14),       /* 2.80 -> top */
    P(9,"KC DST",["DST"],"KC",2800,14)            /* 5.00 -> top */
  ];
  var s = {};
  s["giu_dfs_pool_DK_NFL"] = JSON.stringify({ pool: pool, pidSeq: 10 });
  return s;
}

function makeContext(){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  EL_IDS.forEach(getEl);
  getEl("numLineups").value = "3";
  getEl("maxExp").value = "60";
  getEl("minUni").value = "3";
  getEl("volPen").value = "0.5";
  var store = seedStore();
  var sandbox = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    document: {
      getElementById: getEl,
      querySelectorAll: function(){ return []; },
      createElement: function(){
        var el = makeEl("tmp");
        var html = "";
        Object.defineProperty(el, "innerHTML", {
          get: function(){ return html; },
          set: function(v){ html = String(v); }
        });
        Object.defineProperty(el, "firstChild", {
          get: function(){ return html ? { innerHTML: html } : null; }
        });
        return el;
      }
    },
    localStorage: {
      getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
      setItem: function(k, v){ store[k] = String(v); },
      removeItem: function(k){ delete store[k]; }
    },
    performance: { now: function(){ return 0; } },
    alert: function(){},
    window: {},
    GIU: {
      fetchJSON: function(){ return Promise.resolve({}); },
      esc: function(s){ return String(s==null?"":""); }
    }
  };
  sandbox.window.GIU = sandbox.GIU;
  sandbox.window.DFSOpt = null;
  sandbox.window.DFSInj = null;
  vm.createContext(sandbox);
  ["js/dfs-opt.js","js/dfs-injuries.js","js/dfs.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
  });
  return { sb: sandbox, getEl: getEl };
}

function rowCount(ctx){
  return (ctx.getEl("poolWrap").innerHTML.match(/<tr data-id="/g) || []).length;
}
function starCount(ctx){
  return (ctx.getEl("poolWrap").innerHTML.match(/<span class="val-star"/g) || []).length;
}

var C = makeContext();
var html = C.getEl("poolWrap").innerHTML;

assert(C.getEl("poolFilters").style.display !== "none",
       "filter bar is visible once the pool is non-empty");
assert(/<option value="QB">QB<\/option>/.test(C.getEl("poolPosFilter").innerHTML) &&
       /<option value="FLEX">FLEX<\/option>/.test(C.getEl("poolPosFilter").innerHTML) &&
       /All positions/.test(C.getEl("poolPosFilter").innerHTML),
       "position select offers the roster's slots plus All positions");
assert(/<th[^>]*>Value<\/th>/.test(html), "pool table has a Value column header");
assert(rowCount(C) === 9, "all 9 seeded players render with no filter");
assert(/2\.00</.test(html) && /5\.00</.test(html),
       "Value cells carry the right numbers (Mahomes 2.00, KC DST 5.00)");
assert(starCount(C) === 3, "exactly three ★ top-value markers");
assert(/KC DST<\/b>/.test(html), "top-value marker lands on the best-value row (KC DST 5.00)");
assert(/T\. Kelce<\/b>/.test(html) && starCount(C) === 3,
       "top-3 values are KC DST, Kelce, Rice");

/* search filter */
C.getEl("poolSearch").value = "cook";
C.getEl("poolSearch")._fire("input");
assert(rowCount(C) === 1, "search narrows to matching rows");
assert(/James Cook/.test(C.getEl("poolWrap").innerHTML), "matching row is James Cook");
assert(C.getEl("poolShowCount").textContent === "Showing 1 of 9 players",
       "show-count reads 'Showing 1 of 9 players'");
assert(starCount(C) === 0, "no top-value stars when the filtered rows exclude the top-3 (stars computed on the full pool)");
C.getEl("poolSearch").value = "kc";
C.getEl("poolSearch")._fire("input");
assert(rowCount(C) === 5, "team search 'kc' matches 5 KC players");

/* position filter */
C.getEl("poolSearch").value = "";
C.getEl("poolSearch")._fire("input");
C.getEl("poolPosFilter").value = "QB";
C.getEl("poolPosFilter")._fire("change");
assert(rowCount(C) === 1 && /Patrick Mahomes/.test(C.getEl("poolWrap").innerHTML),
       "position filter QB shows only Mahomes");

/* search + position compose */
C.getEl("poolSearch").value = "kc";
C.getEl("poolSearch")._fire("input");
C.getEl("poolPosFilter").value = "WR";
C.getEl("poolPosFilter")._fire("change");
assert(rowCount(C) === 1 && /Rashee Rice/.test(C.getEl("poolWrap").innerHTML),
       "search + position compose (kc + WR -> Rashee Rice)");

/* no matches */
C.getEl("poolSearch").value = "zzz";
C.getEl("poolSearch")._fire("input");
assert(rowCount(C) === 0, "no rows render when nothing matches");
assert(/No players match the current search/.test(C.getEl("poolWrap").innerHTML),
       "honest guidance when the filter matches nothing");

/* clearing restores everything, stars back */
C.getEl("poolSearch").value = "";
C.getEl("poolSearch")._fire("input");
C.getEl("poolPosFilter").value = "ALL";
C.getEl("poolPosFilter")._fire("change");
assert(rowCount(C) === 9 && starCount(C) === 3 &&
       C.getEl("poolShowCount").textContent === "",
       "clearing filters restores all rows and stars, count line goes quiet");

if(failures){ console.error(failures + " FAILURE(S)"); process.exit(1); }
console.log("dfs-filters-dom: all green");
