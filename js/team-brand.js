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
})();
