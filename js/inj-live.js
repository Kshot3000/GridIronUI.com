/* GridIronUI Injuries — live refresh helpers (pure logic, no DOM).
   The injury board auto-refreshes every 3 minutes like the news wire; this
   module holds the pieces that stay testable outside the DOM: snapshotting
   the board's player statuses and diffing a fresh payload against the last
   one, so rows that are NEW or whose designation CHANGED get an honest
   "since your last check" badge. Designation moves are what shift lines, so
   the badge also says which way the news went: "downgraded" (rank got worse,
   e.g. Questionable -> Out), "upgraded" (rank improved), "updated" (status
   text changed but severity rank didn't), "new" (first appearance).
   Severity ranking mirrors js/injuries.js's sevRank (verified live
   2026-09-29: NFL Out / Injured Reserve / Doubtful / Questionable, NBA
   "Day-To-Day", MLB/NHL IL forms), duplicated here so this module stays pure.
   Browser: window.InjLive · node: module.exports */
(function(){
"use strict";

function norm(s){ return String(s == null ? "" : s).trim().replace(/\s+/g, " "); }

/* Stable per-player key: team + athlete name, case/whitespace-insensitive.
   ESPN display names are stable enough within a league's injury feed. */
function statusKey(team, athlete){
  return norm(team).toLowerCase() + " | " + norm(athlete).toLowerCase();
}

function sevRank(s){
  s = String(s || "");
  if(/out|injured reserve|\bil\b|injured list/i.test(s)) return 3;
  if(/doubtful/i.test(s)) return 2;
  if(/questionable|day[- ]to[- ]day/i.test(s)) return 1;
  return 0;
}

/* Build key -> {status, rank} from processed team rows. The caller drops
   healthy "Active" entries before handing data over (mirrors injuries.js's
   load()), so everything here is a real designation or other absence. */
function snapshot(teams){
  var m = {};
  (teams || []).forEach(function(t){
    var team = t.displayName || t.name || "";
    (t.injuries || []).forEach(function(i){
      var nm = ((i.athlete || {}).displayName) || "Unknown";
      m[statusKey(team, nm)] = { status: String(i.status || ""), rank: sevRank(i.status) };
    });
  });
  return m;
}

/* Diff a fresh payload against the previous snapshot.
   Returns {changed: {key: kind}, next: snapshot}. A null/undefined prev is
   the first load — baseline only, never a wall of badges. Players who left
   the report are not flagged (nothing for the bettor to act on). */
function diffStatuses(prev, teams){
  var next = snapshot(teams), changed = {};
  if(prev){
    Object.keys(next).forEach(function(k){
      var n = next[k], p = prev[k];
      if(!p){ changed[k] = "new"; return; }
      if(p.status !== n.status){
        changed[k] = n.rank > p.rank ? "downgraded"
                   : (n.rank < p.rank ? "upgraded" : "updated");
      }
    });
  }
  return { changed: changed, next: next };
}

/* Badge copy is honest about what it means: "since your last check", and for
   downgrades the reason it matters (designation moves shift lines). Static
   strings — no user input involved, XSS-safe by construction. */
var BADGES = {
  "new":        '<span class="tag blue" title="First appeared in the injury report since your last check">new</span>',
  "downgraded": '<span class="tag red" title="Designation got worse since your last check — this is the kind of move that shifts lines">downgraded</span>',
  "upgraded":   '<span class="tag green" title="Designation improved since your last check">upgraded</span>',
  "updated":    '<span class="tag" title="Designation wording changed since your last check">updated</span>'
};
function badgeHtml(kind){
  return BADGES[kind] || "";
}

var api = { statusKey: statusKey, sevRank: sevRank, snapshot: snapshot,
            diffStatuses: diffStatuses, badgeHtml: badgeHtml };
if(typeof module !== "undefined" && module.exports){ module.exports = api; }
else if(typeof window !== "undefined"){ window.InjLive = api; }
})();
