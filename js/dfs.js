/* GridIronUI DFS Lab — pool management, CSV import, optimizer UI, export.
   Math lives in js/dfs-opt.js (window.DFSOpt). */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var OPT = window.DFSOpt;
var cfgKey = "DK_NFL", mode = "cash";
var pool = [], pidSeq = 1;

function cfg(){ return OPT.CONFIGS[cfgKey]; }
function storeKey(){ return "giu_dfs_pool_"+cfgKey; }
function save(){ try{ localStorage.setItem(storeKey(), JSON.stringify({pool:pool, pidSeq:pidSeq})); }catch(e){} }
function loadStored(){
  try{
    var d = JSON.parse(localStorage.getItem(storeKey())||"null");
    if(d){ pool=d.pool||[]; pidSeq=d.pidSeq||1; }
  }catch(e){ pool=[]; }
}

/* ---------- CSV parsing ---------- */
function parseCSV(text){
  var rows=[], row=[], cur="", q=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; }
      else cur+=c;
    } else if(c==='"') q=true;
    else if(c===','){ row.push(cur); cur=""; }
    else if(c==="\n"||c==="\r"){ if(c==="\r"&&text[i+1]==="\n")i++; row.push(cur); rows.push(row); row=[]; cur=""; }
    else cur+=c;
  }
  if(cur!==""||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(function(r){ return r.length>1 || (r.length===1&&r[0].trim()!==""); });
}
var FIELDS = [["name","Name"],["team","Team"],["opp","Opp"],["pos","Position"],["salary","Salary"],["proj","Projection"],["floor","Floor"],["ceil","Ceiling"],["own","Ownership %"]];
function detect(head, re){ for(var i=0;i<head.length;i++) if(re.test(head[i])) return i; return -1; }
function autoMap(head){
  var H = head.map(function(h){ return String(h).trim(); });
  var used = {};
  function take(re, notRe){
    for(var i=0;i<H.length;i++){
      if(used[i]) continue;
      if(re.test(H[i]) && !(notRe&&notRe.test(H[i]))){ used[i]=1; return i; }
    }
    return -1;
  }
  return {
    name: take(/name|player/i, /team/i),
    team: take(/^team$/i),
    opp: take(/opp/i),
    pos: take(/pos/i),
    salary: take(/salary/i),
    proj: take(/proj/i),
    avg: take(/avg/i),
    floor: take(/floor/i),
    ceil: take(/ceil|max/i),
    own: take(/own/i)
  };
}
var importRows = null, importHead = null, importMap = null;
$("csvFile").addEventListener("change", function(){
  var f = this.files[0]; if(!f) return;
  var rd = new FileReader();
  rd.onload = function(){
    var rows = parseCSV(rd.result);
    if(rows.length<2){ alert("Couldn't find data rows in that CSV."); return; }
    importHead = rows[0]; importRows = rows.slice(1); importMap = autoMap(importHead);
    var html = FIELDS.map(function(fl){
      var opts = '<option value="-1">— skip —</option>'+importHead.map(function(h,i){
        return '<option value="'+i+'"'+(importMap[fl[0]]===i?" selected":"")+'>'+OPT_esc(h)+'</option>';
      }).join("");
      return '<div class="field"><label>'+fl[1]+'</label><select data-f="'+fl[0]+'">'+opts+'</select></div>';
    }).join("");
    /* projection fallback note */
    html += '<p style="font-size:.82rem;color:var(--faint)">No projection column? Map "Projection" to an average-points column — the average becomes the baseline projection.</p>';
    $("mapBox").innerHTML = html;
    $("mapWrap").style.display = "block";
    $("importInfo").textContent = importRows.length+" data rows detected.";
  };
  rd.readAsText(f);
});
function OPT_esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
$("doImport").addEventListener("click", function(){
  var map = {};
  Array.prototype.forEach.call($("mapBox").querySelectorAll("select"), function(s){
    map[s.getAttribute("data-f")] = Number(s.value);
  });
  if(map.proj===-1 && importMap.avg!==-1 && importMap.avg!==undefined){
    /* user mapped nothing; fall back to avg column */
    var avgSel = $("mapBox").querySelector('select[data-f="proj"]');
    if(avgSel && importMap.avg>=0){ map.proj = importMap.avg; }
  }
  if(map.name===-1 || map.salary===-1){ alert("Name and Salary columns are required."); return; }
  var added = 0;
  importRows.forEach(function(r){
    function col(i){ return i>=0 && i<r.length ? r[i].trim() : ""; }
    var sal = parseFloat((col(map.salary)||"").replace(/[$,]/g,""));
    if(!(sal>0)) return;
    var proj = map.proj>=0 ? parseFloat(col(map.proj)) : NaN;
    if(!(proj>=0)) proj = 0;
    var posRaw = map.pos>=0 ? col(map.pos) : (cfg().sport==="NBA"?"UTIL":"FLEX");
    var pos = posRaw.toUpperCase().split(/[\/,;\s]+/).filter(Boolean);
    if(!pos.length) pos = [cfg().sport==="NBA"?"UTIL":"FLEX"];
    pool.push({
      id: pidSeq++,
      name: col(map.name),
      team: (map.team>=0?col(map.team):"FA").toUpperCase()||"FA",
      opp: (map.opp>=0?col(map.opp):"").toUpperCase(),
      pos: pos,
      salary: Math.round(sal),
      proj: proj,
      floor: map.floor>=0&&parseFloat(col(map.floor))>=0?parseFloat(col(map.floor)):Math.round(proj*0.55*10)/10,
      ceil: map.ceil>=0&&parseFloat(col(map.ceil))>=0?parseFloat(col(map.ceil)):Math.round(proj*1.6*10)/10,
      own: map.own>=0&&parseFloat(col(map.own))>=0?parseFloat(col(map.own)):5
    });
    added++;
  });
  save(); renderPool();
  $("importInfo").textContent = "Imported "+added+" players.";
  $("mapWrap").style.display = "none";
  $("csvFile").value = "";
});

/* ---------- manual add ---------- */
$("addPlayer").addEventListener("click", function(){
  var name = $("mName").value.trim();
  var sal = parseFloat($("mSalary").value);
  var proj = parseFloat($("mProj").value);
  if(!name || !(sal>0) || !(proj>=0)){ alert("Name, salary and projection are required."); return; }
  var pos = $("mPos").value.toUpperCase().split(/[\/,;\s]+/).filter(Boolean);
  pool.push({ id:pidSeq++, name:name, team:($("mTeam").value||"FA").toUpperCase(), opp:($("mOpp").value||"").toUpperCase(),
    pos:pos.length?pos:["FLEX"], salary:Math.round(sal), proj:proj,
    floor: $("mFloor").value!==""?parseFloat($("mFloor").value):Math.round(proj*0.55*10)/10,
    ceil: $("mCeil").value!==""?parseFloat($("mCeil").value):Math.round(proj*1.6*10)/10,
    own: $("mOwn").value!==""?parseFloat($("mOwn").value):5 });
  ["mName","mTeam","mOpp","mPos","mSalary","mProj","mFloor","mCeil","mOwn"].forEach(function(id){ $(id).value=""; });
  save(); renderPool();
});

/* ---------- demo slate ---------- */
$("demoBtn").addEventListener("click", function(){
  if(pool.length && !confirm("Replace the current pool with the DEMO slate?")) return;
  pool = OPT.buildDemoSlate(cfg());
  pidSeq = pool.length+1;  save(); renderPool();
});
$("clearPool").addEventListener("click", function(){
  if(!pool.length || confirm("Remove all "+pool.length+" players from the pool?")){ pool=[]; save(); renderPool(); }
});

/* ---------- pool table ---------- */
function renderPool(){
  var c = cfg();
  var nl = pool.filter(function(p){ return p.locked; }).length;
  var nb = pool.filter(function(p){ return p.banned; }).length;
  $("poolCount").textContent = pool.length+" players · "+c.site+" "+c.sport+" · $"+c.cap.toLocaleString()+" cap"+
    (nl ? " · "+nl+" 🔒 locked" : "")+(nb ? " · "+nb+" 🚫 excluded" : "");
  $("rulesLine").textContent = "Roster: "+c.slots.join(" · ")+" — always confirm current rules on the official "+c.site+" site before entering.";
  if(!pool.length){
    $("poolWrap").innerHTML = '<div class="empty">Pool is empty. Import a CSV, add players manually, or load the DEMO slate to try the optimizer.</div>';
    return;
  }
  var demo = pool.some(function(p){return p.demo;});
  var html = (demo?'<div class="notice" style="margin:0 0 12px"><strong>DEMO SLATE.</strong> These are synthetic players with made-up projections, for testing the optimizer only. Not real players, not real numbers.</div>':"")+
  '<div class="table-scroll"><table class="data"><thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>Opp</th><th>Sal</th><th>Proj</th><th>Floor</th><th>Ceil</th><th>Own%</th><th>Lineup</th></tr></thead><tbody>'+
  pool.map(function(p){
    var rowCls = p.locked ? ' class="row-locked"' : (p.banned ? ' class="row-banned"' : "");
    return '<tr data-id="'+p.id+'"'+rowCls+'><td><b>'+OPT_esc(p.name)+'</b></td><td>'+p.pos.join("/")+'</td><td>'+OPT_esc(p.team)+'</td><td>'+OPT_esc(p.opp||"—")+'</td>'+
    '<td class="num">$'+p.salary.toLocaleString()+'</td>'+
    '<td><input type="number" step="any" data-k="proj" value="'+p.proj+'" style="width:70px;padding:6px"></td>'+
    '<td><input type="number" step="any" data-k="floor" value="'+p.floor+'" style="width:70px;padding:6px"></td>'+
    '<td><input type="number" step="any" data-k="ceil" value="'+p.ceil+'" style="width:70px;padding:6px"></td>'+
    '<td><input type="number" step="any" data-k="own" value="'+p.own+'" style="width:64px;padding:6px"></td>'+
    '<td style="white-space:nowrap">'+
      '<button class="mini-btn'+(p.locked?" on":"")+'" data-lock="'+p.id+'" title="'+(p.locked?"Unlock ":"Lock into ")+'every lineup">🔒</button> '+
      '<button class="mini-btn'+(p.banned?" on":"")+'" data-ban="'+p.id+'" title="'+(p.banned?"Un-exclude ":"Exclude from ")+'all lineups">🚫</button> '+
      '<button class="copy-btn" data-del="'+p.id+'" title="Remove player">✕</button>'+
    '</td></tr>';
  }).join("")+'</tbody></table></div>';
  $("poolWrap").innerHTML = html;
  Array.prototype.forEach.call($("poolWrap").querySelectorAll("input[data-k]"), function(inp){
    inp.addEventListener("change", function(){
      var tr = inp.closest("tr"), id = Number(tr.getAttribute("data-id"));
      var pl = pool.filter(function(x){return x.id===id;})[0];
      if(pl){ var v = parseFloat(inp.value); if(isFinite(v)) pl[inp.getAttribute("data-k")] = v; save(); }
    });
  });
  Array.prototype.forEach.call($("poolWrap").querySelectorAll("[data-del]"), function(b){
    b.addEventListener("click", function(){
      var id = Number(b.getAttribute("data-del"));
      pool = pool.filter(function(x){return x.id!==id;});
      save(); renderPool();
    });
  });
  /* lock / exclude toggles — mutually exclusive per player */
  Array.prototype.forEach.call($("poolWrap").querySelectorAll("[data-lock]"), function(b){
    b.addEventListener("click", function(){
      var id = Number(b.getAttribute("data-lock"));
      var pl = pool.filter(function(x){return x.id===id;})[0];
      if(pl){ pl.locked = !pl.locked; if(pl.locked) pl.banned = false; save(); renderPool(); }
    });
  });
  Array.prototype.forEach.call($("poolWrap").querySelectorAll("[data-ban]"), function(b){
    b.addEventListener("click", function(){
      var id = Number(b.getAttribute("data-ban"));
      var pl = pool.filter(function(x){return x.id===id;})[0];
      if(pl){ pl.banned = !pl.banned; if(pl.banned) pl.locked = false; save(); renderPool(); }
    });
  });
}

/* ---------- config tabs ---------- */
function tabWire(id, attr, cb){
  Array.prototype.forEach.call($(id).querySelectorAll(".tab"), function(t){
    t.addEventListener("click", function(){
      Array.prototype.forEach.call($(id).querySelectorAll(".tab"), function(x){x.classList.remove("active");});
      t.classList.add("active"); cb(t.getAttribute(attr));
    });
  });
}
var site="DK", sport="NFL";
tabWire("siteTabs","data-v",function(v){ site=v; setCfg(); });
tabWire("sportTabs","data-v",function(v){ sport=v; setCfg(); });
tabWire("modeTabs","data-v",function(v){ mode=v;
  $("numLineups").max = mode==="cash"?3:20;
  if(Number($("numLineups").value) > Number($("numLineups").max)) $("numLineups").value = $("numLineups").max;
});
function setCfg(){ cfgKey = site+"_"+sport; loadStored(); renderPool(); }

/* ---------- optimize ---------- */
$("runOpt").addEventListener("click", function(){
  var c = cfg();
  if(!pool.length){ alert("Pool is empty — import a CSV or load the demo slate first."); return; }
  /* sanity: every slot needs at least one eligible player */
  var missing = c.slots.filter(function(s){
    return !pool.some(function(p){ return OPT.eligible(p,s,c); });
  });
  if(missing.length){ alert("Can't build a lineup: no eligible players for "+missing.join(", ")+"."); return; }
  var n = Math.min(Number($("numLineups").value)||1, mode==="cash"?3:20);
  var maxExp = (Number($("maxExp").value)||60)/100,
      minUni = Number($("minUni").value)||3,
      lockIds = pool.filter(function(p){ return p.locked; }).map(function(p){ return p.id; });
  var t0 = performance.now();
  var res = OPT.generate(cfgKey, pool, mode, {
    numLineups: n,
    maxExposure: maxExp,
    minUnique: minUni,
    volPenalty: Number($("volPen").value)||0.5,
    locked: lockIds,
    excluded: pool.filter(function(p){ return p.banned; }).map(function(p){ return p.id; })
  });
  var ms = Math.round(performance.now()-t0);
  renderResults(res, ms, n, {locked:lockIds, maxExp:maxExp, minUnique:minUni});
});
function renderResults(res, ms, wanted, extra){
  var c = cfg(), box = $("results"), x = extra||{};
  if(res.error){
    box.innerHTML = '<div class="notice red"><strong>Can\'t build with these locks.</strong> '+OPT_esc(res.error)+' Adjust locks or the pool and try again.</div>';
    return;
  }
  if(!res.lineups.length){
    box.innerHTML = '<div class="notice red"><strong>No valid lineups.</strong> The pool may be too small or too expensive for the cap. Add cheaper players or lower the lineup count.</div>';
    return;
  }
  var got = res.lineups.length;
  var note = res.relaxed ? '<div class="notice" style="margin:0 0 14px"><strong>Small pool:</strong> uniqueness was relaxed to fill '+got+' lineups. Add more players for better diversity.</div>' : "";
  /* shortfall hint: GPP exposure caps legitimately cut the lineup count, but
     "1 of 3 requested lineups" alone leaves users guessing why. */
  var note2 = "";
  if(got < wanted){
    note2 = '<div class="notice" style="margin:0 0 14px"><strong>Only '+got+' of '+wanted+' requested lineups.</strong> '+
      'The '+Math.round((x.maxExp||0.6)*100)+'% max-exposure cap stops any unlocked player appearing in more than that share of lineups, '+
      'and every lineup must differ by at least '+(x.minUnique||3)+' players. '+
      'To get all '+wanted+': raise <b>Max exposure</b>, add more players to the pool, or lower <b>Min unique</b>.</div>';
  }
  /* exposure summary — a standard optimizer readout: who you're overweight on.
     Computed from the real exposures generate() tracked; no invented numbers. */
  var expHtml = "";
  var expRows = OPT.exposureSummary(res.exposures||{}, got, pool, x.locked||[], x.maxExp||0.6, wanted);
  if(expRows.length){
    var body = expRows.map(function(r){
      var tag = r.locked
        ? ' <span class="tag" title="Locked by you — appears in every lineup, exempt from the exposure cap">🔒 lock</span>'
        : (r.capped ? ' <span class="tag blue" title="Hit the max-exposure cap — the optimizer wouldn\'t add more of this player">cap</span>' : '');
      return '<tr><td>'+OPT_esc(r.name)+tag+'</td><td>'+OPT_esc(r.team)+'</td><td class="num">'+r.count+'</td><td class="num">'+Math.round(r.pct*100)+'%</td></tr>';
    }).join("");
    expHtml = '<details class="faq" style="margin:0 0 18px"><summary>Exposure summary — who you\'re overweight on ('+expRows.length+' players)</summary>'+
      '<p style="color:var(--faint);font-size:.82rem;margin:8px 0">Each player\'s share of the '+got+' generated lineup'+(got>1?'s':'')+'. '+
      'If a top play is at the cap and you want more of them, raise Max exposure or add lineup count.</p>'+
      '<div class="table-scroll"><table class="data"><caption style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">Player exposure across generated lineups</caption>'+
      '<thead><tr><th>Player</th><th>Team</th><th>Lineups</th><th>Share</th></tr></thead><tbody>'+body+'</tbody></table></div></details>';
  }
  box.innerHTML = note + note2 + '<p style="color:var(--faint);font-size:.85rem">'+got+' of '+wanted+' requested lineups · optimized in '+ms+'ms · all lineups hard-validated (cap, positions, no duplicates'+(mode==="gpp"&&c.sport==="NFL"?", QB stacks":"")+').</p>' +
  expHtml +
  res.lineups.map(function(lu, i){
    var totS = OPT.salary(lu), totP = OPT.proj(lu), totC = OPT.ceil(lu);
    var rows = lu.map(function(e){
      return '<tr><td><b>'+e.slot+'</b></td><td>'+OPT_esc(e.player.name)+'</td><td>'+OPT_esc(e.player.team)+'</td><td class="num">$'+e.player.salary.toLocaleString()+'</td><td class="num">'+e.player.proj.toFixed(1)+'</td><td class="num">'+e.player.ceil.toFixed(1)+'</td></tr>';
    }).join("");
    var ins = OPT.insights(lu, pool, mode, cfgKey).map(function(s){ return '<li>'+OPT_esc(s)+'</li>'; }).join("");
    return '<div class="card" style="margin-bottom:16px"><div class="section-head" style="margin-bottom:10px"><h3 style="margin:0">Lineup '+(i+1)+'</h3>'+
      '<div class="game-meta"><span class="num">$'+totS.toLocaleString()+' salary</span><span class="num">'+totP.toFixed(1)+' proj</span><span class="num">'+totC.toFixed(1)+' ceiling</span></div></div>'+
      '<div class="table-scroll"><table class="data"><thead><tr><th>Slot</th><th>Player</th><th>Team</th><th>Sal</th><th>Proj</th><th>Ceil</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<details class="faq" style="margin-top:12px"><summary>Optimizer insights</summary><ul style="color:var(--muted);font-size:.9rem">'+ins+'</ul></details></div>';
  }).join("");
  $("exportWrap").style.display = "block";
  $("exportBtn").onclick = function(){ exportCSV(res); };
}
function exportCSV(res){
  var c = cfg();
  var lines = [c.slots.join(",")];
  res.lineups.forEach(function(lu){
    var bySlot = {};
    lu.forEach(function(e){ (bySlot[e.slot]=bySlot[e.slot]||[]).push(e.player.name); });
    lines.push(c.slots.map(function(s){ return '"'+(bySlot[s].shift()||"")+'"'; }).join(","));
  });
  var blob = new Blob([lines.join("\n")], {type:"text/csv"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gridironui-"+cfgKey+"-"+mode+"-lineups.csv";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
}

/* init */
loadStored(); renderPool();
})();
