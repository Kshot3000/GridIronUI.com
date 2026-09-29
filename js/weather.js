/* GridIronUI Game Weather — NFL stadium dataset + Open-Meteo hourly forecasts.
   Pure venue/impact core lives in js/wx-shared.js (loaded before this file);
   this file is the weather page: forecast fetching, the 4-hour game-window
   strip, the GameDay matchup header, and the page bootstrap.
   Dome/retractable venues show "Dome — weather N/A". Open-air games get a
   4-hour game-window strip (kickoff, +1h, +2h, +3h) with temp, sustained wind,
   gusts and precip per hour; impact tags are computed over the whole window. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };

var wxCache = {};
function forecast(st, kickoffISO){
  var key = st[0]+"|"+kickoffISO.slice(0,10);
  if(wxCache[key]) return Promise.resolve(wxCache[key]);
  var url = "https://api.open-meteo.com/v1/forecast?latitude="+st[3]+"&longitude="+st[4]+
    "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m"+
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&forecast_days=16";
  return GIU.fetchJSON(url).then(function(d){
    var hrs = GIU.wxSliceWindow(d, kickoffISO);
    wxCache[key]=hrs; return hrs;
  });
}
/* Game-window strip: one compact column per game hour (kickoff, +1h, +2h, +3h)
   with temp, sustained wind (gusts in parens) and precip chance. */
function windowHTML(hrs){
  var labels = ["Kickoff","+1h","+2h","+3h"];
  var cols = hrs.map(function(h, i){
    return '<div style="min-width:96px;flex:1">'+
      '<div style="font-size:.68rem;color:var(--faint);text-transform:uppercase;letter-spacing:.08em">'+labels[i]+'</div>'+
      '<div class="num" style="font-size:1.25rem">'+h.temp+'°F</div>'+
      '<div style="font-size:.85rem;margin-top:4px"><b class="num">'+h.wind+'</b> mph '+
        '<span style="color:var(--muted)">'+h.wdir+'</span><br>'+
        '<span style="color:var(--muted);font-size:.78rem">gusts '+h.gust+'</span></div>'+
      '<div style="font-size:.78rem;color:var(--muted);margin-top:4px">☔ '+h.precip+'%</div>'+
    '</div>';
  }).join("");
  return '<div class="wx-strip" style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px">'+cols+'</div>';
}
/* GameDay matchup header: both team identities (logo + real color chip + name)
   with an "at" between — same identity system as scores + homepage. */
function matchupHTML(away, home){
  function side(t){
    var tm = (t&&t.team)||{};
    var abbr = tm.abbreviation || tm.shortDisplayName || "";
    return '<span class="team">'+GIU.teamLogo(tm, 38)+GIU.teamChip(tm, abbr)+
      '<span class="nm">'+GIU.esc(tm.displayName||"")+'</span></span>';
  }
  return '<div class="wx-matchup">'+side(away)+'<span class="at">at</span>'+side(home)+'</div>';
}
GIU.wxMatchupHTML = matchupHTML;
GIU.wxWindowHTML = windowHTML;

/* The scoreboard fetch survives ESPN's week rollover: between the week's last
   game and the Tuesday rollover the default board is all-post, so without
   the fallback this page would sit empty on exactly the mornings bettors
   start handicapping the weekend. upcomingNfl() pulls next week's slate
   explicitly in that window; the notice names the week so nobody mistakes
   it for this week's games. */
GIU.wxUpcomingNfl(GIU.fetchJSON).then(function(res){
  var evs = res.events.slice(0,16);
  var box = $("wxGrid");
  if(res.isFallback && evs.length && GIU.wxFallbackNoticeHTML){
    var note = document.createElement("div");
    note.innerHTML = GIU.wxFallbackNoticeHTML(res.week, GIU.esc);
    box.parentNode.insertBefore(note.firstChild, box);
  }
  if(!evs.length){ box.innerHTML = '<div class="empty">No upcoming NFL games on the board.</div>'; return; }
  box.innerHTML = evs.map(function(ev){
    var c = ev.competitions[0];
    var home = c.competitors.filter(function(t){return t.homeAway==="home";})[0];
    var away = c.competitors.filter(function(t){return t.homeAway==="away";})[0];
    var v = GIU.wxVenueFor(ev, home.team.abbreviation);
    var st = v.row;
    var when = "";
    try{ var dt=new Date(ev.date);
      when = dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+" · "+dt.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    }catch(e){}
    return '<div class="card" data-game="'+ev.id+'" data-kick="'+ev.date+'"'+
      (st ? ' data-sname="'+GIU.esc(st[1])+'" data-scity="'+GIU.esc(st[2])+'" data-slat="'+st[3]+'" data-slon="'+st[4]+'" data-sroof="'+st[5]+'"' : "")+'>'+
      '<div class="game-meta"><span>'+when+'</span>'+(v.neutral?'<span class="tag" style="margin-left:8px">neutral site</span>':"")+'</div>'+
      matchupHTML(away, home)+
      (st ? '<p style="font-size:.86rem;color:var(--muted);margin:0 0 10px">🏟️ '+GIU.esc(st[1])+' · '+GIU.esc(st[2])+(st[5]==="open"?"":' · <span class="tag blue">'+st[5]+' roof</span>')+'</p>'
          : '<p style="color:var(--faint)">Stadium data unavailable</p>')+
      '<div class="wx-body"><div class="skel" style="height:60px"></div></div></div>';
  }).join("");
  Array.prototype.forEach.call(box.querySelectorAll("[data-game]"), function(card){
    var ds = card.dataset;
    var st = ds.sname ? [ds.sname, ds.sname, ds.scity, parseFloat(ds.slat), parseFloat(ds.slon), ds.sroof] : null;
    var body = card.querySelector(".wx-body");
    if(!st){ body.innerHTML = '<p style="color:var(--faint)">No stadium data.</p>'; return; }
    if(st[5] !== "open"){
      body.innerHTML = '<div class="notice" style="margin:0"><strong>Dome — weather N/A.</strong> '+
        GIU.esc(st[1])+' has a '+(st[5]==="dome"?"fixed":"retractable")+' roof, so wind and rain don\'t factor into the total. '+
        (st[5]==="retractable" ? 'If the roof opens, conditions apply — check the team\'s official gameday report.' : '')+'</div>';
      return;
    }
    forecast(st, card.getAttribute("data-kick")).then(function(hrs){
      body.innerHTML = windowHTML(hrs)+GIU.wxImpact(hrs);
    }).catch(function(){
      body.innerHTML = '<p style="color:var(--faint)">Forecast unavailable for this game.</p>';
    });
  });
}).catch(function(){
  $("wxGrid").innerHTML = GIU.failBox("The ESPN schedule feed didn't respond, so there's nothing to attach weather to.");
});
})();
