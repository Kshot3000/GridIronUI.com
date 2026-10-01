/* Unit tests for the home-strip game-day weather chips (v1.126.0 —
   outdoor NFL/MLB "Today's games" rows get a compact Open-Meteo weather
   chip, same venue truth + impact thresholds as the weather page and the
   odds board's badges).
   Verifies: resolveRows (open-air kept with right venue coords, domes +
   retractable roofs skipped, neutral-site venue wins over the home team's,
   NBA/NHL/live/past/too-far/dateless/unknown-abbr rows skipped, input rows
   never mutated), wxUrl (null when empty, multi-location shape + units +
   16-day horizon), chipHtml (condition-shortened chips, full note in the
   title, tag classes preserved, XSS-safe, weather.html link), and the
   shipped index.html wiring pins (cache keys, data-wxchip placeholder,
   paint + quiet-failure path). */
"use strict";
var fs = require("fs"), path = require("path");
var HX = require("../js/home-wx.js");
var WX = require("../js/wx-shared.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
var NOW = Date.parse("2026-10-01T11:36:00Z"); /* Thu 2026-10-01 06:36 CDT */
var KICK = "2026-10-02T00:15:00Z";            /* tonight's TNF window */
var LOOKUPS = {nfl: WX.venueFor, mlb: WX.ballparkVenueFor};

function row(over){
  var r = {id: "g1", league: "NFL", date: KICK, state: "pre",
           venue: "Huntington Bank Field",
           home: {team: {abbreviation: "CLE"}},
           away: {team: {abbreviation: "PIT"}}};
  for(var k in (over||{})) r[k] = over[k];
  return r;
}

/* ---- resolveRows: NFL open-air venue ---- */
var jobs = HX.resolveRows([row()], LOOKUPS, NOW);
assert(jobs.length === 1, "open-air NFL row resolves (CLE)");
assert(jobs[0].stadium === "Huntington Bank Field", "stadium name from dataset ("+jobs[0].stadium+")");
assert(jobs[0].lat === 41.5061 && jobs[0].lon === -81.6995, "venue coords (Cleveland)");
assert(jobs[0].slot === "NFL:g1", "slot id is LEAGUE:id ("+jobs[0].slot+")");
assert(jobs[0].kickISO === KICK, "kickISO carried through");

/* ---- roofs: dome + retractable stay silent ---- */
assert(HX.resolveRows([row({home:{team:{abbreviation:"DET"}}, venue:"Ford Field"})], LOOKUPS, NOW).length === 0,
  "dome (DET/Ford Field) skipped");
assert(HX.resolveRows([row({home:{team:{abbreviation:"ATL"}}, venue:"Mercedes-Benz Stadium"})], LOOKUPS, NOW).length === 0,
  "retractable roof (ATL) skipped");

/* ---- neutral-site venue wins over the home team's stadium ---- */
var neut = HX.resolveRows([row({venue:"Wembley Stadium"})], LOOKUPS, NOW);
assert(neut.length === 1 && neut[0].stadium === "Wembley Stadium",
  "neutral-site ESPN venue used, not the home team's stadium ("+(neut[0]||{}).stadium+")");
assert(neut[0].lat === 51.5558 && neut[0].lon === -0.2796, "Wembley coords, not Cleveland's");

/* ---- league + state filters ---- */
assert(HX.resolveRows([row({league:"NBA", home:{team:{abbreviation:"CLE"}}})], LOOKUPS, NOW).length === 0,
  "NBA row skipped (indoor league)");
assert(HX.resolveRows([row({league:"NHL", home:{team:{abbreviation:"CBJ"}}})], LOOKUPS, NOW).length === 0,
  "NHL row skipped (indoor league)");
assert(HX.resolveRows([row({state:"in"})], LOOKUPS, NOW).length === 0,
  "live row skipped (chip is a pre-game read)");

/* ---- time horizon ---- */
assert(HX.resolveRows([row({date:"2026-09-30T00:15:00Z"})], LOOKUPS, NOW).length === 0,
  "past kickoff skipped");
assert(HX.resolveRows([row({date:"2026-10-20T00:15:00Z"})], LOOKUPS, NOW).length === 0,
  "kickoff beyond the 16-day forecast horizon skipped");
assert(HX.resolveRows([row({date:"2026-10-17T00:15:00Z"})], LOOKUPS, NOW).length === 1,
  "kickoff inside the 16-day horizon kept");
assert(HX.resolveRows([row({date:""})], LOOKUPS, NOW).length === 0, "dateless row skipped");

/* ---- unresolvable / malformed ---- */
assert(HX.resolveRows([row({home:{team:{abbreviation:"ZZZ"}}})], LOOKUPS, NOW).length === 0,
  "unknown home abbreviation skipped");
assert(HX.resolveRows([row({home:null})], LOOKUPS, NOW).length === 0,
  "row without a home team skipped");
assert(HX.resolveRows([row({id:null})], LOOKUPS, NOW).length === 0,
  "row without an id skipped");
var rIn = row();
HX.resolveRows([rIn], LOOKUPS, NOW);
assert(rIn.wx === undefined && !("wx" in rIn), "input rows are never mutated");
assert(HX.resolveRows(null, LOOKUPS, NOW).length === 0, "null input resolves to []");
assert(HX.resolveRows([row()], {}, NOW).length === 0, "missing lookup fns resolve to []");

/* ---- MLB: ballpark dataset ---- */
var mlb = row({id:"m1", league:"MLB", venue:"Yankee Stadium",
               home:{team:{abbreviation:"NYY"}}, away:{team:{abbreviation:"TB"}}});
var mj = HX.resolveRows([mlb], LOOKUPS, NOW);
assert(mj.length === 1 && mj[0].league === "mlb" && mj[0].stadium === "Yankee Stadium",
  "open-air MLB ballpark resolves (NYY)");
assert(HX.resolveRows([row({league:"MLB", venue:"American Family Field", home:{team:{abbreviation:"MIL"}}})], LOOKUPS, NOW).length === 0,
  "retractable ballpark (MIL) skipped");
assert(HX.resolveRows([row({league:"MLB", venue:"Tropicana Field", home:{team:{abbreviation:"TB"}}})], LOOKUPS, NOW).length === 0,
  "domed ballpark (TB) skipped");
var reloc = HX.resolveRows([row({league:"MLB", id:"m2", venue:"Petco Park", home:{team:{abbreviation:"NYY"}}})], LOOKUPS, NOW);
assert(reloc.length === 1 && reloc[0].stadium === "Petco Park",
  "relocated MLB game uses ESPN's venue, not the listed home team's park ("+(reloc[0]||{}).stadium+")");

/* ---- wxUrl: one multi-location fetch ---- */
assert(HX.wxUrl([]) === null, "wxUrl null when nothing to forecast");
assert(HX.wxUrl(null) === null, "wxUrl null for null input");
var u = HX.wxUrl([{lat:41.5061, lon:-81.6995},{lat:51.5558, lon:-0.2796}]);
assert(u.indexOf("latitude=41.5061,51.5558") !== -1, "multi-location latitudes ("+u+")");
assert(u.indexOf("longitude=-81.6995,-0.2796") !== -1, "multi-location longitudes");
assert(u.indexOf("temperature_unit=fahrenheit") !== -1 && u.indexOf("wind_speed_unit=mph") !== -1,
  "imperial units (matches the weather page)");
assert(u.indexOf("forecast_days=16") !== -1, "16-day horizon");
assert(u.indexOf("wind_gusts_10m") !== -1, "gusts requested (impact model needs them)");
assert(u.indexOf("timezone=UTC") !== -1, "UTC timezone (sliceWindow requirement)");

/* ---- chipHtml ---- */
var esc = function(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
var notes = [{cls:"tag red", text:"Wind 22 mph sustained — strong Under lean"},
             {cls:"tag", text:"Rain 70% — favors run game"},
             {cls:"tag", text:"Heat 96°F"}];
var html = HX.chipHtml({stadium:"Huntington Bank Field", city:"Cleveland, OH"}, notes, esc);
assert(html.indexOf("Wind 22 mph sustained") !== -1, "chip shows the condition (shortened)");
assert(html.indexOf("strong Under lean") === -1 || html.indexOf('title="Wind 22 mph sustained — strong Under lean"') !== -1,
  "full note rides in the title, not the card body");
assert(html.indexOf("tag red") !== -1, "impact tag classes preserved");
assert(html.split("<span").length - 1 <= 3, "at most 2 condition chips ("+html.split("<span").length+")");
assert(html.indexOf("weather.html") !== -1, "links to the full forecast page");
assert(html.indexOf("Huntington Bank Field") !== -1, "venue named in the tooltip");
var evil = HX.chipHtml({stadium:'"><img src=x onerror=alert(1)>', city:""}, [{cls:'tag" onmouseover="x()', text:"<b>bold</b>"}], esc);
assert(evil.indexOf("<img") === -1 && evil.indexOf("<b>") === -1,
  "XSS-safe: angle brackets escaped in stadium and note text");
assert(evil.indexOf('" onmouseover="') === -1 && evil.indexOf("&lt;img") !== -1,
  "XSS-safe: quotes escaped so no attribute breakout is possible");

/* ---- shipped index.html wiring pins ---- */
var idx = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert(idx.indexOf("js/home-wx.js?v=1.126.0") !== -1, "index.html loads home-wx.js?v=1.126.0");
var wsm = idx.match(/js\/wx-shared\.js\?v=([0-9.]+)/);
assert(wsm && wsm[1] === "1.91.0", "index.html pins wx-shared.js at its last-changed release (1.91.0)");
assert(idx.indexOf("data-wxchip=") !== -1, "strip cards carry the data-wxchip placeholder");
assert(idx.indexOf("homeWx") !== -1 && idx.indexOf("HXW.resolveRows") !== -1,
  "strip wires resolveRows after render");
assert(idx.indexOf("wxImpactNotesBsb") !== -1 && idx.indexOf("wxSliceWindow") !== -1,
  "strip uses the shared impact models + window slicer");
assert(idx.indexOf("chips stay off") !== -1, "forecast failures fail quiet (strip unaffected)");

console.log(failures === 0 ? "\nALL PASS" : "\n"+failures+" FAILURES");
process.exit(failures === 0 ? 0 : 1);
