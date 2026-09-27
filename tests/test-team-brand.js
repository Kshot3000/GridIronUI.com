/* Unit tests for js/team-brand.js — real ESPN team identity helpers.
   Verifies hex validation, graceful fallbacks, and chip/logo HTML. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond){ if(!cond){ failures++; console.error("FAIL", name); } else console.log("ok  ", name); }

var sandbox = {
  window: {},
  GIU: { esc: function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); } }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-brand.js"), "utf8"), sandbox);
var G = sandbox.GIU;

ok("teamColor: valid 6-hex accepted", G.teamColor({color:"00338d"}) === "00338d");
ok("teamColor: leading # stripped", G.teamColor({color:"#00338d"}) === "00338d");
ok("teamColor: garbage rejected", G.teamColor({color:"xyz"}) === null);
ok("teamColor: missing rejected", G.teamColor({}) === null && G.teamColor(null) === null);

var chip = G.teamChip({color:"00338d"}, "BUF");
ok("teamChip: real color inlined", chip.indexOf("#00338d") !== -1 && chip.indexOf("BUF") !== -1);
var chipDark = G.teamChip({color:"000000"}, "BLK");
ok("teamChip: dark bg gets white text", chipDark.indexOf("color:#ffffff") !== -1);
var chipLight = G.teamChip({color:"ffffff"}, "WHT");
ok("teamChip: light bg gets dark text", chipLight.indexOf("color:#10141c") !== -1);
var chipNone = G.teamChip({}, "XYZ");
ok("teamChip: no color falls back to neutral chip", chipNone === '<span class="abbr">XYZ</span>');

var logo = G.teamLogo({logo:"https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/buf.png"});
ok("teamLogo: img emitted with lazy load + error hide",
  logo.indexOf("<img") !== -1 && logo.indexOf('loading="lazy"') !== -1 &&
  logo.indexOf("onerror") !== -1 && logo.indexOf("buf.png") !== -1);
ok("teamLogo: missing logo yields empty string", G.teamLogo({}) === "");

var row = G.teamRow({team:{abbreviation:"BUF", displayName:"Buffalo Bills", color:"00338d",
  logo:"https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/buf.png"}, score:"21"}, true);
ok("teamRow: logo + chip + name + gold winner score",
  row.indexOf("team-logo") !== -1 && row.indexOf("Buffalo Bills") !== -1 &&
  row.indexOf("color:var(--gold)") !== -1 && row.indexOf(">21<") !== -1);
var rowPre = G.teamRow({team:{abbreviation:"KC", displayName:"Kansas City Chiefs"}, score:null}, false);
ok("teamRow: null score renders dash, neutral chip when no color",
  rowPre.indexOf(">–<") !== -1 && rowPre.indexOf('class="abbr"') !== -1);

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL TEAM-BRAND TESTS PASS");
process.exit(failures ? 1 : 0);
