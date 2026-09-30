/* GridIronUI cross-book-edge snapshot-age test — the "Where the two markets
   disagree" card compares a LIVE Polymarket price against a FROZEN Kalshi
   snapshot price. A 4c "edge" against a 2h-old frozen number may be nothing,
   so this guards that the shipped js/markets.js disagree card (v1.94.0; card
   extended to the MLB tab this release with a league-aware signature):
   - derives the snapshot age from snap.updated_at (not a hardcoded string),
   - names that age in the card note ("snapshot, refreshed 2h ago"),
   - calls the Kalshi side what it is: frozen at the snapshot time,
   - labels the two figures per row ("Polymarket · live" / "Kalshi · snapshot")
     and gives the frozen one a title tooltip naming the snapshot age.
   Pure-string guards over the shipped source, mirroring test-odds-honesty.js. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }

const src = fs.readFileSync(path.join(ROOT, "js", "markets.js"), "utf8");
/* isolate disagreeCard (function declaration through its closing before the next comment block) */
const card = (src.match(/function disagreeCard\(games, snap, dir[\s\S]*?\n\}\n/) || [""])[0];
ok("disagreeCard exists in shipped markets.js", card.length > 0);
ok("snapshot age comes from snap.updated_at",
  card.indexOf("agoShort(snap.updated_at)") !== -1);
ok("card note names the snapshot age",
  card.indexOf("Kalshi (snapshot, '+snapAgeTxt+'") !== -1);
ok("age falls back to 'rebuilt regularly' when unparseable",
  card.indexOf('"rebuilt regularly"') !== -1);
ok("note says Kalshi's numbers are frozen at the snapshot time",
  card.indexOf("are frozen at the snapshot time") !== -1);
ok("Polymarket figure labeled live",
  card.indexOf("Polymarket · live") !== -1);
ok("Kalshi figure labeled snapshot",
  card.indexOf("Kalshi · snapshot") !== -1);
ok("Kalshi figure carries a tooltip naming the snapshot age",
  card.indexOf("kalshiTip") !== -1 && card.indexOf("server-side snapshot") !== -1);
ok("tooltip warns to confirm the live price",
  card.indexOf("confirm the live price before you bet") !== -1);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
