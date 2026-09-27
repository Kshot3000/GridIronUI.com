/* GridIronUI calculators — DOM wiring over window.BetMath (js/betmath.js) */
(function(){
"use strict";
function $(id){ return document.getElementById(id); }
function val(id){ return $(id).value.trim(); }
function num(id){ return parseFloat(val(id)); }
function show(id, html){ var e=$(id); e.innerHTML = html; e.style.display="block"; }
function err(id, msg){ show(id, '<span style="color:#ff9aa3">'+msg+'</span>'); }

/* parse "any" odds input given a format into decimal */
function toDecimal(str, fmt){
  str = String(str).trim().replace(/\s+/g,"");
  if(fmt==="american"){
    if(!/^[+-]?\d+(\.\d+)?$/.test(str)) throw new Error("Enter American odds like -110 or +150.");
    return BetMath.americanToDecimal(parseFloat(str));
  }
  if(fmt==="decimal"){
    var d = parseFloat(str);
    if(!(d>=1.01)) throw new Error("Decimal odds must be 1.01 or higher.");
    return d;
  }
  var m = str.match(/^(\d+(?:\.\d+)?)[\/:\-](\d+(?:\.\d+)?)$/);
  if(!m) throw new Error("Enter fractional odds like 10/11 or 3/2.");
  return BetMath.fractionalToDecimal(parseFloat(m[1]), parseFloat(m[2]));
}
function fmtAll(d){
  var f = BetMath.decimalToFractional(d);
  return { dec: BetMath.round(d,2).toFixed(2),
           frac: f[0]+"/"+f[1],
           am: (BetMath.decimalToAmerican(d)>0?"+":"")+BetMath.decimalToAmerican(d),
           imp: (BetMath.round(100/d,2)).toFixed(2)+"%" };
}

/* 1 — converter */
$("cGo").addEventListener("click", function(){
  try{
    var d = toDecimal(val("cIn"), val("cFmt")), o = fmtAll(d);
    show("cOut", '<div class="grid grid-4" style="gap:10px">'+
      '<div><label>American</label><div class="big num" style="font-size:1.5rem">'+o.am+'</div></div>'+
      '<div><label>Decimal</label><div class="big num" style="font-size:1.5rem">'+o.dec+'</div></div>'+
      '<div><label>Fractional</label><div class="big num" style="font-size:1.5rem">'+o.frac+'</div></div>'+
      '<div><label>Implied probability</label><div class="big num gold" style="font-size:1.5rem">'+o.imp+'</div></div></div>');
  }catch(e){ err("cOut", e.message); }
});

/* 2 — implied probability */
$("iGo").addEventListener("click", function(){
  try{
    var d = toDecimal(val("iIn"), val("iFmt"));
    var p = BetMath.round(100/d, 2);
    show("iOut", 'Implied probability: <span class="big gold num">'+p.toFixed(2)+'%</span><br><span style="font-size:.85rem;color:var(--muted)">The market is saying this outcome happens about '+p.toFixed(1)+'% of the time (before the book\'s margin).</span>');
  }catch(e){ err("iOut", e.message); }
});

/* 3 — payout */
$("pGo").addEventListener("click", function(){
  try{
    var d = toDecimal(val("pOdds"), val("pFmt")), s = num("pStake");
    if(!(s>0)) throw new Error("Enter a stake greater than 0.");
    var r = BetMath.payout(d, s);
    show("pOut", '<span class="big num">$'+r.profit.toFixed(2)+'</span> profit<br><span style="color:var(--muted)">Total return: <b class="num" style="color:var(--text)">$'+r.total.toFixed(2)+'</b> (stake + profit)</span>');
  }catch(e){ err("pOut", e.message); }
});

/* 4 — parlay */
var legN = 0;
function addLeg(){
  legN++;
  var row = document.createElement("div");
  row.className = "form-row"; row.style.marginBottom = "10px";
  row.innerHTML = '<div><label>Leg '+legN+' odds</label><input type="text" id="leg'+legN+'" placeholder="-110"></div>'+
    '<div><label>Format</label><select id="legf'+legN+'"><option value="american">American</option><option value="decimal">Decimal</option><option value="fractional">Fractional</option></select></div>';
  $("legRows").appendChild(row);
}
addLeg(); addLeg(); addLeg();
$("addLeg").addEventListener("click", addLeg);
$("plGo").addEventListener("click", function(){
  try{
    var legs = [];
    for(var i=1;i<=legN;i++){
      var el = $("leg"+i);
      if(el && el.value.trim()) legs.push(toDecimal(el.value, $("legf"+i).value));
    }
    if(legs.length < 2) throw new Error("Enter at least two legs.");
    var comb = BetMath.parlayDecimal(legs), o = fmtAll(comb);
    var s = num("plStake"), extra = "";
    if(s>0){ var r = BetMath.payout(comb, s); extra = '<br><span style="color:var(--muted)">$'+s.toFixed(2)+' stake → <b class="num" style="color:var(--text)">$'+r.total.toFixed(2)+'</b> total return ($'+r.profit.toFixed(2)+' profit)</span>'; }
    var fair = BetMath.round(100/legs.reduce(function(a,d){return a*(1/d);},1),1);
    show("plOut", 'Combined odds: <span class="big num">'+o.am+'</span> <span style="color:var(--muted)">('+o.dec+' decimal)</span>'+extra+
      '<br><span style="font-size:.85rem;color:var(--muted)">True hit rate needed: about '+(100/comb).toFixed(1)+'% of the time. Parlays multiply the payout — and the house edge.</span>');
  }catch(e){ err("plOut", e.message); }
});

/* 5 — kelly */
$("kGo").addEventListener("click", function(){
  try{
    var p = num("kProb")/100, d = toDecimal(val("kOdds"), val("kFmt")), frac = parseFloat(val("kFrac"));
    var f = BetMath.kelly(p, d, frac);
    var bank = num("kBank"), stakeTxt = bank>0 ? ' → <b class="num" style="color:var(--text)">$'+(bank*f).toFixed(2)+'</b> on a $'+bank.toFixed(2)+' bankroll' : '';
    var edge = BetMath.round((p*d-1)*100, 1);
    show("kOut", (f<=0
      ? '<span style="color:#ff9aa3">No bet.</span> <span style="color:var(--muted)">At your estimated probability the Kelly criterion says this wager has no edge — pass.</span>'
      : 'Bet <span class="big gold num">'+(f*100).toFixed(2)+'%</span> of bankroll'+stakeTxt+
        '<br><span style="font-size:.85rem;color:var(--muted)">Estimated edge: '+edge+'%. Kelly is only as good as your probability estimate — when in doubt, use quarter Kelly.</span>'));
  }catch(e){ err("kOut", e.message); }
});

/* 6 — vig remover */
$("vGo").addEventListener("click", function(){
  try{
    var a1 = parseFloat(val("vA1")), a2 = parseFloat(val("vA2"));
    if(!isFinite(a1)||!isFinite(a2)||a1===0||a2===0) throw new Error("Enter two valid American prices, e.g. -110 and -110.");
    var nv = BetMath.noVig(a1, a2);
    var f1 = nv.fair1>0? "+"+nv.fair1 : ""+nv.fair1, f2 = nv.fair2>0? "+"+nv.fair2 : ""+nv.fair2;
    show("vOut", '<div class="grid grid-2" style="gap:10px">'+
      '<div><label>Side 1 no-vig probability</label><div class="big num" style="font-size:1.5rem">'+(nv.p1*100).toFixed(2)+'%</div><div style="color:var(--muted);font-size:.9rem">Fair price: <b class="num">'+f1+'</b></div></div>'+
      '<div><label>Side 2 no-vig probability</label><div class="big num" style="font-size:1.5rem">'+(nv.p2*100).toFixed(2)+'%</div><div style="color:var(--muted);font-size:.9rem">Fair price: <b class="num">'+f2+'</b></div></div></div>'+
      '<p style="margin:10px 0 0;color:var(--muted);font-size:.9rem">Bookmaker hold on this market: <b class="num" style="color:var(--gold-soft)">'+nv.hold+'%</b>. If another book beats the fair price, you\'re getting value.</p>');
  }catch(e){ err("vOut", e.message); }
});
})();
