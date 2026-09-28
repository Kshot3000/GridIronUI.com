/* GridIronUI bet journal — the bettor's honest record (journal.html).
   Log every bet, settle the results, and the journal shows your true
   record, ROI and per-sport numbers. Everything lives in this browser's
   localStorage; export CSV to back it up. Pure math comes from
   BetMath (journalValid / journalProfit / journalStats / journalCSV).
   Loaded only on journal.html. */
(function(){
"use strict";
var BM = window.BetMath;
var LS_BETS = "giu.journal.v1", LS_SET = "giu.journal.settings.v1";
var RESULT_LABEL = { pending: "Pending", win: "Win", loss: "Loss", push: "Push" };

function $(id){ return document.getElementById(id); }
function esc(s){
  if(window.GIU && GIU.esc) return GIU.esc(s);
  return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function money(n){
  n = Number(n) || 0;
  var body = Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  return (n < 0 ? "-" : "") + "$" + body;
}
function loadBets(){
  try{ var b = JSON.parse(localStorage.getItem(LS_BETS)); return Array.isArray(b) ? b : []; }
  catch(e){ return []; }
}
function saveBets(bets){
  try{ localStorage.setItem(LS_BETS, JSON.stringify(bets)); }catch(e){}
}
function loadSettings(){
  try{ var s = JSON.parse(localStorage.getItem(LS_SET)); if(s && Number(s.unitSize) > 0) return s; }
  catch(e){}
  return { unitSize: 100 };
}
function saveSettings(s){ try{ localStorage.setItem(LS_SET, JSON.stringify(s)); }catch(e){} }
function nextId(bets){
  return bets.reduce(function(m,b){ return Math.max(m, Number(b.id) || 0); }, 0) + 1;
}
function priceChip(price){
  return '<span class="num">' + esc(String(price)) + "</span>";
}
function resultChip(r){
  var cls = r === "win" ? "pos" : (r === "loss" ? "neg" : "");
  return '<span class="res-chip ' + cls + '">' + RESULT_LABEL[r] + "</span>";
}

var bets = [];
var settings = { unitSize: 100 };

function summarize(){
  return BM.journalStats(bets, settings.unitSize);
}

function summaryHtml(s){
  function stat(label, value, sub, cls){
    return '<div class="hstat ' + (cls || "") + '"><b>' + value + "</b><span>" + label +
           (sub ? ' <em style="font-style:normal;color:var(--muted)">' + sub + "</em>" : "") + "</span></div>";
  }
  var units = (s.units > 0 ? "+" : "") + s.units.toFixed(2) + "u";
  var profitCls = s.profit > 0 ? "jr-pos" : (s.profit < 0 ? "jr-neg" : "");
  return stat("Record", s.wins + "-" + s.losses + "-" + s.pushes) +
    stat("Net profit", money(s.profit), "(" + units + ")", profitCls) +
    stat("ROI", (s.roi > 0 ? "+" : "") + s.roi.toFixed(1) + "%") +
    stat("Win rate", s.winRate.toFixed(1) + "%", s.wins + "/" + (s.wins + s.losses) + " decided") +
    stat("Streak", esc(s.streak)) +
    stat("Pending", String(s.pending));
}

function perSportHtml(s){
  var keys = Object.keys(s.perSport).sort();
  if(!keys.length) return '<p class="hint">Settle a bet and your per-sport numbers appear here.</p>';
  var rows = keys.map(function(k){
    var ps = s.perSport[k];
    var cls = ps.profit > 0 ? "jr-pos" : (ps.profit < 0 ? "jr-neg" : "");
    return "<tr><th>" + esc(k) + "</th><td>" + ps.w + "-" + ps.l + "-" + ps.p + "</td>" +
      "<td>" + money(ps.staked) + "</td>" +
      '<td class="' + cls + '">' + money(ps.profit) + "</td>" +
      '<td class="' + cls + '">' + (ps.roi > 0 ? "+" : "") + ps.roi.toFixed(1) + "%</td></tr>";
  }).join("");
  return '<table class="gd-stats" aria-label="Results by sport"><thead><tr><th>Sport</th><th>Record</th>' +
    "<th>Staked</th><th>Profit</th><th>ROI</th></tr></thead><tbody>" + rows + "</tbody></table>";
}

function betMatches(b, fSport, fResult){
  if(fSport !== "all" && String(b.sport) !== fSport) return false;
  if(fResult !== "all" && String(b.result) !== fResult) return false;
  return true;
}

function betsHtml(fSport, fResult){
  var rows = bets.filter(function(b){ return betMatches(b, fSport, fResult); });
  if(!rows.length){
    return '<tr><td colspan="6" class="hint" style="text-align:left">' +
      (bets.length ? "No bets match these filters." : "No bets logged yet — log your first bet above.") + "</td></tr>";
  }
  return rows.map(function(b){
    var p = b.profit;
    var pCls = b.result === "win" ? "jr-pos" : (b.result === "loss" ? "jr-neg" : "");
    var actions;
    if(b.result === "pending"){
      actions =
        '<button class="btn btn-ghost btn-sm j-settle" data-id="' + b.id + '" data-r="win" title="Mark as win">W</button> ' +
        '<button class="btn btn-ghost btn-sm j-settle" data-id="' + b.id + '" data-r="loss" title="Mark as loss">L</button> ' +
        '<button class="btn btn-ghost btn-sm j-settle" data-id="' + b.id + '" data-r="push" title="Mark as push">P</button>';
    } else {
      actions = '<button class="btn btn-ghost btn-sm j-undo" data-id="' + b.id +
        '" title="Back to pending">↩</button>';
    }
    actions += ' <button class="btn btn-ghost btn-sm j-del" data-id="' + b.id + '" title="Delete bet">✕</button>';
    return "<tr>" +
      "<td>" + esc(b.date || "") + "</td>" +
      "<td style=\"text-align:left\"><b>" + esc(b.event) + '</b><br><span class="hint">' +
        esc(b.sport) + " · " + esc(b.market) + " · " + esc(b.pick) + "</span></td>" +
      "<td>" + priceChip(b.price) + "</td>" +
      "<td>" + money(Number(b.stake)) + "</td>" +
      "<td>" + resultChip(b.result) + "</td>" +
      '<td class="' + pCls + '">' + (b.result === "pending" ? "—" : money(p)) + "</td>" +
      "<td>" + actions + "</td></tr>";
  }).join("");
}

function render(){
  var s = summarize();
  $("jSummary").innerHTML = summaryHtml(s);
  $("jPerSport").innerHTML = perSportHtml(s);
  var fSport = $("jFilterSport").value, fResult = $("jFilterResult").value;
  $("jBetsBody").innerHTML = betsHtml(fSport, fResult);
  var n = bets.length;
  $("jCount").textContent = n === 1 ? "1 bet logged" : n + " bets logged";
  /* sport filter options follow the logged sports */
  var sel = $("jFilterSport");
  var cur = sel.value;
  var sports = {};
  bets.forEach(function(b){ sports[String(b.sport)] = 1; });
  var opts = '<option value="all">All sports</option>' + Object.keys(sports).sort().map(function(k){
    return '<option value="' + esc(k) + '">' + esc(k) + "</option>";
  }).join("");
  sel.innerHTML = opts;
  sel.value = sports[cur] ? cur : "all";
}

function showErr(msg){
  var el = $("jErr");
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

function addBet(){
  showErr("");
  var b = {
    id: nextId(bets),
    date: $("jDate").value || new Date().toISOString().slice(0, 10),
    sport: $("jSport").value,
    event: $("jEvent").value.trim(),
    market: $("jMarket").value,
    pick: $("jPick").value.trim(),
    price: $("jPrice").value.trim(),
    stake: $("jStake").value.trim(),
    result: "pending"
  };
  var err = BM.journalValid(b);
  if(err){ showErr(err); return; }
  b.price = Number(b.price); b.stake = Number(b.stake);
  bets.push(b);
  saveBets(bets);
  $("jEvent").value = ""; $("jPick").value = ""; $("jPrice").value = ""; $("jStake").value = "";
  render();
}

function exportCSV(){
  if(!bets.length){ showErr("Nothing to export yet — log a bet first."); return; }
  var csv = BM.journalCSV(bets);
  var blob = new Blob([csv], {type: "text/csv"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gridironui-bet-journal-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

function tableClick(ev){
  var t = ev.target && ev.target.closest ? ev.target.closest("button") : null;
  if(!t) return;
  var id = Number(t.getAttribute("data-id"));
  var i = bets.findIndex(function(b){ return Number(b.id) === id; });
  if(i < 0) return;
  if(t.classList.contains("j-settle")){
    bets[i].result = t.getAttribute("data-r");
  } else if(t.classList.contains("j-undo")){
    bets[i].result = "pending";
  } else if(t.classList.contains("j-del")){
    if(!window.confirm("Delete this bet from the journal?")) return;
    bets.splice(i, 1);
  } else return;
  saveBets(bets);
  render();
}

function init(){
  if(!$("jBetsBody")) return; /* not on journal.html */
  bets = loadBets();
  settings = loadSettings();
  $("jUnit").value = settings.unitSize;
  $("jDate").value = new Date().toISOString().slice(0, 10);
  $("jAdd").addEventListener("click", addBet);
  $("jUnit").addEventListener("change", function(){
    var u = Number($("jUnit").value);
    if(u > 0 && isFinite(u)){ settings.unitSize = u; saveSettings(settings); render(); }
    else { $("jUnit").value = settings.unitSize; }
  });
  $("jFilterSport").addEventListener("change", render);
  $("jFilterResult").addEventListener("change", render);
  $("jBetsBody").addEventListener("click", tableClick);
  $("jExport").addEventListener("click", exportCSV);
  $("jClear").addEventListener("click", function(){
    if(!bets.length) return;
    if(window.confirm("Delete ALL " + bets.length + " logged bets? Export CSV first if you want a backup.")){
      bets = []; saveBets(bets); render();
    }
  });
  render();
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.Journal = { render: render, money: money, summaryHtml: summaryHtml, betsHtml: betsHtml };
})();
