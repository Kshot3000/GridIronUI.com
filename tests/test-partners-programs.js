/* GridIronUI — partners.html prediction-market programs content guard.
   The partners page used to say only "Kalshi / Polymarket programs welcome" —
   generic enough to be meaningless. Since 2026-09-29 it names the actual
   programs with verified details: the Polymarket Builder tiers (Unverified /
   Verified / Partner per their published docs) and Kalshi's refer-a-friend
   mechanics, framed honestly (independent site, not enrolled today) and
   date-stamped, with a cross-link to the legality page's regulatory watch.
   This test pins the concrete program facts so they can't silently go stale. */
var fs = require("fs"), path = require("path");
var html = fs.readFileSync(path.join(__dirname, "..", "partners.html"), "utf8");
var n = 0;
function ok(cond, label){
  n++;
  if(!cond){ console.error("FAIL: "+label); process.exit(1); }
}
ok(html.indexOf("Prediction-market programs, concretely") !== -1,
  "partners.html has the concrete programs section");
/* honesty framing */
ok(/independent site/i.test(html) && /not enrolled|enrolled in neither/i.test(html),
  "partners.html states the site is independent and not enrolled today");
ok(html.indexOf("September 29, 2026") !== -1,
  "program details carry a September 29, 2026 verification date stamp");
/* Polymarket Builder tiers — verified against docs.polymarket.com 2026-09-29 */
ok(html.indexOf("Unverified") !== -1 && html.indexOf("Verified") !== -1 &&
   html.indexOf("Partner") !== -1,
  "all three Builder tiers named");
ok(html.indexOf("100 transactions/day") !== -1, "Unverified tier throughput pinned");
ok(html.indexOf("1,500 transactions/day") !== -1, "Verified tier throughput pinned");
ok(html.indexOf("RevShare") !== -1, "Verified RevShare protocol access named");
ok(html.indexOf("verified affiliate badge") !== -1, "Verified affiliate badge named");
ok(html.indexOf("custom split") !== -1, "Partner custom fee split named");
ok(html.indexOf("https://docs.polymarket.com/developers/builders/builder-tiers") !== -1,
  "links the official builder-tier docs verbatim (curl-verified 200)");
/* Kalshi refer-a-friend — verified against affiliate roundups 2026-09-29 */
ok(html.indexOf("$25") !== -1, "Kalshi $25 referral credit named");
ok(html.indexOf("$1,000") !== -1, "Kalshi $1,000 referral cap named");
ok(html.indexOf("40 referrals") !== -1, "Kalshi 40-referral cap named");
ok(html.indexOf("7 days after issuance") !== -1, "Kalshi credit expiry named");
ok(/terms vary by account/i.test(html), "Kalshi per-account terms variance disclosed");
/* internal cross-links */
ok(html.indexOf('href="markets.html"') !== -1, "cross-links the markets page");
ok(html.indexOf('href="predictions.html"') !== -1, "cross-links the predictions page");
ok(html.indexOf('href="legality.html"') !== -1, "cross-links the legality regulatory watch");
/* no enrollment claim sneaks in */
ok(!/we are enrolled|currently enrolled|as a Verified partner/i.test(html),
  "no claim that the site is enrolled in either program");
console.log("test-partners-programs: "+n+" assertions passed");
