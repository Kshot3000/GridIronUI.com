/* GridIronUI DFS Lab — game-conditions (weather) cross-check.
   Verifies js/dfs-wx.js: pool-team -> scoreboard matching, kickoff horizon,
   roof splitting, Open-Meteo URL building, window stats, the DFS angle
   copy (thresholds must match wx-shared's impact model), panel HTML honesty
   (escapes, calm-day and unavailable states), the browser surface, and the
   shipped wiring (dfs.html script keys + #wxPanel, dfs.js hook). */
"use strict";
var WX = require("../js/dfs-wx.js");
var fs = require("fs"), path = require("path"), vm = require("vm");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* fixtures */
function ev(id, away, home, iso, state){
  return { id: id, date: iso,
    competitions: [{ venue: { fullName: home + " Stadium" },
      status: { type: { state: state || "pre" } },
      competitors: [
        { homeAway: "away", team: { abbreviation: away } },
        { homeAway: "home", team: { abbreviation: home } }
      ] }] };
}
var NOW = Date.parse("2026-10-01T08:40:00Z");
function venueFor(evh, homeAbbr){
  return { row: [homeAbbr, homeAbbr + " Stadium", "City", 41.5, -81.7, "open"], neutral: false };
}
var DEPS = { venueFor: venueFor,
  sliceWindow: function(o, iso){ return [{temp:60, precip:0, wind:8, gust:10}]; },
  impactNotes: function(hrs){ return []; } };

/* normTeam */
assert(WX.normTeam("was") === "WSH", "WAS aliases to ESPN's WSH");
assert(WX.normTeam("jac") === "JAX", "JAC aliases to ESPN's JAX");
assert(WX.normTeam(" cle ") === "CLE", "trims and uppercases");
assert(WX.normTeam(null) === "", "null team normalizes to empty");
assert(WX.normTeam("Pittsburgh") === "PITTSBURGH", "full names pass through unguessed");

/* poolGames basics */
var pool = [{team:"PIT"},{team:"cle"}];
var evs = [ev("1","PIT","CLE","2026-10-02T00:15:00Z"),
           ev("2","KC","BUF","2026-10-04T17:00:00Z"),
           ev("3","KC","BUF","2026-09-27T17:00:00Z","post")];
var plan = WX.poolGames(pool, "NFL", evs, NOW, DEPS);
assert(!plan.skip && plan.games.length === 1, "one pool-relevant game found");
assert(plan.games[0].away === "PIT" && plan.games[0].home === "CLE", "away/home carried through");
assert(plan.games[0].venue.row[0] === "CLE", "venue resolved via home abbr");
assert(plan.games[0].kickMs === Date.parse("2026-10-02T00:15:00Z"), "kickoff epoch kept");
assert(!plan.games.some(function(g){ return g.id === "3"; }), "post game skipped");
var plan2 = WX.poolGames([{team:"KC"},{team:"BUF"}], "NFL", evs, NOW, DEPS);
assert(plan2.games.length === 1 && plan2.games[0].id === "2", "KC@BUF pre game matched, post excluded");

/* dedupe + horizon + malformed */
var dup = WX.poolGames(pool, "NFL", [ev("1","PIT","CLE","2026-10-02T00:15:00Z"),
  ev("1","PIT","CLE","2026-10-02T00:15:00Z")], NOW, DEPS);
assert(dup.games.length === 1, "duplicate event listings deduped");
var far = WX.poolGames(pool, "NFL", [ev("9","PIT","CLE","2026-11-01T00:15:00Z")], NOW, DEPS);
assert(far.games.length === 0, "game beyond the 16-day forecast horizon skipped");
var past = WX.poolGames(pool, "NFL", [ev("9","PIT","CLE","2026-09-30T20:00:00Z")], NOW, DEPS);
assert(past.games.length === 0, "game already finished (kickoff >4h ago) skipped");
var inProg = WX.poolGames(pool, "NFL", [ev("9","PIT","CLE","2026-10-01T06:00:00Z","in")], NOW, DEPS);
assert(inProg.games.length === 1, "game in progress (within 4h) still shown — late-swap matters");
var bad = WX.poolGames(pool, "NFL", [ev("9","PIT",null,"2026-10-02T00:15:00Z"), null, {}], NOW, DEPS);
assert(bad.games.length === 0, "malformed events skipped, never guessed");

/* skip states */
assert(WX.poolGames(pool, "NBA", evs, NOW, DEPS).skip === "nba", "NBA pools skip — indoors, no weather angle");
assert(WX.poolGames([], "NFL", evs, NOW, DEPS).skip === "empty", "empty pool skips");
assert(WX.poolGames([{team:"KC", demo:1}], "NFL", evs, NOW, DEPS).skip === "demo", "all-demo pool skips — synthetic slate gets no real forecast");
var mixed = WX.poolGames([{team:"PIT", demo:1},{team:"CLE"}], "NFL", evs, NOW, DEPS);
assert(!mixed.skip, "one real player is enough — mixed pool not skipped");

/* splitRoofed */
var dome = [{id:"d", away:"DET", home:"DET", date:"x", kickMs:1,
  venue:{row:["DET","Ford Field","Detroit",42.34,-83.04,"dome"]}}];
var retr = [{id:"r", away:"DAL", home:"DAL", date:"x", kickMs:1,
  venue:{row:["DAL","AT&T","Arlington",32.74,-97.09,"retractable"]}}];
var open = [{id:"o", away:"PIT", home:"CLE", date:"x", kickMs:1,
  venue:{row:["CLE","Huntington Bank Field","Cleveland",41.5061,-81.6995,"open"]}}];
var unk = [{id:"u", away:"XX", home:"XX", date:"x", kickMs:1, venue:{row:null}}];
var sp = WX.splitRoofed(dome.concat(retr, open, unk));
assert(sp.roofed.length === 3, "dome + retractable + unknown-venue all roofed/safe");
assert(sp.fetch.length === 1 && sp.fetch[0].game.id === "o", "only the open-air game needs a forecast");
assert(Math.abs(sp.fetch[0].lat - 41.5061) < 1e-6, "forecast uses the venue coordinates");

/* wxUrl */
assert(WX.wxUrl([]) === null, "no games -> no URL");
var u = WX.wxUrl(sp.fetch);
assert(u.indexOf("latitude=41.5061") !== -1 && u.indexOf("longitude=-81.6995") !== -1,
       "URL carries the venue coordinates");
assert(u.indexOf("wind_gusts_10m") !== -1 && u.indexOf("timezone=UTC") !== -1 && u.indexOf("forecast_days=16") !== -1,
       "URL requests gusts, UTC stamps and the 16-day horizon (sliceWindow contract)");

/* wxStats */
var st = WX.wxStats([{temp:60,precip:0,wind:8,gust:10},{temp:55,precip:70,wind:21,gust:31}]);
assert(st.wind === 21 && st.gust === 31 && st.precip === 70 && st.temp === 55,
       "stats are max-over-window (min for temp)");

/* dfsAngles — thresholds must match wx-shared's impact model */
function anglesFor(w, g, p, t){
  return WX.dfsAngles({wind:w, gust:g, precip:p, temp:t});
}
assert(anglesFor(21, 10, 0, 60).length >= 1, "sustained wind 20 -> angle");
assert(anglesFor(8, 31, 0, 60).length >= 1, "gusts 31 -> angle");
assert(anglesFor(8, 10, 0, 60).length === 0, "calm day -> no angle");
assert(anglesFor(14, 10, 0, 60).length === 1, "mild wind 14 -> exactly the mild angle");
assert(anglesFor(8, 10, 70, 60).some(function(a){ return /run-game|RB/i.test(a); }),
       "heavy rain -> run-game lean angle");
assert(anglesFor(8, 10, 0, 20).some(function(a){ return /Freezing|kicking/i.test(a); }),
       "freezing temp -> kicking angle");
var angText = anglesFor(22, 32, 0, 60).join(" ");
assert(/pass-catchers|kickers/i.test(angText), "strong wind names pass-catchers and kickers");
assert(/DST/i.test(angText), "strong wind names the DST beneficiaries");

/* withWx */
var rows = WX.withWx(sp.fetch,
  [{hourly:{time:["2026-10-02T00:00"], temperature_2m:[60],
     precipitation_probability:[0], wind_speed_10m:[8],
     wind_gusts_10m:[10], wind_direction_10m:[180]}}],
  { sliceWindow: function(o, iso){ return [{temp:60,precip:0,wind:22,gust:33}]; },
    impactNotes: function(){ return [{cls:"tag red", text:"Wind 22 mph sustained — strong Under lean"}]; } });
assert(rows.length === 1 && rows[0].ok, "forecast attached");
assert(rows[0].chips[0].text.indexOf("22 mph") !== -1, "weather chips carried through");
assert(rows[0].angles.length >= 1, "DFS angle derived from the same hours");
var badWx = WX.withWx(sp.fetch, [{}], { sliceWindow: function(){ throw new Error("x"); }, impactNotes: function(){ return []; } });
assert(badWx[0].ok === false, "slicing failure marks the row unavailable, not calm");

/* roofRows */
var rr = WX.roofRows(dome);
assert(rr[0].roofed && rr[0].ok, "roofed row is complete");
assert(/Roofed/i.test(rr[0].chips[0].text), "roofed row labels the roof — no fake 'no concerns'");
assert(rr[0].angles.length === 0, "no DFS angle for a roofed game");

/* kickLabel + panelHtml honesty */
assert(WX.kickLabel("2026-10-02T00:15:00Z").indexOf("Oct") !== -1, "kickoff label carries the date");
assert(WX.kickLabel("bogus") === "", "unparseable kickoff -> empty label");
var evil = { game: { away: "<script>", home: "CLE", date: "2026-10-02T00:15:00Z",
  venue: { row: ["CLE", "Stadium", "City", 1, 2, "open"] } },
  roofed: false, ok: true,
  chips: [{ cls: "tag red", text: "<img onerror=x>" }], angles: ["a<b"] };
var html = WX.panelHtml([evil], function(s){ return String(s).replace(/[<>&"]/g, function(c){ return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]; }); });
assert(html.indexOf("<script>") === -1 && html.indexOf("&lt;script&gt;") !== -1, "panel HTML escapes team names");
assert(html.indexOf("&lt;img") !== -1, "panel HTML escapes chip text");
assert(html.indexOf("a&lt;b") !== -1, "panel HTML escapes DFS angles");
assert(html.indexOf("weather.html") !== -1, "panel links to the full game-day forecasts");
var calmRow = { game: { away: "PIT", home: "CLE", date: "2026-10-02T00:15:00Z",
  venue: { row: ["CLE", "Huntington Bank Field", "Cleveland", 1, 2, "open"] } },
  roofed: false, ok: true, chips: [], angles: [] };
assert(WX.panelHtml([calmRow]).indexOf("No major concerns") !== -1, "calm game uses the weather page's own language");
var unokRow = { game: { away: "PIT", home: "CLE", date: "2026-10-02T00:15:00Z", venue: null },
  roofed: false, ok: false, chips: [], angles: [] };
assert(WX.panelHtml([unokRow]).indexOf("Forecast unavailable") !== -1, "unavailable forecast is labeled, never faked");
assert(WX.panelHtml([calmRow]).indexOf("PIT @ CLE") !== -1, "matchup rendered away @ home");

/* browser surface */
var sb = { window: {}, console: console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/dfs-wx.js"), "utf8"),
                sb, { filename: "js/dfs-wx.js" });
assert(typeof sb.window.DFSWx.poolGames === "function", "window.DFSWx.poolGames exists in the browser build");
assert(typeof sb.window.DFSWx.panelHtml === "function", "window.DFSWx.panelHtml exists in the browser build");

/* shipped wiring */
var dfsHtml = fs.readFileSync(path.join(__dirname, "../dfs.html"), "utf8");
assert(/id="wxPanel"/.test(dfsHtml), "dfs.html carries the #wxPanel container");
assert(dfsHtml.indexOf('js/wx-shared.js?v=1.91.0') !== -1, "dfs.html includes wx-shared (venue truth + impact model)");
assert(dfsHtml.indexOf('js/dfs-wx.js?v=1.123.0') !== -1, "dfs.html pins dfs-wx.js?v=1.123.0");
assert(dfsHtml.indexOf('js/dfs.js?v=1.132.0') !== -1, "dfs.html pins dfs.js?v=1.132.0");
assert(/<script src="js\/wx-shared\.js[^>]*>[\s\S]*<script src="js\/dfs-wx\.js/.test(dfsHtml),
       "wx-shared loads before dfs-wx");
var dfsJs = fs.readFileSync(path.join(__dirname, "../js/dfs.js"), "utf8");
assert(dfsJs.indexOf("refreshWxPanel") !== -1, "shipped dfs.js wires refreshWxPanel into renderPool");
assert(dfsJs.indexOf("wxUpcomingNfl") !== -1, "shipped dfs.js reuses the rollover-safe NFL scoreboard fetch");

if(failures){ console.error(failures + " FAILURE(S)"); process.exit(1); }
console.log("dfs-wx: all green");
