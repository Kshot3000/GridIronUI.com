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
