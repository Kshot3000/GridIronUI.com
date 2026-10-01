/* GridIronUI DFS Lab — pool management, CSV import, optimizer UI, export.
   Math lives in js/dfs-opt.js (window.DFSOpt). */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var OPT = window.DFSOpt;
var INJ = window.DFSInj || null; /* js/dfs-injuries.js — ESPN injury cross-check */
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
var FIELDS = [["name","Name"],["team","Team"],["opp","Opp"],["pos","Position"],["salary","Salary"],["proj","Projection"],["floor","Floor"],["ceil","Ceiling"],["own","Ownership %"],["siteId","ID (DraftKings / FanDuel)"]];
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
  /* DraftKings / FanDuel salary-CSV smarts. DK's export carries both a
     "Name + ID" column and a clean "Name" column (prefer the clean one),
     "TeamAbbrev" instead of "Team", and "Game Info" (e.g.
     "PHI@CHI 10/01/2026 08:15PM ET") instead of an Opp column — opponents
     are derived from the game string at import time. FanDuel's export
     splits names into "First Name" + "Last Name", which are recombined.
     Detection is header-driven; nothing is guessed. */
  var dk = isDK(H);
  var fdNames = fdNameCols(H);
  var nameIdx = take(/^name$/i); /* DK's clean "Name" column */
  if(nameIdx===-1) nameIdx = take(/name|player/i, /team/i);
  /* Site player ID, kept so the export can write the sites' bulk-uploader
     cell formats. DK ships a dedicated "ID" column (falling back to the
     "(ID)" suffix on "Name + ID"); FD ships "Id". Header-driven, never
     guessed — -1 means no ID source was found. */
  var idCol = take(/^id$/i);
  var nameIdCol = dk ? H.map(function(h){ return String(h).trim().toLowerCase(); }).indexOf("name + id") : -1;
  var m = {
    name: nameIdx,
    team: take(/^team(abbrev)?$/i),
    opp: take(/opp/i),
    pos: take(/pos/i),
    salary: take(/salary/i),
    proj: take(/proj/i),
    avg: take(/avg/i),
    floor: take(/floor/i),
    ceil: take(/ceil|max/i),
    own: take(/own/i),
    siteId: idCol,
    dk: dk,
    fdNames: fdNames,
    nameIdCol: nameIdCol,
    gameInfo: dk ? H.map(function(h){ return String(h).trim().toLowerCase(); }).indexOf("game info") : -1
  };
  return m;
}
/* True for DraftKings salary exports: they carry a "Name + ID" column, or
   the "Roster Position" + "Game Info" pair. Header-driven, never guessed. */
function isDK(head){
  var H = head.map(function(h){ return String(h).trim().toLowerCase(); });
  return H.indexOf("name + id")!==-1 ||
    (H.indexOf("roster position")!==-1 && H.indexOf("game info")!==-1);
}
/* "Jalen Hurts (81234)" -> "Jalen Hurts" (DK's "Name + ID" column). */
function dkCleanName(s){
  return String(s||"").replace(/\s*\(\d+\)\s*$/, "").trim();
}
/* "PHI@CHI 10/01/2026 08:15PM ET" + team PHI -> "CHI". Supports "@" and
   "v"/"vs" separators; returns "" when the game string is unparseable or
   the player's team isn't in it — never guessed. */
function dkGameOpp(gameInfo, team){
  var t = String(team||"").trim().toUpperCase();
  if(!t) return "";
  var m = String(gameInfo||"").toUpperCase().match(/([A-Z]{2,4})\s*(?:@|V(?:S\.?)?)\s*([A-Z]{2,4})/);
  if(!m) return "";
  if(m[1]===t) return m[2];
  if(m[2]===t) return m[1];
  return "";
}
/* FanDuel's "First Name"/"Last Name" column pair -> [i,j], else null. */
function fdNameCols(head){
  var H = head.map(function(h){ return String(h).trim().toLowerCase(); });
  var a = H.indexOf("first name"), b = H.indexOf("last name");
  return (a!==-1 && b!==-1) ? [a,b] : null;
}
/* Name as it should land in the pool: DK ID suffix stripped, FD first+last
   recombined. `head` is the raw header row, `map` the (possibly user-edited)
   column map. */
function importName(row, head, map){
  function col(i){ return i>=0 && i<row.length ? row[i].trim() : ""; }
  var nm = col(map.name);
  var hn = map.name>=0 ? String(head[map.name]).trim().toLowerCase() : "";
  if(map.dk && hn==="name + id") nm = dkCleanName(nm);
  if(!map.dk && map.fdNames && map.name===map.fdNames[0])
    nm = (nm+" "+col(map.fdNames[1])).trim();
  return nm;
}
/* Site player ID for a row — stored so the export can write the sites'
   bulk-uploader cell formats. DK prefers its dedicated "ID" column and falls
   back to the "(ID)" suffix on "Name + ID"; FD / generic CSVs use the mapped
   ID column. Returns "" when there is no ID source — never guessed. */
function importSiteId(row, map){
  function col(i){ return i>=0 && i<row.length ? row[i].trim() : ""; }
  var v = (map.siteId>=0) ? col(map.siteId) : "";
  if(!v && map.dk && map.nameIdCol>=0){
    var m = col(map.nameIdCol).match(/\((\d+)\)\s*$/);
    if(m) v = m[1];
  }
  return v;
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
    $("importInfo").textContent = importRows.length+" data rows detected."+
      (importMap.dk ? " DraftKings salary format detected — teams, clean names and opponents (from Game Info) auto-mapped."
       : (importMap.fdNames ? " FanDuel salary format detected — teams, opponents and full names auto-mapped." : ""));
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
  /* carry the salary-format detection through the user's (possibly edited) map;
     the user's own column picks (incl. the ID column) are respected */
  map.dk = importMap.dk; map.fdNames = importMap.fdNames; map.gameInfo = importMap.gameInfo;
  map.nameIdCol = importMap.nameIdCol;
  var poolBefore = pool.length;
  var added = importIntoPool(importRows, importHead, map);
  var withId = 0, i;
  for(i = poolBefore; i < pool.length; i++) if(pool[i].siteId) withId++;
  save(); renderPool();
  $("importInfo").textContent = "Imported "+added+" players"+
    (withId ? " ("+withId+" with site IDs for the uploader-ready export)." : ".");
  $("mapWrap").style.display = "none";
  $("csvFile").value = "";
});

/* Row loop for CSV import — extracted so node tests can drive it with real
   DraftKings / FanDuel headers. Returns the number of players added. */
function importIntoPool(rows, head, map){
  var added = 0;
  rows.forEach(function(r){
    function col(i){ return i>=0 && i<r.length ? r[i].trim() : ""; }
    var sal = parseFloat((col(map.salary)||"").replace(/[$,]/g,""));
    if(!(sal>0)) return;
    var proj = map.proj>=0 ? parseFloat(col(map.proj)) : NaN;
    if(!(proj>=0)) proj = 0;
    var posRaw = map.pos>=0 ? col(map.pos) : (cfg().sport==="NBA"?"UTIL":"FLEX");
    var pos = posRaw.toUpperCase().split(/[\/,;\s]+/).filter(Boolean);
    if(!pos.length) pos = [cfg().sport==="NBA"?"UTIL":"FLEX"];
    var team = (map.team>=0?col(map.team):"FA").toUpperCase()||"FA";
    /* DraftKings exports have no Opp column: derive it from "Game Info". */
    var opp = map.opp>=0 ? col(map.opp).toUpperCase()
      : (map.dk && map.gameInfo>=0 ? dkGameOpp(col(map.gameInfo), team) : "");
    pool.push({
      id: pidSeq++,
      name: importName(r, head, map),
      team: team,
      opp: opp,
      pos: pos,
      salary: Math.round(sal),
      proj: proj,
      floor: map.floor>=0&&parseFloat(col(map.floor))>=0?parseFloat(col(map.floor)):Math.round(proj*0.55*10)/10,
      ceil: map.ceil>=0&&parseFloat(col(map.ceil))>=0?parseFloat(col(map.ceil)):Math.round(proj*1.6*10)/10,
      own: map.own>=0&&parseFloat(col(map.own))>=0?parseFloat(col(map.own)):5,
      siteId: importSiteId(r, map)
    });
    added++;
  });
  return added;
}

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
    own: $("mOwn").value!==""?parseFloat($("mOwn").value):5,
    siteId: ($("mId").value||"").trim() });
  ["mName","mTeam","mOpp","mPos","mSalary","mProj","mFloor","mCeil","mOwn","mId"].forEach(function(id){ $(id).value=""; });
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

/* ---------- ESPN injury cross-check ----------
   Flags pool players who appear on the ESPN injury report (fetched once per
   sport per page load, after the pool renders so a feed hiccup never blocks
   the optimizer). Chips are painted in place — no table rebuild, no lost
   input focus. Never invents: only exact or unambiguous last-name matches. */
var injFlags = {};
var injFeeds = {}; /* sport -> {state:"idle"|"loading"|"ready"|"error", entries} */
function injSport(){ return cfg().sport; }
function injLeague(){ return injSport()==="NBA" ? "basketball/nba" : "football/nfl"; }
function refreshInjuryFlags(){
  var f = injFeeds[injSport()];
  if(!INJ || !f || f.state!=="ready" || !f.entries) return {};
  return INJ.matchInjuries(pool, f.entries);
}
function injChip(p){
  var fl = injFlags[p.id];
  if(!fl) return "";
  var label = fl.severity===3 ? "OUT" : (fl.severity===2 ? "DOUBT" : "QUES");
  var prob = fl.strength==="probable" ? " (probable match on last name + team)" : "";
  var title = OPT_esc(fl.status+" — "+fl.espnName+prob+" · via ESPN injury report"+
    (fl.comment ? " · "+fl.comment : ""));
  return '<span class="inj-chip sev'+fl.severity+'" title="'+title+'">⚠ '+label+
    (fl.strength==="probable" ? "?" : "")+"</span>";
}
function renderInjBanner(){
  var b = $("injBanner");
  if(!b) return;
  if(!pool.length){ b.style.display="none"; b.innerHTML=""; return; }
  var f = injFeeds[injSport()] || {state:"idle"};
  if(f.state==="loading" || f.state==="idle"){
    b.style.display=""; b.className="inj-banner idle";
    b.innerHTML = "🏥 <b>Injury check</b> <span>· checking the ESPN injury report…</span>";
    return;
  }
  if(f.state==="error"){
    b.style.display=""; b.className="inj-banner idle";
    b.innerHTML = "🏥 <b>Injury check</b> <span>· couldn't reach the ESPN injury feed — lineups still build normally. <a href=\"injuries.html\">Open the injury report →</a></span>";
    return;
  }
  var s = INJ.summarize(injFlags), ids = Object.keys(injFlags);
  if(!ids.length){
    b.style.display=""; b.className="inj-banner ok";
    b.innerHTML = "🏥 <b>Injury check</b> <span>· via ESPN injury report — no pool players on the report. <a href=\"injuries.html\">Full report →</a></span>";
    return;
  }
  var parts = [];
  if(s.out) parts.push(s.out+" OUT");
  if(s.doubtful) parts.push(s.doubtful+" doubtful");
  if(s.questionable) parts.push(s.questionable+" questionable");
  var html = "🏥 <b>Injury check</b> <span>· via ESPN injury report — <b style=\"color:var(--text)\">"+
    s.total+" pool player"+(s.total>1?"s":"")+"</b> flagged ("+parts.join(" · ")+").</span>";
  if(s.out) html += ' <button class="btn btn-ghost btn-sm" id="injExcludeOut">🚫 Exclude all OUT</button>';
  html += ' <a href="injuries.html" style="font-size:.82rem">Full report →</a>';
  b.style.display=""; b.className="inj-banner";
  b.innerHTML = html;
  var ex = $("injExcludeOut");
  if(ex) ex.addEventListener("click", function(){
    pool.forEach(function(p){
      var fl = injFlags[p.id];
      if(fl && fl.severity===3){ p.banned = true; p.locked = false; }
    });
    save(); renderPool();
  });
}
function maybeInjuryFetch(){
  if(!INJ || !pool.length) return;
  var sp = injSport();
  var f = injFeeds[sp];
  if(f && f.state!=="idle") return; /* one fetch per sport per page load */
  injFeeds[sp] = { state:"loading", entries:null };
  renderInjBanner();
  GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/"+injLeague()+"/injuries", 12000).then(function(d){
    var cur = injFeeds[sp];
    if(!cur || cur.state!=="loading") return; /* sport switched mid-flight */
    cur.entries = INJ.flattenInjuries(d);
    cur.state = "ready";
    injFlags = refreshInjuryFlags();
    paintChipsInPlace();
    renderInjBanner();
  }).catch(function(){
    var cur = injFeeds[sp];
    if(cur && cur.state==="loading") cur.state = "error";
    renderInjBanner();
  });
}
/* Paint chips onto existing rows without rebuilding the table, so a feed
   response that lands while the user edits projections never steals focus. */
function paintChipsInPlace(){
  var wrap = $("poolWrap");
  if(!wrap) return;
  Array.prototype.forEach.call(wrap.querySelectorAll("tr[data-id]"), function(tr){
    var id = Number(tr.getAttribute("data-id"));
    var pl = pool.filter(function(x){ return x.id===id; })[0];
    if(!pl) return;
    var cell = tr.querySelector("td.pname");
    if(cell){
      Array.prototype.forEach.call(cell.querySelectorAll(".inj-chip"), function(c){ c.remove(); });
      var tmp = document.createElement("span");
      tmp.innerHTML = injChip(pl);
      if(tmp.firstChild) cell.appendChild(tmp.firstChild);
    }
    var fl = injFlags[id];
    tr.classList.toggle("row-inj-out", !!(fl && fl.severity===3));
  });
}

/* ---------- sortable pool-table columns ----------
   With an imported CSV the pool often holds 100+ players; scanning it in
   import order hides the best values. Every numeric pool column (Sal, Proj,
   Floor, Ceil, Own%, Value) and the Player name sorts on click.
   Pure: sortPool(rows, col, dir) returns a NEW array ordered by the column
   spec; SORTABLE gives each column's default direction (numerics start desc,
   name starts asc). Ties break deterministically (name, then pool id) so
   equal rows never shuffle between clicks. sortPool never mutates its input. */
var SORTABLE = {
  name:  { dir:  1, get: function(p){ return String(p.name||"").toLowerCase(); } },
  sal:   { dir: -1, get: function(p){ return Number(p.salary)||0; } },
  proj:  { dir: -1, get: function(p){ return Number(p.proj)||0; } },
  floor: { dir: -1, get: function(p){ return Number(p.floor)||0; } },
  ceil:  { dir: -1, get: function(p){ return Number(p.ceil)||0; } },
  own:   { dir: -1, get: function(p){ return Number(p.own)||0; } },
  value: { dir: -1, get: function(p){ return OPT.value(p); } }
};
var poolSort = { col: null, dir: 1 }; /* null col = import order */
function sortPool(rows, col, dir){
  var spec = SORTABLE[col];
  if(!spec || !dir) return rows.slice();
  return rows.slice().sort(function(a,b){
    var va = spec.get(a), vb = spec.get(b), d;
    if(typeof va==="string") d = va<vb ? -1 : (va>vb ? 1 : 0);
    else d = va - vb;
    if(d) return d*dir;
    var na = String(a.name||""), nb = String(b.name||"");
    if(na!==nb) return na<nb ? -1 : 1;
    return (a.id||0) - (b.id||0);
  });
}
/* one sortable <th>: real button for free keyboard behavior, aria-sort on
   the th, arrow glyph signals the active column (↕ invites a first click). */
function sortTh(col, label, title){
  var active = poolSort.col===col;
  var aria = active ? (poolSort.dir===1 ? "ascending" : "descending") : "none";
  var arrow = active ? (poolSort.dir===1 ? "▲" : "▼") : "↕";
  return '<th scope="col" aria-sort="'+aria+'"'+(title ? ' title="'+title+'"' : "")+'>'+
    '<button type="button" class="th-sort" data-sort="'+col+'" aria-label="Sort by '+label+'">'+
    label+' <span class="sort-arrow" aria-hidden="true">'+arrow+"</span></button></th>";
}

/* header-click behavior, also the test seam: click the active column to flip
   direction, click a new one to take its default direction */
function toggleSort(col){
  if(poolSort.col===col) poolSort.dir = -poolSort.dir;
  else poolSort = { col:col, dir:SORTABLE[col].dir };
  renderPool();
}
/* ---------- pool table ---------- */
function renderPool(){
  var c = cfg();
  injFlags = refreshInjuryFlags();
  /* pool filters: position options follow the current roster slots */
  var posSel = $("poolPosFilter"), se = $("poolSearch");
  if(posSel){
    var slots = [];
    c.slots.forEach(function(s){ if(slots.indexOf(s)===-1) slots.push(s); });
    var keep = posSel.value;
    posSel.innerHTML = '<option value="ALL">All positions</option>' + slots.map(function(s){
      return '<option value="'+s+'">'+s+'</option>';
    }).join("");
    posSel.value = (slots.indexOf(keep)!==-1) ? keep : "ALL";
  }
  var query = (se && se.value ? se.value : "").trim().toLowerCase();
  var posF = posSel && posSel.value ? posSel.value : "ALL";
  function rowShown(p){
    if(posF!=="ALL" && p.pos.indexOf(posF)===-1) return false;
    if(query && String(p.name||"").toLowerCase().indexOf(query)===-1 &&
              String(p.team||"").toLowerCase().indexOf(query)===-1) return false;
    return true;
  }
  var shown = sortPool(pool.filter(rowShown), poolSort.col, poolSort.dir);
  /* top-3 value players in the FULL pool — stable ★ markers regardless of filtering */
  var topIds = {};
  pool.map(function(p){ return { p:p, v:OPT.value(p) }; })
    .sort(function(a,b){ return b.v-a.v || b.p.proj-a.p.proj; })
    .slice(0,3).forEach(function(x){ if(x.v>0) topIds[x.p.id]=1; });
  var pf = $("poolFilters");
  if(pf) pf.style.display = pool.length ? "" : "none";
  var sc = $("poolShowCount");
  if(sc) sc.textContent = shown.length<pool.length ? ("Showing "+shown.length+" of "+pool.length+" players") : "";
  var nl = pool.filter(function(p){ return p.locked; }).length;
  var nb = pool.filter(function(p){ return p.banned; }).length;
  $("poolCount").textContent = pool.length+" players · "+c.site+" "+c.sport+" · $"+c.cap.toLocaleString()+" cap"+
    (nl ? " · "+nl+" 🔒 locked" : "")+(nb ? " · "+nb+" 🚫 excluded" : "");
  $("rulesLine").textContent = "Roster: "+c.slots.join(" · ")+" — always confirm current rules on the official "+c.site+" site before entering.";
  if(!pool.length){
    $("poolWrap").innerHTML = '<div class="empty">Pool is empty. Import a CSV, add players manually, or load the DEMO slate to try the optimizer.</div>';
    renderInjBanner();
    refreshWxPanel();
    return;
  }
  var demo = pool.some(function(p){return p.demo;});
  if(!shown.length){
    $("poolWrap").innerHTML = '<div class="empty">No players match the current search/position filter. Clear the search or pick "All positions".</div>';
    renderInjBanner();
    refreshWxPanel();
    return;
  }
  var html = (demo?'<div class="notice" style="margin:0 0 12px"><strong>DEMO SLATE.</strong> These are synthetic players with made-up projections, for testing the optimizer only. Not real players, not real numbers.</div>':"")+
  '<div class="table-scroll"><table class="data"><thead><tr>'+
    sortTh("name","Player")+'<th>Pos</th><th>Team</th><th>Opp</th>'+
    sortTh("sal","Sal")+sortTh("proj","Proj")+sortTh("floor","Floor")+
    sortTh("ceil","Ceil")+sortTh("own","Own%")+
    sortTh("value","Value","Projected points per $1,000 of salary")+
    '<th>Lineup</th></tr></thead><tbody>'+
  shown.map(function(p){
    var fl = injFlags[p.id];
    var rowCls = p.locked ? "row-locked" : (p.banned ? "row-banned" : "");
    if(fl && fl.severity===3) rowCls += (rowCls ? " " : "")+"row-inj-out";
    var val = OPT.value(p), isTop = !!topIds[p.id];
    var valCell = '<td class="num'+(isTop?' top-value':'')+'" title="Projected points per $1,000 of salary'+(isTop?' — top-3 value in your pool':'')+'">'+
      (isTop?'<span class="val-star" aria-hidden="true">★ </span>':'')+val.toFixed(2)+'</td>';
    return '<tr data-id="'+p.id+'"'+(rowCls ? ' class="'+rowCls+'"' : "")+'><td class="pname"><b>'+OPT_esc(p.name)+'</b>'+injChip(p)+'</td><td>'+p.pos.join("/")+'</td><td>'+OPT_esc(p.team)+'</td><td>'+OPT_esc(p.opp||"—")+'</td>'+
    '<td class="num">$'+p.salary.toLocaleString()+'</td>'+
    '<td><input type="number" step="any" data-k="proj" value="'+p.proj+'" style="width:70px;padding:6px"></td>'+
    '<td><input type="number" step="any" data-k="floor" value="'+p.floor+'" style="width:70px;padding:6px"></td>'+
    '<td><input type="number" step="any" data-k="ceil" value="'+p.ceil+'" style="width:70px;padding:6px"></td>'+
    '<td><input type="number" step="any" data-k="own" value="'+p.own+'" style="width:64px;padding:6px"></td>'+
    valCell+
    '<td style="white-space:nowrap">'+
      '<button class="mini-btn'+(p.locked?" on":"")+'" data-lock="'+p.id+'" title="'+(p.locked?"Unlock ":"Lock into ")+'every lineup">🔒</button> '+
      '<button class="mini-btn'+(p.banned?" on":"")+'" data-ban="'+p.id+'" title="'+(p.banned?"Un-exclude ":"Exclude from ")+'all lineups">🚫</button> '+
      '<button class="copy-btn" data-del="'+p.id+'" title="Remove player">✕</button>'+
    '</td></tr>';
  }).join("")+'</tbody></table></div>';
  $("poolWrap").innerHTML = html;
  /* sortable headers: click toggles direction, second column resets to its
     own default; re-render rebuilds the table so hand focus back to the
     header that was clicked (keyboard users included) */
  Array.prototype.forEach.call($("poolWrap").querySelectorAll(".th-sort"), function(b){
    b.addEventListener("click", function(){
      var col = b.getAttribute("data-sort");
      toggleSort(col);
      var back = $("poolWrap").querySelector('.th-sort[data-sort="'+col+'"]');
      if(back && back.focus) back.focus({preventScroll:true});
    });
  });
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
  renderInjBanner();
  maybeInjuryFetch();
  refreshWxPanel();
}

/* ---------- game-conditions (weather) panel ----------
   Real stadium forecasts for the NFL games the pool plays in — wind moves
   totals and the passing game, so this is a genuine lineup-building input.
   The panel is quiet by design: non-NFL sports, empty pools and demo slates
   hide it, and a feed failure never fakes a forecast. One ESPN fetch + one
   multi-location Open-Meteo fetch per team-set per page load. */
var WXG = (typeof window !== "undefined" && window.DFSWx) || null;
var wxState = { key: null, state: "idle" };
function wxDeps(){
  return { venueFor: GIU.wxVenueFor,
           sliceWindow: GIU.wxSliceWindow,
           impactNotes: GIU.wxImpactNotes };
}
function wxPanelKey(){
  var teams = pool.map(function(p){ return WXG.normTeam(p.team); })
    .filter(function(t){ return t; }).sort();
  return cfgKey + "|" + teams.join(",");
}
function refreshWxPanel(){
  var panel = $("wxPanel");
  if(!panel) return;
  var need = WXG && GIU.wxUpcomingNfl && cfg().sport === "NFL" &&
             pool.length && !pool.every(function(p){ return p.demo; });
  if(!need){
    panel.style.display = "none"; panel.innerHTML = "";
    wxState = { key: null, state: "idle" };
    return;
  }
  var key = wxPanelKey();
  if(wxState.key === key && wxState.state !== "idle") return; /* same pool — panel stands */
  wxState = { key: key, state: "loading" };
  panel.style.display = "";
  panel.innerHTML = '<div class="notice" style="margin:26px 0 0">🌬️ <b>Game conditions</b> <span>· checking stadium forecasts…</span></div>';
  GIU.wxUpcomingNfl(GIU.fetchJSON).then(function(r){
    if(wxState.key !== key) return; /* pool changed mid-flight */
    var plan = WXG.poolGames(pool, "NFL", (r && r.events) || [], Date.now(), wxDeps());
    if(plan.skip || !plan.games.length){ panel.style.display = "none"; wxState.state = "ready"; return; }
    var split = WXG.splitRoofed(plan.games);
    var url = WXG.wxUrl(split.fetch);
    var rows = WXG.roofRows(split.roofed);
    function done(){
      rows.sort(function(a, b){ return a.game.kickMs - b.game.kickMs; });
      panel.innerHTML = WXG.panelHtml(rows, GIU.esc);
      wxState.state = "ready";
    }
    if(!url){ done(); return; }
    GIU.fetchJSON(url).then(function(d){
      if(wxState.key !== key) return;
      var arr = Array.isArray(d) ? d : [d];
      rows = rows.concat(WXG.withWx(split.fetch, arr, wxDeps()));
      done();
    }).catch(function(){
      if(wxState.key !== key) return;
      /* forecasts failed — roofed rows are still real; open-air games simply
         don't get a forecast rather than a fake one */
      if(rows.length) done();
      else panel.style.display = "none";
      wxState.state = "ready";
    });
  }).catch(function(){
    if(wxState.key !== key) return;
    panel.style.display = "none";
    wxState = { key: key, state: "ready" };
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
  syncBringBackRow();
});
/* game-stack bring-back only applies to NFL tournaments — the option row
   stays out of the way for cash games and NBA. */
function syncBringBackRow(){
  var row = $("bringBackRow");
  if(row) row.style.display = (mode==="gpp" && sport==="NFL") ? "" : "none";
}
function setCfg(){ cfgKey = site+"_"+sport; poolSort = { col:null, dir:1 }; loadStored(); renderPool(); syncBringBackRow(); }

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
  var bringBackOn = !!($("bringBack") && $("bringBack").checked && mode==="gpp" && sport==="NFL");
  var res = OPT.generate(cfgKey, pool, mode, {
    numLineups: n,
    maxExposure: maxExp,
    minUnique: minUni,
    volPenalty: Number($("volPen").value)||0.5,
    bringBack: bringBackOn,
    locked: lockIds,
    excluded: pool.filter(function(p){ return p.banned; }).map(function(p){ return p.id; })
  });
  var ms = Math.round(performance.now()-t0);
  renderResults(res, ms, n, {locked:lockIds, maxExp:maxExp, minUnique:minUni, bringBack:bringBackOn});
});
function renderResults(res, ms, wanted, extra){
  var c = cfg(), box = $("results"), x = extra||{};
  if(res.error){
    box.innerHTML = '<div class="notice red"><strong>Can\'t build lineups.</strong> '+OPT_esc(res.error)+' Adjust locks or the pool and try again.</div>';
    return;
  }
  if(!res.lineups.length){
    box.innerHTML = '<div class="notice red"><strong>No valid lineups.</strong> The pool may be too small or too expensive for the cap. Add cheaper players or lower the lineup count.</div>';
    return;
  }
  var got = res.lineups.length;
  var note = res.relaxed ? '<div class="notice" style="margin:0 0 14px"><strong>Small pool:</strong> uniqueness was relaxed to fill '+got+' lineups. Add more players for better diversity.</div>' : "";
  if(res.capRelaxed){
    note += '<div class="notice" style="margin:0 0 14px"><strong>Exposure cap relaxed:</strong> '+
      Math.round(res.askedExp*100)+'% can\'t fill '+wanted+' lineup(s) — each player needs at least '+
      Math.round(res.effExp*100)+'% to appear once. Raised to '+Math.round(res.effExp*100)+'% to build your lineups.</div>';
  }
  /* injury cross-check: a locked player who is OUT per ESPN would land in
     EVERY lineup — warn before the user enters anything. */
  var lockOut = (x.locked||[]).map(function(id){
    var pl = pool.filter(function(p){ return p.id===id; })[0];
    var fl = injFlags[id];
    return (pl && fl && fl.severity===3) ? OPT_esc(pl.name)+" ("+OPT_esc(fl.status)+")" : null;
  }).filter(Boolean);
  if(lockOut.length){
    note = '<div class="notice red" style="margin:0 0 14px"><strong>⚠ Locked player on the injury report:</strong> '+
      lockOut.join(", ")+' — OUT per the ESPN injury report, and locked players appear in <b>every</b> lineup. '+
      'Unlock or exclude before entering a contest.</div>' + note;
  }
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
  box.innerHTML = note + note2 + '<p style="color:var(--faint);font-size:.85rem">'+got+' of '+wanted+' requested lineups · optimized in '+ms+'ms · all lineups hard-validated (cap, positions, no duplicates'+(mode==="gpp"&&c.sport==="NFL"?", QB stacks"+(x.bringBack?", bring-backs":""):"")+').</p>' +
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
/* Bulk-uploader cell format per site. DraftKings' uploader matches on the
   "Name (ID)" cell shape (the exact cell shape of its own entries files —
   corroborated by community tooling with live-accepted uploads); FanDuel's
   bulk upload matches on the site player ID carried by its salary export.
   A player with no captured ID falls back to the bare name — never an
   invented ID. Embedded quotes are CSV-escaped. */
function uploadCell(p, site){
  var nm = String((p && p.name) || "");
  var id = String((p && p.siteId) || "").trim();
  var cell = nm;
  if(id) cell = (site === "FD") ? id : nm + " (" + id + ")";
  return '"' + cell.replace(/"/g, '""') + '"';
}
/* Pure CSV builder (test seam). Header = roster positions; one row per
   lineup; cells in the site's bulk-uploader format. */
function buildExportCSV(res){
  var c = cfg();
  var site = (c.site === "FanDuel") ? "FD" : "DK";
  var lines = [c.slots.join(",")];
  (res.lineups || []).forEach(function(lu){
    var bySlot = {};
    lu.forEach(function(e){ (bySlot[e.slot] = bySlot[e.slot] || []).push(e.player); });
    lines.push(c.slots.map(function(s){
      var p = (bySlot[s] || []).shift();
      return p ? uploadCell(p, site) : '""';
    }).join(","));
  });
  return lines.join("\n");
}
function exportCSV(res){
  var blob = new Blob([buildExportCSV(res)], {type:"text/csv"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gridironui-"+cfgKey+"-"+mode+"-lineups.csv";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
}

/* init — filter bar lives outside poolWrap so typing never loses focus */
function initDfs(){
  var se = $("poolSearch"), pf = $("poolPosFilter");
  if(se) se.addEventListener("input", function(){ renderPool(); });
  if(pf) pf.addEventListener("change", function(){ renderPool(); });
  loadStored(); renderPool();
}
/* test seam: pure import helpers for node tests (vm sandbox) */
window.GIU = window.GIU || {};
window.GIU.dfsImport = {
  parseCSV: parseCSV, autoMap: autoMap, isDK: isDK,
  dkCleanName: dkCleanName, dkGameOpp: dkGameOpp, fdNameCols: fdNameCols,
  importName: importName, importSiteId: importSiteId, importIntoPool: importIntoPool,
  uploadCell: uploadCell, buildExportCSV: buildExportCSV,
  sortPool: sortPool, sortSpec: SORTABLE, toggleSort: toggleSort,
  pool: function(){ return pool; } /* read-only for tests */
};

initDfs();
})();
