/* GridIronUI matchup hub logic — pure functions, no DOM.
   Powers matchup.html (?league=nfl&event=<espn-event-id>): the per-game
   hub that consolidates the header (away @ home, records, kickoff, venue),
   ESPN's free spread/total, the keyed best-book section, game-day weather
   (wx-shared, via the home-wx pipeline), key injuries for both teams,
   Kalshi crowd prices (home-strip withKalshi matching), live Polymarket
   prices (OddsPm matching), and line-move badges (OddsLogic movers).

   Cross-module calls are injected (homeStrip / wx / oddsLogic / pm) so this
   module reuses the existing matching logic instead of duplicating it —
   the browser passes window.GIU.homeStrip etc.; node tests pass the
   required ../js modules directly.
   Browser: window.Matchup · node: module.exports */
(function(){
"use strict";
var M = {};

/* ---- params ----
   ?league=nfl&event=<espn-event-id>. The league is an identity key, never
   an ESPN path — the path map below is the only place that translation
   lives, so a bad league value can't point the fetch anywhere unexpected. */
var LEAGUE_PATHS = {
  nfl: "football/nfl", nba: "basketball/nba",
  mlb: "baseball/mlb", nhl: "hockey/nhl"
};
var ODDS_SPORTS = {
  nfl: "americanfootball_nfl", nba: "basketball_nba",
  mlb: "baseball_mlb", nhl: "icehockey_nhl"
};
M.leaguePath = function(league){
  var l = String(league == null ? "" : league).toLowerCase();
  return LEAGUE_PATHS[l] || null;
};
M.oddsSport = function(league){
  var l = String(league == null ? "" : league).toLowerCase();
  return ODDS_SPORTS[l] || null;
};
/* Parse a query string into {league, event}; league must be a known
   identity key and the event id a sane token, or each comes back null.
   The page shows its honest invalid-link state in those cases. */
M.parseParams = function(search){
  var q = String(search == null ? "" : search).replace(/^\?/, "");
  var league = null, event = null;
  q.split("&").forEach(function(pair){
    if(!pair) return;
    var kv = pair.split("=");
    var k = "";
    try{ k = decodeURIComponent(kv[0] || ""); }catch(e){}
    if(k !== "league" && k !== "event") return;
    var v = "";
    try{ v = decodeURIComponent(kv[1] || ""); }catch(e){}
    v = String(v).trim();
    if(k === "league") league = v.toLowerCase();
    else event = v;
  });
  if(!M.leaguePath(league)) league = null;
  if(!event || !/^[A-Za-z0-9_-]{1,40}$/.test(event)) event = null;
  return {league: league, event: event};
};

/* ---- game data (ESPN summary endpoint, per-event — the scores-detail
   scheme: league path + ?event=id, never a guessed board row) ---- */
M.summaryUrl = function(leaguePath, eventId){
  return "https://site.api.espn.com/apis/site/v2/sports/"+
    String(leaguePath || "")+"/summary?event="+encodeURIComponent(String(eventId || ""));
};
M.injuriesUrl = function(leaguePath){
  return "https://site.api.espn.com/apis/site/v2/sports/"+
    String(leaguePath || "")+"/injuries";
};
M.headerOf = function(summary){
  try{
    return ((summary && summary.header && summary.header.competitions) || [])[0] || null;
  }catch(e){ return null; }
};
/* Overall record from a competitor's records array — first entry carrying a
   summary wins ("3-1-0"); anything else (missing, shape drift) is null,
   never invented. */
M.overallRecord = function(comp){
  var out = null;
  ((comp && comp.records) || []).forEach(function(r){
    if(!out && r && r.summary) out = String(r.summary);
  });
  return out;
};
/* Normalized game info for the hub header. Returns null when the payload
   has no usable competition or no clean away/home pair — the page renders
   its "game not found" state instead of a guessed header. */
M.gameInfo = function(summary){
  var c = M.headerOf(summary);
  if(!c) return null;
  var away = null, home = null;
  ((c.competitors) || []).forEach(function(t){
    if(t && t.homeAway === "home" && !home) home = t;
    else if(t && t.homeAway === "away" && !away) away = t;
  });
  if(!away || !home) return null;
  function side(t){
    var tm = (t && t.team) || {};
    var sc = (t && t.score !== null && t.score !== undefined) ? String(t.score) : null;
    return {
      abbr: String(tm.abbreviation || "").toUpperCase(),
      name: String(tm.displayName || tm.name || ""),
      short: String(tm.shortDisplayName || ""),
      record: M.overallRecord(t),
      score: sc
    };
  }
  var st = (((c.status || {}).type) || {}).state || "";
  var venue = c.venue || {};
  var odds = (c.odds && c.odds[0]) || null;
  var bc = (((c.broadcasts || [])[0]) || {}).names;
  var kickoff = c.date || "";
  return {
    state: String(st),
    shortDetail: String(((((c.status || {}).type) || {}).shortDetail) || ""),
    date: String(kickoff),
    away: side(away),
    home: side(home),
    venue: String(venue.fullName || ""),
    broadcast: Array.isArray(bc) ? bc.filter(function(x){ return x; }).join(" / ")
                                : String(bc || "").trim(),
    /* ESPN's free consensus-ish line: the same line scores.html shows.
       Empty strings when ESPN carries none — the section then stays quiet. */
    espnSpread: String((odds && odds.details) || ""),
    espnTotal: (odds && odds.overUnder !== null && odds.overUnder !== undefined &&
               odds.overUnder !== "") ? String(odds.overUnder) : ""
  };
};

/* Pseudo home-strip row for one hub game — lets the hub call the exact
   same pure pipelines as the homepage strip (withKalshi, HX.resolveRows)
   instead of re-implementing their matching. */
M.stripRowForGame = function(info, leagueKey){
  if(!info) return null;
  var label = String(leagueKey == null ? "" : leagueKey).toUpperCase();
  if(label !== "NFL" && label !== "MLB") label = "NFL"; /* pipelines only cover these */
  return {
    id: "hub",
    league: label,
    date: info.date || "",
    state: info.state || "",
    away: {team: {abbreviation: info.away && info.away.abbr}},
    home: {team: {abbreviation: info.home && info.home.abbr}},
    venue: info.venue || ""
  };
};

/* ---- Kalshi crowd price ----
   homeStrip.withKalshi is injected and called with a league->snapshot map
   (the same call shape index.html uses), so the hub inherits the strip's
   abbreviation-pair matching, JAC/WAS aliases, MLB series-game date
   disambiguation, and stale-snapshot withholding verbatim. Returns the kp
   record {aAbbr,aPct,hAbbr,hPct,updatedAt} or null. */
M.kalshiForGame = function(homeStrip, info, leagueKey, snaps, nowMs){
  if(!homeStrip || typeof homeStrip.withKalshi !== "function" || !info) return null;
  var lk = String(leagueKey == null ? "" : leagueKey).toLowerCase();
  var leagueLabel = lk === "nfl" ? "NFL" : (lk === "mlb" ? "MLB" : null);
  if(!leagueLabel) return null;
  var row = M.stripRowForGame(info, leagueLabel);
  if(!row) return null;
  var rows = homeStrip.withKalshi([row], snaps || {}, nowMs);
  return (rows && rows[0] && rows[0].kp) || null;
};

/* ---- Polymarket price ----
   pmPrices is injected (window.OddsPm in the browser): its gamma-event
   parsing and team-name resolution are reused exactly. This module only
   does the final pair lookup and favorite extraction. Pinned 0/100 prices
   (resolved markets) are excluded — a settled market is not a price. */
/* The favorite side of a pmPrices record: {abbr, pm} in whole cents, or
   null. Markets at the settled extremes (<=1c / >=99c, the K.settled bar)
   are excluded — a decided market is a result, not a price. Stricter than
   pmPrices' own 0/100 pin filter, because the hub shows this number as a
   standalone price, not a board badge. */
M.pmFavoriteFromMap = function(priceByAbbr){
  if(!priceByAbbr || typeof priceByAbbr !== "object") return null;
  var fav = null, pm = 0;
  Object.keys(priceByAbbr).forEach(function(ab){
    var p = Number(priceByAbbr[ab]);
    if(isFinite(p) && p > pm){ pm = Math.round(p); fav = ab; }
  });
  if(!fav || pm <= 1 || pm >= 99) return null;
  return {abbr: fav, pm: pm};
};
M.pmForGame = function(pmPrices, pmMap, awayAbbr, homeAbbr){
  if(!pmPrices || !pmMap) return null;
  var key = [String(awayAbbr || "").toUpperCase(),
             String(homeAbbr || "").toUpperCase()].sort().join("|");
  var rec = pmMap[key];
  if(!rec || !rec.priceByAbbr) return null;
  return M.pmFavoriteFromMap(rec.priceByAbbr);
};

/* ---- injuries ----
   The injuries board's data source (ESPN injuries endpoint), filtered per
   team. sevRank/isHealthy mirror js/injuries.js semantics (verified
   2026-09-29): Out/Injured Reserve/IL rank highest, "Active" entries are
   healthy players and are dropped, suspensions kept. teamDir isn't needed
   here — ESPN's payload carries abbreviations itself. */
M.sevRank = function(s){
  s = String(s == null ? "" : s);
  if(/out|injured reserve|\bil\b|injured list/i.test(s)) return 3;
  if(/doubtful/i.test(s)) return 2;
  if(/questionable|day[- ]to[- ]day/i.test(s)) return 1;
  return 0;
};
M.isHealthy = function(status){
  return /^\s*active\s*$/i.test(String(status == null ? "" : status));
};
/* Flatten ESPN's injury detail object into one readable line (mirrors
   injuries.js detailText: longComment wins, then shortComment, then the
   structured details object). */
M.injuryDetail = function(i){
  i = i || {};
  if(i.longComment) return String(i.longComment);
  if(i.shortComment) return String(i.shortComment);
  var det = i.details || {}, parts = [];
  [det.type, det.location].forEach(function(v){
    if(v && parts.indexOf(v) === -1) parts.push(v);
  });
  if(det.detail && det.detail !== "Not Specified") parts.push(det.detail);
  if(det.side && det.side !== "Not Specified") parts.push(det.side + " side");
  var s = parts.join(" · ");
  if(det.returnDate) s += (s ? " — " : "") + "expected back " + String(det.returnDate).slice(0, 10);
  if(!s && i.type && i.type.description) s = String(i.type.description);
  return s;
};
/* One team's injury list from an ESPN injuries payload: matched by
   abbreviation first (payload teams carry it), display-name equality as
   fallback. Returns null when the team isn't in the payload — the hub
   then says so honestly instead of guessing. */
M.teamInjuries = function(payload, abbr, displayName){
  var teams = (payload && payload.injuries) || [];
  var want = String(abbr == null ? "" : abbr).toUpperCase();
  var hit = null;
  for(var i = 0; i < teams.length && !hit; i++){
    var ta = String((teams[i] && (teams[i].abbreviation || teams[i].abbr)) || "").toUpperCase();
    if(want && ta === want) hit = teams[i];
  }
  if(!hit && displayName){
    var dn = String(displayName).toLowerCase();
    for(var j = 0; j < teams.length && !hit; j++){
      if(String((teams[j] && (teams[j].displayName || teams[j].name)) || "").toLowerCase() === dn)
        hit = teams[j];
    }
  }
  if(!hit) return null;
  var list = ((hit && hit.injuries) || [])
    .filter(function(e){ return !M.isHealthy(e && e.status); });
  list.sort(function(a, b){ return M.sevRank(b.status) - M.sevRank(a.status); });
  return {
    team: String(hit.displayName || hit.name || displayName || abbr || "Team"),
    injuries: list.map(function(e){
      return {
        name: String((e && e.athlete && e.athlete.displayName) || "Unknown"),
        status: String((e && e.status) || ""),
        detail: M.injuryDetail(e),
        date: String((e && e.date) || "").slice(0, 10)
      };
    })
  };
};
/* "3 out · 1 questionable" for a section header, or "" when clean —
   the caller renders its honest "no reported injuries" line instead. */
M.injurySummary = function(teamInj){
  if(!teamInj) return "";
  var c = [0, 0, 0];
  teamInj.injuries.forEach(function(e){
    var r = M.sevRank(e.status);
    if(r === 3) c[0]++;
    else if(r === 2) c[1]++;
    else if(r === 1) c[2]++;
  });
  var parts = [];
  if(c[0]) parts.push(c[0] + " out");
  if(c[1]) parts.push(c[1] + " doubtful");
  if(c[2]) parts.push(c[2] + " questionable");
  return parts.join(" · ");
};

/* ---- best-book prices + line moves (Odds API, visitor key) ----
   matchOddsEvent finds the Odds API event for the hub game by team names
   plus game-day agreement — no event-id guesswork across providers.
   awayNames/homeNames are the acceptable name forms for each side (abbr,
   displayName, short name); the first date-matching candidate wins. */
M.normName = function(s){
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
};
M.dayOf = function(iso){
  var t = Date.parse(iso || "");
  if(!isFinite(t)) return null;
  var d = new Date(t);
  function p(n){ return String(n).padStart(2, "0"); }
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
};
M.matchOddsEvent = function(events, awayNames, homeNames, kickoffISO){
  var an = (awayNames || []).map(M.normName),
      hn = (homeNames || []).map(M.normName);
  var kickDay = M.dayOf(kickoffISO);
  for(var i = 0; i < (events || []).length; i++){
    var ev = events[i];
    if(!ev || ev.id === null || ev.id === undefined) continue;
    if(an.indexOf(M.normName(ev.away_team)) === -1) continue;
    if(hn.indexOf(M.normName(ev.home_team)) === -1) continue;
    if(kickDay){
      var ed = M.dayOf(ev.commence_time);
      if(ed && ed !== kickDay) continue; /* same pair, different day — not our game */
    }
    return ev;
  }
  return null;
};
/* Best available price per side from the books (OL.bestSpread / bestTotal /
   bestML injected), rendered as plain HTML rows. "" when the event has no
   bookmakers — the caller falls back to its no-key empty state. */
M.bestBookRows = function(oddsEv, OL, esc){
  esc = esc || function(s){ return String(s == null ? "" : s); };
  if(!oddsEv || !OL) return "";
  var books = oddsEv.bookmakers || [];
  if(!books.length) return "";
  var titleOf = function(key){
    for(var i = 0; i < books.length; i++)
      if(books[i] && books[i].key === key) return books[i].title || books[i].key;
    return key;
  };
  var rows = [];
  function row(label, ident, pointFmt){
    if(!ident) return;
    var parts = String(ident).split("|");
    /* identifiers are "key|point|price" (spreads/totals) or "key|price"
       (moneyline) — the price is always the last segment. */
    var price = Number(parts[parts.length - 1]);
    var pt = (pointFmt && parts.length === 3) ? pointFmt(Number(parts[1])) : null;
    var am = (OL.dec2am && isFinite(price)) ? OL.dec2am(price) : parts[parts.length - 1];
    rows.push({label: label, val: pt !== null ? pt + " (" + am + ")" : String(am),
               book: titleOf(parts[0])});
  }
  var bs = OL.bestSpread(books, oddsEv), bt = OL.bestTotal(books), bm = OL.bestML(books, oddsEv);
  function fmtPt(p){ return (p > 0 ? "+" : "") + p; }
  row("Spread · " + (oddsEv.away_team || "Away"), bs && bs.a, fmtPt);
  row("Spread · " + (oddsEv.home_team || "Home"), bs && bs.h, fmtPt);
  row("Total · Over", bt && bt.o, function(p){ return "O " + p; });
  row("Total · Under", bt && bt.u, function(p){ return "U " + p; });
  row("Moneyline · " + (oddsEv.away_team || "Away"), bm && bm.a);
  row("Moneyline · " + (oddsEv.home_team || "Home"), bm && bm.h);
  if(!rows.length) return "";
  return rows.map(function(r){
    return '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line-soft)">'+
      '<div style="min-width:0"><strong style="color:var(--text);font-size:.9rem">'+esc(r.label)+'</strong></div>'+
      '<div style="display:flex;align-items:baseline;gap:12px;white-space:nowrap">'+
      '<span class="num" style="font-weight:800;color:var(--gold);font-size:1.02rem">'+esc(r.val)+'</span>'+
      '<span style="color:var(--faint);font-size:.78rem">'+esc(r.book)+'</span></div></div>';
  }).join("");
};
/* Line-move badges for the hub game: the visitor's personal opener map
   (giu_odds_open_<sport>, the same map the odds board seeds) against this
   pull's consensus, via OL.moverEntries/biggestMovers — reused verbatim,
   so the hub's badges mean exactly what the board's steam strip means.
   Returns HTML chips, "" when there is no opener or no meaningful move. */
M.moveBadgesHtml = function(oddsEv, opens, OL, esc){
  esc = esc || function(s){ return String(s == null ? "" : s); };
  if(!oddsEv || !OL) return "";
  var entries = OL.moverEntries([oddsEv], opens || {});
  var top = OL.biggestMovers(entries, 2);
  if(!top.length) return "";
  return top.map(function(e){
    var cls = e.delta >= 0 ? "mv-up" : "mv-dn";
    var glyph = e.delta >= 0 ? "\u25b2" : "\u25bc";
    var kind = e.kind === "spread" ? "Spread" : "Total";
    var arrow = e.delta >= 0 ? "+" : "\u2212";
    var pts = Math.abs(Math.round(e.delta * 100) / 100);
    var tip = kind + " moved from " + e.openFmt + " to " + M.moverNowFmt(e) +
      " since your first look (your opener, stored in this browser only" +
      (e.kind === "spread" ? "; away-side points" : "") + ").";
    return ' <span class="' + cls + '" title="' + esc(tip) + '">' + glyph + " " +
      esc(kind) + " " + arrow + esc(String(pts)) + "</span>";
  }).join("");
};
/* The "now" number for a mover entry tooltip: open (away-side consensus
   points for spreads, Over points for totals) plus delta, rounded to the
   hundredth. Null when the open isn't numeric — the tooltip then repeats
   the open instead of inventing a number. */
M.moverNow = function(openFmt, delta){
  var open = parseFloat(String(openFmt).replace(/^[\u2212]/, "-"));
  if(!isFinite(open) || !isFinite(delta)) return null;
  return Math.round((open + delta) * 100) / 100;
};
M.moverNowFmt = function(e){
  var now = M.moverNow(e && e.openFmt, e && e.delta);
  if(now === null) return String((e && e.openFmt) == null ? "" : e.openFmt);
  return (e.kind === "spread" && now > 0 ? "+" : "") + String(now);
};

var api = {
  LEAGUE_PATHS: LEAGUE_PATHS, ODDS_SPORTS: ODDS_SPORTS,
  leaguePath: M.leaguePath, oddsSport: M.oddsSport,
  parseParams: M.parseParams, summaryUrl: M.summaryUrl,
  injuriesUrl: M.injuriesUrl, headerOf: M.headerOf,
  overallRecord: M.overallRecord, gameInfo: M.gameInfo,
  stripRowForGame: M.stripRowForGame, kalshiForGame: M.kalshiForGame,
  pmFavoriteFromMap: M.pmFavoriteFromMap, pmForGame: M.pmForGame,
  sevRank: M.sevRank, isHealthy: M.isHealthy,
  injuryDetail: M.injuryDetail, teamInjuries: M.teamInjuries,
  injurySummary: M.injurySummary, normName: M.normName,
  dayOf: M.dayOf, matchOddsEvent: M.matchOddsEvent,
  bestBookRows: M.bestBookRows, moveBadgesHtml: M.moveBadgesHtml,
  moverNow: M.moverNow, moverNowFmt: M.moverNowFmt
};
if(typeof module !== "undefined" && module.exports){ module.exports = api; }
else if(typeof window !== "undefined"){ window.Matchup = api; }
})();
