/* Node tests for DFS exposureSummary (js/dfs-opt.js) — run: node tests/test-dfs-exposure.js */
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
var nfl = [], nid = 1;
var teams = [["KC","BUF"],["BUF","KC"],["PHI","DAL"],["DAL","PHI"],["SF","SEA"],["DET","GB"]];
["Mahomes","Allen","Hurts","Prescott","Purdy","Goff"].forEach(function(n,i){
  nfl.push(P(nid++, n, ["QB"], teams[i][0], teams[i][1], 7800-i*300, 22-i));
});
[["McCaffrey","SF"],["Gibbs","DET"],["Barkley","PHI"],["Cook","BUF"],["Pacheco","KC"],
 ["Montgomery","DET"],["Walker","SEA"],["Elliott","DAL"]].forEach(function(r,i){
  nfl.push(P(nid++, r[0], ["RB"], r[1], "OPP", 8200-i*350, 17-i*0.6));
});
[["Hill","MIA"],["Lamb","DAL"],["Brown","PHI"],["Chase","CIN"],["Jefferson","MIN"],
 ["Evans","TB"],["Metcalf","SEA"],["Adams","LV"],["Diggs","HOU"],["Wilson","NYJ"],["Nacua","LAR"]].forEach(function(r,i){
  nfl.push(P(nid++, r[0], ["WR"], r[1], "OPP", 7900-i*320, 15-i*0.5));
});
nfl.push(P(nid++, "Kelce", ["TE"], "KC", "BUF", 6500, 13));
nfl.push(P(nid++, "Rice", ["WR"], "KC", "BUF", 7000, 14));
nfl.push(P(nid++, "Kincaid", ["TE"], "BUF", "KC", 5200, 10.5));
nfl.push(P(nid++, "Shakir", ["WR"], "BUF", "KC", 5800, 11));
[["Smith","WR","PHI"],["Goedert","TE","PHI"],["Ferguson","TE","DAL"],["Cooks","WR","DAL"],
 ["Kittle","TE","SF"],["Jennings","WR","SF"],["St. Brown","WR","DET"],["Williams","WR","DET"]
].forEach(function(r,i){ nfl.push(P(nid++, r[0], [r[1]], r[2], "OPP", 6200-i*250, 12-i*0.4)); });
[["SF","SEA"],["DET","GB"],["BAL","CIN"],["KC","BUF"]].forEach(function(r,i){
  nfl.push({id:nid++, name:r[0]+" DST", pos:["DST"], team:r[0], opp:r[1], salary:3200-i*200,
            proj:8-i*0.5, floor:4, ceil:16, own:8});
});

var WANT = 10, CAP = 0.6;
var r = D.generate("DK_NFL", nfl, "gpp", {numLineups:WANT, maxExposure:CAP, minUnique:3});
ok("gpp generated lineups", r.lineups.length>0, r.lineups.length);
var got = r.lineups.length, slots = D.CONFIGS.DK_NFL.slots.length;
var rows = D.exposureSummary(r.exposures, got, nfl, [], CAP, WANT);

ok("summary non-empty", rows.length>0);
ok("only pool players reported",
  rows.every(function(x){ return nfl.some(function(p){ return p.id===x.id && p.name===x.name; }); }));
var sum = rows.reduce(function(s,x){ return s+x.count; }, 0);
ok("counts sum to slots*lineups", sum===got*slots, sum+" vs "+got*slots);
ok("sorted by share desc",
  rows.every(function(x,i){ return i===0 || rows[i-1].count>=x.count; }));
ok("pct = count/generated", rows.every(function(x){ return Math.abs(x.pct - x.count/got)<1e-9; }));
ok("pct within [0,1]", rows.every(function(x){ return x.pct>=0 && x.pct<=1; }));
ok("cap hits flagged for unlocked rows",
  rows.every(function(x){ return x.count/WANT>=CAP-1e-9 ? x.capped : true; }));
ok("no row invented from stale ids",
  D.exposureSummary({99999:3}, 1, nfl, [], CAP, WANT).length===0);
ok("empty exposures -> empty summary",
  D.exposureSummary({}, got, nfl, [], CAP, WANT).length===0);
ok("null exposures -> empty summary",
  D.exposureSummary(null, got, nfl, [], CAP, WANT).length===0);

/* locked player: 100% share, flagged locked, never flagged capped */
var lockId = nfl[0].id; /* Mahomes */
var rl = D.generate("DK_NFL", nfl, "gpp",
  {numLineups:WANT, maxExposure:CAP, minUnique:3, locked:[lockId]});
ok("locked gpp still generates", rl.lineups.length>0);
var rowsL = D.exposureSummary(rl.exposures, rl.lineups.length, nfl, [lockId], CAP, WANT);
var lk = rowsL.filter(function(x){ return x.id===lockId; })[0];
ok("locked row present", !!lk);
ok("locked row at 100%", lk && Math.abs(lk.pct-1)<1e-9, lk&&lk.pct);
ok("locked row flagged locked", lk && lk.locked===true);
ok("locked row never capped", lk && lk.capped===false);

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL DFS EXPOSURE TESTS PASSED");
process.exit(fails ? 1 : 0);
