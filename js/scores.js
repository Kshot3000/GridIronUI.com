/* GridIronUI Scores — ESPN scoreboard across leagues, with day navigation. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["football/nfl","NFL"],["basketball/nba","NBA"],["baseball/mlb","MLB"],
  ["hockey/nhl","NHL"],["football/college-football","NCAAF"],
  ["basketball/mens-college-basketball","NCAAB"],["soccer/eng.1","EPL"]
];
var cur = 0, dayOffset = 0;

/* ESPN league path -> matchup-hub league key (?league=nfl&event=id).
   Leagues without a hub mapping get no Matchup link — never a bad link. */
var HUBKEY = {"football/nfl":"nfl","basketball/nba":"nba",
              "baseball/mlb":"mlb","hockey/nhl":"nhl",
              "football/college-football":"ncaaf"};

function ymd(d){
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
}

/* ---- followed teams (v1.149.0) ----
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") name the teams a bettor actually cares about —
   but until now they meant nothing on the page where those teams play.
   The scores board now marks followed-team games with a gold ★ tag and
   a left rail, and opens with a "Your teams" strip of jump chips (one
   per followed game on this board) so a Sunday slate of 15 games is a
   one-tap trip to your game instead of a scroll hunt. No follows, or no
   followed team on this board/day/league: the strip stays hidden and
   the board renders exactly as before — nothing is ever invented. */
function teamFollow(){ try{ return (window.GIU && window.GIU.TeamFollow) || null; }catch(e){ return null; } }
function followedList(){
  var T = teamFollow();
  try{ return T ? T.load() : []; }catch(e){ return []; }
}
/* followedGames: pure matcher. Takes ESPN scoreboard events + the raw
   followed list and returns one record per event a followed team plays
   in: {id, abbr (the followed side), away, home, state, detail}.
   Abbreviations compare in the ESPN namespace both sides already use —
   the follow list is built from the ESPN-sourced team directory on the
   odds board, and scoreboard competitors carry ESPN abbreviations.
   Normalization mirrors team-follow.js list() (trim/upper, 2–4 letters);
   garbage in -> []. Exported for tests. */
function followedGames(evs, followed){
  var f = [], seen = {};
  (Array.isArray(followed) ? followed : []).forEach(function(x){
    if(typeof x !== "string") return;
    var n = x.trim().toUpperCase();
    if(/^[A-Z]{2,4}$/.test(n) && !seen[n]){ seen[n] = 1; f.push(n); }
  });
  if(!f.length || !Array.isArray(evs)) return [];
  var out = [];
  evs.forEach(function(ev){
    var c = ev && ev.competitions && ev.competitions[0];
    if(!c || !Array.isArray(c.competitors)) return;
    var away = "", home = "";
    c.competitors.forEach(function(t){
      var a = (t && t.team && t.team.abbreviation) ? String(t.team.abbreviation).trim().toUpperCase() : "";
      if(!a) return;
      if(t.homeAway === "home") home = a;
      else if(t.homeAway === "away") away = a;
    });
    /* positional fallback mirrors the card renderer's own fallback */
    if(!away && c.competitors[0] && c.competitors[0].team) away = String(c.competitors[0].team.abbreviation || "").trim().toUpperCase();
    if(!home && c.competitors[1] && c.competitors[1].team) home = String(c.competitors[1].team.abbreviation || "").trim().toUpperCase();
    if(!away && !home) return;
    var hit = null, i;
    for(i = 0; i < f.length; i++){ if(f[i] === away || f[i] === home){ hit = f[i]; break; } }
    if(!hit) return;
    var st = (c.status && c.status.type) || {};
    out.push({ id: ev.id, abbr: hit, away: away, home: home,
               state: st.state || "", detail: st.shortDetail || "" });
  });
  return out;
}
/* The "Your teams" jump strip: one chip per followed game on the board,
   anchor-linked to the card's #sg-<id> (the card carries a gold :target
   ring). Empty match list -> strip hidden and emptied, so day/league
   switches and the smart-day jump never leave a stale strip behind. */
function renderFollowStrip(matches){
  var el = $("followStrip");
  if(!el) return;
  if(!matches || !matches.length){ el.innerHTML = ""; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<span class="follow-strip-label">★ Your teams</span>' +
    matches.map(function(m){
      var when = m.state === "in" ? "Live" : (m.detail || "");
      return '<a class="follow-chip-link" href="#sg-'+GIU.esc(m.id)+'">'+
        '<b>'+GIU.esc(m.abbr)+'</b> '+GIU.esc(m.away||"")+' @ '+GIU.esc(m.home||"")+
        (when ? ' · '+GIU.esc(when) : "")+'</a>';
    }).join("");
}
/* ---- find a game (v1.161.0) ----
   The boards above carry league tabs and day navigation but no way to
   find ONE game: a Saturday NCAAF slate runs 50+ cards and a full
   NCAAB day 100+, so a bettor checking "did Alabama cover?" scrolled
   the whole grid. The finder is a live filter over the board already
   loaded — team names, abbreviations and the venue — with the same
   discipline as the news/journal finders: the query splits into terms
   and EVERY term must appear, so "bears soldier" narrows across
   fields while a term that appears nowhere matches nothing, never
   everything. The query is board state (never persisted): filtering
   re-renders from the last board pulled, so it survives league/day
   switches and the 60s silent refresh instead of being wiped by
   them, and an open game's details survive a search round-trip via
   the same cache the refresh uses. The "Your teams" strip is computed
   over the FILTERED board, so a chip never promises a card the
   search hid. No query -> the board renders byte-identically. */
var searchQ = "", lastEvs = [];
function searchTerms(q){
  return String(q == null ? "" : q).toLowerCase().split(/\s+/).filter(function(t){ return !!t; });
}
/* Pure: the searchable text for one event — both competitors' display
   name, short name, location and abbreviation, plus the venue.
   Garbage in -> "" (which matches only a blank query). */
function gameSearchText(ev){
  var c = ev && ev.competitions && ev.competitions[0];
  if(!c || !Array.isArray(c.competitors)) return "";
  var parts = [];
  c.competitors.forEach(function(t){
    var team = (t && t.team) || {};
    [team.displayName, team.shortDisplayName, team.location, team.abbreviation].forEach(function(v){
      if(v) parts.push(String(v));
    });
  });
  if(c.venue && c.venue.fullName) parts.push(String(c.venue.fullName));
  return parts.join(" ").toLowerCase();
}
/* Pure: blank query matches every game (the unfiltered board); a
   non-blank query matches only when every term appears in the game's
   searchable text. Garbage event + non-blank query -> false. */
function gameMatchesSearch(ev, q){
  var terms = searchTerms(q);
  if(!terms.length) return true;
  var hay = gameSearchText(ev);
  if(!hay) return false;
  for(var i = 0; i < terms.length; i++){ if(hay.indexOf(terms[i]) === -1) return false; }
  return true;
}
/* Honest count + Clear visibility, narrated only while a search is
   active — the board's own chrome (day label, live status) stays the
   story otherwise. Null-guarded: pages/tests without the hooks render
   exactly as before. */
function renderSearchMeta(shown, total){
  var c = $("scoreCount"), b = $("scoreClear");
  var active = searchTerms(searchQ).length > 0;
  if(c) c.textContent = (active && total > 0)
    ? (shown === 0 ? "No matches" : shown + " of " + total + " games") : "";
  if(b) b.hidden = !active;
}
function dayLabel(){
  var d = new Date(); d.setDate(d.getDate()+dayOffset);
  return d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
}
function scoreboardUrl(leaguePath, offset){
  var d = new Date(); d.setDate(d.getDate()+offset);
  return "https://site.api.espn.com/apis/site/v2/sports/"+leaguePath+"/scoreboard?dates="+ymd(d);
}

/* ---- smart default day (every league tab) ----
   On a no-game day a league tab lands on an honest but dead "No games"
   board — exactly the Tuesday–Wednesday window when bettors start
   handicapping the weekend (NFL's calendar has nothing until Thursday,
   college football until Thursday/Saturday, baseball/hockey between playoff
   games, and so on). smartDay scans forward from fromOffset, one day at a
   time, and resolves with the first offset that has events, or null when
   nothing has games within maxDays. Sequential so it stops at the first hit;
   a failed or garbage payload counts as "no games that day", never as a page
   break. Pure + exported for tests. */
function smartDay(fetchJSON, leaguePath, fromOffset, maxDays){
  fromOffset = fromOffset || 0;
  maxDays = maxDays || 7;
  var offs = [];
  for(var i = 1; i <= maxDays; i++) offs.push(fromOffset + i);
  var chain = Promise.resolve(null);
  offs.forEach(function(o){
    chain = chain.then(function(hit){
      if(hit) return hit;
      return fetchJSON(scoreboardUrl(leaguePath, o)).then(function(data){
        var evs = data && data.events;
        /* hand the payload through so the caller renders without a refetch */
        return (evs && evs.length) ? { offset: o, events: evs } : null;
      }, function(){ return null; });
    });
  });
  return chain;
}
var smartTried = {};   /* per-league: smart-day scan already attempted this session */
var smartNoticeDay = null; /* dayOffset we auto-jumped to — renders the honest notice once */
function teamName(t){ return t.abbreviation || t.shortDisplayName || t.displayName; }

/* Stat-leader labels, verified against ESPN's real scoreboard payloads
   (NFL: passingYards/rushingYards/receivingYards; MLB: MLBRating).
   Unknown category keys are prettified from camelCase so nothing renders raw. */
var LEAD_LABELS = {
  passingYards:"Pass", rushingYards:"Rush", receivingYards:"Rec",
  points:"PTS", rebounds:"REB", assists:"AST", steals:"STL", blocks:"BLK",
  goals:"Goals", shots:"Shots", saves:"Saves",
  MLBRating:"Top performer"
};
function leadLabel(name){
  if(LEAD_LABELS[name]) return LEAD_LABELS[name];
  return String(name||"Leader").replace(/([a-z0-9])([A-Z])/g,"$1 $2")
    .replace(/^./, function(m){ return m.toUpperCase(); });
}
/* Full stat-leader line: one entry per ESPN leader category (first athlete each).
   Entries missing a name or stat — or the pre-game "0-0" MLB placeholder — are
   skipped rather than shown as junk. */
function leaderHtml(c){
  var cats = c.leaders||[], out = [];
  cats.forEach(function(cat){
    var L = (cat.leaders||[])[0];
    if(!L) return;
    var nm = GIU.esc((L.athlete||{}).displayName||""), val = GIU.esc(L.displayValue||"");
    if(!nm || !val || val==="0-0") return;
    out.push('<span><b>'+GIU.esc(leadLabel(cat.name))+'</b> '+nm+' <span class="num">'+val+'</span></span>');
  });
  return out.length ? '<div class="leaders">'+out.join("")+'</div>' : "";
}

/* ---- live auto-refresh machinery ----
   Scores for in-progress games re-pull the ESPN scoreboard every 60s, in
   place — no page reload, no spinner shimmer. The tick skips while the tab
   is hidden and carries on by itself when the tab returns. */
/* ---- game detail (box-score detail per game) ----
   In-progress and final games get a "Details" expander that fetches ESPN's
   game-summary endpoint once per event and renders a win-probability chart
   (with the biggest swing annotated), a scoring-plays timeline,
   period-by-period scoring, and a team-stats comparison. Pregame games get
   the same expander for ESPN's Matchup Predictor projection. Fetches are
   guarded by a per-event generation so a slow summary can't fill another
   event's region; open details survive the 60s silent board refresh, and
   open in-progress details are silently re-pulled on each tick. */
var detailOpen = {}, detailCache = {}, detailState = {}, detailLeague = {};
var detailSeq = 0, detailGen = {};

function setToggle(btn, open){
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.innerHTML = (open ? "Hide details" : "Details")+'<span class="gd-chev" aria-hidden="true"></span>';
}
/* Win-probability canvases are recreated on every innerHTML insert, so the
   paint must run after each one (fetch, cache hit, and board re-render).
   Defensive: a no-op where querySelectorAll or ScoresDetail is missing. */
function paintDetailCanvases(scope){
  var root = scope || (typeof document !== "undefined" ? document : null);
  if(!root || !root.querySelectorAll || !window.ScoresDetail ||
     !window.ScoresDetail.paintWinProb) return;
  Array.prototype.forEach.call(root.querySelectorAll(".gd-wp"), function(cv){
    try{ window.ScoresDetail.paintWinProb(cv); }catch(e){}
  });
}
function fetchDetail(id, silent){
  var seq = ++detailSeq; detailGen[id] = seq;
  var region = document.getElementById("gd-"+id);
  if(region && !silent) region.innerHTML = '<div class="skel" style="height:80px"></div>';
  GIU.fetchJSON(window.ScoresDetail.summaryUrl(detailLeague[id], id)).then(function(sum){
    if(detailGen[id] !== seq || !detailOpen[id]) return;
    var html = window.ScoresDetail.buildHtml(sum, detailLeague[id], GIU.esc);
    if(!html) html = '<div class="empty">No box-score detail available for this game yet.</div>';
    detailCache[id] = html;
    var r2 = document.getElementById("gd-"+id);
    if(r2 && detailOpen[id]){ r2.innerHTML = html; paintDetailCanvases(r2); }
  }).catch(function(){
    if(detailGen[id] !== seq) return;
    /* Keep the failure quiet and recoverable: collapse, and let the user
       retry on the next click. */
    delete detailOpen[id];
    var r2 = document.getElementById("gd-"+id);
    if(r2){ r2.hidden = true; r2.innerHTML = ""; }
    var b = document.querySelector('.gd-toggle[data-ev="'+id+'"]');
    if(b){ setToggle(b, false); b.title = "Couldn't load detail — click to retry"; }
  });
}
function toggleDetails(id){
  var btn = document.querySelector('.gd-toggle[data-ev="'+id+'"]');
  var region = document.getElementById("gd-"+id);
  if(detailOpen[id]){
    delete detailOpen[id];
    if(region) region.hidden = true;
    if(btn) setToggle(btn, false);
    return;
  }
  detailOpen[id] = true;
  detailLeague[id] = detailLeague[id] || LEAGUES[cur][0];
  if(btn){ setToggle(btn, true); btn.removeAttribute("title"); }
  if(region){
    region.hidden = false;
    if(detailCache[id]){ region.innerHTML = detailCache[id]; paintDetailCanvases(region); return; }
  }
  fetchDetail(id, false);
}

var LIVE_MS = 60000;
var liveTimer = null, autoOn = true, liveN = 0, lastUpdated = null;

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer = null; } }
function liveCount(evs){
  var n = 0;
  (evs||[]).forEach(function(ev){
    var c = ev.competitions && ev.competitions[0];
    if(c && c.status && c.status.type && c.status.type.state === "in") n++;
  });
  return n;
}
function fmtClock(ts){
  try{ return new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",second:"2-digit"}); }
  catch(e){ return ""; }
}
function renderLiveStatus(){
  var s = $("liveStatus"), b = $("pauseBtn");
  if(!s) return;
  if(liveN > 0 && autoOn){
    s.className = "live-status live";
    s.innerHTML = '<span class="live-dot" aria-hidden="true"></span>'+
      GIU.esc(liveN)+ ' live — auto-refresh every 60s'+
      (lastUpdated ? ' · updated '+GIU.esc(fmtClock(lastUpdated)) : "");
    if(b){ b.style.display = ""; b.innerHTML = "⏸ Pause live"; b.setAttribute("aria-pressed","false"); }
  } else if(liveN > 0){
    s.className = "live-status paused";
    s.textContent = liveN + " live game" + (liveN > 1 ? "s" : "") + " · auto-refresh paused";
    if(b){ b.style.display = ""; b.innerHTML = "▶ Resume live"; b.setAttribute("aria-pressed","true"); }
  } else {
    s.className = "live-status"; s.textContent = "";
    if(b){ b.style.display = "none"; }
  }
}

function renderEmptyBoard(){
  var box = $("scoreGrid");
  lastEvs = [];
  renderFollowStrip([]);
  renderSearchMeta(0, 0);
  box.innerHTML = '<div class="empty">No games on '+GIU.esc(dayLabel())+'. Try another day or league.</div>';
}

/* Honest jump notice: names both the league and both days so nobody
   mistakes next week's slate for today's board. Renders once, cleared by
   any day navigation. */
function smartNoticeHtml(){
  if(smartNoticeDay === null || smartNoticeDay !== dayOffset) return "";
  var today = new Date();
  var todayStr = today.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  return '<div class="notice green" style="margin-bottom:18px"><strong>No '+GIU.esc(LEAGUES[cur][1])+' games today.</strong> '+
    'Showing the next game day (<b style="color:var(--text)">'+GIU.esc(dayLabel())+
    '</b>) instead — the <b style="color:var(--text)">Today</b> button takes you back to '+
    GIU.esc(todayStr)+'.</div>';
}

function load(silent){
  clearLive(); /* league/day switches and silent refreshes always reschedule */
  var box = $("scoreGrid");
  if(!silent) box.innerHTML = '<div class="card"><div class="skel" style="height:110px"></div></div>'.repeat(3);
  $("dayLabel").textContent = dayLabel();
  var d = new Date(); d.setDate(d.getDate()+dayOffset);
  var url = scoreboardUrl(LEAGUES[cur][0], dayOffset);
  GIU.fetchJSON(url).then(function(data){
    var evs = data.events||[];
    if(!evs.length){
      /* Any league tab on a no-game day at dayOffset 0 (initial load): jump to
         the next game day instead of the dead board — the Tuesday–Wednesday
         handicap window (NFL/NCAAF have nothing until Thursday+, off-season
         leagues like NCAAB scan empty and stay on the honest empty state).
         Guarded to fire once per league per session, only on the default day,
         never on silent refreshes or explicit day navigation. */
      if(!silent && dayOffset === 0 && !smartTried[cur]){
        smartTried[cur] = true;
        return smartDay(GIU.fetchJSON, LEAGUES[cur][0], 0, 7).then(function(hit){
          if(hit && hit.offset){
            /* jump WITHOUT a refetch: the scan already has the game-day board */
            smartNoticeDay = hit.offset;
            dayOffset = hit.offset;
            $("dayLabel").textContent = dayLabel();
            renderBoard(hit.events);
          } else {
            renderEmptyBoard();
            liveN = 0; lastUpdated = Date.now(); renderLiveStatus();
          }
        });
      }
      renderEmptyBoard();
    } else {
      renderBoard(evs);
    }
  }).catch(function(){
    lastEvs = [];
    renderFollowStrip([]);
    renderSearchMeta(0, 0);
    box.innerHTML = GIU.failBox("The ESPN scoreboard feed didn't respond for "+LEAGUES[cur][1]+".");
  });
}

/* Render the game-day board (plus the jump notice when one applies) and arm
   the 60s live tick. Used by load() and directly by the smart-day jump. */
function renderBoard(evs){
  var box = $("scoreGrid");
  /* v1.161.0 — the board the finder filters: every render (load, league/
     day switch, 60s tick, search keystroke) starts from the last slate
     pulled and re-applies the active query. */
  lastEvs = Array.isArray(evs) ? evs : [];
  var visible = lastEvs.filter(function(ev){ return gameMatchesSearch(ev, searchQ); });
  /* v1.149.0 — followed-team matches for this board (strip + card marks);
     v1.161.0 — computed over the filtered board so a strip chip never
     promises a card the search hid (the news wire's discipline). */
  var fol = followedGames(visible, followedList());
  var folById = {};
  fol.forEach(function(m){ folById[m.id] = m.abbr; });
  renderFollowStrip(fol);
  if(searchTerms(searchQ).length && !visible.length){
      /* Named empty state — never a blank grid under an active search. */
      box.innerHTML = smartNoticeHtml() + '<div class="empty">No games match &quot;'+
        GIU.esc(String(searchQ).trim())+'&quot; on this board. Clear the search to see all '+
        lastEvs.length+' games.</div>';
  } else {
      box.innerHTML = smartNoticeHtml() + visible.map(function(ev){
      var c = ev.competitions[0], st = c.status.type;
      var home = c.competitors.filter(function(t){return t.homeAway==="home";})[0] || c.competitors[0];
      var away = c.competitors.filter(function(t){return t.homeAway==="away";})[0] || c.competitors[1] || {};
      var badge = st.state==="in" ? '<span class="live-badge"><i></i>'+GIU.esc(st.shortDetail||"Live")+'</span>'
        : st.state==="post" ? '<span class="tag">Final</span>'
        : '<span class="tag blue">'+GIU.esc(st.shortDetail||"Scheduled")+'</span>';
      var bc = ((c.broadcasts||[])[0]||{}).names;
      var odds = (c.odds&&c.odds[0]) ? '<span>Line: '+GIU.esc(c.odds[0].details||"")+(c.odds[0].overUnder? " · O/U "+c.odds[0].overUnder : "")+'</span>' : "";
      var leaders = leaderHtml(c);
      var hw = st.state==="post" && Number(home.score)>Number(away.score);
      var aw = st.state==="post" && Number(away.score)>Number(home.score);
      detailState[ev.id] = st.state;
      var det = "";
      if(st.state==="in" || st.state==="post" || st.state==="pre"){
        var open = !!detailOpen[ev.id];
        var detAria = st.state === "pre" ? "Game detail" : "Box-score detail";
        /* v1.139.0 — per-game matchup hub: one tap from any scoreboard card.
           Leagues without a hub mapping (EPL) get no link. */
        var hubKey = HUBKEY[LEAGUES[cur][0]];
        var hubLink = hubKey
          ? '<a class="btn btn-ghost btn-sm" style="margin-left:8px;vertical-align:middle" href="matchup.html?league='+hubKey+'&amp;event='+GIU.esc(ev.id)+'" aria-label="Open the matchup hub for this game">Matchup →</a>'
          : "";
        det = '<div><button type="button" class="gd-toggle" data-ev="'+GIU.esc(ev.id)+'"'+
          ' aria-expanded="'+(open?"true":"false")+'" aria-controls="gd-'+GIU.esc(ev.id)+'">'+
          (open?"Hide details":"Details")+'<span class="gd-chev" aria-hidden="true"></span></button>'+hubLink+'</div>'+
          '<div class="gd-detail" id="gd-'+GIU.esc(ev.id)+'" role="region" aria-label="'+detAria+'"'+
          (open?"":" hidden")+'>'+(open && detailCache[ev.id] ? detailCache[ev.id] : "")+'</div>';
      }
      return '<div class="game-card'+(folById[ev.id] ? " followed" : "")+'" id="sg-'+GIU.esc(ev.id)+'">'+badge+
        (folById[ev.id] ? ' <span class="tag your-team">★ Your team</span>' : "")+
        GIU.teamRow(away, aw)+ GIU.teamRow(home, hw)+
        '<div class="game-meta"><span>'+GIU.esc((c.venue||{}).fullName||"")+'</span>'+
        (bc?'<span>📺 '+GIU.esc(bc.join(", "))+'</span>':"")+odds+'</div>'+leaders+det+'</div>';
      }).join("");
  }
    /* ---- live auto-refresh ----
       In-progress games keep the board fresh every 60s. Ticks skip while the
       tab is hidden (nothing to see), and resume on their own when it comes
       back — no visibility listeners needed. The live count describes the
       whole slate pulled, not the search's filtered view. */
    liveN = liveCount(lastEvs);
    lastUpdated = Date.now();
    renderLiveStatus();
    renderSearchMeta(visible.length, lastEvs.length);
    /* Open details survive the re-render (restored from cache in the card
       template above); open in-progress details are silently re-pulled so
       the scoring timeline stays fresh on the 60s tick. */
    Object.keys(detailOpen).forEach(function(id){
      if(detailState[id] === "in") fetchDetail(id, true);
    });
    /* Cached detail HTML re-inserted by the card template above carries
       fresh (unpainted) canvases — paint them after every re-render. */
    paintDetailCanvases(box);
    if(liveN > 0 && autoOn){
      /* renderBoard can now be re-entered by a search keystroke, not only
         via load() — clear first so the board never stacks 60s timers. */
      clearLive();
      liveTimer = setInterval(function(){ if(!isHidden()) load(true); }, LIVE_MS);
    }
}

$("leagueTabs").innerHTML = LEAGUES.map(function(l,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+l[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("leagueTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("leagueTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); smartNoticeDay = null; load();
  });
});
$("scoreGrid").addEventListener("click", function(e){
  var t = e.target && e.target.closest ? e.target.closest(".gd-toggle") : null;
  if(t) toggleDetails(t.getAttribute("data-ev"));
});
$("prevDay").addEventListener("click", function(){ smartNoticeDay = null; dayOffset--; load(); });$("nextDay").addEventListener("click", function(){ smartNoticeDay = null; dayOffset++; load(); });
$("todayBtn").addEventListener("click", function(){ smartNoticeDay = null; dayOffset=0; load(); });
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn && liveN > 0){ load(true); }  /* resume: refresh now, timer reschedules */
  else { clearLive(); renderLiveStatus(); }
});
/* v1.161.0 — find-a-game wiring. The query lives in module state, so it
   survives league/day switches and the 60s silent refresh; filtering
   re-renders from lastEvs without a refetch. No hooks on the page ->
   nothing is wired and the board behaves exactly as before. */
var searchInput = $("scoreQ"), searchClearBtn = $("scoreClear");
function rerenderForSearch(){
  if(lastEvs.length) renderBoard(lastEvs); else renderSearchMeta(0, 0);
}
function resetSearch(){
  searchQ = "";
  if(searchInput) searchInput.value = "";
  rerenderForSearch();
  if(searchInput && searchInput.focus) searchInput.focus();
}
if(searchInput && searchInput.addEventListener){
  searchInput.addEventListener("input", function(){
    searchQ = searchInput.value || "";
    rerenderForSearch();
  });
  searchInput.addEventListener("keydown", function(e){
    if(e && e.key === "Escape") resetSearch();
  });
}
if(searchClearBtn && searchClearBtn.addEventListener){
  searchClearBtn.addEventListener("click", resetSearch);
}
/* test seam: pure helpers exported in node, attached to GIU in the browser */
if(typeof module !== "undefined" && module.exports){ module.exports = { smartDay: smartDay, scoreboardUrl: scoreboardUrl, ymd: ymd, followedGames: followedGames, gameMatchesSearch: gameMatchesSearch, gameSearchText: gameSearchText, searchTerms: searchTerms }; }
else if(typeof window !== "undefined"){ window.GIU = window.GIU || {}; window.GIU.scoresSmartDay = smartDay; window.GIU.scoresBoardUrl = scoreboardUrl; window.GIU.scoresFollowedGames = followedGames; window.GIU.scoresGameSearch = gameMatchesSearch; window.GIU.scoresGameText = gameSearchText; window.GIU.scoresSearchTerms = searchTerms; }
load();
})();
