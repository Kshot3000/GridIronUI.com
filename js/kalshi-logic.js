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
    var teams = (g.markets || []).filter(function(m){ return m.kind !== "other"; }).map(function(m){
      return {name: m.team, price: K.price(m), book: K.book(m), vol: K.vol(m)};
    }).filter(function(t){ return t.name && t.price !== null; });
    if(teams.length < 2) return;
    teams.sort(function(a, b){ return b.price - a.price; });
    out.push({
      title: g.title, sub: g.sub_title, ticker: g.event_ticker,
      close: K.gameTime(g), teams: teams, settled: K.settled(g)
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

/* Compact "Kalshi says" line for the predictions page: the snapshot's two
   prices for one game, labeled with the snapshot time, plus the gap versus
   the Polymarket price (pmA, whole cents) when supplied — two real-money
   crowds in one glance. Returns "" when either side is unpriced. When the
   snapshot is stale, returns a stale warning INSTEAD of prices: never
   presented as fresh. All text escaped. */
K.predRow = function(aName, aPct, bName, bPct, updatedAt, pmA){
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
  return '<div class="game-meta" style="margin-top:10px;border-top:1px solid var(--line-soft);padding-top:10px">'+
    '<span class="tag green">Kalshi</span>'+
    '<span>'+kesc(aName)+' <b class="num">'+aPct+'%</b> \u00b7 '+kesc(bName)+' <b class="num">'+bPct+'%</b></span>'+dchip+
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

if(typeof module !== "undefined" && module.exports) module.exports = K;
else window.Kalshi = K;
})();
