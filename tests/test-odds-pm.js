/* Market-check logic tests: Polymarket live moneylines vs the books' no-vig
   fair probability (js/odds-pm.js). Run: node tests/test-odds-pm.js */
"use strict";
var PM = require("../js/odds-pm.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function approx(a, b, tol){ return Math.abs(a-b) <= (tol||1e-9); }

/* teamFind stub over a tiny directory */
var DIR = { nfl: [
  {abbr:"CHI", displayName:"Chicago Bears", shortDisplayName:"Bears"},
  {abbr:"GB",  displayName:"Green Bay Packers", shortDisplayName:"Packers"},
  {abbr:"KC",  displayName:"Kansas City Chiefs", shortDisplayName:"Chiefs"},
  {abbr:"BUF", displayName:"Buffalo Bills", shortDisplayName:"Bills"}
]};
function teamFind(d, league, q){
  var list = (d[league]||[]), ql = String(q).toLowerCase();
  for(var i=0;i<list.length;i++){
    var t = list[i];
    if(t.abbr === String(q).toUpperCase() ||
       t.displayName.toLowerCase() === ql ||
       t.shortDisplayName.toLowerCase() === ql) return t;
  }
  return null;
}
function oneOutcome(bk, mkey, name){
  var ms = (bk.markets||[]).filter(function(m){ return m.key===mkey; });
  for(var i=0;i<ms.length;i++){
    var os = ms[i].outcomes||[];
    for(var j=0;j<os.length;j++) if(os[j].name===name) return os[j];
  }
  return null;
}
function mlEv(title, markets){
  return {title:title, markets:markets};
}
function mlMkt(outs, prices, volume, extra){
  var m = { sportsMarketType:"moneyline", closed:false, active:true,
            outcomes:JSON.stringify(outs), outcomePrices:JSON.stringify(prices),
            volume: volume||0 };
  if(extra) for(var k in extra) m[k] = extra[k];
  return m;
}

/* ---- splitTitle ---- */
assert(PM.splitTitle("Ravens vs. Cowboys")[0]==="Ravens" &&
       PM.splitTitle("Ravens vs. Cowboys")[1]==="Cowboys",
       "splitTitle handles 'vs.'");
assert(PM.splitTitle("Chiefs vs Bills")[1]==="Bills", "splitTitle handles 'vs'");
assert(PM.splitTitle("Super Bowl Winner")===null, "splitTitle rejects non-matchups");
assert(PM.splitTitle(null)===null, "splitTitle rejects null");

/* ---- fairFromDecimal ---- */
var f = PM.fairFromDecimal(1.909, 1.909);
assert(f && approx(f.a, 0.5) && approx(f.h, 0.5), "fairFromDecimal: -110/-110 -> 50/50");
f = PM.fairFromDecimal(1.667, 2.30); /* -150 / +130 */
assert(f && approx(f.a, 0.5798, 1e-3) && approx(f.h, 0.4202, 1e-3),
       "fairFromDecimal: -150/+130 -> 58.0/42.0, got "+(f&&f.a.toFixed(4))+"/"+(f&&f.h.toFixed(4)));
assert(approx(f.a + f.h, 1), "fairFromDecimal: sides sum to 1 (vig removed)");
assert(PM.fairFromDecimal(1, 2.0)===null, "fairFromDecimal rejects price <= 1");
assert(PM.fairFromDecimal(NaN, 2.0)===null, "fairFromDecimal rejects NaN");

/* ---- bestDecimalML ---- */
function bk(h2hA, h2hH){
  return {key:"dk", title:"DraftKings", markets:[{key:"h2h", outcomes:[
    {name:"Chicago Bears", price:h2hA}, {name:"Green Bay Packers", price:h2hH}]}]};
}
var b = PM.bestDecimalML([bk(1.65, 2.30), bk(1.70, 2.20)], "Chicago Bears", "Green Bay Packers", oneOutcome);
assert(b && b.a===1.70 && b.h===2.30, "bestDecimalML takes the best decimal per side across books");
assert(PM.bestDecimalML([bk(1.65, null)], "Chicago Bears", "Green Bay Packers", oneOutcome)===null,
       "bestDecimalML is null when a side has no price");

/* ---- pmPrices ---- */
var evs = [
  mlEv("Bears vs. Packers", [mlMkt(["Bears","Packers"], ["0.58","0.42"], 9000)]),
  /* pinned 1/0: today's final, a resolved market — not a price */
  mlEv("Chiefs vs. Bills", [mlMkt(["Chiefs","Bills"], ["1","0"], 50000)]),
  /* closed market excluded */
  mlEv("Bears vs. Packers", [mlMkt(["Bears","Packers"], ["0.60","0.40"], 99999, {closed:true})]),
  /* highest volume wins when two moneylines exist */
  {title:"Bears vs. Packers", markets:[
    mlMkt(["Bears","Packers"], ["0.51","0.49"], 100),
    mlMkt(["Bears","Packers"], ["0.57","0.43"], 8000)]},
  /* outcomes resolved by team, not position */
  mlEv("Bears vs. Packers", [mlMkt(["Packers","Bears"], ["0.44","0.56"], 7000)]),
  /* unknown team -> dropped */
  mlEv("Bears vs. Aliens", [mlMkt(["Bears","Aliens"], ["0.9","0.1"], 100)]),
  /* not a matchup title -> dropped */
  mlEv("Super Bowl Winner", [mlMkt(["Bears","Packers"], ["0.2","0.1"], 100)])
];
var map = PM.pmPrices(evs, DIR, teamFind);
assert(map["CHI|GB"] && map["CHI|GB"].priceByAbbr.GB===44,
       "pmPrices: highest-volume live moneyline wins (GB 44c), got "+
       JSON.stringify(map["CHI|GB"]&&map["CHI|GB"].priceByAbbr));
assert(!map["BUF|KC"], "pmPrices: pinned 1/0 resolved market excluded");
assert(Object.keys(map).length===1, "pmPrices: junk titles/teams dropped, one game kept");

/* ---- check ---- */
function oddsEv(){
  return { id:"ev1", home_team:"Chicago Bears", away_team:"Green Bay Packers",
           commence_time:new Date(Date.now()+864e5).toISOString(),
           bookmakers:[bk(1.65, 2.30)] };
}
var rec = PM.check(oddsEv(), map, DIR, teamFind, oneOutcome);
assert(rec && rec.abbr==="CHI" && rec.name==="Bears",
       "check: features the Polymarket favorite (Bears 56c from the position-swapped fixture)");
assert(rec && rec.pm===56, "check: PM price 56c, got "+(rec&&rec.pm));
/* best books: Bears 1.65, Packers 2.30 -> fair CHI = (1/1.65)/(1/1.65+1/2.30) = 58.2% -> 58% */
assert(rec && rec.fair===58, "check: no-vig fair for CHI is 58%, got "+(rec&&rec.fair));
assert(rec && rec.gap===-2, "check: gap = 56-58 = -2, got "+(rec&&rec.gap));
assert(PM.check(oddsEv(), {}, DIR, teamFind, oneOutcome)===null,
       "check: unmatched game -> null (silent)");
var badEv = oddsEv(); badEv.home_team = "Springfield Atoms";
assert(PM.check(badEv, map, DIR, teamFind, oneOutcome)===null,
       "check: unresolvable team -> null (silent)");
var noMl = oddsEv(); noMl.bookmakers = [{key:"dk", title:"DK", markets:[]}];
assert(PM.check(noMl, map, DIR, teamFind, oneOutcome)===null,
       "check: no book moneyline -> null (silent)");

/* gap flag threshold */
assert(PM.gapThreshold()===5, "gapThreshold is 5 points");

/* ---- badgeHtml ---- */
var html = PM.badgeHtml({abbr:"GB", name:"Packers", pm:58, fair:42, gap:16}, function(s){return s;});
assert(html.indexOf("58&cent;")!==-1 && html.indexOf("42%")!==-1,
       "badgeHtml shows the PM price and the fair %");
assert(html.indexOf("pm-gap")!==-1 && html.indexOf("16-pt gap")!==-1,
       "badgeHtml flags a 16-pt gap");
var quiet = PM.badgeHtml({abbr:"GB", name:"Packers", pm:44, fair:42, gap:2}, function(s){return s;});
assert(quiet.indexOf("pm-gap")===-1, "badgeHtml stays quiet on a 2-pt gap");
var evil = PM.badgeHtml({abbr:"GB\"><script>", name:"Packers", pm:58, fair:42, gap:16},
  function(s){ return String(s).replace(/[<>&"]/g, function(c){
    return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]; }); });
assert(evil.indexOf("<script>")===-1, "badgeHtml escapes injected markup");

console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL ODDS-PM TESTS PASS");
process.exit(failures ? 1 : 0);
