/* Node tests for the DFS GPP game-stack bring-back (js/dfs-opt.js) —
   run: node tests/test-dfs-bringback.js
   Covers: seatBringBack (opponent-team pick, exposure-aware, seating), openSlotIndices,
   generate({bringBack:true}) end-to-end on NFL GPP, opp-missing and opponent-less
   pool error paths, and that cash/NBA ignore the flag. */
"use strict";
var D = require("../js/dfs-opt.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
function P(id,name,pos,team,opp,salary,proj,ceil){
  return { id:id, name:name, pos:pos, team:team, opp:opp, salary:salary, proj:proj,
           floor:Math.round(proj*0.55*10)/10, ceil:ceil==null?Math.round(proj*1.6*10)/10:ceil,
           own:5+(id%20) };
}
/* ---- small NFL pool with real opponents ---- */
var pool = [], pid = 1;
/* KC vs BUF game */
pool.push(P(pid++, "Mahomes", ["QB"], "KC", "BUF", 7800, 22));
pool.push(P(pid++, "Allen",   ["QB"], "BUF","KC",  7700, 21.5));
[["Kelce","TE","KC","BUF",6500,13],["Rice","WR","KC","BUF",7000,14],
 ["Pacheco","RB","KC","BUF",6800,15],["Worthy","WR","KC","BUF",5900,11],
 ["Kincaid","TE","BUF","KC",5200,10.5],["Shakir","WR","BUF","KC",5800,11],
 ["Cook","RB","BUF","KC",7300,16],["Coleman","WR","BUF","KC",5400,9.5]
].forEach(function(r){ pool.push(P(pid++, r[0], [r[1]], r[2], r[3], r[4], r[5])); });
/* PHI vs DAL game */
pool.push(P(pid++, "Hurts", ["QB"], "PHI", "DAL", 7600, 21));
[["Barkley","RB","PHI","DAL",8200,17],["Brown","WR","PHI","DAL",7900,15],
 ["Goedert","TE","PHI","DAL",5600,10],["Lamb","WR","DAL","PHI",8100,16],
 ["Ferguson","TE","DAL","PHI",5500,10.5],["Pickens","WR","DAL","PHI",6200,11]
].forEach(function(r){ pool.push(P(pid++, r[0], [r[1]], r[2], r[3], r[4], r[5])); });
/* cheap filler so 9-man rosters always fit under the 50k cap, even with a
   4-lock stack + bring-back */
[["SF","SEA"],["DET","GB"],["BAL","CIN"]].forEach(function(t,i){
  pool.push(P(pid++, t[0]+" WR3", ["WR"], t[0], t[1], 4200-i*200, 9));
  pool.push(P(pid++, t[0]+" RB2", ["RB"], t[0], t[1], 4500-i*200, 9.5));
  pool.push(P(pid++, t[0]+" TE2", ["TE"], t[0], t[1], 3100, 7));
  pool.push({id:pid++, name:t[0]+" DST", pos:["DST"], team:t[0], opp:t[1],
             salary:2600, proj:7, floor:3, ceil:14, own:6});
});
var cfg = D.CONFIGS.DK_NFL;
function byName(n){ return pool.filter(function(p){ return p.name===n; })[0]; }

/* ---------- seatBringBack unit tests ---------- */
var mahomes = byName("Mahomes");
var locked3 = [{slot:"QB",player:mahomes},{slot:"TE",player:byName("Kelce")},{slot:"WR",player:byName("Rice")}];
var bb = D.seatBringBack(cfg, locked3, pool, mahomes, {});
ok("seats an opposing-team pass catcher", !!bb && bb.player.team==="BUF",
   bb && (bb.player.team+" "+bb.player.name));
ok("bring-back slot is eligible for the player",
   !!bb && D.eligible(bb.player, bb.slot, cfg), bb && bb.slot);
ok("bring-back is RB/WR/TE", !!bb && bb.player.pos.some(function(x){return ["RB","WR","TE"].indexOf(x)!==-1;}));
ok("bring-back is not already locked", !!bb && !locked3.some(function(e){return e.player.id===bb.player.id;}));

/* exposure-aware: the least-exposed opponent wins */
var shakir = byName("Shakir"), coleman = byName("Coleman");
var exp = {}; exp[shakir.id]=5; /* Shakir heavily exposed */
var bb2 = D.seatBringBack(cfg, locked3, pool, mahomes, exp);
ok("exposure-aware bring-back pick", !!bb2 && bb2.player.id!==shakir.id, bb2 && bb2.player.name);

/* QB with no opponent info -> null, never invented */
var noOpp = P(999, "NoOpp QB", ["QB"], "KC", null, 7000, 20);
ok("null when the QB has no opponent", D.seatBringBack(cfg, locked3, pool, noOpp, {})===null);
ok("null when qb is missing", D.seatBringBack(cfg, locked3, pool, null, {})===null);

/* no seatable opponent pass catcher -> null (opponent has only a QB) */
var thin = [mahomes, byName("Kelce"), byName("Rice"), P(998,"Allen2",["QB"],"BUF","KC",7000,20)];
ok("null when the opponent has no pass catchers",
   D.seatBringBack(cfg, locked3, thin, mahomes, {})===null);

/* ---------- openSlotIndices ---------- */
var idxs = D.openSlotIndices(cfg, [{slot:"RB",player:byName("Cook")},{slot:"RB",player:byName("Pacheco")}]);
ok("consumes exactly the locked occurrences", idxs.length===cfg.slots.length-2, idxs.length);
var remaining = idxs.map(function(i){ return cfg.slots[i]; });
var rbLeft = remaining.filter(function(s){ return s==="RB"; }).length;
ok("RB occurrences reduced by 2", rbLeft===0, rbLeft);
ok("indices are ascending", idxs.every(function(v,i,a){ return i===0||a[i-1]<v; }));

/* ---------- generate() end-to-end, NFL GPP ---------- */
function hasBringBack(lu){
  var qb = lu.filter(function(e){ return e.slot==="QB"; })[0];
  if(!qb) return false;
  return lu.some(function(e){
    return e.player.id!==qb.player.id && e.player.team===qb.player.opp &&
           e.player.pos.some(function(x){ return ["RB","WR","TE"].indexOf(x)!==-1; });
  });
}
var r = D.generate("DK_NFL", pool, "gpp", {numLineups:6, bringBack:true});
ok("bringBack:true produces lineups", r.lineups.length>0, r.lineups.length);
ok("every lineup has a bring-back", r.lineups.every(hasBringBack));
ok("every lineup still has the QB stack",
   r.lineups.every(function(lu){ return D.hasStack(lu); }));
ok("all bring-back lineups validate",
   r.lineups.every(function(lu){ return D.validate(lu,cfg).ok; }),
   JSON.stringify(r.lineups.map(function(lu){ return D.validate(lu,cfg).errors; })));
ok("bring-back insights fire for a stacked lineup",
   D.insights(r.lineups[0], pool, "gpp", "DK_NFL").some(function(s){ return /Bring-back/.test(s); }));

/* user-locked QB: the bring-back follows THEIR QB's opponent */
var rLock = D.generate("DK_NFL", pool, "gpp",
  {numLineups:3, bringBack:true, locked:[byName("Hurts").id]});
ok("locked-QB lineups generate", rLock.lineups.length>0, rLock.lineups.length);
ok("bring-back follows the locked QB's opponent (DAL)",
   rLock.lineups.every(function(lu){
     return lu.some(function(e){ return e.player.team==="DAL" &&
       e.player.pos.some(function(x){ return ["RB","WR","TE"].indexOf(x)!==-1; }); });
   }));

/* ---------- error paths ---------- */
var noOppPool = pool.map(function(p){
  var q = {}; for(var k in p) q[k]=p[k]; q.opp=null; return q;
});
var rNoOpp = D.generate("DK_NFL", noOppPool, "gpp", {numLineups:3, bringBack:true});
ok("opp-less pool gets an actionable error, not silent empties",
   !!rNoOpp.error && /opponent/i.test(rNoOpp.error), rNoOpp.error);

var noOppPlayers = pool.filter(function(p){ return p.team!=="BUF" && p.team!=="DAL"; });
var rNoOppPlayers = D.generate("DK_NFL", noOppPlayers, "gpp", {numLineups:3, bringBack:true});
ok("pool with no opponent pass-catchers errors honestly",
   !!rNoOppPlayers.error && /bring-back/i.test(rNoOppPlayers.error), rNoOppPlayers.error);

/* cap path: a bring-back seats, but the 4-lock stack breaks the salary cap —
   the error must say cap, not "no opponent pass-catchers" */
var thinPool = [];
thinPool.push(P(901,"Exp QB",["QB"],"KC","BUF",9000,22));
thinPool.push(P(902,"Exp RB1",["RB"],"KC","BUF",9000,17));
thinPool.push(P(903,"Exp WR1",["WR"],"KC","BUF",9000,16));
thinPool.push(P(905,"Exp TE1",["TE"],"KC","BUF",8000,10));
thinPool.push(P(904,"Opp WR1",["WR"],"BUF","KC",9000,15));
for(var ti=0;ti<6;ti++) thinPool.push(P(910+ti,"Exp F"+ti,["RB"],"KC","BUF",8000,14));
thinPool.push({id:920,name:"KC DST",pos:["DST"],team:"KC",opp:"BUF",
               salary:5000,proj:8,floor:4,ceil:14,own:5});
var rThin = D.generate("DK_NFL", thinPool, "gpp", {numLineups:3, bringBack:true});
ok("cap-broken bring-back errors about the cap, not opponents",
   !!rThin.error && /salary cap/i.test(rThin.error), rThin.error);

/* ---------- flag is NFL-GPP only ---------- */
var rCash = D.generate("DK_NFL", pool, "cash", {numLineups:2, bringBack:true});
ok("cash ignores the bring-back flag (valid lineups, no forced stack)",
   rCash.lineups.length===2 && rCash.lineups.every(function(lu){ return D.validate(lu,cfg).ok; }),
   rCash.lineups.length);
var nbaPool = [];
["PG","SG","SF","PF","C"].forEach(function(pos,pi){
  for(var i=0;i<8;i++) nbaPool.push(P(500+pi*10+i, pos+i+" Star", [pos], "T"+pos, "OPP", 7000-i*400, 34-i*2));
});
var rNba = D.generate("DK_NBA", nbaPool, "gpp", {numLineups:3, bringBack:true});
ok("NBA ignores the bring-back flag", rNba.lineups.length>0 && !rNba.error,
   rNba.lineups.length+" "+(rNba.error||""));

/* exports exist on both module and browser shapes */
ok("seatBringBack exported", typeof D.seatBringBack==="function");
ok("openSlotIndices exported", typeof D.openSlotIndices==="function");

/* ---------- shipped wiring pins ---------- */
var fs = require("fs"), path = require("path");
var dfsHtml = fs.readFileSync(path.join(__dirname, "../dfs.html"), "utf8");
ok("dfs.html pins js/dfs-opt.js?v=1.132.0",
   dfsHtml.indexOf("js/dfs-opt.js?v=1.132.0")!==-1);
ok("dfs.html carries the bring-back checkbox", /id="bringBack"/.test(dfsHtml));
ok("bring-back row hidden until NFL GPP is selected",
   /id="bringBackRow"[^>]*style="display:none"/.test(dfsHtml));
var coachHtml = fs.readFileSync(path.join(__dirname, "../ai-coach.html"), "utf8");
ok("ai-coach.html pins js/dfs-opt.js?v=1.132.0",
   coachHtml.indexOf("js/dfs-opt.js?v=1.132.0")!==-1);
var dfsJs = fs.readFileSync(path.join(__dirname, "../js/dfs.js"), "utf8");
ok("shipped dfs.js passes bringBack into OPT.generate",
   /bringBack:\s*bringBackOn/.test(dfsJs));
ok("shipped dfs.js toggles the bring-back row by mode+sport",
   dfsJs.indexOf("syncBringBackRow")!==-1);

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL DFS BRING-BACK TESTS PASSED");
process.exit(fails ? 1 : 0);
