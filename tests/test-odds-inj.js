/* Verifies js/odds-inj.js — the pure logic behind the injury-report badges
   on NFL odds-board game cards. Run: node tests/test-odds-inj.js */
"use strict";
var INJ = require("../js/odds-inj.js");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---- severity ranking (mirrors the injuries page) ---- */
assert(INJ.sevRank("Out") === 3, "Out is rank 3");
assert(INJ.sevRank("Injured Reserve") === 3, "Injured Reserve is rank 3");
assert(INJ.sevRank("15-Day-IL") === 3, "IL forms are rank 3");
assert(INJ.sevRank("Doubtful") === 2, "Doubtful is rank 2");
assert(INJ.sevRank("Questionable") === 1, "Questionable is rank 1");
assert(INJ.sevRank("Day-To-Day") === 1, "Day-To-Day is rank 1");
assert(INJ.sevRank("Active") === 0, "Active is ignorable");
assert(INJ.sevRank("Suspension") === 0, "Suspension is not an injury");
assert(INJ.sevRank("Bereavement") === 0, "Bereavement is not an injury");
assert(INJ.sevRank("") === 0, "blank status is ignorable");
assert(INJ.sevRank(null) === 0, "null status is ignorable");

/* ---- counts ---- */
function mk(s){ return {status: s}; }
var c = INJ.countsFor([mk("Out"), mk("Out"), mk("Doubtful"), mk("Questionable"),
                       mk("Active"), mk("Suspension"), mk("Day-To-Day")]);
assert(c.out === 2 && c.doubtful === 1 && c.questionable === 2,
       "counts by severity, non-injuries dropped: "+JSON.stringify(c));
assert(INJ.countsFor([]).out === 0, "empty list counts zero");
assert(INJ.countsFor([mk("Active")]).out === 0, "all-healthy roster counts zero");

/* ---- payload indexing ---- */
var payload = {injuries:[
  {displayName:"Chicago Bears", injuries:[mk("Out")]},
  {displayName:"Green Bay Packers", injuries:[]},
  {displayName:"No Name"}  /* malformed entry: no crash, no key */
]};
var idx = INJ.indexByName(payload);
assert(idx["chicago bears"] && idx["chicago bears"].injuries.length === 1,
       "index by lowercase display name");
assert(idx["green bay packers"], "team with zero injuries still indexed");
assert(INJ.indexByName({}).constructor === Object && Object.keys(INJ.indexByName({})).length === 0,
       "empty payload indexes to empty object");
assert(Object.keys(INJ.indexByName(null)).length === 0, "null payload indexes clean");

/* ---- cardLine ---- */
var dir = {abbr:"CHI", displayName:"Chicago Bears"};
var line = INJ.cardLine(dir, {displayName:"Chicago Bears",
  injuries:[mk("Out"), mk("Out"), mk("Doubtful"), mk("Questionable"), mk("Active")]});
assert(line && line.abbr === "CHI" && line.text === "2 out, 1 doubtful, 1 questionable",
       "card line orders severities, drops non-injuries: "+(line&&line.text));
assert(INJ.cardLine(dir, {displayName:"Chicago Bears", injuries:[mk("Active")]}) === null,
       "all-healthy team yields no line (stays silent)");
assert(INJ.cardLine(null, {injuries:[mk("Out")]}) === null, "no dir team -> null");
assert(INJ.cardLine(dir, null) === null, "no ESPN team -> null");
var qOnly = INJ.cardLine({abbr:"GB", displayName:"Green Bay Packers"},
                         {injuries:[mk("Questionable")]});
assert(qOnly && qOnly.text === "1 questionable", "singular phrasing: "+(qOnly&&qOnly.text));

/* ---- badgeHtml ---- */
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
var html = INJ.badgeHtml({abbr:"CHI", text:"2 out"}, {abbr:"GB", text:"1 questionable"}, esc);
assert(html.indexOf("<b>CHI</b> 2 out") !== -1 && html.indexOf("<b>GB</b> 1 questionable") !== -1,
       "badge names both sides' injuries: "+html.slice(0,140));
assert(html.indexOf("injuries.html") !== -1, "badge links the injury wire");
assert(INJ.badgeHtml(null, {abbr:"GB", text:"1 out"}, esc).indexOf("CHI") === -1,
       "one quiet side renders the other alone");
assert(INJ.badgeHtml(null, null, esc) === "", "both sides quiet -> no badge HTML");
var evil = INJ.badgeHtml({abbr:"<img src=x>", text:"1 out"}, null, esc);
assert(evil.indexOf("<img") === -1 && evil.indexOf("&lt;img") !== -1,
       "badge HTML escapes hostile team abbreviations");

if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
console.log("ALL GREEN");
