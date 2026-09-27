/* GridIronUI DFS optimizer core — pure functions, no DOM.
   Greedy value fill + hill-climbing swaps. Hard validation always enforced.
   Browser: window.DFSOpt · node: module.exports */
(function(){
"use strict";

var CONFIGS = {
  DK_NFL: { site:"DraftKings", sport:"NFL", cap:50000,
    slots:["QB","RB","RB","WR","WR","WR","TE","FLEX","DST"],
    flex:{ FLEX:["RB","WR","TE"] } },
  FD_NFL: { site:"FanDuel", sport:"NFL", cap:60000,
    slots:["QB","RB","RB","WR","WR","WR","TE","FLEX","DEF"],
    flex:{ FLEX:["RB","WR","TE"] } },
  DK_NBA: { site:"DraftKings", sport:"NBA", cap:50000,
    slots:["PG","SG","SF","PF","C","G","F","UTIL"],
    flex:{ G:["PG","SG"], F:["SF","PF"], UTIL:["PG","SG","SF","PF","C"] } },
  FD_NBA: { site:"FanDuel", sport:"NBA", cap:60000,
    slots:["PG","PG","SG","SG","SF","SF","PF","PF","C"],
    flex:{} }
};
/* QB's team abbreviation is the "stack team"; pass catchers = RB/WR/TE on that team */
function poolFor(cfg, slot){
  return cfg.flex[slot] || [slot];
}
function eligible(p, slot, cfg){
  var pool = poolFor(cfg, slot);
  return p.pos.some(function(pp){ return pool.indexOf(pp) !== -1; });
}
function salary(lineup){ return lineup.reduce(function(s,e){ return s+e.player.salary; },0); }
function proj(lineup){ return lineup.reduce(function(s,e){ return s+e.player.proj; },0); }
function ceil(lineup){ return lineup.reduce(function(s,e){ return s+e.player.ceil; },0); }
function floor(lineup){ return lineup.reduce(function(s,e){ return s+e.player.floor; },0); }

/* hard validation: cap, legal positions, no duplicates */
function validate(lineup, cfg){
  var errors = [], seen = {};
  if(salary(lineup) > cfg.cap) errors.push("over cap: $"+salary(lineup));
  lineup.forEach(function(e){
    if(seen[e.player.id]) errors.push("duplicate: "+e.player.name);
    seen[e.player.id]=1;
    if(!eligible(e.player, e.slot, cfg)) errors.push(e.player.name+" ineligible for "+e.slot);
  });
  if(lineup.length !== cfg.slots.length) errors.push("wrong size");
  return { ok: errors.length===0, errors: errors };
}

/* lineup score: cash favors floor, GPP favors ceiling */
function scoreLineup(lineup, mode, opts){
  opts = opts||{};
  if(mode==="cash"){
    var vol = opts.volPenalty==null?0.5:opts.volPenalty;
    return proj(lineup) - vol*(proj(lineup)-floor(lineup));
  }
  return ceil(lineup);
}
function metric(p, mode, opts){
  if(mode==="cash"){ var vol=opts.volPenalty==null?0.5:opts.volPenalty; return p.proj - vol*(p.proj-p.floor); }
  return p.ceil;
}
/* greedy fill; locked = [{slot,player}] pre-seated (stacks) */
function greedy(cfg, pool, mode, opts, locked){
  locked = locked||[];
  var used = {}, lineup = [];
  locked.forEach(function(e){ used[e.player.id]=1; lineup.push(e); });
  /* open slots = cfg.slots minus one occurrence per locked slot (handles RB/RB etc.) */
  var tmp = cfg.slots.slice();
  lineup.forEach(function(e){ var i=tmp.indexOf(e.slot); if(i!==-1) tmp.splice(i,1); });
  var openSlots = tmp;

  for(var si=0; si<openSlots.length; si++){
    var slot = openSlots[si];
    var remaining = cfg.cap - salary(lineup);
    var cands = pool.filter(function(p){
      return !used[p.id] && eligible(p,slot,cfg) && p.salary<=remaining;
    }).map(function(p){ return {p:p, v: metric(p,mode,opts)/p.salary}; });
    if(!cands.length) return null; /* infeasible */
    cands.sort(function(a,b){ return b.v-a.v || b.p.proj-a.p.proj; });
    /* feasibility: leave enough for cheapest possible rest */
    var pick = null;
    for(var ci=0; ci<cands.length; ci++){
      var rest = openSlots.slice(si+1);
      var minNeed = rest.reduce(function(sum, rs){
        var cheapest = Infinity;
        pool.forEach(function(q){
          if(!used[q.id] && q.id!==cands[ci].p.id && eligible(q,rs,cfg) && q.salary<cheapest) cheapest=q.salary;
        });
        return sum + (cheapest===Infinity?0:cheapest);
      },0);
      if(cands[ci].p.salary + minNeed <= remaining){ pick = cands[ci].p; break; }
    }
    if(!pick) return null;
    used[pick.id]=1; lineup.push({slot:slot, player:pick});
  }
  /* order lineup to match slot order */
  var ordered = [], taken = lineup.slice();
  cfg.slots.forEach(function(s){
    var i = taken.findIndex(function(e){ return e.slot===s; });
    ordered.push(taken.splice(i,1)[0]);
  });
  return ordered;
}
/* hill climbing: single swaps that improve score while staying valid */
function hillClimb(cfg, lineup, pool, mode, opts, lockedIds){
  opts=opts||{}; lockedIds=lockedIds||{};
  var best = lineup.slice(), bestScore = scoreLineup(best,mode,opts);
  var used = {}; best.forEach(function(e){ used[e.player.id]=1; });
  var improved = true, iter = 0;
  while(improved && iter < 40){
    improved = false; iter++;
    for(var i=0;i<best.length;i++){
      if(lockedIds[best[i].player.id]) continue;
      var slot = best[i].slot;
      for(var j=0;j<pool.length;j++){
        var q = pool[j];
        if(used[q.id] || !eligible(q,slot,cfg)) continue;
        var trial = best.slice(); trial[i] = {slot:slot, player:q};
        if(salary(trial) > cfg.cap) continue;
        var s = scoreLineup(trial,mode,opts);
        if(s > bestScore + 1e-9){
          delete used[best[i].player.id]; used[q.id]=1;
          best = trial; bestScore = s; improved = true;
        }
      }
    }
  }
  return best;
}
/* NFL stack check: QB + >=2 same-team pass catchers (RB/WR/TE) */
function hasStack(lineup){
  var qb = lineup.filter(function(e){ return e.slot==="QB"; })[0];
  if(!qb) return false;
  var t = qb.player.team;
  var n = lineup.filter(function(e){
    return e.player.id!==qb.player.id && e.player.team===t &&
           e.player.pos.some(function(p){ return ["RB","WR","TE"].indexOf(p)!==-1; });
  }).length;
  return n>=2;
}
function buildStackCore(cfg, pool, mode, opts, qbId){
  var qbs = pool.filter(function(p){ return p.pos.indexOf("QB")!==-1; })
    .sort(function(a,b){ return b.ceil-a.ceil || b.proj-a.proj; });
  var qb = qbId ? qbs.filter(function(q){return q.id===qbId;})[0] : qbs[0];
  if(!qb) return null;
  var mates = pool.filter(function(p){
    return p.id!==qb.id && p.team===qb.team &&
           p.pos.some(function(x){ return ["RB","WR","TE"].indexOf(x)!==-1; });
  }).sort(function(a,b){ return b.ceil-a.ceil; }).slice(0,2);
  if(mates.length<2) return null;
  var locked = [{slot:"QB", player:qb}];
  /* seat mates into eligible non-QB slots, tracking used slot occurrences by index */
  var seatable = [];
  cfg.slots.forEach(function(s, idx){
    if(s==="QB") return;
    if(poolFor(cfg,s).some(function(pp){ return ["RB","WR","TE"].indexOf(pp)!==-1; })) seatable.push(idx);
  });
  var usedIdx = {};
  cfg.slots.forEach(function(s, idx){ if(s==="QB") usedIdx[idx]=1; });
  var okSeat = true;
  mates.forEach(function(m){
    var placed = false;
    for(var i=0;i<seatable.length && !placed;i++){
      var idx = seatable[i];
      if(usedIdx[idx]) continue;
      if(eligible(m, cfg.slots[idx], cfg)){ locked.push({slot:cfg.slots[idx], player:m}); usedIdx[idx]=1; placed=true; }
    }
    if(!placed) okSeat = false;
  });
  if(!okSeat || locked.length<3) return null;
  var lockedIds = {}; locked.forEach(function(e){ lockedIds[e.player.id]=1; });
  return { locked:locked, lockedIds:lockedIds };
}

/* uniqueness: number of differing players vs another lineup */
function diffCount(a,b){
  var sa = {}; a.forEach(function(e){ sa[e.player.id]=1; });
  var d = 0; b.forEach(function(e){ if(!sa[e.player.id]) d++; });
  return d;
}

function generate(cfgKey, pool, mode, opts){
  opts = opts||{};
  var cfg = CONFIGS[cfgKey];
  if(!cfg) throw new Error("Unknown config "+cfgKey);
  var numWanted = Math.min(opts.numLineups|| (mode==="cash"?3:20), mode==="cash"?3:20);
  var maxExp = opts.maxExposure!=null?opts.maxExposure:(mode==="cash"?1:0.6);
  var minUnique = opts.minUnique!=null?opts.minUnique:(mode==="cash"?2:3);
  var needStack = (mode==="gpp" && cfg.sport==="NFL");
  /* candidate QB rotation for diversity */
  var lineups = [], exposures = {};
  /* uniqueness relaxation: if the pool is too small for strict uniqueness,
     fall back gracefully rather than returning too few lineups */
  var levels = [];
  [minUnique, minUnique-1, 1].forEach(function(l){ if(l>=1 && levels.indexOf(l)===-1) levels.push(l); });
  var qbIdx = 0, banIdx = 0, prevIds = [], finalLevel = minUnique;
  levels.forEach(function(level){
    if(lineups.length >= numWanted) return;
    finalLevel = level;
    var attempts = 0;
  while(lineups.length < numWanted && attempts < numWanted*16){
    attempts++;
    /* diversity: each attempt bans a rotating window of 3 players from the last
       accepted lineup, forcing greedy down a genuinely different path */
    var banned = {};
    if(prevIds.length){
      for(var w=0; w<3; w++) banned[prevIds[(banIdx*3+w) % prevIds.length]] = 1;
    }
    banIdx++;
    /* exposure-aware pool: players already at the cap sit this attempt out */
    var maxed = {};
    Object.keys(exposures).forEach(function(id){
      if(exposures[id]/numWanted >= maxExp - 1e-9) maxed[id]=1;
    });
    var effPool = pool.filter(function(p){ return !banned[p.id] && !maxed[p.id]; });
    var locked=null, lockedIds={};
    if(needStack){
      var qbsEff = effPool.filter(function(p){ return p.pos.indexOf("QB")!==-1; })
        .sort(function(a,b){ return b.ceil-a.ceil; }).slice(0, Math.max(8, numWanted));
      if(!qbsEff.length) continue;
      var core = buildStackCore(cfg, effPool, mode, opts, qbsEff[qbIdx % qbsEff.length].id);
      qbIdx++;
      if(!core) continue;
      locked = core.locked; lockedIds = core.lockedIds;
    }
    var lu = greedy(cfg, effPool, mode, opts, locked);
    if(!lu) continue;
    lu = hillClimb(cfg, lu, effPool, mode, opts, lockedIds);
    var v = validate(lu, cfg);
    if(!v.ok) continue;
    if(needStack && !hasStack(lu)) continue;
    /* uniqueness */
    var dup = lineups.some(function(o){ return diffCount(o,lu) < level; });
    if(dup) continue;
    /* exposure */
    var maxAfter = 0;
    lu.forEach(function(e){ maxAfter = Math.max(maxAfter, ((exposures[e.player.id]||0)+1)/numWanted); });
    if(maxAfter > maxExp + 1e-9) continue;
    lu.forEach(function(e){ exposures[e.player.id]=(exposures[e.player.id]||0)+1; });
    lineups.push(lu);
    prevIds = lu.map(function(e){ return e.player.id; });
  }
  });
  return { lineups: lineups, exposures: exposures, config: cfg, relaxed: finalLevel < minUnique };
}

/* optimizer insights — computed from data, never invented */
function insights(lineup, pool, mode, cfgKey){
  var cfg = CONFIGS[cfgKey], out = [];
  var byVal = lineup.map(function(e){
    return { e:e, v: e.player.proj / e.player.salary * 1000 };
  }).sort(function(a,b){ return b.v-a.v; });
  var top = byVal[0];
  out.push("Best value: "+top.e.player.name+" ("+top.e.player.team+") at "+top.v.toFixed(2)+" proj pts per $1K.");
  if(mode==="gpp"){
    var qb = lineup.filter(function(e){ return e.slot==="QB"; })[0];
    if(qb){
      var mates = lineup.filter(function(e){
        return e.player.team===qb.player.team && e.player.id!==qb.player.id &&
          e.player.pos.some(function(p){ return ["RB","WR","TE"].indexOf(p)!==-1; });
      }).map(function(e){ return e.player.name; });
      if(mates.length) out.push("Stack: "+qb.player.name+" + "+mates.join(", ")+" ("+qb.player.team+") — correlated ceiling if the offense goes off.");
      var bring = lineup.filter(function(e){
        return e.player.opp===qb.player.team || e.player.team===qb.player.opp;
      }).map(function(e){ return e.player.name; });
      if(bring.length) out.push("Bring-back: "+bring.join(", ")+" — captures shootout upside on the other side.");
    }
    var levE = lineup.filter(function(e){ return (e.player.own||0)<12 && e.player.ceil > e.player.proj*1.3; })
      .sort(function(a,b){ return (b.player.ceil-b.player.proj)-(a.player.ceil-a.player.proj); })[0];
    if(levE) out.push("Leverage: "+levE.player.name+" projects "+(levE.player.own||0)+"% owned with a "+levE.player.ceil.toFixed(1)+" ceiling — tournament differentiation.");
  } else {
    var minFloor = Math.min.apply(null, lineup.map(function(e){ return e.player.floor; }));
    out.push("Cash safety: lowest starter floor is "+minFloor.toFixed(1)+" pts — built for high-floor median outcomes, not ceiling.");
    var chalk = lineup.filter(function(e){ return (e.player.own||0) > 25; }).length;
    if(chalk) out.push(chalk+" high-owned play"+(chalk>1?"s":"")+" — in cash games you want the field's points, not differentiation.");
  }
  var sal = salary(lineup);
  out.push("Salary: $"+sal.toLocaleString()+" of $"+cfg.cap.toLocaleString()+" cap ("+"$"+(cfg.cap-sal).toLocaleString()+" left).");
  return out;
}

if(typeof module !== "undefined" && module.exports){
  module.exports = { CONFIGS:CONFIGS, eligible:eligible, validate:validate, scoreLineup:scoreLineup,
    greedy:greedy, hillClimb:hillClimb, hasStack:hasStack, generate:generate, insights:insights,
    salary:salary, proj:proj, ceil:ceil, floor:floor };
} else { window.DFSOpt = { CONFIGS:CONFIGS, eligible:eligible, validate:validate, scoreLineup:scoreLineup,
    greedy:greedy, hillClimb:hillClimb, hasStack:hasStack, generate:generate, insights:insights,
    salary:salary, proj:proj, ceil:ceil, floor:floor }; }
})();
