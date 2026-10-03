/* GridIronUI Predictions — market-implied probabilities, honestly labeled.
   These are NOT our picks. They are live Polymarket prices converted to probabilities.
   Series are looked up live per league so the page survives series rotation.
   v2.0.6: an NCAAF tab joins the board — Polymarket lists a real College
   Football series (sport key "cfb", verified live against gamma /sports;
   the markets page's CFB tab already reads it), and on a college Saturday
   this page was the last board without the college slate. The tab rides
   the identical live series lookup and moneyline filter as every other
   league. Honest limits, same discipline as the home strip (v2.0.3): the
   Kalshi cross-check and the Kalshi-only fallback stay NFL/MLB-only —
   SNAP gains no cfb entry, because there is still no honest
   ESPN<->Kalshi college join for the per-game rows, and the team
   directory has no college namespace, so followed-team marks simply
   never resolve on this tab instead of being guessed. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [["NFL","nfl"],["NBA","nba"],["MLB","mlb"],["NHL","nhl"],["NCAAF","cfb"],["EPL","epl"]];
var curKey = "nfl";
/* Kalshi snapshot file per league: NFL game-winners + MLB postseason
   game-winners, both rebuilt server-side by scripts/fetch-kalshi.py. */
var SNAP = {nfl: "data/kalshi-nfl.json", mlb: "data/kalshi-mlb.json"};
/* Render generation: every tab click bumps tabSeq, and each async callback
   only touches the DOM if its generation is still current. Without this, a
   slow response for one league can overwrite another league's cards the user
   asked for in the meantime. */
var tabSeq = 0;

/* ---- live auto-refresh machinery (same contract as markets.js v1.21.0) ----
   Polymarket prices move with the games, so the cards keep themselves fresh
   in place — no reload, no skeleton shimmer. The refresh tick only runs while
   a shown game is likely in-progress (started within the last 4 hours —
   Polymarket exposes startTime but no in-progress flag, and games rarely run
   longer). Ticks skip while the tab is hidden and resume on their own when it
   returns. Timers never stack: every load clears the old timer first. */
var PM_MS = 90000, LIVE_WINDOW_MS = 4*3600*1000, SPOT_MS = 60000;
var liveTimer = null, autoOn = true, liveN = 0, lastUpdated = null;
/* Spotlight countdown: the nearest upcoming game's kickoff countdown ticks
   every 60s without network traffic. spotIso is the featured game's kickoff
   in ISO form; null means no spotlight is showing. */
var spotTimer = null, spotIso = null;

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){
  if(liveTimer){ clearInterval(liveTimer); liveTimer = null; }
  if(spotTimer){ clearInterval(spotTimer); spotTimer = null; }
  spotIso = null;
}
/* Spotlight countdown text via the home strip's tested kickoffIn (v1.124.0);
   null when the API is unavailable — the static kickoff time still shows. */
function spotCountdown(iso){
  try{
    var hs = window.GIU && window.GIU.homeStrip;
    if(hs && hs.kickoffIn) return hs.kickoffIn(iso);
  }catch(e){}
  return null;
}
function tickSpot(){
  var el = $("spotCountdown");
  if(!el || !spotIso){ if(spotTimer){ clearInterval(spotTimer); spotTimer = null; } return; }
  var cd = spotCountdown(spotIso);
  if(cd === null){
    /* Kickoff passed while the visitor watched: rebuild silently so the
       next upcoming game is featured instead of a stale countdown. */
    load(curKey, tabSeq, true);
    return;
  }
  el.textContent = cd;
}
function likelyLive(rows){
  var now = Date.now(), n = 0;
  (rows||[]).forEach(function(r){
    var t = startOf(r.ev || {});
    if(t < now && now - t < LIVE_WINDOW_MS) n++;
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
      GIU.esc(liveN + (liveN > 1 ? " live games" : " live game") + " — auto-refresh every 90s")+
      (lastUpdated ? " · updated "+GIU.esc(fmtClock(lastUpdated)) : "");
    if(b){ b.style.display = ""; b.innerHTML = "⏸ Pause live"; b.setAttribute("aria-pressed","false"); }
  } else if(liveN > 0){
    s.className = "live-status paused";
    s.textContent = liveN + (liveN > 1 ? " games" : " game") + " · auto-refresh paused";
    if(b){ b.style.display = ""; b.innerHTML = "▶ Resume live"; b.setAttribute("aria-pressed","true"); }
  } else {
    s.className = "live-status"; s.textContent = "";
    if(b){ b.style.display = "none"; }
  }
}
function parseArr(s){ try{ var v = typeof s==="string"?JSON.parse(s):s; return Array.isArray(v)?v:[]; }catch(e){ return []; } }

/* ---- followed teams (v1.150.0) ----
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") already mark the scores board (v1.149.0); they now
   mark this page too — the place a bettor checks what the crowd thinks of
   their teams before game day. Followed-team games get a gold rail +
   "★ Your team" tag, every card gains a #pg-<slug> anchor, and a "Your
   teams" jump strip opens the board with one chip per followed game on
   this league tab (the spotlight card included — it is pulled out of the
   grid, so its chip must point at the spotlight's own anchor). Matching
   resolves BOTH title sides through the caller's teamFind against the
   ESPN-sourced team directory, so abbreviations compare in the same
   ESPN namespace the follow list was built in; a side that doesn't
   resolve simply can't match — never a fuzzy guess. No follows, or no
   followed team on this tab: the strip stays hidden and the cards render
   exactly as before. */
function teamFollow(){ try{ return (window.GIU && window.GIU.TeamFollow) || null; }catch(e){ return null; } }
function followedList(){
  var T = teamFollow();
  try{ return T ? T.load() : []; }catch(e){ return []; }
}
/* rowKey: the card anchor key for a row — the event's slug (URL-safe by
   construction on Polymarket), else its id, else a slugified title, else
   a positional key. Sanitized regardless of source so a hostile slug can
   never break out of the id attribute. */
function rowKey(r, idx){
  var ev = (r && r.ev) || {};
  var raw = String(ev.slug || ev.id || "").trim().toLowerCase();
  var k = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if(k) return k;
  var t = String(ev.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return t || ("game-" + (idx || 0));
}
/* followedPredictions: pure matcher. Takes prediction rows ({ev:{title,
   slug,...}}), the raw followed list, the team directory, the league key
   and a teamFind(dir, league, name) resolver; returns one record per row
   a followed team plays in: {key, abbr (the followed side), abbrA, abbrB
   ("" when a side doesn't resolve), aName, bName}. First followed entry
   wins when both sides are followed. Garbage in -> []. Exported for
   tests as GIU.predictionsFollowed. */
function followedPredictions(rows, followed, dir, league, find){
  var f = [], seen = {};
  (Array.isArray(followed) ? followed : []).forEach(function(x){
    if(typeof x !== "string") return;
    var n = x.trim().toUpperCase();
    if(/^[A-Z]{2,4}$/.test(n) && !seen[n]){ seen[n] = 1; f.push(n); }
  });
  if(!f.length || !Array.isArray(rows) || typeof find !== "function") return [];
  var out = [];
  rows.forEach(function(r, idx){
    var ev = (r && r.ev) || {};
    var tp = String(ev.title || "").split(/\s+vs\.?\s+/);
    if(tp.length !== 2 || !tp[0].trim() || !tp[1].trim()) return;
    var ta = null, tb = null;
    try{ ta = find(dir, league, tp[0].trim()); }catch(e){ ta = null; }
    try{ tb = find(dir, league, tp[1].trim()); }catch(e){ tb = null; }
    var aa = (ta && ta.abbr) ? String(ta.abbr).trim().toUpperCase() : "";
    var bb = (tb && tb.abbr) ? String(tb.abbr).trim().toUpperCase() : "";
    if(!aa && !bb) return;
    var hit = null, i;
    for(i = 0; i < f.length; i++){ if(f[i] === aa || f[i] === bb){ hit = f[i]; break; } }
    if(!hit) return;
    out.push({ key: rowKey(r, idx), abbr: hit, abbrA: aa, abbrB: bb,
               aName: tp[0].trim(), bName: tp[1].trim() });
  });
  return out;
}
/* The "Your teams" jump strip: one chip per followed game on this tab,
   anchor-linked to the card's #pg-<key> (grid or spotlight — both carry
   the id, and the jumped-to card gets a gold :target ring). Empty match
   list -> strip hidden and emptied, so tab switches, empty boards and
   the Kalshi-only fallback never leave a stale strip behind. */
function renderFollowStrip(matches){
  var el = $("followStrip");
  if(!el) return;
  if(!matches || !matches.length){ el.innerHTML = ""; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<span class="follow-strip-label">★ Your teams</span>' +
    matches.map(function(m){
      var a = m.abbrA || m.aName || "", b = m.abbrB || m.bName || "";
      return '<a class="follow-chip-link" href="#pg-'+GIU.esc(m.key)+'">'+
        '<b>★ '+GIU.esc(m.abbr)+'</b> '+GIU.esc(a)+' vs '+GIU.esc(b)+'</a>';
    }).join("");
}
try{ window.GIU = window.GIU || {}; window.GIU.predictionsFollowed = followedPredictions; window.GIU.predictionsRowKey = rowKey; }catch(e){}

/* ---- find a game (v1.164.0) ----
   Every other game board got a finder (scores v1.161.0, markets
   v1.162.0, odds v1.163.0) — this was the last one without, and it had
   a second, quieter problem: the board silently capped at 10 games,
   so a game outside the cap wasn't even on the page to find. The pure
   matcher below splits the query into terms and EVERY term must
   appear in the game's search text — title sides plus BOTH sides'
   directory-resolved abbreviations (GIU.teamFind, the followedPredictions
   approach: "kc" finds the Chiefs game) plus priced outcome names — so
   "chiefs bills" narrows across sides while a term that appears
   nowhere matches nothing, never everything. Garbage in -> empty text
   / no match, never a throw.
   The loader caches the FULL parsed board (lastBoard, before the
   10-game cap) and paintBoard() renders through the query: while a
   search is active the cap lifts (every match renders), the "Next
   game" spotlight steps aside (its game joins the grid like any other
   match — no game is privileged out of the results), and the "Your
   teams" strip is computed over the FILTERED board so a chip never
   promises a card the search hid. Typing re-paints from the cache —
   it never re-fetches — and because load() paints through the same
   path, the query survives league tab switches and the 90s silent
   refresh. No query -> the board renders exactly as before (10-game
   cap, spotlight split, follow strip over the capped board). The
   query is DOM state only, never persisted. */
var searchQ = "";
var lastBoard = null; /* {rows (full, uncapped), dir, key} from the last successful load */
function searchTerms(q){
  return String(q == null ? "" : q).toLowerCase().split(/\s+/).filter(function(t){ return !!t; });
}
function predSearchText(r, dir, league, find){
  var ev = (r && r.ev) || {};
  var parts = [String(ev.title || "")];
  var tp = String(ev.title || "").split(/\s+vs\.?\s+/);
  if(tp.length === 2 && typeof find === "function"){
    [tp[0].trim(), tp[1].trim()].forEach(function(name){
      if(!name) return;
      var t = null;
      try{ t = find(dir, league, name); }catch(e){ t = null; }
      if(t && t.abbr) parts.push(String(t.abbr));
    });
  }
  if(r && Array.isArray(r.mls)){
    r.mls.forEach(function(m){
      parseArr(m && m.outcomes).forEach(function(o){ parts.push(String(o || "")); });
    });
  }
  return parts.join(" ").toLowerCase();
}
function predMatchesSearch(r, q, dir, league, find){
  var terms = searchTerms(q);
  if(!terms.length) return true;
  var text = predSearchText(r, dir, league, find);
  if(!text) return false;
  for(var i = 0; i < terms.length; i++){ if(text.indexOf(terms[i]) === -1) return false; }
  return true;
}
try{ window.GIU = window.GIU || {}; window.GIU.predictionsSearchTerms = searchTerms;
     window.GIU.predictionsSearchText = predSearchText; window.GIU.predictionsMatchesSearch = predMatchesSearch; }catch(e){}
/* Honest live-region count + Clear visibility. total === null means no
   searchable board is on screen (loading, league-empty, or the Kalshi
   fallback): the count stays silent rather than inventing a number. */
function renderSearchMeta(total, shown){
  var c = $("predCount"), b = $("predClear");
  var searching = searchTerms(searchQ).length > 0;
  if(b) b.hidden = !searching;
  if(!c) return;
  if(!searching || total == null){ c.textContent = ""; return; }
  c.textContent = shown > 0 ? (shown + " of " + total + " games") : "No matches";
}
function resetSearch(){
  searchQ = "";
  var q = $("predQ"); if(q) q.value = "";
  if(lastBoard) paintBoard(); else renderSearchMeta(null, 0);
  if(q && q.focus) q.focus();
}

function skel(){
  $("predGrid").innerHTML = '<div class="card"><div class="skel" style="height:140px"></div></div>'+
    '<div class="card"><div class="skel" style="height:140px"></div></div>';
}
/* League-aware "next game" label for the spotlight kicker. */
var SPOT_KICKER = {nfl:"Next kickoff", nba:"Next tip-off", mlb:"Next first pitch",
                   nhl:"Next puck drop", cfb:"Next kickoff", epl:"Next kick-off"};
/* The nearest upcoming game with a real future kickoff, or null. Rows are
   pre-sorted by start time; dateless rows (Infinity) are skipped, never
   featured. */
function nextUpcoming(rows){
  var now = Date.now(), r = null;
  (rows||[]).forEach(function(x){
    if(r) return;
    var t = startOf(x.ev || {});
    if(isFinite(t) && t > now) r = x;
  });
  return r;
}
/* Card HTML shared by the grid and the spotlight: matchup header, kickoff
   time, Polymarket probability bars, the Kalshi cross-check when matched,
   and the source-market link. */
function cardInner(r, dir, key, folAbbr){
  var t = fmtT(r.ev.startTime || r.ev.eventDate);
  var slug = r.ev.slug||"";
  var tp = String(r.ev.title||"").split(/\s+vs\.?\s+/);
  var head = (tp.length===2 && GIU.vsHeader(dir, key, tp[0], tp[1])) ||
    '<h3 style="margin:10px 0 4px;font-size:1.02rem">'+GIU.esc(r.ev.title)+'</h3>';
  var body;
  if(r.mls.length===1){
    /* classic 2-way: team vs team */
    var o = parseArr(r.mls[0].outcomes), p = parseArr(r.mls[0].outcomePrices);
    var p0 = Math.round(Number(p[0])*100);
    if(/^Yes$/i.test(o[0]) && /^No$/i.test(o[1])){
      body = probRow(shortQ(r.mls[0].question)+" — Yes", p0, r.mls[0].oneWeekPriceChange) + probRow(shortQ(r.mls[0].question)+" — No", 100-p0);
    } else {
      body = probRow(o[0], p0, r.mls[0].oneWeekPriceChange) + probRow(o[1], 100-p0);
    }
  } else {
    /* 3-way style (soccer): each market's Yes price, with its own 7d move */
    body = r.mls.map(function(m){
      var p = parseArr(m.outcomePrices);
      return probRow(shortQ(m.question), Math.round(Number(p[0])*100), m.oneWeekPriceChange);
    }).join("");
  }
  return '<span class="tag green">Market-implied</span>'+
    (folAbbr ? ' <span class="tag your-team">★ Your team</span>' : '')+
    head+
    (t ? '<div class="game-meta" style="margin-bottom:12px"><span>'+t+'</span></div>' : '<div style="height:8px"></div>')+
    body+
    ((r.km && window.Kalshi) ? window.Kalshi.predRow(r.km.nameA, r.km.aPct, r.km.nameB, r.km.bPct, r.km.updatedAt, r.km.pmA, r.km) : "")+
    '<div class="game-meta"><span>Source: Polymarket live price</span>'+(slug?'<a href="https://polymarket.com/event/'+GIU.esc(slug)+'" target="_blank" rel="noopener">View market →</a>':"")+'</div>';
}
function fmtT(iso){
  try{ var d=new Date(iso); if(!isFinite(d)) return "";
    return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})+" · "+
           d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }catch(e){ return ""; }
}
function seriesFor(key){
  return GIU.fetchJSON("https://gamma-api.polymarket.com/sports").then(function(ss){
    var s = (ss||[]).filter(function(x){ return x.sport===key; })[0];
    if(!s || !s.series) throw new Error("no-series");
    return s.series;
  });
}
function startOf(ev){
  var t = Date.parse(ev.startTime || ev.eventDate || "");
  return isFinite(t) ? t : Infinity;
}
function shortQ(q){
  return String(q||"").replace(/^Will /,"").replace(/ on \d{4}-\d{2}-\d{2}\??$/,"")
    .replace(/ end in a draw\??$/," draw").replace(/\?$/,"");
}
function probRow(label, pct, chg){
  var hot = pct>=50;
  /* 7-day price movement reported by Polymarket for this market (0-1 units).
     Shown once per market, next to the first outcome — no derived claims. */
  var c = Number(chg), chip = "";
  if(isFinite(c) && Math.abs(c) >= 0.001){
    chip = ' <span class="'+(c>0?"mv-up":"mv-dn")+'" style="font-size:.78rem" title="7-day price change for this market, reported by Polymarket — where the money has been pushing the price.">'+
      (c>0?"▲ +":"▼ −")+(Math.abs(c)*100).toFixed(1)+'¢ 7d</span>';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:.9rem">'+GIU.esc(label)+'</span><b class="num" style="font-size:1.25rem;color:'+(hot?"var(--gold-soft)":"var(--muted)")+'">'+pct+'%'+chip+'</b></div>'+
  '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);margin-bottom:12px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(hot?"linear-gradient(90deg,var(--green),var(--gold))":"rgba(255,255,255,.18)")+'"></div></div>';
}
/* paintBoard: render the cached board (lastBoard) through the current
   search query — follow strip, spotlight, grid, search count. Called by
   load() on every successful pull and by the finder on every keystroke
   (from the cache; typing never fetches). Spotlight/timer discipline:
   while searching, the spotlight timer is stopped and its card joins
   the grid; when the search clears, the spotlight re-arms its 60s
   countdown here. The 90s live-refresh timer is load()'s business and
   is never touched here, so keystrokes can't stack it. */
function paintBoard(){
  if(!lastBoard) return;
  var rows = lastBoard.rows, dir = lastBoard.dir, key = lastBoard.key;
  var searching = searchTerms(searchQ).length > 0;
  var view = searching
    ? rows.filter(function(r){ return predMatchesSearch(r, searchQ, dir, key, GIU.teamFind); })
    : rows.slice(0, 10);
  /* ---- followed teams (v1.150.0): computed over the VIEW — the capped
     board normally, the filtered board while searching — so the strip
     never promises a card the search hid. */
  var fol = followedPredictions(view, followedList(), dir, key, GIU.teamFind);
  var folByKey = {};
  fol.forEach(function(m){ folByKey[m.key] = m.abbr; });
  renderFollowStrip(fol);
  renderSearchMeta(rows.length, view.length);
  var spotEl = $("predSpot");
  function gridCard(r){
    var k = rowKey(r, rows.indexOf(r));
    return '<div class="card'+(folByKey[k] ? " followed" : "")+'" id="pg-'+GIU.esc(k)+'">'+cardInner(r, dir, key, folByKey[k])+'</div>';
  }
  if(searching){
    if(spotTimer){ clearInterval(spotTimer); spotTimer = null; }
    spotIso = null;
    if(spotEl) spotEl.innerHTML = "";
    $("predGrid").innerHTML = view.length ? view.map(gridCard).join("") :
      '<div class="empty">No games match &quot;'+GIU.esc(String(searchQ).trim())+'&quot; on this board — clear the search to see all '+rows.length+' games.</div>';
    return;
  }
  /* ---- "Next game" spotlight (v1.125.0) ----
     The nearest upcoming game gets a featured card above the grid: a
     live-ticking kickoff countdown, the same Polymarket probability bars
     and Kalshi cross-check as a normal card, and it's removed from the
     grid so it never appears twice. Quiet when every listed game has
     already started — the grid alone covers it. */
  var spot = nextUpcoming(view);
  var gridRows = spot ? view.filter(function(r){ return r !== spot; }) : view;
  if(spotEl){
    if(spot){
      var kicker = SPOT_KICKER[key] || "Next game";
      var iso = spot.ev.startTime || spot.ev.eventDate || "";
      var cd = spotCountdown(iso);
      spotIso = iso;
      spotEl.innerHTML =
        '<div class="card'+(folByKey[rowKey(spot, rows.indexOf(spot))] ? " followed" : "")+'" id="pg-'+GIU.esc(rowKey(spot, rows.indexOf(spot)))+'" style="border:1px solid var(--gold-glow);box-shadow:0 0 28px rgba(240,180,41,.12)">'+
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px">'+
        '<span class="tag" style="background:var(--gold);color:#171204;font-weight:800;letter-spacing:.05em">'+GIU.esc(kicker)+'</span>'+
        (cd ? '<span id="spotCountdown" class="num" style="color:var(--gold-soft);font-weight:800;font-size:1rem">'+GIU.esc(cd)+'</span>' : "")+
        '</div>'+
        cardInner(spot, dir, key, folByKey[rowKey(spot, rows.indexOf(spot))])+
        '</div>';
      if(cd && !spotTimer){
        spotTimer = setInterval(tickSpot, SPOT_MS);
      }
    } else {
      spotEl.innerHTML = "";
    }
  }
  $("predGrid").innerHTML = gridRows.map(gridCard).join("");
}
function load(key, my, silent){
  key = key || curKey; curKey = key;
  my = (my===undefined) ? tabSeq : my;
  clearLive(); /* tab switches and silent refreshes always reschedule */
  if(!silent){ lastBoard = null; skel(); renderFollowStrip([]); renderSearchMeta(null, 0); /* no stale chips/cards while the new tab loads */ }
  /* The snapshot fetch starts now, alongside the Polymarket lookup, so a
     Polymarket failure doesn't cost the Kalshi-only fallback an extra
     round-trip. Resolves null when the league has no snapshot or it fails —
     the live cards never wait on it. */
  var snapP = SNAP[key] ? GIU.fetchJSON(SNAP[key]).catch(function(){ return null; }) : null;
  seriesFor(key).then(function(sid){
    var reqs = [
      GIU.fetchJSON(GIU.pmEventsUrl(sid)),
      GIU.teamDir()
    ];
    /* Kalshi snapshots cover NFL and MLB postseason game-winner markets.
       Fetched alongside everything else; a slow or failed snapshot resolves
       to null and simply means no Kalshi rows — the Polymarket cards never
       wait. */
    if(snapP) reqs.push(snapP);
    return Promise.all(reqs);
  }).then(function(x){
    if(my !== tabSeq) return; /* user moved to another league meanwhile */
    var d = x[0], dir = x[1];
    var snap = snapP ? (x[2] || null) : null;
    var evs = Array.isArray(d) ? d : (d.events||[]);
    var rows = [];
    evs.forEach(function(ev){
      var title = ev.title||"";
      if(title.indexOf(" vs")<0 || / - /.test(title)) return;  /* main game events only */
      var mls = (ev.markets||[]).filter(function(m){
        return !m.closed && m.active!==false && m.sportsMarketType==="moneyline";
      }).filter(function(m){
        var o=parseArr(m.outcomes), p=parseArr(m.outcomePrices);
        return o.length===2 && p.length===2 && isFinite(Number(p[0])) && isFinite(Number(p[1]));
      });
      if(!mls.length) return;
      rows.push({ev:ev, mls:mls});
    });
    rows.sort(function(a,b){ return startOf(a.ev)-startOf(b.ev); });
    /* v1.164.0: no slice here — the FULL board is cached in lastBoard and
       paintBoard applies the 10-game cap only when no search is active,
       so a game outside the cap is findable instead of silently absent. */
    /* Kalshi cross-check (NFL + MLB postseason): match each Polymarket game
       to the snapshot via the tested Disagree.matches; unmatchable games are
       dropped, never guessed. Only 2-way rows get a row — a clean
       side-by-side comparison. */
    if(snap && snap.games && window.Disagree && window.Kalshi){
      /* Settled games never cross-check: a finished game has no live
         Polymarket price to compare against, and its 99c side is a result,
         not a prediction. */
      var klGames = snap.games.filter(function(g){ return !window.Kalshi.settled(g); });
      /* "What moved" wiring (v1.129.0): the fetch script bakes a
         snapshot-to-snapshot diff into the file (K.diffMoves contract).
         K.moveIndex turns it into an exact event-ticker + team-abbr lookup
         so each Kalshi row can badge sides whose price moved 2c+ since the
         previous snapshot — the same treatment the markets page cards got.
         A team that can't be joined exactly gets no badge, never a guess. */
      var mi = window.Kalshi.moveIndex(snap, window.Disagree.kalshiTeamAbbr);
      rows.forEach(function(r){
        if(r.mls.length !== 1) return;
        var m = window.Disagree.matches([r.ev], klGames, dir, GIU.teamFind, key)[0];
        if(m){
          var gm = m.kalshiTicker ? (mi.byGame[m.kalshiTicker] || {}) : {};
          r.km = {nameA: m.nameA, aPct: m.kalshiA, nameB: m.nameB,
                  bPct: m.kalshiB, updatedAt: snap.updated_at, pmA: m.pmA,
                  dA: gm[m.abbrA], dB: gm[m.abbrB], prevAt: mi.prevAt};
        }
      });
    }
    if(!rows.length){
      lastBoard = null;
      $("predGrid").innerHTML = '<div class="empty">No upcoming game markets with clear win probabilities for this league right now — check back closer to game day.</div>';
      var ps = $("predSpot"); if(ps) ps.innerHTML = "";
      renderFollowStrip([]);
      renderSearchMeta(null, 0);
      liveN = 0; renderLiveStatus();
      return;
    }
    /* Cache the full board, then paint through the current query
       (v1.164.0): spotlight, grid, follow strip and search count all
       render in paintBoard, so a keystroke re-paints this exact pull
       instead of fetching again. */
    lastBoard = { rows: rows, dir: dir, key: key };
    paintBoard();
    /* ---- live auto-refresh ----
       Refresh in-place every 90s, but only while a shown game is likely
       in-progress — otherwise the timer would burn requests on dead pages.
       liveN describes the whole board, not the filtered view. */
    liveN = likelyLive(rows);
    lastUpdated = Date.now();
    renderLiveStatus();
    if(liveN > 0 && autoOn){
      liveTimer = setInterval(function(){ if(!isHidden()) load(curKey, tabSeq, true); }, PM_MS);
    }
  }).catch(function(){
    if(my !== tabSeq) return; /* user moved to another league meanwhile */
    /* Polymarket failed — but the page may still have a real second crowd:
       the server-side Kalshi snapshot (NFL/MLB). Honestly labeled,
       timestamped Kalshi-only cards beat a blank page; when even that isn't
       honest (missing/stale snapshot), the failure box shows as before. */
    var done = function(snap){
      if(my !== tabSeq) return;
      lastBoard = null; /* fallback cards are not the searchable board */
      renderSearchMeta(null, 0);
      var html = null;
      try{ html = window.PredFallback ? window.PredFallback.render(snap) : null; }
      catch(e){ html = null; }
      var ps = $("predSpot");
      if(ps) ps.innerHTML = "";
      renderFollowStrip([]); /* fallback cards carry no follow marks — strip must not point at them */
      if(html){
        $("predGrid").innerHTML = html;
        /* Fallback mode: one silent retry on the normal refresh beat so the
           page heals itself when Polymarket comes back — cleared by
           clearLive like every other timer. */
        liveTimer = setTimeout(function(){ load(key, tabSeq, true); }, PM_MS);
      } else {
        $("predGrid").innerHTML = GIU.failBox("Polymarket's API didn't respond, so there are no implied probabilities to show.");
      }
      liveN = 0; renderLiveStatus();
    };
    if(snapP) snapP.then(done, function(){ done(null); });
    else done(null);
  });
}
/* Finder wiring (v1.164.0): typing re-paints the cached board — no
   fetch, no quota burn. Escape / Clear restore the full board. Hooks
   absent (older markup) -> the board works exactly as before. */
(function wireSearch(){
  var q = $("predQ"), clear = $("predClear");
  if(q){
    q.addEventListener("input", function(){
      searchQ = q.value || "";
      if(lastBoard) paintBoard(); else renderSearchMeta(null, 0);
    });
    q.addEventListener("keydown", function(e){ if(e && e.key === "Escape") resetSearch(); });
  }
  if(clear) clear.addEventListener("click", resetSearch);
})();
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn && liveN > 0){
    /* resume: refresh now; the loader reschedules the timer */
    load(curKey, tabSeq, true);
  } else { clearLive(); renderLiveStatus(); }
});
load(curKey, ++tabSeq);
Array.prototype.forEach.call($("predTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("predTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active");
    load(t.getAttribute("data-k"), ++tabSeq);
  });
});
})();
