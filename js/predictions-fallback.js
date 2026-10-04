/* GridIronUI Predictions — Kalshi-only fallback renderer.
   When Polymarket's API fails, the predictions page would otherwise go
   fully blank — but the page already holds a second real-money crowd in
   the server-side Kalshi snapshots (NFL + MLB postseason game-winners,
   rebuilt by scripts/fetch-kalshi.py). This module turns that snapshot
   into honestly-labeled fallback HTML: Kalshi prices only, timestamped,
   with no cross-crowd gap and no Polymarket data implied.
   Pure: no DOM, no network. Depends on window.Kalshi (kalshi-logic.js)
   and optionally window.Disagree (disagree-logic.js) for the "what moved"
   badges. Returns null when there is nothing honest to show (missing or
   stale snapshot, no priced unsettled games) — the caller then shows the
   standard failure box as before.
   Run: node tests/test-predictions-fallback.js */
(function(){
"use strict";
var F = {};
/* Same 10-card cap as the live path: the soonest upcoming games. */
var MAX_GAMES = 10;

function kal(){
  return (typeof window !== "undefined" && window.Kalshi) || null;
}
function dis(){
  return (typeof window !== "undefined" && window.Disagree) || null;
}
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

/* The same staleness bar the Kalshi rows use everywhere else (K.stale,
   6 hours): an old snapshot's prices are withheld, never shown as live. */
F.usable = function(snap){
  var K = kal();
  if(!K) return false;
  if(!snap || !Array.isArray(snap.games) || !snap.games.length) return false;
  return !K.stale(snap.updated_at);
};

/* Priced, unsettled games, soonest first. A finished game is a result, not
   a prediction, so settled games never appear here — the same rule the
   disagree card applies (v1.117.0). */
F.games = function(snap, n){
  var K = kal();
  if(!K) return [];
  return K.games(snap).filter(function(g){ return !g.settled; })
    .slice(0, n || MAX_GAMES);
};

/* Snapshot timestamp in the visitor's timezone, or "" when unparseable —
   the banner then says "a server-side snapshot" without a time. */
F.when = function(snap){
  var K = kal();
  try{ return K ? K.fmtWhen(Date.parse((snap && snap.updated_at) || "")) : ""; }
  catch(e){ return ""; }
};

/* The honesty banner: Polymarket is down, these are Kalshi prices only,
   timestamped, no cross-check gap, and the page retries automatically. */
F.bannerHtml = function(snap){
  var when = F.when(snap);
  return '<div class="card" style="border-left:3px solid var(--gold);margin-bottom:18px" role="status">'+
    '<p style="margin:0;font-size:.92rem;line-height:1.55"><b>Polymarket didn\u2019t respond</b> \u2014 '+
    'showing the Kalshi crowd\u2019s prices only'+
    (when ? ', from a server-side snapshot ('+esc(when)+')' : ', from a server-side snapshot')+
    '. These are real Kalshi prices, but they aren\u2019t live Polymarket prices, so no cross-crowd gap is shown. '+
    'Trying Polymarket again automatically \u2014 no refresh needed.</p></div>';
};

/* One fallback card: the same probability-bar language as the live cards,
   a Kalshi tag instead of Market-implied, the snapshot timestamp in the
   footer. The "what moved" badge (v1.128.0) rides along when the fetch
   script baked a 2c+ move for the team — joined by exact event ticker +
   team abbreviation, never guessed. */
F.cardHtml = function(g, snap, mi){
  var K = kal();
  if(!K || !g) return "";
  var raw = null;
  ((snap && snap.games) || []).forEach(function(rg){
    if(rg && rg.event_ticker === g.ticker) raw = rg;
  });
  var when = F.when(snap);
  var rows = (g.teams || []).map(function(t){
    var pct = Math.round(Number(t.price));
    if(!isFinite(pct)) return "";
    var badge = "";
    if(raw && mi && mi.byGame && mi.byGame[g.ticker]){
      var D = dis(), ab = null;
      if(D && D.kalshiTeamAbbr){
        (raw.markets || []).forEach(function(mk){
          if(mk && mk.team === t.name && mk.kind !== "other"){
            var a = D.kalshiTeamAbbr(mk);
            if(a) ab = a;
          }
        });
      }
      if(ab) badge = K.moveBadge(mi.byGame[g.ticker][ab], t.name, mi.prevAt);
    }
    var book = (t.book && isFinite(t.book.bid) && isFinite(t.book.ask))
      ? ' <span style="color:var(--faint)">\u00b7 book '+t.book.bid+'\u00a2/'+t.book.ask+'\u00a2</span>' : "";
    return '<div style="margin-bottom:4px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
      '<span style="font-size:.9rem">'+esc(t.name)+' wins</span>'+
      '<b class="num" style="font-size:1.25rem;color:var(--gold-soft)">'+pct+'%'+badge+'</b></div>'+
      '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);margin-bottom:6px;overflow:hidden"'+
      ' role="img" aria-label="'+esc(t.name)+' priced at '+pct+' cents on Kalshi">'+
      '<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--green),var(--gold))"></div></div>'+
      '<div style="font-size:.76rem;color:var(--faint);margin-bottom:12px">'+esc(t.vol || "No volume reported")+book+'</div></div>';
  }).join("");
  if(!rows) return "";
  /* No clock time on the Kalshi fallback card (v2.0.13): the snapshot's
     per-game stamp is Kalshi's occurrence_datetime, exactly 3h after the
     scheduled start (verified 2026-10-04) — v2.0.11 rendered it as a
     kickoff, wrong for every game. Date from sub_title only. */
  return '<div class="card"><span class="tag green">Kalshi</span> '+
    '<span class="tag" title="Prices come from a server-side snapshot because Kalshi\u2019s API blocks browser requests.">snapshot</span>'+
    '<h3 style="margin:10px 0 4px;font-size:1.02rem">'+esc(g.title)+'</h3>'+
    (g.sub ? '<div class="game-meta" style="margin-bottom:12px">'
      + '<span>'+esc(g.sub)+'</span>'
      + '</div>' : '<div style="height:8px"></div>')+
    rows+
    '<div class="game-meta"><span>Source: Kalshi snapshot'+(when ? ' \u00b7 '+esc(when) : '')+'</span>'+
    '<a href="https://kalshi.com/browse" target="_blank" rel="noopener">Trade on Kalshi \u2192</a></div></div>';
};

/* Banner + cards, or null when there is nothing honest to show. */
F.render = function(snap){
  if(!F.usable(snap)) return null;
  var games = F.games(snap);
  if(!games.length) return null;
  var K = kal(), D = dis();
  var mi = (K && D && D.kalshiTeamAbbr) ? K.moveIndex(snap, D.kalshiTeamAbbr) : null;
  return F.bannerHtml(snap) + games.map(function(g){ return F.cardHtml(g, snap, mi); }).join("");
};

if(typeof module !== "undefined" && module.exports) module.exports = F;
else if(typeof window !== "undefined") window.PredFallback = F;
})();
