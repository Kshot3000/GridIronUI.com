/* GridIronUI market-disagreement logic — pure functions that compare
   Polymarket moneyline prices against a Kalshi game-winner snapshot for the
   same games (NFL: data/kalshi-nfl.json, MLB postseason: data/kalshi-mlb.json).
   Both price the identical binary outcome (who wins), so a wide gap between
   them is a genuine signal, not noise. This module never invents a price:
   games that can't be matched by team, or that lack a priced moneyline on
   either side, are dropped. teamFind is injected (window.GIU
   .teamFind in the browser) so the module stays pure and testable. */
(function(){
"use strict";
var D = {};

/* Kalshi uses a few abbreviations ESPN's directory doesn't: JAC (Jaguars),
   WAS (Commanders), CWS (White Sox — ESPN files them as CHW).
   Normalize before matching. Exported as D.normAbbr so the markets page's
   Kalshi card headers resolve the same team identity. */
var ABBR_ALIAS = {JAC:"JAX", WAS:"WSH", CWS:"CHW"};
function normAbbr(a){
  a = String(a==null?"":a).toUpperCase();
  return ABBR_ALIAS[a] || a;
}
D.normAbbr = normAbbr;

function parseArr(s){
  try{ var v = typeof s==="string" ? JSON.parse(s) : s; return Array.isArray(v)?v:[]; }
  catch(e){ return []; }
}

/* "Ravens vs. Cowboys" -> ["Ravens","Cowboys"]; null when not a matchup title */
D.splitTitle = function(title){
  var p = String(title==null?"":title).split(/\s+vs\.?\s+/);
  return (p.length===2 && p[0].trim() && p[1].trim()) ? [p[0].trim(), p[1].trim()] : null;
};

/* Highest-volume 2-outcome Polymarket moneyline on an event, or null.
   outcomePrices are 0-1 probabilities; returned as whole cents with the two
   sides summing to 100. */
D.pmMoneyline = function(ev){
  var best = null;
  ((ev && ev.markets)||[]).forEach(function(m){
    if(m.sportsMarketType !== "moneyline" || m.closed || m.active === false) return;
    var outs = parseArr(m.outcomes), pr = parseArr(m.outcomePrices);
    if(outs.length !== 2 || pr.length !== 2) return;
    var v = Number(m.volume) || 0;
    if(!best || v > best._v) best = {m: m, _v: v};
  });
  if(!best) return null;
  var outs = parseArr(best.m.outcomes), pr = parseArr(best.m.outcomePrices);
  var p0 = Math.round(Number(pr[0]) * 100);
  if(!isFinite(p0) || p0 <= 0 || p0 >= 100) return null;
  /* A pinned 0/100 moneyline is a resolved market (Polymarket leaves those
     in the active feed), not a live price — excluding it keeps the
     comparison honest instead of manufacturing a giant fake disagreement. */
  return {aName: String(outs[0]), bName: String(outs[1]), priceA: p0, priceB: 100 - p0};
};

/* "ARI vs SF (Sep 27)" -> ["ARI","SF"] */
D.kalshiAbbrs = function(sub){
  var m = String(sub==null?"":sub).match(/^\s*([A-Za-z]{2,3})\s+vs\.?\s+([A-Za-z]{2,3})\b/);
  return m ? [normAbbr(m[1]), normAbbr(m[2])] : null;
};

/* Team abbreviation from the market ticker suffix, e.g.
   "KXNFLGAME-26SEP27ARISF-ARI" -> "ARI". Kalshi tickers end with the team. */
D.kalshiTeamAbbr = function(m){
  var t = String((m && m.ticker)||"").match(/-([A-Za-z]{2,3})$/);
  return t ? normAbbr(t[1]) : null;
};

/* Yes price in whole cents: bid/ask midpoint, falling back to the last trade
   when the book is empty; null when nothing is priced. Same semantics as
   Kalshi.price (kalshi-logic.js), duplicated here so this module stays
   dependency-free in the browser. */
D.kalshiPrice = function(m){
  m = m || {};
  function num(v){
    if(v === null || v === undefined || v === "") return NaN;
    v = Number(v); return isFinite(v) ? v : NaN;
  }
  var b = num(m.yes_bid), a = num(m.yes_ask);
  if(isFinite(b) && isFinite(a) && b >= 0 && a >= b) return Math.round((b + a) / 2);
  var l = num(m.last);
  return isFinite(l) ? Math.round(l) : null;
};

/* Game date from a Kalshi event ticker: "KXNFLGAME-26SEP27ARISF" and
   "KXMLBGAME-26SEP292000BOSNYY" both embed the local game day as YYMONDD.
   Returns "YYYY-MM-DD" or null when the ticker doesn't carry a date. */
var MONS = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
D.kalshiDate = function(g){
  var t = String((g && g.event_ticker) || "");
  var m = t.match(/^[A-Z]+-(\d{2})([A-Z]{3})(\d{2})/);
  if(!m || !MONS[m[2]]) return null;
  var yy = 2000 + Number(m[1]);
  return yy + "-" + String(MONS[m[2]]).padStart(2, "0") + "-" + m[3];
};

/* Eastern-calendar date of a Polymarket event: US game startTimes are UTC
   and evening games land on the next UTC day, so convert back 4h (Eastern
   Daylight — correct for the Sept/Oct MLB postseason window this disambiguator
   exists for). Returns "YYYY-MM-DD" or null. */
D.pmGameDay = function(ev){
  var t = Date.parse((ev && (ev.startTime || ev.eventDate)) || "");
  if(!isFinite(t)) return null;
  var e = new Date(t - 4 * 3600000);
  function p(n){ return String(n).padStart(2, "0"); }
  return e.getUTCFullYear() + "-" + p(e.getUTCMonth() + 1) + "-" + p(e.getUTCDate());
};

/* Days between two "YYYY-MM-DD" strings; Infinity when either is missing. */
function dayDiff(a, b){
  if(!a || !b) return Infinity;
  return Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000;
}

/* Raw snapshot game -> sides aligned to sub_title order, or null. */
D.kalshiSides = function(g){
  var ab = D.kalshiAbbrs((g && g.sub_title) || "");
  if(!ab) return null;
  var px = {};
  ((g && g.markets)||[]).forEach(function(m){
    if(m.kind && m.kind !== "winner") return;
    var a = D.kalshiTeamAbbr(m), p = D.kalshiPrice(m);
    if(a && p !== null && px[a] === undefined) px[a] = p;
  });
  if(px[ab[0]] === undefined || px[ab[1]] === undefined) return null;
  return {abbrA: ab[0], abbrB: ab[1], priceA: px[ab[0]], priceB: px[ab[1]],
          date: D.kalshiDate(g), et: (g && g.event_ticker) || null};
          /* et rides along so callers can join per-game data (e.g. the baked
             snapshot-to-snapshot moves) by exact event ticker — never by
             fuzzy team-name matching. */
};

/* Match Polymarket events to Kalshi snapshot games by unordered abbreviation
   pair. Prices are aligned to side A regardless of which order either feed
   lists the teams: Polymarket's outcome order is resolved through the team
   directory (falling back to title order), Kalshi's through its own tickers.
   `league` (default "nfl") selects the team directory; callers pass "mlb"
   for the postseason snapshot. When several snapshot games share the same
   pair — a playoff series, Game 1 vs Game 2 — the one whose game day equals
   the Polymarket event's Eastern date wins. When both sides carry a game day
   and they differ, the Kalshi entry is a DIFFERENT game of the series, not a
   second price for this one: a Game 3 Polymarket event never borrows Game 2's
   Kalshi price. Unmatchable games are dropped, never guessed. */
D.matches = function(pmEvents, kalshiGames, dir, teamFind, league){
  league = league || "nfl";
  var kl = (kalshiGames||[]).map(D.kalshiSides).filter(Boolean);
  var out = [];
  (pmEvents||[]).forEach(function(ev){
    var t = D.splitTitle(ev.title);
    if(!t) return;
    var pm = D.pmMoneyline(ev);
    if(!pm) return;
    /* A 99c/1c Polymarket price is a final, not a live number — Polymarket
       leaves finished games in the active feed until it closes them, and a
       live game only reaches an extreme in its final seconds. Comparing a
       decided game against Kalshi manufactures a fake "edge" out of
       settlement lag, so drop it here instead of matching it. */
    if(pm.priceA >= 99 || pm.priceA <= 1) return;
    var ta = teamFind(dir, league, t[0]), tb = teamFind(dir, league, t[1]);
    if(!ta || !tb) return;
    var pa = normAbbr(ta.abbr), pb = normAbbr(tb.abbr);
    /* Resolve Polymarket's outcome names to sides so a flipped outcome
       order doesn't attach prices to the wrong team. */
    var pmA = pm.priceA, pmB = pm.priceB;
    var oa = teamFind(dir, league, pm.aName), ob = teamFind(dir, league, pm.bName);
    if(oa && ob){
      var oaa = normAbbr(oa.abbr), oba = normAbbr(ob.abbr);
      if(oaa === pb && oba === pa){ pmA = pm.priceB; pmB = pm.priceA; }
      else if(!(oaa === pa && oba === pb)) return; /* outcomes aren't these teams */
    }
    var day = D.pmGameDay(ev), cands = [];
    for(var i = 0; i < kl.length; i++){
      var k = kl[i];
      var flip = (k.abbrA === pb && k.abbrB === pa);
      if((k.abbrA === pa && k.abbrB === pb) || flip)
        cands.push({k: k, flip: flip, diff: dayDiff(day, k.date)});
    }
    /* Prefer the matching game day (a playoff series lists the same pair
       several days running); a tie or missing dates falls back to the first
       pair match — the old behavior. When both sides carry a game day and
       they differ, the Kalshi entry is a DIFFERENT game of the series: a
       Game 3 Polymarket event never borrows Game 2's Kalshi price — drop it,
       never guess. */
    var best = null;
    for(var j = 0; j < cands.length; j++){
      if(!best || cands[j].diff < best.diff) best = cands[j];
    }
    if(best && day && best.k.date && day !== best.k.date) best = null;
    if(best){
      out.push({
        abbrA: pa, abbrB: pb, nameA: t[0], nameB: t[1],
        pmA: pmA, pmB: pmB,
        kalshiA: best.flip ? best.k.priceB : best.k.priceA,
        kalshiB: best.flip ? best.k.priceA : best.k.priceB,
        /* The matched snapshot game's exact event ticker — lets the caller
           attach per-game data (baked price moves) with an exact join. */
        kalshiTicker: (best.k && best.k.et) || null
      });
    }
  });
  return out;
};

/* Games where the two markets differ by at least minDelta cents on side A
   (default 3), biggest gap first. delta = Polymarket - Kalshi for side A:
   positive means Polymarket prices that side higher. */
D.disagreements = function(mtchs, minDelta){
  minDelta = (minDelta == null ? 3 : minDelta);
  return (mtchs||[]).map(function(m){
    var d = m.pmA - m.kalshiA;
    return {m: m, delta: d, abs: Math.abs(d)};
  }).filter(function(x){ return x.abs >= minDelta; })
    .sort(function(x, y){
      return (y.abs - x.abs) || (x.m.abbrA < y.m.abbrA ? -1 : x.m.abbrA > y.m.abbrA ? 1 : 0);
    })
    .map(function(x){
      var m = x.m;
      return {
        abbrA: m.abbrA, abbrB: m.abbrB, nameA: m.nameA, nameB: m.nameB,
        pmA: m.pmA, pmB: m.pmB, kalshiA: m.kalshiA, kalshiB: m.kalshiB,
        delta: x.delta
      };
    });
};

if(typeof module !== "undefined" && module.exports) module.exports = D;
else window.Disagree = D;
})();
