/* Verifies the ESPN injury cross-check wiring in the SHIPPED js/dfs.js.
   Loads the real js/dfs-opt.js, js/dfs-injuries.js and js/dfs.js in a vm
   sandbox with stubbed DOM/localStorage/fetch, then asserts:
   - the ESPN injuries feed is fetched once per sport, AFTER the pool renders;
   - a loading banner shows while the feed is in flight;
   - after resolve, OUT/DOUBTFUL/QUESTIONABLE pool players get severity chips,
     OUT rows get the row-inj-out class, cleared players get nothing;
   - the banner counts flagged players and offers "Exclude all OUT";
   - firing Exclude-all-OUT bans the OUT players (no refetch, one user action);
   - Generate with a locked OUT player shows the locked-injury warning;
   - a feed with only cleared ("Active") players shows the all-clear banner. */
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
    P(2,"Isiah Pacheco",["RB"],"KC", true, 6000),  /* locked */
    P(3,"James Cook",["RB"],"BUF", false, 5500),
    P(4,"Tyreek Hill",["WR"],"MIA", false, 6500),
    P(5,"CeeDee Lamb",["WR"],"DAL", false, 6000),
    P(6,"Ja'Marr Chase",["WR"],"CIN", false, 5500),
    P(7,"T. Kelce",["TE"],"KC", false, 4500),
    P(8,"Rashee Rice",["WR"],"KC", false, 5000),
    P(9,"KC DST",["DST"],"KC", false, 2800)
  ];
  var s = {};
  s["giu_dfs_pool_DK_NFL"] = JSON.stringify({ pool: pool, pidSeq: 10 });
  return s;
}
function injuriesPayload(){
  return { injuries: [
    { displayName:"Kansas City Chiefs", injuries:[
      { status:"Out", shortComment:"knee", longComment:"",
        athlete:{ displayName:"Isiah Pacheco", firstName:"Isiah", lastName:"Pacheco" } },
      { status:"Questionable", shortComment:"ankle", longComment:"",
        athlete:{ displayName:"Travis Kelce", firstName:"Travis", lastName:"Kelce" } },
      { status:"Active", shortComment:"cleared", longComment:"",
        athlete:{ displayName:"Patrick Mahomes", firstName:"Patrick", lastName:"Mahomes" } }
    ]},
    { displayName:"Buffalo Bills", injuries:[
      { status:"Doubtful", shortComment:"hamstring", longComment:"",
        athlete:{ displayName:"James Cook", firstName:"James", lastName:"Cook" } }
    ]}
  ]};
}
function clearedOnlyPayload(){
  return { injuries: [
    { displayName:"Kansas City Chiefs", injuries:[
      { status:"Active", shortComment:"cleared", longComment:"",
        athlete:{ displayName:"Patrick Mahomes", firstName:"Patrick", lastName:"Mahomes" } }
    ]}
  ]};
}

function makeContext(fixture){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  EL_IDS.forEach(getEl);
  getEl("numLineups").value = "3";
  getEl("maxExp").value = "60";
  getEl("minUni").value = "3";
  getEl("volPen").value = "0.5";
  var store = seedStore();
  var jsonCalls = [], injRec = null;
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
      fetchJSON: function(url){
        jsonCalls.push(url);
        var rec = {};
        rec.promise = new Promise(function(res, rej){ rec.resolve = res; rec.reject = rej; });
        if(url.indexOf("site.api.espn.com") !== -1) injRec = rec;
        else rec.resolve({});
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
  return { sb: sandbox, getEl: getEl, store: store, jsonCalls: jsonCalls,
           injRec: function(){ return injRec; } };
}

function settle(fn){ setTimeout(fn, 60); }

/* Row stubs so paintChipsInPlace() has real rows to paint into (the stub
   DOM can't parse the innerHTML table string, so rows are modeled). */
function rowStub(p){
  var cell = {
    _chips: [],
    querySelectorAll: function(){ return this._chips.slice(); },
    appendChild: function(c){ this._chips.push(c); this.html = (this.html||"") + (c.innerHTML||""); },
    html: ""
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

/* ---------- context 1: mixed injury report ---------- */
var C = makeContext();
settle(function(){
  assert(C.jsonCalls.length === 1, "one ESPN injuries fetch on initial pool render");
  assert(/football\/nfl\/injuries/.test(C.jsonCalls[0]||""), "fetch targets the NFL injuries feed");
  var banner = C.getEl("injBanner").innerHTML;
  assert(/checking the ESPN injury report/.test(banner), "banner shows loading state while feed is in flight");
  assert(C.getEl("poolWrap").innerHTML.indexOf("inj-chip") === -1,
         "no chips before the feed resolves");
  C.getEl("poolWrap")._children = poolRows(C);

  C.injRec().resolve(injuriesPayload());
  settle(function(){
    var rows = C.getEl("poolWrap")._children;
    function cellHtml(id){
      var r = rows.filter(function(x){ return x.id === "row"+id; })[0];
      return r ? r._cell.html : "";
    }
    assert(/inj-chip sev3/.test(cellHtml(2)) && /OUT/.test(cellHtml(2)),
           "OUT player gets the sev3 OUT chip, painted in place");
    assert(/inj-chip sev2/.test(cellHtml(3)) && /DOUBT/.test(cellHtml(3)),
           "doubtful player gets the sev2 chip");
    assert(/inj-chip sev1/.test(cellHtml(7)) && /QUES\?/.test(cellHtml(7)),
           "probable last-name match is labeled QUES?");
    assert(cellHtml(1) === "", "cleared (Active) player gets no chip");
    assert(cellHtml(4) === "" && cellHtml(5) === "", "unflagged players get no chip");
    var pachecoRow = rows.filter(function(x){ return x.id === "row2"; })[0];
    assert(pachecoRow.classList.contains("row-inj-out"), "OUT row gets row-inj-out class");

    banner = C.getEl("injBanner").innerHTML;
    assert(/3 pool players/.test(banner) && /1 OUT/.test(banner),
           "banner counts flagged players with severity breakdown");
    assert(banner.indexOf("injExcludeOut") !== -1, "banner offers Exclude all OUT");

    /* locked-and-OUT warning on Generate */
    C.getEl("runOpt")._fire("click");
    settle(function(){
      var resHtml = C.getEl("results").innerHTML;
      assert(/Locked player on the injury report/.test(resHtml),
             "locked OUT player triggers the injury warning in results");
      assert(/Isiah Pacheco/.test(resHtml), "warning names the locked OUT player");

      /* Exclude all OUT: one user action, no refetch */
      C.getEl("injExcludeOut")._fire("click");
      settle(function(){
        var saved = JSON.parse(C.store["giu_dfs_pool_DK_NFL"]);
        var pacheco = saved.pool.filter(function(p){ return p.id===2; })[0];
        assert(pacheco.banned === true && pacheco.locked === false,
               "Exclude all OUT bans the OUT player and unlocks him");
        var othersBanned = saved.pool.filter(function(p){ return p.id!==2 && p.banned; }).length;
        assert(othersBanned === 0, "doubtful/questionable players are NOT auto-excluded");
        assert(C.jsonCalls.length === 1, "no refetch after exclude (per-sport cache)");
        var poolHtml2 = C.getEl("poolWrap").innerHTML;
        assert(poolHtml2.indexOf("row-banned") !== -1, "excluded OUT player renders as banned");
        assert(poolHtml2.indexOf("inj-chip sev3") !== -1,
               "rebuilt pool table embeds chips inline (builder path)");

        /* ---------- context 2: cleared-only feed ---------- */
        var C2 = makeContext();
        settle(function(){
          C2.injRec().resolve(clearedOnlyPayload());
          settle(function(){
            var b2 = C2.getEl("injBanner");
            assert(/no pool players on the report/.test(b2.innerHTML),
                   "all-clear feed shows the no-flags banner");
            assert(/inj-banner ok/.test(b2.className), "all-clear banner uses the ok style");
            assert(C2.getEl("poolWrap").innerHTML.indexOf("inj-chip") === -1,
                   "no chips when the feed has only cleared players");
            console.log(failures ? "\n"+failures+" FAILURES" : "\nALL DFS-INJURY DOM TESTS PASSED");
            process.exit(failures ? 1 : 0);
          });
        });
      });
    });
  });
});
