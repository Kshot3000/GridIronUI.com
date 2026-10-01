/* GridIronUI home-strip game-day weather chips — pure glue between the
   "Today's games" strip rows, the shared venue truth + impact models
   (js/wx-shared.js) and one multi-location Open-Meteo forecast fetch.
   The site's own line is "wind moves totals" — so on game day, outdoor
   NFL/MLB rows carry a compact weather chip on the card itself instead
   of making the bettor hunt for it on the weather page.

   Honesty rules (no invented data):
   - the venue is the shared dataset's outdoor stadium/ballpark for the
     home team, with ESPN's per-game venue cross-checked for neutral
     sites (a relocated game never borrows the listed home team's
     forecast);
   - domes/retractable roofs, unresolvable venues, past or >16-days-out
     kickoffs, and calm forecasts all produce NO chip — quiet by default,
     exactly like the odds board's weather badges;
   - the forecast fetch resolves to nothing on failure — the strip renders
     fine without chips, and chips never block the strip.
   The venue lookups, sliceWindow and the impact-note functions are
   injected so the module stays pure and testable.
   Browser: window.GIU.homeWx · node: module.exports */
(function(){
"use strict";
var HX = {};
var HORIZON_DAYS = 16; /* same Open-Meteo horizon the odds board uses */

/* Forecast jobs for the strip's outdoor-venue NFL/MLB rows. Each job is
   {slot, league, lat, lon, stadium, city, kickISO}; `slot` is the
   data-wxchip placeholder id the page paints into. Rows are never mutated.
   Returns [] when there's nothing forecast-worthy — never throws. */
HX.resolveRows = function(rows, lookups, nowMs){
  nowMs = (nowMs === undefined) ? Date.now() : nowMs;
  var out = [];
  (rows || []).forEach(function(r){
    try{
      if(!r || !r.id) return;
      /* Pre-game only: the chip is a "know before you bet" read, and
         slicing nearest-to-kickoff keeps the window honest. */
      if(r.state !== "pre") return;
      var league = r.league === "NFL" ? "nfl" : (r.league === "MLB" ? "mlb" : null);
      if(!league) return;
      var fn = lookups && lookups[league];
      if(typeof fn !== "function") return;
      var hab = r.home && r.home.team && r.home.team.abbreviation;
      if(!hab) return;
      var kick = Date.parse(r.date || "");
      if(!isFinite(kick) || kick <= nowMs || kick > nowMs + HORIZON_DAYS*24*3600*1000) return;
      /* Neutral-site detection needs the per-game venue: hand the lookup a
         competition-shaped shim carrying the row's ESPN venue name. */
      var v = fn({competitions:[{venue:{fullName: r.venue || ""}}]}, String(hab).toUpperCase());
      var row = (v && v.row) || v; /* venueFor: {row} shape; ballparkVenueFor: raw tuple */
      if(!row || row[5] !== "open") return;
      out.push({slot: r.league+":"+r.id, league: league,
                lat: row[3], lon: row[4], stadium: row[1], city: row[2],
                kickISO: r.date});
    }catch(e){ /* skip the row, keep the rest */ }
  });
  return out;
};

/* One Open-Meteo request for every forecast job (the multi-location API —
   the same one-call pattern as the odds board, zero API keys, zero quota
   burn on the visitor's Odds API key). Null when there's nothing to fetch. */
HX.wxUrl = function(jobs){
  jobs = jobs || [];
  if(!jobs.length) return null;
  var lats = jobs.map(function(g){ return g.lat; }).join(","),
      lons = jobs.map(function(g){ return g.lon; }).join(",");
  return "https://api.open-meteo.com/v1/forecast?latitude="+lats+"&longitude="+lons+
    "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m"+
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&forecast_days="+HORIZON_DAYS;
};

/* Compact chip HTML for one strip card. `notes` are impactNotes() entries
   from the shared impact model — the caller only calls this when notes is
   non-empty. The full note ("Wind 18 mph — mild Under lean") rides in the
   title; the card shows the condition ("Wind 18 mph"), keeping the strip
   card compact without inventing new wording. esc is injected
   (window.GIU.esc in the browser) so this stays pure. */
HX.chipHtml = function(job, notes, esc){
  esc = esc || function(s){ return String(s==null?"":s); };
  var chips = (notes||[]).slice(0, 2).map(function(n){
    var full = String(n.text||"");
    var short = full.split(" — ")[0] || full;
    return '<span class="'+esc(n.cls)+'" title="'+esc(full)+'">'+esc(short)+'</span>';
  }).join(" ");
  var venue = String(job.stadium||"")+(job.city ? " ("+job.city+")" : "");
  return '<span class="wx-ico" aria-hidden="true" title="Game-day weather · '+esc(venue)+'">🌬️</span> '+
    chips+' <a href="weather.html" title="Full game-day forecasts">Forecast →</a>';
};

if(typeof module !== "undefined" && module.exports){ module.exports = HX; }
else if(typeof window !== "undefined"){ window.GIU = window.GIU || {}; window.GIU.homeWx = HX; }
})();
