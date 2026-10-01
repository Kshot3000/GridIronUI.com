/* GridIronUI DFS Lab — game-conditions (weather) cross-check, pure logic.
   Maps the user's NFL pool teams onto the ESPN NFL scoreboard so the lab can
   show REAL stadium forecasts for the games their pool plays in — wind moves
   totals and the passing game, so it's a genuine DFS edge check, not decor.
   Weather deps are injected ({venueFor, sliceWindow, impactNotes}, window.GIU
   in the browser) so this stays pure and node-testable.
   Browser: window.DFSWx · node: module.exports */
(function(){
"use strict";

/* Pool team entry -> normalized ESPN-style abbreviation. ESPN uses WSH for
   Washington and JAX for Jacksonville; pools imported from DK/FD carry the
   same abbrs, so the alias map mirrors home-strip.js's honest normalization. */
var TEAM_ALIAS = {WAS:"WSH", JAC:"JAX"};
function normTeam(t){
  var a = String(t == null ? "" : t).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return TEAM_ALIAS[a] || a;
}

/* Kickoff must be in the future-ish (a game in progress still matters for
   late-swap) and inside Open-Meteo's 16-day hourly forecast. */
var HORIZON_MS = 16 * 24 * 3600 * 1000;
function kickOk(kickMs, nowMs){
  if(!isFinite(kickMs) || !isFinite(nowMs)) return false;
  return kickMs > nowMs - 4 * 3600 * 1000 && kickMs < nowMs + HORIZON_MS;
}

/* One scoreboard event -> {away, home, date} or null. Only pre/in games —
   final games have no forecast value. Malformed events are skipped, never
   guessed. */
function evTeams(ev){
  try{
    var c = ((ev || {}).competitions || [])[0];
    if(!c) return null;
    var st = (((c.status || {}).type) || {}).state || "";
    if(st === "post") return null;
    var home = null, away = null;
    ((c.competitors) || []).forEach(function(t){
      var ab = t && t.team && t.team.abbreviation;
      if(!ab) return;
      if(t.homeAway === "home") home = String(ab).toUpperCase();
      else if(t.homeAway === "away") away = String(ab).toUpperCase();
    });
    if(!home || !away) return null;
    return { away: away, home: home, date: ev.date || "", id: ev.id || "" };
  }catch(e){ return null; }
}

/* Which scoreboard games involve at least one pool team.
   Returns {skip:"nfl"|"demo"|"empty"|"nba"} when there's nothing honest to
   show, else {games:[{id, away, home, date, kickMs, venue}]} with venue the
   wx-shared venueFor() row ([abbr, stadium, city, lat, lon, roof]). */
function poolGames(pool, sport, events, nowMs, deps){
  deps = deps || {};
  if(sport !== "NFL") return { skip: "nba" }; /* indoors — no weather angle */
  pool = Array.isArray(pool) ? pool : [];
  if(!pool.length) return { skip: "empty" };
  if(pool.every(function(p){ return p && p.demo; })) return { skip: "demo" }; /* synthetic slate, synthetic players — no real forecast */
  var teams = {};
  pool.forEach(function(p){
    var t = normTeam(p && p.team);
    if(t) teams[t] = 1;
  });
  var teamList = Object.keys(teams);
  if(!teamList.length) return { skip: "empty" };
  var games = [], seen = {};
  ((events) || []).forEach(function(ev){
    var e = evTeams(ev);
    if(!e) return;
    if(!(teams[e.away] || teams[e.home])) return;
    var key = e.id || (e.away + "@" + e.home + "|" + e.date);
    if(seen[key]) return;
    seen[key] = 1;
    var kickMs = Date.parse(e.date || "");
    if(!kickOk(kickMs, nowMs)) return;
    games.push({ id: e.id, away: e.away, home: e.home, date: e.date,
                 kickMs: kickMs,
                 venue: deps.venueFor ? deps.venueFor(ev, e.home) : null });
  });
  return { games: games };
}

/* Open-air games need a forecast; roofed games carry their roof truth.
   Returns {fetch:[game...], roofed:[game...]}. */
function splitRoofed(games){
  var fetch = [], roofed = [];
  (games || []).forEach(function(g){
    var row = g && g.venue && g.venue.row;
    var roof = row ? String(row[5] || "").toLowerCase() : "";
    var lat = row ? Number(row[3]) : NaN, lon = row ? Number(row[4]) : NaN;
    if(roof === "dome" || roof === "retractable" || !isFinite(lat) || !isFinite(lon)){
      roofed.push(g);
    } else {
      fetch.push({ game: g, lat: lat, lon: lon });
    }
  });
  return { fetch: fetch, roofed: roofed };
}

/* One Open-Meteo multi-location request for every open-air game venue —
   the same one-call pattern as the odds board's wxUrl. Returns null when
   there is nothing to fetch. */
function wxUrl(items){
  items = items || [];
  if(!items.length) return null;
  var lats = items.map(function(x){ return x.lat; }).join(","),
      lons = items.map(function(x){ return x.lon; }).join(",");
  return "https://api.open-meteo.com/v1/forecast?latitude=" + lats +
    "&longitude=" + lons +
    "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&forecast_days=16";
}

/* Max-over-window stats from sliced hourly points. Pure — the DFS angle
   below reads these, and impactNotes (weather page, same model) reads the
   same hours, so the two can never disagree. */
function wxStats(hrs){
  var s = { wind: 0, gust: 0, precip: 0, temp: Infinity };
  (hrs || []).forEach(function(h){
    if(h.wind > s.wind) s.wind = h.wind;
    if(h.gust > s.gust) s.gust = h.gust;
    if(h.precip > s.precip) s.precip = h.precip;
    if(h.temp < s.temp) s.temp = h.temp;
  });
  if(s.temp === Infinity) s.temp = NaN;
  return s;
}

/* The DFS translation of the weather read — what a lineup builder actually
   does with the forecast. Thresholds match wx-shared's impact model
   (gust 30/24, wind 20/13, precip 60, temp 25), so the lab and the weather
   page tell one story. Returns [] when there's nothing actionable. */
function dfsAngles(stats){
  var out = [];
  if(stats.gust >= 30 || stats.wind >= 20)
    out.push("Downgrade pass-catchers and kickers; run-game and DSTs get a boost in this wind.");
  else if(stats.gust >= 24 || stats.wind >= 13)
    out.push("Mild passing risk — prefer short-area targets over deep-ball QBs and WRs.");
  if(stats.precip >= 60)
    out.push("Run-game lean — RBs and DSTs benefit when teams keep it on the ground.");
  if(stats.temp <= 25)
    out.push("Freezing kickoff — kicking range shrinks; DSTs get a small bump.");
  return out;
}

/* Attach forecasts to the plan. items: splitRoofed().fetch rows;
   hourlyArr: aligned Open-Meteo hourly payloads. deps: {sliceWindow,
   impactNotes}. Returns rows ready for panelHtml. */
function withWx(items, hourlyArr, deps){
  deps = deps || {};
  return (items || []).map(function(x, i){
    var hourly = (hourlyArr && hourlyArr[i] && hourlyArr[i].hourly) || { time: [] };
    var hrs = [];
    try{ hrs = deps.sliceWindow ? deps.sliceWindow({ hourly: hourly }, x.game.date) : []; }
    catch(e){ hrs = []; }
    var notes = [];
    try{ notes = deps.impactNotes ? deps.impactNotes(hrs) : []; }catch(e){ notes = []; }
    var stats = wxStats(hrs);
    return { game: x.game, roofed: false, ok: !!(hrs && hrs.length),
             chips: notes, angles: dfsAngles(stats) };
  });
}

/* Roofed games: no forecast needed, and saying "no concerns" would imply a
   forecast was checked — label the roof instead. */
function roofRows(games){
  return (games || []).map(function(g){
    return { game: g, roofed: true, ok: true,
             chips: [{ cls: "tag green", text: "Roofed stadium — weather is a non-factor" }],
             angles: [] };
  });
}

/* Calm-day row: the weather page's own language, kept verbatim. */
function calmChips(){
  return [{ cls: "tag green", text: "No major concerns" }];
}

/* "Thu, Oct 1 · 7:15 PM" in the visitor's timezone. Pure-ish (Date only). */
function kickLabel(iso){
  try{
    var d = new Date(iso);
    if(!isFinite(d)) return "";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }catch(e){ return ""; }
}

/* The panel. rows: withWx()/roofRows() output. esc is injected. */
function panelHtml(rows, esc){
  esc = esc || function(s){ return String(s == null ? "" : s); };
  var cards = (rows || []).map(function(r){
    var g = r.game || {};
    var venueName = (r.venueName || ((r.game && r.game.venue && r.game.venue.row && r.game.venue.row[1]) || ""));
    var chips = (r.ok && r.chips && r.chips.length) ? r.chips
      : (r.ok ? calmChips() : [{ cls: "tag", text: "Forecast unavailable" }]);
    var chipsHtml = chips.map(function(n){
      return '<span class="' + esc(n.cls) + '">' + esc(n.text) + "</span>";
    }).join(" ");
    var anglesHtml = (r.angles || []).map(function(a){
      return '<div style="font-size:.84rem;color:var(--muted);margin-top:6px">🎯 <b style="color:var(--gold-soft)">DFS angle:</b> ' + esc(a) + "</div>";
    }).join("");
    return '<div class="card" style="margin:0">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
        '<b>' + esc(g.away) + " @ " + esc(g.home) + "</b>" +
        '<span class="tag">' + esc(kickLabel(g.date)) + "</span>" +
        (venueName ? '<span style="font-size:.8rem;color:var(--faint)">' + esc(venueName) + "</span>" : "") +
      "</div>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + chipsHtml + "</div>" +
      anglesHtml +
    "</div>";
  }).join("");
  return '<div class="section-head" style="margin:26px 0 12px">' +
      '<div><span class="kicker">Know before you build</span><h2 style="margin:0">🌬️ Game conditions</h2>' +
      '<p style="font-size:.84rem;color:var(--muted);margin:6px 0 0">Real stadium forecasts for the games your pool plays in — wind moves totals and the passing game. Forecasts: Open-Meteo · kickoffs: ESPN. <a href="weather.html">Full game-day forecasts →</a></p></div>' +
    "</div>" +
    '<div class="grid grid-2" style="align-items:start">' + cards + "</div>";
}

var api = { normTeam: normTeam, evTeams: evTeams, poolGames: poolGames,
            splitRoofed: splitRoofed, wxUrl: wxUrl, wxStats: wxStats,
            dfsAngles: dfsAngles, withWx: withWx, roofRows: roofRows,
            kickLabel: kickLabel, panelHtml: panelHtml };
if(typeof module !== "undefined" && module.exports){ module.exports = api; }
else if(typeof window !== "undefined"){
  window.DFSWx = api;
}
})();
