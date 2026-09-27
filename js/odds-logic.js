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
  /* Odds API sport keys -> teams.json identity-league keys. College leagues
     have no identity directory, so they return null (callers fall back to
     the plain-text title). */
  sportLeague: function(sportKey){
    var m = {
      americanfootball_nfl:"nfl", basketball_nba:"nba", baseball_mlb:"mlb",
      icehockey_nhl:"nhl", soccer_epl:"epl"
    };
    return m[String(sportKey)] || null;
  },
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
  /* Median of a numeric list; null when empty. Median beats mean here —
     one book hanging a wild number shouldn't drag the reference point. */
  median: function(nums){
    var s = nums.filter(function(n){ return isFinite(n); }).sort(function(x,y){ return x-y; });
    if(!s.length) return null;
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m-1]+s[m])/2;
  },
  /* Market consensus: the median line across every listed book for this game.
     Slots are null where no book posts that market — never invents a line.
     Returns {n, spread:{a:{pt},h:{pt}}, total:{o:{pt},u:{pt}}, ml:{a:{pr},h:{pr}}}. */
  consensus: function(books, ev){
    function collect(mkey, name, field){
      var vals = [];
      books.forEach(function(bk){
        var o = L.oneOutcome(bk, mkey, name);
        if(o && isFinite(o[field])) vals.push(Number(o[field]));
      });
      return L.median(vals);
    }
    function slot(v, k){ return v===null ? null : (function(o){ o[k]=v; return o; })({}); }
    return {
      n: books.length,
      spread: { a: slot(collect("spreads", ev.away_team, "point"), "pt"),
                h: slot(collect("spreads", ev.home_team, "point"), "pt") },
      total:  { o: slot(collect("totals", "Over", "point"), "pt"),
                u: slot(collect("totals", "Under", "point"), "pt") },
      ml:     { a: slot(collect("h2h", ev.away_team, "price"), "pr"),
                h: slot(collect("h2h", ev.home_team, "price"), "pr") }
    };
  },
  /* Off-market flag: a book's line differs from the consensus by a meaningful
     amount — a full point on spreads/totals, or 3% of implied probability on
     moneylines. That's either a stale line or a deliberate lean; either way
     it's where the value (or the trap) lives. Single-book boards never flag. */
  offMarket: function(cons, mkey, side, point, price){
    if(!cons) return false;
    var c = null;
    if(mkey==="spreads")      c = side==="a" ? cons.spread.a : cons.spread.h;
    else if(mkey==="totals")  c = side==="o" ? cons.total.o  : cons.total.u;
    else if(mkey==="h2h")     c = side==="a" ? cons.ml.a     : cons.ml.h;
    else return false;
    if(!c) return false;
    if(mkey==="h2h") return Math.abs(1/price - 1/c.pr) >= 0.03 - 1e-9;
    return Math.abs(point - c.pt) >= 1.0 - 1e-9;
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
  },
  /* ---- biggest line movers ("steam watch") ----
     Builds one candidate per event per kind (spread / total) comparing the
     visitor's personal opener (first consensus this browser ever saw, stored
     in the giu_odds_open_* maps) against the current consensus. Entries
     without an opener, or without both an open and a current number, are
     skipped — a game only qualifies once it has real movement history.
     Returns [{id, anchor, title, kind, openFmt, delta, dir}]; delta is in
     points and can be negative. Pure — fully testable. */
  moverEntries: function(events, opens){
    var out = [];
    (events||[]).forEach(function(ev){
      var op = (opens||{})[ev && ev.id];
      if(!op) return;
      var cons = L.consensus(ev.bookmakers||[], ev);
      var anchor = "game-" + String(ev.id).replace(/[^a-zA-Z0-9_-]/g, "");
      var title = ev.away_team + " @ " + ev.home_team;
      if(op.sp!=null && cons.spread.a && cons.spread.a.pt!=null){
        out.push({ id: ev.id, anchor: anchor, title: title, kind: "spread",
                   openFmt: L.fmtPt(op.sp), delta: cons.spread.a.pt - op.sp });
      }
      if(op.tot!=null && cons.total.o && cons.total.o.pt!=null){
        out.push({ id: ev.id, anchor: anchor, title: title, kind: "total",
                   openFmt: String(op.tot), delta: cons.total.o.pt - op.tot });
      }
    });
    return out;
  },
  /* Biggest movers first by |delta| (points); zero deltas and anything
     below 0.05 points are noise and never shown. Stable tie-break on
     title so the strip doesn't shuffle between refreshes. */
  biggestMovers: function(entries, n){
    n = (n === undefined) ? 5 : n;
    return (entries||[])
      .filter(function(e){ return Math.abs(e.delta) >= 0.05 - 1e-9; })
      .sort(function(a,b){
        var d = Math.abs(b.delta) - Math.abs(a.delta);
        return d !== 0 ? d : (a.title < b.title ? -1 : (a.title > b.title ? 1 : 0));
      })
      .slice(0, Math.max(0, n));
  }
};
if(typeof module !== "undefined" && module.exports){ module.exports = L; }
else { window.OddsLogic = L; }
})();
