/* GridIronUI homepage strip — "Happening now / Today's games".
   Collects the ESPN scoreboards for the four US leagues in parallel, drops
   finished games, and ranks live games first, then by kickoff time. Pure
   logic lives here for node tests; the DOM wiring stays in index.html.
   Browser: window.GIU.homeStrip · node: module.exports */
(function(){
"use strict";
var LEAGUES = [
  ["football/nfl","NFL"],["baseball/mlb","MLB"],
  ["basketball/nba","NBA"],["hockey/nhl","NHL"]
];
function scoreUrl(path){
  return "https://site.api.espn.com/apis/site/v2/sports/"+path+"/scoreboard";
}
/* Flatten one league's scoreboard payload into strip rows. Finished ("post")
   games are dropped — the strip is for what's happening or coming up.
   Malformed events are skipped, never guessed. The original competitor
   objects are kept so the page can render them with GIU.teamRow. */
function collect(leagueLabel, payload){
  var evs = (payload && payload.events) || [];
  var out = [];
  evs.forEach(function(ev){
    try{
      var c = (ev.competitions||[])[0]; if(!c) return;
      var st = (((c.status||{}).type)||{}).state || "";
      if(st === "post") return;
      var home = null, away = null;
      ((c.competitors)||[]).forEach(function(t){
        if(t.homeAway === "home") home = t;
        else if(t.homeAway === "away") away = t;
      });
      if(!home || !away) return;
      out.push({
        id: ev.id,
        league: leagueLabel,
        date: ev.date || "",
        state: st,
        shortDetail: (((c.status||{}).type)||{}).shortDetail || "",
        away: away,
        home: home,
        venue: ((c.venue)||{}).fullName || "",
        broadcast: broadcastNames(c)
      });
    }catch(e){ /* skip the malformed event, keep the rest */ }
  });
  return out;
}
/* Live games first, then earliest kickoff. Unparseable dates sink to the end. */
function rankRows(a, b){
  var al = a.state === "in" ? 0 : 1, bl = b.state === "in" ? 0 : 1;
  if(al !== bl) return al - bl;
  var at = Date.parse(a.date), bt = Date.parse(b.date);
  at = isFinite(at) ? at : Infinity;
  bt = isFinite(bt) ? bt : Infinity;
  return at - bt;
}
/* Sorted top-n rows; n defaults to the strip size on the homepage. */
function top(rows, n){
  return (rows||[]).slice().sort(rankRows).slice(0, n == null ? 6 : n);
}
/* ---- Kalshi crowd prices on the strip (v1.120.0) ----
   The server-side Kalshi NFL snapshot (data/kalshi-nfl.json) is CORS-safe,
   so NFL strip rows can carry the real-money crowd's win probability next
   to the matchup — information, not a pick. Matching is by unordered team
   abbreviation pair, the same honest approach as the markets page's
   cross-book comparison: unmatchable rows stay unannotated, never guessed,
   and a stale snapshot annotates nothing rather than posing as a live
   read. */

/* Kalshi tickers use JAC (Jaguars) / WAS (Commanders); ESPN uses JAX / WSH. */
var KALSHI_ALIAS = {JAC: "JAX", WAS: "WSH"};
function normKalshiAbbr(a){
  a = String(a == null ? "" : a).toUpperCase();
  return KALSHI_ALIAS[a] || a;
}

/* The abbreviation pair for one snapshot game, normalized to ESPN form and
   sorted — or null when the snapshot doesn't carry a clean pair. Tries the
   short sub_title first ("PIT vs CLE (Oct 1)"), then the full title's first
   tokens ("PIT Steelers vs CLE Browns"), then the event ticker's tail
   ("KXNFLGAME-26OCT01PITCLE"). */
function kalshiPair(g){
  g = g || {};
  var m = String(g.sub_title || "").match(/^\s*([A-Za-z]{2,3})\s+vs\.?\s+([A-Za-z]{2,3})\b/);
  if(!m){
    var p = String(g.title || "").split(/\s+vs\.?\s+/);
    if(p.length === 2){
      var t0 = p[0].trim().split(/\s+/)[0], t1 = p[1].trim().split(/\s+/)[0];
      if(/^[A-Za-z]{2,3}$/.test(t0 || "") && /^[A-Za-z]{2,3}$/.test(t1 || "")) m = [null, t0, t1];
    }
  }
  if(!m){
    var tk = String(g.event_ticker || "").match(/([A-Za-z]{3})([A-Za-z]{3})$/);
    if(tk) m = [null, tk[1], tk[2]];
  }
  if(!m) return null;
  return [normKalshiAbbr(m[1]), normKalshiAbbr(m[2])].sort();
}

/* Yes price in whole cents: bid/ask midpoint, last trade when the book is
   empty, null when nothing is priced. Same semantics as Kalshi.price and
   D.kalshiPrice, duplicated so this module stays dependency-free. */
function kalshiPrice(m){
  m = m || {};
  function num(v){
    if(v === null || v === undefined || v === "") return NaN;
    v = Number(v);
    return isFinite(v) ? v : NaN;
  }
  var b = num(m.yes_bid), a = num(m.yes_ask);
  if(isFinite(b) && isFinite(a) && b >= 0 && a >= b) return Math.round((b + a) / 2);
  var l = num(m.last);
  return isFinite(l) ? Math.round(l) : null;
}

/* Team abbreviation from the market ticker suffix ("...-CLE" -> "CLE"),
   normalized to ESPN form. */
function kalshiSideAbbr(m){
  var t = String((m && m.ticker) || "").match(/-([A-Za-z]{2,3})$/);
  return t ? normKalshiAbbr(t[1]) : null;
}

/* Snapshot freshness: the loop rebuilds these hourly, so anything older
   than maxAgeH hours (default 6 — the same bar the Kalshi board uses) is
   withheld rather than presented as a live read. Unparseable stamp = stale. */
function snapStale(iso, nowMs, maxAgeH){
  var t = Date.parse(iso || "");
  if(!isFinite(t)) return true;
  var now = isFinite(nowMs) ? nowMs : Date.now();
  return (now - t) > (maxAgeH || 6) * 3600000;
}

/* Annotate strip rows with the snapshot's crowd prices. Returns NEW row
   objects (input rows are never mutated). Rows that can't be matched, games
   with an unpriced side, non-NFL rows, and stale or malformed snapshots come
   back without a kp — the strip renders exactly as before. */
function withKalshi(rows, snap, nowMs){
  rows = Array.isArray(rows) ? rows : [];
  var games = snap && Array.isArray(snap.games) ? snap.games : null;
  if(!games || snapStale(snap.updated_at, nowMs)) return rows.slice();
  var byPair = {};
  games.forEach(function(g){
    var pair = kalshiPair(g);
    if(!pair) return;
    var key = pair.join("|");
    if(byPair[key]) return; /* first listing wins; snapshots don't duplicate */
    var sides = {};
    ((g && g.markets) || []).forEach(function(m){
      var ab = kalshiSideAbbr(m), px = kalshiPrice(m);
      if(ab && px !== null && sides[ab] === undefined) sides[ab] = px;
    });
    byPair[key] = sides;
  });
  return rows.map(function(r){
    if(!r || r.league !== "NFL") return r;
    var ra = r.away && r.away.team && r.away.team.abbreviation;
    var rh = r.home && r.home.team && r.home.team.abbreviation;
    if(!ra || !rh) return r;
    var au = String(ra).toUpperCase(), hu = String(rh).toUpperCase();
    var sides = byPair[[au, hu].sort().join("|")];
    if(!sides) return r;
    var aPct = sides[au], hPct = sides[hu];
    if(aPct === undefined || hPct === undefined) return r;
    var out = {};
    for(var k in r) out[k] = r[k];
    out.kp = {aAbbr: au, aPct: aPct, hAbbr: hu, hPct: hPct,
              updatedAt: snap.updated_at};
    return out;
  });
}

/* "Thu, Oct 1 · 12:08 AM" in the visitor's timezone, for the snapshot stamp. */
function snapWhen(iso){
  try{
    var d = new Date(iso);
    if(!isFinite(d)) return "";
    return d.toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"}) +
      " · " + d.toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"});
  }catch(e){ return ""; }
}

/* ---- Watch info + kickoff countdown (v1.124.0) ----
   The "Today's games" strip tells a bettor not just who's favored but where
   to watch and how long until kickoff — both straight from the ESPN payload,
   never guessed. */

/* First broadcast network names on a game ("Prime Video", "ESPN / ABC"),
   or "" when ESPN names none. Pure, testable. */
function broadcastNames(c){
  try{
    var b = ((c || {}).broadcasts || [])[0] || {};
    var n = b.names;
    if(Array.isArray(n)) n = n.filter(function(x){ return x; }).join(" / ");
    return String(n || "").trim();
  }catch(e){ return ""; }
}

/* "Kickoff in 13h 42m" for a future kickoff; null for past/unparseable —
   the strip renders no countdown in those cases. */
function kickoffIn(dateIso, nowMs){
  var t = Date.parse(dateIso || "");
  if(!isFinite(t)) return null;
  var now = isFinite(nowMs) ? nowMs : Date.now();
  var d = t - now;
  if(d <= 0) return null;
  var m = Math.floor(d / 60000);
  if(m >= 24 * 60) return "Kickoff in " + Math.floor(m / 1440) + "d " + Math.floor((m % 1440) / 60) + "h";
  if(m >= 60) return "Kickoff in " + Math.floor(m / 60) + "h " + (m % 60) + "m";
  return "Kickoff in " + m + "m";
}

/* The nearest pre-game row with a real future kickoff, or null. Skips live,
   finished, and dateless rows — the countdown only ever names one game. */
function nearestPre(rows, nowMs){
  var now = isFinite(nowMs) ? nowMs : Date.now();
  var best = null, bt = Infinity;
  (rows || []).forEach(function(r){
    if(!r || r.state !== "pre") return;
    var t = Date.parse(r.date || "");
    if(!isFinite(t) || t <= now || t >= bt) return;
    bt = t; best = r;
  });
  return best;
}

var api = {LEAGUES: LEAGUES, scoreUrl: scoreUrl, collect: collect,
           rankRows: rankRows, top: top,
           normKalshiAbbr: normKalshiAbbr, kalshiPair: kalshiPair,
           kalshiPrice: kalshiPrice, kalshiSideAbbr: kalshiSideAbbr,
           snapStale: snapStale, withKalshi: withKalshi, snapWhen: snapWhen,
           broadcastNames: broadcastNames, kickoffIn: kickoffIn,
           nearestPre: nearestPre};
if(typeof module !== "undefined" && module.exports) module.exports = api;
else (window.GIU = window.GIU || {}).homeStrip = api;
})();
