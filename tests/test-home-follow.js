/* Tests for followed teams on the homepage strip (v1.156.0 — js/home-strip.js
   followList / followedAbbr / withFollowed / rankFollowed / topFollowed +
   the shipped index.html wiring).
   The strip used to rank purely by live-ness and kickoff, so a followed
   team's game could fall below the 6-card cap on a busy day. Now followed
   games pin ahead of their tier (live+followed, live, upcoming+followed,
   upcoming; kickoff order inside a tier) and followed cards carry the gold
   mark. No follows -> topFollowed is exactly top().
   Run: node tests/test-home-follow.js */
"use strict";
var fs = require("fs"), path = require("path");
var HS = require("../js/home-strip.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function row(id, state, date, away, home){
  return { id: id, league: "NFL", state: state, date: date, shortDetail: "",
           away: {team: {abbreviation: away}}, home: {team: {abbreviation: home}},
           venue: "", broadcast: "" };
}
var D = function(h){ return "2026-10-04T" + h + ":00:00Z"; };

/* ---- followList: cleaning ---- */
assert(JSON.stringify(HS.followList(["chi", " KC ", "CHI", "buf"])) === '["CHI","KC","BUF"]',
  "followList: trims, uppercases, dedupes, keeps order");
assert(JSON.stringify(HS.followList(["A", "TOOLONG", "C1", "", null, 42, {}, "GB"])) === '["GB"]',
  "followList: drops non-abbr-shaped and non-string entries");
assert(JSON.stringify(HS.followList(null)) === "[]" && JSON.stringify(HS.followList("CHI")) === "[]" &&
       JSON.stringify(HS.followList(undefined)) === "[]" && JSON.stringify(HS.followList([])) === "[]",
  "followList: garbage in -> []");

/* ---- followedAbbr ---- */
assert(HS.followedAbbr(row("1", "pre", D("17"), "DET", "CHI"), ["CHI"]) === "CHI",
  "followedAbbr: home side matches");
assert(HS.followedAbbr(row("1", "pre", D("17"), "CHI", "DET"), ["CHI"]) === "CHI",
  "followedAbbr: away side matches");
assert(HS.followedAbbr(row("1", "pre", D("17"), "DET", "GB"), ["CHI"]) === null,
  "followedAbbr: no followed team -> null");
assert(HS.followedAbbr(row("1", "pre", D("17"), "CHI", "KC"), ["KC", "CHI"]) === "KC",
  "followedAbbr: follow-list order wins when both sides are followed");
assert(HS.followedAbbr(row("1", "pre", D("17"), "chi", "DET"), ["CHI"]) === "CHI",
  "followedAbbr: row abbrs normalize (lowercase ESPN abbr still matches)");
assert(HS.followedAbbr(null, ["CHI"]) === null && HS.followedAbbr({}, ["CHI"]) === null &&
       HS.followedAbbr({away: null, home: null}, ["CHI"]) === null &&
       HS.followedAbbr(row("1", "pre", D("17"), "CHI", "DET"), []) === null &&
       HS.followedAbbr(row("1", "pre", D("17"), "CHI", "DET"), null) === null,
  "followedAbbr: garbage rows/lists -> null, never throws");

/* ---- withFollowed ---- */
var base = [row("a", "pre", D("17"), "DET", "GB"), row("b", "pre", D("20"), "MIA", "CHI")];
var wf = HS.withFollowed(base, ["CHI"]);
assert(wf[1].followed === "CHI" && wf[0].followed === undefined,
  "withFollowed: only the followed row is stamped");
assert(wf[0] === base[0] && wf[1] !== base[1] && base[1].followed === undefined,
  "withFollowed: matched rows are new objects, unmatched pass through, input unmutated");
assert(HS.withFollowed(base, []).every(function(r, i){ return r === base[i]; }),
  "withFollowed: no follows -> same rows by reference");
assert(JSON.stringify(HS.withFollowed(null, ["CHI"])) === "[]" &&
       JSON.stringify(HS.withFollowed(undefined, ["CHI"])) === "[]",
  "withFollowed: garbage rows -> []");

/* ---- topFollowed: tier order ---- */
var slate = [
  row("prePlain1", "pre", D("17"), "DET", "GB"),
  row("preFol",    "pre", D("23"), "MIA", "CHI"),   /* followed, latest kickoff */
  row("livePlain", "in",  D("18"), "NYJ", "NE"),
  row("liveFol",   "in",  D("19"), "KC",  "BUF"),   /* BUF followed, live */
  row("prePlain2", "pre", D("16"), "DAL", "PHI")    /* earliest pre kickoff */
];
var fol = ["CHI", "BUF"];
var order = HS.topFollowed(slate, fol, 10).map(function(r){ return r.id; });
assert(order.join(",") === "liveFol,livePlain,preFol,prePlain2,prePlain1",
  "topFollowed: live+followed > live > pre+followed > pre (kickoff inside tier) — got " + order.join(","));
var stamps = HS.topFollowed(slate, fol, 10);
assert(stamps[0].followed === "BUF" && stamps[2].followed === "CHI" &&
       stamps[1].followed === undefined && stamps[3].followed === undefined,
  "topFollowed: stamps ride along with the pinned rows");

/* a followed pre-game displaces a non-followed pre-game at the cap */
var capped = HS.topFollowed(slate, fol, 3).map(function(r){ return r.id; });
assert(capped.join(",") === "liveFol,livePlain,preFol",
  "topFollowed: followed pre-game makes the cut over earlier non-followed pre-games — got " + capped.join(","));
assert(HS.topFollowed(slate, fol).length === 5 && HS.topFollowed(slate, fol, 6).length === 5,
  "topFollowed: default cap is 6 (slate of 5 passes through)");

/* no follows / garbage follows -> exactly top() */
var plain = HS.top(slate, 10).map(function(r){ return r.id; }).join(",");
assert(HS.topFollowed(slate, [], 10).map(function(r){ return r.id; }).join(",") === plain,
  "topFollowed: empty follow list == top() order");
assert(HS.topFollowed(slate, ["!!", null], 10).map(function(r){ return r.id; }).join(",") === plain,
  "topFollowed: garbage follow list == top() order");
assert(slate.every(function(r){ return r.followed === undefined; }),
  "topFollowed: input rows never mutated");

/* followed stamp survives the Kalshi annotation copy (index.html runs
   withKalshi AFTER topFollowed; matched rows are copied key-by-key) */
var snap = { updated_at: new Date(Date.now()).toISOString(), games: [{
  sub_title: "MIA vs CHI (Oct 4)", event_ticker: "KXNFLGAME-26OCT04MIACHI",
  markets: [{ticker: "KXNFLGAME-26OCT04MIACHI-MIA", yes_bid: 40, yes_ask: 42, last: 41},
            {ticker: "KXNFLGAME-26OCT04MIACHI-CHI", yes_bid: 58, yes_ask: 60, last: 59}]
}]};
var annotated = HS.withKalshi(HS.topFollowed(slate, fol, 10), {NFL: snap}, Date.now());
var chiRow = annotated.filter(function(r){ return r.id === "preFol"; })[0];
assert(chiRow.followed === "CHI" && chiRow.kp && chiRow.kp.hPct === 59,
  "integration: followed stamp + Kalshi prices coexist on the same row");

/* ---- shipped wiring pins ---- */
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert(html.indexOf("js/home-strip.js?v=2.0.3") !== -1, "index.html pins home-strip.js?v=2.0.3");
assert(html.indexOf("js/team-follow.js?v=1.142.0") !== -1, "index.html loads team-follow.js?v=1.142.0");
assert(html.indexOf("js/team-follow.js") < html.indexOf("HS.topFollowed"),
  "index.html loads team-follow.js before the strip script uses it");
assert(html.indexOf("HS.topFollowed(") !== -1, "index.html ranks the strip with topFollowed");
assert(html.indexOf("GIU.TeamFollow") !== -1 && html.indexOf("TeamFollow.load()") !== -1,
  "index.html reads the follow list via TeamFollow.load()");
assert(html.indexOf("r.followed ? \" followed\"") !== -1 || html.indexOf('r.followed ? " followed"') !== -1,
  "index.html puts the followed class on followed cards");
assert(html.indexOf("★ Your team") !== -1, "index.html renders the ★ Your team tag");
assert(html.indexOf(".game-card.followed") !== -1 && html.indexOf(".tag.your-team") !== -1,
  "index.html carries the page-scoped gold follow styles");
["matchup.html", "predictions.html"].forEach(function(p){
  var h = fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  assert(h.indexOf("js/home-strip.js?v=2.0.3") !== -1,
    p + " re-pins the shared home-strip.js at v2.0.3");
});

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL HOME-FOLLOW TESTS PASSED");
process.exit(failures ? 1 : 0);
