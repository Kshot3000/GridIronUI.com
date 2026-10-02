/* GridIronUI Kalshi logic — pure functions over the server-side snapshot
   (data/kalshi-nfl.json). Kalshi's public API rejects browser cross-origin
   requests, so the improvement-loop script scripts/fetch-kalshi.py fetches it
   server-side and commits a timestamped snapshot; this module only interprets
   real snapshot numbers — it never invents a price. Prices are whole cents. */
(function(){
"use strict";
var K = {};

/* Number(null) is 0 and Number("") is 0 — both would masquerade as a real
   0¢ price. Only parse genuine values; everything else is missing. */
function num(v){
  if(v === null || v === undefined || v === "") return NaN;
  v = Number(v);
  return isFinite(v) ? v : NaN;
}

/* Yes price for a team, in cents: midpoint of the bid/ask book; falls back to
   the last trade when the book is empty; null when nothing is priced. */
K.price = function(m){
  m = m || {};
  var b = num(m.yes_bid), a = num(m.yes_ask);
  if(isFinite(b) && isFinite(a) && b >= 0 && a >= b) return Math.round((b + a) / 2);
  var l = num(m.last);
  return isFinite(l) ? Math.round(l) : null;
};

/* Live book line: bid/ask spread in cents. A 1-2¢ spread is a tight book;
   wider means thin liquidity. Null when the book isn't posted. */
K.book = function(m){
  m = m || {};
  var b = num(m.yes_bid), a = num(m.yes_ask);
  if(!(isFinite(b) && isFinite(a) && b >= 0 && a >= b)) return null;
  var bc = Math.round(b), ac = Math.round(a), sp = Math.max(0, ac - bc);
  var cls = sp <= 2 ? "green" : sp <= 5 ? "blue" : "red";
  var lbl = sp <= 2 ? "tight book" : sp <= 5 ? "decent liquidity" : "thin — price may move";
  return {bid: bc, ask: ac, spread: sp, cls: cls, lbl: lbl};
};

/* Volume line from Kalshi's fixed-point dollar strings (or raw numbers). */
K.vol = function(m){
  m = m || {};
  var v24 = num(m.volume_24h), v = num(m.volume);
  function money(x){
    if(x >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
    if(x >= 1e3) return "$" + (x / 1e3).toFixed(0) + "K";
    return "$" + x.toFixed(0);
  }
  if(isFinite(v24) && v24 > 0) return "24h vol " + money(v24) + " · all-time " + money(v);
  if(isFinite(v) && v > 0) return "Volume " + money(v);
  return "";
};

/* Earliest close time across a game's markets, or null. */
K.gameTime = function(g){
  var t = null;
  (g.markets || []).forEach(function(m){
    var d = Date.parse(m.close_time || "");
    if(isFinite(d) && (t === null || d < t)) t = d;
  });
  return t;
};

/* A game is settled when the market has decided the outcome: two or more
   priced winner markets, every one at an extreme (<=1c or >=99c), with at
   least one at >=99c. Kalshi keeps finished games in its "open" listing
   until settlement finalizes (close_time stays in the future), so price is
   the only honest signal — close_time cannot be trusted for this. A live
   game only reaches 1c/99c in its final seconds, so this is the outcome,
   not a prediction. */
K.settled = function(g){
  var px = [];
  ((g && g.markets) || []).forEach(function(m){
    if(m && m.kind !== "other"){ var p = K.price(m); if(p !== null) px.push(p); }
  });
  if(px.length < 2) return false;
  var hi = Math.max.apply(null, px), lo = Math.min.apply(null, px);
  return hi >= 99 && lo <= 1 && px.every(function(p){ return p <= 1 || p >= 99; });
};

/* Normalize the snapshot into priced games, soonest first. Games without two
   priced teams are dropped (stale/settled listings), never fabricated.
   Settled games (see K.settled) sort last so finished results never crowd
   out live markets. */
K.games = function(snap){
  var out = [];
  ((snap && snap.games) || []).forEach(function(g){
    var tickers = {};
    var teams = (g.markets || []).filter(function(m){ return m.kind !== "other"; }).map(function(m){
      if(m && m.team && m.ticker) tickers[m.team] = m.ticker;
      return {name: m.team, price: K.price(m), book: K.book(m), vol: K.vol(m)};
    }).filter(function(t){ return t.name && t.price !== null; });
    if(teams.length < 2) return;
    teams.sort(function(a, b){ return b.price - a.price; });
    out.push({
      title: g.title, sub: g.sub_title, ticker: g.event_ticker,
      close: K.gameTime(g), teams: teams, tickers: tickers, settled: K.settled(g)
    });
  });
  out.sort(function(a, b){
    if(!!a.settled !== !!b.settled) return a.settled ? 1 : -1; /* settled last */
    var x = a.close === null ? Infinity : a.close, y = b.close === null ? Infinity : b.close;
    return x - y;
  });
  return out;
};

/* True when the snapshot is older than `hours` (default 6) — the page then
   shows a stale-data warning instead of pretending the prices are fresh. */
K.stale = function(iso, hours){
  var t = Date.parse(iso || "");
  if(!isFinite(t)) return true;
  return (Date.now() - t) > (hours || 6) * 3600000;
};

/* Local HTML escaper — this module stays dependency-free in the browser. */
function kesc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

/* Snapshot-to-snapshot price-move diff — the executable contract for the
   "what moved" badges. scripts/fetch-kalshi.py implements this same
   algorithm in Python when it rebuilds the snapshot and bakes the result
   into the file as {prev_at, moves, new_games}; this function is the
   node-testable spec of that contract (the page itself never calls it —
   it renders the baked data).

   Returns {prev_at, moves, new_games}:
   - moves: [{event_ticker, team, delta, prev, now}] for winner markets whose
     Yes price moved at least `minDelta` cents (default 2) between snapshots.
     Prices use K.price (midpoint of bid/ask, else last trade).
   - new_games: [event_ticker] for games in the current snapshot that were
     not in the previous one.
   - prev_at: the previous snapshot's updated_at, or null when there is no
     baseline (first snapshot — then moves and new_games are empty, because
     "new" is meaningless without a baseline).
   Settled games are excluded on both sides: a finished game's 99c/1c prices
   are a result, not a prediction, and would manufacture fake giant moves.
   Carried-forward stale entries (fetch script couldn't re-pull a game) keep
   their old prices, so they diff to zero and earn no badge — honestly quiet.
   Non-winner ("other") markets are ignored. */
K.diffMoves = function(prevSnap, curSnap, minDelta){
  minDelta = (minDelta === undefined || minDelta === null) ? 2 : minDelta;
  var out = {prev_at: null, moves: [], new_games: []};
  var prevGames = {}, prevOk = false;
  ((prevSnap && prevSnap.games) || []).forEach(function(g){
    if(g && g.event_ticker){ prevGames[g.event_ticker] = g; prevOk = true; }
  });
  if(prevSnap && prevSnap.updated_at && prevOk) out.prev_at = prevSnap.updated_at;
  var seen = {};
  ((curSnap && curSnap.games) || []).forEach(function(g){
    var et = g && g.event_ticker;
    if(!et || seen[et]) return;
    seen[et] = 1;
    var pg = prevGames[et];
    if(!pg){
      if(out.prev_at && !K.settled(g)) out.new_games.push(et);
      return;
    }
    if(K.settled(g) || K.settled(pg)) return; /* finished — not a move */
    var was = {};
    (pg.markets || []).forEach(function(m){
      if(m && m.kind !== "other" && m.team){
        var p = K.price(m);
        if(p !== null) was[m.team] = p;
      }
    });
    (g.markets || []).forEach(function(m){
      if(!m || m.kind === "other" || !m.team) return;
      var now = K.price(m), before = was[m.team];
      if(now === null || before === undefined || before === null) return;
      var d = now - before;
      if(Math.abs(d) >= minDelta)
        out.moves.push({event_ticker: et, team: m.team, delta: d, prev: before, now: now});
    });
  });
  return out;
};

/* Move badge HTML for one team: "▲ +3¢" / "▼ −2¢" in the shared mv-up/mv-dn
   classes, with a title naming the baseline snapshot. Returns "" for moves
   below the 2¢ bar or garbage input — the caller decides nothing, the badge
   simply doesn't render. All text escaped. */
K.moveBadge = function(delta, team, prevAt){
  var d = Number(delta);
  if(!isFinite(d) || Math.abs(d) < 2) return "";
  var ad = Math.abs(Math.round(d));
  var cls = d > 0 ? "mv-up" : "mv-dn";
  var glyph = d > 0 ? "\u25b2 +" : "\u25bc \u2212";
  var when = "";
  if(prevAt){
    var w = K.fmtWhen(Date.parse(prevAt));
    when = w ? " since the " + w + " snapshot" : " since the previous snapshot";
  } else {
    when = " since the previous snapshot";
  }
  var lean = d > 0 ? "toward" : "away from";
  var tip = "Moved " + ad + "\u00a2" + when +
    " \u2014 the Kalshi crowd is leaning " + lean + " " + String(team == null ? "" : team) + ".";
  return ' <span class="' + cls + '" title="' + kesc(tip) + '">' + glyph + ad + "\u00a2</span>";
};

/* Index the baked snapshot-to-snapshot moves by event ticker + team abbr.
   `abbrOf(market)` maps a snapshot market to its ESPN-space abbreviation —
   callers pass D.kalshiTeamAbbr. Exact team-name joins only: a move whose
   `team` doesn't match any winner market in its own game earns nothing,
   never a guess. Returns {byGame: {ticker: {abbr: delta}}, prevAt}.
   The page itself uses this to badge the predictions rows; markets.js does
   its own equivalent indexing by team name where the raw game is in hand. */
K.moveIndex = function(snap, abbrOf){
  var out = {byGame: {}, prevAt: (snap && snap.prev_at) || null};
  var games = {};
  ((snap && snap.games) || []).forEach(function(g){
    if(g && g.event_ticker) games[g.event_ticker] = g;
  });
  ((snap && snap.moves) || []).forEach(function(mv){
    if(!mv || !mv.event_ticker) return;
    var g = games[mv.event_ticker];
    if(!g) return;
    var ab = null;
    ((g.markets) || []).forEach(function(mk){
      if(mk && mk.team === mv.team && mk.kind !== "other" &&
         typeof abbrOf === "function"){
        var a = abbrOf(mk);
        if(a) ab = a;
      }
    });
    if(!ab) return;
    (out.byGame[mv.event_ticker] = out.byGame[mv.event_ticker] || {})[ab] = Number(mv.delta);
  });
  return out;
};

/* "Market pulse" top movers: the strip the markets page's Kalshi tabs show
   above the cards — the N largest snapshot-to-snapshot price moves, so the
   crowd's freshest lean is one glance instead of a 30-card scroll. Takes
   K.games() output plus the moveMap the page builds from snap.moves
   ({ticker: {team: delta}} — the same 2c+ bar as the badges). Exact
   team-name joins only: a move whose team doesn't match a priced team on
   its own card earns nothing, never a guess; settled games are excluded
   (a result's 99c side is not a move). Sorted by |delta| desc, capped at
   n (default 5). Returns [{ticker, team, delta, title, sub}] — all raw
   text, the caller escapes. Garbage in -> [], never junk. */
K.topMoves = function(games, moveMap, n){
  var out = [];
  if(!Array.isArray(games) || !moveMap || typeof moveMap !== "object") return out;
  n = (typeof n === "number" && n > 0) ? Math.floor(n) : 5;
  games.forEach(function(g){
    if(!g || g.settled || !g.ticker) return;
    var mm = moveMap[g.ticker];
    if(!mm || typeof mm !== "object") return;
    var names = {};
    (Array.isArray(g.teams) ? g.teams : []).forEach(function(t){ if(t && t.name) names[t.name] = 1; });
    Object.keys(mm).forEach(function(team){
      var d = Number(mm[team]);
      if(!names[team] || !isFinite(d) || Math.abs(d) < 2) return;
      out.push({ticker: g.ticker, team: team, delta: Math.round(d),
                title: g.title || "", sub: g.sub || ""});
    });
  });
  out.sort(function(a, b){ return Math.abs(b.delta) - Math.abs(a.delta); });
  return out.slice(0, n);
};

/* Compact "Kalshi says" line for the predictions page: the snapshot's two
   prices for one game, labeled with the snapshot time, plus the gap versus
   the Polymarket price (pmA, whole cents) when supplied — two real-money
   crowds in one glance. Returns "" when either side is unpriced. When the
   snapshot is stale, returns a stale warning INSTEAD of prices: never
   presented as fresh. The optional 7th argument, moves = {dA, dB, prevAt},
   badges each side with K.moveBadge when its price moved 2c+ since the
   previous snapshot — the same "what moved" treatment the markets page
   cards got. All text escaped. */
K.predRow = function(aName, aPct, bName, bPct, updatedAt, pmA, moves){
  if(aPct === null || aPct === undefined || bPct === null || bPct === undefined) return "";
  aPct = Math.round(Number(aPct)); bPct = Math.round(Number(bPct));
  if(!isFinite(aPct) || !isFinite(bPct)) return "";
  if(K.stale(updatedAt)){
    return '<div class="game-meta" style="margin-top:10px;border-top:1px solid var(--line-soft);padding-top:10px">'+
      '<span class="tag green">Kalshi</span>'+
      '<span>snapshot is stale (over 6 hours old) — prices withheld until the next refresh.</span></div>';
  }
  var when = K.fmtWhen(Date.parse(updatedAt || ""));
  var delta = (pmA === null || pmA === undefined) ? null : Math.abs(Math.round(Number(pmA)) - aPct);
  var dchip = (delta === null || !isFinite(delta)) ? "" :
    ' <span class="tag blue" style="font-size:.62rem" title="Gap between Polymarket\u2019s and Kalshi\u2019s price for '+
    kesc(aName)+' — two real-money crowds. A 3\u00a2+ gap means one of them may be mispriced.">\u0394'+delta+'\u00a2 vs Polymarket</span>';
  moves = moves || {};
  var bA = K.moveBadge(moves.dA, aName, moves.prevAt);
  var bB = K.moveBadge(moves.dB, bName, moves.prevAt);
  return '<div class="game-meta" style="margin-top:10px;border-top:1px solid var(--line-soft);padding-top:10px">'+
    '<span class="tag green">Kalshi</span>'+
    '<span>'+kesc(aName)+' <b class="num">'+aPct+'%</b>'+bA+' \u00b7 '+kesc(bName)+' <b class="num">'+bPct+'%</b>'+bB+'</span>'+dchip+
    '<span>snapshot'+(when ? " "+when : "")+'</span></div>';
};

/* "Sun, Sep 27 · 1:00 PM" in the visitor's timezone. */
K.fmtWhen = function(ms){
  if(ms === null || ms === undefined) return "";
  try{
    var d = new Date(ms);
    if(!isFinite(d)) return "";
    return d.toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"}) +
      " · " + d.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"});
  }catch(e){ return ""; }
};

/* ---- Kalshi price history (data/kalshi-history.json) ----
   scripts/fetch-kalshi.py appends one yes-price point per priced winner
   market to that file after every successful fetch, each series capped at
   168 points (about a week of hourly runs). The file starts empty and only
   ever accumulates real observations — nothing invents history, and the
   page only ever charts points that are really there. */

K.HIST_CAP = 168;

/* Pure append: the node-testable spec of the fetcher's history step
   (scripts/fetch-kalshi.py:append_history must stay in lockstep with it).
   Returns a NEW history map {ticker: [{t, yes}]} with one point per priced
   winner market appended ({t: snap.updated_at, yes: K.price cents}), each
   series trimmed to the newest K.HIST_CAP points (oldest dropped).
   - carried-forward stale games (game.stale) add no point: their prices
     were not observed this run;
   - non-winner ("other") markets, tickerless markets, and unpriced markets
     are skipped — nothing guessed;
   - an identical price to the previous point STILL appends: every point is
     one honest observation at its timestamp, and "N snapshots" in the chart
     caption counts real observations, never faked ones;
   - garbage in -> a clean map out, never invented points. */
K.appendHistory = function(hist, snap){
  var out = {}, k;
  hist = (hist && typeof hist === "object") ? hist : {};
  for(k in hist){
    if(hist.hasOwnProperty(k) && Array.isArray(hist[k])) out[k] = hist[k].slice();
  }
  var t = (snap && typeof snap.updated_at === "string" && snap.updated_at) ? snap.updated_at : null;
  if(!t) return out;
  ((snap && snap.games) || []).forEach(function(g){
    if(!g || g.stale) return; /* carried forward — no fresh observation */
    ((g && g.markets) || []).forEach(function(m){
      if(!m || m.kind === "other" || !m.ticker) return;
      var p = K.price(m);
      if(p === null) return;
      var s = out[m.ticker];
      if(!Array.isArray(s)) s = out[m.ticker] = [];
      s.push({t: t, yes: p});
      if(s.length > K.HIST_CAP) out[m.ticker] = s.slice(s.length - K.HIST_CAP);
    });
  });
  return out;
};

/* Per-game history for one normalized K.games game: {teamName: [{t, yes}]}.
   Reads game.tickers (market ticker per team name, built by K.games).
   Garbage points are dropped, prices rounded to whole cents. */
K.gameHist = function(game, hist){
  var out = {};
  hist = (hist && typeof hist === "object") ? hist : {};
  var tk = (game && game.tickers) || {};
  ((game && game.teams) || []).forEach(function(tm){
    var s = hist[tk[tm.name]];
    out[tm.name] = (Array.isArray(s) ? s : []).filter(function(p){
      return p && typeof p.t === "string" && p.t && isFinite(Number(p.yes));
    }).map(function(p){ return {t: p.t, yes: Math.round(Number(p.yes))}; });
  });
  return out;
};

function r2(x){ return Math.round(x * 100) / 100; }

/* Sparkline geometry for an array of whole-cent yes prices. Returns null
   when fewer than two valid points exist — one dot is not a trend, and the
   caller renders the honest "history accumulating" note instead of a chart.
   Otherwise returns {pts: [[x,y]...], min, max} in canvas pixels (y flipped
   for canvas coordinates), pad inset around the edges. */
K.sparkPath = function(series, w, h, pad){
  var vals = [];
  (series || []).forEach(function(v){
    /* Number(null)/Number("") is 0 — both would masquerade as a real 0c
       price. Only parse genuine values; everything else is missing. */
    if(v === null || v === undefined || v === "") return;
    v = Number(v);
    if(isFinite(v)) vals.push(v);
  });
  if(vals.length < 2) return null;
  w = (w > 0) ? w : 100; h = (h > 0) ? h : 40;
  pad = (pad === undefined || pad === null) ? 3 : pad;
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  var span = max - min, iw = w - 2 * pad, ih = h - 2 * pad;
  var pts = vals.map(function(v, i){
    var x = pad + (i / (vals.length - 1)) * iw;
    var y = (span === 0) ? h / 2 : (h - pad) - ((v - min) / span) * ih;
    return [r2(x), r2(y)];
  });
  return {pts: pts, min: min, max: max};
};

/* Caption text for a Kalshi price-history sparkline. Honest by construction:
   never "live", always names the snapshot count and the snapshot time. With
   fewer than 2 points there is no chart, so the text says history is
   accumulating instead of faking a trend. */
K.sparkCaption = function(n, snapIso){
  n = Math.max(0, Math.floor(Number(n) || 0));
  var when = K.fmtWhen(Date.parse(snapIso || ""));
  if(n < 2){
    return "Kalshi price history accumulating — only " +
      (n === 0 ? "no snapshots" : "1 snapshot") +
      " recorded so far; the chart appears once more snapshots build up." +
      (when ? " Latest snapshot " + when + "." : "");
  }
  return "Kalshi price history · " + n + " snapshots · snapshot " + (when || "time unknown");
};

if(typeof module !== "undefined" && module.exports) module.exports = K;
else window.Kalshi = K;
})();
