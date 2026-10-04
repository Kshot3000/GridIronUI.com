/* Verifies the DFS Lab injury cross-check STAYS LIVE in the SHIPPED js/dfs.js
   (v2.0.14): the ESPN report is re-pulled silently every 3 minutes while the
   page is open — inactives drop ~90 minutes before each kickoff wave, long
   after a builder's page load. Loads the real dfs-opt/dfs-injuries/dfs.js in
   a vm sandbox with a captured setInterval and asserts:
   - a 180000 ms interval is armed at boot;
   - the first fetch behaves exactly as before (loading banner, chips);
   - a tick issues a silent re-fetch that does NOT flash the loading banner;
   - a player ruled OUT between checks gains a chip in place, and a player
     cleared between checks loses his — painted without a table rebuild;
   - ticks skip while the tab is hidden;
   - a failed silent re-check keeps the last good flags and banner;
   - the ready banner carries an honest "updated" stamp + re-check note. */
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
  "addPlayer","demoBtn","clearPool","poolCount","rulesLine","poolWrap","injBanner",
  "results","exportWrap","exportBtn","runOpt","numLineups","maxExp","minUni","volPen"];
function P(id,name,pos,team,locked,sal){
  return { id:id, name:name, pos:pos, team:team, opp:"OPP", salary:sal||6000, proj:14,
           floor:7, ceil:24, own:10, locked:!!locked, banned:false };
}
function seedStore(){
  var pool = [
    P(1,"Patrick Mahomes",["QB"],"KC", false, 7000),
    P(2,"Isiah Pacheco",["RB"],"KC", true, 6000),
    P(3,"James Cook",["RB"],"BUF", false, 5500),
    P(7,"T. Kelce",["TE"],"KC", false, 4500)
  ];
  var s = {};
  s["giu_dfs_pool_DK_NFL"] = JSON.stringify({ pool: pool, pidSeq: 10 });
  return s;
}
function entry(status, name){
  var parts = name.split(" ");
  return { status: status, shortComment: "note", longComment: "",
           athlete: { displayName: name, firstName: parts[0], lastName: parts.slice(1).join(" ") } };
}
function payloadA(){ /* Pacheco OUT, Cook doubtful, Kelce questionable */
  return { injuries: [
    { displayName:"Kansas City Chiefs", injuries:[ entry("Out","Isiah Pacheco"), entry("Questionable","Travis Kelce") ]},
    { displayName:"Buffalo Bills", injuries:[ entry("Doubtful","James Cook") ]}
  ]};
}
function payloadB(){ /* Pacheco CLEARED between checks, Mahomes newly OUT */
  return { injuries: [
    { displayName:"Kansas City Chiefs", injuries:[ entry("Active","Isiah Pacheco"), entry("Out","Patrick Mahomes"), entry("Questionable","Travis Kelce") ]},
    { displayName:"Buffalo Bills", injuries:[ entry("Doubtful","James Cook") ]}
  ]};
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
  var jsonCalls = [], recs = [], intervals = [];
  var doc = {
    hidden: false,
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
        get: function(){
          if(!html) return null;
          var chip = { innerHTML: html, _parent: null,
            remove: function(){
              if(this._parent){
                var i = this._parent._chips.indexOf(this);
                if(i !== -1) this._parent._chips.splice(i, 1);
                this._parent = null;
              }
            } };
          return chip;
        }
      });
      return el;
    }
  };
  var sandbox = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(fn, ms){ intervals.push({ fn: fn, ms: ms }); return intervals.length; },
    clearInterval: function(){},
    document: doc,
    localStorage: {
      getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
      setItem: function(k, v){ store[k] = String(v); },
      removeItem: function(k){ delete store[k]; }
    },
    performance: { now: function(){ return 0; } },
    alert: function(){},
    window: {},
    GIU: {
      fetchJSON: function(url){
        jsonCalls.push(url);
        var rec = {};
        rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
        recs.push(rec);
        return rec.promise;
      },
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
  return { sb: sandbox, doc: doc, getEl: getEl, store: store,
           jsonCalls: jsonCalls, recs: recs, intervals: intervals };
}

function settle(fn){ setTimeout(fn, 60); }

function rowStub(p){
  var cell = {
    _chips: [],
    querySelectorAll: function(){ return this._chips.slice(); },
    appendChild: function(c){ c._parent = this; this._chips.push(c); },
    get html(){ return this._chips.map(function(c){ return c.innerHTML; }).join(""); }
  };
  var tr = makeEl("row"+p.id);
  tr.getAttribute = function(){ return String(p.id); };
  tr.querySelector = function(){ return cell; };
  tr._cell = cell;
  return tr;
}
function poolRows(ctx){
  var saved = JSON.parse(ctx.store["giu_dfs_pool_DK_NFL"]);
  return saved.pool.map(rowStub);
}
function cellHtml(ctx, id){
  var r = ctx.getEl("poolWrap")._children.filter(function(x){ return x.id === "row"+id; })[0];
  return r ? r._cell.html : "";
}

/* ---------- shipped pins ---------- */
var dfsHtml = fs.readFileSync(path.join(ROOT, "dfs.html"), "utf8");
assert(dfsHtml.indexOf("js/dfs.js?v=2.0.14") !== -1, "dfs.html pins js/dfs.js?v=2.0.14");
var dfsSrc = fs.readFileSync(path.join(ROOT, "js", "dfs.js"), "utf8");
assert(/INJ_LIVE_MS = 3\*60\*1000/.test(dfsSrc), "dfs.js re-check cadence is the injury wire's 3 minutes");

var C = makeContext();
settle(function(){
  assert(C.intervals.length === 1 && C.intervals[0].ms === 180000,
         "one live interval armed at boot, 180000 ms");
  assert(C.jsonCalls.length === 1, "one ESPN injuries fetch on initial pool render");
  C.getEl("poolWrap")._children = poolRows(C);

  C.recs[0].resolve(payloadA());
  settle(function(){
    assert(/inj-chip sev3/.test(cellHtml(C, 2)), "payload A: Pacheco carries the OUT chip");
    var banner = C.getEl("injBanner").innerHTML;
    assert(/3 pool players/.test(banner) && /1 OUT/.test(banner), "payload A: banner counts 3 flagged, 1 OUT");
    assert(/updated \d/.test(banner), "banner carries an honest updated stamp");
    assert(/Re-checks every 3 min/.test(banner), "banner states the re-check cadence");

    /* tick: silent re-check */
    C.intervals[0].fn();
    assert(C.jsonCalls.length === 2, "tick issues a second (silent) fetch");
    banner = C.getEl("injBanner").innerHTML;
    assert(/3 pool players/.test(banner) && !/checking the ESPN injury report/.test(banner),
           "silent re-check does not flash the loading banner");

    C.recs[1].resolve(payloadB());
    settle(function(){
      assert(cellHtml(C, 2) === "", "payload B: cleared Pacheco loses his chip in place");
      assert(/inj-chip sev3/.test(cellHtml(C, 1)), "payload B: newly-OUT Mahomes gains the sev3 chip");
      assert(/inj-chip sev1/.test(cellHtml(C, 7)), "payload B: Kelce keeps his questionable chip");
      var pachecoRow = C.getEl("poolWrap")._children.filter(function(x){ return x.id === "row2"; })[0];
      assert(!pachecoRow.classList.contains("row-inj-out"), "payload B: Pacheco row loses row-inj-out");
      banner = C.getEl("injBanner").innerHTML;
      assert(/3 pool players/.test(banner) && /1 OUT/.test(banner), "payload B: banner still counts 3 flagged, 1 OUT");

      /* hidden tab: no fetch */
      C.doc.hidden = true;
      C.intervals[0].fn();
      assert(C.jsonCalls.length === 2, "tick skips while the tab is hidden");
      C.doc.hidden = false;

      /* failed silent re-check keeps the last good state */
      C.intervals[0].fn();
      assert(C.jsonCalls.length === 3, "next tick fetches again");
      C.recs[2].reject(new Error("feed down"));
      settle(function(){
        banner = C.getEl("injBanner").innerHTML;
        assert(/3 pool players/.test(banner) && !/couldn't reach/.test(banner),
               "failed silent re-check keeps the last good banner (no error flash)");
        assert(/inj-chip sev3/.test(cellHtml(C, 1)), "failed silent re-check keeps the last good chips");
        console.log(failures ? "\n"+failures+" FAILURES" : "\nALL DFS-INJURY LIVE TESTS PASSED");
        process.exit(failures ? 1 : 0);
      });
    });
  });
});
