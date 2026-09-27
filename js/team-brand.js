/* GridIronUI team identity — real ESPN team logos + colors.
   ESPN's scoreboard payload carries team.color (hex, no #), team.alternateColor
   and team.logo(s). Everything here degrades gracefully when data is missing:
   no logo -> no img, no/invalid color -> the neutral chip. Nothing is guessed. */
(function(){
"use strict";
window.GIU = window.GIU || {};

function hex6(s){
  s = String(s==null?"":s).replace(/^#/,"");
  return /^[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}
/* relative luminance -> readable text color on a team-color chip */
function textOn(bg){
  var r=parseInt(bg.slice(0,2),16)/255, g=parseInt(bg.slice(2,4),16)/255, b=parseInt(bg.slice(4,6),16)/255;
  function lin(c){ return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
  var L = 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  return L > 0.45 ? "#10141c" : "#ffffff";
}
function logoUrl(team){
  team = team||{};
  if(team.logo) return team.logo;
  var ls = team.logos;
  if(ls && ls.length) return ls[0].href || ls[0] || null;
  return null;
}

window.GIU.teamColor = function(team){ return hex6((team||{}).color); };

/* Abbreviation chip tinted with the real team color; neutral fallback. */
window.GIU.teamChip = function(team, abbr){
  abbr = window.GIU.esc(abbr==null?"":abbr);
  var c = window.GIU.teamColor(team);
  if(!c) return '<span class="abbr">'+abbr+'</span>';
  return '<span class="abbr" style="background:linear-gradient(135deg,#'+c+',#'+c+'b3);color:'+textOn(c)+'">'+abbr+'</span>';
};

/* Team logo image; hides itself if the CDN 404s so a missing logo never
   leaves a broken-image box. */
window.GIU.teamLogo = function(team, size){
  var u = logoUrl(team);
  if(!u) return "";
  size = size||40;
  return '<img class="team-logo" width="'+size+'" height="'+size+'" loading="lazy" decoding="async" alt="" src="'+
    window.GIU.esc(u)+'" onerror="this.style.display=\'none\'">';
};

/* Full team row: logo + color chip + name + score. Shared by scores + homepage
   so every game card on the site carries the same identity. */
window.GIU.teamRow = function(t, winner){
  t = t||{}; var team = t.team||{};
  var nm = window.GIU.esc(team.displayName||"");
  var abbr = team.abbreviation || team.shortDisplayName || team.displayName || "";
  var sc = (t.score==null || t.score==="") ? "–" : window.GIU.esc(t.score);
  return '<div class="teams"><div class="team">'+window.GIU.teamLogo(team)+
    window.GIU.teamChip(team, abbr)+
    '<span class="nm">'+nm+'</span></div>'+
    '<span class="sc num"'+(winner?' style="color:var(--gold)"':"")+'>'+sc+'</span></div>';
};

/* Team directory — a static ESPN snapshot (scripts/fetch-teams.py ->
   data/teams.json) for feeds that don't carry logos/colors themselves
   (Kalshi snapshot, Polymarket events, injury-team lists). Loaded once and
   cached; resolves to {} on failure so pages render without identity. */
window.GIU._teamDirP = null;
window.GIU.teamDir = function(){
  if(window.GIU._teamDirP) return window.GIU._teamDirP;
  var base = (window.GIU_BASE || ".");
  window.GIU._teamDirP = window.GIU.fetchJSON(base+"/data/teams.json", 15000).then(function(d){
    return (d && d.leagues) || {};
  }).catch(function(){ return {}; });
  return window.GIU._teamDirP;
};
function normName(s){
  return String(s==null?"":s).toLowerCase().replace(/[^a-z0-9]/g,"")
    .replace(/(afc|fc|utd)$/,""); /* "Arsenal FC"->"arsenal", "Leeds United"->"leeds" */
}
/* Find a team by abbreviation, full name or short name. `dir` is the resolved
   leagues map from teamDir() (passed in so this stays pure and testable). */
window.GIU.teamFind = function(dir, league, q){
  var list = (dir||{})[league] || [];
  q = String(q==null?"":q).trim();
  if(!q || !list.length) return null;
  var ql = q.toLowerCase(), qu = q.toUpperCase(), i, t;
  for(i=0;i<list.length;i++){ t=list[i];
    if(t.abbr===qu) return t; }
  for(i=0;i<list.length;i++){ t=list[i];
    if(String(t.displayName||"").toLowerCase()===ql ||
       String(t.shortDisplayName||"").toLowerCase()===ql) return t; }
  var qn = normName(q);
  if(!qn) return null;
  for(i=0;i<list.length;i++){ t=list[i];
    if(normName(t.displayName)===qn || normName(t.shortDisplayName)===qn) return t; }
  return null;
};
/* Versus header: logo + color chip + short name for both sides, "vs" between.
   Returns "" when neither side matches — the caller keeps its plain title. */
window.GIU.vsHeader = function(dir, league, a, b){
  var ta = window.GIU.teamFind(dir, league, a),
      tb = window.GIU.teamFind(dir, league, b);
  if(!ta && !tb) return "";
  function side(t, raw){
    var inner = t
      ? window.GIU.teamLogo(t, 30) + window.GIU.teamChip(t, t.abbr)
      : "";
    var nm = t ? (t.shortDisplayName || t.displayName || raw) : raw;
    return '<span class="vs-side">'+inner+
      '<span class="nm">'+window.GIU.esc(nm)+'</span></span>';
  }
  return '<div class="vs-head" style="margin:10px 0 4px">'+side(ta, a)+
    '<span class="vs-x">vs</span>'+side(tb, b)+'</div>';
};
/* Single-team identity header (injury cards). Falls back to a plain heading. */
window.GIU.teamHead = function(dir, league, q, rawName){
  var t = window.GIU.teamFind(dir, league, q || rawName);
  if(!t) return '<h3>'+window.GIU.esc(rawName)+'</h3>';
  return '<div class="vs-head" style="margin:0 0 2px"><span class="vs-side">'+
    window.GIU.teamLogo(t, 30)+window.GIU.teamChip(t, t.abbr)+
    '<span class="nm">'+window.GIU.esc(t.displayName)+'</span></span></div>';
};
})();
