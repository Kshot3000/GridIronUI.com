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

/* Normalize the snapshot into priced games, soonest first. Games without two
   priced teams are dropped (stale/settled listings), never fabricated. */
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
      close: K.gameTime(g), teams: teams
    });
  });
  out.sort(function(a, b){
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
