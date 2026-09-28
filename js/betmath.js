/* GridIronUI betting math — pure functions, no DOM.
   Usable in the browser (window.BetMath) and in node (module.exports). */
(function(){
"use strict";

function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ var t=a%b; a=b; b=t; } return a||1; }
function round(x, n){ var f=Math.pow(10,n); return Math.round(x*f)/f; }

var M = {
  /* ---- conversions ---- */
  americanToDecimal: function(a){
    a = Number(a);
    if(!isFinite(a) || a===0) throw new Error("American odds must be non-zero");
    return a > 0 ? 1 + a/100 : 1 + 100/Math.abs(a);
  },
  decimalToAmerican: function(d){
    d = Number(d);
    if(!isFinite(d) || d < 1) throw new Error("Decimal odds must be >= 1.01");
    if(Math.abs(d-1) < 1e-9) return 0;
    return d >= 2 ? Math.round((d-1)*100) : Math.round(-100/(d-1));
  },
  decimalToFractional: function(d){
    d = Number(d);
    if(!isFinite(d) || d < 1) throw new Error("Decimal odds must be >= 1.01");
    var f = d - 1, best = {n:Math.round(f), d:1, err:Math.abs(f-Math.round(f))};
    for(var den=1; den<=40; den++){
      var num = Math.round(f*den), err = Math.abs(f - num/den);
      if(err < best.err - 1e-12) best = {n:num, d:den, err:err};
    }
    var g = gcd(best.n, best.d);
    return [best.n/g, best.d/g];
  },
  fractionalToDecimal: function(num, den){
    num=Number(num); den=Number(den);
    if(!isFinite(num)||!isFinite(den)||den<=0||num<0) throw new Error("Invalid fractional odds");
    return 1 + num/den;
  },

  /* ---- implied probability (0..1) ---- */
  impliedFromAmerican: function(a){ return 1 / M.americanToDecimal(a); },
  impliedFromDecimal: function(d){ return 1 / Number(d); },
  impliedFromFractional: function(num, den){
    num=Number(num); den=Number(den); return den/(num+den);
  },

  /* ---- payout ---- */
  payout: function(decimalOdds, stake){
    var d = Number(decimalOdds), s = Number(stake);
    if(!(d>=1) || !(s>0)) throw new Error("Need decimal odds >= 1 and stake > 0");
    var total = s*d;
    return { profit: round(total-s, 2), total: round(total, 2) };
  },

  /* ---- parlay: array of decimal odds -> combined decimal ---- */
  parlayDecimal: function(legs){
    if(!legs.length) throw new Error("Need at least one leg");
    return legs.reduce(function(acc,d){
      d=Number(d); if(!(d>=1)) throw new Error("Each leg needs decimal odds >= 1");
      return acc*d;
    }, 1);
  },

  /* ---- combinations: all k-subsets of n indices, order-preserving ---- */
  combinations: function(n, k){
    n = Math.floor(n); k = Math.floor(k);
    if(!(n > 0) || k < 1 || k > n) return [];
    var idx = [], out = [];
    (function pick(start){
      if(idx.length === k){ out.push(idx.slice()); return; }
      for(var i = start; i < n; i++){ idx.push(i); pick(i+1); idx.pop(); }
    })(0);
    return out;
  },

  /* ---- round robin: every k-leg parlay from a set of legs.
         legs = array of decimal odds; sizes = array of k (2..legs.length);
         stakePer = stake on EACH parlay.
         Returns per-size: k, parlays, totalRisk, allWinReturn, allWinProfit,
         worstLoserReturn/Profit (one leg loses: fewest combos survive), and the
         richest single parlay (1-based leg numbers + its decimal). */
  roundRobin: function(legs, sizes, stakePer){
    if(!Array.isArray(legs) || legs.length < 2) throw new Error("Round robin needs at least 2 legs");
    legs = legs.map(function(d){
      d = Number(d);
      if(!(d > 1)) throw new Error("Leg odds must be decimal > 1");
      return d;
    });
    var n = legs.length;
    sizes = (sizes || []).map(Number).filter(function(k){ return k >= 2 && k <= n; });
    if(!sizes.length) throw new Error("Pick at least one size (by 2s, by 3s, ...).");
    var s = Number(stakePer);
    if(!(s > 0)) throw new Error("Stake per parlay must be greater than 0.");
    function comboDec(combo){ return combo.reduce(function(a, i){ return a*legs[i]; }, 1); }
    return sizes.map(function(k){
      var combos = M.combinations(n, k), decs = [], byLeg = [];
      for(var i = 0; i < n; i++) byLeg.push(0);
      combos.forEach(function(combo){
        var d = comboDec(combo);
        decs.push({combo: combo, dec: d});
        combo.forEach(function(i){ byLeg[i] += d; });
      });
      var sumAll = decs.reduce(function(a, x){ return a + x.dec; }, 0);
      /* losing a leg kills every combo containing it; survivors = combos it is NOT in.
         Worst loser = the leg whose combos pay the most (max byLeg -> min survivors). */
      var maxInLeg = Math.max.apply(null, byLeg);
      var worstSurvive = sumAll - maxInLeg;
      var risk = s * combos.length;
      var richest = decs.reduce(function(a, x){ return x.dec > a.dec ? x : a; }, decs[0]);
      return {
        k: k, parlays: combos.length,
        totalRisk: round(risk, 2),
        allWinReturn: round(s * sumAll, 2),
        allWinProfit: round(s * sumAll - risk, 2),
        worstLoserReturn: round(s * worstSurvive, 2),
        worstLoserProfit: round(s * worstSurvive - risk, 2),
        richestCombo: richest.combo.map(function(i){ return i + 1; }), /* 1-based leg numbers */
        richestDec: round(richest.dec, 3)
      };
    });
  },

  /* ---- Kelly: p = your probability 0..1, d = decimal odds, frac = 1, .5, .25 ---- */
  kelly: function(p, d, frac){
    p=Number(p); d=Number(d); frac=(frac===undefined)?1:Number(frac);
    if(!(p>0&&p<1)) throw new Error("Probability must be between 0 and 1");
    if(!(d>1)) throw new Error("Decimal odds must be > 1");
    var b = d-1, f = (b*p-(1-p))/b;
    return Math.max(0, f*frac);
  },

  /* ---- no-vig: two American prices -> fair probs + fair American odds ---- */
  noVig: function(a1, a2){
    var p1 = M.impliedFromAmerican(a1), p2 = M.impliedFromAmerican(a2);
    var tot = p1+p2;
    var f1 = p1/tot, f2 = p2/tot;
    return {
      p1: round(f1,4), p2: round(f2,4),
      fair1: M.decimalToAmerican(1/f1), fair2: M.decimalToAmerican(1/f2),
      hold: round((tot-1)*100, 2)
    };
  },
  /* ---- hedge & arbitrage: dA/dB = decimal odds for side A (your bet) and side B
         (hedge). stakeA optional. Returns implied probs, book hold vs arb %,
         and — when a stake is given — the equal-payout hedge stake on B plus
         the guaranteed return/profit (negative profit = the cost of insuring). */
  hedge: function(dA, dB, stakeA){
    dA=Number(dA); dB=Number(dB);
    if(!(dA>1) || !(dB>1)) throw new Error("Odds must be decimal > 1");
    var qA = 1/dA, qB = 1/dB, sum = qA+qB;
    var r = {
      impA: round(qA*100,2), impB: round(qB*100,2),
      isArb: sum < 1, arbPct: round((1-sum)*100,2), holdPct: round((sum-1)*100,2)
    };
    if(stakeA !== undefined && stakeA !== null && stakeA !== ""){
      var s = Number(stakeA);
      if(!(s>0)) throw new Error("Stake must be greater than 0");
      var hb = s*dA/dB, tot = s+hb, ret = s*dA;
      r.stakeB = round(hb,2);
      r.totalStaked = round(tot,2);
      r.guaranteedReturn = round(ret,2);
      r.guaranteedProfit = round(ret-tot,2);
    }
    return r;
  },

  /* ---- ticket hedge planner: one leg left on a live ticket.
         stake A: original stake. ticketPays T: full ticket payout INCLUDING
         the stake. hedgeDec d: decimal price on the OTHER side of the
         remaining leg. Returns two named plans plus an outcomes() helper
         for a custom hedge stake:
           equal lock: S = T/d -> profit T-A-S no matter who wins.
           free-roll:  S = A/(d-1) -> a miss returns exactly the stake (net 0),
                       a hit keeps T-A-S. */
  ticketHedge: function(stake, ticketPays, hedgeDec){
    var A=Number(stake), T=Number(ticketPays), d=Number(hedgeDec);
    if(!(A>0)) throw new Error("Original stake must be greater than 0");
    if(!(T>A)) throw new Error("Ticket payout must exceed the original stake");
    if(!(d>1)) throw new Error("Hedge odds must be decimal > 1");
    var sEq = T/d, pEq = T-A-sEq;
    var sFr = A/(d-1), pFrHit = T-A-sFr;
    return {
      stake: A, ticketPays: T, hedgeDec: round(d,4),
      rideProfit: round(T-A,2),            /* let-it-ride upside if leg hits */
      equalStake: round(sEq,2),
      equalProfit: round(pEq,2),           /* guaranteed either way */
      insuranceCost: round((T-A)-pEq,2),    /* profit given up vs riding */
      freeStake: round(sFr,2),
      freeProfitHit: round(pFrHit,2),
      freeProfitMiss: 0,                   /* hedge win returns stake exactly */
      outcomes: function(hedgeStake){
        var hs=Number(hedgeStake);
        if(!(hs>0)) throw new Error("Hedge stake must be greater than 0");
        return {
          stake: round(hs,2),
          profitHit: round(T-A-hs,2),
          profitMiss: round(hs*d-A-hs,2)
        };
      }
    };
  },

  /* ---- deterministic PRNG (mulberry32) for seeded, reproducible simulations ---- */
  mulberry32: function(seed){
    var a = (Number(seed)>>>0) || 1;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a>>>15), 1 | a);
      t = (t + Math.imul(t ^ (t>>>7), 61 | t)) ^ t;
      return ((t ^ (t>>>14))>>>0) / 4294967296;
    };
  },

  /* ---- bankroll Monte Carlo: what a run of nBets bets does to a bankroll ----
     cfg: { startBankroll, stakeMode:"flat"|"pct", stake (flat $ or % of bankroll),
            winProb 0..1, decimalOdds > 1, nBets >= 1, nSims >= 1,
            ruinFrac (default 0): balance <= start*ruinFrac counts as ruined.
            Use 0 for flat staking (true $0 ruin), ~0.05 for % staking
            (proportional stakes never hit $0, so "down 95%+" is the ruin line). }
     rand: function() -> [0,1). Pass M.mulberry32(seed) for deterministic tests;
           the UI passes a Math.random-backed closure.
     A stake can never exceed the current balance. Curves are recorded for the
     first nCurves (default 40) simulations at ~80 evenly spaced checkpoints.
     Returns { evPerBet, mean, median, p5, p95, pRuin, pHalf, pProfit, pDouble,
               ends[], curves[][], ruinFrac }. */
  simulateBankroll: function(cfg, rand){
    cfg = cfg || {};
    var start = Number(cfg.startBankroll);
    var mode = cfg.stakeMode === "pct" ? "pct" : "flat";
    var stake = Number(cfg.stake);
    var p = Number(cfg.winProb);
    var d = Number(cfg.decimalOdds);
    var nBets = Math.floor(Number(cfg.nBets));
    var nSims = Math.floor(Number(cfg.nSims));
    var ruinFrac = cfg.ruinFrac === undefined ? 0 : Number(cfg.ruinFrac);
    var nCurves = cfg.nCurves === undefined ? 40 : Math.floor(Number(cfg.nCurves));
    if(!(start>0)) throw new Error("Starting bankroll must be greater than 0");
    if(!(stake>0)) throw new Error("Stake must be greater than 0");
    if(mode==="pct" && stake>100) throw new Error("Stake as % of bankroll must be <= 100");
    if(!(p>0 && p<1)) throw new Error("Win probability must be between 0 and 1");
    if(!(d>1)) throw new Error("Decimal odds must be > 1");
    if(!(nBets>=1)) throw new Error("Number of bets must be at least 1");
    if(!(nSims>=1)) throw new Error("Number of simulations must be at least 1");
    if(!(ruinFrac>=0 && ruinFrac<1)) throw new Error("ruinFrac must be in [0, 1)");
    if(typeof rand !== "function") throw new Error("A random function is required");
    var ruinLine = start * ruinFrac;
    var ends = new Array(nSims);
    var curves = [];
    var curveEvery = Math.max(1, Math.ceil(nBets/80));
    var nRuin = 0, nHalf = 0, nProfit = 0, nDouble = 0, sum = 0;
    for(var s=0; s<nSims; s++){
      var b = start, ruined = b <= ruinLine, curve = null;
      if(s < nCurves) curve = [round(b,2)];
      for(var i=1; i<=nBets; i++){
        if(b <= ruinLine){ ruined = true; break; }
        var sAmt = mode==="flat" ? Math.min(stake, b) : b*stake/100;
        if(rand() < p) b = b + sAmt*(d-1);
        else b = b - sAmt;
        if(curve && i % curveEvery === 0) curve.push(round(b,2));
      }
      if(b <= ruinLine) ruined = true;
      ends[s] = round(b,2); sum += b;
      if(ruined) nRuin++;
      if(b < start*0.5) nHalf++;
      if(b > start) nProfit++;
      if(b >= start*2) nDouble++;
      if(curve){ curve.push(round(b,2)); curves.push(curve); }
    }
    var sorted = ends.slice().sort(function(a,c){ return a-c; });
    function pct(q){ return sorted[Math.min(sorted.length-1, Math.floor(q*sorted.length))]; }
    return {
      evPerBet: p*d - 1,
      mean: round(sum/nSims, 2),
      median: pct(0.5), p5: pct(0.05), p95: pct(0.95),
      pRuin: nRuin/nSims, pHalf: nHalf/nSims,
      pProfit: nProfit/nSims, pDouble: nDouble/nSims,
      ruinFrac: ruinFrac, nSims: nSims, nBets: nBets,
      ends: ends, curves: curves
    };
  },
  round: round
};

if(typeof module !== "undefined" && module.exports){ module.exports = M; }
else { window.BetMath = M; }
})();
