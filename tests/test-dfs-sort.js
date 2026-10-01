/* Verifies the DFS Lab pool-table column sorting in the SHIPPED js/dfs.js.
   Loads the real js/dfs-opt.js, js/dfs-injuries.js and js/dfs.js in a vm
   sandbox with stubbed DOM/localStorage, then asserts:
   - sortPool is pure: returns a new array, never mutates its input;
   - every numeric column sorts desc by default, Player sorts asc;
   - ties break deterministically (name asc, then pool id) and never shuffle;
   - zero-salary players get value 0 (OPT.value guard) and sort last on Value;
   - an unknown column (or dir 0) returns the rows in their original order;
   - the shipped pool table renders 7 sortable headers (Player, Sal, Proj,
     Floor, Ceil, Own%, Value) as real <button>s with data-sort, scope=col,
     aria-sort and an aria-label; Value keeps its explainer title;
   - the click behavior (driven through the toggleSort seam): first click on
     a column takes its default direction, clicking again flips it, clicking
     a different column takes that column's default; aria-sort and the arrow
     glyph follow the active column;
   - dfs.html pins js/dfs.js at a version >= the release that changed it.
   Run: node tests/test-dfs-sort.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:  ", msg);
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
    P(1,"Patrick Mahomes",["QB"],"KC",7000,14),   /* value 2.00 */
    P(2,"Isiah Pacheco",["RB"],"KC",6000,14),     /* value 2.33 */
    P(3,"James Cook",["RB"],"BUF",5500,14),       /* value 2.55 */
    P(4,"Tyreek Hill",["WR"],"MIA",6500,14),      /* value 2.15 */
    P(5,"CeeDee Lamb",["WR"],"DAL",6000,14),      /* value 2.33 */
    P(6,"Ja'Marr Chase",["WR"],"CIN",5500,14),    /* value 2.55 */
    P(7,"T. Kelce",["TE"],"KC",4500,14),          /* value 3.11 */
    P(8,"Rashee Rice",["WR"],"KC",5000,14),       /* value 2.80 */
    P(9,"KC DST",["DST"],"KC",2800,14)            /* value 5.00 */
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

var C = makeContext();
var SEAM = C.sb.window.GIU.dfsImport;
var sortPool = SEAM.sortPool, spec = SEAM.sortSpec, toggleSort = SEAM.toggleSort;

/* ---------- pure sortPool ---------- */
(function(){
  var rows = [P(1,"B",["QB"],"KC",7000,14), P(2,"a",["RB"],"KC",6000,10), P(3,"C",["WR"],"MIA",6500,20)];
  var before = rows.map(function(r){ return r.id; }).join(",");
  var out = sortPool(rows, "proj", -1);
  assert(before === "1,2,3", "sortPool does not mutate its input array");
  assert(out.map(function(r){ return r.id; }).join(",") === "3,1,2",
         "proj desc orders by projection");
  assert(out !== rows, "sortPool returns a new array");
  assert(spec.value.dir === -1 && spec.sal.dir === -1 && spec.proj.dir === -1,
         "numeric columns default to descending");
  assert(spec.name.dir === 1, "Player name defaults to ascending");

  /* ties: name asc, then id — deterministic, no shuffling */
  var tied = [P(9,"Zed",["WR"],"KC",5000,14), P(4,"Amy",["WR"],"KC",5000,14),
              P(5,"Amy",["WR"],"KC",5000,14)];
  var t2 = sortPool(tied, "value", -1);
  assert(t2.map(function(r){ return r.id; }).join(",") === "4,5,9",
         "equal values tie-break by name asc then pool id (Amy/4, Amy/5, Zed/9)");
  var t3 = sortPool(tied, "value", 1);
  assert(t3.map(function(r){ return r.id; }).join(",") === "4,5,9",
         "tie-break stays name-asc even when the column direction flips");

  /* zero salary -> value 0 -> sorts last on Value desc */
  var zs = [P(1,"A",["QB"],"KC",0,14), P(2,"B",["QB"],"KC",7000,14)];
  var z2 = sortPool(zs, "value", -1);
  assert(z2[0].id === 2 && z2[1].id === 1,
         "zero-salary player gets value 0 and sorts last on Value");

  /* unknown column / no direction -> original order, new array */
  var u = sortPool(rows, "nope", -1);
  assert(u.map(function(r){ return r.id; }).join(",") === "1,2,3" && u !== rows,
         "unknown column returns the original order in a new array");
  var z0 = sortPool(rows, "value", 0);
  assert(z0.map(function(r){ return r.id; }).join(",") === "1,2,3",
         "dir 0 (no sort) returns the original order");
})();

/* ---------- shipped header wiring ---------- */
(function(){
  var html = C.getEl("poolWrap").innerHTML;
  ["name","sal","proj","floor","ceil","own","value"].forEach(function(col){
    assert(new RegExp('<button type="button" class="th-sort" data-sort="'+col+'"').test(html),
           "pool table renders a sortable button for column '"+col+"'");
  });
  assert(/<th scope="col" aria-sort="none"><button[^>]*data-sort="name"[^>]*aria-label="Sort by Player"/.test(html),
         "sortable th carries scope=col, aria-sort=none and an aria-label");
  assert(html.indexOf('title="Projected points per $1,000 of salary"') !== -1,
         "Value header keeps its explainer title");
  assert(/>Value <span class="sort-arrow" aria-hidden="true">↕<\/span>/.test(html),
         "inactive columns invite a first click with a ↕ glyph");
})();

/* row-id order helper */
function rowIds(ctx){
  var ids = [], re = /<tr data-id="(\d+)"/g, m;
  while((m = re.exec(ctx.getEl("poolWrap").innerHTML))) ids.push(Number(m[1]));
  return ids;
}
function activeTh(ctx, col){
  var m = ctx.getEl("poolWrap").innerHTML.match(
    new RegExp('<th scope="col" aria-sort="(\\w+)"[^>]*><button[^>]*data-sort="'+col+'"'));
  return m ? m[1] : null;
}
function arrowFor(ctx, col){
  var m = ctx.getEl("poolWrap").innerHTML.match(
    new RegExp('data-sort="'+col+'"[^>]*>[^<]*<span class="sort-arrow" aria-hidden="true">(.)</span>'));
  return m ? m[1] : null;
}

/* ---------- click behavior through the toggleSort seam ---------- */
(function(){
  assert(rowIds(C).join(",") === "1,2,3,4,5,6,7,8,9",
         "default order is the pool's own (import) order");
  toggleSort("value"); /* first click -> default desc */
  assert(rowIds(C).join(",") === "9,7,8,6,3,5,2,4,1",
         "Value desc: KC DST 5.00 first, Mahomes 2.00 last; ties by name (Chase before Cook, Lamb before Pacheco)");
  assert(activeTh(C, "value") === "descending" && arrowFor(C, "value") === "▼",
         "active Value column reports aria-sort=descending with a ▼ glyph");
  toggleSort("value"); /* second click -> flip */
  assert(rowIds(C).join(",") === "1,4,5,2,6,3,8,7,9",
         "Value asc flips the order (ties still name-asc, never shuffled)");
  assert(activeTh(C, "value") === "ascending" && arrowFor(C, "value") === "▲",
         "flipped column reports aria-sort=ascending with a ▲ glyph");
  toggleSort("sal"); /* different column -> its own default */
  assert(rowIds(C).join(",") === "1,4,5,2,6,3,8,7,9",
         "Salary desc: Mahomes 7000 first, KC DST 2800 last (same ids as Value asc — coincidence)");
  assert(activeTh(C, "sal") === "descending" && activeTh(C, "value") === "none",
         "only the newly clicked column is active; Value resets to aria-sort=none");
  toggleSort("name");
  assert(rowIds(C).join(",") === "5,2,6,3,9,1,8,7,4",
         "Name asc: CeeDee Lamb first, Tyreek Hill last");
})();

/* ---------- dfs.html cache key ---------- */
(function(){
  var html = fs.readFileSync(path.join(ROOT, "dfs.html"), "utf8");
  var m = html.match(/js\/dfs\.js\?v=([\d.]+)/);
  assert(m && m[1] === "1.118.0",
         "dfs.html pins js/dfs.js?v=1.118.0 (the release changing it)");
})();

if(failures){ console.error(failures + " FAILURE(S)"); process.exit(1); }
console.log("dfs-sort: all green");
