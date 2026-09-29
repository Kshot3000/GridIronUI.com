/* GridIronUI — legality.html content regression guard.
   The legality page is compliance-critical: it carries a date stamp, the
   state table, and now a dated "Regulatory watch" section tracking
   prediction-market enforcement (first entry: Missouri AG, Sept 18 2026,
   added 2026-09-29). The test pins:
   - the date stamp is current (no stale "Last updated" drift)
   - the Missouri action names all six operators and carries its own date
   - the citation link is present and points at the verified report URL
   - the honesty framing is intact: enforcement action, not settled law;
     no claim that trading is banned/settled anywhere beyond what happened
   - the section cross-links the site's markets + predictions pages
   Run: node tests/test-legality-watch.js */
var fs = require("fs"), path = require("path");
var html = fs.readFileSync(path.join(__dirname, "..", "legality.html"), "utf8");
var n = 0;
function ok(cond, label){
  n++;
  if(!cond){ console.error("FAIL: "+label); process.exit(1); }
}

ok(/Last updated: September 29, 2026/.test(html),
  "date stamp is September 29, 2026");
ok(html.indexOf("Last updated: September 27, 2026") === -1,
  "stale September 27 stamp is gone");

ok(/Regulatory watch: prediction markets vs state law/.test(html),
  "regulatory watch section heading present");
ok(/September 18, 2026/.test(html),
  "Missouri action carries its September 18, 2026 date");

["Polymarket","Kalshi","Crypto.com","Novig","Underdog","Robinhood"].forEach(function(op){
  ok(html.indexOf(op) !== -1, "operator named: "+op);
});
ok(/Missouri Gaming Commission/.test(html),
  "licensing authority named");
ok(/30 days to comply/.test(html),
  "compliance window stated");

var LINK = "https://acealliance.com/news/missouri-six-prediction-markets-sports-event-contracts/";
ok(html.indexOf('href="'+LINK+'"') !== -1,
  "citation link present, verbatim URL");
ok(/rel="noopener"/.test(html), "external link carries rel=noopener");

/* honesty framing: enforcement action, disputed jurisdiction, no settled-law claims */
ok(/enforcement action, not settled law/.test(html),
  "states this is an enforcement action, not settled law");
ok(/federal-derivatives counterargument is disputed/.test(html),
  "operators' federal counterargument labeled disputed");
ok(/varies by state/.test(html),
  "notes trading rights vary by state");

/* cross-links to the site's own prediction-market pages */
ok(html.indexOf('href="markets.html"') !== -1, "links markets.html");
ok(html.indexOf('href="predictions.html"') !== -1, "links predictions.html");

/* footer branding must survive every legality-page edit */
ok(html.indexOf("@kshot9000") !== -1 || html.indexOf("x.com/kshot9000") !== -1 ||
   /site-footer/.test(html),
  "footer branding hook intact");

console.log("test-legality-watch: "+n+" assertions passed");
