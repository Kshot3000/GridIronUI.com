/* GridIronUI journal CSV import tests (js/betmath.js: BetMath.journalCSVImport).
   The journal's Export CSV must round-trip: an exported file re-imports to
   the same bets, quoted cells survive, and bad rows are skipped with a
   per-row reason instead of aborting the whole file. Nothing is invented:
   unknown results become "pending", missing dates fall back to today, and
   rows that fail journalValid are rejected with reasons.
   Run: node tests/test-journal-csvimport.js */
"use strict";
var BM = require("../js/betmath.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
  else console.log("ok  ", name);
}

var HEAD = "date,sport,event,market,pick,price,close,stake,result,profit_usd";

/* ---- round trip: export -> import restores every field ---- */
var bets = [
  {id:1, date:"2026-09-20", sport:"NFL", event:"Chiefs vs Bills", market:"Spread", pick:"Chiefs -3", price:-110, close:-105, stake:110, result:"win"},
  {id:2, date:"2026-09-21", sport:"NBA", event:"Lakers vs Celtics, \"the rematch\"", market:"Moneyline", pick:"Lakers", price:150, stake:50, result:"pending"},
  {id:3, date:"2026-09-22", sport:"NFL", event:"Bears vs Packers", market:"Total", pick:"Over 44.5", price:-105, stake:55.5, result:"loss"}
];
var rt = BM.journalCSVImport(BM.journalCSV(bets));
ok("round-trip count", rt.imported === 3 && rt.skipped === 0, rt);
ok("round-trip event", rt.bets[0].event === "Chiefs vs Bills");
ok("round-trip price/stake numbers", rt.bets[0].price === -110 && rt.bets[2].stake === 55.5);
ok("round-trip close kept", rt.bets[0].close === -105);
ok("round-trip no close stays absent", rt.bets[1].close === undefined);
ok("round-trip quoted cell", rt.bets[1].event === 'Lakers vs Celtics, "the rematch"');
ok("round-trip result kept", rt.bets[2].result === "loss");
ok("round-trip profit not trusted (recomputed)", BM.journalProfit(rt.bets[0]) === 100);

/* ---- column order is free; profit_usd ignored ---- */
var shuffled = "result,price,sport,stake,event,profit_usd\nwin,-110,NFL,110,Chiefs,999\n";
var sh = BM.journalCSVImport(shuffled);
ok("shuffled headers import", sh.imported === 1 && sh.bets[0].event === "Chiefs" && sh.bets[0].stake === 110, sh);
ok("shuffled missing date -> today", sh.bets[0].date === new Date().toISOString().slice(0,10), sh.bets[0].date);
ok("shuffled missing market/pick -> empty", sh.bets[0].market === "" && sh.bets[0].pick === "");

/* ---- bad rows skipped with reasons; file survives ---- */
var bad = HEAD + "\n" +
  "2026-09-20,NFL,Good bet,Spread,Chiefs -3,-110,,110,win,\n" +
  "2026-09-20,NFL,Bad price,Spread,Chiefs -3,-50,,110,win,\n" +
  "2026-09-20,NFL,No stake,Spread,Chiefs -3,-110,,0,loss,\n" +
  "2026-09-20,NFL,,Spread,Chiefs -3,-110,,110,win,\n" +
  "2026-09-20,NFL,Bad close,Spread,Chiefs -3,-110,-50,110,win,\n";
var br = BM.journalCSVImport(bad);
ok("one good row survives", br.imported === 1 && br.bets[0].event === "Good bet", br);
ok("four bad rows skipped", br.skipped === 4, br);
ok("per-row reasons", br.errors.length === 4 && /^Row \d+:/.test(br.errors[0]), br.errors);
ok("reasons name the problem", /-100 and \+100|between/.test(br.errors[0]) || /price/i.test(br.errors[0]), br.errors);

/* ---- unknown result -> pending, never an invented win ---- */
var ur = BM.journalCSVImport(HEAD + "\n2026-09-20,NFL,X,Spread,Chiefs -3,-110,,110,WON,\n");
ok("unknown result -> pending", ur.imported === 1 && ur.bets[0].result === "pending", ur);

/* ---- header and edge cases ---- */
ok("empty file -> nothing", (function(){ var r = BM.journalCSVImport(""); return r.imported === 0 && r.skipped === 0; })());
ok("header-only -> nothing", (function(){ var r = BM.journalCSVImport(HEAD); return r.imported === 0 && r.skipped === 0; })());
ok("BOM tolerated", BM.journalCSVImport("\uFEFF" + HEAD + "\n2026-09-20,NFL,BOM,Spread,Chiefs -3,-110,,110,win,\n").imported === 1);
ok("CRLF tolerated", BM.journalCSVImport(HEAD.replace(/,/g, ",") + "\r\n2026-09-20,NFL,CRLF,Spread,Chiefs -3,-110,,110,win,\r\n").imported === 1);
var mh = BM.journalCSVImport("foo,bar\n1,2\n");
ok("missing columns -> whole file skipped with reason", mh.imported === 0 && mh.skipped === 1 && /Missing required/.test(mh.errors[0]), mh);
ok("blank lines ignored", BM.journalCSVImport(HEAD + "\n\n2026-09-20,NFL,Spaced,Spread,Chiefs -3,-110,,110,win,\n\n").imported === 1);

/* ---- quoted multiline cell ---- */
var ml = BM.journalCSVImport(HEAD + '\n2026-09-20,NFL,"line one\nline two",Spread,Chiefs -3,-110,,110,win,\n');
ok("quoted newline in cell", ml.imported === 1 && ml.bets[0].event === "line one\nline two", ml);

/* ---- date defaults to today only when blank ---- */
var dflt = BM.journalCSVImport("sport,event,price,stake,result\nNFL,No date,-110,110,win\n");
ok("missing date column -> today", dflt.imported === 1 && dflt.bets[0].date === new Date().toISOString().slice(0,10), dflt);

console.log(fails ? "\n" + fails + " FAILURES" : "\nALL JOURNAL CSV IMPORT TESTS PASSED");
process.exit(fails ? 1 : 0);
