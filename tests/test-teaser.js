/* GridIronUI teaser calculator logic tests (js/betmath.js: BetMath.teaser).
   Teasers buy points on every leg of a parlay; the sharp analysis is which key
   numbers each leg crosses. NFL spread keys: 3,4,6,7,10,14,17. Total keys:
   37,41,44,47,51. A Wong leg (spreads only) crosses BOTH 3 and 7.
   Run: node tests/test-teaser.js */
var BM = require("../js/betmath.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
  else console.log("ok  ", name);
}
function approx(a, b, tol){ return Math.abs(a-b) <= (tol||0.02); }
function leg(line, kind, side){ return { line: line, kind: kind, side: side }; }

/* 1 — the classic 6-pt Wong favorite: -7.5 -> -1.5, crosses 3,4,6,7 */
var r = BM.teaser([leg(-7.5,"spread","fav"), leg(-7.5,"spread","fav")], 6, -120, "push");
ok("fav teased line", r.legs[0].teased === -1.5 && r.legs[1].teased === -1.5, r.legs);
ok("fav crosses 3,4,6,7", JSON.stringify(r.legs[0].crossed) === "[3,4,6,7]", r.legs[0].crossed);
ok("fav is Wong", r.legs[0].wong === true);
ok("fav not dead", r.legs[0].dead === false);
ok("allWong true", r.allWong === true);
ok("nWong 2", r.nWong === 2);

/* 2 — Wong underdog: +1.5 -> +7.5 */
r = BM.teaser([leg(1.5,"spread","dog"), leg(-8,"spread","fav")], 6, -120, "push");
ok("dog teased line", r.legs[0].teased === 7.5, r.legs[0]);
ok("dog crosses 3,4,6,7", JSON.stringify(r.legs[0].crossed) === "[3,4,6,7]", r.legs[0].crossed);
ok("dog is Wong", r.legs[0].wong === true);
ok("-8 fav teased", r.legs[1].teased === -2, r.legs[1]);
ok("-8 fav crosses", JSON.stringify(r.legs[1].crossed) === "[3,4,6,7]", r.legs[1].crossed);
ok("-8 fav is Wong", r.legs[1].wong === true);

/* 3 — teasing -3 to +3: lands exactly on 3, crosses nothing (push risk) */
r = BM.teaser([leg(-3,"spread","fav"), leg(-7.5,"spread","fav")], 6, -120, "push");
ok("-3 -> +3", r.legs[0].teased === 3, r.legs[0]);
ok("crosses nothing", r.legs[0].crossed.length === 0, r.legs[0].crossed);
ok("touches 3", JSON.stringify(r.legs[0].touched) === "[3]", r.legs[0].touched);
ok("not Wong", r.legs[0].wong === false);
ok("dead leg", r.legs[0].dead === true);
ok("nDead 1", r.nDead === 1);
ok("not allWong", r.allWong === false);

/* 4 — crosses 7 but not 3: -10 -> -4, not a Wong leg */
r = BM.teaser([leg(-10,"spread","fav"), leg(-10,"spread","fav")], 6, -120, "push");
ok("-10 -> -4", r.legs[0].teased === -4, r.legs[0]);
ok("crosses 6,7 only", JSON.stringify(r.legs[0].crossed) === "[6,7]", r.legs[0].crossed);
ok("not Wong without 3", r.legs[0].wong === false);

/* 5 — sign-crossing leg: -2 -> +4 crosses 3 */
r = BM.teaser([leg(-2,"spread","fav"), leg(-2,"spread","fav")], 6, -120, "push");
ok("-2 -> +4", r.legs[0].teased === 4, r.legs[0]);
ok("crosses 3", JSON.stringify(r.legs[0].crossed) === "[3]", r.legs[0].crossed);
ok("not Wong", r.legs[0].wong === false);

/* 6 — totals: over 47.5 -> 41.5 crosses 44; under 51 -> 57 crosses nothing */
r = BM.teaser([leg(47.5,"total","over"), leg(51,"total","under")], 6, -120, "push");
ok("over teased", r.legs[0].teased === 41.5, r.legs[0]);
ok("over crosses 47 and 44", JSON.stringify(r.legs[0].crossed) === "[44,47]", r.legs[0].crossed);
ok("under teased", r.legs[1].teased === 57, r.legs[1]);
ok("under crosses nothing", r.legs[1].crossed.length === 0, r.legs[1].crossed);
ok("under dead", r.legs[1].dead === true);
ok("totals never Wong", r.legs[0].wong === false && r.allWong === false);

/* 7 — total landing exactly on a key number: over 47 -> 41 touches both */
r = BM.teaser([leg(47,"total","over"), leg(47,"total","over")], 6, -120, "push");
ok("over 47 -> 41", r.legs[0].teased === 41, r.legs[0]);
ok("crosses 44", JSON.stringify(r.legs[0].crossed) === "[44]", r.legs[0].crossed);
ok("touches 47 and 41", JSON.stringify(r.legs[0].touched) === "[47,41]", r.legs[0].touched);

/* 8 — breakeven math: -120 two-teamer needs ~73.85% per leg */
r = BM.teaser([leg(-7.5,"spread","fav"), leg(1.5,"spread","dog")], 6, -120, "push");
ok("implied -120", approx(r.impliedPct, 54.55, 0.01), r.impliedPct);
ok("per-leg breakeven", approx(r.perLegBreakevenPct, 73.85, 0.01), r.perLegBreakevenPct);
ok("price passthrough", r.price === -120);
ok("pushRule passthrough", r.pushRule === "push");

/* 9 — three-teamer at +150: implied 40%, cube root per leg */
r = BM.teaser([leg(-7.5,"spread","fav"), leg(1.5,"spread","dog"), leg(47.5,"total","under")], 6, 150, "lose");
ok("nLegs 3", r.nLegs === 3);
ok("implied +150", approx(r.impliedPct, 40, 0.01), r.impliedPct);
ok("three-leg breakeven", approx(r.perLegBreakevenPct, 73.68, 0.02), r.perLegBreakevenPct);
ok("pushRule lose", r.pushRule === "lose");
ok("nWong 2 of 3", r.nWong === 2, r.nWong);
ok("not allWong (total leg)", r.allWong === false);

/* 10 — string lines parse: "+1.5" works */
r = BM.teaser([{line:"+1.5",kind:"spread",side:"dog"},{line:"-7.5",kind:"spread",side:"fav"}], 6, -120, "push");
ok("string +1.5 parses", r.legs[0].line === 1.5 && r.legs[0].teased === 7.5, r.legs[0]);
ok("string line is Wong", r.legs[0].wong === true);

/* 11 — default names assigned */
ok("leg names default", r.legs[0].name === "Leg 1" && r.legs[1].name === "Leg 2", r.legs.map(function(l){return l.name;}));
r = BM.teaser([{line:-7.5,kind:"spread",side:"fav",name:"Chiefs"},{line:1.5,kind:"spread",side:"dog",name:"Bears"}], 6, -120, "push");
ok("custom names kept", r.legs[0].name === "Chiefs" && r.legs[1].name === "Bears");

/* 12 — error paths */
function throws(fn, label){
  try{ fn(); ok(label, false, "did not throw"); }
  catch(e){ ok(label, true); }
}
throws(function(){ BM.teaser([leg(-7.5,"spread","fav")], 6, -120, "push"); }, "one leg throws");
throws(function(){ BM.teaser("nope", 6, -120, "push"); }, "non-array throws");
throws(function(){ BM.teaser([leg(-7.5,"spread","fav"), leg(1.5,"spread","dog")], 0, -120, "push"); }, "zero points throws");
throws(function(){ BM.teaser([leg(-7.5,"spread","fav"), leg(1.5,"spread","dog")], -6, -120, "push"); }, "negative points throws");
throws(function(){ BM.teaser([leg(-7.5,"spread","fav"), leg(1.5,"spread","dog")], 6, 0, "push"); }, "zero price throws");
throws(function(){ BM.teaser([leg(-7.5,"spread","fav"), leg(1.5,"spread","dog")], 6, -120, "maybe"); }, "bad pushRule throws");
throws(function(){ BM.teaser([leg("banana","spread","fav"), leg(1.5,"spread","dog")], 6, -120, "push"); }, "bad line throws");
throws(function(){ BM.teaser([leg("", "spread","fav"), leg(1.5,"spread","dog")], 6, -120, "push"); }, "empty line throws");
throws(function(){ BM.teaser([leg(-7.5,"spread","maybe"), leg(1.5,"spread","dog")], 6, -120, "push"); }, "bad spread side throws");
throws(function(){ BM.teaser([leg(47.5,"total","fav"), leg(1.5,"spread","dog")], 6, -120, "push"); }, "bad total side throws");
throws(function(){ BM.teaser([leg(-7.5,"moneyline","fav"), leg(1.5,"spread","dog")], 6, -120, "push"); }, "bad kind throws");

if(fails){ console.log(fails + " FAILURES"); process.exit(1); }
console.log("teaser logic: all assertions passed");
