/* Uploader-ready DFS export (js/dfs.js, v1.100.0): the import preserves each
   player's site ID (DK's "ID" column or the "(ID)" suffix on "Name + ID";
   FD's "Id" column), and the Export CSV writes the sites' bulk-uploader
   cell formats — DraftKings "Name (ID)", FanDuel the site player ID —
   falling back to the bare name (never an invented ID) when no ID was
   captured. Loads the real dfs-opt.js + dfs.js in a vm sandbox with
   stubbed DOM/localStorage, then asserts:
   - DK headers auto-map the "ID" column; players import with siteId;
   - DK without an "ID" column falls back to the "Name + ID" suffix;
   - DK with neither source imports with a blank siteId (never guessed);
   - FD headers auto-map "Id"; the ID is kept verbatim (dashes and all);
   - generic CSVs map an exact "ID" column, and skip it when absent;
   - uploadCell shapes: DK "Name (ID)", FD bare ID, quote-escaping, no-ID
     fallback to the bare name;
   - buildExportCSV writes the position header + one quoted row per lineup,
     DK format on the DK tab and FD format after switching to the FD tab.
   Run: node tests/test-dfs-export.js */
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
    _attrs: {}, _children: [],
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children; },
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
function tabStub(v, active){
  var h = {};
  return {
    getAttribute: function(){ return v; },
    addEventListener: function(ev, fn){ h[ev] = fn; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return !!active; } },
    _fire: function(ev){ if(h[ev]) h[ev].call(this, {}); }
  };
}
var EL_IDS = ["siteTabs","sportTabs","modeTabs","csvFile","mapWrap","mapBox","importInfo",
  "doImport","mName","mPos","mTeam","mOpp","mSalary","mProj","mFloor","mCeil","mOwn","mId",
  "addPlayer","demoBtn","clearPool","poolCount","rulesLine","poolFilters","poolSearch",
  "poolPosFilter","poolShowCount","poolWrap","injBanner",
  "results","exportWrap","exportBtn","runOpt","numLineups","maxExp","minUni","volPen"];
function makeContext(){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  EL_IDS.forEach(getEl);
  var sandbox = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    document: {
      getElementById: getEl,
      querySelectorAll: function(){ return []; },
      createElement: function(){ return makeEl("tmp"); }
    },
    localStorage: {
      _s: {},
      getItem: function(k){ return this._s.hasOwnProperty(k) ? this._s[k] : null; },
      setItem: function(k, v){ this._s[k] = String(v); },
      removeItem: function(k){ delete this._s[k]; }
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
  /* tab stubs BEFORE dfs.js loads: tabWire attaches its click listeners at
     load time, so the stubs must already be the querySelectorAll children. */
  getEl("siteTabs")._children = [tabStub("DK", true), tabStub("FD", false)];
  getEl("sportTabs")._children = [tabStub("NFL", true), tabStub("NBA", false)];
  getEl("modeTabs")._children = [tabStub("cash", true), tabStub("gpp", false)];
  ["js/dfs-opt.js","js/dfs.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
  });
  return { sb: sandbox, els: els };
}

var ctx = makeContext(), DI = ctx.sb.GIU.dfsImport;
assert(DI && typeof DI.importSiteId === "function", "importSiteId exposed on the dfsImport seam");
assert(typeof DI.uploadCell === "function" && typeof DI.buildExportCSV === "function",
       "uploadCell + buildExportCSV exposed on the dfsImport seam");

/* ---- DraftKings: dedicated "ID" column ---- */
var DK_HEAD = ["Position","Name + ID","Name","ID","Roster Position","Salary","Game Info","TeamAbbrev","AvgPointsPerGame"];
var dkMap = DI.autoMap(DK_HEAD);
assert(DK_HEAD[dkMap.siteId] === "ID", "DK: ID column auto-mapped for siteId (got '"+DK_HEAD[dkMap.siteId]+"')");
assert(DK_HEAD[dkMap.nameIdCol] === "Name + ID", "DK: Name + ID recorded as the suffix fallback");
var DK_CSV = DK_HEAD.join(",")+"\n"+
  'QB,"Jalen Hurts (81234)",Jalen Hurts,81234,QB,7800,PHI@CHI 09/28/2026 08:15PM ET,PHI,22.4\n'+
  'WR,"A.J. Brown (81235)",A.J. Brown,81235,WR,7200,PHI@CHI 09/28/2026 08:15PM ET,PHI,16.1\n';
var rows = DI.parseCSV(DK_CSV);
var map = DI.autoMap(rows[0]); map.proj = map.avg;
DI.importIntoPool(rows.slice(1), rows[0], map);
var pool = DI.pool();
function byName(n){ return pool.filter(function(p){ return p.name === n; })[0]; }
assert(byName("Jalen Hurts").siteId === "81234", "DK: Hurts siteId captured from the ID column");
assert(byName("A.J. Brown").siteId === "81235", "DK: Brown siteId captured from the ID column");

/* ---- DraftKings: no "ID" column -> "(ID)" suffix fallback ---- */
var DK2_HEAD = ["Position","Name + ID","Name","Roster Position","Salary","Game Info","TeamAbbrev","AvgPointsPerGame"];
var dk2Map = DI.autoMap(DK2_HEAD);
assert(dk2Map.siteId === -1, "DK without an ID column: siteId unmapped (no guessing)");
assert(DK2_HEAD[dk2Map.nameIdCol] === "Name + ID", "DK without an ID column: Name + ID kept as fallback");
var DK2_CSV = DK2_HEAD.join(",")+"\n"+
  'QB,"Jalen Hurts (81234)",Jalen Hurts,QB,7800,PHI@CHI 09/28/2026 08:15PM ET,PHI,22.4\n';
var r2 = DI.parseCSV(DK2_CSV);
var m2 = DI.autoMap(r2[0]); m2.proj = m2.avg;
DI.importIntoPool(r2.slice(1), r2[0], m2);
assert(pool[pool.length-1].siteId === "81234", "DK: ID parsed from the Name + ID suffix when no ID column exists");

/* ---- DraftKings: no ID source at all -> blank, never invented ---- */
var DK3_HEAD = ["Position","Name","Roster Position","Salary","Game Info","TeamAbbrev","AvgPointsPerGame"];
var DK3_CSV = DK3_HEAD.join(",")+"\n"+
  'QB,Jalen Hurts,QB,7800,PHI@CHI 09/28/2026 08:15PM ET,PHI,22.4\n';
var r3 = DI.parseCSV(DK3_CSV);
var m3 = DI.autoMap(r3[0]); m3.proj = m3.avg;
var poolLenBefore = pool.length;
DI.importIntoPool(r3.slice(1), r3[0], m3);
assert(pool.length === poolLenBefore + 1, "sanity: the no-ID DK row imported");
assert(pool[pool.length-1].siteId === "", "DK with no ID source: siteId stays blank, never invented");

/* ---- FanDuel: "Id" column kept verbatim ---- */
var FD_HEAD = ["Id","Position","First Name","Last Name","FPPG","Played","Salary","Game","Team","Opponent","Injury Indicator","Tier","Roster Position"];
var fdMap = DI.autoMap(FD_HEAD);
assert(FD_HEAD[fdMap.siteId] === "Id", "FD: Id column auto-mapped for siteId (got '"+FD_HEAD[fdMap.siteId]+"')");
assert(fdMap.dk === false, "FD headers are not DK-detected");
var FD_CSV = FD_HEAD.join(",")+"\n"+
  '133104-12345,QB,Jalen,Hurts,22.4,3,7800,PHI@CHI,PHI,CHI,,,QB\n';
var rf = DI.parseCSV(FD_CSV);
var mf = DI.autoMap(rf[0]); mf.proj = rf[0].indexOf("FPPG"); /* FD exports carry FPPG, not a Proj column */
DI.importIntoPool(rf.slice(1), rf[0], mf);
var fred = pool[pool.length-1];
assert(fred.siteId === "133104-12345", "FD: siteId kept verbatim incl. dashes (got '"+fred.siteId+"')");
assert(fred.name === "Jalen Hurts", "FD: First+Last name still recombined");

/* ---- generic CSV: exact "ID" column mapped, absent -> blank ---- */
var G_HEAD = ["Name","Team","Salary","ID"];
var gMap = DI.autoMap(G_HEAD);
assert(G_HEAD[gMap.siteId] === "ID", "generic: exact ID column mapped");
var G2_HEAD = ["Name","Team","Salary"];
assert(DI.autoMap(G2_HEAD).siteId === -1, "generic without an ID column: siteId unmapped");

/* ---- uploadCell shapes ---- */
assert(DI.uploadCell({name:"Jalen Hurts", siteId:"81234"}, "DK") === '"Jalen Hurts (81234)"',
       "DK cell: quoted Name (ID)");
assert(DI.uploadCell({name:"Jalen Hurts", siteId:""}, "DK") === '"Jalen Hurts"',
       "DK cell without an ID: bare quoted name, never invented");
assert(DI.uploadCell({name:"Jalen Hurts", siteId:"133104-12345"}, "FD") === '"133104-12345"',
       "FD cell: quoted site player ID");
assert(DI.uploadCell({name:"Jalen Hurts", siteId:""}, "FD") === '"Jalen Hurts"',
       "FD cell without an ID: bare quoted name");
assert(DI.uploadCell({name:'De\'Andre "Nuk" Hopkins', siteId:"81234"}, "DK") === '"De\'Andre ""Nuk"" Hopkins (81234)"',
       "DK cell: embedded quotes CSV-escaped");

/* ---- buildExportCSV on the DK tab (default config) ---- */
function fakeLineup(names, ids, cfg){
  return cfg.slots.map(function(slot, i){
    return { slot: slot, player: { name: names[i], siteId: ids[i], salary: 6000, proj: 15, floor: 8, ceil: 25 } };
  });
}
var DK_NAMES = ["Jalen Hurts","Saquon Barkley","Jahmyr Gibbs","A.J. Brown","Amon-Ra St. Brown","CeeDee Lamb","Sam LaPorta","DeVonta Smith","Eagles"];
var DK_IDS   = ["81234","81235","81236","81237","81238","81239","81240","81241","81242"];
var DK_NAMES2 = ["Josh Allen","James Cook","David Montgomery","Justin Jefferson","Ja'Marr Chase","Tyreek Hill","T.J. Hockenson","Keenan Allen","Bills"];
var csv = DI.buildExportCSV({ lineups: [
  fakeLineup(DK_NAMES, DK_IDS, {slots:["QB","RB","RB","WR","WR","WR","TE","FLEX","DST"]}),
  fakeLineup(DK_NAMES2, DK_IDS, {slots:["QB","RB","RB","WR","WR","WR","TE","FLEX","DST"]})
]});
var lines = csv.split("\n");
assert(lines.length === 3, "export: header + 2 lineup rows");
assert(lines[0] === "QB,RB,RB,WR,WR,WR,TE,FLEX,DST", "export: DK position header row");
assert(lines[1] === DK_NAMES.map(function(n,i){ return '"'+n+' ('+DK_IDS[i]+')"'; }).join(","),
       "export: DK row writes Name (ID) cells");
assert(lines[2].indexOf('"Ja\'Marr Chase (81238)"') !== -1, "export: apostrophes pass through unescaped");

/* ---- buildExportCSV after switching to the FD tab ---- */
ctx.els.siteTabs._children[1]._fire("click");
var fcsv = DI.buildExportCSV({ lineups: [
  fakeLineup(["Jalen Hurts","Saquon Barkley","Jahmyr Gibbs","A.J. Brown","Amon-Ra St. Brown","CeeDee Lamb","Sam LaPorta","DeVonta Smith","Eagles"],
             ["133104-1","133104-2","133104-3","133104-4","133104-5","133104-6","133104-7","133104-8","133104-9"],
             {slots:["QB","RB","RB","WR","WR","WR","TE","FLEX","DEF"]})
]});
var flines = fcsv.split("\n");
assert(flines[0] === "QB,RB,RB,WR,WR,WR,TE,FLEX,DEF", "export: FD position header row (DEF, not DST)");
assert(flines[1] === ["133104-1","133104-2","133104-3","133104-4","133104-5","133104-6","133104-7","133104-8","133104-9"]
       .map(function(id){ return '"'+id+'"'; }).join(","),
       "export: FD row writes quoted player-ID cells");

console.log(failures ? "\n"+failures+" FAILURES" : "\nALL DFS EXPORT TESTS PASSED");
process.exit(failures ? 1 : 0);
