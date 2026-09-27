/* GridIronUI bet-slip logic — pure functions, no DOM.
   Browser: window.OddsSlip · node: module.exports
   A leg: {id, game, market, side, book, bookTitle, label, price (decimal)} */
(function(){
"use strict";
var S = {
  /* decimal odds -> american ("+150" or -110) */
  dec2am: function(d){
    d = Number(d);
    if(!(d > 1)) return "—";
    return d >= 2 ? "+"+Math.round((d-1)*100) : Math.round(-100/(d-1));
  },
  /* combined decimal odds for a parlay/multi; empty slip -> 1 */
  combined: function(legs){
    return legs.reduce(function(acc,l){ return acc * Number(l.price); }, 1);
  },
  /* stake math; null when there is nothing to price */
  payout: function(legs, stake){
    if(!legs.length) return null;
    stake = Number(stake) || 0;
    var c = S.combined(legs);
    var total = stake * c;
    return { combined:c, combinedAm:S.dec2am(c), implied:S.implied(legs),
             total:total, profit:total - stake };
  },
  /* break-even win probability of the parlay, 0-1: 1 / combined decimal.
     A +300 parlay must win 25% of the time to break even. Null when empty. */
  implied: function(legs){
    if(!legs.length) return null;
    var c = S.combined(legs);
    return c > 1 ? 1 / c : null;
  },
  /* groups of legs sharing one game (2+ legs) — books treat same-game legs
     as correlated, so an independence-assuming parlay price won't hold there.
     Returns [{game, sides:[...]}]; empty when every leg is its own game. */
  sameGame: function(legs){
    var byGame = {}, order = [];
    legs.forEach(function(l){
      var g = (l && l.game) ? String(l.game) : "";
      if(!g) return;
      if(!byGame[g]){ byGame[g] = { game:g, sides:[] }; order.push(g); }
      byGame[g].sides.push(String(l.side || "?"));
    });
    return order.filter(function(g){ return byGame[g].sides.length > 1; })
                .map(function(g){ return byGame[g]; });
  },
  /* toggle a leg by id; returns true if added, false if removed */
  toggle: function(legs, leg){
    for(var i=0;i<legs.length;i++){
      if(legs[i].id === leg.id){ legs.splice(i,1); return false; }
    }
    legs.push(leg);
    return true;
  },
  remove: function(legs, id){
    for(var i=0;i<legs.length;i++){
      if(legs[i].id === id){ legs.splice(i,1); return; }
    }
  },
  clear: function(legs){ legs.length = 0; },
  has: function(legs, id){
    for(var i=0;i<legs.length;i++){ if(legs[i].id === id) return true; }
    return false;
  },
  /* re-price legs against the board's fresh id->decimal map.
     Mutates legs in place; returns ids whose price moved. */
  reprice: function(legs, idToPrice){
    var moved = [];
    legs.forEach(function(l){
      var p = idToPrice[l.id];
      if(p !== undefined && Math.abs(Number(p) - Number(l.price)) > 0.0001){
        l.prevPrice = l.price;
        l.price = Number(p);
        moved.push(l.id);
      }
    });
    return moved;
  }
};
if(typeof module !== "undefined" && module.exports){ module.exports = S; }
else { window.OddsSlip = S; }
})();
