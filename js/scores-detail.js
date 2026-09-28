/* GridIronUI scores game-detail logic — pure functions that turn ESPN's
   game-summary payload (site.api.espn.com/.../summary?event=ID) into
   bettor-facing game detail: an ESPN Matchup Predictor card for pregame
   games, a win-probability chart with the biggest swing annotated for
   in-progress and final games, a scoring-plays timeline, a period-by-period
   scoring table, and a team-stats comparison. This module never invents
   data: when a payload lacks a section's source data, that section is
   skipped; when it lacks everything, buildHtml returns null so the page
   renders nothing instead of a fake detail. */
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

/* Game state from the summary header: "pre", "in", or "post". The
   win-probability chart only makes sense once plays exist; the Matchup
   Predictor only before kickoff. */
D.gameState = function(summary){
  try{
    var t = summary.header.competitions[0].status.type;
    return String(t && t.state || "");
  }catch(e){ return ""; }
};

/* Win-probability series: ESPN's `winprobability` array (lowercase in the
   API) — one sample per play, homeWinPercentage as a fraction. Returns null
   for pregame payloads (nothing has happened yet) and for anything under
   2 valid samples. */
D.winProbSeries = function(summary){
  var st = D.gameState(summary);
  if(st === "pre") return null;
  var arr = (summary && (summary.winprobability || summary.winProbability)) || [];
  var samples = [];
  for(var i = 0; i < arr.length; i++){
    var w = arr[i] || {};
    var p = Number(w.homeWinPercentage);
    if(!isFinite(p)) continue;
    samples.push({p: Math.max(0, Math.min(1, p)),
                  playId: (w.playId == null ? null : String(w.playId))});
  }
  if(samples.length < 2) return null;
  return {samples: samples, state: st};
};

/* Map playId -> {text, period, clock} so the chart caption can name the
   play behind the biggest swing. Sources: drives.previous[].plays[] and
   the scoring plays; both carry the same play ids. Unresolvable plays
   are simply left out — the caption falls back to describing the swing
   without naming a play, never a guess. */
D.playTextById = function(summary){
  var map = {};
  function add(id, text, period, clock){
    var k = (id == null ? null : String(id));
    if(!k || map[k]) return;
    map[k] = {text: String(text || "").trim(),
              period: Number(period) || 0,
              clock: String(clock || "")};
  }
  var dr = (summary && summary.drives) || {};
  (dr.previous || []).forEach(function(d){
    ((d && d.plays) || []).forEach(function(p){
      add(p && p.id, p && p.text,
          p && p.period && p.period.number,
          p && p.clock && p.clock.displayValue);
    });
  });
  ((summary && summary.scoringPlays) || []).forEach(function(p){
    add(p && p.id, p && p.text,
        p && p.period && p.period.number,
        p && p.clock && p.clock.displayValue);
  });
  return map;
};

/* The biggest single-sample swing in the series — the bettor's "what
   flipped this game" moment. dir names the side the swing went toward. */
D.biggestSwing = function(series, playMap){
  var s = (series && series.samples) || [];
  if(s.length < 2) return null;
  var best = {idx: 0, delta: 0, from: s[0].p, to: s[0].p};
  for(var i = 1; i < s.length; i++){
    var d = s[i].p - s[i-1].p;
    if(Math.abs(d) > Math.abs(best.delta))
      best = {idx: i, delta: d, from: s[i-1].p, to: s[i].p};
  }
  if(best.delta === 0) return null;
  var pl = (playMap && s[best.idx].playId) ? (playMap[s[best.idx].playId] || null) : null;
  return {idx: best.idx, delta: best.delta, from: best.from, to: best.to,
          dir: best.delta >= 0 ? "home" : "away",
          play: (pl && pl.text) ? pl : null};
};

/* Matchup Predictor for pregame games: ESPN's projected win chances for
   each side. Numbers are parsed and sanity-checked (NaN or negative ->
   no card). Post/kickoff payloads return null even if a stale predictor
   block lingers in the JSON. */
D.predictor = function(summary){
  if(D.gameState(summary) !== "pre") return null;
  var pr = summary && summary.predictor;
  if(!pr) return null;
  var hp = Number(pr.homeTeam && pr.homeTeam.gameProjection);
  var ap = Number(pr.awayTeam && pr.awayTeam.gameProjection);
  if(!isFinite(hp) || !isFinite(ap) || hp < 0 || ap < 0 || (hp + ap) <= 0) return null;
  var hid = pr.homeTeam && pr.homeTeam.id, aid = pr.awayTeam && pr.awayTeam.id;
  var meta = {home: {id: hid == null ? null : String(hid)},
              away: {id: aid == null ? null : String(aid)}};
  var comp0 = ((summary.header || {}).competitions || [])[0] || {};
  (comp0.competitors || []).forEach(function(c){
    var tm = (c && c.team) || {};
    var tid = (tm.id == null) ? null : String(tm.id);
    var slot = (tid && tid === meta.home.id) ? meta.home
             : (tid && tid === meta.away.id) ? meta.away : null;
    if(slot){
      if(tm.abbreviation) slot.abbr = tm.abbreviation;
      var col = String(tm.color || "").replace(/^#/, "");
      if(/^[0-9a-fA-F]{6}$/.test(col)) slot.color = "#" + col;
    }
  });
  return {home: hp / 100, away: ap / 100,
          homeAbbr: meta.home.abbr || "HME", awayAbbr: meta.away.abbr || "AWY",
          homeColor: meta.home.color || "#e8edf5", awayColor: meta.away.color || "#c9a227"};
};

/* Team colors from boxscore.teams[].team.color, with safe fallbacks so a
   payload without colors still draws a readable chart. */
D.teamColors = function(summary){
  var out = {home: "#e8edf5", away: "#c9a227"};
  ((summary && summary.boxscore && summary.boxscore.teams) || []).forEach(function(t){
    var col = String((t && t.team && t.team.color) || "").replace(/^#/, "");
    if(!/^[0-9a-fA-F]{6}$/.test(col)) return;
    if(t.homeAway === "home") out.home = "#" + col;
    else if(t.homeAway === "away") out.away = "#" + col;
  });
  return out;
};

D.fmtPct = function(p){ return (Number(p) * 100).toFixed(1) + "%"; };

/* Win-probability section HTML: a canvas chart (painted by paintWinProb
   after insertion) plus a plain-language caption that carries the story
   even where canvas can't render. Perspective is the home side, stated
   up front so the chart can never be misread. */
D.winProbHtml = function(series, info, esc, kind){
  var s = series.samples, n = s.length;
  var playMap = D.playTextById(info.summary);
  var swing = D.biggestSwing(series, playMap);
  var hc = info.colors.home;
  var hb = info.homeAbbr, ab = info.awayAbbr;
  var data = {p: s.map(function(x){ return Math.round(x.p * 10000) / 10000; }),
              swing: swing ? swing.idx : -1};
  var startTxt = D.fmtPct(s[0].p) + " " + hb;
  var endTxt = D.fmtPct(s[n-1].p) + " " + hb;
  var cap = "Win probability, " + hb + " perspective — opened " + startTxt +
            ", ended " + endTxt + (series.state === "post" ? " (final)" : " (live)");
  var swingTxt = "";
  if(swing){
    var dirAbbr = swing.dir === "home" ? hb : ab;
    var pts = (Math.abs(swing.delta) * 100).toFixed(0);
    swingTxt = "Biggest swing: " + pts + " pts toward " + dirAbbr;
    if(swing.play){
      var pl = swing.play;
      var when = pl.period ? " (" + D.periodLabel(pl.period, kind) +
                (pl.clock ? " " + pl.clock : "") + ")" : "";
      swingTxt += " — " + pl.text + when;
    }
    swingTxt += ".";
    cap += ". " + swingTxt;
  }
  var payload = JSON.stringify(data);
  return '<div class="gd-wpwrap"><div class="gd-sect">Win probability</div>'+
    '<canvas class="gd-wp" data-wp="' + esc(payload) + '" data-hc="' + esc(hc) +
    '" role="img" aria-label="' + esc(cap) + '"></canvas>'+
    '<div class="gd-wpcap">' + esc(swingTxt || "Opened " + startTxt + ", now " + endTxt + ".") + "</div>"+
    "</div>";
};

/* Matchup Predictor section HTML: a proportional dual bar in team colors
   with an honest "pregame projection, not a line" label. Segment text is
   dark on light team colors so it stays readable. */
D.predTextOn = function(hex){
  var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex));
  if(!m) return "#fff";
  var v = parseInt(m[1], 16);
  var lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.62 ? "#0e1420" : "#fff";
};
D.predictorHtml = function(pred, esc){
  var tot = pred.home + pred.away;
  var hp = pred.home / tot * 100, ap = pred.away / tot * 100;
  var aria = "ESPN Matchup Predictor: " + pred.homeAbbr + " " + D.fmtPct(pred.home) +
             ", " + pred.awayAbbr + " " + D.fmtPct(pred.away) +
             ". A pregame projection, not a betting line.";
  function seg(w, color, abbr, val){
    return '<span class="gd-pred-seg" style="width:' + w.toFixed(1) + "%;background:" +
      esc(color) + ";color:" + esc(D.predTextOn(color)) + '">' +
      '<b>' + esc(abbr) + '</b> ' + esc(D.fmtPct(val)) + "</span>";
  }
  return '<div class="gd-pred"><div class="gd-sect">Matchup Predictor</div>'+
    '<div class="gd-pred-bar" role="img" aria-label="' + esc(aria) + '">'+
    seg(hp, pred.homeColor, pred.homeAbbr, pred.home) +
    seg(ap, pred.awayColor, pred.awayAbbr, pred.away) + "</div>"+
    '<div class="gd-wpcap">ESPN\u2019s pregame projection — information, not a betting line.</div></div>';
};

/* Paints a win-probability canvas emitted by winProbHtml. Defensive by
   design: no data, bad data, or no 2d context all return silently, leaving
   the caption (which carries the same story in text) intact. DPR-aware so
   the line stays crisp on retina; static drawing, so reduced-motion needs
   no special case. */
D.paintWinProb = function(canvas){
  try{
    if(!canvas || !canvas.getAttribute) return;
    var raw = canvas.getAttribute("data-wp");
    if(!raw) return;
    var data = JSON.parse(raw);
    var p = (data && data.p) || [];
    if(!Array.isArray(p) || p.length < 2) return;
    p = p.filter(function(x){ return isFinite(Number(x)); }).map(Number);
    if(p.length < 2) return;
    var ctx = canvas.getContext && canvas.getContext("2d");
    if(!ctx) return;
    var hc = String(canvas.getAttribute("data-hc") || "#e8edf5");
    var W = canvas.clientWidth || 640, H = canvas.clientHeight || 150;
    var dpr = 1;
    try{ dpr = Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1); }catch(e){}
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var padL = 8, padR = 46, padT = 10, padB = 14;
    var iw = W - padL - padR, ih = H - padT - padB;
    var n = p.length, stride = Math.max(1, Math.ceil(n / 600));
    function X(i){ return padL + (i / (n - 1)) * iw; }
    function Y(v){ return padT + (1 - v) * ih; }
    /* 50% reference line */
    ctx.save();
    ctx.strokeStyle = "rgba(232,237,245,.28)";
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, Y(0.5)); ctx.lineTo(padL + iw, Y(0.5)); ctx.stroke();
    ctx.restore();
    /* area fill */
    var grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
    grad.addColorStop(0, hexA(hc, 0.34)); grad.addColorStop(1, hexA(hc, 0.02));
    ctx.beginPath();
    ctx.moveTo(X(0), Y(p[0]));
    for(var i = stride; i < n; i += stride) ctx.lineTo(X(i), Y(p[i]));
    ctx.lineTo(X(n - 1), Y(p[n - 1]));
    ctx.lineTo(X(n - 1), padT + ih); ctx.lineTo(padL, padT + ih); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    /* the line */
    ctx.beginPath();
    ctx.moveTo(X(0), Y(p[0]));
    for(var j = stride; j < n; j += stride) ctx.lineTo(X(j), Y(p[j]));
    ctx.lineTo(X(n - 1), Y(p[n - 1]));
    ctx.strokeStyle = hc; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    /* biggest-swing marker */
    var sw = Number(data.swing);
    if(isFinite(sw) && sw >= 0 && sw < n){
      ctx.beginPath(); ctx.arc(X(sw), Y(p[sw]), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0e1420"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#c9a227"; ctx.stroke();
    }
    /* endpoint labels */
    ctx.fillStyle = "rgba(232,237,245,.85)";
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText((p[0] * 100).toFixed(0) + "%", padL + iw + 6, Y(p[0]));
    ctx.fillText((p[n-1] * 100).toFixed(0) + "%", padL + iw + 6, Y(p[n-1]));
    ctx.fillStyle = "rgba(232,237,245,.4)";
    ctx.fillText("50", padL + iw + 6, Y(0.5));
  }catch(e){ /* a chart must never break the detail panel */ }
  function hexA(hex, a){
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex));
    if(!m) return "rgba(232,237,245," + a + ")";
    var v = parseInt(m[1], 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }
};

/* Full detail HTML for a pregame, in-progress, or final game — or null
   when the payload carries no usable section at all (no predictor, no
   win-probability series, no scoring plays, no comparable stats). esc is
   injected (GIU.esc in the browser, identity in tests). */
D.buildHtml = function(summary, leaguePath, esc){
  esc = esc || function(s){ return String(s == null ? "" : s); };
  var rows = D.scoringRows(summary);
  var stats = D.teamStats(summary);
  var wp = D.winProbSeries(summary);
  var pred = D.predictor(summary);
  if(!rows.length && !stats && !wp && !pred) return null;
  var kind = D.periodKind(leaguePath);
  var awayAbbr = "AWY", homeAbbr = "HME";
  ((summary && summary.boxscore && summary.boxscore.teams) || []).forEach(function(t){
    if(t && t.team && t.homeAway === "away" && t.team.abbreviation) awayAbbr = t.team.abbreviation;
    if(t && t.team && t.homeAway === "home" && t.team.abbreviation) homeAbbr = t.team.abbreviation;
  });
  var h = '<div class="gd-detail-inner">';
  if(pred) h += D.predictorHtml(pred, esc);
  if(wp) h += D.winProbHtml(wp, {summary: summary, colors: D.teamColors(summary),
                                homeAbbr: homeAbbr, awayAbbr: awayAbbr}, esc, kind);
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
  h += '<div class="gd-src">Box-score detail from ESPN. Scoring, stats, and win probability update as the game progresses.</div></div>';
  return h;
};

if(typeof module !== "undefined" && module.exports) module.exports = D;
else window.ScoresDetail = D;
})();
