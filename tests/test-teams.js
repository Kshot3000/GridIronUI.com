/* Unit tests for the team-directory identity helpers in js/team-brand.js
   (teamFind / vsHeader / teamHead) over a fake directory snapshot. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond){ if(!cond){ failures++; console.error("FAIL", name); } else console.log("ok  ", name); }

var sandbox = {
  window: {},
  GIU: { esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); } }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
var G = sandbox.GIU;

var DIR = { nfl: [
  {abbr:"KC", displayName:"Kansas City Chiefs", shortDisplayName:"Chiefs", color:"e31837", logo:"https://x/kc.png"},
  {abbr:"BUF", displayName:"Buffalo Bills", shortDisplayName:"Bills", color:"00338d", logo:"https://x/buf.png"}
], epl: [
  {abbr:"ARS", displayName:"Arsenal", shortDisplayName:"Arsenal", color:"ef0107", logo:"https://x/ars.png"},
  {abbr:"BHA", displayName:"Brighton & Hove Albion", shortDisplayName:"Brighton", color:"0057b8", logo:"https://x/bha.png"}
] };

ok("teamFind: abbreviation match", G.teamFind(DIR, "nfl", "KC").displayName === "Kansas City Chiefs");
ok("teamFind: abbr case-insensitive", G.teamFind(DIR, "nfl", "buf").abbr === "BUF");
ok("teamFind: displayName match", G.teamFind(DIR, "nfl", "Buffalo Bills").abbr === "BUF");
ok("teamFind: shortDisplayName match", G.teamFind(DIR, "nfl", "Chiefs").abbr === "KC");
ok("teamFind: EPL 'Arsenal FC' normalizes to Arsenal", G.teamFind(DIR, "epl", "Arsenal FC").abbr === "ARS");
ok("teamFind: EPL 'Brighton & Hove Albion FC' normalizes", G.teamFind(DIR, "epl", "Brighton & Hove Albion FC").abbr === "BHA");
ok("teamFind: unknown team -> null", G.teamFind(DIR, "nfl", "Springfield Atoms") === null);
ok("teamFind: unknown league -> null", G.teamFind(DIR, "cfb", "KC") === null);
ok("teamFind: empty dir -> null", G.teamFind({}, "nfl", "KC") === null);
ok("teamFind: blank query -> null", G.teamFind(DIR, "nfl", "   ") === null);

var vh = G.vsHeader(DIR, "nfl", "Chiefs", "Bills");
ok("vsHeader: both chips present", vh.indexOf("KC") !== -1 && vh.indexOf("BUF") !== -1);
ok("vsHeader: real colors inlined", vh.indexOf("#e31837") !== -1 && vh.indexOf("#00338d") !== -1);
ok("vsHeader: logos present", vh.indexOf("https://x/kc.png") !== -1 && vh.indexOf("https://x/buf.png") !== -1);
ok("vsHeader: vs divider present", vh.indexOf("vs-x") !== -1);

var vhNone = G.vsHeader(DIR, "nfl", "Springfield Atoms", "Shelbyville Sharks");
ok("vsHeader: no matches -> empty string (caller keeps plain title)", vhNone === "");

var vhOne = G.vsHeader(DIR, "nfl", "Chiefs", "Springfield Atoms");
ok("vsHeader: one match still renders", vhOne.indexOf("KC") !== -1 && vhOne.indexOf("Springfield Atoms") !== -1);
ok("vsHeader: unmatched side has no empty chip", vhOne.indexOf('<span class="abbr"></span>') === -1);

var vhXss = G.vsHeader(DIR, "nfl", "Chiefs", "<script>alert(1)</script>");
ok("vsHeader: unmatched raw name is escaped", vhXss.indexOf("<script>") === -1 && vhXss.indexOf("&lt;script&gt;") !== -1);

var th = G.teamHead(DIR, "nfl", "Arizona Cardinals", "Arizona Cardinals");
ok("teamHead: no dir match -> plain h3 fallback", th === "<h3>Arizona Cardinals</h3>");
var th2 = G.teamHead(DIR, "nfl", "KC", "whatever");
ok("teamHead: match renders identity", th2.indexOf("KC") !== -1 && th2.indexOf("Kansas City Chiefs") !== -1);

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all team-directory identity tests passed");
