/* Verifies first-class DraftKings / FanDuel salary-CSV import in the DFS Lab
   (js/dfs.js, v1.74.0). Loads the real dfs-opt.js + dfs.js in a vm sandbox
   with stubbed DOM/localStorage, then asserts:
   - DraftKings headers are detected; the clean "Name" column wins over
     "Name + ID"; "TeamAbbrev" maps to Team; "Game Info" is recorded;
   - FanDuel headers are detected; "Team" and "Opponent" map; First+Last
     name columns are recombined;
   - dkCleanName strips the "(12345)" ID suffix; dkGameOpp derives the
     opponent from "AWAY@HOME ..." game strings (and refuses to guess);
   - a full importIntoPool run on real DK headers lands players with the
     right team, derived opponent, clean name, salary and projection —
     so GPP stacking and the ESPN injury cross-check get real teams;
   - a Name+ID-only export still gets its ID suffix stripped;
   - generic CSVs are untouched by the format smarts (no false DK detect).
   Run: node tests/test-dfs-dkimport.js */
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
  ["js/dfs-opt.js","js/dfs.js"].forEach(function(f){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
  });
  return sandbox;
}

var sb = makeContext();
var DI = sb.GIU.dfsImport;
assert(DI && typeof DI.autoMap === "function", "dfsImport test seam is exposed on GIU");

/* ---- real DraftKings NFL salary-export headers ---- */
var DK_HEAD = ["Position","Name + ID","Name","ID","Roster Position","Salary","Game Info","TeamAbbrev","AvgPointsPerGame"];
var DK_CSV = DK_HEAD.join(",")+"\n"+
  'QB,"Jalen Hurts (81234)",Jalen Hurts,81234,QB,7800,PHI@CHI 09/28/2026 08:15PM ET,PHI,22.4\n'+
  'WR,"A.J. Brown (81235)",A.J. Brown,81235,WR,7200,PHI@CHI 09/28/2026 08:15PM ET,PHI,16.1\n'+
  'QB,"Caleb Williams (89999)",Caleb Williams,89999,QB,7400,PHI@CHI 09/28/2026 08:15PM ET,CHI,21.0\n';

assert(DI.isDK(DK_HEAD) === true, "isDK detects DraftKings headers");
assert(DI.isDK(["Name","Team","Salary"]) === false, "isDK does not fire on generic headers");
assert(DI.isDK(["Id","Position","First Name","Last Name","FPPG","Played","Salary","Game","Team","Opponent"]) === false,
       "isDK does not fire on FanDuel headers");

var dm = DI.autoMap(DK_HEAD);
assert(dm.dk === true, "autoMap flags the DK format");
assert(DK_HEAD[dm.name] === "Name", "DK: clean Name column preferred over Name + ID (got '"+DK_HEAD[dm.name]+"')");
assert(DK_HEAD[dm.team] === "TeamAbbrev", "DK: TeamAbbrev mapped to Team (got '"+DK_HEAD[dm.team]+"')");
assert(DK_HEAD[dm.pos] === "Position", "DK: Position mapped");
assert(DK_HEAD[dm.salary] === "Salary", "DK: Salary mapped");
assert(DK_HEAD[dm.avg] === "AvgPointsPerGame", "DK: AvgPointsPerGame mapped as projection fallback");
assert(dm.opp === -1, "DK: no Opp column mapped (derived from Game Info instead)");
assert(dm.gameInfo !== -1 && DK_HEAD[dm.gameInfo] === "Game Info", "DK: Game Info column recorded");

assert(DI.dkCleanName("Jalen Hurts (81234)") === "Jalen Hurts", "dkCleanName strips the ID suffix");
assert(DI.dkCleanName("A.J. Brown") === "A.J. Brown", "dkCleanName leaves clean names alone");
assert(DI.dkGameOpp("PHI@CHI 09/28/2026 08:15PM ET", "PHI") === "CHI", "dkGameOpp: PHI's opponent is CHI");
assert(DI.dkGameOpp("PHI@CHI 09/28/2026 08:15PM ET", "CHI") === "PHI", "dkGameOpp: CHI's opponent is PHI");
assert(DI.dkGameOpp("PHI@CHI 09/28/2026 08:15PM ET", "phi") === "CHI", "dkGameOpp: team match is case-insensitive");
assert(DI.dkGameOpp("PHI@CHI 09/28/2026 08:15PM ET", "DAL") === "", "dkGameOpp: team not in the game -> blank, never guessed");
assert(DI.dkGameOpp("TBD", "PHI") === "", "dkGameOpp: unparseable game string -> blank");

/* ---- full DK import run ---- */
var rows = DI.parseCSV(DK_CSV);
assert(rows.length === 4, "parseCSV finds the DK header + 3 data rows");
var head = rows[0], data = rows.slice(1);
var map = DI.autoMap(head);
map.proj = map.avg; /* the doImport avg fallback */
var added = DI.importIntoPool(data, head, map);
assert(added === 3, "importIntoPool adds all 3 DK rows");
var pool = DI.pool();
function byName(n){ return pool.filter(function(p){ return p.name === n; })[0]; }
var hurts = byName("Jalen Hurts");
assert(!!hurts, "Hurts imported under his clean name (no ID suffix)");
assert(hurts.team === "PHI", "Hurts team is PHI from TeamAbbrev (was 'FA' before v1.74.0)");
assert(hurts.opp === "CHI", "Hurts opponent CHI derived from Game Info");
assert(hurts.salary === 7800 && hurts.proj === 22.4, "Hurts salary/projection land correctly");
assert(hurts.pos[0] === "QB", "Hurts position parsed");
var brown = byName("A.J. Brown");
assert(brown && brown.team === "PHI" && brown.opp === "CHI", "Brown team/opp correct");
var caleb = byName("Caleb Williams");
assert(caleb && caleb.team === "CHI" && caleb.opp === "PHI", "Williams team CHI, opponent PHI");
assert(pool.every(function(p){ return p.team !== "FA"; }), "no DK player lands on team FA — stacks and injury matching get real teams");

/* ---- Name+ID-only export (no clean Name column) ---- */
var dk2head = ["Position","Name + ID","Roster Position","Salary","Game Info","TeamAbbrev","AvgPointsPerGame"];
var dm2 = DI.autoMap(dk2head);
assert(dk2head[dm2.name] === "Name + ID", "falls back to Name + ID when no clean Name column exists");
var rows2 = DI.parseCSV(dk2head.join(",")+'\nQB,"Jalen Hurts (81234)",QB,7800,PHI@CHI 09/28/2026 08:15PM ET,PHI,22.4\n');
var map2 = DI.autoMap(rows2[0]); map2.proj = map2.avg;
var before = DI.pool().length;
DI.importIntoPool(rows2.slice(1), rows2[0], map2);
var hurts2 = DI.pool().filter(function(p){ return p.name === "Jalen Hurts"; });
assert(hurts2.length >= 1 && DI.pool()[DI.pool().length-1].name === "Jalen Hurts",
       "Name + ID column gets its ID suffix stripped at import");

/* ---- real FanDuel salary-export headers ---- */
var FD_HEAD = ["Id","Position","First Name","Last Name","FPPG","Played","Salary","Game","Team","Opponent","Injury Indicator","Injury Details"];
var FD_CSV = FD_HEAD.join(",")+"\n"+
  "12345,QB,Jalen,Hurts,22.4,3,7800,PHI@CHI,PHI,CHI,,\n"+
  "12346,WR,A.J.,Brown,16.1,3,7200,PHI@CHI,PHI,CHI,,\n";
assert(DI.isDK(FD_HEAD) === false, "isDK does not fire on FanDuel headers");
var fm = DI.autoMap(FD_HEAD);
assert(fm.dk === false, "autoMap does not flag FD as DK");
assert(FD_HEAD[fm.team] === "Team", "FD: Team mapped");
assert(FD_HEAD[fm.opp] === "Opponent", "FD: Opponent mapped to Opp");
assert(fm.fdNames && FD_HEAD[fm.fdNames[0]] === "First Name" && FD_HEAD[fm.fdNames[1]] === "Last Name",
       "FD: First/Last name columns detected");
assert(DI.fdNameCols(["Name","Team","Salary"]) === null, "fdNameCols null without the FD pair");
var frows = DI.parseCSV(FD_CSV);
var fmap = DI.autoMap(frows[0]); fmap.proj = 4; /* FPPG column */
var fbefore = DI.pool().length;
var fadded = DI.importIntoPool(frows.slice(1), frows[0], fmap);
assert(fadded === 2, "FD import adds both rows");
var fj = DI.pool()[fbefore], fb = DI.pool()[fbefore+1];
assert(fj.name === "Jalen Hurts" && fj.team === "PHI" && fj.opp === "CHI" && fj.proj === 22.4,
       "FD: full name recombined, team PHI, opponent CHI, projection from FPPG");
assert(fb.name === "A.J. Brown", "FD: second name recombined");

/* ---- generic CSV: no format smarts fire ---- */
var gm = DI.autoMap(["Name","Team","Pos","Salary","Projection"]);
assert(gm.dk === false && gm.fdNames === null && gm.gameInfo === -1,
       "generic headers: no DK/FD detection, no Game Info");
assert(gm.team !== -1, "generic CSV still maps an exact Team header");

console.log(failures === 0 ? "\nALL PASSED" : "\n"+failures+" FAILURES");
process.exit(failures === 0 ? 0 : 1);
