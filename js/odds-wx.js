/* GridIronUI odds-board weather badges — pure glue between the odds board,
   ESPN's scoreboard (for the true venue) and the shared weather core.
   Attaches game-day weather to NFL and MLB postseason odds-board game cards:
   wind moves totals, so a bettor shopping a total should see "gusts 28 mph"
   on the card itself, not buried on another page.

   Honesty rules (no invented data):
   - the venue comes from ESPN's per-game venue cross-checked against the
     shared stadium dataset (neutral-site games resolve to the real neutral
     venue, never the listed home team's stadium; MLB uses the ballpark
     dataset, which cross-checks ESPN's venue name and falls back to the
     home team's park only when ESPN's venue is unrecognized);
   - games whose venue can't be confirmed, domes/retractable roofs, past or
     >16-days-out kickoffs, and calm forecasts all produce NO badge — quiet
     by default, exactly like the steam-watch strip;
   - teamFind and venueFor are injected so the module stays pure and testable.
   The browser wires this up (odds.js): one multi-location Open-Meteo fetch
   per board render, badges injected into the card placeholders. */
(function(){
"use strict";
var WX = {};

var FORECAST_DAYS = 16;

/* Match one Odds API event to its ESPN scoreboard event: same home + away
   team abbreviations and the same UTC calendar day. Returns the ESPN event
   or null — never guesses. */
function matchEspn(oddsEv, espnEvents, homeAbbr, awayAbbr){
  var day = null;
  try{ day = new Date(oddsEv.commence_time).toISOString().slice(0,10); }
  catch(e){ return null; }
  for(var i=0;i<espnEvents.length;i++){
    var ev = espnEvents[i]||{}, comp = (ev.competitions||[])[0]||{};
    var cs = comp.competitors||[], h = null, a = null, j;
    for(j=0;j<cs.length;j++){
      var ab = cs[j] && cs[j].team && cs[j].team.abbreviation;
      if(cs[j] && cs[j].homeAway === "home") h = ab;
      else if(cs[j] && cs[j].homeAway === "away") a = ab;
    }
    if(h !== homeAbbr || a !== awayAbbr) continue;
    var eday = null;
    try{ eday = new Date(ev.date).toISOString().slice(0,10); }catch(e2){}
    if(eday === day) return ev;
  }
  return null;
}

/* Resolve the odds-board NFL/MLB events to forecastable games:
   [{oddsId, kickISO, lat, lon, stadium, city, league}] — open-air, confirmed
   venue, pre-game kickoff within the 16-day forecast horizon. Everything else
   is dropped silently: no badge beats a wrong badge.
   league: "nfl" (default) or "mlb" — picks the team dir and which callers'
   impact model applies downstream. The injected venueFor may return the NFL
   {row: tuple} shape or the raw wx-shared.js ballpark tuple (ballparkVenueFor);
   both are accepted. */
WX.resolveGames = function(oddsEvents, espnEvents, dir, teamFind, venueFor, nowMs, league){
  nowMs = (nowMs === undefined) ? Date.now() : nowMs;
  league = league || "nfl";
  var out = [];
  (oddsEvents||[]).forEach(function(ev){
    if(!ev || !ev.id || !ev.commence_time) return;
    var kick = Date.parse(ev.commence_time);
    if(isNaN(kick) || kick <= nowMs || kick > nowMs + FORECAST_DAYS*24*3600*1000) return;
    var ht = teamFind(dir, league, ev.home_team), at = teamFind(dir, league, ev.away_team);
    if(!ht || !at) return;
    var espn = matchEspn(ev, espnEvents||[], ht.abbr, at.abbr);
    if(!espn) return;
    var v = venueFor(espn, ht.abbr);
    var row = (v && v.row) || v; /* venueFor: {row} shape; ballparkVenueFor: raw tuple */
    if(!row || row[5] !== "open") return;
    out.push({ oddsId: String(ev.id), kickISO: ev.commence_time,
               lat: row[3], lon: row[4], stadium: row[1], city: row[2],
               league: league });
  });
  return out;
};

/* One Open-Meteo request for all game venues (multi-location API).
   Returns null when there's nothing to forecast. */
WX.wxUrl = function(games){
  games = games || [];
  if(!games.length) return null;
  var lats = games.map(function(g){ return g.lat; }).join(","),
      lons = games.map(function(g){ return g.lon; }).join(",");
  return "https://api.open-meteo.com/v1/forecast?latitude="+lats+"&longitude="+lons+
    "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m"+
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&forecast_days="+FORECAST_DAYS;
};

/* Compact badge HTML for one game card. `notes` are impactNotes() entries;
   the caller only calls this when notes is non-empty. esc is injected
   (window.GIU.esc in the browser) so this stays pure. */
WX.badgeHtml = function(stadium, city, notes, esc){
  esc = esc || function(s){ return String(s==null?"":s); };
  var chips = notes.map(function(n){
    return '<span class="'+esc(n.cls)+'">'+esc(n.text)+'</span>';
  }).join(" ");
  return '<span class="wx-stad" aria-hidden="true">🌬️</span> '+
    '<span class="wx-venue">Game-day weather · '+esc(stadium)+
    (city ? ' ('+esc(city)+')' : '')+'</span> '+chips+
    ' <a href="weather.html">Full forecast →</a>';
};

if(typeof module !== "undefined" && module.exports){ module.exports = WX; }
else if(typeof window !== "undefined"){ window.OddsWx = WX; }
})();
