/* Cache-key regression guard: every js/*.js?v=X referenced from HTML must
   carry a version AT LEAST as new as the release that last changed that
   file's content. A stale key means returning visitors run cached JS that
   no longer matches the page's expectations (e.g. odds.html once pointed
   at odds-logic.js?v=1.18.0 while the file had grown moverEntries/
   biggestMovers/recordSample — a TypeError that broke the whole board).
   Run: node tests/test-cache-keys.js (needs git; skipped gracefully without). */
"use strict";
var fs = require("fs"), path = require("path"), cp = require("child_process");
var ROOT = path.join(__dirname, "..");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
function verNums(v){ return v.split(".").map(function(x){ return parseInt(x, 10) || 0; }); }
function cmpVer(a, b){
  var x = verNums(a), y = verNums(b);
  for(var i = 0; i < 3; i++){ if(x[i] !== y[i]) return x[i] - y[i]; }
  return 0;
}
var hasGit = true;
try{ cp.execSync("git rev-parse --git-dir", {cwd: ROOT, stdio: "ignore"}); }
catch(e){ hasGit = false; }
if(!hasGit){ console.log("SKIP: no git repo available"); process.exit(0); }

/* last release version whose commit touched each js file */
function lastChangeVer(rel){
  try{
    var msg = cp.execSync("git log --format=%s -1 -- "+JSON.stringify(rel),
                          {cwd: ROOT, encoding: "utf8"});
    var m = msg.match(/v(\d+\.\d+\.\d+)/);
    return m ? m[1] : null;
  }catch(e){ return null; }
}
/* collect html files */
function htmlFiles(dir, out){
  out = out || [];
  fs.readdirSync(dir).forEach(function(f){
    if(f === ".git" || f === "node_modules") return;
    var p = path.join(dir, f), st = fs.statSync(p);
    if(st.isDirectory()) htmlFiles(p, out);
    else if(/\.html$/.test(f)) out.push(p);
  });
  return out;
}
var checked = 0, references = 0;
htmlFiles(ROOT).forEach(function(html){
  var src = fs.readFileSync(html, "utf8"), re = /src="([^"]*js\/([a-z0-9-]+)\.js)(\?v=([0-9.]+))?"/g, m;
  while((m = re.exec(src))){
    var jsName = m[2] + ".js", key = m[4] || null;
    var rel = path.join("js", jsName);
    if(!fs.existsSync(path.join(ROOT, rel))) continue; /* external or missing: not our problem */
    references++;
    var changedIn = lastChangeVer(rel);
    if(!changedIn) continue; /* no versioned commit found: skip */
    checked++;
    var short = path.relative(ROOT, html);
    if(!key){
      /* unkeyed scripts are the old convention (kalshi-logic.js, betmath.js,
         tools.js) — noted, not failed */
      console.log("note ", short+" loads "+jsName+" with no cache key (last changed "+changedIn+")");
      continue;
    }
    ok(short+" "+jsName+" key v"+key+" >= content v"+changedIn,
       cmpVer(key, changedIn) >= 0, "key="+key+" content="+changedIn);
  }
});
ok("scanned references", references > 0, "references="+references);
if(!checked) console.log("NOTE: no versioned commit history; structural references checked, historical version comparisons skipped.");
console.log(fails ? "\n"+fails+" FAILURES" : "\nALL CACHE-KEY TESTS PASSED");
process.exit(fails ? 1 : 0);
