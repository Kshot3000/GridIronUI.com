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
  round: round
};

if(typeof module !== "undefined" && module.exports){ module.exports = M; }
else { window.BetMath = M; }
})();
