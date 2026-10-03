/* Unit tests for js/matchup.js — the per-game matchup hub logic.
   Verifies param parsing (league identity keys only, sane event tokens),
   the ESPN summary URL scheme (league path + ?event=id, matching
   scores-detail.js), header normalization (records, ESPN free spread/total,
   broadcast), the pseudo home-strip row (same pipeline shape the homepage
   uses), Kalshi crowd-price matching through homeStrip.withKalshi (stale
   snapshots withhold, never posed as fresh), Polymarket favorite extraction
   (pinned 0/100 excluded), injury filtering per team (Active dropped,
   severity order), Odds API event matching (names + game day, no guessing),
   best-book rows, and line-move badges via OddsLogic.moverEntries.
   Run: node tests/test-matchup.js */
"use strict";
var M = require("../js/matchup.js");
var HS = require("../js/home-strip.js");
var OL = require("../js/odds-logic.js");
var failures = 0;
function ok(name, cond, extra){
  if(!cond){ failures++; console.error("FAIL:", name, extra === undefined ? "" : extra); }
  else console.log("ok:", name);
}
var ident = function(s){ return String(s == null ? "" : s); };
var NOW = 1788228000000; /* fixed "now" for the fixtures */

/* ---- parseParams ---- */
var p = M.parseParams("?league=nfl&event=401872958");
ok("parseParams: valid", p.league === "nfl" && p.event === "401872958", JSON.stringify(p));
ok("parseParams: league case-insensitive",
  M.parseParams("?league=NFL&event=1").league === "nfl");
ok("parseParams: unknown league -> null league",
  M.parseParams("?league=xfl&event=1").league === null);
ok("parseParams: missing event -> null event",
  M.parseParams("?league=nfl").event === null);
ok("parseParams: hostile event token rejected",
  M.parseParams("?league=nfl&event=1;DROP").event === null);
ok("parseParams: missing league -> null league",
  M.parseParams("?event=1").league === null);
ok("parseParams: extra params ignored",
  M.parseParams("?league=mlb&event=abc123&x=1").event === "abc123");

/* ---- league paths / odds sports ---- */
ok("leaguePath nfl", M.leaguePath("nfl") === "football/nfl");
ok("leaguePath nhl", M.leaguePath("nhl") === "hockey/nhl");
ok("leaguePath unknown -> null", M.leaguePath("xfl") === null);
ok("oddsSport nfl", M.oddsSport("nfl") === "americanfootball_nfl");
ok("oddsSport mlb", M.oddsSport("mlb") === "baseball_mlb");
ok("oddsSport unknown -> null", M.oddsSport("epl") === null);
ok("leaguePath ncaaf", M.leaguePath("ncaaf") === "football/college-football");
ok("oddsSport ncaaf", M.oddsSport("ncaaf") === "americanfootball_ncaaf");
ok("parseParams: ncaaf link parses",
  (function(){ var q = M.parseParams("?league=ncaaf&event=401858250");
    return q.league === "ncaaf" && q.event === "401858250"; })());

/* ---- URLs ---- */
ok("summaryUrl scheme (scores-detail compatible)",
  M.summaryUrl("football/nfl", "401872958") ===
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872958");
ok("injuriesUrl", M.injuriesUrl("football/nfl") ===
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries");

/* ---- gameInfo fixture ---- */
function comp(homeAway, abbr, name, score, records){
  return {homeAway: homeAway, score: score,
          team: {abbreviation: abbr, displayName: name, shortDisplayName: name.split(" ").pop()},
          records: records};
}
var summary = {
  header: {competitions: [{
    date: "2026-10-04T20:20:00Z",
    status: {type: {state: "pre", shortDetail: "Sun, Oct 4"}},
    competitors: [
      comp("away", "PIT", "Pittsburgh Steelers", null, [{name: "overall", summary: "3-1-0"}]),
      comp("home", "CLE", "Cleveland Browns", null, [{name: "overall", summary: "1-3-0"}])
    ],
    venue: {fullName: "Huntington Bank Field"},
    broadcasts: [{names: ["CBS"]}],
    odds: [{details: "PIT -2.5", overUnder: 44.5}]
  }]}
};
var info = M.gameInfo(summary);
ok("gameInfo: not null", !!info);
ok("gameInfo: away abbr", info.away.abbr === "PIT");
ok("gameInfo: home name", info.home.name === "Cleveland Browns");
ok("gameInfo: records", info.away.record === "3-1-0" && info.home.record === "1-3-0", info.away.record+"/"+info.home.record);
ok("gameInfo: ESPN spread", info.espnSpread === "PIT -2.5");
ok("gameInfo: ESPN total", info.espnTotal === "44.5");
ok("gameInfo: venue", info.venue === "Huntington Bank Field");
ok("gameInfo: broadcast", info.broadcast === "CBS");
ok("gameInfo: state pre", info.state === "pre");
ok("gameInfo: missing competition -> null", M.gameInfo({header: {competitions: []}}) === null);
ok("gameInfo: garbage payload -> null", M.gameInfo({}) === null && M.gameInfo(null) === null);
ok("gameInfo: one side missing -> null",
  M.gameInfo({header: {competitions: [{competitors: [comp("home", "CLE", "Cleveland Browns", null, [])]}]}}) === null);
ok("gameInfo: no odds -> empty strings, not null",
  (function(){ var s2 = JSON.parse(JSON.stringify(summary));
    delete s2.header.competitions[0].odds;
    var i2 = M.gameInfo(s2);
    return i2 && i2.espnSpread === "" && i2.espnTotal === ""; })());
ok("gameInfo: no records -> null record, not a guess",
  (function(){ var s2 = JSON.parse(JSON.stringify(summary));
    delete s2.header.competitions[0].competitors[0].records;
    return M.gameInfo(s2).away.record === null; })());
ok("overallRecord: first summary wins",
  M.overallRecord({records: [{name: "overall", summary: "2-2-0"}]}) === "2-2-0");
ok("overallRecord: no records -> null", M.overallRecord({}) === null);

/* ---- gameInfo against the LIVE summary shape (v2.0.8) ----
   Verified 2026-10-03 against real ESPN summary payloads (NFL pre/post,
   NCAAF pre): the competition object carries NO venue/odds, the record
   list is competitor.record[] typed "total"/"home"/"vsconf", the free
   line sits at summary.pickcenter[0], the venue at
   summary.gameInfo.venue, and a broadcast entry names its network at
   media.shortName. The old fixture above (competition-level fields) must
   keep working too — both shapes are the same ESPN data for the game. */
function liveComp(homeAway, abbr, name, record){
  return {homeAway: homeAway,
          team: {abbreviation: abbr, displayName: name, shortDisplayName: name.split(" ").pop()},
          record: record};
}
var liveSummary = {
  header: {competitions: [{
    date: "2026-10-04T17:00:00Z",
    status: {type: {state: "pre", shortDetail: "Sun, Oct 4"}},
    competitors: [
      liveComp("away", "DAL", "Dallas Cowboys",
        [{type: "home", summary: "1-0"}, {type: "total", summary: "1-2"}, {type: "vsconf", summary: "0-1"}]),
      liveComp("home", "HOU", "Houston Texans",
        [{type: "total", summary: "0-3"}, {type: "home", summary: "0-2"}])
    ],
    broadcasts: [{media: {shortName: "FOX"}}]
  }]},
  gameInfo: {venue: {fullName: "Reliant Stadium"}},
  pickcenter: [{details: "HOU -3", overUnder: 48.5}]
};
var live = M.gameInfo(liveSummary);
ok("live shape: not null", !!live);
ok("live shape: record[] total entry wins over home split",
  live.away.record === "1-2" && live.home.record === "0-3",
  live.away.record + "/" + live.home.record);
ok("live shape: pickcenter line", live.espnSpread === "HOU -3" && live.espnTotal === "48.5");
ok("live shape: gameInfo venue", live.venue === "Reliant Stadium");
ok("live shape: broadcast media.shortName", live.broadcast === "FOX");
ok("overallRecord: record[] total preferred even when not first",
  M.overallRecord({record: [{type: "home", summary: "2-0"}, {type: "total", summary: "3-1"}]}) === "3-1");
ok("overallRecord: record[] without a total falls back to first summary",
  M.overallRecord({record: [{type: "home", summary: "2-0"}]}) === "2-0");
ok("gameInfo: competition line beats pickcenter when both are present",
  (function(){ var s3 = JSON.parse(JSON.stringify(liveSummary));
    s3.header.competitions[0].odds = [{details: "HOU -3.5", overUnder: 49.5}];
    var i3 = M.gameInfo(s3);
    return i3.espnSpread === "HOU -3.5" && i3.espnTotal === "49.5"; })());
ok("gameInfo: no line anywhere -> empty strings, not a guess",
  (function(){ var s4 = JSON.parse(JSON.stringify(liveSummary));
    delete s4.pickcenter;
    var i4 = M.gameInfo(s4);
    return i4 && i4.espnSpread === "" && i4.espnTotal === ""; })());

/* ---- stripRowForGame ---- */
var row = M.stripRowForGame(info, "nfl");
ok("stripRowForGame: NFL label", row.league === "NFL");
ok("stripRowForGame: home-strip shape", row.home.team.abbreviation === "CLE" &&
   row.away.team.abbreviation === "PIT" && row.date === info.date && row.venue === info.venue);
ok("stripRowForGame: mlb label", M.stripRowForGame(info, "mlb").league === "MLB");
ok("stripRowForGame: null info -> null", M.stripRowForGame(null, "nfl") === null);

/* ---- kalshiForGame (through real homeStrip.withKalshi) ---- */
function kalshiSnap(game){
  return {updated_at: new Date(NOW - 3600000).toISOString(),
          games: [game]};
}
function kGame(sub, ticker, aPx, hPx, aTicker, hTicker){
  return {sub_title: sub, event_ticker: ticker, title: sub.replace("vs", "vs."),
          markets: [
            {ticker: aTicker, yes_bid: aPx - 1, yes_ask: aPx + 1, last: aPx},
            {ticker: hTicker, yes_bid: hPx - 1, yes_ask: hPx + 1, last: hPx}
          ]};
}
var snap = kalshiSnap(kGame("PIT vs CLE (Oct 4)", "KXNFLGAME-26OCT04PITCLE", 57, 43,
                            "KXNFLGAME-26OCT04PITCLE-PIT", "KXNFLGAME-26OCT04PITCLE-CLE"));
var kp = M.kalshiForGame(HS, info, "nfl", {NFL: snap}, NOW);
ok("kalshiForGame: matched", !!kp, JSON.stringify(kp));
ok("kalshiForGame: away price", kp && kp.aAbbr === "PIT" && kp.aPct === 57);
ok("kalshiForGame: home price", kp && kp.hAbbr === "CLE" && kp.hPct === 43);
ok("kalshiForGame: unmatched game -> null",
  M.kalshiForGame(HS, info, "nfl", {NFL: kalshiSnap(kGame("KC vs BUF (Oct 4)", "KXNFLGAME-26OCT04KCBUF", 60, 40, "KXNFLGAME-26OCT04KCBUF-KC", "KXNFLGAME-26OCT04KCBUF-BUF"))}, NOW) === null);
ok("kalshiForGame: stale snapshot withholds (never posed as fresh)",
  M.kalshiForGame(HS, info, "nfl",
    {NFL: {updated_at: new Date(NOW - 7 * 3600000).toISOString(), games: snap.games}}, NOW) === null);
ok("kalshiForGame: nba (no snapshot) -> null",
  M.kalshiForGame(HS, info, "nba", {NFL: snap}, NOW) === null);
ok("kalshiForGame: missing homeStrip -> null",
  M.kalshiForGame(null, info, "nfl", {NFL: snap}, NOW) === null);

/* ---- Polymarket ---- */
ok("pmFavoriteFromMap: favorite wins",
  (function(){ var r = M.pmFavoriteFromMap({PIT: 58, CLE: 42});
    return r && r.abbr === "PIT" && r.pm === 58; })());
ok("pmFavoriteFromMap: pinned 99/1 excluded (resolved market, not a price)",
  M.pmFavoriteFromMap({PIT: 99, CLE: 1}) === null);
ok("pmFavoriteFromMap: garbage -> null",
  M.pmFavoriteFromMap(null) === null && M.pmFavoriteFromMap({}) === null);
ok("pmForGame: pair lookup",
  (function(){ var map = {"CLE|PIT": {priceByAbbr: {PIT: 57, CLE: 43}}};
    var r = M.pmForGame({}, map, "PIT", "CLE");
    return r && r.abbr === "PIT" && r.pm === 57; })());
ok("pmForGame: order-independent pair key",
  (function(){ var map = {"CLE|PIT": {priceByAbbr: {PIT: 57, CLE: 43}}};
    return !!M.pmForGame({}, map, "CLE", "PIT"); })());
ok("pmForGame: no map entry -> null",
  M.pmForGame({}, {}, "PIT", "CLE") === null);

/* ---- injuries ---- */
function injPayload(){
  return {injuries: [{
    displayName: "Pittsburgh Steelers", abbreviation: "PIT",
    injuries: [
      {athlete: {displayName: "T.J. Watt"}, status: "Questionable",
       longComment: "Ankle — limited in practice", date: "2026-10-01T12:00:00Z"},
      {athlete: {displayName: "Minkah Fitzpatrick"}, status: "Out", shortComment: "Hamstring", date: "2026-09-30T12:00:00Z"},
      {athlete: {displayName: "Healthy Guy"}, status: "Active", longComment: "A signature stat line…"}
    ]}, {
    displayName: "Cleveland Browns", abbreviation: "CLE",
    injuries: [
      {athlete: {displayName: "Myles Garrett"}, status: "Doubtful", details: {type: "Knee", location: "Knee", detail: "Sprain", side: "Left", returnDate: "2026-10-12T00:00:00Z"}}
    ]}]};
}
var pit = M.teamInjuries(injPayload(), "PIT", "Pittsburgh Steelers");
ok("teamInjuries: matched by abbr", !!pit && pit.team === "Pittsburgh Steelers");
ok("teamInjuries: Active dropped (healthy, not an injury)",
  pit && pit.injuries.length === 2 && pit.injuries.every(function(e){ return e.name !== "Healthy Guy"; }));
ok("teamInjuries: severity order (Out first)",
  pit && pit.injuries[0].name === "Minkah Fitzpatrick" && pit.injuries[1].name === "T.J. Watt");
ok("teamInjuries: detail text", pit && pit.injuries[1].detail === "Ankle — limited in practice");
ok("teamInjuries: structured detail object flattened",
  (function(){ var cle = M.teamInjuries(injPayload(), "CLE", "Cleveland Browns");
    return cle && cle.injuries[0].detail === "Knee · Sprain · Left side — expected back 2026-10-12"; })());
ok("teamInjuries: date trimmed", pit && pit.injuries[0].date === "2026-09-30");
ok("teamInjuries: unknown team -> null", M.teamInjuries(injPayload(), "KC", "Kansas City Chiefs") === null);
ok("teamInjuries: garbage payload -> null", M.teamInjuries({}, "PIT", "X") === null);
ok("sevRank: Out/Doubtful/Questionable", M.sevRank("Out") === 3 && M.sevRank("Doubtful") === 2 && M.sevRank("Questionable") === 1);
ok("sevRank: IL forms rank out", M.sevRank("15-Day-IL") === 3);
ok("isHealthy: Active dropped", M.isHealthy("Active") === true && M.isHealthy("Out") === false);
ok("injurySummary: out + questionable",
  M.injurySummary(pit) === "1 out · 1 questionable", M.injurySummary(pit));
ok("injurySummary: null -> empty", M.injurySummary(null) === "");

/* ---- matchOddsEvent ---- */
function oddsEv(){
  return {id: "abc123", commence_time: "2026-10-04T20:20:00Z",
          away_team: "Pittsburgh Steelers", home_team: "Cleveland Browns",
          bookmakers: []};
}
var matched = M.matchOddsEvent([oddsEv()], ["PIT", "Pittsburgh Steelers", "Steelers"],
                               ["CLE", "Cleveland Browns", "Browns"], "2026-10-04T20:20:00Z");
ok("matchOddsEvent: matched by names + day", !!matched && matched.id === "abc123");
ok("matchOddsEvent: abbrs alone are not enough — no guessing, the page passes full name forms",
  M.matchOddsEvent([oddsEv()], ["PIT"], ["CLE"], "2026-10-04T20:20:00Z") === null);
ok("matchOddsEvent: same pair different day skipped",
  M.matchOddsEvent([oddsEv()], ["PIT"], ["CLE"], "2026-10-11T20:20:00Z") === null);
ok("matchOddsEvent: wrong teams skipped",
  M.matchOddsEvent([oddsEv()], ["KC"], ["BUF"], "2026-10-04T20:20:00Z") === null);
ok("matchOddsEvent: empty -> null", M.matchOddsEvent([], ["PIT"], ["CLE"], "2026-10-04T20:20:00Z") === null);
ok("dayOf: parses ISO", M.dayOf("2026-10-04T20:20:00Z") === "2026-10-04");
ok("dayOf: garbage -> null", M.dayOf("soon") === null);

/* ---- bestBookRows ---- */
function bookEv(){
  return {id: "abc123", away_team: "Pittsburgh Steelers", home_team: "Cleveland Browns",
    bookmakers: [
      {key: "draftkings", title: "DraftKings",
       markets: [
         {key: "spreads", outcomes: [
           {name: "Pittsburgh Steelers", point: -2.5, price: 1.91},
           {name: "Cleveland Browns", point: 2.5, price: 1.91}]},
         {key: "totals", outcomes: [
           {name: "Over", point: 44.5, price: 1.87},
           {name: "Under", point: 44.5, price: 1.95}]},
         {key: "h2h", outcomes: [
           {name: "Pittsburgh Steelers", price: 1.62},
           {name: "Cleveland Browns", price: 2.35}]}
       ]},
      {key: "fanduel", title: "FanDuel",
       markets: [
         {key: "spreads", outcomes: [
           {name: "Pittsburgh Steelers", point: -3, price: 1.87},
           {name: "Cleveland Browns", point: 3, price: 1.95}]},
         {key: "totals", outcomes: [
           {name: "Over", point: 45, price: 1.91},
           {name: "Under", point: 45, price: 1.91}]},
         {key: "h2h", outcomes: [
           {name: "Pittsburgh Steelers", price: 1.66},
           {name: "Cleveland Browns", price: 2.25}]}
       ]}
    ]};
}
var rowsHtml = M.bestBookRows(bookEv(), OL, ident);
ok("bestBookRows: renders six rows", (rowsHtml.match(/border-top/g) || []).length === 6, rowsHtml.length);
ok("bestBookRows: best away spread is DraftKings -2.5 (-110)", rowsHtml.indexOf("-2.5 (-110)") !== -1 && rowsHtml.indexOf("DraftKings") !== -1, rowsHtml.slice(0, 200));
ok("bestBookRows: best home spread is FanDuel +3 (-105)", rowsHtml.indexOf("+3 (-105)") !== -1);
ok("bestBookRows: best away ML is FanDuel 1.66 (-152)", rowsHtml.indexOf("-152") !== -1);
ok("bestBookRows: book title shown", rowsHtml.indexOf("FanDuel") !== -1);
ok("bestBookRows: no books -> empty", M.bestBookRows({bookmakers: []}, OL, ident) === "");
ok("bestBookRows: null event -> empty", M.bestBookRows(null, OL, ident) === "");

/* ---- moveBadgesHtml (real OddsLogic) ---- */
var opens = {"abc123": {sp: -1.5, tot: 44.5}};
var badges = M.moveBadgesHtml(bookEv(), opens, OL, ident);
ok("moveBadgesHtml: spread badge present (mv-dn, moved toward favorite)", badges.indexOf("Spread") !== -1 && badges.indexOf("mv-dn") !== -1, badges);
ok("moveBadgesHtml: total badge present (mv-up)", badges.indexOf("Total") !== -1 && badges.indexOf("mv-up") !== -1);
ok("moveBadgesHtml: tooltip carries open -> now",
  badges.indexOf("-1.5") !== -1 && badges.indexOf("-2.75") !== -1, badges);
ok("moveBadgesHtml: no opener -> quiet", M.moveBadgesHtml(bookEv(), {}, OL, ident) === "");
ok("moveBadgesHtml: null event -> empty", M.moveBadgesHtml(null, opens, OL, ident) === "");
ok("moverNow: open + delta", M.moverNow("-1.5", -1.25) === -2.75);
ok("moverNow: garbage open -> null", M.moverNow("soon", 1) === null);
ok("moverNowFmt: spread signed", M.moverNowFmt({openFmt: "2.5", delta: -1, kind: "spread"}) === "+1.5");
ok("moverNowFmt: total plain", M.moverNowFmt({openFmt: "44.5", delta: 0.5, kind: "total"}) === "45");
ok("moverNowFmt: garbage -> repeats open", M.moverNowFmt({openFmt: "soon", delta: 1, kind: "spread"}) === "soon");


/* ---- live auto-refresh contract (v2.0.9) ---- */
ok("refreshDelay: live game -> 60s", M.refreshDelay({state: "in"}) === 60000);
ok("refreshDelay: pre game -> 5 min", M.refreshDelay({state: "pre"}) === 5*60*1000);
ok("refreshDelay: final -> stopped", M.refreshDelay({state: "post"}) === 0);
ok("refreshDelay: null info -> stopped", M.refreshDelay(null) === 0);
ok("refreshDelay: garbage state -> stopped, never guessed", M.refreshDelay({state: "soon"}) === 0 && M.refreshDelay({}) === 0 && M.refreshDelay("in") === 0);
ok("live cadence constants exported", M.LIVE_MS === 60000 && M.PRE_MS === 300000 && M.SLOW_MS === 300000);
ok("slowDue: never pulled -> due", M.slowDue(null, 1000000) === true && M.slowDue(undefined, 1000000) === true);
ok("slowDue: inside the 5-min bucket -> not due", M.slowDue(1000000, 1000000 + 299999) === false);
ok("slowDue: at the bucket edge -> due", M.slowDue(1000000, 1000000 + 300000) === true);
ok("slowDue: garbage timestamps -> due, never throws", M.slowDue("x", 5) === true && M.slowDue(5, "x") === true);

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL MATCHUP TESTS PASSED");
process.exit(failures ? 1 : 0);
