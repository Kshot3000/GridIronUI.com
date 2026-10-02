/* GridIronUI News — ESPN league news feeds, with live auto-refresh.
   The wire re-pulls silently every 3 minutes while the tab is visible, so
   headlines stay fresh on game days without a reload.
   v1.157.0: followed teams — ESPN's own structured team categories on
   each article are matched against the odds board's ★ follows
   (giu-followed-teams), so a story is marked only when ESPN tagged it
   with your team; headline text is never guessed at.
   v1.152.0: headline search — each tab loads 24 headlines and a bettor
   hunting one player, team or story ("Mahomes", "trade", "injury") had to
   eyeball every card. Typing now filters the loaded wire live (headline +
   description), highlights matches, and shows an honest "N of 24 <league>
   headlines" count. The query survives tab switches and the silent
   3-minute refresh — a refresh re-filters the new wire instead of wiping
   the search. Nothing is fetched or invented for the search: it only
   filters what ESPN already sent. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["football/nfl","NFL"],["basketball/nba","NBA"],["baseball/mlb","MLB"],
  ["hockey/nhl","NHL"],["football/college-football","NCAAF"],
  ["basketball/mens-college-basketball","NCAAB"],["soccer/eng.1","EPL"]
];
var cur = 0;

/* ---- headline search state (v1.152.0) ---- */
var lastArts = [], hasLoaded = false, query = "";

function normQuery(q){
  return String(q == null ? "" : q).trim().toLowerCase();
}
/* Pure: articles whose headline or description contains the query
   (case-insensitive). Blank query returns every article in original
   order. Garbage in -> []; the input array is never mutated. */
function filterArticles(arts, q){
  var needle = normQuery(q);
  var src = Array.isArray(arts) ? arts : [];
  if(!needle) return src.slice();
  return src.filter(function(a){
    var h = String((a && a.headline) || "").toLowerCase();
    var d = String((a && a.description) || "").toLowerCase();
    return h.indexOf(needle) !== -1 || d.indexOf(needle) !== -1;
  });
}
/* Pure, XSS-safe: escape the raw text, then wrap every case-insensitive
   occurrence of the query in <mark>. Escaping happens per-segment so a
   query like "<" can never break out of the markup. */
function hlHtml(text, q, esc){
  var raw = String(text == null ? "" : text);
  var e = typeof esc === "function" ? esc : function(s){ return String(s); };
  var needle = normQuery(q);
  if(!needle) return e(raw);
  var low = raw.toLowerCase(), out = "", i = 0, j;
  while((j = low.indexOf(needle, i)) !== -1){
    out += e(raw.slice(i, j)) + "<mark>" + e(raw.slice(j, j + needle.length)) + "</mark>";
    i = j + needle.length;
  }
  return out + e(raw.slice(i));
}
try{
  if(typeof GIU !== "undefined" && GIU){
    GIU.newsFilter = filterArticles; GIU.newsHl = hlHtml; GIU.newsNorm = normQuery;
  }
}catch(e){}

/* ---- followed teams (v1.157.0) ----
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") already mark odds, scores, predictions,
   injuries, weather, markets and the homepage — but not the wire,
   where a followed team's news is what moves its line. Matching here
   is NOT text search: ESPN tags every article with structured
   categories, and team categories carry the team's abbreviation in
   the same ESPN namespace the follow list was built in. A story is
   marked only when ESPN itself tagged it with a followed team — a
   headline that merely mentions a nickname ("Bills", "Heat") in
   passing earns nothing, so there are no nickname false positives.
   Followed stories get the boards' gold rail + "★ Your team" tag,
   and a "Your teams" jump strip opens the wire with one chip per
   followed story in the current view (search filter included — a
   chip never promises a card the filter hid). No follows, or no
   followed team tagged on this tab: strip hidden, wire renders
   exactly as before. The follow list is re-read on every render, so
   an unfollow on the odds board shows up on the next silent refresh. */
function teamFollow(){ try{ return (typeof GIU !== "undefined" && GIU && GIU.TeamFollow) || null; }catch(e){ return null; } }
function followedList(){
  var T = teamFollow();
  try{ return T ? T.load() : []; }catch(e){ return []; }
}
function normAbbr(s){ return String(s == null ? "" : s).trim().toUpperCase(); }
/* Follow-list cleanup mirroring team-follow.js list(): trim/upper,
   2–4 letters, deduped, follow order preserved. Garbage in -> []. */
function cleanFollows(followed){
  var out = [], seen = {};
  (Array.isArray(followed) ? followed : []).forEach(function(x){
    if(typeof x !== "string") return;
    var n = normAbbr(x);
    if(/^[A-Z]{2,4}$/.test(n) && !seen[n]){ seen[n] = 1; out.push(n); }
  });
  return out;
}
/* Pure: the team abbreviations ESPN structured-tagged on an article
   (categories with type "team"), normalized + deduped, in category
   order. League/topic/athlete categories are not teams and never
   count. Garbage in -> []. */
function articleTeams(a){
  var out = [], seen = {};
  var cats = (a && Array.isArray(a.categories)) ? a.categories : [];
  cats.forEach(function(c){
    if(!c || c.type !== "team") return;
    var ab = normAbbr(c.team && c.team.abbreviation);
    if(!ab || seen[ab]) return;
    seen[ab] = 1; out.push(ab);
  });
  return out;
}
/* Pure: the first followed abbreviation (follow-list order) ESPN
   tagged on this article, or null. */
function followedArticle(a, followed){
  var f = cleanFollows(followed);
  if(!f.length) return null;
  var teams = articleTeams(a);
  for(var i = 0; i < f.length; i++){ if(teams.indexOf(f[i]) !== -1) return f[i]; }
  return null;
}
/* Pure: stable card anchor key from the ESPN article id (sanitized),
   falling back to the article's position when no usable id exists. */
function articleKey(a, i){
  var raw = (a && a.id != null) ? String(a.id) : "";
  var k = raw.replace(/[^A-Za-z0-9_-]/g, "");
  return "nw-" + (k || ("x" + i));
}
/* Pure: one record per article a followed team is tagged in —
   {key, abbr, headline} in wire order. Garbage in -> []. */
function followedNews(arts, followed){
  var f = cleanFollows(followed);
  if(!f.length || !Array.isArray(arts)) return [];
  var out = [];
  arts.forEach(function(a, i){
    if(!a) return;
    var hit = followedArticle(a, f);
    if(hit) out.push({ key: articleKey(a, i), abbr: hit, headline: String(a.headline || "") });
  });
  return out;
}
/* Pure strip HTML: the "★ Your teams" label + one jump chip per
   followed story (abbr + headline, clipped). Everything
   source-derived is escaped through the caller's esc. */
function followHTML(matches, esc){
  var e = typeof esc === "function" ? esc : function(s){ return String(s == null ? "" : s); };
  return '<span class="follow-strip-label">★ Your teams</span>' +
    (Array.isArray(matches) ? matches : []).map(function(m){
      var h = String((m && m.headline) || "");
      var short = h.length > 44 ? h.slice(0, 44).replace(/\s+\S*$/, "") + "…" : h;
      return '<a class="follow-chip-link" href="#' + e(m.key) + '"><b>' + e(m.abbr) + "</b>" +
        (short ? " " + e(short) : "") + "</a>";
    }).join("");
}
try{
  if(typeof GIU !== "undefined" && GIU){
    GIU.newsArticleTeams = articleTeams; GIU.newsFollowed = followedNews;
    GIU.newsFollowHTML = followHTML; GIU.newsArticleKey = articleKey;
  }
}catch(e){}
/* The "Your teams" jump strip over the wire. Empty match list ->
   strip hidden and emptied, so tab switches, search filters, empty
   wires and feed errors never leave a stale strip behind. */
function renderFollowStrip(matches){
  var el = $("newsFollow");
  if(!el) return;
  if(!matches || !matches.length){ el.innerHTML = ""; el.hidden = true; return; }
  el.innerHTML = followHTML(matches, GIU.esc);
  el.hidden = false;
}

/* ---- live auto-refresh machinery ----
   The news feed re-pulls silently every 3 minutes — no skeleton shimmer.
   Ticks skip while the tab is hidden and resume on their own. */
var LIVE_MS = 3*60*1000;
var liveTimer = null, autoOn = true, lastUpdated = null;
var tabSeq = 0; /* render generation: a slow tab response never overwrites a newer tab */

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer = null; } }
function fmtClock(ts){
  try{ return new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",second:"2-digit"}); }
  catch(e){ return ""; }
}
function renderLiveStatus(){
  var s = $("liveStatus"), b = $("pauseBtn");
  if(!s) return;
  if(autoOn){
    s.className = "live-status live";
    s.innerHTML = '<span class="live-dot" aria-hidden="true"></span>'+
      'auto-refresh every 3 min'+
      (lastUpdated ? ' · updated '+GIU.esc(fmtClock(lastUpdated)) : "");
    if(b){ b.style.display = ""; b.innerHTML = "⏸ Pause live"; b.setAttribute("aria-pressed","false"); }
  } else {
    s.className = "live-status paused";
    s.textContent = "auto-refresh paused";
    if(b){ b.style.display = ""; b.innerHTML = "▶ Resume live"; b.setAttribute("aria-pressed","true"); }
  }
}

function ago(iso){
  var t = Date.parse(iso); if(!isFinite(t)) return "";
  var m = Math.floor((Date.now()-t)/60000);
  if(m < 60) return m+"m ago";
  var h = Math.floor(m/60); if(h < 24) return h+"h ago";
  return Math.floor(h/24)+"d ago";
}
function renderCount(shown){
  var c = $("newsCount");
  if(!c) return;
  if(!normQuery(query)){ c.textContent = ""; return; }
  c.textContent = shown === 0
    ? "No matches in " + LEAGUES[cur][1]
    : shown + " of " + lastArts.length + " " + LEAGUES[cur][1] + " headlines";
}
function renderArticles(arts){
  var box = $("newsGrid");
  lastArts = Array.isArray(arts) ? arts.slice() : [];
  hasLoaded = true;
  var shown = filterArticles(lastArts, query);
  renderCount(shown.length);
  if(!lastArts.length){ renderFollowStrip([]); box.innerHTML = '<div class="empty">No headlines right now.</div>'; return; }
  if(!shown.length){
    renderFollowStrip([]);
    box.innerHTML = '<div class="empty">No headlines match &ldquo;' + GIU.esc(String(query).trim()) +
      '&rdquo; in ' + LEAGUES[cur][1] + '. Clear the search to see the full wire.</div>';
    return;
  }
  /* v1.157.0 — followed-team marks over the SHOWN wire (post search
     filter), follow list re-read fresh so unfollows land next render */
  var matches = followedNews(shown, followedList());
  var byKey = {};
  matches.forEach(function(m){ byKey[m.key] = m; });
  renderFollowStrip(matches);
  box.innerHTML = shown.map(function(a, idx){
    var img = (a.images&&a.images[0]&&a.images[0].url)
      ? '<img class="card-img" loading="lazy" src="'+a.images[0].url+'" alt="">' : "";
    var link = (a.links&&a.links.web&&a.links.web.href) || "#";
    var desc = a.description||"";
    desc = desc.length>160 ? desc.slice(0,160)+"…" : desc;
    var key = articleKey(a, idx), hit = byKey[key] || null;
    return '<a class="card'+(hit ? " followed" : "")+'" id="'+GIU.esc(key)+'" href="'+link+'" target="_blank" rel="noopener">'+img+
      '<div class="game-meta" style="margin:8px 0 6px"><span class="tag">'+LEAGUES[cur][1]+'</span>'+
      (hit ? '<span class="tag your-team">★ Your team</span>' : "")+'<span>'+ago(a.published)+'</span></div>'+
      '<h3>'+hlHtml(a.headline, query, GIU.esc)+'</h3><p>'+hlHtml(desc, query, GIU.esc)+'</p></a>';
  }).join("");
}
function load(silent){
  clearLive(); /* tab switches and silent refreshes always reschedule */
  var mySeq = ++tabSeq;
  var box = $("newsGrid");
  if(!silent) box.innerHTML = '<div class="card"><div class="skel" style="height:150px"></div></div>'.repeat(4);
  GIU.fetchJSON("https://site.api.espn.com/apis/site/v2/sports/"+LEAGUES[cur][0]+"/news?limit=24").then(function(d){
    if(mySeq !== tabSeq) return; /* a newer tab switch already won — discard */
    renderArticles(d.articles||[]);
    lastUpdated = Date.now();
    renderLiveStatus();
    if(autoOn) liveTimer = setInterval(function(){ if(!isHidden()) load(true); }, LIVE_MS);
  }).catch(function(){
    if(mySeq !== tabSeq) return;
    lastArts = []; hasLoaded = false; /* a search keystroke must never resurrect the previous league's cards over the error */
    renderFollowStrip([]); /* nor may the error leave a stale "Your teams" strip over the fail box */
    var c = $("newsCount"); if(c) c.textContent = "";
    box.innerHTML = GIU.failBox("The ESPN news feed didn't respond for "+LEAGUES[cur][1]+".");
  });
}
$("newsTabs").innerHTML = LEAGUES.map(function(l,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+l[1]+'</button>';
}).join("");
Array.prototype.forEach.call($("newsTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("newsTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active"); cur = Number(t.getAttribute("data-i")); load();
  });
});
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn){ load(true); }  /* resume: refresh now, timer reschedules */
  else { clearLive(); renderLiveStatus(); }
});
/* ---- headline search wiring (v1.152.0) ----
   Typing filters the already-loaded wire; the query is state, so tab
   switches and the silent refresh re-apply it via renderArticles. Before
   the first successful load there is nothing to filter — the keystroke
   just records the query and the arriving wire renders filtered. */
(function(){
  var searchEl = $("newsSearch"), clearEl = $("newsClear");
  if(!searchEl || !searchEl.addEventListener) return;
  function syncClear(){ if(clearEl) clearEl.hidden = !normQuery(query); }
  function apply(){
    query = searchEl.value;
    syncClear();
    if(hasLoaded) renderArticles(lastArts);
  }
  function reset(){
    searchEl.value = "";
    query = "";
    syncClear();
    if(hasLoaded) renderArticles(lastArts);
    if(typeof searchEl.focus === "function") searchEl.focus();
  }
  searchEl.addEventListener("input", apply);
  searchEl.addEventListener("keydown", function(ev){
    if(ev && ev.key === "Escape") reset();
  });
  if(clearEl && clearEl.addEventListener) clearEl.addEventListener("click", reset);
  syncClear();
})();
load();
})();
