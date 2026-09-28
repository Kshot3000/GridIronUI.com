/* GridIronUI tools label/layout regression test (v1.58.0).
   Visual QA caught the ticket-hedge planner's "Ticket pays in full ($), stake
   included" label overflowing its form-row column and clipping over the
   adjacent Format select on desktop. Fix: shorten the label (the card's hint
   already says stake-included, so nothing is lost) and guard .form-row tracks
   with minmax(0,1fr) so fields can shrink and long labels wrap in-column. */
"use strict";
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../tools.html", "utf8");
const css = fs.readFileSync(__dirname + "/../css/style.css", "utf8");
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log("FAIL:", name); } }

var m = html.match(/<div class="card calc" id="tickethedge">([\s\S]*?)<div class="card calc" id="cashout">/);
ok("tickethedge card found", !!m);
var card = m ? m[1] : "";
ok("pays label is the short form that fits its column",
  card.indexOf("<label>Ticket pays in full ($)</label>") !== -1);
ok("overflowing long label is gone",
  card.indexOf("Ticket pays in full ($), stake included</label>") === -1);
ok("stake-included meaning preserved in the card hint",
  /pays <em>in full<\/em> \(stake included\)/.test(card));
ok("form-row tracks allow shrinking so labels wrap in-column",
  /\.form-row\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/.test(css));

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("tools-labels: " + pass + " assertions passed");
