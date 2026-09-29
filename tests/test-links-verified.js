/* GridIronUI links-directory honesty test — the links page headlines itself
   "Links, verified" and claims "Every link on this page was checked and
   working." Without a date that claim is unverifiable: a visitor can't tell
   whether it was checked yesterday or a year ago, and link rot is real.
   This guards that the claim carries a "Last checked:" date stamp (same
   pattern as the legality page's "Last updated:" tag), so the verification
   claim is anchored to an actual check. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }

const html = fs.readFileSync(path.join(ROOT, "links.html"), "utf8");

ok("links page keeps its verified headline", html.indexOf("<h1>Links, verified</h1>") !== -1);
ok("links page keeps the checked-and-working claim",
  html.indexOf("Every link on this page was checked and working.") !== -1);

/* The date stamp: "Last checked: <Month> <D>, <YYYY>" inside the green tag,
   placed in the hero so it's visible next to the claim. */
const m = html.match(/<span class="tag green">Last checked: ([A-Z][a-z]+ \d{1,2}, \d{4})<\/span>/);
ok("links page carries a Last checked date stamp", !!m);
if(m){
  const d = new Date(m[1] + " 12:00:00");
  ok("Last checked date parses to a real date", isFinite(d));
  const ageDays = (Date.now() - d.getTime()) / 86400000;
  ok("Last checked date is not in the future", ageDays >= -1);
  ok("Last checked date is not stale (within 45 days)", ageDays <= 45);
}

/* The stamp must sit in the hero, next to the claim — not buried at the
   bottom of the page where nobody sees it. */
const heroEnd = html.indexOf("</section>", html.indexOf("page-hero"));
const stampAt = html.indexOf("Last checked:");
ok("date stamp appears inside the hero section", stampAt !== -1 && stampAt < heroEnd);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
