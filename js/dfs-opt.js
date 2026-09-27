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
/* exposures: current per-player lineup counts, used to prefer the least-exposed
   mates so forced stacks spread exposure instead of pinning the same two players */
function buildStackCore(cfg, pool, mode, opts, qbId, exposures){
  exposures = exposures||{};
  var qbs = pool.filter(function(p){ return p.pos.indexOf("QB")!==-1; })
    .sort(function(a,b){ return b.ceil-a.ceil || b.proj-a.proj; });
  var qb = qbId ? qbs.filter(function(q){return q.id===qbId;})[0] : qbs[0];
  if(!qb) return null;
  var mates = pool.filter(function(p){
    return p.id!==qb.id && p.team===qb.team &&
           p.pos.some(function(x){ return ["RB","WR","TE"].indexOf(x)!==-1; });
  }).sort(function(a,b){
    var ea = exposures[a.id]||0, eb = exposures[b.id]||0;
    return (ea-eb) || (b.ceil-a.ceil);
  });
  if(mates.length<2) return null;
  var picks = mates.slice(0,2);
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
  picks.forEach(function(m){
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

/* lock seating: place each locked player into a concrete slot occurrence.
   Most-constrained players seat first so single-slot players win ties.
   Returns null when the locks can't all fit the roster slots. */
function seatLocked(cfg, pool, lockedIds){
  var players = pool.filter(function(p){ return lockedIds[p.id]; });
  var tmp = cfg.slots.slice();
  var locked = [];
  players.sort(function(a,b){
    return tmp.filter(function(s){ return eligible(a,s,cfg); }).length -
           tmp.filter(function(s){ return eligible(b,s,cfg); }).length;
  });
  for(var i=0;i<players.length;i++){
    var placed = -1;
    for(var s=0;s<tmp.length;s++){
      if(eligible(players[i], tmp[s], cfg)){ placed = s; break; }
    }
    if(placed===-1) return null;
    locked.push({slot:tmp[placed], player:players[i]});
    tmp.splice(placed,1);
  }
  return locked;
}

function generate(cfgKey, pool, mode, opts){
  opts = opts||{};
  var cfg = CONFIGS[cfgKey];
  if(!cfg) throw new Error("Unknown config "+cfgKey);
  var userLids = {}, exclIds = {};
  (opts.locked||[]).forEach(function(id){ userLids[id]=1; });
  (opts.excluded||[]).forEach(function(id){ if(!userLids[id]) exclIds[id]=1; });
  var userLocked = pool.filter(function(p){ return userLids[p.id]; });
  var lockedQB = userLocked.filter(function(p){ return p.pos.indexOf("QB")!==-1; })[0]||null;
  /* feasibility up front — never silently drop a lock */
  function fail(msg){ return { lineups:[], exposures:{}, config:cfg, relaxed:false, error:msg }; }
  if(userLocked.length > cfg.slots.length)
    return fail(userLocked.length+" locked players but only "+cfg.slots.length+" roster slots.");
  var lockedSal = userLocked.reduce(function(s,p){ return s+p.salary; },0);
  if(lockedSal > cfg.cap)
    return fail("Locked players cost $"+lockedSal.toLocaleString()+" — over the $"+cfg.cap.toLocaleString()+" cap.");
  var unseat = userLocked.filter(function(p){
    return !cfg.slots.some(function(s){ return eligible(p,s,cfg); });
  });
  if(unseat.length)
    return fail("Locked "+unseat.map(function(p){ return p.name; }).join(", ")+
      (unseat.length>1?" have":" has")+" no eligible roster slot.");
  var userSeated = seatLocked(cfg, pool, userLids);
  if(!userSeated) return fail("Locked players can't all fit the roster slots at once.");
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
       accepted lineup, forcing greedy down a genuinely different path.
       Locked players are never banned. */
    var banned = {};
    if(prevIds.length){
      for(var w=0; w<3; w++){
        var bid = prevIds[(banIdx*3+w) % prevIds.length];
        if(!userLids[bid]) banned[bid] = 1;
      }
    }
    banIdx++;
    /* exposure-aware pool: players already at the cap sit this attempt out.
       Locks and excluded players are handled specially. */
    var maxed = {};
    Object.keys(exposures).forEach(function(id){
      if(userLids[id]) return; /* locks ignore the exposure cap — standard DFS behavior */
      if(exposures[id]/numWanted >= maxExp - 1e-9) maxed[id]=1;
    });
    var effPool = pool.filter(function(p){
      if(exclIds[p.id]) return false;
      if(userLids[p.id]) return true;
      return !banned[p.id] && !maxed[p.id];
    });
    var locked = userSeated.slice(), lids = {};
    userSeated.forEach(function(e){ lids[e.player.id]=1; });
    if(needStack){
      var qbsEff = effPool.filter(function(p){ return p.pos.indexOf("QB")!==-1; })
        .sort(function(a,b){ return b.ceil-a.ceil; }).slice(0, Math.max(8, numWanted));
      var qbId;
      if(lockedQB){
        /* a user-locked QB becomes the stack QB — no rotation against their choice */
        if(!qbsEff.some(function(q){ return q.id===lockedQB.id; })) continue;
        qbId = lockedQB.id;
      } else {
        if(!qbsEff.length) continue;
        qbId = qbsEff[qbIdx % qbsEff.length].id;
        qbIdx++;
      }
      var core = buildStackCore(cfg, effPool, mode, opts, qbId, exposures);
      if(!core) continue;
      core.locked.forEach(function(e){
        if(!lids[e.player.id]){ locked.push(e); lids[e.player.id]=1; }
      });
    }
    var lu = greedy(cfg, effPool, mode, opts, locked);
    if(!lu) continue;
    lu = hillClimb(cfg, lu, effPool, mode, opts, lids);
    var v = validate(lu, cfg);
    if(!v.ok) continue;
    if(needStack && !hasStack(lu)) continue;
    /* uniqueness */
    var dup = lineups.some(function(o){ return diffCount(o,lu) < level; });
    if(dup) continue;
    /* exposure — locked players exempt */
    var maxAfter = 0;
    lu.forEach(function(e){
      if(!userLids[e.player.id]) maxAfter = Math.max(maxAfter, ((exposures[e.player.id]||0)+1)/numWanted);
    });
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

/* per-player exposure across the generated lineups — pure and testable.
   exposures: {playerId: lineupCount} from generate(); got: generated count;
   numWanted: requested count (the exposure cap is enforced against this);
   maxExp: max exposure fraction; lockedIds: user locks (exempt from cap).
   Returns rows sorted by share desc: {id,name,team,count,pct,capped,locked}. */
function exposureSummary(exposures, got, pool, lockedIds, maxExp, numWanted){
  var byId = {}, locked = {};
  (pool||[]).forEach(function(p){ byId[p.id]=p; });
  (lockedIds||[]).forEach(function(id){ locked[id]=1; });
  var rows = [];
  Object.keys(exposures||{}).forEach(function(k){
    var p = byId[k]; if(!p) return;              /* stale id — ignore, don't invent */
    var n = exposures[k]||0; if(!(n>0)) return;
    var id = Number(k);
    var isL = !!locked[id];
    rows.push({
      id:id, name:p.name, team:p.team, count:n,
      pct: got>0 ? n/got : 0,
      locked: isL,
      /* mirrors generate()'s acceptance rule: unlocked players are rejected once
         count/numWanted would exceed the cap */
      capped: !isL && numWanted>0 && n/numWanted >= maxExp-1e-9
    });
  });
  rows.sort(function(a,b){
    if(b.count!==a.count) return b.count-a.count;
    return a.name<b.name?-1:(a.name>b.name?1:0);
  });
  return rows;
}

/* ---------- demo slate (shared by the DFS Lab and the AI coach) ----------
   Synthetic players with made-up projections, for trying the optimizer only.
   Every entry carries demo:1 so UIs can label it DEMO. Pure: takes a CONFIGS
   entry, returns a fresh pool array. */
function buildDemoSlate(cfg){
  var pool = [], pid = 1;
  function P(name, pos, team, opp, salary, proj, floor, ceil, own){
    pool.push({ id:pid++, name:name, pos:pos, team:team, opp:opp,
      salary:salary, proj:proj, floor:floor, ceil:ceil, own:own, demo:1 });
  }
  var i, t;
  if(cfg.sport !== "NBA"){
    var T=[["KC","BUF"],["BUF","KC"],["PHI","DAL"],["DAL","PHI"],
           ["SF","SEA"],["DET","GB"],["BAL","CIN"],["MIA","NE"]];
    var dstPos = (cfg.site==="FanDuel") ? "DEF" : "DST";
    for(i=0;i<8;i++) P("Demo QB"+(i+1),["QB"],T[i][0],T[i][1],8000-i*250,24-i*0.8,12,38,15-i);
    for(i=0;i<14;i++){ t=T[i%8]; P("Demo RB"+(i+1),["RB"],t[0],t[1],7500-((i*280)%3500),16-(i%5),8,30,12); }
    for(i=0;i<18;i++){ t=T[i%8]; P("Demo WR"+(i+1),["WR"],t[0],t[1],7200-((i*260)%3400),14-(i%5),7,29,10); }
    for(i=0;i<8;i++){ t=T[i%8]; P("Demo TE"+(i+1),["TE"],t[0],t[1],5800-i*300,11-i*0.5,5,22,9); }
    for(i=0;i<6;i++){ t=T[i%8]; P("Demo DST"+(i+1),[dstPos],t[0],t[1],3400-i*150,8,3,18,8); }
  } else {
    var P2=["PG","SG","SF","PF","C"];
    for(i=0;i<40;i++){ var ps=P2[i%5]; P("Demo "+ps+(i+1),[ps],"DEM","OPP",7800-((i*330)%4800),36-(i%8)*2,20,55,10); }
  }
  return pool;
}

if(typeof module !== "undefined" && module.exports){
  module.exports = { CONFIGS:CONFIGS, eligible:eligible, validate:validate, scoreLineup:scoreLineup,
    greedy:greedy, hillClimb:hillClimb, hasStack:hasStack, seatLocked:seatLocked, generate:generate,
    insights:insights, exposureSummary:exposureSummary, salary:salary, proj:proj, ceil:ceil, floor:floor,
    buildDemoSlate:buildDemoSlate };
} else { window.DFSOpt = { CONFIGS:CONFIGS, eligible:eligible, validate:validate, scoreLineup:scoreLineup,
    greedy:greedy, hillClimb:hillClimb, hasStack:hasStack, seatLocked:seatLocked, generate:generate,
    insights:insights, exposureSummary:exposureSummary, salary:salary, proj:proj, ceil:ceil, floor:floor,
    buildDemoSlate:buildDemoSlate }; }
})();
