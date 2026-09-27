/* Unit tests for js/scores-detail.js — ESPN game-summary game detail.
   Verifies URL building, league-aware period labels, scoring-play cleanup,
   period-by-period scoring math, the team-stats comparison (only flat
   statistics arrays on both sides; nested MLB shapes are skipped, not
   guessed), and that buildHtml returns null when a payload carries neither
   scoring plays nor comparable stats. */
"use strict";
var D = require("../js/scores-detail.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
var ident = function(s){ return String(s == null ? "" : s); };

/* ---- summaryUrl / periodKind / periodLabel ---- */
assert(D.summaryUrl("football/nfl","401872958") ===
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872958",
  "summaryUrl builds the ESPN summary URL");
assert(D.periodKind("football/nfl") === "Q", "NFL uses quarters");
assert(D.periodKind("basketball/nba") === "Q", "NBA uses quarters");
assert(D.periodKind("hockey/nhl") === "P", "NHL uses periods");
assert(D.periodKind("soccer/eng.1") === "H", "EPL uses halves");
assert(D.periodKind("basketball/mens-college-basketball") === "H", "NCAAB uses halves");
assert(D.periodLabel(2,"Q") === "Q2", "quarter label");
assert(D.periodLabel(5,"Q") === "OT", "NFL overtime labeled OT");
assert(D.periodLabel(4,"P") === "OT", "NHL overtime labeled OT");
assert(D.periodLabel(2,"H") === "H2", "half label");

/* ---- fixtures ---- */
function flatStats(over){
  var base = [
    {name:"firstDowns", label:"1st Downs", displayValue:"18"},
    {name:"thirdDownEff", label:"3rd down efficiency", displayValue:"5-12"},
    {name:"totalYards", label:"Total Yards", displayValue:"253"},
    {name:"netPassingYards", label:"Passing", displayValue:"173"},
    {name:"rushingYards", label:"Rushing", displayValue:"80"},
    {name:"turnovers", label:"Turnovers", displayValue:"0"},
    {name:"sacksYardsLost", label:"Sacks-Yards Lost", displayValue:"1-0"},
    {name:"possessionTime", label:"Possession", displayValue:"29:06"},
    {name:"redZoneAttempts", label:"Red Zone (Made-Att)", displayValue:"-"}
  ];
  var out = base.map(function(s){
    return {name:s.name, label:s.label,
            displayValue:(over && over[s.name] !== undefined) ? over[s.name] : s.displayValue};
  });
  if(over && over.extra) out = out.concat(over.extra);
  return out;
}
function team(abbr, home, stats){
  return {homeAway: home ? "home" : "away", team: {abbreviation: abbr}, statistics: stats};
}
function play(period, clock, text, away, home, abbr){
  return {period:{number:period}, clock:{displayValue:clock}, text:text,
          awayScore:away, homeScore:home, team:{abbreviation:abbr}};
}
var nflSummary = {
  scoringPlays: [
    play(1,"8:26","Brock Purdy complete pass to Mike Evans for 2 yards, lateral to Deebo Samuel for 80 yards (Eddy Pineiro Kick)",0,7,"SF"),
    play(1,"3:11","Kyler Murray scrambles for 4 yards (Chad Ryland Kick)",7,7,"ARI"),
    play(2,"11:02","Eddy Pineiro 38 Yd Field Goal",7,10,"SF"),
    {period:{number:2}, clock:{displayValue:"9:44"}, text:"   ", awayScore:7, homeScore:10}, /* junk: no text */
    play(2,"0:31","Kyler Murray pass to Trey McBride for 12 yards (Chad Ryland Kick)",14,10,"ARI")
  ],
  boxscore: {teams: [
    team("ARI", false, flatStats()),
    team("SF", true, flatStats({totalYards:"285", netPassingYards:"245", rushingYards:"40", thirdDownEff:"5-7", possessionTime:"13:36"}))
  ]}
};

/* ---- scoringRows ---- */
var rows = D.scoringRows(nflSummary);
assert(rows.length === 4, "scoringRows keeps 4 real plays, drops the empty-text one");
assert(rows[0].period === 1 && rows[0].clock === "8:26" && rows[0].away === 0 && rows[0].home === 7,
  "scoringRows first row fields");

/* ---- periodTable ---- */
var pt = D.periodTable(rows, "Q");
assert(pt.periods.length === 2 && pt.periods[0].label === "Q1" && pt.periods[1].label === "Q2",
  "periodTable covers both quarters with Q labels");
assert(pt.periods[0].away === 7 && pt.periods[0].home === 7, "Q1 final score from running totals");
assert(pt.periods[1].away === 14 && pt.periods[1].home === 10, "Q2 final score from running totals");
assert(pt.total.away === 14 && pt.total.home === 10, "game total is the last play's running score");

/* ---- teamStats ---- */
var ts = D.teamStats(nflSummary);
assert(ts !== null, "teamStats builds for flat NFL-style statistics");
assert(ts.awayAbbr === "ARI" && ts.homeAbbr === "SF", "teamStats home/away abbrs");
assert(ts.rows.length === 8, "teamStats caps at 8 rows, drops the '-' Red Zone row");
assert(ts.rows[0].label === "1st Downs" && ts.rows[0].away === "18" && ts.rows[0].home === "18",
  "teamStats first row keeps ESPN order and both values");
assert(ts.rows.every(function(r){ return r.away !== "-" && r.home !== "-"; }),
  "teamStats contains no '-' (not-tracked) values");

var mlbSummary = { /* MLB shape: nested stat groups, no scoringPlays */
  scoringPlays: [],
  boxscore: {teams: [
    {homeAway:"away", team:{abbreviation:"CHC"}, statistics:[
      {name:"batting", statistics:[{name:"atBats",label:"AB",displayValue:"33"}]}]},
    {homeAway:"home", team:{abbreviation:"BOS"}, statistics:[
      {name:"batting", statistics:[{name:"atBats",label:"AB",displayValue:"31"}]}]}
  ]}
};
assert(D.teamStats(mlbSummary) === null, "teamStats skips nested (MLB) stat groups instead of guessing");
var noTeams = {scoringPlays: [], boxscore: {teams: []}};
assert(D.teamStats(noTeams) === null, "teamStats null when no teams");
var sparse = {boxscore: {teams: [
  {homeAway:"away", team:{abbreviation:"A"}, statistics:[{name:"x",label:"X",displayValue:"1"}]},
  {homeAway:"home", team:{abbreviation:"B"}, statistics:[{name:"y",label:"Y",displayValue:"2"}]}
]}};
assert(D.teamStats(sparse) === null, "teamStats null when teams share fewer than 2 stat names");

/* ---- buildHtml ---- */
assert(D.buildHtml(noTeams, "football/nfl", ident) === null,
  "buildHtml returns null when there is neither scoring nor stats");
var html = D.buildHtml(nflSummary, "football/nfl", ident);
assert(typeof html === "string" && html.indexOf("Q1") >= 0 && html.indexOf("Q2") >= 0,
  "buildHtml includes the period table");
assert(html.indexOf("Total Yards") >= 0 && html.indexOf("253") >= 0 && html.indexOf("285") >= 0,
  "buildHtml includes the team-stats comparison with both values");
assert(html.indexOf("Brock Purdy") >= 0, "buildHtml includes scoring-play text");
assert(html.indexOf("Box-score detail from ESPN") >= 0, "buildHtml carries the source attribution");

var evil = JSON.parse(JSON.stringify(nflSummary));
evil.scoringPlays[0].text = '<script>alert("x")</script> TD pass';
var escHtml = D.buildHtml(evil, "football/nfl", function(s){
  return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; });
});
assert(escHtml.indexOf("<script>") < 0 && escHtml.indexOf("&lt;script&gt;") >= 0,
  "buildHtml escapes scoring-play text through the injected esc");

var otRows = D.scoringRows({scoringPlays:[play(5,"9:58","OT field goal",17,20,"KC")]});
assert(D.periodTable(otRows,"Q").periods[0].label === "OT", "periodTable labels NFL OT periods");

if(failures) { console.error(failures + " FAILURES"); process.exit(1); }
else console.log("ALL GREEN");
