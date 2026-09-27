/* Unit tests for js/disagree-logic.js — Polymarket moneyline vs Kalshi
   snapshot cross-book comparison. Verifies price extraction, team matching
   by abbreviation (incl. the JAC/WAS aliases), price alignment when feeds
   list teams in different orders, and that unmatchable/unpriced games are
   dropped rather than guessed. */
"use strict";
var D = require("../js/disagree-logic.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* minimal team directory standing in for data/teams.json */
var dir = {nfl: [
  {abbr:"KC",  displayName:"Kansas City Chiefs",    shortDisplayName:"Chiefs"},
  {abbr:"BUF", displayName:"Buffalo Bills",         shortDisplayName:"Bills"},
  {abbr:"JAX", displayName:"Jacksonville Jaguars",  shortDisplayName:"Jaguars"},
  {abbr:"WSH", displayName:"Washington Commanders",shortDisplayName:"Commanders"}
]};
function teamFind(d, league, q){
  var list = (d||{})[league] || [];
  q = String(q==null?"":q).trim();
  if(!q || !list.length) return null;
  var qu = q.toUpperCase(), ql = q.toLowerCase();
  for(var i=0;i<list.length;i++) if(list[i].abbr === qu) return list[i];
  for(var j=0;j<list.length;j++)
    if(list[j].displayName.toLowerCase() === ql || list[j].shortDisplayName.toLowerCase() === ql) return list[j];
  return null;
}

/* splitTitle */
assert(JSON.stringify(D.splitTitle("Chiefs vs. Bills")) === '["Chiefs","Bills"]', "splitTitle handles 'vs.'");
assert(JSON.stringify(D.splitTitle("Chiefs vs Bills")) === '["Chiefs","Bills"]', "splitTitle handles plain 'vs'");
assert(D.splitTitle("Super Bowl winner") === null, "splitTitle rejects non-matchup titles");
assert(D.splitTitle("Chiefs") === null, "splitTitle rejects single team");

/* pmMoneyline */
function ev(title, markets){ return {title: title, markets: markets}; }
function ml(outcomes, prices, volume, extra){
  var m = {sportsMarketType:"moneyline", outcomes:JSON.stringify(outcomes),
           outcomePrices:JSON.stringify(prices), volume:volume};
  if(extra) for(var k in extra) m[k] = extra[k];
  return m;
}
var pm = D.pmMoneyline(ev("Chiefs vs. Bills", [ml(["Chiefs","Bills"],[0.72,0.28],500)]));
assert(pm && pm.priceA === 72 && pm.priceB === 28, "pmMoneyline: 0.72 -> 72c, sides sum to 100");
var pm2 = D.pmMoneyline(ev("Chiefs vs. Bills", [
  ml(["Chiefs","Bills"],[0.70,0.30],100), ml(["Chiefs","Bills"],[0.72,0.28],900)
]));
assert(pm2 && pm2.priceA === 72, "pmMoneyline picks the highest-volume moneyline");
var pm3 = D.pmMoneyline(ev("Chiefs vs. Bills", [ml(["Chiefs","Bills"],[0.72,0.28],500,{closed:true})]));
assert(pm3 === null, "pmMoneyline skips closed markets");
var pm4 = D.pmMoneyline(ev("Chiefs vs. Bills", [ml(["Chiefs","Bills","Tie"],[0.6,0.3,0.1],500)]));
assert(pm4 === null, "pmMoneyline skips non-binary markets");
var pm5 = D.pmMoneyline(ev("Chiefs vs. Bills", [{sportsMarketType:"spreads", outcomes:'["Chiefs","Bills"]', outcomePrices:'[0.5,0.5]', volume:500}]));
assert(pm5 === null, "pmMoneyline ignores spread markets");
var pm6 = D.pmMoneyline(ev("Chargers vs. Bills", [ml(["Chargers","Bills"],[0,1],500)]));
assert(pm6 === null, "pmMoneyline drops pinned 0/100 markets (resolved games left in the active feed)");

/* Kalshi side parsing */
var kg = {
  sub_title: "KC vs BUF (Oct 4)",
  markets: [
    {ticker:"KXNFLGAME-26OCT04KBUF-KC",  kind:"winner", team:"Kansas City", yes_bid:70, yes_ask:72, last:71},
    {ticker:"KXNFLGAME-26OCT04KBUF-BUF", kind:"winner", team:"Buffalo",     yes_bid:28, yes_ask:30, last:29}
  ]
};
var ks = D.kalshiSides(kg);
assert(ks && ks.abbrA === "KC" && ks.abbrB === "BUF" && ks.priceA === 71 && ks.priceB === 29,
  "kalshiSides: bid/ask midpoints aligned to sub_title order");
assert(D.kalshiSides({sub_title:"KC vs BUF (Oct 4)", markets:[]}) === null, "kalshiSides drops unpriced games");
assert(D.kalshiSides({sub_title:"AFC Championship", markets:[]}) === null, "kalshiSides drops non-game subtitles");
var kgLast = {sub_title:"KC vs BUF (Oct 4)", markets:[
  {ticker:"KXNFLGAME-26OCT04KBUF-KC", kind:"winner", team:"Kansas City", yes_bid:null, yes_ask:null, last:66},
  {ticker:"KXNFLGAME-26OCT04KBUF-BUF", kind:"winner", team:"Buffalo", yes_bid:30, yes_ask:34, last:32}
]};
var ksL = D.kalshiSides(kgLast);
assert(ksL && ksL.priceA === 66 && ksL.priceB === 32, "kalshiPrice falls back to last trade when book is empty");

/* abbr aliases */
assert(JSON.stringify(D.kalshiAbbrs("JAC vs WSH (Oct 4)")) === '["JAX","WSH"]', "JAC->JAX and WAS->WSH aliased to the ESPN directory");
assert(D.kalshiTeamAbbr({ticker:"KXNFLGAME-26OCT04JACWSH-JAC"}) === "JAX", "ticker-suffix abbr is aliased too");

/* matches: happy path, order flips, aliases, drops */
var pmEv = ev("Chiefs vs. Bills", [ml(["Chiefs","Bills"],[0.72,0.28],500)]);
var m1 = D.matches([pmEv], [kg], dir, teamFind);
assert(m1.length === 1 && m1[0].pmA === 72 && m1[0].kalshiA === 71 && m1[0].abbrA === "KC",
  "matches pairs the same game; prices aligned to side A");
var pmFlip = ev("Bills vs. Chiefs", [ml(["Chiefs","Bills"],[0.72,0.28],500)]);
var kgFlip = {sub_title:"BUF vs KC (Oct 4)", markets: kg.markets.slice().reverse()};
var m2 = D.matches([pmFlip], [kgFlip], dir, teamFind);
assert(m2.length === 1 && m2[0].abbrA === "BUF" && m2[0].pmA === 28 && m2[0].kalshiA === 29,
  "matches aligns prices when Polymarket and Kalshi list teams in opposite orders");
var pmJag = ev("Jaguars vs. Commanders", [ml(["Jaguars","Commanders"],[0.6,0.4],500)]);
var kgJag = {sub_title:"JAC vs WAS (Oct 4)", markets:[
  {ticker:"KXNFLGAME-X-JAC", kind:"winner", yes_bid:58, yes_ask:60},
  {ticker:"KXNFLGAME-X-WAS", kind:"winner", yes_bid:40, yes_ask:42}
]};
var m3 = D.matches([pmJag], [kgJag], dir, teamFind);
assert(m3.length === 1 && m3[0].abbrA === "JAX" && m3[0].abbrB === "WSH",
  "matches bridges the JAC/WAS -> JAX/WSH alias gap");
var m4 = D.matches([ev("Patriots vs. Jets", [ml(["Patriots","Jets"],[0.5,0.5],500)])], [kg], dir, teamFind);
assert(m4.length === 0, "matches drops games with no Kalshi counterpart");
var m5 = D.matches([ev("Chiefs vs. Bills", [])], [kg], dir, teamFind);
assert(m5.length === 0, "matches drops games with no Polymarket moneyline");
var m6 = D.matches([ev("Aliens vs. Predators", [ml(["Aliens","Predators"],[0.5,0.5],500)])], [kg], dir, teamFind);
assert(m6.length === 0, "matches drops teams the directory can't resolve (never guesses)");

/* disagreements */
var dis = D.disagreements([
  {abbrA:"KC", abbrB:"BUF", nameA:"Chiefs", nameB:"Bills", pmA:72, pmB:28, kalshiA:66, kalshiB:34},
  {abbrA:"JAX", abbrB:"WSH", nameA:"Jaguars", nameB:"Commanders", pmA:60, pmB:40, kalshiA:59, kalshiB:41},
  {abbrA:"KC", abbrB:"BUF", nameA:"Chiefs", nameB:"Bills", pmA:50, pmB:50, kalshiA:54, kalshiB:46}
], 3);
assert(dis.length === 2, "disagreements drops sub-threshold gaps");
assert(dis[0].abbrA === "KC" && dis[0].delta === 6, "biggest gap sorts first; delta = PM - Kalshi on side A");
assert(dis[1].abbrA === "KC" && dis[1].delta === -4, "negative delta preserved (Kalshi prices the side higher)");
var disDefault = D.disagreements([{abbrA:"KC",abbrB:"BUF",nameA:"Chiefs",nameB:"Bills",pmA:72,pmB:28,kalshiA:70,kalshiB:30}]);
assert(disDefault.length === 0, "default threshold is 3c: a 2c gap is noise, not an edge");

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("all disagree-logic assertions passed");
