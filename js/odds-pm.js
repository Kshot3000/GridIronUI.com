/* GridIronUI odds-board market check — pure glue between the odds board and
   Polymarket's live NFL moneylines. The predictions page tells visitors to
   compare market-implied probabilities against sportsbook prices; this puts
   that comparison on the board itself, on every NFL game card, where lines
   are actually shopped.

   Honesty rules (no invented data):
   - Polymarket prices come from one CORS-open gamma fetch per board render
     (zero Odds-API quota); pinned 0/100 moneylines are resolved markets,
     not prices, and are excluded;
   - the book side is the best decimal price per side across the listed
     books, converted to no-vig fair probabilities (the same math as the
     no-vig calculator on the tools page);
   - games that can't be matched by team, or that lack a live moneyline on
     either side, produce NO badge — quiet by default, exactly like the
     weather badges and the steam strip;
   - a 5+ point gap between Polymarket and the books gets a flag, because
     that's where edge lives — smaller gaps are noise.
   teamFind and oneOutcome are injected so the module stays pure and
   testable. The browser wires this up (odds.js): one gamma fetch per board
   render, badges injected into the card placeholders. */
(function(){
"use strict";
var PM = {};

var GAP_PTS = 5;

/* "Ravens vs. Cowboys" -> ["Ravens","Cowboys"]; null when not a matchup title */
PM.splitTitle = function(title){
  var p = String(title==null?"":title).split(/\s+vs\.?\s+/);
  return (p.length===2 && p[0].trim() && p[1].trim()) ? [p[0].trim(), p[1].trim()] : null;
};

function parseArr(s){
  try{ var v = typeof s==="string" ? JSON.parse(s) : s; return Array.isArray(v)?v:[]; }
  catch(e){ return []; }
}

/* Best two-sided decimal moneyline prices across books, or null when a side
   has no price. oneOutcome is injected (OL.oneOutcome in the browser). */
PM.bestDecimalML = function(books, awayName, homeName, oneOutcome){
  var best = {a:0, h:0};
  (books||[]).forEach(function(bk){
    [["a",awayName],["h",homeName]].forEach(function(p){
      var o = null;
      try{ o = oneOutcome(bk, "h2h", p[1]); }catch(e){}
      if(o && isFinite(o.price) && Number(o.price) > best[p[0]]) best[p[0]] = Number(o.price);
    });
  });
  return (best.a > 1 && best.h > 1) ? best : null;
};

/* Two decimal prices -> no-vig fair probabilities (0..1) per side.
   Same math as the no-vig calculator: implied = 1/decimal, then normalize. */
PM.fairFromDecimal = function(dA, dH){
  dA = Number(dA); dH = Number(dH);
  if(!(dA > 1) || !(dH > 1)) return null;
  var pA = 1/dA, pH = 1/dH, tot = pA + pH;
  if(!(tot > 0)) return null;
  return {a: pA/tot, h: pH/tot};
};

/* Live Polymarket moneylines keyed by sorted "ABBR|ABBR".
   Each value: {priceByAbbr:{ABBR:cents}}. The highest-volume 2-outcome
   moneyline wins; pinned 0/100 (resolved), closed, or inactive markets are
   excluded — a settled market is not a price. Outcome names are resolved
   through teamFind (not by position) so a reordered market can't misassign
   a price, and both outcomes must be the event's two teams — nothing else. */
PM.pmPrices = function(events, dir, teamFind){
  var map = {};
  (events||[]).forEach(function(ev){
    var t = PM.splitTitle(ev && ev.title);
    if(!t) return;
    var ta = null, tb = null;
    try{ ta = teamFind(dir, "nfl", t[0]); tb = teamFind(dir, "nfl", t[1]); }catch(e){}
    if(!ta || !tb || !ta.abbr || !tb.abbr) return;
    var best = null;
    ((ev && ev.markets)||[]).forEach(function(m){
      if(!m || m.sportsMarketType !== "moneyline" || m.closed || m.active === false) return;
      var outs = parseArr(m.outcomes), pr = parseArr(m.outcomePrices);
      if(outs.length !== 2 || pr.length !== 2) return;
      var p0 = Math.round(Number(pr[0])*100);
      if(!isFinite(p0) || p0 <= 0 || p0 >= 100) return; /* pinned = resolved */
      var v = Number(m.volume) || 0;
      if(!best || v > best._v) best = {m:m, _v:v, outs:outs, p0:p0};
    });
    if(!best) return;
    var priceByAbbr = {}, ok = true;
    best.outs.forEach(function(name, i){
      var tm = null;
      try{ tm = teamFind(dir, "nfl", name); }catch(e){}
      if(!tm || !tm.abbr) ok = false;
      else priceByAbbr[tm.abbr] = (i === 0 ? best.p0 : 100 - best.p0);
    });
    if(!ok) return;
    var keys = Object.keys(priceByAbbr).sort();
    var want = [ta.abbr, tb.abbr].sort();
    if(keys.length !== 2 || keys[0] !== want[0] || keys[1] !== want[1]) return;
    map[want.join("|")] = {priceByAbbr: priceByAbbr};
  });
  return map;
};

/* Full check for one odds-board event: match to a Polymarket moneyline, then
   compare Polymarket's price to the books' no-vig fair probability. Returns
   null when anything can't be matched or priced — the caller stays silent.
   Otherwise {abbr, name, pm, fair, gap}: the Polymarket favorite's
   abbreviation + display name, its price in cents, the books' fair % for
   that side, and pm - fair in points. */
PM.check = function(oddsEv, pmMap, dir, teamFind, oneOutcome){
  if(!oddsEv || !pmMap) return null;
  var ht = null, at = null;
  try{
    ht = teamFind(dir, "nfl", oddsEv.home_team);
    at = teamFind(dir, "nfl", oddsEv.away_team);
  }catch(e){}
  if(!ht || !at || !ht.abbr || !at.abbr) return null;
  var rec = pmMap[[ht.abbr, at.abbr].sort().join("|")];
  if(!rec) return null;
  var best = PM.bestDecimalML(oddsEv.bookmakers, oddsEv.away_team, oddsEv.home_team, oneOutcome);
  if(!best) return null;
  var fair = PM.fairFromDecimal(best.a, best.h);
  if(!fair) return null;
  /* feature the Polymarket favorite — the side the market likes most */
  var favAbbr = null, pm = 0;
  Object.keys(rec.priceByAbbr).forEach(function(ab){
    if(rec.priceByAbbr[ab] > pm){ pm = rec.priceByAbbr[ab]; favAbbr = ab; }
  });
  if(!favAbbr) return null;
  var fairSide = (favAbbr === ht.abbr) ? fair.h : (favAbbr === at.abbr) ? fair.a : null;
  if(fairSide === null || fairSide === undefined) return null;
  var fairPct = Math.round(fairSide*100);
  var tm = (favAbbr === ht.abbr) ? ht : at;
  return { abbr: favAbbr,
           name: (tm && (tm.shortDisplayName || tm.displayName)) || favAbbr,
           pm: pm, fair: fairPct, gap: pm - fairPct };
};

PM.gapThreshold = function(){ return GAP_PTS; };

/* One-line market-check badge for a game card. esc is injected. */
PM.badgeHtml = function(rec, esc){
  esc = esc || function(s){ return String(s==null?"":s); };
  var tip = "Polymarket's live moneyline price vs the no-vig fair probability " +
    "from the best book price on each side. When the market and the books " +
    "disagree, one of them is wrong — that is where edge lives.";
  var gapChip = "";
  if(Math.abs(rec.gap) >= GAP_PTS){
    gapChip = ' <span class="pm-gap" title="Polymarket and the sportsbooks disagree by ' +
      Math.abs(rec.gap) + ' points on ' + esc(rec.name) +
      ' — one of them is off. Confirm both prices are live before you bet.">' +
      '&#9888; ' + Math.abs(rec.gap) + '-pt gap</span>';
  }
  return '<span title="' + esc(tip) + '">' +
    '&#x1F4CA; Market check &middot; Polymarket <b class="num">' + esc(rec.abbr) +
    ' ' + rec.pm + '&cent;</b> &mdash; books imply <b class="num">' + rec.fair +
    '%</b> (vig removed)</span>' + gapChip;
};

if(typeof module !== "undefined" && module.exports){ module.exports = PM; }
else if(typeof window !== "undefined"){ window.OddsPm = PM; }
})();
