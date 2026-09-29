/* GridIronUI — about.html content regression guard.
   The About page's "What you'll find here" section is the site's sitemap-in-prose.
   It went stale once (2026-09-29): the Learn list named only 4 of the 7 guides
   (live-betting, line-movement and props were missing) and the Live data list
   omitted the predictions page, while the hero advertises "7 in-depth guides".
   This test fails loudly if a new guide or data page ships without updating it. */
var fs = require("fs"), path = require("path");
var html = fs.readFileSync(path.join(__dirname, "..", "about.html"), "utf8");
var n = 0;
function ok(cond, label){
  n++;
  if(!cond){ console.error("FAIL: "+label); process.exit(1); }
}
var GUIDES = [
  "guides/betting-101.html", "guides/bet-types.html", "guides/bankroll.html",
  "guides/live-betting.html", "guides/line-movement.html", "guides/props.html",
  "guides/advanced.html"
];
GUIDES.forEach(function(g){
  ok(html.indexOf('href="'+g+'"') !== -1, "about.html links "+g+" ("+GUIDES.length+" guides)");
});
var DATA = [
  "odds.html", "markets.html", "predictions.html", "scores.html",
  "news.html", "injuries.html", "weather.html"
];
DATA.forEach(function(p){
  ok(html.indexOf('href="'+p+'"') !== -1, "about.html links "+p+" (live data)");
});
/* every guide file on disk is linked, so a brand-new guide can't hide */
var guideDir = path.join(__dirname, "..", "guides");
fs.readdirSync(guideDir).forEach(function(f){
  if(/\.html$/.test(f)) ok(html.indexOf('href="guides/'+f+'"') !== -1,
    "about.html links guides/"+f);
});
console.log("test-about-content: "+n+" assertions passed");
