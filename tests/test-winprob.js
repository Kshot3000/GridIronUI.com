/* Logic tests for win-probability + Matchup Predictor in js/scores-detail.js
   (v1.57.0). Fixtures are shaped on real ESPN summary payloads validated
   2026-09-28 (NFL final 401872948, NFL pregame 401872963, MLB final
   401817106). Run: node tests/test-winprob.js */
"use strict";
var D = require("../js/scores-detail.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
function esc(s){ return String(s == null ? "" : s); }

/* ---------- fixtures ---------- */
var nflFinal = {
  header: {competitions: [{status: {type: {state: "post"}}}]},
  winprobability: [
    {homeWinPercentage: 0.7457, tiePercentage: 0, playId: "4018729481"},
    {homeWinPercentage: 0.70,   tiePercentage: 0, playId: "4018729482"},
    {homeWinPercentage: 0.25,   tiePercentage: 0, playId: "4018729483"},
    {homeWinPercentage: 0.10,   tiePercentage: 0, playId: "4018729484"},
    {homeWinPercentage: 0.0,    tiePercentage: 0, playId: "4018729485"}
  ],
  drives: {previous: [{plays: [
    {id: "4018729483", text: "B.Robinson 24 yd TD run.",
     period: {number: 3}, clock: {displayValue: "4:12"}}
  ]}]},
  scoringPlays: [],
  boxscore: {teams: [
    {homeAway: "away", team: {abbreviation: "ATL", color: "a71930"}, statistics: []},
    {homeAway: "home", team: {abbreviation: "GB", color: "204e32"}, statistics: []}
  ]}
};
/* MLB final: win-probability but no scoring plays and no flat stat arrays
   (nested groups) — the league that previously got "No box-score detail". */
var mlbFinal = {
  header: {competitions: [{status: {type: {state: "post"}}}]},
  winprobability: [
    {homeWinPercentage: 0.424, tiePercentage: 0, playId: "4018171060001990057"},
    {homeWinPercentage: 0.55,  tiePercentage: 0, playId: "4018171060001990088"},
    {homeWinPercentage: 0.30,  tiePercentage: 0, playId: "4018171060001990120"}
  ],
  boxscore: {teams: [
    {homeAway: "away", team: {abbreviation: "NYY", color: "132448"}, statistics: {batting: []}},
    {homeAway: "home", team: {abbreviation: "BOS", color: "bd3039"}, statistics: {pitching: []}}
  ]}
};
var nflPre = {
  header: {competitions: [{status: {type: {state: "pre"}},
    competitors: [
      {homeAway: "away", team: {id: "21", abbreviation: "PHI", color: "06424d"}},
      {homeAway: "home", team: {id: "3", abbreviation: "CHI", color: "0b1c3a"}}]}]},
  predictor: {header: "Matchup Predictor",
    homeTeam: {id: "3", gameProjection: "34.9"},
    awayTeam: {id: "21", gameProjection: "64.8"}}
};

/* ---------- gameState ---------- */
ok("gameState post", D.gameState(nflFinal) === "post");
ok("gameState pre", D.gameState(nflPre) === "pre");
ok("gameState missing header", D.gameState({}) === "");

/* ---------- winProbSeries ---------- */
var s = D.winProbSeries(nflFinal);
ok("series extracts 5 samples", s && s.samples.length === 5, s && s.samples.length);
ok("series values are fractions", s && s.samples[0].p === 0.7457);
ok("series pregame -> null even with samples",
   D.winProbSeries({header: {competitions: [{status: {type: {state: "pre"}}}]},
     winprobability: [{homeWinPercentage: 0.5}, {homeWinPercentage: 0.6}]}) === null);
ok("series <2 valid samples -> null",
   D.winProbSeries({header: {competitions: [{status: {type: {state: "post"}}}]},
     winprobability: [{homeWinPercentage: 0.5}, {homeWinPercentage: "junk"}]}) === null);
ok("series missing key -> null",
   D.winProbSeries({header: {competitions: [{status: {type: {state: "post"}}}]}}) === null);
var clamped = D.winProbSeries({header: {competitions: [{status: {type: {state: "in"}}}]},
  winprobability: [{homeWinPercentage: 1.4}, {homeWinPercentage: -0.2}]});
ok("series clamps out-of-range to [0,1]",
   clamped && clamped.samples[0].p === 1 && clamped.samples[1].p === 0);

/* ---------- playTextById / biggestSwing ---------- */
var pm = D.playTextById(nflFinal);
ok("playTextById resolves drive play", pm["4018729483"] && pm["4018729483"].text === "B.Robinson 24 yd TD run.");
ok("playTextById carries period + clock", pm["4018729483"].period === 3 && pm["4018729483"].clock === "4:12");
ok("playTextById empty on missing drives", Object.keys(D.playTextById(mlbFinal)).length === 0);
var sw = D.biggestSwing(s, pm);
ok("biggestSwing finds index 2", sw && sw.idx === 2, sw && sw.idx);
ok("biggestSwing dir away (GB lost ground)", sw && sw.dir === "away", sw && sw.dir);
ok("biggestSwing delta -0.45", sw && Math.abs(sw.delta + 0.45) < 1e-9, sw && sw.delta);
ok("biggestSwing names the play", sw && sw.play && sw.play.text === "B.Robinson 24 yd TD run.");
var sw2 = D.biggestSwing(s, {});
ok("biggestSwing survives unresolvable playIds", sw2 && sw2.play === null);
ok("biggestSwing flat series -> null",
   D.biggestSwing({samples: [{p: 0.5}, {p: 0.5}, {p: 0.5}]}, {}) === null);
ok("biggestSwing <2 samples -> null", D.biggestSwing({samples: [{p: 0.5}]}, {}) === null);

/* ---------- predictor ---------- */
var pr = D.predictor(nflPre);
ok("predictor parses fractions", pr && pr.home === 0.349 && pr.away === 0.648, pr && pr.home + "/" + pr.away);
ok("predictor resolves abbrs by team id", pr && pr.homeAbbr === "CHI" && pr.awayAbbr === "PHI",
   pr && pr.homeAbbr + "/" + pr.awayAbbr);
ok("predictor resolves team colors", pr && pr.homeColor === "#0b1c3a" && pr.awayColor === "#06424d",
   pr && pr.homeColor + "/" + pr.awayColor);
ok("predictor on post -> null", D.predictor(nflFinal) === null);
ok("predictor NaN -> null",
   D.predictor({header: {competitions: [{status: {type: {state: "pre"}}}]},
     predictor: {homeTeam: {gameProjection: "??"}, awayTeam: {gameProjection: "50"}}}) === null);
ok("predictor missing -> null",
   D.predictor({header: {competitions: [{status: {type: {state: "pre"}}}]}}) === null);
ok("predTextOn dark color -> white text", D.predTextOn("#0b1c3a") === "#fff");
ok("predTextOn light color -> dark text", D.predTextOn("#ffffff") === "#0e1420");
ok("predTextOn junk -> white text", D.predTextOn("zzz") === "#fff");

/* ---------- teamColors ---------- */
var cols = D.teamColors(nflFinal);
ok("teamColors from payload", cols.home === "#204e32" && cols.away === "#a71930",
   cols.home + "/" + cols.away);
var colsF = D.teamColors({});
ok("teamColors fallback", colsF.home === "#e8edf5" && colsF.away === "#c9a227");

/* ---------- buildHtml ---------- */
var hNfl = D.buildHtml(nflFinal, "football/nfl", esc);
ok("final NFL detail has the win-prob canvas", /class="gd-wp"/.test(hNfl));
ok("win-prob canvas carries home team color", /data-hc="#204e32"/.test(hNfl));
ok("win-prob caption names the swing play", /B\.Robinson 24 yd TD run/.test(hNfl));
ok("win-prob caption gives Q3 4:12", /\(Q3 4:12\)/.test(hNfl));
ok("win-prob aria states home perspective", /Win probability, GB perspective/.test(hNfl));
ok("final NFL detail still has period table", /class="gd-ptable"/.test(hNfl) === false,
   "no scoring plays in fixture -> no period table");
var hMlb = D.buildHtml(mlbFinal, "baseball/mlb", esc);
ok("MLB final now yields detail (not null)", hMlb !== null);
ok("MLB detail has win-prob chart", /class="gd-wp"/.test(hMlb));
ok("MLB detail has no period table (no scoring plays)", !/class="gd-ptable"/.test(hMlb));
ok("MLB swing caption degrades without play text", /Biggest swing: 25 pts toward NYY/.test(hMlb),
   (hMlb.match(/Biggest swing[^<]*/) || [""])[0]);
var hPre = D.buildHtml(nflPre, "football/nfl", esc);
ok("pregame detail has predictor card", /class="gd-pred"/.test(hPre));
ok("pregame has no win-prob canvas", !/class="gd-wp"/.test(hPre));
ok("predictor aria has both projections", /PHI 64\.8%/.test(hPre) && /CHI 34\.9%/.test(hPre));
ok("predictor bar widths sum to 100",
   (function(){ var m = hPre.match(/width:([\d.]+)%/g) || [];
     var tot = m.reduce(function(a, x){ return a + parseFloat(x.match(/[\d.]+/)[0]); }, 0);
     return Math.abs(tot - 100) < 0.05; })());
ok("predictor honesty line present", /not a betting line/.test(hPre));
ok("empty payload still returns null",
   D.buildHtml({header: {competitions: [{status: {type: {state: "post"}}}]}}, "football/nfl", esc) === null);

console.log(fails ? "\n" + fails + " FAILURES" : "\nALL GREEN");
process.exit(fails ? 1 : 0);
