/* GridIronUI odds-board logic — pure functions, no DOM.
   Browser: window.OddsLogic · node: module.exports */
(function(){
"use strict";
var L = {
  dec2am: function(d){
    d = Number(d);
    return d >= 2 ? "+"+Math.round((d-1)*100) : Math.round(-100/(d-1));
  },
  /* Kalshi prediction-market cents -> American moneyline, for the odds board's
     no-key "market line" fallback. p is whole cents (1..99); 50c is even money.
     A cent price implies prob p/100, i.e. decimal odds 100/p — the same
     dec2am path the board's fair lines use. Returns "+144" / "-133" style, or
     null when there's nothing priceable (settled extremes are filtered out
     before this is ever called; this guard is belt-and-suspenders). */
  centsToAm: function(p){
    p = Number(p);
    if(!isFinite(p) || p <= 0 || p >= 100) return null;
    return String(L.dec2am(100/p));
  },
  /* ---------- no-key "market line" fallback (odds board) ----------
     Pure HTML builders for the Kalshi snapshot section the odds board shows
     when the visitor hasn't connected an Odds API key. `games` are normalized
     via Kalshi.games() with settled games already filtered out by the caller;
     `updatedAt` is the snapshot's ISO timestamp; `isStale` comes from
     Kalshi.stale() so this module never owns the staleness rule. Every price
     is a real snapshot number, never invented; every string escaped. Returns
     "" when there is nothing priceable to show (caller then renders the
     plain no-key state). */
  mkEsc: function(s){
    return String(s == null ? "" : s).replace(/[&<>\"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; });
  },
  mkWhen: function(ms){
    if(ms === null || ms === undefined || !isFinite(ms)) return "";
    try{
      var d = new Date(ms);
      return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+
        " · "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    }catch(e){ return ""; }
  },
  marketTeamRow: function(t, badge){
    var am = L.centsToAm(t.price);
    if(am === null) return "";
    var book = t.book ? "book "+t.book.bid+"\u2013"+t.book.ask+"\u00a2" : "";
    var vol = t.vol ? '<span style="color:var(--faint);font-weight:400"> · '+L.mkEsc(t.vol)+"</span>" : "";
    return '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--line-soft)">'+
      '<div style="min-width:0"><strong style="color:var(--text)">'+L.mkEsc(t.name)+"</strong>"+vol+"</div>"+
      '<div style="display:flex;align-items:baseline;gap:12px;white-space:nowrap">'+
        '<span class="num" style="color:var(--muted);font-size:.82rem" title="Midpoint of the Kalshi bid/ask book">'+t.price+"\u00a2"+
          (book ? ' <span style="color:var(--faint);font-size:.72rem">('+L.mkEsc(book)+")</span>" : "")+(badge||"")+"</span>"+
        '<span class="num" style="font-weight:800;color:var(--gold);font-size:1.02rem;min-width:58px;text-align:right">'+L.mkEsc(am)+"</span>"+
      "</div></div>";
  },
  /* ---------- find-a-game search (odds board, v1.163.0) ----------
     Pure AND-term matching for the board's finder, shared by the keyed
     cards (js/odds.js stamps the same text as data-find) and the no-key
     market-line cards below. The query splits into terms and EVERY term
     must appear, so "chiefs bills" narrows across fields while a term
     that appears nowhere matches nothing, never everything. Garbage in
     -> "" text (which matches only a blank query), never a throw. */
  searchTerms: function(q){
    return String(q == null ? "" : q).toLowerCase().split(/\s+/).filter(function(t){ return !!t; });
  },
  marketSearchText: function(g){
    if(!g) return "";
    var parts = [];
    if(g.title) parts.push(String(g.title));
    if(g.sub) parts.push(String(g.sub));
    (Array.isArray(g.teams) ? g.teams : []).forEach(function(t){
      if(t && t.name) parts.push(String(t.name));
    });
    return parts.join(" ").toLowerCase();
  },
  marketMatchesSearch: function(g, q){
    var terms = L.searchTerms(q);
    if(!terms.length) return true;
    var hay = L.marketSearchText(g);
    if(!hay) return false;
    for(var i = 0; i < terms.length; i++){ if(hay.indexOf(terms[i]) === -1) return false; }
    return true;
  },
  marketGameCard: function(g, when, moveMap, prevAt, capExtra){
    /* moveMap is an optional {teamName: delta} for this game, from the
       snapshot's baked snapshot-to-snapshot diff (K.diffMoves contract).
       kalshi-logic.js loads after this module on odds.html, so the badge
       builder is resolved at call time, never at load time. */
    var badgeFor = function(team){
      if(typeof window !== "undefined" && window.Kalshi && window.Kalshi.moveBadge && moveMap)
        return window.Kalshi.moveBadge(moveMap[team], team, prevAt);
      return "";
    };
    var rows = (g.teams||[]).map(function(t){ return L.marketTeamRow(t, badgeFor(t.name)); }).join("");
    if(!rows) return "";
    /* The date line uses Kalshi's own sub_title ("PIT vs CLE (Oct 1)") — NOT
       the market close_time, which Kalshi sets days after kickoff (in-play
       trading window), so formatting it as the game time would mislead. */
    var t = g.sub ? L.mkEsc(g.sub) : "";
    /* capExtra (v2.0.5): a card past the section's first-page cap renders
       hidden and flagged, so the caller's Show-all toggle and find-a-game
       can govern it — the card is in the DOM with its data-find text, so
       search covers the whole snapshot, never just the visible page. */
    return '<div class="card game-card" data-find="'+L.mkEsc(L.marketSearchText(g))+'"'+
      (capExtra ? ' data-cap-extra="1" style="display:none"' : "")+'>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px">'+
        '<h3 style="margin:0;font-size:1rem">'+L.mkEsc(g.title)+'</h3><span class="tag green">Kalshi</span></div>'+
      '<div class="game-meta" style="margin-bottom:4px">'+
        (t ? "<span>"+t+"</span>" : "")+
        (when ? "<span>snapshot "+L.mkEsc(when)+"</span>" : "")+"</div>"+
      rows+
      '<p style="margin:10px 0 0;font-size:.75rem;color:var(--faint)">A '+L.mkEsc(String((g.teams[0]||{}).price||""))+
        "\u00a2 contract pays $1 if that team wins — the price is the market's implied chance.</p>"+
    "</div>";
  },
  marketSectionHtml: function(games, updatedAt, isStale, moves, prevAt, cap){
    games = (games||[]).filter(function(g){ return g && g.teams && g.teams.length >= 2; });
    if(!games.length) return "";
    var when = L.mkWhen(Date.parse(updatedAt || ""));
    if(isStale){
      return '<div class="notice" style="margin-bottom:18px"><span class="tag green">Kalshi</span> '+
        "<strong>Snapshot is stale</strong> (over 6 hours old) — prices withheld until the next refresh. "+
        "Add your free Odds API key above for live sportsbook lines.</div>";
    }
    /* Snapshot-to-snapshot moves ride along when the caller passes the
       snapshot's baked diff (odds.js does); without it the cards render
       exactly as before — the section degrades, never breaks. */
    var moveMap = {};
    (moves || []).forEach(function(mv){
      if(!mv || !mv.event_ticker) return;
      (moveMap[mv.event_ticker] = moveMap[mv.event_ticker] || {})[mv.team] = mv.delta;
    });
    /* First-page cap (v2.0.5): a 257-game college snapshot rendered whole
       would flood the board. When the caller passes a positive cap below
       the game count, games past the cap render hidden (data-cap-extra)
       behind an honest count + Show-all toggle — the same discipline as
       the markets page. No cap (NFL/MLB) renders exactly as before. */
    cap = (typeof cap === "number" && isFinite(cap) && cap > 0) ? Math.floor(cap) : 0;
    var capped = cap > 0 && games.length > cap;
    var cards = games.map(function(g, i){ return L.marketGameCard(g, when, moveMap[g.ticker], prevAt, capped && i >= cap); }).join("");
    if(!cards) return "";
    var more = "";
    if(capped){
      more = '<div class="market-more" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:14px">'+
        '<p id="marketMoreNote" role="status" style="margin:0;color:var(--muted);font-size:.88rem">Showing the '+cap+
          " soonest of "+games.length+" games — the find-a-game search above covers all "+games.length+".</p>"+
        '<button class="btn btn-ghost btn-sm" id="marketMoreBtn" type="button" aria-expanded="false" data-total="'+games.length+
          '" data-cap="'+cap+'">Show all '+games.length+" games</button></div>";
    }
    return '<div style="margin-bottom:26px">'+
      '<div class="section-head" style="margin-bottom:10px"><div>'+
        '<span class="kicker">Market line · no key needed</span><h2>Real prices, right now</h2></div>'+
        '<a class="btn btn-ghost btn-sm" href="markets.html">Full prediction markets →</a></div>'+
      '<p style="max-width:760px;color:var(--muted);font-size:.9rem;margin:0 0 14px">Live <strong style="color:var(--text)">Kalshi</strong> '+
        "prediction-market prices — real money on both sides — from our server snapshot"+
        (when ? ", updated "+L.mkEsc(when) : "")+
        ". Add your free Odds API key above to stack sportsbook lines against the market.</p>"+
      '<div class="grid grid-2">'+cards+"</div>"+more+"</div>";
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
  /* No-vig fair moneyline: strip the book hold out of the consensus price
     pair. Each side's fair implied probability is its consensus probability
     rescaled so the two sum to 100%; fair prices are those probs converted
     back to American. Returns {a:{am,prob}, h:{am,prob}, holdPct} or null
     when either side of the consensus pair is missing — a fair price off
     one side is a guess, and this board doesn't guess. */
  fairMoneyline: function(cons){
    var a = cons && cons.ml && cons.ml.a, h = cons && cons.ml && cons.ml.h;
    if(!a || !h || !(a.pr > 1) || !(h.pr > 1)) return null;
    var pa = 1/a.pr, ph = 1/h.pr, tot = pa+ph;
    var fa = pa/tot, fh = ph/tot;
    function r4(x){ return Math.round(x*10000)/10000; }
    return {
      a: { am: String(L.dec2am(1/fa)), prob: r4(fa*100) },
      h: { am: String(L.dec2am(1/fh)), prob: r4(fh*100) },
      holdPct: Math.round((tot-1)*100*100)/100
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
  /* ---- cross-book middle finder (v1.140.0) ----
     A "middle" is two bets on the same game at DIFFERENT books whose numbers
     disagree enough that one final score cashes BOTH sides: e.g. Bears -2.5
     @ book A and Packers +3.5 @ book B — a Bears win by exactly 3 lands
     between 2.5 and 3.5, so both legs win. Same-book pairs never count (one
     book won't let you middle its own line), and a window that can't cash
     both sides is not a middle: final margins are whole numbers, so a spread
     window must contain a whole number strictly inside it; totals must
     disagree by a full point or more. Records carry the window and the juice
     cost of staking $100 on each leg — "win both if the final lands between
     X and Y" — never an implied probability edge. */
  /* one outcome's {point, price} for a named side at one book, or null when
     the book posts no usable number. price is null (not fatal) when the
     price is missing or invalid — the window is still real, its cost isn't. */
  midOutcome: function(bk, mkey, name){
    var o = L.oneOutcome(bk, mkey, name);
    if(!o || o.point === null || o.point === undefined || !isFinite(o.point)) return null;
    var pr = Number(o.price);
    return { point: Number(o.point), price: (isFinite(pr) && pr > 1) ? pr : null };
  },
  /* juice of staking $100 on each leg: miss = the worse one-sided outcome
     (win the cheaper leg, lose the other — exactly one leg always wins a
     middle pair), hit = both legs cash. Nulls when a price is unknown. */
  midJuice: function(d1, d2){
    if(d1 === null || d2 === null) return { costMiss: null, winBoth: null };
    function r2(x){ return Math.round(x*100)/100; }
    return { costMiss: r2(100*Math.min(d1, d2) - 200),
             winBoth: r2(100*(d1-1) + 100*(d2-1)) };
  },
  /* true when a whole number sits strictly inside (lo, hi) */
  midHasInt: function(lo, hi){
    return Math.floor(lo) + 1 < hi - 1e-9;
  },
  /* every middle on one event: each ordered pair of distinct books, both
     cross assignments (away@A+home@B). Returns records shaped like the arb
     entries: {id, anchor, title, kind, marketLabel, legs, lo, hi, width,
     costMiss, winBoth}. */
  middlesForEvent: function(ev){
    var books = ev.bookmakers || [];
    if(!ev || ev.id === undefined || ev.id === null || books.length < 2) return [];
    var out = [];
    var anchor = "game-" + String(ev.id).replace(/[^a-zA-Z0-9_-]/g, "");
    var title = ev.away_team + " @ " + ev.home_team;
    function leg(name, bk, mo){
      return { name: name, book: bk.key, bookTitle: bk.title || bk.key,
               point: mo.point, price: mo.price };
    }
    function push(kind, label, legA, legB, lo, hi){
      var j = L.midJuice(legA.price, legB.price);
      out.push({ id: ev.id, anchor: anchor, title: title, kind: kind,
                 marketLabel: label, legs: [legA, legB],
                 lo: lo, hi: hi, width: Math.round((hi-lo)*100)/100,
                 costMiss: j.costMiss, winBoth: j.winBoth });
    }
    for(var i=0; i<books.length; i++){
      for(var k=0; k<books.length; k++){
        if(i === k) continue; /* same-book pairs never count */
        var A = books[i], B = books[k];
        /* spreads, in away-margin terms: away@A wins iff margin > -pa,
           home@B wins iff margin < pb — both win iff -pa < margin < pb,
           i.e. pa + pb > 0, with a whole number strictly inside */
        var pa = L.midOutcome(A, "spreads", ev.away_team);
        var pb = L.midOutcome(B, "spreads", ev.home_team);
        if(pa && pb && pa.point + pb.point > 1e-9){
          var lo = -pa.point, hi = pb.point;
          if(L.midHasInt(lo, hi))
            push("spread", "Spread",
                 leg(ev.away_team, A, pa), leg(ev.home_team, B, pb), lo, hi);
        }
        /* totals: over@A wins iff total > oa, under@B iff total < ub.
           The board's rule: the books must disagree by a full point or more. */
        var oa = L.midOutcome(A, "totals", "Over");
        var ub = L.midOutcome(B, "totals", "Under");
        if(oa && ub && ub.point - oa.point >= 1 - 1e-9)
          push("total", "Total",
               leg("Over", A, oa), leg("Under", B, ub), oa.point, ub.point);
      }
    }
    return out;
  },
  /* every middle on the board, across all events */
  findMiddles: function(events){
    var out = [];
    (events||[]).forEach(function(ev){
      if(!ev) return;
      L.middlesForEvent(ev).forEach(function(m){ out.push(m); });
    });
    return out;
  },
  /* widest windows first; stable title tie-break so the strip never shuffles */
  biggestMiddles: function(entries, n){
    n = (n === undefined) ? 5 : n;
    return (entries||[]).slice().sort(function(a, b){
      var d = b.width - a.width;
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
