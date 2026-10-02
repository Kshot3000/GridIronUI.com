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
/* Game-window strip: one compact column per game hour (first pitch, +1h,
   +2h, +3h for baseball via the optional firstLabel) with temp, sustained
   wind (gusts in parens) and precip chance. */
function windowHTML(hrs, firstLabel){
  var labels = [firstLabel || "Kickoff","+1h","+2h","+3h"];
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

/* ---- Weather watch ----
   Pure: from the games whose forecasts actually resolved, the ones where
   weather moves the number — i.e. the impact model flagged at least one
   note. Entries are {id (card anchor), label ("GB @ CHI"), notes} as built
   by the page bootstraps from GIU.wxImpactNotes / GIU.wxImpactNotesBsb.
   Red-flagged games (strong Under leans, kicking nightmares) sort first,
   then most notes; ties keep kickoff order (stable sort). Garbage in -> []:
   a game with no resolved forecast or no flags never appears, so a calm
   slate leaves the strip hidden instead of manufacturing concern. */
function watchEntries(entries){
  if(!Array.isArray(entries)) return [];
  var out = [];
  entries.forEach(function(e){
    if(!e || !e.id || !e.label || !Array.isArray(e.notes)) return;
    var notes = e.notes.filter(function(n){ return n && n.text; });
    if(!notes.length) return;
    var red = notes.some(function(n){ return String(n.cls||"").indexOf("red") !== -1; });
    out.push({id: String(e.id), label: String(e.label), notes: notes, red: red});
  });
  out.sort(function(a, b){
    return (b.red ? 1 : 0) - (a.red ? 1 : 0) || b.notes.length - a.notes.length;
  });
  return out;
}
/* Strip HTML: one jump chip per flagged game — matchup label, the game's
   top impact note, and a "+N more" hint when the window flagged more.
   Everything source-derived is escaped; ids are anchor-sanitized by the
   callers before they get here and escaped again on the way out. */
function watchHTML(items){
  var chips = items.map(function(it){
    var first = it.notes[0];
    var more = it.notes.length > 1
      ? ' <span style="color:var(--faint);font-size:.78rem">+'+(it.notes.length-1)+' more</span>' : "";
    return '<a class="wx-watch-chip" href="#'+GIU.esc(it.id)+'"><b>'+GIU.esc(it.label)+'</b> '+
      '<span class="'+GIU.esc(first.cls||"tag")+'">'+GIU.esc(first.text)+'</span>'+more+'</a>';
  }).join("");
  return '<span class="wx-watch-label">🌦 Weather watch — where weather moves the number:</span>'+chips;
}
function renderWatch(boxId, entries){
  var box = $(boxId);
  if(!box) return;
  var items = watchEntries(entries);
  if(!items.length){ box.hidden = true; box.innerHTML = ""; return; }
  box.innerHTML = watchHTML(items);
  box.hidden = false;
}
GIU.wxWatchEntries = watchEntries;
GIU.wxWatchHTML = watchHTML;

/* ---- followed teams (v1.154.0) ----
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") already mark the odds board, scores,
   predictions and injuries — but not the page a bettor checks on game
   morning for their own team's kickoff conditions. Followed-team
   games now get a gold rail + "★ Your team" tag on both weather
   sections (NFL + MLB postseason), and one combined "Your teams"
   jump strip opens the page with a chip per followed game (matchup
   + venue, anchor-linked to the card's gold :target ring). Dome
   games count too: "your team plays indoors, weather is a non-factor"
   is itself the answer a bettor came for. Abbreviations compare in
   the ESPN namespace both sides already use — the follow list is
   built from the ESPN-sourced team directory on the odds board, and
   scoreboard competitors carry ESPN abbreviations. No follows, or no
   followed team on either slate: the strip stays hidden and the
   page renders exactly as before — nothing is ever invented. */
function teamFollow(){ try{ return (window.GIU && window.GIU.TeamFollow) || null; }catch(e){ return null; } }
function followedList(){
  var T = teamFollow();
  try{ return T ? T.load() : []; }catch(e){ return []; }
}
/* followedWx: pure matcher. Takes plain game records
   ({anchor, away, home, venue}) + the raw followed list and returns
   one record per game a followed team plays in:
   {anchor, abbr (the followed side), away, home, venue}.
   Normalization mirrors team-follow.js list() (trim/upper, 2–4
   letters, first-followed wins when both sides are followed);
   garbage in -> []. Exported for tests. */
function followedWx(games, followed){
  var f = [], seen = {};
  (Array.isArray(followed) ? followed : []).forEach(function(x){
    if(typeof x !== "string") return;
    var n = x.trim().toUpperCase();
    if(/^[A-Z]{2,4}$/.test(n) && !seen[n]){ seen[n] = 1; f.push(n); }
  });
  if(!f.length || !Array.isArray(games)) return [];
  var out = [];
  games.forEach(function(g){
    if(!g || !g.anchor) return;
    var away = String(g.away == null ? "" : g.away).trim().toUpperCase();
    var home = String(g.home == null ? "" : g.home).trim().toUpperCase();
    if(!away && !home) return;
    var hit = null, i;
    for(i = 0; i < f.length; i++){ if(f[i] === away || f[i] === home){ hit = f[i]; break; } }
    if(!hit) return;
    out.push({ anchor: String(g.anchor), abbr: hit, away: away, home: home,
               venue: g.venue == null ? "" : String(g.venue) });
  });
  return out;
}
/* Strip HTML for a match list: the "★ Your teams" label + one jump
   chip per followed game (followed abbr, matchup, venue when known).
   Everything source-derived is escaped. Pure; exported for tests. */
function followHTML(matches){
  return '<span class="follow-strip-label">★ Your teams</span>' +
    (matches || []).map(function(m){
      return '<a class="follow-chip-link" href="#'+GIU.esc(m.anchor)+'"><b>'+GIU.esc(m.abbr)+'</b> '+
        GIU.esc(m.away || "")+' @ '+GIU.esc(m.home || "")+
        (m.venue ? ' · '+GIU.esc(m.venue) : "")+'</a>';
    }).join("");
}
GIU.wxFollowed = followedWx;
GIU.wxFollowHTML = followHTML;
/* Registered game records per section; the single strip merges both
   sections' matches and re-renders as each bootstrap lands, so an
   NFL chip never waits on the MLB feed (or vice versa). */
var wxFollowGames = { nfl: [], mlb: [] };
function renderFollowStrip(){
  var box = $("wxFollow");
  if(!box) return;
  var fol = followedList();
  var matches = followedWx(wxFollowGames.nfl, fol).concat(followedWx(wxFollowGames.mlb, fol));
  if(!matches.length){ box.hidden = true; box.innerHTML = ""; return; }
  box.innerHTML = followHTML(matches);
  box.hidden = false;
}
/* anchor -> match map for one section's games, for card marks. */
function folByAnchor(games){
  var map = {};
  followedWx(games, followedList()).forEach(function(m){ map[m.anchor] = m; });
  return map;
}

/* ---- find a game (v1.165.0) ----
   Every other game board on the site has a finder (scores v1.161.0,
   markets v1.162.0, odds v1.163.0, predictions v1.164.0) — the weather
   page was the last one without, where finding ONE game's forecast on
   game morning meant scrolling up to 16 NFL cards plus the MLB
   postseason section. One finder now covers BOTH slates: the query
   splits into terms and EVERY term must appear in the game's search
   text (both teams' full names + abbreviations, venue name + city —
   "bears" finds Chicago by name, "chi soldier" narrows across team
   and venue), so a term that appears nowhere matches nothing, never
   everything; garbage in -> empty text, never throws.
   Filtering is DOM state over the cards ALREADY on screen: each card
   is stamped data-find at render and applyWxSearch only toggles
   display, so typing NEVER re-fetches a forecast (Open-Meteo calls
   stay exactly the ones the page already made) and both bootstraps
   re-apply the query after they render, so a query typed while a
   slate is still loading lands on it when it arrives. The "Your
   teams" strip and both Weather watch strips are filtered with the
   board — a chip whose game is hidden hides too, and a strip with
   no visible chip steps aside — and a section whose every game is
   filtered out (the whole MLB wrap) steps aside with it. The query
   is DOM state only, never persisted. No query -> nothing is
   toggled and the page is byte-identical in behavior. */
function searchTerms(q){
  return String(q == null ? "" : q).toLowerCase().split(/\s+/).filter(function(t){ return !!t; });
}
/* Search text for one game record ({awayName, homeName, awayAbbr,
   homeAbbr, venue, city}); missing/garbage fields add nothing. */
function wxSearchText(g){
  if(!g || typeof g !== "object") return "";
  var parts = [];
  [g.awayName, g.homeName, g.awayAbbr, g.homeAbbr, g.venue, g.city].forEach(function(v){
    if(v != null && String(v).trim()) parts.push(String(v));
  });
  return parts.join(" ").toLowerCase();
}
function wxMatchesSearch(g, q){
  var terms = searchTerms(q);
  if(!terms.length) return true;
  var text = wxSearchText(g);
  if(!text) return false;
  for(var i = 0; i < terms.length; i++){ if(text.indexOf(terms[i]) === -1) return false; }
  return true;
}
try{ GIU.wxSearchTerms = searchTerms; GIU.wxGameText = wxSearchText;
     GIU.wxGameSearch = wxMatchesSearch; }catch(e){}
var searchQ = "";
/* Honest count + Clear visibility + the named empty state, narrated
   only while a search is active. total counts the cards actually on
   screen across both slates; without the hooks (or before any slate
   lands) the meta stays silent rather than inventing a number. */
function renderWxSearchMeta(shown, total, active){
  var c = $("wxCount"), b = $("wxClear"), e = $("wxFindEmpty");
  if(c) c.textContent = (active && total > 0)
    ? (shown === 0 ? "No matches" : shown + " of " + total + " games") : "";
  if(b) b.hidden = !active;
  if(e){
    var show = !!(active && total > 0 && shown === 0);
    e.hidden = !show;
    if(show) e.textContent = 'No games match "' + String(searchQ).trim() +
      '" on this page — clear the search to see all ' + total + " games.";
  }
}
function applyWxSearch(){
  var terms = searchTerms(searchQ), active = terms.length > 0;
  var shown = 0, total = 0, vis = {}, perGrid = {}, i, j, el;
  ["wxGrid", "mlbWxGrid"].forEach(function(gid){
    var grid = $(gid), s = 0, n = 0;
    if(grid && grid.querySelectorAll){
      var cards = grid.querySelectorAll("[data-find]");
      n = cards.length;
      for(i = 0; i < cards.length; i++){
        el = cards[i];
        var txt = el.getAttribute ? (el.getAttribute("data-find") || "") : "";
        var ok = !active || terms.every(function(t){ return txt.indexOf(t) !== -1; });
        if(el.style) el.style.display = ok ? "" : "none";
        if(ok){ s++; if(el.id) vis[el.id] = 1; }
      }
    }
    perGrid[gid] = { shown: s, total: n };
    shown += s; total += n;
  });
  /* The jump strips track the filtered board: a chip promises a card,
     so a chip whose card the search hid hides too — and a strip left
     with no visible chip steps aside entirely. */
  ["wxFollow", "wxWatch", "mlbWxWatch"].forEach(function(bid){
    var box = $(bid);
    if(!box || !box.querySelectorAll) return;
    var chips = box.querySelectorAll("a");
    if(!chips.length) return;
    var any = false;
    for(j = 0; j < chips.length; j++){
      var href = chips[j].getAttribute ? (chips[j].getAttribute("href") || "") : "";
      var cid = href.charAt(0) === "#" ? href.slice(1) : "";
      var cok = !active || !!vis[cid];
      if(chips[j].style) chips[j].style.display = cok ? "" : "none";
      if(cok) any = true;
    }
    box.hidden = !any;
  });
  /* A fully filtered-out MLB slate takes its whole section with it —
     heading and explainer over an empty grid would just be noise. */
  var wrap = $("mlbWxWrap");
  if(wrap && wrap.style && perGrid.mlbWxGrid && perGrid.mlbWxGrid.total > 0)
    wrap.style.display = (active && perGrid.mlbWxGrid.shown === 0) ? "none" : "";
  renderWxSearchMeta(shown, total, active);
}
function resetWxSearch(){
  searchQ = "";
  var q = $("wxQ");
  if(q) q.value = "";
  applyWxSearch();
  if(q && q.focus) q.focus();
}
(function wireWxFind(){
  try{
    var q = $("wxQ");
    if(!q || !q.addEventListener) return;
    q.addEventListener("input", function(){ searchQ = q.value || ""; applyWxSearch(); });
    q.addEventListener("keydown", function(ev){ if(ev && ev.key === "Escape") resetWxSearch(); });
    var b = $("wxClear");
    if(b && b.addEventListener) b.addEventListener("click", resetWxSearch);
  }catch(e){ /* no DOM (tests/imports): the finder simply never wires */ }
})();

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
  if(!evs.length){ box.innerHTML = '<div class="empty">No upcoming NFL games on the board.</div>'; applyWxSearch(); return; }
  /* v1.154.0 — followed-team marks for this slate (strip + card rail/tag) */
  var nflGames = evs.map(function(ev){
    var c0 = ev.competitions[0];
    var h0 = c0.competitors.filter(function(t){return t.homeAway==="home";})[0];
    var a0 = c0.competitors.filter(function(t){return t.homeAway==="away";})[0];
    var v0 = h0 ? GIU.wxVenueFor(ev, h0.team.abbreviation) : null;
    return { anchor: "wxg-"+String(ev.id).replace(/[^A-Za-z0-9_-]/g,""),
             away: (a0&&a0.team&&a0.team.abbreviation)||"", home: (h0&&h0.team&&h0.team.abbreviation)||"",
             venue: (v0 && v0.row) ? v0.row[1] : "" };
  });
  wxFollowGames.nfl = nflGames;
  var nflFol = folByAnchor(nflGames);
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
    var anch = "wxg-"+String(ev.id).replace(/[^A-Za-z0-9_-]/g,"");
    var findText = wxSearchText({ awayName: (away&&away.team&&(away.team.displayName||away.team.name))||"",
      homeName: (home&&home.team&&(home.team.displayName||home.team.name))||"",
      awayAbbr: (away&&away.team&&away.team.abbreviation)||"", homeAbbr: (home&&home.team&&home.team.abbreviation)||"",
      venue: st ? st[1] : "", city: st ? st[2] : "" });
    return '<div class="card'+(nflFol[anch] ? " followed" : "")+'" id="'+GIU.esc(anch)+'" data-find="'+GIU.esc(findText)+'" data-game="'+ev.id+'" data-kick="'+ev.date+'"'+
      ' data-away="'+GIU.esc((away&&away.team&&away.team.abbreviation)||"")+'" data-home="'+GIU.esc((home&&home.team&&home.team.abbreviation)||"")+'"'+
      (st ? ' data-sname="'+GIU.esc(st[1])+'" data-scity="'+GIU.esc(st[2])+'" data-slat="'+st[3]+'" data-slon="'+st[4]+'" data-sroof="'+st[5]+'"' : "")+'>'+
      '<div class="game-meta"><span>'+when+'</span>'+(v.neutral?'<span class="tag" style="margin-left:8px">neutral site</span>':"")+(nflFol[anch]?' <span class="tag tag-yourteam">★ Your team</span>':"")+'</div>'+
      matchupHTML(away, home)+
      (st ? '<p style="font-size:.86rem;color:var(--muted);margin:0 0 10px">🏟️ '+GIU.esc(st[1])+' · '+GIU.esc(st[2])+(st[5]==="open"?"":' · <span class="tag blue">'+st[5]+' roof</span>')+'</p>'
          : '<p style="color:var(--faint)">Stadium data unavailable</p>')+
      '<div class="wx-body"><div class="skel" style="height:60px"></div></div></div>';
  }).join("");
  renderFollowStrip();
  applyWxSearch();
  var watchJobs = [];
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
    watchJobs.push(forecast(st, card.getAttribute("data-kick")).then(function(hrs){
      body.innerHTML = windowHTML(hrs)+GIU.wxImpact(hrs);
      return { id: "wxg-"+String(card.getAttribute("data-game")||"").replace(/[^A-Za-z0-9_-]/g,""),
               label: (ds.away||"")+" @ "+(ds.home||""),
               notes: GIU.wxImpactNotes(hrs) };
    }).catch(function(){
      body.innerHTML = '<p style="color:var(--faint)">Forecast unavailable for this game.</p>';
      return null;
    }));
  });
  /* Weather watch strip: fills in once every open-air forecast has settled —
     flagged games only; a calm slate (or all domes) leaves it hidden. */
  Promise.all(watchJobs).then(function(list){ renderWatch("wxWatch", list); applyWxSearch(); });


}).catch(function(){
  $("wxGrid").innerHTML = GIU.failBox("The ESPN schedule feed didn't respond, so there's nothing to attach weather to.");
  applyWxSearch();
});

/* ---- MLB postseason weather (October baseball) ----
   Runs independently of the NFL fetch. Outside the postseason the
   seasontype=3 board has no pre games and this section stays hidden —
   no dead section, no manufactured slate. */
(function mlbPostseason(){
  if(!GIU.wxUpcomingMlbPostseason) return;
  GIU.wxUpcomingMlbPostseason(GIU.fetchJSON).then(function(res){
    var wrap = $("mlbWxWrap"), grid = $("mlbWxGrid");
    if(!wrap || !grid) return;
    var evs = (res.events||[]).slice(0, 12);
    if(!evs.length) return; /* stays hidden outside October */
    wrap.hidden = false;
    /* v1.154.0 — followed-team marks for the postseason slate */
    var mlbGames = evs.map(function(ev){
      var c0 = ev.competitions[0] || {};
      var comps0 = c0.competitors || [];
      var h0 = comps0.filter(function(t){return t.homeAway==="home";})[0];
      var a0 = comps0.filter(function(t){return t.homeAway==="away";})[0];
      var bp0 = (h0 && h0.team) ? GIU.wxBallparkVenueFor(ev, h0.team.abbreviation) : null;
      return { anchor: "wxb-"+String(ev.id).replace(/[^A-Za-z0-9_-]/g,""),
               away: (a0&&a0.team&&a0.team.abbreviation)||"", home: (h0&&h0.team&&h0.team.abbreviation)||"",
               venue: bp0 ? bp0[1] : "" };
    });
    wxFollowGames.mlb = mlbGames;
    var mlbFol = folByAnchor(mlbGames);
    grid.innerHTML = evs.map(function(ev){
      var c = ev.competitions[0] || {};
      var comps = c.competitors || [];
      var home = comps.filter(function(t){return t.homeAway==="home";})[0];
      var away = comps.filter(function(t){return t.homeAway==="away";})[0];
      var bp = (home && home.team) ? GIU.wxBallparkVenueFor(ev, home.team.abbreviation) : null;
      var when = "";
      try{ var dt=new Date(ev.date);
        when = dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+" · "+dt.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
      }catch(e){}
      var anch = "wxb-"+String(ev.id).replace(/[^A-Za-z0-9_-]/g,"");
      var findText = wxSearchText({ awayName: (away&&away.team&&(away.team.displayName||away.team.name))||"",
        homeName: (home&&home.team&&(home.team.displayName||home.team.name))||"",
        awayAbbr: (away&&away.team&&away.team.abbreviation)||"", homeAbbr: (home&&home.team&&home.team.abbreviation)||"",
        venue: bp ? bp[1] : "", city: bp ? bp[2] : "" });
      return '<div class="card'+(mlbFol[anch] ? " followed" : "")+'" id="'+GIU.esc(anch)+'" data-find="'+GIU.esc(findText)+'" data-game="'+ev.id+'" data-kick="'+ev.date+'">'+
        '<div class="game-meta"><span>'+when+'</span><span class="tag" style="margin-left:8px">MLB postseason</span>'+(mlbFol[anch]?' <span class="tag tag-yourteam">★ Your team</span>':"")+'</div>'+
        matchupHTML(away, home)+
        (bp ? '<p style="font-size:.86rem;color:var(--muted);margin:0 0 10px">🏟️ '+GIU.esc(bp[1])+' · '+GIU.esc(bp[2])+(bp[5]==="open"?"":' · <span class="tag blue">'+bp[5]+' roof</span>')+'</p>'
            : '<p style="color:var(--faint)">Ballpark data unavailable</p>')+
        '<div class="wx-body" data-bp="'+(bp ? GIU.esc(bp[0]) : "")+'"><div class="skel" style="height:60px"></div></div></div>';
    }).join("");
    renderFollowStrip();
    applyWxSearch();
    var watchJobs = [];
    Array.prototype.forEach.call(grid.querySelectorAll("[data-game]"), function(card){
      var evId = card.getAttribute("data-game");
      var ev = null;
      for(var i=0;i<evs.length;i++) if(String(evs[i].id)===evId){ ev = evs[i]; break; }
      var body = card.querySelector(".wx-body");
      var abbr = body ? body.getAttribute("data-bp") : "";
      var c = ev ? (ev.competitions[0]||{}) : {};
      var comps = c.competitors || [];
      var home = comps.filter(function(t){return t.homeAway==="home";})[0];
      var away = comps.filter(function(t){return t.homeAway==="away";})[0];
      var bp = (ev && home && home.team) ? GIU.wxBallparkVenueFor(ev, home.team.abbreviation) : (abbr ? GIU.wxBallparkFor(abbr) : null);
      if(!bp){ body.innerHTML = '<p style="color:var(--faint)">No ballpark data.</p>'; return; }
      if(bp[5] !== "open"){
        body.innerHTML = '<div class="notice" style="margin:0"><strong>'+(bp[5]==="dome"?"Dome":"Retractable roof")+' — weather N/A.</strong> '+
          GIU.esc(bp[1])+' has a '+(bp[5]==="dome"?"fixed":"retractable")+' roof, so wind and rain don\'t factor into the total'+
          (bp[5]==="retractable" ? ' <em>if</em> it\'s closed — an open roof with wind blowing out is a very different game. Check the club\'s official gameday report before first pitch.' : '.')+'</div>';
        return;
      }
      watchJobs.push(forecast(bp, card.getAttribute("data-kick")).then(function(hrs){
        body.innerHTML = windowHTML(hrs, "1st pitch")+GIU.wxImpactBsb(hrs);
        return { id: "wxb-"+String(evId||"").replace(/[^A-Za-z0-9_-]/g,""),
                 label: ((away&&away.team&&away.team.abbreviation)||"")+" @ "+((home&&home.team&&home.team.abbreviation)||""),
                 notes: GIU.wxImpactNotesBsb(hrs) };
      }).catch(function(){
        body.innerHTML = '<p style="color:var(--faint)">Forecast unavailable for this game.</p>';
        return null;
      }));
    });
    Promise.all(watchJobs).then(function(list){ renderWatch("mlbWxWatch", list); applyWxSearch(); });
  }).catch(function(){
    /* Feed failed: leave the section hidden rather than showing an error
       box for a bonus section — the NFL grid above carries the page. */
  });
})();

})();
