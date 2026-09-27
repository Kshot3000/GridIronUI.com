/* Node tests for DFS lock/exclude — run: node tests/test-dfs-lockout.js
   Covers: js/dfs-opt.js seatLocked + generate({locked, excluded}) */
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
var pool = [], nid = 1;
pool.push(P(nid++, "Mahomes", ["QB"], "KC", "BUF", 7000, 22));
pool.push(P(nid++, "Allen",   ["QB"], "BUF", "KC", 6700, 21));
pool.push(P(nid++, "Hurts",   ["QB"], "PHI", "DAL", 6400, 20));
pool.push(P(nid++, "Kelce",   ["TE"], "KC", "BUF", 6000, 13));
pool.push(P(nid++, "Rice",    ["WR"], "KC", "BUF", 6500, 14));
pool.push(P(nid++, "Kincaid", ["TE"], "BUF", "KC", 4700, 10.5));
pool.push(P(nid++, "Shakir",  ["WR"], "BUF", "KC", 5300, 11));
[["McCaffrey","SF"],["Gibbs","DET"],["Barkley","PHI"],["Cook","BUF"],
 ["Pacheco","KC"],["Montgomery","DET"]
].forEach(function(r,i){ pool.push(P(nid++, r[0], ["RB"], r[1], "OPP", 7200-i*600, 16-i)); });
[["Hill","MIA"],["Lamb","DAL"],["Brown","PHI"],["Chase","CIN"],["Jefferson","MIN"],["Evans","TB"]
].forEach(function(r,i){ pool.push(P(nid++, r[0], ["WR"], r[1], "OPP", 7000-i*550, 15-i*0.5)); });
pool.push(P(nid++, "LaPorta", ["TE"], "DET", "GB", 5100, 11));
pool.push(P(nid++, "Andrews", ["TE"], "BAL", "CIN", 4900, 10.5));
/* extra KC pass catchers — a real slate has a full receiver room, and the
   exposure-aware stack builder needs a real mate pool to spread across */
pool.push(P(nid++, "Worthy", ["WR"], "KC", "BUF", 4500, 9.5));
pool.push(P(nid++, "Hunt", ["RB"], "KC", "BUF", 4300, 9));
pool.push(P(nid++, "Gray", ["TE"], "KC", "BUF", 4100, 8));
[["SF","SEA",3000],["DET","GB",2900],["BAL","CIN",2800],["KC","BUF",2700]].forEach(function(r){
  pool.push(P(nid++, r[0]+" DST", ["DST"], r[0], r[1], r[2], 8));
});
var cfg = D.CONFIGS.DK_NFL;
function idOf(name){ return pool.filter(function(p){ return p.name===name; })[0].id; }
function hasPlayer(lu, id){ return lu.some(function(e){ return e.player.id===id; }); }
function validAll(res){
  return res.lineups.length>0 && res.lineups.every(function(lu){ return D.validate(lu,cfg).ok; });
}

/* 1 — seatLocked seats into legal slots, constrained players first */
var seated = D.seatLocked(cfg, pool, (function(){ var o={}; o[idOf("Mahomes")]=1; o[idOf("Kelce")]=1; o[idOf("SF DST")]=1; return o; })());
ok("seatLocked seats 3 locks", seated && seated.length===3, JSON.stringify(seated));
ok("seatLocked QB -> QB slot", seated.some(function(e){ return e.player.name==="Mahomes" && e.slot==="QB"; }));
ok("seatLocked DST-only player -> DST slot", seated.some(function(e){ return e.player.name==="SF DST" && e.slot==="DST"; }));
ok("seatLocked TE -> TE or FLEX", seated.some(function(e){ return e.player.name==="Kelce" && (e.slot==="TE"||e.slot==="FLEX"); }));
var noFit = D.seatLocked(cfg, pool, (function(){ var o={}; o[idOf("Mahomes")]=1; o[idOf("Allen")]=1; return o; })());
ok("seatLocked null when two QBs lock one QB slot", noFit===null);

/* 2 — locked player appears in every lineup (cash) */
var mcc = idOf("McCaffrey");
var r1 = D.generate("DK_NFL", pool, "cash", {numLineups:3, locked:[mcc]});
ok("lock: 3 valid lineups", validAll(r1), JSON.stringify(r1.error||""));
ok("lock: McCaffrey in every lineup", r1.lineups.every(function(lu){ return hasPlayer(lu,mcc); }));
ok("lock: no error flag", !r1.error);

/* 3 — excluded player never appears */
var kelce = idOf("Kelce");
var r2 = D.generate("DK_NFL", pool, "cash", {numLineups:3, excluded:[kelce]});
ok("exclude: valid lineups", validAll(r2));
ok("exclude: Kelce in none", r2.lineups.every(function(lu){ return !hasPlayer(lu,kelce); }));

/* 4 — lock + exclude same player: lock wins */
var r3 = D.generate("DK_NFL", pool, "cash", {numLineups:2, locked:[mcc], excluded:[mcc]});
ok("lock beats exclude on same player", r3.lineups.length>0 && r3.lineups.every(function(lu){ return hasPlayer(lu,mcc); }));

/* 5 — over-cap locks return an honest error, not a silent empty set */
var r4 = D.generate("DK_NFL", pool, "cash", {locked:[idOf("Mahomes"),idOf("Allen"),idOf("Hurts"),idOf("Rice"),idOf("McCaffrey"),idOf("Kelce"),idOf("Hill"),idOf("LaPorta")]});
ok("over-cap locks -> error", r4.lineups.length===0 && /over the \$50,000 cap/.test(r4.error||""), r4.error);

/* 6 — more locks than roster slots -> error */
var many = pool.slice(0,10).map(function(p){ return p.id; });
var r5 = D.generate("DK_NFL", pool, "cash", {locked:many});
ok("10 locks -> error", r5.lineups.length===0 && /only 9 roster slots/.test(r5.error||""), r5.error);

/* 7 — locked player with no eligible slot -> error */
var bad = P(999, "Punter Pete", ["P"], "FA", "OPP", 3000, 5);
var r6 = D.generate("DK_NFL", pool.concat([bad]), "cash", {locked:[999]});
ok("unseatable lock -> error", r6.lineups.length===0 && /no eligible roster slot/.test(r6.error||""), r6.error);

/* 8 — GPP: lock ignores exposure cap, stacks still enforced */
var r7 = D.generate("DK_NFL", pool, "gpp", {numLineups:5, maxExposure:0.6, locked:[mcc]});
ok("gpp lock: 5 valid lineups despite 60% cap", validAll(r7) && r7.lineups.length===5, r7.lineups.length+" "+(r7.error||""));
ok("gpp lock: McCaffrey 100% exposed", r7.lineups.every(function(lu){ return hasPlayer(lu,mcc); }));
ok("gpp lock: all stacked", r7.lineups.every(function(lu){ return D.hasStack(lu); }));

/* 9 — locked QB becomes the stack QB in GPP; stack mates still respect the
   exposure cap while the user lock is exempt */
var mah = idOf("Mahomes");
var r8 = D.generate("DK_NFL", pool, "gpp", {numLineups:10, maxExposure:0.6, locked:[mah]});
ok("gpp locked QB: 10 valid lineups", validAll(r8) && r8.lineups.length===10, r8.lineups.length+" "+(r8.error||""));
ok("gpp locked QB: Mahomes is every QB", r8.lineups.every(function(lu){
  var qb = lu.filter(function(e){ return e.slot==="QB"; })[0];
  return qb && qb.player.id===mah;
}));
ok("gpp locked QB: all stacked", r8.lineups.every(function(lu){ return D.hasStack(lu); }));
ok("gpp locked QB: Mahomes exempt at 100%", r8.exposures[mah]===10, JSON.stringify(r8.exposures[mah]));
var matesOk = Object.keys(r8.exposures).every(function(id){
  if(Number(id)===mah) return true;
  return r8.exposures[id]/10 <= 0.6+1e-9;
});
ok("gpp locked QB: everyone else <=60% exposure", matesOk, JSON.stringify(r8.exposures));

/* 10 — excluded does not break feasibility with a big ban list */
var excMany = pool.filter(function(p){ return ["Allen","Hurts","Gibbs","Barkley","Lamb","Brown"].indexOf(p.name)!==-1; }).map(function(p){ return p.id; });
var r9 = D.generate("DK_NFL", pool, "cash", {numLineups:3, excluded:excMany});
ok("exclude several: still valid", validAll(r9), r9.error||"");
ok("exclude several: none appear", r9.lineups.every(function(lu){
  return !excMany.some(function(id){ return hasPlayer(lu,id); });
}));

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL LOCK/EXCLUDE TESTS PASSED");
process.exit(fails ? 1 : 0);
