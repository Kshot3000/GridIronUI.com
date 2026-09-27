/* Node tests for js/odds-logic.js — run: node tests/test-odds.js */
var L = require("../js/odds-logic.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra||""); }
  else console.log("ok  ", name);
}
/* scripted board: 3 books, Chiefs(-) vs Raiders(+) */
function bk(key, title, spA, spApr, spH, spHpr, oPt, oPr, uPt, uPr, aMl, hMl){
  return { key:key, title:title, markets:[
    {key:"spreads", outcomes:[{name:"Kansas City Chiefs",price:spApr,point:spA},{name:"Las Vegas Raiders",price:spHpr,point:spH}]},
    {key:"totals", outcomes:[{name:"Over",price:oPr,point:oPt},{name:"Under",price:uPr,point:uPt}]},
    {key:"h2h", outcomes:[{name:"Kansas City Chiefs",price:aMl},{name:"Las Vegas Raiders",price:hMl}]}
  ]};
}
var ev = {away_team:"Kansas City Chiefs", home_team:"Las Vegas Raiders"};
var books = [
  bk("draftkings","DraftKings", -6.5,1.91, 6.5,1.91, 47.5,1.91, 47.5,1.91, 1.40,2.90),
  bk("fanduel","FanDuel",       -7,1.87,   7,1.95,  47,1.87,   47,1.95,   1.36,3.05),
  bk("betmgm","BetMGM",         -6.5,1.95, 6.5,1.87, 47.5,1.95, 47.5,1.87, 1.38,2.95)
];
/* spreads: Chiefs fav — best is HIGHEST point = -6.5 (DK/BMGM tie, higher price wins = BetMGM 1.95) */
var bs = L.bestSpread(books, ev);
ok("spread fav best = betmgm|-6.5|1.95", bs.a === "betmgm|-6.5|1.95", bs.a);
ok("spread dog best = fanduel|+7|1.95", bs.h === "fanduel|7|1.95", bs.h);
/* totals: Over wants LOWEST total = 47 FD; Under wants HIGHEST = 47.5 tie -> best price = MGM 1.87? no: 47.5 @ DK 1.91 vs MGM 1.87 -> DK */
var bt = L.bestTotal(books);
ok("total over best = fanduel|47|1.87", bt.o === "fanduel|47|1.87", bt.o);
ok("total under best = draftkings|47.5|1.91", bt.u === "draftkings|47.5|1.91", bt.u);
/* ML: max price */
var bm = L.bestML(books, ev);
ok("ML away best = draftkings|1.4", bm.a === "draftkings|1.4", bm.a);
ok("ML home best = fanduel|3.05", bm.h === "fanduel|3.05", bm.h);
/* top book: FD holds dog spread + over + home ML = 3 */
var top = L.topBook(books, [bs,bt,bm]);
ok("topBook = fanduel x3", top && top.key==="fanduel" && top.count===3, JSON.stringify(top));
/* missing markets -> nulls, no crash */
var thin = [{key:"x", title:"X", markets:[{key:"h2h", outcomes:[{name:"Kansas City Chiefs",price:1.5}]}]}];
var bs2 = L.bestSpread(thin, ev);
ok("no spreads -> null", bs2.a===null && bs2.h===null);
var bm2 = L.bestML(thin, ev);
ok("partial ML -> away only", bm2.a==="x|1.5" && bm2.h===null, JSON.stringify(bm2));
ok("topBook empty -> null", L.topBook(thin,[{a:null,h:null}])===null);
/* dec2am */
ok("dec2am 1.91 = -110", L.dec2am(1.91)===-110, L.dec2am(1.91));
ok("dec2am 2.5 = +150", L.dec2am(2.5)==="+150", L.dec2am(2.5));
/* ---- market consensus ---- */
var c = L.consensus(books, ev);
ok("consensus n = 3", c.n===3, c.n);
ok("consensus spread a = -6.5 (median of -6.5,-7,-6.5)", c.spread.a && c.spread.a.pt===-6.5, JSON.stringify(c.spread.a));
ok("consensus spread h = 6.5", c.spread.h && c.spread.h.pt===6.5, JSON.stringify(c.spread.h));
ok("consensus total over = 47.5 (median of 47.5,47,47.5)", c.total.o && c.total.o.pt===47.5, JSON.stringify(c.total.o));
ok("consensus ML away = 1.38 (median of 1.40,1.36,1.38)", c.ml.a && c.ml.a.pr===1.38, JSON.stringify(c.ml.a));
ok("consensus ML home = 2.95", c.ml.h && c.ml.h.pr===2.95, JSON.stringify(c.ml.h));
var c2 = L.consensus(books.slice(0,2), ev);
ok("even count: spread a median = -6.75", c2.spread.a && c2.spread.a.pt===-6.75, JSON.stringify(c2.spread.a));
var ct = L.consensus(thin, ev);
ok("thin board: spread slots null, ML away kept", ct.spread.a===null && ct.spread.h===null && ct.ml.a && ct.ml.a.pr===1.5 && ct.ml.h===null, JSON.stringify(ct));
ok("empty books: all slots null", (function(){ var e=L.consensus([],ev); return e.spread.a===null && e.total.o===null && e.ml.a===null && e.n===0; })());
/* ---- off-market flags ---- */
ok("FD -7 vs consensus -6.5 (0.5 pt): not flagged", L.offMarket(c,"spreads","a",-7,1.87)===false);
ok("full point off spread: flagged", L.offMarket(c,"spreads","a",-5.5,1.91)===true);
ok("DK -6.5 on consensus: not off-market", L.offMarket(c,"spreads","a",-6.5,1.91)===false);
ok("0.5 pt off (FD total 47 vs 47.5): not flagged", L.offMarket(c,"totals","o",47,1.87)===false);
ok("full point off totals: flagged", L.offMarket(c,"totals","o",46.5,1.87)===true);
ok("ML home 3.30 vs consensus 2.95: flagged (~3.6% implied)", L.offMarket(c,"h2h","h",null,3.30)===true);
ok("ML home 3.05 vs consensus 2.95: not flagged (~1.1% implied)", L.offMarket(c,"h2h","h",null,3.05)===false);
ok("single-book board never flags", (function(){ var s=L.consensus(books.slice(0,1),ev); return L.offMarket(s,"spreads","a",-6.5,1.91)===false && L.offMarket(s,"h2h","a",null,1.40)===false; })());
ok("missing consensus slot: no flag", L.offMarket(ct,"spreads","a",-6.5,1.9)===false);
ok("unknown market: no flag", L.offMarket(c,"props","a",-6.5,1.9)===false);
/* ---- steam watch: biggest line movers ---- */
var evA = {id:"aaa111", away_team:"Kansas City Chiefs", home_team:"Las Vegas Raiders",
           bookmakers:books};
var evB = {id:"bbb222", away_team:"Kansas City Chiefs", home_team:"Las Vegas Raiders",
           bookmakers:books.slice(0,1)}; /* thin board, single book, no line move */
var evNoOpen = {id:"ccc333", away_team:"Dallas Cowboys", home_team:"Philadelphia Eagles",
           bookmakers:books};
var opens = {
  aaa111: {t: 1000, sp:-5.5, tot:46.5},   /* spread moved -5.5 -> -6.5 consensus; total 46.5 -> 47.5 */
  bbb222: {t: 1000, sp:-6.5, tot:47.5}    /* single book DK: -6.5 / 47.5 -> zero deltas */
  /* ccc333 has no opener -> excluded */
};
var entries = L.moverEntries([evA, evB, evNoOpen], opens);
ok("entries: one spread + one total per game with opener", entries.length===4, entries.length);
var spA = entries.filter(function(e){return e.kind==="spread" && e.id==="aaa111";})[0];
ok("spread entry: delta -6.5 - (-5.5) = -1", spA && spA.delta===-1, JSON.stringify(spA));
ok("spread openFmt uses + sign", spA && spA.openFmt==="-5.5", spA && spA.openFmt);
ok("spread anchor sanitized", spA && spA.anchor==="game-aaa111", spA && spA.anchor);
var totA = entries.filter(function(e){return e.kind==="total" && e.id==="aaa111";})[0];
ok("total entry: delta 47.5 - 46.5 = 1", totA && totA.delta===1, JSON.stringify(totA));
ok("no-opener game contributes nothing", entries.filter(function(e){return e.id==="ccc333";}).length===0);
ok("zero-delta entries dropped by biggestMovers", L.biggestMovers(entries,10).filter(function(e){return e.id==="bbb222";}).length===0);
var movers = L.biggestMovers(entries, 5);
ok("movers sorted by |delta| desc", movers[0].id==="aaa111" && Math.abs(movers[0].delta)===1);
ok("tie-break on title is stable", (function(){
  var t = L.biggestMovers([{id:"x",anchor:"g-x",title:"Zeta",kind:"spread",openFmt:"-3",delta:1},
                           {id:"y",anchor:"g-y",title:"Alpha",kind:"spread",openFmt:"-3",delta:-1}],2);
  return t[0].title==="Alpha" && t[1].title==="Zeta";
})());
ok("n caps the list", L.biggestMovers(entries,1).length===1);
ok("sub-0.05-point noise excluded", L.biggestMovers([{id:"x",anchor:"g-x",title:"T",kind:"spread",openFmt:"-3",delta:0.04}],5).length===0);
ok("anchor strips unsafe chars", (function(){
  var e = L.moverEntries([{id:"a b/c?d", away_team:"X", home_team:"Y", bookmakers:books}],
                         {"a b/c?d":{t:1,sp:-3,tot:40}});
  return e[0].anchor==="game-abcd";
})());

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL ODDS-LOGIC TESTS PASSED");
process.exit(fails ? 1 : 0);
