/* GridIronUI bet journal logic tests (js/betmath.js: BetMath.journal*).
   Profit is dollars won/lost on settled bets (pending/push = $0);
   journalStats summarizes record/net/ROI/win-rate/streak/per-sport;
   journalCSV exports RFC-4180; journalValid rejects bad inputs.
   Run: node tests/test-journal.js */
var BM = require("../js/betmath.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
  else console.log("ok  ", name);
}
function approx(a, b){ return Math.abs(a - b) < 0.02; }
function bet(o){
  return Object.assign({id:1, date:"2026-09-20", sport:"NFL", event:"Bears @ Packers",
    market:"Spread", pick:"Bears +3", price:-110, stake:100, result:"pending"}, o || {});
}

/* ---- journalValid ---- */
ok("valid bet passes", BM.journalValid(bet()) === null);
ok("missing event", BM.journalValid(bet({event:"  "})) === "Event is required.");
ok("bad price text", /Price must be a whole American/.test(BM.journalValid(bet({price:"abc"}))));
ok("price between -100/+100 rejected", /between -100 and \+100/.test(BM.journalValid(bet({price:-50}))));
ok("minus 100 rejected", /between -100 and \+100/.test(BM.journalValid(bet({price:-100}))));
ok("plus 100 accepted", BM.journalValid(bet({price:100})) === null);
ok("zero stake rejected", /Stake must be more/.test(BM.journalValid(bet({stake:0}))));
ok("negative stake rejected", /Stake must be more/.test(BM.journalValid(bet({stake:-20}))));

/* ---- journalProfit ---- */
ok("win -110 on $100", approx(BM.journalProfit(bet({result:"win"})), 90.91));
ok("win +150 on $100", approx(BM.journalProfit(bet({result:"win", price:150})), 150));
ok("loss is -stake", BM.journalProfit(bet({result:"loss"})) === -100);
ok("push is 0", BM.journalProfit(bet({result:"push"})) === 0);
ok("pending is 0", BM.journalProfit(bet({result:"pending"})) === 0);
ok("bad price -> NaN", isNaN(BM.journalProfit(bet({result:"win", price:"abc"}))));

/* ---- journalStats ---- */
var log = [
  bet({id:1, date:"2026-09-20", sport:"NFL", result:"win", price:-110, stake:110}),
  bet({id:2, date:"2026-09-21", sport:"NFL", result:"loss", price:-110, stake:110}),
  bet({id:3, date:"2026-09-22", sport:"NBA", result:"win", price:150, stake:50}),
  bet({id:4, date:"2026-09-23", sport:"NBA", result:"push", price:-110, stake:55}),
  bet({id:5, date:"2026-09-24", sport:"NFL", result:"pending", price:-110, stake:22}),
  bet({id:6, date:"2026-09-25", sport:"NFL", result:"win", price:-120, stake:60}),
];
var s = BM.journalStats(log, 100);
ok("n counts all", s.n === 6);
ok("record 3-1-1", s.wins === 3 && s.losses === 1 && s.pushes === 1);
ok("pending counted", s.pending === 1);
ok("staked skips push+pending", approx(s.staked, 330));
ok("profit", approx(s.profit, 100 + 75 - 110 + 50)); /* 100 -110 win, +150 win, -110 loss, -120 win */
ok("units at $100", approx(s.units, 1.15));
ok("roi", approx(s.roi, 100 * 115 / 330));
ok("win rate 75", s.winRate === 75);
ok("streak W2 (push doesn't break)", s.streak === "W2");
ok("perSport NFL", s.perSport.NFL.w === 2 && s.perSport.NFL.l === 1 && approx(s.perSport.NFL.profit, 40));
ok("perSport NBA", s.perSport.NBA.w === 1 && s.perSport.NBA.p === 1 && approx(s.perSport.NBA.profit, 75));
ok("empty log is zeros", (function(){
  var e = BM.journalStats([], 100);
  return e.n === 0 && e.profit === 0 && e.roi === 0 && e.winRate === 0 && e.streak === "—" && e.pending === 0;
})());
ok("streak L3", BM.journalStats([
  bet({id:1, result:"win", price:-110, stake:10}),
  bet({id:2, result:"loss", price:-110, stake:10}),
  bet({id:3, result:"loss", price:-110, stake:10}),
  bet({id:4, result:"loss", price:-110, stake:10}),
]).streak === "L3");
ok("loss streak broken by pending-only tail", BM.journalStats([
  bet({id:1, result:"win", price:-110, stake:10}),
  bet({id:2, result:"pending", price:-110, stake:10}),
]).streak === "W1");
ok("unit size default 100", BM.journalStats([bet({result:"win", price:100, stake:100})], 0).units === 1);
ok("profit written back on bets", s && log[0].profit === 100 && log[3].profit === 0);

/* ---- journalCSV ---- */
var csv = BM.journalCSV([bet({id:1, event:'Bears "da" Bears, @ Packers', result:"win", price:-110, stake:100})]);
var lines = csv.split("\n");
ok("csv header has close column", lines[0] === "date,sport,event,market,pick,price,close,stake,result,profit_usd");
ok("csv quotes commas+quotes", lines[1].indexOf('"Bears ""da"" Bears, @ Packers"') !== -1);
ok("csv profit column", /,win,90.91$/.test(lines[1]), lines[1]);
ok("csv empty close is blank", lines[1].indexOf(",-110,,100,") !== -1, lines[1]);
ok("csv records close", BM.journalCSV([bet({close:-105})]).split("\n")[1].indexOf(",-110,-105,100,") !== -1);
ok("csv empty log is header only", BM.journalCSV([]).split("\n").length === 1);

/* ---- closeValid ---- */
ok("close blank ok", BM.closeValid("") === null && BM.closeValid(null) === null && BM.closeValid("   ") === null);
ok("close good", BM.closeValid("-105") === null && BM.closeValid("+130") === null);
ok("close text rejected", /whole American/.test(BM.closeValid("abc")));
ok("close -100 rejected", /between -100 and/.test(BM.closeValid("-100")));
ok("journalValid accepts close", BM.journalValid(bet({close:-105})) === null);
ok("journalValid rejects bad close", /Closing price/.test(BM.journalValid(bet({close:"nope"}))));

/* ---- clv: did you beat the close? ---- */
ok("fav: -110 vs close -120 beats it", BM.clv(-110, -120) === 1);
ok("fav: -120 vs close -110 worse", BM.clv(-120, -110) === -1);
ok("dog: +150 vs close +130 beats it", BM.clv(150, 130) === 1);
ok("dog: +120 vs close +140 worse", BM.clv(120, 140) === -1);
ok("same price is 0", BM.clv(-110, -110) === 0);
ok("missing close -> null", BM.clv(-110, null) === null && BM.clv(-110, "") === null);
ok("missing price -> null", BM.clv(null, -110) === null);
ok("invalid price -> null", BM.clv("abc", -110) === null && BM.clv(-50, -110) === null);

/* ---- journalClvStats ---- */
var clvLog = [
  bet({price:-110, close:-120}), /* beat */
  bet({price:-120, close:-110}), /* worse */
  bet({price:150, close:130}),   /* beat */
  bet({price:-110, close:-110}), /* same */
  bet({price:-110}),             /* no close: skipped */
];
var cs = BM.journalClvStats(clvLog);
ok("clv counts", cs.beat === 2 && cs.worse === 1 && cs.same === 1 && cs.total === 4, JSON.stringify(cs));
ok("clv empty", JSON.stringify(BM.journalClvStats([])) === JSON.stringify({beat:0,worse:0,same:0,total:0}));

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL JOURNAL LOGIC TESTS PASSED");
process.exit(fails ? 1 : 0);
