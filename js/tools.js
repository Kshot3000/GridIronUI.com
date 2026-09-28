/* GridIronUI calculators — DOM wiring over window.BetMath (js/betmath.js) */
(function(){
"use strict";
function $(id){ return document.getElementById(id); }
function val(id){ return $(id).value.trim(); }
function num(id){ return parseFloat(val(id)); }
function show(id, html){ var e=$(id); e.innerHTML = html; e.style.display="block"; }
function err(id, msg){ show(id, '<span style="color:#ff9aa3">'+GIU.esc(msg)+'</span>'); }
/* Friendly nudge for empty fields — not an error. Placeholders are examples only. */
function note(id, msg){ show(id, '<span style="color:var(--muted)">'+GIU.esc(msg)+'</span>'); }
function isEmpty(id){ return val(id)===""; }
var EXAMPLE = "The grayed-out numbers are just examples — type your own values, then hit Calculate.";

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
  if(isEmpty("cIn")){ note("cOut", "Type some odds above, then hit Convert. "+EXAMPLE); return; }
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
  if(isEmpty("iIn")){ note("iOut", "Type some odds above, then hit Calculate. "+EXAMPLE); return; }
  try{
    var d = toDecimal(val("iIn"), val("iFmt"));
    var p = BetMath.round(100/d, 2);
    show("iOut", 'Implied probability: <span class="big gold num">'+p.toFixed(2)+'%</span><br><span style="font-size:.85rem;color:var(--muted)">The market is saying this outcome happens about '+p.toFixed(1)+'% of the time (before the book\'s margin).</span>');
  }catch(e){ err("iOut", e.message); }
});

/* 3 — payout */
$("pGo").addEventListener("click", function(){
  if(isEmpty("pOdds")||isEmpty("pStake")){ note("pOut", "Enter a stake and odds above, then hit Calculate. "+EXAMPLE); return; }
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
  var anyLeg = false;
  for(var i=1;i<=legN;i++){ var el=$("leg"+i); if(el && el.value.trim()){ anyLeg=true; break; } }
  if(!anyLeg){ note("plOut", "Add at least two legs' odds above, then hit Calculate parlay. The grayed-out numbers are just examples."); return; }
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

/* 4b — round robin */
var rrLegN = 0;
function rrLegs(){
  var legs = [];
  for(var i=1;i<=rrLegN;i++){ var el=$("rrLeg"+i); if(el && el.value.trim()) legs.push(toDecimal(el.value, $("rrLegf"+i).value)); }
  return legs;
}
function rrRenderSizes(){
  var box = $("rrSizes");
  var prev = {};
  var cbs = box.querySelectorAll("input[type=checkbox]");
  for(var q=0;q<cbs.length;q++) prev[cbs[q].value] = cbs[q].checked;
  var n = 0;
  for(var i=1;i<=rrLegN;i++){ var el=$("rrLeg"+i); if(el && el.value.trim()) n++; }
  var html = "";
  for(var k=2;k<=n;k++){
    var checked = (k in prev) ? prev[k] : (k===2);
    html += '<label style="display:flex;align-items:center;gap:6px;font-weight:600"><input type="checkbox" id="rrk'+k+'" value="'+k+'"'+(checked?' checked':'')+'> by '+k+'s</label>';
  }
  box.innerHTML = html || '<span style="color:var(--muted)">Add legs above to choose sizes.</span>';
}
function rrAddLeg(){
  rrLegN++;
  var row = document.createElement("div");
  row.className = "form-row"; row.style.marginBottom = "10px";
  row.innerHTML = '<div><label>Leg '+rrLegN+' odds</label><input type="text" id="rrLeg'+rrLegN+'" placeholder="-110"></div>'+
    '<div><label>Format</label><select id="rrLegf'+rrLegN+'"><option value="american">American</option><option value="decimal">Decimal</option><option value="fractional">Fractional</option></select></div>';
  $("rrLegRows").appendChild(row);
  var inp = $("rrLeg"+rrLegN);
  if(inp) inp.addEventListener("input", rrRenderSizes);
  rrRenderSizes();
}
rrAddLeg(); rrAddLeg(); rrAddLeg(); rrAddLeg();
$("rrAddLeg").addEventListener("click", rrAddLeg);
$("rrGo").addEventListener("click", function(){
  try{
    var legs = rrLegs();
    if(!legs.length){ note("rrOut", "Add at least two legs' odds above, then hit Calculate round robin. The grayed-out numbers are just examples."); return; }
    if(legs.length < 2) throw new Error("Enter at least two legs.");
    var sizes = [];
    for(var k=2;k<=legs.length;k++){ var cb = $("rrk"+k); if(cb && cb.checked) sizes.push(k); }
    if(!sizes.length) throw new Error("Pick at least one parlay size (by 2s, by 3s, ...).");
    var stake = num("rrStake");
    if(!(stake>0)) throw new Error("Enter a stake per parlay greater than 0.");
    var rows = BetMath.roundRobin(legs, sizes, stake);
    function money(v){ return "$"+v.toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2}); }
    function prof(v){ return '<b class="num" style="color:'+(v>=0?"#7fe8a0":"#ff9aa3")+'">'+(v>=0?"+":"")+money(v)+'</b>'; }
    var html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.95rem">'+
      '<tr style="color:var(--muted);text-align:left"><th style="padding:6px">Size</th><th style="padding:6px">Parlays</th><th style="padding:6px">Total risk</th><th style="padding:6px">All hit</th><th style="padding:6px">Worst leg loses</th><th style="padding:6px">Richest parlay</th></tr>';
    rows.forEach(function(r){
      html += '<tr style="border-top:1px solid rgba(255,255,255,.08)">'+
        '<td style="padding:8px 6px;font-weight:700">by '+r.k+'s</td>'+
        '<td class="num" style="padding:8px 6px">'+r.parlays+' × '+money(stake)+'</td>'+
        '<td class="num" style="padding:8px 6px">'+money(r.totalRisk)+'</td>'+
        '<td style="padding:8px 6px">'+prof(r.allWinProfit)+' <span style="color:var(--muted)">('+money(r.allWinReturn)+' back)</span></td>'+
        '<td style="padding:8px 6px">'+prof(r.worstLoserProfit)+' <span style="color:var(--muted)">('+money(r.worstLoserReturn)+' back)</span></td>'+
        '<td class="num" style="padding:8px 6px">legs '+r.richestCombo.join("+")+' · '+r.richestDec+'x</td></tr>';
    });
    html += '</table></div>'+
      '<p style="margin:12px 0 0;color:var(--muted);font-size:.85rem">Round robins soften one loss but don\'t erase the book\'s edge — every leg still carries vig, so a round robin of -110 legs needs each leg to win about 52.38% of the time just to break even.</p>';
    show("rrOut", html);
  }catch(e){ err("rrOut", e.message); }
});

/* 5 — kelly */
$("kGo").addEventListener("click", function(){
  if(isEmpty("kProb")||isEmpty("kOdds")){ note("kOut", "Enter your estimated win probability and the odds, then hit Calculate stake. "+EXAMPLE); return; }
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
  if(isEmpty("vA1")||isEmpty("vA2")){ note("vOut", "Enter both sides of the market above, then hit Remove the vig. "+EXAMPLE); return; }
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
/* 7 — hedge & arbitrage */
$("hGo").addEventListener("click", function(){
  if(isEmpty("hA")||isEmpty("hB")){ note("hOut", "Enter odds for both sides above, then hit Check for arb. "+EXAMPLE); return; }
  try{
    var dA = toDecimal(val("hA"), val("hFa")), dB = toDecimal(val("hB"), val("hFb"));
    var stakeRaw = val("hStake"), hasStake = stakeRaw !== "";
    var r = BetMath.hedge(dA, dB, hasStake ? parseFloat(stakeRaw) : null);
    var verdict = r.isArb
      ? '<span style="color:#7fe8a0"><strong>Arbitrage available — '+r.arbPct.toFixed(2)+'% guaranteed.</strong></span> The books disagree enough that both sides pay. <span style="color:var(--muted)">(Rare, and lines move fast — confirm both prices are live before betting.)</span>'
      : '<span style="color:#ffd37f"><strong>No arbitrage.</strong></span> The book holds <b class="num">'+r.holdPct.toFixed(2)+'%</b> on this pair of prices — no stake split can beat it.';
    var stakePlan = "";
    if(hasStake){
      var g = r.guaranteedProfit >= 0
        ? 'Guaranteed profit: <b class="num" style="color:#7fe8a0">$'+r.guaranteedProfit.toFixed(2)+'</b> — profit either way, this is the locked arb.'
        : 'This hedge costs you <b class="num" style="color:#ff9aa3">$'+Math.abs(r.guaranteedProfit).toFixed(2)+'</b> to lock in — you guarantee <b class="num" style="color:var(--text)">$'+r.guaranteedReturn.toFixed(2)+'</b> back no matter who wins. That\'s the price of insuring your ticket.';
      stakePlan = '<p style="margin:10px 0 0">Bet <b class="num gold">$'+r.stakeB.toFixed(2)+'</b> on side B to balance the payouts. Total staked: <b class="num">$'+r.totalStaked.toFixed(2)+'</b> → guaranteed return <b class="num">$'+r.guaranteedReturn.toFixed(2)+'</b>.<br>'+g+'</p>';
    }
    show("hOut", '<div>Implied: side A <b class="num">'+r.impA.toFixed(2)+'%</b> · side B <b class="num">'+r.impB.toFixed(2)+'%</b></div><p style="margin:8px 0 0">'+verdict+'</p>'+stakePlan);
  }catch(e){ err("hOut", e.message); }
});

/* 10 — ticket hedge planner: one leg left, lock profit or free-roll */
function thMoney(v){
  var neg = v < 0;
  return '<b class="num" style="color:'+(neg?"#ff9aa3":"#7fe8a0")+'">'+(neg?"−":"+")+'$'+Math.abs(v).toFixed(2)+'</b>';
}
$("thGo").addEventListener("click", function(){
  if(isEmpty("thStake")||isEmpty("thPays")||isEmpty("thHedge")){
    note("thOut", "Enter your stake, the ticket's full payout, and the hedge price above, then hit Plan my hedge. "+EXAMPLE); return;
  }
  try{
    var A = num("thStake"), T = num("thPays"), d = toDecimal(val("thHedge"), val("thFmt"));
    var r = BetMath.ticketHedge(A, T, d);
    var customRaw = val("thCustom"), hasCustom = customRaw !== "";
    var html = '<div class="grid grid-3" style="gap:10px">';
    /* equal lock */
    var lockLine = r.equalProfit >= 0
      ? 'Profit <b class="num" style="color:#7fe8a0">$'+r.equalProfit.toFixed(2)+'</b> either way — leg hits or misses, that money is yours.'
      : 'This guarantees a <b class="num" style="color:#ff9aa3">loss of $'+Math.abs(r.equalProfit).toFixed(2)+'</b> — the hedge price is too short to lock in profit. Let it ride or free-roll instead.';
    html += '<div><label>🔒 Equal lock</label><div class="big num" style="font-size:1.4rem">$'+r.equalStake.toFixed(2)+'</div>'+
      '<div style="color:var(--muted);font-size:.9rem">hedge stake</div><p style="margin:8px 0 0;font-size:.9rem">'+lockLine+'</p></div>';
    /* free-roll */
    html += '<div><label>🆓 Free-roll</label><div class="big num" style="font-size:1.4rem">$'+r.freeStake.toFixed(2)+'</div>'+
      '<div style="color:var(--muted);font-size:.9rem">hedge stake</div><p style="margin:8px 0 0;font-size:.9rem">Leg hits: '+thMoney(r.freeProfitHit)+
      ' profit. Leg misses: the hedge hands your <b class="num">$'+r.stake.toFixed(2)+'</b> stake back — you risk nothing, for free.</p></div>';
    /* custom */
    if(hasCustom){
      var c = r.outcomes(parseFloat(customRaw));
      html += '<div><label>🎯 Your stake</label><div class="big num" style="font-size:1.4rem">$'+c.stake.toFixed(2)+'</div>'+
        '<div style="color:var(--muted);font-size:.9rem">hedge stake</div><p style="margin:8px 0 0;font-size:.9rem">Leg hits: '+thMoney(c.profitHit)+
        ' · leg misses: '+thMoney(c.profitMiss)+'.</p></div>';
    } else {
      html += '<div><label>🎯 Your stake</label><div class="big num" style="font-size:1.4rem;color:var(--faint)">—</div>'+
        '<div style="color:var(--muted);font-size:.9rem">hedge stake</div><p style="margin:8px 0 0;font-size:.9rem">Type a hedge stake above to size your own plan — the math fills in here.</p></div>';
    }
    html += '</div>';
    html += '<p style="margin:12px 0 0;color:var(--muted);font-size:.9rem">Let it ride instead: leg hits → '+thMoney(r.rideProfit)+
      ' · leg misses → <b class="num" style="color:#ff9aa3">−$'+r.stake.toFixed(2)+'</b>. The equal lock costs you <b class="num gold">$'+
      r.insuranceCost.toFixed(2)+'</b> of that upside — that is the price of certainty.</p>';
    html += '<p style="margin:10px 0 0;color:var(--muted);font-size:.85rem">Honest fine print: the hedge price already carries the book\u2019s margin, so a locked profit is always smaller than the ticket\u2019s paper value — hedging pays the vig twice. Lines move fast, so confirm the hedge price is live before you size it, and know that books notice habitual hedgers. A hedge turns variance into certainty; it never turns a -EV ticket into a +EV one.</p>';
    show("thOut", html);
  }catch(e){ err("thOut", e.message); }
});

/* ================= bankroll risk simulator (Monte Carlo) ================= */
function mcMoney(v){
  var a = Math.abs(v);
  if(a >= 1000000) return "$"+(v/1000000).toFixed(1)+"M";
  if(a >= 10000) return "$"+Math.round(v/1000)+"k";
  return "$"+Math.round(v).toLocaleString("en-US");
}
function mcCanvas(id){
  var c = $(id), dpr = Math.min(2, window.devicePixelRatio || 1);
  var w = Math.max(280, c.parentElement.clientWidth - 4), h = parseInt(c.getAttribute("data-h"), 10) || 220;
  c.width = w*dpr; c.height = h*dpr; c.style.width = w+"px"; c.style.height = h+"px";
  var x = c.getContext("2d"); x.setTransform(dpr,0,0,dpr,0,0);
  x.clearRect(0,0,w,h); return {c:c, x:x, w:w, h:h};
}
function mcHist(id, ends, start, median){
  var g = mcCanvas(id), x = g.x, W = g.w, H = g.h;
  var padL = 44, padB = 26, padT = 14, padR = 10;
  var mn = Math.min.apply(null, ends), mx = Math.max.apply(null, ends);
  if(mx - mn < 1e-9){ mx = mn + Math.max(1, Math.abs(mn)*0.02); mn = mn - (mx-mn)/2; }
  var NB = 28, bins = new Array(NB).fill(0);
  ends.forEach(function(v){ var b = Math.min(NB-1, Math.floor((v-mn)/(mx-mn)*NB)); bins[b]++; });
  var peak = Math.max.apply(null, bins);
  function X(v){ return padL + (v-mn)/(mx-mn)*(W-padL-padR); }
  function Y(n){ return padT + (1 - n/peak)*(H-padT-padB); }
  x.strokeStyle = "rgba(255,255,255,.08)"; x.fillStyle = "#9aa6bb";
  x.font = "10px system-ui, sans-serif"; x.lineWidth = 1;
  for(var gi=0; gi<=4; gi++){ var gy = padT + gi/4*(H-padT-padB);
    x.beginPath(); x.moveTo(padL, gy); x.lineTo(W-padR, gy); x.stroke();
    x.fillText(String(Math.round(peak*(1-gi/4))), 6, gy+3); }
  var bw = (W-padL-padR)/NB;
  bins.forEach(function(n, i){
    if(!n) return;
    var gx = padL + i*bw + 1, gy2 = Y(n);
    var grad = x.createLinearGradient(0, gy2, 0, H-padB);
    grad.addColorStop(0, "rgba(240,180,41,.95)"); grad.addColorStop(1, "rgba(240,180,41,.25)");
    x.fillStyle = grad; x.fillRect(gx, gy2, Math.max(1, bw-2), H-padB-gy2);
  });
  function vline(v, color, dash, label){
    x.strokeStyle = color; x.setLineDash(dash); x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(X(v), padT); x.lineTo(X(v), H-padB); x.stroke();
    x.setLineDash([]); x.fillStyle = color; x.fillText(label, Math.min(W-58, Math.max(padL+2, X(v)-44)), padT+10);
  }
  vline(start, "rgba(255,255,255,.75)", [4,3], "start "+mcMoney(start));
  vline(median, "#7fe8a0", [], "median "+mcMoney(median));
  x.fillStyle = "#9aa6bb";
  x.fillText(mcMoney(mn), padL, H-8); x.fillText(mcMoney(mx), W-padR-44, H-8);
}
function mcCurves(id, curves, start, nBets){
  var g = mcCanvas(id), x = g.x, W = g.w, H = g.h;
  var padL = 44, padB = 22, padT = 14, padR = 10;
  var mn = start, mx = start;
  curves.forEach(function(c){ c.forEach(function(v){ if(v<mn) mn=v; if(v>mx) mx=v; }); });
  if(mx - mn < 1e-9){ mx = mn*1.1 + 1; }
  mn = Math.min(mn, start*0.9);
  function X(i){ var n = curves[0] ? curves[0].length-1 : 1; return padL + (i/Math.max(1,n))*(W-padL-padR); }
  function Y(v){ return padT + (1 - (v-mn)/(mx-mn))*(H-padT-padB); }
  x.strokeStyle = "rgba(255,255,255,.08)"; x.fillStyle = "#9aa6bb";
  x.font = "10px system-ui, sans-serif"; x.lineWidth = 1;
  for(var gi=0; gi<=3; gi++){ var gy = padT + gi/3*(H-padT-padB);
    x.beginPath(); x.moveTo(padL, gy); x.lineTo(W-padR, gy); x.stroke();
    x.fillText(mcMoney(mn + (mx-mn)*(1-gi/3)), 2, gy+3); }
  curves.forEach(function(c, ci){
    x.strokeStyle = ci % 5 === 0 ? "rgba(240,180,41,.55)" : "rgba(127,232,160,.30)";
    x.lineWidth = 1; x.beginPath();
    c.forEach(function(v, i){ var px = X(i), py = Y(v); if(i===0) x.moveTo(px,py); else x.lineTo(px,py); });
    x.stroke();
  });
  x.strokeStyle = "rgba(255,255,255,.7)"; x.setLineDash([4,3]); x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(padL, Y(start)); x.lineTo(W-padR, Y(start)); x.stroke(); x.setLineDash([]);
  x.fillStyle = "#9aa6bb"; x.fillText("0", padL, H-6);
  x.fillText(nBets+" bets →", W-padR-64, H-6);
}
function mcStat(label, value, color){
  return '<div style="background:rgba(255,255,255,.04);border:1px solid var(--line-soft);border-radius:10px;padding:10px 12px;min-width:0">'+
    '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">'+GIU.esc(label)+'</div>'+
    '<div class="num" style="font-size:20px;font-weight:700;color:'+color+'">'+value+'</div></div>';
}
$("mcGo").addEventListener("click", function(){
  try{
    var bank = parseFloat(val("mcBank"));
    if(!(bank>0)) throw new Error("Enter a starting bankroll greater than $0.");
    var mode = $("mcStakeMode").value;
    var stake = parseFloat(val("mcStake"));
    if(!(stake>0)) throw new Error("Enter a stake greater than 0.");
    if(mode==="pct" && stake>100) throw new Error("Stake as % of bankroll must be 100 or less.");
    var prob = parseFloat(val("mcProb"));
    if(!(prob>0 && prob<100)) throw new Error("Win probability must be between 0 and 100 (exclusive of 0/100).");
    var d = toDecimal(val("mcOdds"), "american");
    var bets = Math.floor(parseFloat(val("mcBets")));
    if(!(bets>=10 && bets<=10000)) throw new Error("Bets in the run must be between 10 and 10,000.");
    var sims = parseInt($("mcSims").value, 10);
    var r = BetMath.simulateBankroll({
      startBankroll: bank, stakeMode: mode, stake: stake,
      winProb: prob/100, decimalOdds: d, nBets: bets, nSims: sims,
      ruinFrac: mode === "pct" ? 0.05 : 0, nCurves: 40
    }, function(){ return Math.random(); });
    var ruinLabel = mode === "pct" ? "Risk of ruin (down 95%+)" : "Risk of ruin (hits $0)";
    var ev = r.evPerBet*100;
    var stakeDesc = mode === "pct" ? stake+"% of bankroll" : "$"+stake+" flat";
    var html =
      '<div style="color:var(--muted);font-size:13px;margin-bottom:10px">'+GIU.esc(sims.toLocaleString("en-US"))+
      ' simulated seasons · '+GIU.esc(String(bets))+' bets each · '+GIU.esc(stakeDesc)+
      ' · win '+GIU.esc(String(prob))+'% @ '+GIU.esc(val("mcOdds"))+
      ' · expected value <b class="num" style="color:'+(ev>=0?"#7fe8a0":"#ff9aa3")+'">'+(ev>=0?"+":"")+ev.toFixed(2)+'%</b> per bet</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin-bottom:14px">'+
      mcStat("Median ending", mcMoney(r.median), "#f0b429")+
      mcStat("Chance of profit", (r.pProfit*100).toFixed(1)+"%", r.pProfit>=0.5?"#7fe8a0":"#ff9aa3")+
      mcStat(ruinLabel, (r.pRuin*100).toFixed(1)+"%", r.pRuin>0.05?"#ff9aa3":"#7fe8a0")+
      mcStat("Chance of doubling", (r.pDouble*100).toFixed(1)+"%", "#7fe8a0")+
      mcStat("Middle 90% ends between", mcMoney(r.p5)+" – "+mcMoney(r.p95), "var(--text)")+
      '</div>'+
      '<div style="font-size:12px;color:var(--muted);margin:10px 0 6px;font-weight:600;letter-spacing:.04em">WHERE '+sims.toLocaleString("en-US")+' SEASONS END</div>'+
      '<canvas id="mcHist" data-h="220" role="img" aria-label="Histogram of ending bankrolls. Median '+mcMoney(r.median)+', risk of ruin '+(r.pRuin*100).toFixed(1)+' percent."></canvas>'+
      '<div style="font-size:12px;color:var(--muted);margin:14px 0 6px;font-weight:600;letter-spacing:.04em">40 SAMPLE SEASONS</div>'+
      '<canvas id="mcCurves" data-h="200" role="img" aria-label="Forty sample bankroll paths over '+bets+' bets."></canvas>'+
      '<p style="margin:12px 0 0;color:var(--muted);font-size:13px">This assumes every bet is independent at exactly the win rate and price you entered — no line moves, no limits, no tilt, no bad beats clustering. '+
      'Your real edge is almost certainly smaller than you think; that is the point of the tool. A winning edge can still go broke on oversized stakes — compare a flat stake against % of bankroll above, and size stakes with the <a href="#kelly">Kelly calculator</a>. '+
      'Learn the concepts in <a href="guides/bankroll.html">Bankroll management</a>. Simulation is not a prediction.</p>';
    show("mcOut", html);
    mcHist("mcHist", r.ends, bank, r.median);
    mcCurves("mcCurves", r.curves, bank, bets);
    $("mcOut").scrollIntoView({block:"nearest", behavior:"smooth"});
  }catch(e){ err("mcOut", e.message); }
});
})();
