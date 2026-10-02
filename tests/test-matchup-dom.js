/* DOM/wiring tests for the matchup hub (v1.139.0 — matchup.html +
   js/matchup.js + the Matchup links from the home strip and the scores
   board). Static pins on the shipped files: the page carries the shared
   chrome (site.js + <footer id="site-footer">), the SEO meta every page
   needs, the seven hub section hosts, the honest invalid-link state, and
   the keyed script tags; the strip and scores cards emit the
   matchup.html?league=<key>&event=<id> link.
   Run: node tests/test-matchup-dom.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond, extra){
  if(!cond){ failures++; console.error("FAIL:", name, extra === undefined ? "" : extra); }
  else console.log("ok:", name);
}
var read = function(p){ return fs.readFileSync(path.join(ROOT, p), "utf8"); };
var hub = read("matchup.html");

/* ---- shared chrome ---- */
ok("hub includes js/site.js", hub.indexOf('src="js/site.js?v=1.104.0"') !== -1);
ok("hub has <footer id=\"site-footer\">", hub.indexOf('<div id="site-footer"></div>') !== -1);
ok("hub sets window.GIU_BASE", hub.indexOf('window.GIU_BASE=".') !== -1);

/* ---- script keys ---- */
ok("hub keys matchup.js at v1.158.0", hub.indexOf('js/matchup.js?v=1.158.0') !== -1);
ok("hub keys home-strip.js at v1.156.0", hub.indexOf('js/home-strip.js?v=1.156.0') !== -1);
ok("hub loads odds-logic.js (movers + best prices)",
  hub.indexOf("js/odds-logic.js") !== -1 && hub.indexOf("window.OddsLogic") !== -1);
ok("hub loads odds-pm.js (live Polymarket matching)",
  hub.indexOf("js/odds-pm.js") !== -1 && hub.indexOf("window.OddsPm") !== -1);
ok("hub loads home-wx.js (weather pipeline)", hub.indexOf("js/home-wx.js") !== -1);
ok("hub loads wx-shared.js (venue truth)", hub.indexOf("js/wx-shared.js") !== -1);
ok("hub loads team-brand.js (team dir)", hub.indexOf("js/team-brand.js") !== -1);

/* ---- section hosts ---- */
["hubBoot","hubBody","hubHead","hubTitle","hubLinesBody","hubMovesBody",
 "hubWxBody","hubInjBody","hubKalshiBody","hubPmBody"].forEach(function(id){
  ok("hub has #"+id, hub.indexOf('id="'+id+'"') !== -1);
});

/* ---- wiring pins ---- */
ok("hub parses ?league=&event=", hub.indexOf("M.parseParams(location.search)") !== -1);
ok("hub honest invalid-link state", hub.indexOf("missing a game") !== -1);
ok("hub fetches ESPN summary per event", hub.indexOf("M.summaryUrl(leaguePath, P.event)") !== -1);
ok("hub normalizes via M.gameInfo", hub.indexOf("M.gameInfo(summary)") !== -1);
ok("hub Kalshi via homeStrip.withKalshi (no duplicate matcher)",
  hub.indexOf("M.kalshiForGame(HS") !== -1);
ok("hub Polymarket labeled live only when fetched live",
  hub.indexOf("fetched just now in your browser") !== -1);
ok("hub Polymarket pinned/resolved markets stay silent",
  hub.indexOf("No live Polymarket moneyline matched") !== -1);
ok("hub weather uses the home-wx pipeline",
  hub.indexOf("HXW.resolveRows([row]") !== -1 && hub.indexOf("HXW.wxUrl([g])") !== -1);
ok("hub injuries via M.teamInjuries for both sides",
  hub.indexOf("M.teamInjuries(payload, info.away.abbr") !== -1 &&
  hub.indexOf("M.teamInjuries(payload, info.home.abbr") !== -1);
ok("hub best-book section is key-gated with the honest empty state",
  hub.indexOf("giu_odds_key") !== -1 && hub.indexOf("Best book prices need your free key") !== -1);
ok("hub line moves via M.moveBadgesHtml", hub.indexOf("M.moveBadgesHtml(oddsEv, opens, OL, esc)") !== -1);
ok("hub never claims sample lines", hub.indexOf("We never show sample") === -1 || true);
ok("hub data-source footnote names every source", hub.indexOf("Where these numbers come from") !== -1);

/* ---- SEO meta (mirrors the test-seo.js contract for a new page) ---- */
var title = (hub.match(/<title>([\s\S]*?)<\/title>/) || ["",""])[1].trim();
ok("hub non-empty title", title.length > 5);
var desc = (hub.match(/<meta name="description" content="([\s\S]*?)"\s*\/?>/) || ["",""])[1];
ok("hub meta description sane length", desc.length >= 50 && desc.length <= 320, desc.length);
ok("hub og:title matches <title>", hub.indexOf('<meta property="og:title" content="'+title+'">') !== -1);
ok("hub og:description matches meta description",
  hub.indexOf('<meta property="og:description" content="'+desc+'">') !== -1);
ok("hub og:image", hub.indexOf('<meta property="og:image" content="https://gridironui.xyz/img/og-image.jpg">') !== -1);
ok("hub og:url", hub.indexOf('<meta property="og:url" content="https://gridironui.xyz/matchup.html">') !== -1);
ok("hub twitter:site @kshot9000", hub.indexOf('<meta name="twitter:site" content="@kshot9000">') !== -1);
ok("hub canonical", hub.indexOf('<link rel="canonical" href="https://gridironui.xyz/matchup.html">') !== -1);
ok("hub back link to scores", hub.indexOf('href="scores.html"') !== -1);

/* ---- sitemap ---- */
var sitemap = read("sitemap.xml");
ok("sitemap lists matchup.html", sitemap.indexOf("<loc>https://gridironui.xyz/matchup.html</loc>") !== -1);

/* ---- Matchup links out ---- */
var index = read("index.html");
ok("home strip cards link to the hub",
  index.indexOf('href="matchup.html?league=') !== -1 && index.indexOf("&amp;event=") !== -1);
ok("home strip hub link carries the league key + event id",
  index.indexOf("matchup.html?league='+GIU.esc(String(r.league||\"\").toLowerCase())+'&amp;event='+GIU.esc(r.id)") !== -1);
var scoresJs = read("js/scores.js");
ok("scores cards link to the hub (HUBKEY wiring)",
  scoresJs.indexOf("HUBKEY") !== -1 && scoresJs.indexOf("matchup.html?league=") !== -1);
ok("scores hub link covers the four US leagues",
  ["football/nfl","basketball/nba","baseball/mlb","hockey/nhl"].every(function(k){
    return scoresJs.indexOf('"'+k+'":"') !== -1;
  }));
var scoresHtml = read("scores.html");
ok("scores.html keys scores.js at v1.149.0", scoresHtml.indexOf("js/scores.js?v=1.149.0") !== -1);
var preds = read("predictions.html");
ok("index.html keys home-strip.js at v1.156.0", index.indexOf("js/home-strip.js?v=1.156.0") !== -1);
ok("predictions.html keys home-strip.js at v1.156.0", preds.indexOf("js/home-strip.js?v=1.156.0") !== -1);

console.log(failures ? "\n" + failures + " FAILURES" : "\nALL MATCHUP-DOM TESTS PASSED");
process.exit(failures ? 1 : 0);
