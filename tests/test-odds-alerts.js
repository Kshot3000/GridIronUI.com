/* Line-move alert candidate computation (OL.moveAlerts / OL.alertBaseline).
   Run: node tests/test-odds-alerts.js */
"use strict";
var L = require("../js/odds-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ")"); }

function o(name, price, point){
  var r = { name: name, price: price };
  if(point !== undefined) r.point = point;
  return r;
}
/* event with movable spread (away pt) and total (over pt) */
function ev(id, awayPt, totalPt, startOffsetMs){
  return { id: id, home_team: "Green Bay Packers", away_team: "Chicago Bears",
    commence_time: new Date(Date.now() + (startOffsetMs === undefined ? 2*864e5 : startOffsetMs)).toISOString(),
    bookmakers: [
      { key: "draftkings", title: "DraftKings", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", 1.91, awayPt), o("Green Bay Packers", 1.91, -awayPt) ]},
        { key: "totals", outcomes: [ o("Over", 1.91, totalPt), o("Under", 1.91, totalPt) ]} ]},
      { key: "fanduel", title: "FanDuel", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", 1.91, awayPt), o("Green Bay Packers", 1.91, -awayPt) ]},
        { key: "totals", outcomes: [ o("Over", 1.91, totalPt), o("Under", 1.91, totalPt) ]} ]}
    ]};
}
var base = { "g1": { sp: -3, tot: 44.5 }, "g2": { sp: -3, tot: 44.5 } };

/* threshold gating */
var hits = L.moveAlerts([ev("g1", -4.5, 44.5)], base, 1, Date.now());
eq(hits.length, 1, "1.5-pt spread move fires at 1-pt threshold");
eq(hits[0].kind, "spread", "fired record names the spread");
eq(hits[0].delta, -1.5, "delta is new minus baseline (-1.5)");
eq(hits[0].from, -3, "from is the baseline");
eq(hits[0].to, -4.5, "to is the new consensus");
eq(hits[0].anchor, "game-g1", "anchor id matches game-card convention");
eq(hits[0].title, "Chicago Bears @ Green Bay Packers", "title is away @ home");

hits = L.moveAlerts([ev("g1", -4.5, 44.5)], base, 2, Date.now());
eq(hits.length, 0, "1.5-pt spread move is silent at 2-pt threshold");

hits = L.moveAlerts([ev("g1", -3, 46)], base, 1, Date.now());
eq(hits.length, 1, "1.5-pt total move fires at 1-pt threshold");
eq(hits[0].kind, "total", "fired record names the total");

hits = L.moveAlerts([ev("g1", -4, 46)], base, 1, Date.now());
eq(hits.length, 2, "spread and total crossing together both fire");

/* sub-threshold noise stays quiet */
hits = L.moveAlerts([ev("g1", -3.4, 44.5)], base, 1, Date.now());
eq(hits.length, 0, "0.4-pt move stays quiet at 1-pt threshold");

/* no baseline = first look, nothing moved */
hits = L.moveAlerts([ev("g9", -7, 50)], base, 1, Date.now());
eq(hits.length, 0, "game with no baseline never fires");

/* started games are skipped */
hits = L.moveAlerts([ev("g1", -7, 50, -3600e3)], base, 1, Date.now());
eq(hits.length, 0, "game already started never fires");

/* alerts off */
hits = L.moveAlerts([ev("g1", -7, 50)], base, 0, Date.now());
eq(hits.length, 0, "threshold 0 (off) never fires");
hits = L.moveAlerts([ev("g1", -7, 50)], base, null, Date.now());
eq(hits.length, 0, "null threshold never fires");

/* baseline builder */
var b = L.alertBaseline([ev("g1", -3, 44.5), ev("g2", -6, 41)]);
eq(b["g1"].sp, -3, "alertBaseline captures away spread consensus");
eq(b["g1"].tot, 44.5, "alertBaseline captures total consensus");
eq(b["g2"].sp, -6, "alertBaseline covers every event");
var fresh = L.alertBaseline([ev("g1", -4, 44.5)]);
var refire = L.moveAlerts([ev("g1", -4, 44.5)], fresh, 1, Date.now());
eq(refire.length, 0, "re-baselined pull never re-fires the same move");

/* hostile / sparse inputs */
hits = L.moveAlerts(null, base, 1, Date.now());
eq(hits.length, 0, "null events list is safe");
hits = L.moveAlerts([{ id: "gx" }], { gx: { sp: null, tot: null } }, 1, Date.now());
eq(hits.length, 0, "missing consensus stays silent, never invents a point");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("ALL GREEN");
