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
  },
  /* ---- line-move alerts (pure candidate computation) ----
     Compares this pull's consensus spread/total against a caller-kept
     baseline {eventId: {sp, tot}} and returns one record per threshold
     crossing: {id, title, anchor, kind:"spread"|"total", from, to, delta}.
     Skips: alerts off (threshold not > 0), games with no baseline yet
     (first look — nothing has "moved"), games already started, missing
     or non-finite consensus. Spread uses the away-side consensus point,
     totals use the Over consensus point — same reference the steam strip
     and sparklines use. Pure. */
  moveAlerts: function(events, baseline, threshold, tsNow){
    var out = [];
    threshold = Number(threshold);
    if(!(threshold > 0)) return out;
    tsNow = (tsNow === undefined) ? Date.now() : tsNow;
    (events||[]).forEach(function(ev){
      if(!ev || ev.id === undefined || ev.id === null) return;
      var ct = Date.parse(ev.commence_time || "");
      if(isFinite(ct) && ct <= tsNow) return; /* started: the move already happened */
      var b = (baseline||{})[ev.id];
      if(!b) return;
      var cons = L.consensus(ev.bookmakers||[], ev);
      var anchor = "game-" + String(ev.id).replace(/[^a-zA-Z0-9_-]/g, "");
      var title = ev.away_team + " @ " + ev.home_team;
      var sp = (cons.spread.a && cons.spread.a.pt != null) ? cons.spread.a.pt : null;
      var tot = (cons.total.o && cons.total.o.pt != null) ? cons.total.o.pt : null;
      if(sp != null && b.sp != null && isFinite(b.sp)){
        var d = sp - b.sp;
        if(Math.abs(d) >= threshold)
          out.push({ id: ev.id, title: title, anchor: anchor, kind: "spread",
                     from: b.sp, to: sp, delta: d });
      }
      if(tot != null && b.tot != null && isFinite(b.tot)){
        var d2 = tot - b.tot;
        if(Math.abs(d2) >= threshold)
          out.push({ id: ev.id, title: title, anchor: anchor, kind: "total",
                     from: b.tot, to: tot, delta: d2 });
      }
    });
    return out;
  },
  /* Baseline snapshot for alerts: {eventId: {sp, tot}} from this pull's
     consensus — caller's baseline is REPLACED with this after each pull,
     so an alert means "moved since your last look", never a re-fire of
     an old move. Pure. */
  alertBaseline: function(events){
    var base = {};
    (events||[]).forEach(function(ev){
      if(!ev || ev.id === undefined || ev.id === null) return;
      var cons = L.consensus(ev.bookmakers||[], ev);
      var sp = (cons.spread.a && cons.spread.a.pt != null) ? cons.spread.a.pt : null;
      var tot = (cons.total.o && cons.total.o.pt != null) ? cons.total.o.pt : null;
      if(sp != null || tot != null) base[ev.id] = { sp: sp, tot: tot };
    });
    return base;
  },
  /* ---- per-game line-movement history (sparkline charts) ----
     hist: {eventId: [[t, spreadAwayPt, totalOverPt], ...]}, oldest first,
     tracked in this browser only — the raw material for the movement chart
     on each game card. recordSample appends the latest consensus; a sample
     identical to the previous one only extends that sample's timestamp, so a
     flat line keeps growing instead of stacking duplicate points. Caps: 72
     samples per game, 200 games (oldest-tracked evicted first). Pure. */
  recordSample: function(hist, id, t, sp, tot){
    hist = hist || {};
    id = String(id);
    var s = hist[id];
    if(!s){ s = []; hist[id] = s; }
    var last = s[s.length-1];
    if(last && last[1] === sp && last[2] === tot){ last[0] = t; }
    else {
      s.push([t, sp, tot]);
      if(s.length > 72) s.splice(0, s.length - 72);
    }
    var ids = Object.keys(hist);
    if(ids.length > 200){
      ids.sort(function(a,b){ return ((hist[a][0]||[])[0]||0) - ((hist[b][0]||[])[0]||0); });
      for(var i=0; i<ids.length-200; i++) delete hist[ids[i]];
    }
    return hist;
  },
  /* Numeric series for one kind ("sp" = away spread consensus, "tot" = total
     consensus), skipping nulls — a market with no posted line leaves a gap,
     never an invented point. */
  sparkSeries: function(samples, kind){
    var idx = kind === "tot" ? 2 : 1, out = [];
    (samples||[]).forEach(function(p){
      if(p && p[idx] !== null && p[idx] !== undefined && isFinite(p[idx])) out.push(Number(p[idx]));
    });
    return out;
  },
  /* ---- cross-book arbitrage ("sure bets") ----
     A market arbs when the best available price on EVERY outcome, taken at
     different books, implies a total probability under 100%. Prices are
     decimal; stakes are the standard dutch-book split for a $100 total.
     A same-book "arb" is never shown — you can't bet both sides of a
     palpable error at one book and expect to get paid. Stale lines misfire
     and books limit arb bettors fast, so the strip says so out loud. */
  stakeSplit: function(prices, total){
    total = (total === undefined) ? 100 : total;
    var inv = prices.map(function(p){ return 1/p; });
    var s = inv.reduce(function(a,b){ return a+b; }, 0);
    return {
      stakes: inv.map(function(v){ return Math.round(total*v/s*100)/100; }),
      profit: Math.round((total/s - total)*100)/100,
      profitPct: Math.round((1/s - 1)*10000)/100
    };
  },
  /* Best decimal price for one named outcome, optionally pinned to an exact
     line (spreads/totals pair sides at the same number). Returns
     {name, book, bookTitle, price, point} or null. */
  bestAt: function(books, mkey, name, point){
    var best = null;
    (books||[]).forEach(function(bk){
      var o = L.oneOutcome(bk, mkey, name);
      if(!o || !isFinite(o.price) || o.price <= 1) return;
      if(point !== undefined &&
         (o.point === null || o.point === undefined ||
          Math.abs(o.point - point) > 1e-9)) return;
      if(!best || o.price > best.price)
        best = { name: name, book: bk.key, bookTitle: bk.title || bk.key,
                 price: o.price, point: (o.point == null ? null : o.point) };
    });
    return best;
  },
  /* True only when legs cover every outcome, come from at least two books,
     and sum under 100% implied. Returns the arb record or null. */
  checkArb: function(legs, mkey, label){
    legs = (legs||[]).filter(function(l){ return !!l; });
    if(legs.length < 2) return null;
    var distinct = {};
    legs.forEach(function(l){ distinct[l.book] = 1; });
    if(Object.keys(distinct).length < 2) return null;
    var sum = legs.reduce(function(s, l){ return s + 1/l.price; }, 0);
    if(!(sum < 1 - 1e-9)) return null;
    var sp = L.stakeSplit(legs.map(function(l){ return l.price; }), 100);
    return { market: mkey, marketLabel: label, legs: legs,
             profitPct: sp.profitPct, stakes: sp.stakes,
             total: 100, profit: sp.profit };
  },
  /* Every arb on one event: moneyline (n-way, so the EPL draw counts),
     then spread and total pairings at each posted line. */
  arbsForEvent: function(ev){
    var books = ev.bookmakers || [];
    if(books.length < 2) return [];
    var out = [];
    /* moneyline: outcome names in a stable order — away, home, then extras */
    var names = [];
    [ev.away_team, ev.home_team].forEach(function(n){
      if(n && names.indexOf(n) < 0) names.push(n);
    });
    books.forEach(function(bk){
      L.outcomesOf(bk, "h2h").forEach(function(o){
        if(o && o.name && names.indexOf(o.name) < 0) names.push(o.name);
      });
    });
    var ml = L.checkArb(names.map(function(nm){
      return L.bestAt(books, "h2h", nm);
    }), "h2h", "Moneyline");
    if(ml) out.push(ml);
    /* spreads: away -6.5 and home +6.5 are the same line — pair them */
    var seenSp = {};
    books.forEach(function(bk){
      L.outcomesOf(bk, "spreads").forEach(function(o){
        if(!o || o.name !== ev.away_team || o.point == null) return;
        var k = "sp" + Math.round(o.point*100);
        if(seenSp[k]) return;
        seenSp[k] = 1;
        var a = L.checkArb([
          L.bestAt(books, "spreads", ev.away_team, o.point),
          L.bestAt(books, "spreads", ev.home_team, -o.point)
        ], "spreads", "Spread " + L.fmtPt(o.point));
        if(a) out.push(a);
      });
    });
    /* totals: Over and Under must share the number */
    var seenTot = {};
    books.forEach(function(bk){
      L.outcomesOf(bk, "totals").forEach(function(o){
        if(!o || o.name !== "Over" || o.point == null) return;
        var k = "tot" + Math.round(o.point*100);
        if(seenTot[k]) return;
        seenTot[k] = 1;
        var t = L.checkArb([
          L.bestAt(books, "totals", "Over", o.point),
          L.bestAt(books, "totals", "Under", o.point)
        ], "totals", "Total " + o.point);
        if(t) out.push(t);
      });
    });
    return out;
  },
  /* Flatten every event's arbs for the board strip. */
  arbEntries: function(events){
    var out = [];
    (events||[]).forEach(function(ev){
      var arbs = L.arbsForEvent(ev);
      if(!arbs.length) return;
      var anchor = "game-" + String(ev.id).replace(/[^a-zA-Z0-9_-]/g, "");
      var title = ev.away_team + " @ " + ev.home_team;
      arbs.forEach(function(a){
        out.push({ id: ev.id, anchor: anchor, title: title,
                   market: a.market, marketLabel: a.marketLabel, legs: a.legs,
                   profitPct: a.profitPct, stakes: a.stakes,
                   total: a.total, profit: a.profit });
      });
    });
    return out;
  },
  /* Richest arbs first; stable title tie-break so the strip never shuffles. */
  biggestArbs: function(entries, n){
    n = (n === undefined) ? 5 : n;
    return (entries||[]).slice().sort(function(a, b){
      var d = b.profitPct - a.profitPct;
      return d !== 0 ? d : (a.title < b.title ? -1 : (a.title > b.title ? 1 : 0));
    }).slice(0, Math.max(0, n));
  },
  /* SVG geometry for a sparkline. Returns null with fewer than 2 points —
     a single dot is not a trend. A flat series draws a mid-height line
     (no divide-by-zero). Returns {line, area, lx, ly}: the line path, the
     area-fill path, and the last point's coords for the end dot. */
  spark: function(vals, w, h){
    vals = vals || [];
    if(vals.length < 2) return null;
    var p = 3, iw = Math.max(1, w - 2*p), ih = Math.max(1, h - 2*p);
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    function xy(i){
      var x = p + iw * i / (vals.length - 1);
      var y = (max === min) ? p + ih/2 : p + ih * (1 - (vals[i]-min)/(max-min));
      return [Math.round(x*10)/10, Math.round(y*10)/10];
    }
    var d = "", i, pt;
    for(i=0; i<vals.length; i++){ pt = xy(i); d += (i ? "L" : "M") + pt[0] + "," + pt[1]; }
    var f = xy(0), l = xy(vals.length-1), base = p + ih;
    return { line: d, area: d + "L" + l[0] + "," + base + "L" + f[0] + "," + base + "Z",
             lx: l[0], ly: l[1] };
  }
};
if(typeof module !== "undefined" && module.exports){ module.exports = L; }
else { window.OddsLogic = L; }
})();
