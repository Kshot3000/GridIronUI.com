/* Unit tests for the MLB ballpark dataset (js/wx-shared.js): 30 verified
   ballparks, coordinate sanity, roof-status enum, ballparkFor and the
   ESPN-venue cross-check in ballparkVenueFor. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond){ if(!cond){ failures++; console.error("FAIL", name); } else console.log("ok  ", name); }

var sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
var W = require(path.join(ROOT, "js/wx-shared.js"));

ok("ballparks exported on module + GIU", Array.isArray(W.ballparks) &&
  Array.isArray(sandbox.window.GIU.wxBallparks));
ok("ballparkFor / ballparkVenueFor exported", typeof W.ballparkFor === "function" &&
  typeof W.ballparkVenueFor === "function" &&
  typeof sandbox.window.GIU.wxBallparkFor === "function" &&
  typeof sandbox.window.GIU.wxBallparkVenueFor === "function");

var BP = W.ballparks;
ok("30 ballparks", BP.length === 30);
ok("shape: [abbr, name, city, lat, lon, roof]",
  BP.every(function(r){ return r.length === 6 && typeof r[0] === "string" &&
    typeof r[1] === "string" && typeof r[2] === "string" &&
    typeof r[3] === "number" && typeof r[4] === "number" && typeof r[5] === "string"; }));
ok("unique abbreviations", new Set(BP.map(function(r){ return r[0]; })).size === 30);
ok("lat/lon in sane North-America ranges",
  BP.every(function(r){ return r[3] > 24 && r[3] < 50 && r[4] > -130 && r[4] < -70; }));
ok("roof in {open, retractable, dome}",
  BP.every(function(r){ return ["open","retractable","dome"].indexOf(r[5]) !== -1; }));
ok("7 retractable roofs", BP.filter(function(r){ return r[5] === "retractable"; }).length === 7);
ok("1 fixed dome (Tropicana)", BP.filter(function(r){ return r[5] === "dome"; }).length === 1 &&
  W.ballparkFor("TB")[1] === "Tropicana Field");

/* Spot pins on verified rows (geocoded Sept 2026). */
function row(abbr){ return W.ballparkFor(abbr); }
ok("NYY -> Yankee Stadium", row("NYY")[1] === "Yankee Stadium" && row("NYY")[5] === "open");
ok("CHW -> Rate Field (not Guaranteed Rate)", row("CHW")[1] === "Rate Field");
ok("ATH -> Sutter Health Park, West Sacramento", row("ATH")[1] === "Sutter Health Park" &&
  row("ATH")[2].indexOf("Sacramento") !== -1);
ok("HOU -> Daikin Park retractable", row("HOU")[1] === "Daikin Park" && row("HOU")[5] === "retractable");
ok("WSH abbr (ESPN uses WSH)", !!row("WSH") && !row("WAS"));
ok("unknown abbr -> null", row("ZZZ") === null);

/* ballparkVenueFor: ESPN venue cross-check. */
function mkEv(venueName, homeAbbr){
  return {competitions: [{venue: {fullName: venueName},
    competitors: [{homeAway:"home", team:{abbreviation: homeAbbr}}]}]};
}
ok("ESPN venue names the listed park -> that park",
  W.ballparkVenueFor(mkEv("Yankee Stadium", "NYY"), "NYY")[1] === "Yankee Stadium");
ok("relocated game: ESPN venue names a different park -> the real park, not the home team's",
  W.ballparkVenueFor(mkEv("Petco Park", "NYY"), "NYY")[1] === "Petco Park");
ok("unrecognized ESPN venue -> falls back to home team's park",
  W.ballparkVenueFor(mkEv("Some Spring Training Complex", "BOS"), "BOS")[1] === "Fenway Park");
ok("missing venue -> falls back to home team's park",
  W.ballparkVenueFor({competitions: [{}]}, "CHC")[1] === "Wrigley Field");
ok("unknown home abbr + unknown venue -> null (no invented park)",
  W.ballparkVenueFor({competitions: [{}]}, "ZZZ") === null);
ok("case-insensitive venue match", W.ballparkVenueFor(mkEv("daikin park", "HOU"), "HOU")[1] === "Daikin Park");

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL BALLPARK TESTS PASS");
process.exit(failures ? 1 : 0);
