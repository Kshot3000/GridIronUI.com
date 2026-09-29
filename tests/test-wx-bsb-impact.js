/* Unit tests for the baseball weather impact model (js/wx-shared.js).
   Baseball copy differs from the football model on purpose: wind direction
   decides (we don't model ballpark orientation, so the note says to check
   it), and rain is a delay/postponement risk — a PPD voids most bets. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond){ if(!cond){ failures++; console.error("FAIL", name); } else console.log("ok  ", name); }

var sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
var W = require(path.join(ROOT, "js/wx-shared.js"));

ok("impactNotesBsb exported on module + GIU", typeof W.impactNotesBsb === "function" &&
  typeof sandbox.window.GIU.wxImpactNotesBsb === "function");
ok("impactBsb exported on module + GIU", typeof W.impactBsb === "function" &&
  typeof sandbox.window.GIU.wxImpactBsb === "function");

var calm = [{temp:68, precip:5, wind:6, gust:9, wdir:"SW"}];
ok("calm window -> No major concerns", W.impactBsb(calm).indexOf("No major concerns") !== -1);
ok("calm window -> empty notes array", W.impactNotesBsb(calm).length === 0);

var windy = [{temp:62, precip:5, wind:22, gust:28, wdir:"N"}];
var wn = W.impactBsb(windy);
ok("wind 22 -> direction-decides note (no football 'Under lean' copy)",
  wn.indexOf("direction decides") !== -1 && wn.indexOf("Under lean") === -1);
ok("wind 22 -> HR framing present", wn.indexOf("boosts HR") !== -1 && wn.indexOf("suppresses") !== -1);

var breezy = [{temp:70, precip:5, wind:15, gust:20, wdir:"E"}];
ok("wind 15 -> check-direction note, not the 20mph tier",
  W.impactBsb(breezy).indexOf("check direction vs. the outfield") !== -1);

var gusty = [{temp:65, precip:0, wind:10, gust:32, wdir:"W"}];
ok("gust 32 with calm sustained -> fly-ball note, no wind tier",
  W.impactBsb(gusty).indexOf("fly balls get interesting") !== -1 &&
  W.impactBsb(gusty).indexOf("direction decides") === -1);

var rainy = [{temp:58, precip:70, wind:8, gust:12, wdir:"SE"}];
var rn = W.impactBsb(rainy);
ok("rain 70 -> delay/postponement risk with PPD-voids copy",
  rn.indexOf("delay/postponement risk") !== -1 && rn.indexOf("PPD voids most bets") !== -1);
ok("rain 70 -> no football 'favors run game' copy", rn.indexOf("run game") === -1);

var damp = [{temp:60, precip:45, wind:8, gust:12, wdir:"SE"}];
ok("rain 45 -> possible-delay note (lower tier)", W.impactBsb(damp).indexOf("possible delay") !== -1);

var cold = [{temp:36, precip:5, wind:7, gust:10, wdir:"N"}];
ok("cold 36F -> dense-air carry note (baseball copy, not 'Freezing')",
  W.impactBsb(cold).indexOf("dense air slightly suppresses carry") !== -1);

var hot = [{temp:97, precip:0, wind:5, gust:8, wdir:"S"}];
ok("heat 97F -> carry note", W.impactBsb(hot).indexOf("ball carries a touch farther") !== -1);

ok("legacy single-snapshot call still works",
  W.impactBsb({temp:60, precip:70, wind:8}).indexOf("delay/postponement risk") !== -1);
ok("window max wins: calm first pitch, windy 3rd hour flags",
  W.impactBsb([{temp:65,precip:0,wind:6,gust:8,wdir:"S"},{temp:63,precip:0,wind:21,gust:26,wdir:"S"}]).indexOf("direction decides") !== -1);
ok("notes carry tag classes", W.impactNotesBsb(windy).every(function(n){ return /^tag/.test(n.cls); }));

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL BSB IMPACT TESTS PASS");
process.exit(failures ? 1 : 0);
