/* GridIronUI Middle finder — cross-book middling windows on the odds board.
   The math lives in js/odds-logic.js (window.OddsLogic.findMiddles /
   biggestMiddles); this file is DOM wiring only. MiddleFinder.paint is
   called by odds.js from its keyed render path, so the panel inherits the
   board's gating: it only ever runs when the visitor has an Odds API key.
   Styling reuses the Sure bets strip's classes (card/arb-card/movers/arb)
   so the panel speaks the board's visual language.
   Browser: window.MiddleFinder · node (tests): same, via a vm sandbox. */
(function(){
"use strict";
/* Resolved lazily so this file loads fine before odds-logic.js in tests. */
function ol(){
  return (typeof window !== "undefined" && window.OddsLogic) || null;
}
function fmtClock(ts){
  try{
    return new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",second:"2-digit"});
  }catch(e){ return ""; }
}
function fmtMoney(x){
  return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
}
function legText(l, L){
  var t = L.mkEsc(l.name) + " " + L.fmtPt(l.point) + " @ " + L.mkEsc(l.bookTitle);
  if(l.price) t += " " + L.dec2am(l.price);
  return t;
}
function rowHtml(m){
  var L = ol();
  var legs = m.legs.map(function(l){ return legText(l, L); }).join(" · ");
  var juice = (m.costMiss === null || m.costMiss === undefined ||
               m.winBoth === null || m.winBoth === undefined)
    ? "juice n/a at these prices"
    : "miss " + fmtMoney(m.costMiss) + " · hit +$" + m.winBoth.toFixed(2) +
      " per $100/side";
  var windowTxt = "win both if the final lands between " + m.lo + " and " + m.hi;
  var aria = m.title + ": " + m.marketLabel + " middle — " + legs + ". " +
             windowTxt + ". " + juice + ". Jump to the game.";
  return '<a class="arb" href="#'+L.mkEsc(m.anchor)+'" aria-label="'+L.mkEsc(aria)+'">'+
    '<span class="mover-title">'+L.mkEsc(m.title)+
    ' <span class="arb-mkt">'+L.mkEsc(m.marketLabel)+' middle</span></span>'+
    '<span class="arb-legs">'+legs+'</span>'+
    '<span class="arb-profit">'+L.mkEsc(windowTxt)+
    ' <span class="arb-sub">('+L.mkEsc(juice)+')</span></span></a>';
}
/* The panel: header + honest framing, then the top middles (or the honest
   empty state). Pure string building — fully testable without a DOM. */
function panelHtml(entries, updated){
  var L = ol();
  var rows = (entries||[]).map(rowHtml).join("");
  if(!rows)
    rows = '<div class="empty" style="padding:8px 0 4px">no middles on the '+
      "current board — the books agree too closely this pull.</div>";
  return '<section class="card arb-card mid-card" aria-label="Cross-book middle finder">'+
    '<div class="section-head" style="margin-bottom:10px"><div>'+
    '<h3 style="margin:0">🎯 Middle finder</h3>'+
    '<div class="game-meta"><span>Two books, two different numbers on the same game — '+
    'if the final lands between them, both sides cash. Both legs cost juice, and a '+
    'middle is a swing, not an edge: no probability is implied. '+
    'Live at the last pull'+(updated ? " ("+fmtClock(updated)+")" : "")+
    ' — landing exactly on a number pushes that side. '+
    'Confirm both prices before you bet.</span></div></div></div>'+
    '<div class="movers">'+rows+'</div></section>';
}
/* Insert the panel right after the Sure bets strip (or at the top of the
   board when there is no strip). Defensive: a missing OddsLogic or a
   missing board is a no-op, never a broken board. */
function paint(board, events, updated){
  var L = ol();
  if(!board || !L || !L.findMiddles || !L.biggestMiddles) return;
  var html;
  try{
    html = panelHtml(L.biggestMiddles(L.findMiddles(events), 5), updated);
  }catch(e){ return; }
  var strip = board.querySelector ? board.querySelector(".arb-card") : null;
  if(strip && strip.insertAdjacentHTML) strip.insertAdjacentHTML("afterend", html);
  else if(board.insertAdjacentHTML) board.insertAdjacentHTML("afterbegin", html);
}
var MF = { paint: paint, panelHtml: panelHtml, rowHtml: rowHtml };
if(typeof window !== "undefined"){ window.MiddleFinder = MF; }
})();
