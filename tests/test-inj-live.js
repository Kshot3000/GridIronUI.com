/* Unit tests for js/inj-live.js — the injury board's live-refresh helpers.
   Verifies: statusKey normalization (case/whitespace), sevRank mapping
   mirroring injuries.js (Out/IR/IL=3, Doubtful=2, Questionable/Day-To-Day=1,
   everything else=0), snapshot builds a key->status map from processed team
   rows, diffStatuses flags only genuine changes (new/downgraded/upgraded/
   updated), never flags the first load, never flags removals, and badgeHtml
   renders the honest per-kind badge (XSS-safe static strings, empty for
   unknown kinds). Also pins the shipped injuries.html wiring (inj-live.js
   loaded before injuries.js, both cache keys >= v1.127.0, liveStatus pill +
   pause button present). */
"use strict";
var fs = require("fs"), path = require("path");
var IL = require("../js/inj-live.js");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* --- statusKey --- */
assert(IL.statusKey("Kansas City Chiefs", "Patrick Mahomes") === "kansas city chiefs | patrick mahomes",
       "statusKey lowercases and joins team + athlete");
assert(IL.statusKey("  Chiefs ", "  Mahomes\tJr ") === IL.statusKey("chiefs", "mahomes jr"),
       "statusKey is whitespace-insensitive");

/* --- sevRank mirrors injuries.js --- */
assert(IL.sevRank("Out") === 3, "Out ranks 3");
assert(IL.sevRank("Injured Reserve") === 3, "Injured Reserve ranks 3");
assert(IL.sevRank("15-Day-IL") === 3, "15-Day-IL ranks 3");
assert(IL.sevRank("Doubtful") === 3 - 1, "Doubtful ranks 2");
assert(IL.sevRank("Questionable") === 1, "Questionable ranks 1");
assert(IL.sevRank("Day-To-Day") === 1, "Day-To-Day ranks 1");
assert(IL.sevRank("Suspension") === 0, "Suspension ranks 0");
assert(IL.sevRank("Bereavement") === 0, "Bereavement ranks 0");
assert(IL.sevRank("") === 0, "empty status ranks 0");
assert(IL.sevRank(null) === 0, "null status ranks 0");

/* --- fixtures --- */
function team(name, rows){
  return { displayName: name, injuries: rows.map(function(r){
    return { status: r[1], athlete: { displayName: r[0] }, date: "2026-10-01" };
  })};
}
var T1 = [team("Chiefs", [["Patrick Mahomes","Questionable"],["Travis Kelce","Out"]]),
          team("Bills",  [["Josh Allen","Doubtful"]])];

/* --- snapshot --- */
var snap = IL.snapshot(T1);
assert(Object.keys(snap).length === 3, "snapshot holds all three players");
assert(snap[IL.statusKey("Chiefs","Patrick Mahomes")].status === "Questionable",
       "snapshot records the status string");
assert(snap[IL.statusKey("Chiefs","Travis Kelce")].rank === 3, "snapshot records the rank");
assert(IL.snapshot(null) !== null && Object.keys(IL.snapshot(null)).length === 0,
       "snapshot tolerates null");
assert(IL.snapshot([{displayName:"X"}]) !== null, "snapshot tolerates teams with no injuries");

/* --- diffStatuses: first load is baseline-only --- */
var d0 = IL.diffStatuses(null, T1);
assert(Object.keys(d0.changed).length === 0, "first load flags nothing (baseline only)");
assert(Object.keys(d0.next).length === 3, "first load still builds the baseline snapshot");

/* --- diffStatuses: genuine changes --- */
var T2 = [team("Chiefs", [["Patrick Mahomes","Out"],        /* 1 -> 3: downgraded */
                          ["Travis Kelce","Questionable"],  /* 3 -> 1: upgraded */
                          ["Isiah Pacheco","Questionable"]]),/* new player: new */
          team("Bills",  [["Josh Allen","Doubtful (ankle)"]])]; /* 2 -> 2: updated */
var d1 = IL.diffStatuses(snap, T2);
assert(d1.changed[IL.statusKey("Chiefs","Patrick Mahomes")] === "downgraded",
       "Questionable -> Out flags downgraded");
assert(d1.changed[IL.statusKey("Chiefs","Travis Kelce")] === "upgraded",
       "Out -> Questionable flags upgraded");
assert(d1.changed[IL.statusKey("Chiefs","Isiah Pacheco")] === "new",
       "newly listed player flags new");
assert(d1.changed[IL.statusKey("Bills","Josh Allen")] === "updated",
       "same-rank wording change flags updated");
assert(Object.keys(d1.changed).length === 4, "only genuine changes flagged, got "+Object.keys(d1.changed).length);

/* identical re-pull: nothing flagged */
var d2 = IL.diffStatuses(d1.next, T2);
assert(Object.keys(d2.changed).length === 0, "identical re-pull flags nothing");

/* removed player: not flagged */
var d3 = IL.diffStatuses(snap, [team("Chiefs", [["Patrick Mahomes","Questionable"]])]);
assert(d3.changed[IL.statusKey("Chiefs","Travis Kelce")] === undefined,
       "player removed from the report is not flagged");
assert(d3.changed[IL.statusKey("Bills","Josh Allen")] === undefined,
       "player from a dropped team is not flagged");

/* --- badgeHtml --- */
var bNew = IL.badgeHtml("new"), bDown = IL.badgeHtml("downgraded"),
    bUp = IL.badgeHtml("upgraded"), bUpd = IL.badgeHtml("updated");
assert(bNew.indexOf('class="tag blue"') !== -1 && bNew.indexOf(">new<") !== -1,
       "new badge is a blue tag");
assert(bDown.indexOf('class="tag red"') !== -1 && bDown.indexOf(">downgraded<") !== -1,
       "downgraded badge is a red tag");
assert(bUp.indexOf('class="tag green"') !== -1 && bUp.indexOf(">upgraded<") !== -1,
       "upgraded badge is a green tag");
assert(bUpd.indexOf('class="tag"') !== -1 && bUpd.indexOf(">updated<") !== -1,
       "updated badge is a plain tag");
[bNew, bDown, bUp, bUpd].forEach(function(b, i){
  assert(b.indexOf("<script") === -1 && b.indexOf("onerror") === -1,
         "badge "+i+" carries no executable markup");
  assert(b.indexOf("since your last check") !== -1,
         "badge "+i+" honestly says it means since the last check");
});
assert(bDown.indexOf("shifts lines") !== -1, "downgrade badge says why it matters");
assert(IL.badgeHtml("bogus") === "", "unknown kind renders nothing");
assert(IL.badgeHtml(null) === "", "null kind renders nothing");

/* --- shipped wiring pins --- */
var html = fs.readFileSync(path.join(ROOT, "injuries.html"), "utf8");
var liveIdx = html.indexOf('js/inj-live.js?v='), injIdx = html.indexOf('js/injuries.js?v=');
assert(liveIdx !== -1, "injuries.html includes js/inj-live.js with a cache key");
assert(injIdx !== -1, "injuries.html includes js/injuries.js with a cache key");
assert(liveIdx < injIdx, "inj-live.js loads before injuries.js");
function keyAt(idx){
  var m = html.slice(idx, idx + 40).match(/\?v=(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}
function ge(a, b){ var x=a.split("."), y=b.split("."); for(var i=0;i<3;i++){ if(+x[i]!==+y[i]) return +x[i]>+y[i]; } return true; }
assert(ge(keyAt(liveIdx), "1.127.0"), "inj-live.js key >= v1.127.0, got "+keyAt(liveIdx));
assert(ge(keyAt(injIdx), "1.127.0"), "injuries.js key >= v1.127.0, got "+keyAt(injIdx));
assert(html.indexOf('id="liveStatus"') !== -1, "injuries.html has the liveStatus pill");
assert(html.indexOf('id="pauseBtn"') !== -1, "injuries.html has the pause button");
assert(html.indexOf('role="status"') !== -1, "liveStatus pill carries role=status");

if(failures){ console.error(failures+" FAILURES"); process.exit(1); }
console.log("ALL INJ-LIVE TESTS PASS");
