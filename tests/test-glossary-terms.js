/* GridIronUI glossary vocabulary-drift guard.
   The glossary promises "Every term you'll meet at the sportsbook, defined in
   plain English." It went stale once (2026-09-29): the site shipped a full
   prediction-markets section (Kalshi + Polymarket tabs on markets.html,
   "two crowds" Kalshi rows on predictions.html, a Polymarket-vs-Kalshi
   disagreement card) plus cash-out and dutching calculators on tools.html —
   yet none of Kalshi, Polymarket, prediction market, cash out, or dutching
   were defined anywhere on the site. This test fails loudly if a new term the
   site itself leans on has no glossary entry, and if the TERMS list ever
   drifts out of alphabetical order. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }

const html = fs.readFileSync(path.join(ROOT, "glossary.html"), "utf8");

/* Pull the inline TERMS array out of the page and evaluate it in isolation. */
const m = html.match(/var TERMS = (\[[\s\S]*?\]);\s*\(function/);
ok("glossary.html exposes a TERMS array", !!m);
const TERMS = m ? (new Function("return " + m[1]))() : [];
ok("TERMS parses to a non-empty array", Array.isArray(TERMS) && TERMS.length > 0);

const names = TERMS.map(function(t){ return String(t[0]); });
function has(term){
  return names.some(function(n){ return n.toLowerCase() === term.toLowerCase(); });
}

/* Core vocabulary the site itself teaches — must all be defined. */
["Kalshi", "Polymarket", "Prediction market", "Cash out", "Dutching",
 "Closing line value (CLV)", "Arbitrage", "Hedge", "Middle", "Teaser"
].forEach(function(t){
  ok("glossary defines \"" + t + "\"", has(t));
});

/* Every entry has a real definition — no stubs. "See X" cross-references
   are the house style for aliases, so they count. */
TERMS.forEach(function(t){
  const def = typeof t[1] === "string" ? t[1].trim() : "";
  ok("\"" + t[0] + "\" has a non-trivial definition",
    /^See [A-Z]/.test(def) || def.length >= 20);
});

/* The list renders alphabetically; keep it sorted so new terms land right. */
function key(s){ return s.toLowerCase().replace(/^[^a-z0-9]+/, ""); }
for(let i = 1; i < names.length; i++){
  ok("TERMS sorted: \"" + names[i-1] + "\" before \"" + names[i] + "\"",
    key(names[i-1]) <= key(names[i]));
}

console.log("test-glossary-terms: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
