/* GridIronUI README test-list drift guard.
   The README's "Develop" section lists every test file so contributors can
   run the suite file by file. It drifted silently — 21 test files shipped
   without a README line (caught 2026-09-29). This test fails if any
   tests/test-*.js file is not referenced in README.md, and if any
   README-referenced test file is missing from disk — so the list can never
   drift again without a red suite.
   Run: node tests/test-readme-testlist.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
var readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
var onDisk = fs.readdirSync(path.join(ROOT, "tests"))
  .filter(function(f){ return /^test-[A-Za-z0-9-]+\.js$/.test(f); })
  .sort();
ok("scanned test files", onDisk.length > 0, "found="+onDisk.length);
/* Every test file on disk must be named in the README. */
var missing = onDisk.filter(function(f){ return readme.indexOf(f) === -1; });
ok("every test file listed in README.md", missing.length === 0, missing.join(", "));
/* Every test file the README names must exist on disk (no dead references). */
var referenced = {};
var re = /tests\/(test-[A-Za-z0-9-]+\.js)/g, m;
while((m = re.exec(readme)) !== null){ referenced[m[1]] = 1; }
var dead = Object.keys(referenced).filter(function(f){ return onDisk.indexOf(f) === -1; });
ok("no dead test references in README.md", dead.length === 0, dead.join(", "));
console.log(fails ? "\n"+fails+" FAILURES" : "\nALL README-TESTLIST TESTS PASSED");
process.exit(fails ? 1 : 0);
