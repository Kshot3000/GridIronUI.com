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

  /* ---- cash-out evaluator: the book flashes a mid-game cash-out offer C on a
         ticket you bought for stake S at decimal odds db. The same side is now
         priced at decimal dn (shop the odds board for the best one). At fair,
         no-vig prices the ticket is worth V = S*db/dn — the expected payout of
         the ticket at the current market price. Hedge the other side yourself
         at the fair two-way price d_opp = dn/(dn-1): stake H = S*db/d_opp =
         S*db*(dn-1)/dn equalizes the payouts, locking in V either way (profit
         V-S). The offer is only worth taking when C >= V; the book's cut of
         the offer is (V-C)/V. */
  cashout: function(stake, origDec, nowDec, offer){
    var s=Number(stake), db=Number(origDec), dn=Number(nowDec), c=Number(offer);
    if(!(s>0)) throw new Error("Original stake must be greater than 0");
    if(!(db>1)) throw new Error("Original odds must be decimal greater than 1");
    if(!(dn>1)) throw new Error("Current price must be decimal greater than 1");
    if(!(c>=0)) throw new Error("Cash-out offer must be 0 or more");
    var value = s*db/dn;                       /* fair present value of the ticket */
    var margin = value>0 ? (value-c)/value*100 : 0; /* book's cut of the offer, % */
    var hedgeStake = s*db*(dn-1)/dn;           /* other-side stake (fair price) to lock value */
    return {
      fairValue: round(value,2),
      bookMarginPct: round(margin,2),
      offerProfit: round(c-s,2),               /* locked profit if you take the offer */
      rideEV: round(value-s,2),                /* expected profit if you let it ride */
      diyHedgeStake: round(hedgeStake,2),
      diyLockedReturn: round(value,2),         /* what the DIY hedge guarantees back */
      diyProfit: round(value-s,2),
      takeOffer: c >= value,
      close: c < value && c >= value*0.97      /* within 3% of fair: judgement call */
    };
  },

  /* ---- dutching: split one stake across mutually-exclusive outcomes so the
         return is identical no matter which one wins. The classic use: several
         golfers in one tournament, multiple division winners, or one side of
         several games — exactly one selection can win.
         legs = array of decimal odds (> 1); totalStake S > 0.
         stake_i = S * (1/d_i) / sum(1/d_j); every winner returns S/sum(1/d_j).
         sum(1/d) < 1  -> the prices contain an arb: guaranteed profit.
         sum(1/d) > 1  -> you lock in a loss: the books' margin, priced in.
         Returns per-leg stakes (rounded to cents), implied %, total implied %,
         the equal return, profit, ROI, and the verdict. */
  dutch: function(legs, totalStake){
    if(!Array.isArray(legs) || legs.length < 2) throw new Error("Dutching needs at least 2 selections");
    legs = legs.map(function(d){
      d = Number(d);
      if(!(d > 1)) throw new Error("Selection odds must be decimal > 1");
      return d;
    });
    var S = Number(totalStake);
    if(!(S > 0)) throw new Error("Total stake must be greater than 0.");
    var imps = legs.map(function(d){ return 1/d; });
    var tot = imps.reduce(function(a,q){ return a+q; }, 0);
    var stakes = imps.map(function(q){ return round(S*q/tot, 2); });
    var ret = round(S/tot, 2), profit = round(ret - S, 2);
    return {
      legs: legs.map(function(d, i){
        return { decimal: round(d,4), impliedPct: round(imps[i]*100, 2), stake: stakes[i] };
      }),
      totalImpliedPct: round(tot*100, 2),
      totalStaked: round(stakes.reduce(function(a,s){ return a+s; }, 0), 2),
      equalReturn: ret,
      profit: profit,
      roiPct: round(profit/S*100, 2),
      isArb: tot < 1
    };
  },

  /* ---- teaser: the classic points-buying parlay ----
         legs = [{ line, kind:"spread"|"total", side, name? }]
           spread fav:  teased = line + points   (-7.5 + 6 -> -1.5)
           spread dog:  teased = line + points   (+1.5 + 6 -> +7.5)
           total over:  teased = line - points   (47.5 - 6 -> 41.5)
           total under: teased = line + points   (47.5 + 6 -> 53.5)
         NFL key numbers: spreads [3,4,6,7,10,14,17], totals [37,41,44,47,51].
         crossed = key numbers strictly inside the interval the line moves
         through; touched = key numbers an endpoint lands exactly on (a push
         risk under "ties push" books). A Wong leg (spreads only) crosses BOTH
         3 and 7 — the classic 6-pt Wong ranges are favorites -7.5..-8.5 and
         underdogs +1.5..+2.5. A dead leg crosses nothing: all cost, no value.
         price = the book's offered American odds (standard 2-team 6-pt is
         about -120). perLegBreakevenPct = implied(price)^(1/n) * 100, the win
         rate every leg must clear (ties aside). pushRule "push": a pushed leg
         voids and the teaser re-grades short; "lose": any push kills it.
         Returns per-leg teased lines, crossed/touched key numbers, Wong/dead
         flags, and the combined breakeven math. */
  teaser: function(legs, points, americanPrice, pushRule){
    var SPREAD_KEYS = [3,4,6,7,10,14,17], TOTAL_KEYS = [37,41,44,47,51];
    function inInterval(keys, lo, hi){
      return keys.filter(function(k){ return k > lo + 1e-9 && k < hi - 1e-9; });
    }
    function onEndpoint(keys, v){
      return keys.filter(function(k){ return Math.abs(k - v) < 1e-9; });
    }
    if(!Array.isArray(legs) || legs.length < 2) throw new Error("Teasers need at least 2 legs");
    var pts = Number(points);
    if(!(pts > 0)) throw new Error("Teaser points must be greater than 0.");
    var price = Number(americanPrice);
    if(!isFinite(price) || price === 0) throw new Error("Enter the book's offered price as American odds (e.g. -120).");
    if(pushRule !== "push" && pushRule !== "lose") throw new Error("Push rule must be \"push\" or \"lose\".");
    var out = legs.map(function(leg, i){
      var L = leg.line;
      if(typeof L === "string"){ if(!L.trim()) throw new Error("Leg "+(i+1)+": enter a line like -7.5."); L = Number(L.trim()); }
      if(!isFinite(L)) throw new Error("Leg "+(i+1)+": enter a numeric line like -7.5.");
      var kind = leg.kind, side = leg.side;
      var teased;
      if(kind === "spread"){
        if(side !== "fav" && side !== "dog") throw new Error("Leg "+(i+1)+": pick favorite or underdog.");
        teased = round(L + pts, 2);
      }else if(kind === "total"){
        if(side !== "over" && side !== "under") throw new Error("Leg "+(i+1)+": pick over or under.");
        teased = round(L + (side === "under" ? pts : -pts), 2);
      }else{
        throw new Error("Leg "+(i+1)+": pick spread or total.");
      }
      var keys = kind === "spread" ? SPREAD_KEYS : TOTAL_KEYS, crossed, touched;
      if(kind === "spread"){
        var aLo = Math.min(Math.abs(L), Math.abs(teased)), aHi = Math.max(Math.abs(L), Math.abs(teased));
        crossed = inInterval(keys, aLo, aHi);
        touched = onEndpoint(keys, Math.abs(L)).concat(onEndpoint(keys, Math.abs(teased)));
      }else{
        var tLo = Math.min(L, teased), tHi = Math.max(L, teased);
        crossed = inInterval(keys, tLo, tHi);
        touched = onEndpoint(keys, L).concat(onEndpoint(keys, teased));
      }
      touched = touched.filter(function(k, j){ return touched.indexOf(k) === j; });
      var wong = kind === "spread" && crossed.indexOf(3) !== -1 && crossed.indexOf(7) !== -1;
      return {
        name: leg.name || ("Leg "+(i+1)),
        line: round(L, 2), kind: kind, side: side,
        teased: teased, crossed: crossed, touched: touched,
        wong: wong, dead: crossed.length === 0
      };
    });
    var dec = M.americanToDecimal(price);
    var implied = 1/dec;
    var nWong = out.filter(function(l){ return l.wong; }).length;
    var nDead = out.filter(function(l){ return l.dead; }).length;
    var nSpread = out.filter(function(l){ return l.kind === "spread"; }).length;
    return {
      points: pts, legs: out, nLegs: out.length,
      price: price, decimal: round(dec, 4), impliedPct: round(implied*100, 2),
      perLegBreakevenPct: round(Math.pow(implied, 1/out.length)*100, 2),
      pushRule: pushRule, nWong: nWong, nDead: nDead,
      allWong: nSpread === out.length && nWong === out.length
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
  round: round,

  /* ============================================================
     v1.53.0 — bet journal. Pure record-keeping math for journal.html:
     every settled bet reduces to a profit number; pending/push bets
     risk nothing and win nothing. Journal never invents data — it
     summarizes exactly what the bettor logged.
     A bet: {id, date:"YYYY-MM-DD", sport, event, market, pick,
             price (American number or string), stake (dollars),
             result: "pending"|"win"|"loss"|"push"}
     ============================================================ */
  journalValid: function(b){
    if(!b) return "Missing bet.";
    if(!b.event || !String(b.event).trim()) return "Event is required.";
    if(!b.sport || !String(b.sport).trim()) return "Sport is required.";
    var price = Number(b.price);
    if(!/^[+-]?\d+$/.test(String(b.price).trim())) return "Price must be a whole American number (e.g. -110 or +150).";
    if(Math.abs(price) < 100 || price === -100) return "American prices can't sit between -100 and +100 (even money is +100).";
    var stake = Number(b.stake);
    if(!(stake > 0) || !isFinite(stake)) return "Stake must be more than $0.";
    return null;
  },
  journalProfit: function(b){
    /* Dollars won/lost on a settled bet; 0 for pending or push.
       Returns NaN for bad inputs so callers can refuse to summarize. */
    if(!b || b.result === "pending" || b.result === "push") return 0;
    if(!/^[+-]?\d+$/.test(String(b.price).trim())) return NaN; /* americanToDecimal throws on garbage */
    var dec = M.americanToDecimal(Number(b.price));
    var stake = Number(b.stake);
    if(!(dec > 1) || !(stake > 0) || !isFinite(dec) || !isFinite(stake)) return NaN;
    if(b.result === "win") return round(stake * (dec - 1), 2);
    if(b.result === "loss") return round(-stake, 2);
    return 0;
  },
  journalCurve: function(bets){
    /* Cumulative profit-over-time for the journal's bankroll curve.
       Settled bets (win/loss/push) sorted by date (id tiebreak, same as
       journalStats); pending bets are excluded; pushes contribute $0 but
       keep their slot so a grinding flat stretch reads honestly. Returns
       one point per settled bet: {date, cum, id}, plus the settled count
       and the final cumulative profit. */
    bets = (bets || []).slice();
    bets.sort(function(a, b){
      var d = String(a.date || "").localeCompare(String(b.date || ""));
      return d || (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    var cum = 0, pts = [];
    bets.forEach(function(b){
      if(!b || b.result === "pending") return;
      var p = M.journalProfit(b);
      if(typeof p !== "number" || !isFinite(p)) return;
      cum = round(cum + p, 2);
      pts.push({ date: String(b.date || ""), cum: cum, id: Number(b.id) || 0 });
    });
    return { points: pts, settled: pts.length,
             final: pts.length ? pts[pts.length-1].cum : 0 };
  },
  journalCSV: function(bets){
    /* Machine-readable export: header + one row per bet, RFC-4180 quoting. */
    var cell = function(v){
      v = (v === undefined || v === null) ? "" : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var rows = [["date","sport","event","market","pick","price","stake","result","profit_usd"]];
    (bets || []).forEach(function(b){
      rows.push([b.date, b.sport, b.event, b.market, b.pick, b.price, b.stake, b.result, M.journalProfit(b)]);
    });
    return rows.map(function(r){ return r.map(cell).join(","); }).join("\n");
  },
  journalStats: function(bets, unitSize){
    /* One honest dashboard: record, net, ROI, win rate, streak, per-sport.
       unitSize: dollars per unit (defaults to 100). */
    bets = (bets || []).slice();
    unitSize = Number(unitSize) > 0 ? Number(unitSize) : 100;
    bets.sort(function(a, b){
      var d = String(a.date || "").localeCompare(String(b.date || ""));
      return d || (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    var s = { n: bets.length, pending: 0, wins: 0, losses: 0, pushes: 0,
              staked: 0, profit: 0, roi: 0, winRate: 0, streak: "—",
              units: 0, unitSize: unitSize, perSport: {} };
    var streakDir = null, streakLen = 0;
    bets.forEach(function(b){
      b.profit = M.journalProfit(b);
      if(b.result === "pending"){ s.pending++; return; }
      var key = String(b.sport || "Other");
      if(!s.perSport[key]) s.perSport[key] = { n: 0, w: 0, l: 0, p: 0, staked: 0, profit: 0 };
      var ps = s.perSport[key];
      if(b.result === "push"){
        s.pushes++; ps.p++;
        return; /* pushes risk nothing — they don't extend or break streaks */
      }
      if(b.result === "win"){
        s.wins++; ps.w++;
        if(streakDir === "W") streakLen++; else { streakDir = "W"; streakLen = 1; }
      } else if(b.result === "loss"){
        s.losses++; ps.l++;
        if(streakDir === "L") streakLen++; else { streakDir = "L"; streakLen = 1; }
      } else { return; }
      s.staked = round(s.staked + Number(b.stake), 2);
      s.profit = round(s.profit + b.profit, 2);
      ps.n++; ps.staked = round(ps.staked + Number(b.stake), 2);
      ps.profit = round(ps.profit + b.profit, 2);
    });
    s.units = round(s.profit / unitSize, 2);
    s.roi = s.staked > 0 ? round(100 * s.profit / s.staked, 2) : 0;
    var decided = s.wins + s.losses;
    s.winRate = decided > 0 ? round(100 * s.wins / decided, 2) : 0;
    s.streak = streakDir ? streakDir + streakLen : "—";
    Object.keys(s.perSport).forEach(function(k){
      var ps = s.perSport[k];
      ps.roi = ps.staked > 0 ? round(100 * ps.profit / ps.staked, 2) : 0;
    });
    return s;
  }
};

if(typeof module !== "undefined" && module.exports){ module.exports = M; }
else { window.BetMath = M; }
})();
