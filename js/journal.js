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
var LS_HIST = "giu-odds-history"; /* written by js/odds.js after each board pull
  (v1.143.0; per-side moneyline prices added v1.145.0) */
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
/* closeEditing: id of the bet whose closing price is being edited inline
   (null = no row in edit mode). Editing survives validation failures so a
   typo doesn't eat what was typed. */
var closeEditing = null;

function summarize(){
  var s = BM.journalStats(bets, settings.unitSize);
  s.clv = BM.journalClvStats(bets);
  return s;
}

/* American price with an explicit + sign, e.g. +150 / -110. */
function fmtAm(v){ var n = Number(v); return (n > 0 ? "+" : "") + n; }

/* One-line closing-line-value readout under the bet's price: "▲ close -105".
   Silent when no closing price is recorded — no data beats invented data. */
function clvLine(b){
  var v = BM.clv(b.price, b.close);
  if(v === null) return "";
  var cls = v > 0 ? "jr-pos" : (v < 0 ? "jr-neg" : "");
  var arrow = v > 0 ? "▲" : (v < 0 ? "▼" : "=");
  var what = v > 0 ? "beat the close" : (v < 0 ? "worse than the close" : "same as the close");
  return '<br><span class="' + cls + '" style="font-size:.72rem;white-space:nowrap" title="Your ' +
    esc(fmtAm(b.price)) + " vs the closing " + esc(fmtAm(b.close)) + " — " + what + '.">' +
    arrow + " close " + esc(fmtAm(b.close)) + "</span>";
}

function summaryHtml(s){
  function stat(label, value, sub, cls){
    return '<div class="hstat ' + (cls || "") + '"><b>' + value + "</b><span>" + label +
           (sub ? ' <em style="font-style:normal;color:var(--muted)">' + sub + "</em>" : "") + "</span></div>";
  }
  var units = (s.units > 0 ? "+" : "") + s.units.toFixed(2) + "u";
  var profitCls = s.profit > 0 ? "jr-pos" : (s.profit < 0 ? "jr-neg" : "");
  var html = stat("Record", s.wins + "-" + s.losses + "-" + s.pushes) +
    stat("Net profit", money(s.profit), "(" + units + ")", profitCls) +
    stat("ROI", (s.roi > 0 ? "+" : "") + s.roi.toFixed(1) + "%") +
    stat("Win rate", s.winRate.toFixed(1) + "%", s.wins + "/" + (s.wins + s.losses) + " decided") +
    stat("Streak", esc(s.streak)) +
    stat("Pending", String(s.pending));
  /* Beat the close: the sharp bettor's report card. Only appears once at
     least one bet carries a closing price — a perpetually-empty stat would
     be decoration, not information. */
  if(s.clv && s.clv.total > 0){
    var pct = Math.round(100 * s.clv.beat / s.clv.total);
    var clvCls = pct >= 55 ? "jr-pos" : (pct <= 45 ? "jr-neg" : "");
    html += stat("Beat the close", s.clv.beat + "/" + s.clv.total, pct + "% of recorded closes", clvCls);
    html += '<div class="hint" style="margin-top:8px;font-size:.74rem;line-height:1.5">Closing prices are self-reported — books close differently. ' +
      "Pros judge themselves against the close: beating it consistently is what sharp action looks like.</div>";
  }
  return html;
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

/* ---- ledger search (v1.160.0) ----
   A season-long ledger outgrows the sport/result dropdowns: the bettor
   hunting "every Bears bet" or "Mahomes props" had to scroll the whole
   table. Pure core: the query splits into terms and EVERY term must appear
   somewhere in the bet's searchable text (event, pick, sport, market,
   date) — so "nfl bears" and "mahomes prop" narrow across fields, while a
   term that appears nowhere matches nothing, never everything. Garbage-in
   (null bet, non-string fields) -> coerced text, never a throw. */
function searchTerms(q){
  return String(q == null ? "" : q).toLowerCase().split(/\s+/).filter(Boolean);
}
function betSearchText(b){
  if(!b) return "";
  return [b.event, b.pick, b.sport, b.market, b.date]
    .map(function(v){ return String(v == null ? "" : v); }).join(" ").toLowerCase();
}
function betMatchesSearch(b, q){
  var terms = searchTerms(q);
  if(!terms.length) return true;
  var hay = betSearchText(b);
  return terms.every(function(t){ return hay.indexOf(t) !== -1; });
}
/* XSS-safe <mark> highlighting, same per-segment discipline as the
   glossary/news/tools finders: scan the RAW text for any query term
   (earliest match wins, longest term wins ties), escape every emitted
   segment, wrap only the matched slices. No query -> plain escaped text,
   byte-identical to the pre-search render. */
function hlHtml(text, q){
  var s = String(text == null ? "" : text);
  var terms = searchTerms(q).sort(function(a, b){ return b.length - a.length; });
  if(!terms.length || !s) return esc(s);
  var lower = s.toLowerCase(), out = "", i = 0;
  while(i < s.length){
    var at = -1, len = 0;
    terms.forEach(function(t){
      var j = lower.indexOf(t, i);
      if(j !== -1 && (at === -1 || j < at || (j === at && t.length > len))){ at = j; len = t.length; }
    });
    if(at === -1){ out += esc(s.slice(i)); break; }
    out += esc(s.slice(i, at)) + "<mark>" + esc(s.slice(at, at + len)) + "</mark>";
    i = at + len;
  }
  return out;
}

function betMatches(b, fSport, fResult, q){
  if(fSport !== "all" && String(b.sport) !== fSport) return false;
  if(fResult !== "all" && String(b.result) !== fResult) return false;
  return betMatchesSearch(b, q);
}

function betsHtml(fSport, fResult, q){
  var rows = bets.filter(function(b){ return betMatches(b, fSport, fResult, q); });
  if(!rows.length){
    var msg;
    if(!bets.length) msg = "No bets logged yet — log your first bet above.";
    else if(searchTerms(q).length) msg = "No bets match \u201C" + String(q).trim() + "\u201D — try a team, pick or market, or clear the search.";
    else msg = "No bets match these filters.";
    return '<tr><td colspan="7" class="hint" style="text-align:left">' + esc(msg) + "</td></tr>";
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
    /* Record (or fix) the closing price — only knowable after kickoff, so it
       lives on the row as an inline editor rather than in the log form. */
    actions += ' <button class="btn btn-ghost btn-sm j-close-edit" data-id="' + b.id +
      '" title="Record the closing price (optional — what the price was at kickoff)">✎</button>';
    var priceCell;
    if(closeEditing === b.id){
      priceCell = '<input id="jCloseIn" inputmode="numeric" value="' +
        esc(b.close == null ? "" : String(b.close)) +
        '" placeholder="e.g. -105" aria-label="Closing price, American" style="width:88px">' +
        ' <button class="btn btn-ghost btn-sm j-close-save" data-id="' + b.id + '" title="Save closing price">✓</button>' +
        ' <button class="btn btn-ghost btn-sm j-close-cancel" title="Cancel">↩</button>';
    } else {
      priceCell = priceChip(b.price) + clvLine(b);
    }
    return "<tr>" +
      "<td>" + esc(b.date || "") + "</td>" +
      "<td style=\"text-align:left\"><b>" + hlHtml(b.event, q) + '</b><br><span class="hint">' +
        hlHtml(b.sport, q) + " · " + hlHtml(b.market, q) + " · " + hlHtml(b.pick, q) + "</span></td>" +
      "<td>" + priceCell + "</td>" +
      "<td>" + money(Number(b.stake)) + "</td>" +
      "<td>" + resultChip(b.result) + "</td>" +
      '<td class="' + pCls + '">' + (b.result === "pending" ? "—" : money(p)) + "</td>" +
      "<td>" + actions + "</td></tr>";
  }).join("");
}

function curveCaption(curve){
  if(!curve.settled) return "";
  var f = curve.final;
  return "cumulative " + (f >= 0 ? "+" : "") + money(f).replace("$-", "-$") +
    " over " + curve.settled + " settled bet" + (curve.settled === 1 ? "" : "s");
}

function paintCurve(){
  /* Bankroll curve: DPR-aware static canvas of cumulative settled profit.
     Quiet empty state (no settled bets -> the whole block hides); null
     canvas context -> silent no-op. */
  var cv = $("jCurve"), wrap = $("jCurveWrap");
  if(!cv || !wrap) return;
  var curve = BM.journalCurve(bets);
  if(!curve.settled){ wrap.style.display = "none"; return; }
  wrap.style.display = "";
  var ctx = cv.getContext && cv.getContext("2d");
  if(!ctx) return;
  var W = cv.clientWidth || 640, H = cv.clientHeight || 220;
  var DPR = Math.min(2, (window.devicePixelRatio || 1));
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  var padL = 56, padR = 60, padT = 14, padB = 28;
  var iw = W - padL - padR, ih = H - padT - padB;
  var pts = curve.points;
  var vals = pts.map(function(p){ return p.cum; });
  var lo = Math.min.apply(null, [0].concat(vals));
  var hi = Math.max.apply(null, [0].concat(vals));
  if(hi - lo < 1) hi = lo + 1;              /* flat stretch still gets breathing room */
  var pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  function X(i){ return padL + (pts.length === 1 ? iw / 2 : iw * i / (pts.length - 1)); }
  function Y(v){ return padT + ih * (1 - (v - lo) / (hi - lo)); }
  var up = curve.final >= 0;
  var line = up ? "#17c964" : "#f04452";
  /* faint quarter gridlines + labels */
  ctx.font = "10.5px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  [0, 0.25, 0.5, 0.75, 1].forEach(function(q, qi){
    var v = lo + (hi - lo) * q, y = Y(v);
    ctx.strokeStyle = qi === 0 || qi === 4 ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.035)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.38)";
    ctx.textAlign = "left";
    ctx.fillText((v < 0 ? "-" : "") + "$" + Math.abs(v).toFixed(0), 6, y);
  });
  /* zero line */
  ctx.strokeStyle = "rgba(240,180,41,.45)";
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();
  ctx.setLineDash([]);
  /* area fill */
  var grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
  grad.addColorStop(0, up ? "rgba(23,201,100,.28)" : "rgba(240,68,82,.28)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  pts.forEach(function(p, i){ ctx.lineTo(X(i), Y(p.cum)); });
  ctx.lineTo(X(pts.length - 1), Y(0));
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  /* the line itself */
  ctx.beginPath();
  pts.forEach(function(p, i){ if(i === 0) ctx.moveTo(X(i), Y(p.cum)); else ctx.lineTo(X(i), Y(p.cum)); });
  ctx.strokeStyle = line; ctx.lineWidth = 2.4;
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
  /* dots on each settled bet */
  ctx.fillStyle = line;
  pts.forEach(function(p, i){
    ctx.beginPath(); ctx.arc(X(i), Y(p.cum), 3, 0, Math.PI * 2); ctx.fill();
  });
  /* first/last dates along the bottom */
  ctx.fillStyle = "rgba(255,255,255,.42)";
  ctx.textAlign = pts.length === 1 ? "center" : "left";
  ctx.fillText(pts[0].date, X(0), H - 10);
  if(pts.length > 1){
    ctx.textAlign = "right";
    ctx.fillText(pts[pts.length - 1].date, X(pts.length - 1), H - 10);
  }
  /* final value pinned at the last point */
  var last = pts[pts.length - 1];
  ctx.textAlign = "left"; ctx.font = "700 12.5px Inter, system-ui, sans-serif";
  ctx.fillStyle = line;
  ctx.fillText((last.cum >= 0 ? "+" : "-") + "$" + Math.abs(last.cum).toFixed(2),
               Math.min(X(pts.length - 1) + 8, W - padR - 58), Y(last.cum));
  if(cv.setAttribute){
    cv.setAttribute("aria-label",
      "Bankroll curve: " + curve.settled + " settled bets, net " + money(curve.final) +
      ", from " + pts[0].date + " to " + last.date + ".");
  }
  var cap = $("jCurveCap");
  if(cap) cap.textContent = curveCaption(curve);
}

function render(){
  var s = summarize();
  $("jSummary").innerHTML = summaryHtml(s);
  paintCurve();
  $("jPerSport").innerHTML = perSportHtml(s);
  var fSport = $("jFilterSport").value, fResult = $("jFilterResult").value;
  var qEl = $("jSearch");
  var q = qEl ? String(qEl.value || "") : "";
  $("jBetsBody").innerHTML = betsHtml(fSport, fResult, q);
  /* honest shown-count: only narrates while a search/filter is narrowing
     the ledger — at rest the heading count above already says it all */
  var mc = $("jMatchCount");
  if(mc){
    var narrowing = searchTerms(q).length > 0 || fSport !== "all" || fResult !== "all";
    var shown = bets.filter(function(b){ return betMatches(b, fSport, fResult, q); }).length;
    mc.textContent = (narrowing && bets.length) ? shown + " of " + bets.length + " bets shown" : "";
  }
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

function betSig(b){
  /* Dedup signature: an exact content match counts as the same logged bet,
     so importing the same CSV twice can't double the journal. */
  return [b.date, b.sport, b.event, b.market, b.pick, b.price,
          b.close == null ? "" : b.close, b.stake, b.result].join("\u0001");
}

function importCSV(file){
  if(!file){ showErr("Pick a CSV file to import."); return; }
  var read = (file.text && file.text.bind(file)) || function(){
    return new Promise(function(res, rej){
      var fr = new FileReader();
      fr.onload = function(){ res(String(fr.result || "")); };
      fr.onerror = function(){ rej(new Error("read failed")); };
      fr.readAsText(file);
    });
  };
  read().then(function(text){
    var r = BM.journalCSVImport(text);
    var seen = {};
    bets.forEach(function(b){ seen[betSig(b)] = 1; });
    var added = 0, dupes = 0;
    r.bets.forEach(function(b){
      if(seen[betSig(b)]){ dupes++; return; }
      b.id = nextId(bets);
      bets.push(b);
      seen[betSig(b)] = 1;
      added++;
    });
    saveBets(bets);
    render();
    var parts = [];
    if(added) parts.push("Imported " + added + " bet" + (added === 1 ? "" : "s") + ".");
    else parts.push("No new bets imported.");
    if(dupes) parts.push(dupes + " duplicate" + (dupes === 1 ? "" : "s") + " already in the journal — skipped.");
    if(r.skipped) parts.push(r.skipped + " row" + (r.skipped === 1 ? "" : "s") + " skipped: " + r.errors.slice(0, 5).join(" ") +
      (r.errors.length > 5 ? " (+" + (r.errors.length - 5) + " more)" : ""));
    showErr(parts.join(" "));
  }).catch(function(){
    showErr("Couldn't read that file — try exporting a fresh CSV from the journal first.");
  });
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
  } else if(t.classList.contains("j-close-edit")){
    closeEditing = id; /* re-render paints the inline editor on this row */
  } else if(t.classList.contains("j-close-save")){
    var raw = ($("jCloseIn") || {}).value;
    var err = BM.closeValid(raw);
    if(err){ showErr(err); return; } /* stay in edit mode; nothing lost */
    var s = String(raw == null ? "" : raw).trim();
    if(s === "") delete bets[i].close; else bets[i].close = Number(s);
    closeEditing = null;
  } else if(t.classList.contains("j-close-cancel")){
    closeEditing = null;
  } else return;
  saveBets(bets);
  render();
}

/* ---- closing-line auto-fill (v1.143.0; moneyline per-side closes v1.145.0) ----
   Pure, testable core. normalizePair builds the canonical "A|B" pair key
   (sorted uppercase, "|" joined) — the same format js/odds.js writes into
   giu-odds-history. matchSnapshot(bet, snaps) picks the latest stored
   snapshot for a bet: bet is {pair, date} with pair pre-resolved via
   normalizePair; the snapshot's GAME date must fall within the 30h before
   the end of the bet's date (a close only counts when the snapshot priced a
   game that was actually about to go off). Latest stored snapshot wins;
   anything malformed or unmatched -> null, never a guess.
   closeValueFor(bet, snap, dir) resolves WHICH price a bet gets from its
   snapshot: spread/total use the canonical-side consensus (v1.143.0),
   moneyline uses the picked team's own consensus price (v1.145.0), and
   anything else stays blank. */
function normalizePair(a, b){
  var x = String(a == null ? "" : a).trim().toUpperCase();
  var y = String(b == null ? "" : b).trim().toUpperCase();
  if(!x || !y) return null;
  return [x, y].sort().join("|");
}
var CLOSE_WINDOW_MS = 30 * 3600 * 1000;
function betEventEndMs(dateStr){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr == null ? "" : dateStr));
  if(!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime();
}
function matchSnapshot(bet, snaps){
  if(!bet || !bet.pair || !Array.isArray(snaps)) return null;
  var betT = betEventEndMs(bet.date);
  if(!isFinite(betT)) return null;
  var best = null;
  snaps.forEach(function(s){
    if(!s || s.pair !== bet.pair) return;
    var g = Date.parse(s.date);
    if(!isFinite(g)) return;
    var gap = betT - g;
    if(gap < 0 || gap > CLOSE_WINDOW_MS) return;
    if(!best || Number(s.t || 0) > Number(best.t || 0)) best = s;
  });
  return best;
}

function loadHistory(){
  /* Malformed storage (or private mode) -> empty history, never a throw. */
  try{
    var h = JSON.parse(localStorage.getItem(LS_HIST));
    return Array.isArray(h) ? h : [];
  }catch(e){ return []; }
}

/* Bet -> canonical pair key via the ESPN identity directory (team-brand.js).
   The slip writes events as "Away @ Home"; manual entries are free text, so
   "vs"/"v" and a trailing " (Book)" suffix are accepted too. Unknown teams
   or unparseable events -> null: the bet stays blank, honestly. */
var SPORT_LEAGUE = { NFL: "nfl", NBA: "nba", MLB: "mlb", NHL: "nhl", EPL: "epl" };
var ALL_LEAGUES = ["nfl", "nba", "mlb", "nhl", "epl"];
function resolveBetSides(dir, bet){
  /* Ordered [abbr0, abbr1] for the event AS WRITTEN (slip: "Away @ Home"),
     plus the league order tried. null when unresolvable — callers leave the
     bet blank rather than guessing a side. */
  if(!window.GIU || !GIU.teamFind) return null;
  var ev = String((bet && bet.event) || "").replace(/\s*\([^()]*\)\s*$/, "");
  var parts = ev.split(/\s+@\s+|\s+vs\.?\s+|\s+v\s+/i);
  if(parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
  var sportKey = SPORT_LEAGUE[String((bet && bet.sport) || "").toUpperCase()];
  var leagues = (sportKey ? [sportKey] : [])
    .concat(ALL_LEAGUES.filter(function(l){ return l !== sportKey; }));
  var abbrs = parts.map(function(p){
    var q = p.trim(), i, t;
    for(i = 0; i < leagues.length; i++){
      t = GIU.teamFind(dir, leagues[i], q);
      if(t && t.abbr) return String(t.abbr).toUpperCase();
    }
    return null;
  });
  if(!abbrs[0] || !abbrs[1]) return null;
  return { sides: abbrs, leagues: leagues };
}
function resolveBetPair(dir, bet){
  var r = resolveBetSides(dir, bet);
  return r ? normalizePair(r.sides[0], r.sides[1]) : null;
}

/* Moneyline needs the bettor's SIDE, not a canonical side: the close is the
   closing price of the picked team (v1.145.0). Slip-written picks are
   "Team Label" ("Kansas City Chiefs -150"); manual picks are usually a bare
   name. Trailing price-ish tokens are stripped and each remainder is tried
   against the directory, but only a team actually in this bet's event is
   accepted — a pick resolving to a third team is an inconsistent bet and
   stays blank, never a guess. */
function resolvePickAbbr(dir, bet){
  var r = resolveBetSides(dir, bet);
  if(!r) return null;
  var sides = r.sides, leagues = r.leagues;
  function find(q){
    var i, t;
    for(i = 0; i < leagues.length; i++){
      t = GIU.teamFind(dir, leagues[i], q);
      if(t && t.abbr){
        var a = String(t.abbr).toUpperCase();
        if(a === sides[0] || a === sides[1]) return a;
      }
    }
    return null;
  }
  var pick = String((bet && bet.pick) || "").trim();
  if(!pick || pick === "?") return null;
  var hit = find(pick);
  if(hit) return hit;
  var toks = pick.split(/\s+/);
  while(toks.length > 1){
    var last = toks[toks.length - 1];
    if(/^[+-]?\d+(\.\d+)?$/.test(last) || last === "·") toks.pop();
    else break;
  }
  return find(toks.join(" "));
}

var teamDirP = null;
function getTeamDir(){
  if(!teamDirP){
    var p = (window.GIU && GIU.teamDir) ? GIU.teamDir() : Promise.resolve({});
    teamDirP = p.then(function(d){ return d || {}; }, function(){ return {}; });
  }
  return teamDirP;
}

/* Which closing price a bet gets from its matched snapshot — pure (v1.145.0).
   Spread uses the snapshot's consensus away-spread price, Total the over
   price (v1.143.0); Moneyline uses the consensus price of the PICKED team —
   a dog bettor's CLV compares against the dog's own close, not the
   favorite's, because moneyline sides are not mirror images. Snapshots
   saved before v1.145.0 carry no ml map -> moneyline bets stay blank,
   honestly. Other markets (Parlay, …) have no stored close -> blank.
   Returns a whole American number, or null (never a guess). */
function realNum(v){
  var n = Number(v);
  return (isFinite(n) && n !== 0) ? Math.round(n) : null;
}
function closeValueFor(bet, snap, dir){
  if(!snap) return null;
  var m = String((bet && bet.market) == null ? "" : bet.market);
  if(m === "Spread") return realNum(snap.spread);
  if(m === "Total") return realNum(snap.total);
  if(m === "Moneyline"){
    var abbr = resolvePickAbbr(dir, bet);
    if(!abbr) return null;
    var ml = (snap && snap.ml) || {};
    return realNum(ml[abbr]);
  }
  return null;
}

/* "Auto-fill closing lines": for every bet WITHOUT a manually recorded
   close, take the latest stored odds-board snapshot for the same teams in
   the 30h window and record its closing price. Manual closes are never
   touched; bets with no match stay blank and the report says exactly how
   many filled. Returns a promise (the team directory loads async). */
function autoFillCloses(){
  showErr("");
  var btn = $("jAutofill");
  var snaps = loadHistory();
  var cands = bets.filter(function(b){ return b.close == null || b.close === ""; });
  function done(msg, n){
    showErr(msg);
    if(btn){ btn.disabled = false; btn.textContent = "⚡ Auto-fill closing lines"; }
    return n;
  }
  if(!cands.length){
    done("Every bet already has a closing price — nothing to fill.", 0);
    return Promise.resolve(0);
  }
  if(btn){ btn.disabled = true; btn.textContent = "Filling…"; }
  return getTeamDir().then(function(dir){
    var filled = 0;
    cands.forEach(function(b){
      var pair = resolveBetPair(dir, b);
      if(!pair) return;
      var snap = matchSnapshot({ pair: pair, date: b.date }, snaps);
      if(!snap) return;
      var val = closeValueFor(b, snap, dir);
      if(val === null) return; /* unmatched market/side -> left blank, honestly */
      if(BM.closeValid(String(val))) return; /* never write an invalid close */
      b.close = val;
      filled++;
    });
    if(filled){ saveBets(bets); render(); }
    return done("Filled " + filled + " of " + cands.length +
               " closing lines — unmatched bets left blank.", filled);
  }, function(){
    return done("Couldn't load the team directory — closing lines left blank. Try again.", 0);
  });
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
  /* ledger search (v1.160.0): live on every keystroke; Escape or the Clear
     button restores the full ledger. The query is DOM state only — settling,
     deleting or re-rendering never loses it, and it is never persisted. */
  var jSearch = $("jSearch");
  if(jSearch){
    jSearch.addEventListener("input", render);
    jSearch.addEventListener("keydown", function(ev){
      if(ev.key === "Escape"){ jSearch.value = ""; render(); }
    });
  }
  var jSearchClear = $("jSearchClear");
  if(jSearchClear) jSearchClear.addEventListener("click", function(){
    if(jSearch) jSearch.value = "";
    render();
    if(jSearch && jSearch.focus) jSearch.focus();
  });
  $("jBetsBody").addEventListener("click", tableClick);
  $("jExport").addEventListener("click", exportCSV);
  if($("jAutofill")) $("jAutofill").addEventListener("click", autoFillCloses);
  $("jImport").addEventListener("click", function(){ showErr(""); $("jImportFile").click(); });
  $("jImportFile").addEventListener("change", function(){
    if(this.files && this.files[0]) importCSV(this.files[0]);
    this.value = ""; /* allow re-picking the same file */
  });
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

window.Journal = { render: render, money: money, summaryHtml: summaryHtml, betsHtml: betsHtml,
  betMatches: betMatches, betMatchesSearch: betMatchesSearch, searchTerms: searchTerms,
  betSearchText: betSearchText, hlHtml: hlHtml,
  normalizePair: normalizePair, matchSnapshot: matchSnapshot, resolveBetPair: resolveBetPair,
  resolvePickAbbr: resolvePickAbbr, closeValueFor: closeValueFor,
  closeWindowMs: CLOSE_WINDOW_MS, autoFillCloses: autoFillCloses };
/* node test hook: the pure matching core loads without a DOM. */
if(typeof module !== "undefined" && module.exports){
  module.exports = { normalizePair: normalizePair, matchSnapshot: matchSnapshot,
                     resolveBetPair: resolveBetPair, resolvePickAbbr: resolvePickAbbr,
                     closeValueFor: closeValueFor, closeWindowMs: CLOSE_WINDOW_MS,
                     betMatchesSearch: betMatchesSearch, searchTerms: searchTerms,
                     betSearchText: betSearchText };
}
})();
