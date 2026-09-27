/* GridIronUI odds-board logic — pure functions, no DOM.
   Browser: window.OddsLogic · node: module.exports */
(function(){
"use strict";
var L = {
  dec2am: function(d){
    d = Number(d);
    return d >= 2 ? "+"+Math.round((d-1)*100) : Math.round(-100/(d-1));
  },
  fmtPt: function(p){ return (p>0?"+":"")+p; },
  shortName: function(name){ return String(name).split(" ").pop(); },
  outcomesOf: function(bk, mkey){
    var m = (bk.markets||[]).filter(function(m){return m.key===mkey;})[0];
    return m ? m.outcomes : [];
  },
  oneOutcome: function(bk, mkey, name){
    return L.outcomesOf(bk,mkey).filter(function(x){return x.name===name;})[0] || null;
  },
  /* Spreads shade symmetrically (fav -6.5 <-> dog +6.5): for the listed side a
     HIGHER point is always better. Tie-break on price. Returns {a,h} of
     "bookKey|point|price" identifiers (or null). */
  bestSpread: function(books, ev){
    var res = {a:null, h:null};
    [["a",ev.away_team],["h",ev.home_team]].forEach(function(pair){
      var side=pair[0], name=pair[1], best=null;
      books.forEach(function(bk){
        var o = L.oneOutcome(bk,"spreads",name);
        if(o) best = L.pickSpread(best, bk.key, o);
      });
      if(best) res[side]=best.k;
    });
    return res;
  },
  pickSpread: function(cur, bkKey, o){
    var k = bkKey+"|"+o.point+"|"+o.price;
    if(!cur) return {k:k, pt:o.point, pr:o.price};
    var betterPt = o.point > cur.pt + 1e-9;
    var samePt = Math.abs(o.point-cur.pt) < 1e-9;
    if(betterPt || (samePt && o.price > cur.pr)) return {k:k, pt:o.point, pr:o.price};
    return cur;
  },
  /* Totals: Over bettors want the LOWEST total; Under bettors the HIGHEST. */
  bestTotal: function(books){
    var res={o:null,u:null};
    [["o","Over",true],["u","Under",false]].forEach(function(cfg){
      var slot=cfg[0], name=cfg[1], wantLow=cfg[2], best=null;
      books.forEach(function(bk){
        var o = L.oneOutcome(bk,"totals",name);
        if(!o) return;
        var k = bk.key+"|"+o.point+"|"+o.price;
        if(!best) best={k:k,pt:o.point,pr:o.price};
        else{
          var better = wantLow ? (o.point < best.pt-1e-9) : (o.point > best.pt+1e-9);
          var same = Math.abs(o.point-best.pt)<1e-9;
          if(better || (same && o.price>best.pr)) best={k:k,pt:o.point,pr:o.price};
        }
      });
      if(best) res[slot]=best.k;
    });
    return res;
  },
  /* Moneyline: highest decimal price wins. */
  bestML: function(books, ev){
    var res={a:null,h:null};
    [["a",ev.away_team],["h",ev.home_team]].forEach(function(pair){
      var side=pair[0], name=pair[1], best=null;
      books.forEach(function(bk){
        var o = L.oneOutcome(bk,"h2h",name);
        if(!o) return;
        var k = bk.key+"|"+o.price;
        if(!best || o.price > best.pr) best={k:k, pr:o.price};
      });
      if(best) res[side]=best.k;
    });
    return res;
  },
  /* count best-prices per book; returns top book key (or null) */
  topBook: function(books, bestMaps){
    var count = {};
    bestMaps.forEach(function(m){
      Object.keys(m).forEach(function(side){
        var v = m[side];
        if(v){ var bk = v.split("|")[0]; count[bk]=(count[bk]||0)+1; }
      });
    });
    var top=null;
    Object.keys(count).forEach(function(bk){ if(!top || count[bk]>count[top]) top=bk; });
    return top ? {key:top, count:count[top]} : null;
  }
};
if(typeof module !== "undefined" && module.exports){ module.exports = L; }
else { window.OddsLogic = L; }
})();
