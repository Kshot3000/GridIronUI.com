/* GridIronUI scores game-detail logic — pure functions that turn ESPN's
   game-summary payload (site.api.espn.com/.../summary?event=ID) into
   bettor-facing game detail: a scoring-plays timeline, a period-by-period
   scoring table, and a team-stats comparison. This module never invents
   data: when a payload lacks scoring plays or comparable team stats, the
   corresponding section is skipped; when both are missing, buildHtml
   returns null so the page renders nothing instead of a fake detail. */
(function(){
"use strict";
var D = {};

D.summaryUrl = function(leaguePath, eventId){
  return "https://site.api.espn.com/apis/site/v2/sports/"+
    String(leaguePath||"")+"/summary?event="+encodeURIComponent(String(eventId||""));
};

/* Period kind by league: quarters for football/basketball, halves for
   soccer and men's college hoops, periods for hockey. */
D.periodKind = function(leaguePath){
  var p = String(leaguePath||"").toLowerCase();
  if(p.indexOf("soccer") >= 0) return "H";
  if(p.indexOf("mens-college-basketball") >= 0) return "H";
  if(p.indexOf("hockey") >= 0) return "P";
  return "Q";
};

D.periodLabel = function(n, kind){
  n = Number(n) || 0;
  if(kind === "H") return "H"+n;
  if(kind === "P") return n > 3 ? "OT" : "P"+n;
  return n > 4 ? "OT" : "Q"+n;   /* Q: football, basketball */
};

/* Clean scoring-play rows from a summary payload. Plays without text are
   skipped rather than rendered as empty rows. */
D.scoringRows = function(summary){
  var out = [];
  var plays = (summary && summary.scoringPlays) || [];
  plays.forEach(function(pl){
    var text = String((pl && pl.text) || "").trim();
    if(!text) return;
    out.push({
      period: (pl.period && pl.period.number) || 0,
      clock: (pl.clock && pl.clock.displayValue) || "",
      text: text,
      away: Number(pl.awayScore),
      home: Number(pl.homeScore),
      abbr: (pl.team && pl.team.abbreviation) || ""
    });
  });
  return out;
};

/* Period-by-period scoring from the running totals on each scoring play.
   The per-period score is the last (highest) running total seen in that
   period; the game total is the last play's running total. */
D.periodTable = function(rows, kind){
  var per = {}, order = [];
  rows.forEach(function(r){
    if(!per[r.period]){ per[r.period] = {away: 0, home: 0}; order.push(r.period); }
    if(isFinite(r.away)) per[r.period].away = Math.max(per[r.period].away, r.away);
    if(isFinite(r.home)) per[r.period].home = Math.max(per[r.period].home, r.home);
  });
  order.sort(function(a,b){ return a-b; });
  var periods = order.map(function(p){
    return {label: D.periodLabel(p, kind), away: per[p].away, home: per[p].home};
  });
  var last = rows[rows.length-1] || {away: 0, home: 0};
  return {periods: periods, total: {away: last.away, home: last.home}};
};

/* Team-stats comparison from boxscore.teams. Both sides must expose a flat
   statistics array (the NFL/NBA shape: {name,label,displayValue}); leagues
   with nested stat groups (MLB's batting/pitching/fielding) get no table
   instead of a guessed one. Only stat names present on BOTH teams are used,
   ESPN's own ordering is kept (it leads with the bettor-relevant ones), and
   "-" display values (ESPN's "not tracked") are dropped. */
D.teamStats = function(summary){
  var teams = (summary && summary.boxscore && summary.boxscore.teams) || [];
  if(teams.length < 2) return null;
  var away = null, home = null;
  teams.forEach(function(t){
    if(t && t.homeAway === "away" && !away) away = t;
    if(t && t.homeAway === "home" && !home) home = t;
  });
  if(!away || !home) return null;   /* home/away unknown: don't guess */
  if(!Array.isArray(away.statistics) || !Array.isArray(home.statistics)) return null;
  var byName = {};
  home.statistics.forEach(function(s){ if(s && s.name) byName[s.name] = s; });
  var rows = [];
  away.statistics.forEach(function(s){
    if(!s || !s.name) return;
    var o = byName[s.name];
    if(!o) return;
    var label = String(s.label || o.label || "").trim();
    if(!label) return;
    var va = String(s.displayValue == null ? "" : s.displayValue).trim();
    var vh = String(o.displayValue == null ? "" : o.displayValue).trim();
    if(!va || !vh || va === "-" || vh === "-") return;
    rows.push({label: label, away: va, home: vh});
  });
  if(rows.length < 2) return null;
  return {
    awayAbbr: (away.team && away.team.abbreviation) || "AWY",
    homeAbbr: (home.team && home.team.abbreviation) || "HME",
    rows: rows.slice(0, 8)
  };
};

/* Full detail HTML for an in-progress or final game, or null when the
   payload carries neither scoring plays nor comparable stats. esc is
   injected (GIU.esc in the browser, identity in tests). */
D.buildHtml = function(summary, leaguePath, esc){
  esc = esc || function(s){ return String(s == null ? "" : s); };
  var rows = D.scoringRows(summary);
  var stats = D.teamStats(summary);
  if(!rows.length && !stats) return null;
  var kind = D.periodKind(leaguePath);
  var awayAbbr = "AWY", homeAbbr = "HME";
  ((summary && summary.boxscore && summary.boxscore.teams) || []).forEach(function(t){
    if(t && t.team && t.homeAway === "away" && t.team.abbreviation) awayAbbr = t.team.abbreviation;
    if(t && t.team && t.homeAway === "home" && t.team.abbreviation) homeAbbr = t.team.abbreviation;
  });
  var h = '<div class="gd-detail-inner">';
  if(rows.length){
    var pt = D.periodTable(rows, kind);
    h += '<table class="gd-ptable" aria-label="Scoring by period"><thead><tr><th scope="col"><span class="sr-only">Team</span></th>'+
      pt.periods.map(function(p){ return '<th scope="col">'+esc(p.label)+'</th>'; }).join("")+
      '<th scope="col">T</th></tr></thead><tbody>'+
      '<tr><th scope="row">'+esc(awayAbbr)+'</th>'+
      pt.periods.map(function(p){ return '<td>'+esc(String(p.away))+'</td>'; }).join("")+
      '<td><b>'+esc(String(pt.total.away))+'</b></td></tr>'+
      '<tr><th scope="row">'+esc(homeAbbr)+'</th>'+
      pt.periods.map(function(p){ return '<td>'+esc(String(p.home))+'</td>'; }).join("")+
      '<td><b>'+esc(String(pt.total.home))+'</b></td></tr>'+
      '</tbody></table>';
    h += '<div class="gd-plays" aria-label="Scoring plays">';
    var lastP = -1;
    rows.forEach(function(r){
      if(r.period !== lastP){
        h += '<div class="gd-ph">'+esc(D.periodLabel(r.period, kind))+'</div>';
        lastP = r.period;
      }
      h += '<div class="gd-play"><span class="gd-clock">'+esc(r.clock)+'</span>'+
        '<span class="gd-text">'+esc(r.text)+'</span>'+
        '<span class="gd-score num">'+esc(awayAbbr)+' '+esc(String(r.away))+' · '+esc(homeAbbr)+' '+esc(String(r.home))+'</span></div>';
    });
    h += '</div>';
  }
  if(stats){
    h += '<table class="gd-stats" aria-label="Team stats comparison"><thead><tr><th scope="col"><span class="sr-only">Stat</span></th>'+
      '<th scope="col">'+esc(stats.awayAbbr)+'</th><th scope="col">'+esc(stats.homeAbbr)+'</th></tr></thead><tbody>'+
      stats.rows.map(function(r){
        return '<tr><td>'+esc(r.label)+'</td><td class="num">'+esc(r.away)+'</td><td class="num">'+esc(r.home)+'</td></tr>';
      }).join("")+'</tbody></table>';
  }
  h += '<div class="gd-src">Box-score detail from ESPN. Scoring and stats update as the game progresses.</div></div>';
  return h;
};

if(typeof module !== "undefined" && module.exports) module.exports = D;
else window.ScoresDetail = D;
})();
