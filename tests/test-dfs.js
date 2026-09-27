/* Node tests for js/dfs-opt.js — run: node tests/test-dfs.js */
var D = require("../js/dfs-opt.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra||""); }
  else console.log("ok  ", name);
}
function P(id,name,pos,team,opp,salary,proj){
  return { id:id, name:name, pos:pos, team:team, opp:opp, salary:salary,
           proj:proj, floor:Math.round(proj*0.55*10)/10, ceil:Math.round(proj*1.6*10)/10, own:5+(id%20) };
}
/* ---- NFL pool ---- */
var nfl = [], nid = 1;
var teams = [["KC","BUF"],["BUF","KC"],["PHI","DAL"],["DAL","PHI"],["SF","SEA"],["DET","GB"]];
var qbs = ["Mahomes","Allen","Hurts","Prescott","Purdy","Goff"];
qbs.forEach(function(n,i){ nfl.push(P(nid++, n, ["QB"], teams[i][0], teams[i][1], 7800-i*300, 22-i)); });
var rbs = [["McCaffrey","SF"],["Gibbs","DET"],["Barkley","PHI"],["Cook","BUF"],["Pacheco","KC"],["Montgomery","DET"],["Walker","SEA"],["Elliott","DAL"]];
rbs.forEach(function(r,i){ nfl.push(P(nid++, r[0], ["RB"], r[1], "OPP", 8200-i*350, 17-i*0.6)); });
var wrs = [["Hill","MIA"],["Lamb","DAL"],["Brown","PHI"],["Chase","CIN"],["Jefferson","MIN"],["Evans","TB"],["Metcalf","SEA"],["Adams","LV"],["Diggs","HOU"],["Wilson","NYJ"],["Nacua","LAR"],["Stafford2","KC"]];
wrs.forEach(function(r,i){ nfl.push(P(nid++, r[0], ["WR"], r[1], "OPP", 7900-i*320, 15-i*0.5)); });
/* same-team mates for stacks */
nfl.push(P(nid++, "Kelce", ["TE"], "KC", "BUF", 6500, 13));
nfl.push(P(nid++, "Rice", ["WR"], "KC", "BUF", 7000, 14));
nfl.push(P(nid++, "Kincaid", ["TE"], "BUF", "KC", 5200, 10.5));
nfl.push(P(nid++, "Shakir", ["WR"], "BUF", "KC", 5800, 11));
[["Smith","WR","PHI"],["Goedert","TE","PHI"],["Ferguson","TE","DAL"],["Cooks","WR","DAL"],
 ["Kittle","TE","SF"],["Jennings","WR","SF"],["St. Brown","WR","DET"],["Williams","WR","DET"]
].forEach(function(r,i){ nfl.push(P(nid++, r[0], [r[1]], r[2], "OPP", 6200-i*250, 12-i*0.4)); });
[["Kelce","KC"],["Kincaid","BUF"],["LaPorta","DET"],["Andrews","BAL"]].forEach(function(r,i){ nfl.push(P(nid++, r[0], ["TE"], r[1], "OPP", 6000-i*400, 11-i*0.5)); });
[["SF","SEA"],["DET","GB"],["BAL","CIN"],["KC","BUF"]].forEach(function(r,i){ nfl.push({id:nid++, name:r[0]+" DST", pos:["DST"], team:r[0], opp:r[1], salary:3200-i*200, proj:8-i*0.5, floor:4, ceil:16, own:8}); });
/* ---- NBA pool ---- */
var nba = [], bid = 100;
[["PG",6],["SG",6],["SF",6],["PF",6],["C",4]].forEach(function(cfg){
  for(var i=0;i<cfg[1];i++){
    var pos = [cfg[0]];
    if(i===0 && (cfg[0]==="PG"||cfg[0]==="SF")) pos.push(cfg[0]==="PG"?"SG":"PF"); /* multi-pos */
    nba.push(P(bid++, cfg[0]+i+" Star", pos, "T"+cfg[0], "OPP", 7500-i*900, 38-i*2));
  }
});

function checkValid(name, res, cfgKey, mode){
  var cfg = D.CONFIGS[cfgKey];
  var allOk = res.lineups.length>0 && res.lineups.every(function(lu){ return D.validate(lu,cfg).ok; });
  ok(name+" all lineups valid ("+res.lineups.length+")", allOk,
     JSON.stringify(res.lineups.map(function(lu){return D.validate(lu,cfg).errors;})));
  return allOk;
}
/* 1 — DK NFL cash x3 */
var r1 = D.generate("DK_NFL", nfl, "cash", {numLineups:3});
checkValid("DK_NFL cash", r1, "DK_NFL", "cash");
ok("cash got 3 lineups", r1.lineups.length===3, r1.lineups.length);
/* uniqueness >=2 pairwise */
var uok = true;
for(var i=0;i<r1.lineups.length;i++) for(var j=i+1;j<r1.lineups.length;j++){
  var sa={}; r1.lineups[i].forEach(function(e){sa[e.player.id]=1;});
  var d=0; r1.lineups[j].forEach(function(e){ if(!sa[e.player.id]) d++; });
  if(d<2) uok=false;
}
ok("cash uniqueness >=2", uok);
/* salary reality */
ok("cash under cap", r1.lineups.every(function(lu){ return D.salary(lu)<=50000; }));
/* 2 — DK NFL GPP x10 with stacks, exposure, uniqueness */
var r2 = D.generate("DK_NFL", nfl, "gpp", {numLineups:10, maxExposure:0.6, minUnique:3});
checkValid("DK_NFL gpp", r2, "DK_NFL", "gpp");
ok("gpp got 10 lineups", r2.lineups.length===10, r2.lineups.length);
ok("gpp all stacked", r2.lineups.every(function(lu){ return D.hasStack(lu); }));
var expOk = Object.keys(r2.exposures).every(function(id){ return r2.exposures[id]/10 <= 0.6+1e-9; });
ok("gpp exposure <=60%", expOk, JSON.stringify(r2.exposures));
var uok2 = true;
for(var a=0;a<r2.lineups.length;a++) for(var b=a+1;b<r2.lineups.length;b++){
  var s2={}; r2.lineups[a].forEach(function(e){s2[e.player.id]=1;});
  var dd=0; r2.lineups[b].forEach(function(e){ if(!s2[e.player.id]) dd++; });
  if(dd<3) uok2=false;
}
ok("gpp uniqueness >=3", uok2);
/* 3 — FD NBA GPP x5 */
var r3 = D.generate("FD_NBA", nba, "gpp", {numLineups:5});
checkValid("FD_NBA gpp", r3, "FD_NBA", "gpp");
ok("FD NBA got 5", r3.lineups.length===5, r3.lineups.length);
ok("FD NBA under 60k cap", r3.lineups.every(function(lu){ return D.salary(lu)<=60000; }));
/* 4 — validator catches violations */
var cfg = D.CONFIGS.DK_NFL;
var dupLu = [{slot:"QB",player:nfl[0]},{slot:"RB",player:nfl[6]},{slot:"RB",player:nfl[6]},
  {slot:"WR",player:nfl[14]},{slot:"WR",player:nfl[15]},{slot:"WR",player:nfl[16]},
  {slot:"TE",player:nfl[26]},{slot:"FLEX",player:nfl[17]},{slot:"DST",player:nfl[30]}];
ok("validator flags duplicates", !D.validate(dupLu,cfg).ok);
var overLu = r1.lineups[0].map(function(e){ return {slot:e.slot, player:Object.assign({}, e.player, {salary:60000})}; });
ok("validator flags over-cap", !D.validate(overLu,cfg).ok);
var badPos = r1.lineups[0].map(function(e,i){ return i===0?{slot:"QB",player:nfl[6]}:e; });
ok("validator flags ineligible slot", !D.validate(badPos,cfg).ok);
/* 5 — insights are data-driven strings */
var ins = D.insights(r2.lineups[0], nfl, "gpp", "DK_NFL");
ok("gpp insights non-empty", ins.length>=3, JSON.stringify(ins));
ok("insights mention stack", ins.some(function(s){return /Stack:/.test(s);}));
var insC = D.insights(r1.lineups[0], nfl, "cash", "DK_NFL");
ok("cash insights mention safety", insC.some(function(s){return /Cash safety/.test(s);}));


/* ---- buildDemoSlate (shared demo builder) ---- */
var demoDK = D.buildDemoSlate(D.CONFIGS.DK_NFL);
ok("demo: 54 NFL players", demoDK.length===54);
ok("demo: all flagged demo", demoDK.every(function(p){ return p.demo===1; }));
ok("demo: has all positions", ["QB","RB","WR","TE","DST"].every(function(pos){
  return demoDK.some(function(p){ return p.pos[0]===pos; });
}));
ok("demo: KC has a QB (stacks work)", demoDK.some(function(p){ return p.team==="KC" && p.pos[0]==="QB"; }));
var demoFD = D.buildDemoSlate(D.CONFIGS.FD_NFL);
ok("demo: FanDuel uses DEF slot", demoFD.some(function(p){ return p.pos[0]==="DEF"; }) &&
   !demoFD.some(function(p){ return p.pos[0]==="DST"; }));
var demoNBA = D.buildDemoSlate(D.CONFIGS.DK_NBA);
ok("demo: 40 NBA players", demoNBA.length===40);
ok("demo: ids unique", (function(){ var s={}; return demoDK.every(function(p){ if(s[p.id]) return false; s[p.id]=1; return true; }); })());

/* ---- regression: 3 GPP lineups with a KC stack on the demo slate ----
   (2026-09-27: the coach returned zero lineups here — locked stack players were
   not exempt from the exposure cap, and the maxed-player filter disagreed with
   the acceptance check, so greedy burned all its attempts) */
function demoStackLocks(pool, team){
  var qb = pool.filter(function(p){ return p.team===team && p.pos[0]==="QB"; })
    .sort(function(a,b){ return b.ceil-a.ceil; })[0];
  var mates = pool.filter(function(p){
    return p.id!==qb.id && p.team===team && ["RB","WR","TE"].indexOf(p.pos[0])!==-1;
  }).sort(function(a,b){ return b.ceil-a.ceil; }).slice(0,2);
  return [qb].concat(mates).map(function(p){ return p.id; });
}
var demoLocks = demoStackLocks(demoDK, "KC");
var rStack = D.generate("DK_NFL", demoDK, "gpp", { numLineups:3, maxExposure:0.6, locked:demoLocks });
ok("stack: 3 GPP lineups built on demo slate", rStack.lineups.length===3, "got "+rStack.lineups.length);
ok("stack: all lineups valid", rStack.lineups.every(function(lu){ return D.validate(lu, D.CONFIGS.DK_NFL).ok; }));
ok("stack: every lineup has the KC stack", rStack.lineups.every(function(lu){ return D.hasStack(lu); }));
ok("stack: locked QB in every lineup", rStack.lineups.every(function(lu){
  return lu.some(function(e){ return e.player.id===demoLocks[0]; });
}));
/* locks ignore the exposure cap — a lock in 3/3 lineups must not be rejected */
var rLock = D.generate("DK_NFL", demoDK, "gpp", { numLineups:3, maxExposure:0.6, locked:[demoLocks[0]] });
ok("locks exempt from exposure cap", rLock.lineups.length===3, "got "+rLock.lineups.length);
/* small lineup counts: the maxed filter must agree with the acceptance rule */
var rSmall = D.generate("DK_NFL", demoDK, "gpp", { numLineups:3, maxExposure:0.6 });
ok("small count: 3 lineups without locks", rSmall.lineups.length===3, "got "+rSmall.lineups.length);
/* impossible cap: relaxed openly instead of returning nothing */
var rCap = D.generate("DK_NFL", demoDK, "gpp", { numLineups:3, maxExposure:0.2 });
ok("impossible cap: flagged as relaxed", rCap.capRelaxed===true);
ok("impossible cap: lineups still produced", rCap.lineups.length===3, "got "+rCap.lineups.length);

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL DFS TESTS PASSED");
process.exit(fails ? 1 : 0);
