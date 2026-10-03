/* GridIronUI Prediction Markets — Polymarket gamma API (CORS-open).
   Kalshi is intentionally NOT fetched: their public API blocks browser CORS.
   Game markets come from each league's current series (looked up live, so the
   page keeps working when Polymarket rotates series). */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var LEAGUES = [
  ["NFL","nfl"], ["NBA","nba"], ["MLB","mlb"],
  ["NHL","nhl"], ["College Football","cfb"], ["EPL","epl"]
];
var cur = 0;
/* Render generation: every tab click bumps tabSeq, and each async callback
   only touches the DOM if its generation is still current. Without this, a
   slow Polymarket response (or its error box) can overwrite a Kalshi render
   the user asked for in the meantime — or one league's cards can land on
   another league's tab. */
var tabSeq = 0;

/* ---- live auto-refresh machinery (same contract as scores.js v1.20.0) ----
   Polymarket prices move with the games, and the Kalshi snapshot gets rebuilt
   the Kalshi snapshot is rebuilt regularly server-side, so both tabs keep themselves fresh in
   place — no reload, no skeleton shimmer. Ticks skip while the tab is hidden
   and resume on their own when it returns. Timers never stack: every load
   clears the old timer before scheduling a new one. */
var PM_MS = 90000, KAL_MS = 300000, LIVE_WINDOW_MS = 4*3600*1000;
var liveTimer = null, autoOn = true, liveN = 0, snapN = 0, lastUpdated = null, kalshiTab = null;
/* Kalshi snapshot tabs: the NFL tab reads data/kalshi-nfl.json, the MLB tab
   reads data/kalshi-mlb.json (postseason game-winners), and the NCAAF tab
   reads data/kalshi-ncaaf.json (college football game-winners — v2.0.4;
   Kalshi lists 250+ college games a week, the Saturday slate included),
   all rebuilt by the same server-side script. kalshiTab holds the active
   league key or null. */
var KALSHI_TABS = {
  nfl: {file: "data/kalshi-nfl.json", name: "NFL", dirKey: "nfl",
        empty: "No priced Kalshi NFL game markets in the current snapshot. Markets cluster around game days — check back mid-week."},
  mlb: {file: "data/kalshi-mlb.json", name: "MLB", dirKey: "mlb",
        empty: "No priced Kalshi MLB game markets in the current snapshot. The MLB tab tracks the postseason — check back in October."},
  /* dirKey "ncaaf" is deliberately NOT in the team directory (data/teams.json
     covers the pro leagues + EPL only): vsHeader resolves neither side and
     the card falls back to its plain title, which for college games carries
     the full school names — honest identity, never a guessed logo/color. */
  ncaaf: {file: "data/kalshi-ncaaf.json", name: "NCAAF", dirKey: "ncaaf",
        empty: "No priced Kalshi college football game markets in the current snapshot. Markets cluster around game days — the big slate lands on Saturdays."}
};
/* The snapshot often lists far more games than fit comfortably above the
   fold (31 NFL games = two game weeks). Render the first page of cards and
   offer the rest behind an honest per-league "Show all N games" toggle, so
   later weeks are reachable instead of invisible. */
var KALSHI_PAGE = 12;
var kalshiShowAll = {nfl: false, mlb: false, ncaaf: false};

/* ---- find-a-game (v1.162.0) ----
   Every OTHER game board on the site has a finder (scores v1.161.0,
   news, journal, tools, glossary) — this page was the last one where
   finding ONE game meant scrolling: the Kalshi tabs list 30 NFL games
   (12 on the first page, the rest behind "Show all") and the
   Polymarket tabs silently cap at the 10 soonest games, so a game
   outside the cap wasn't even on the page to Ctrl-F for. The query
   splits into terms and EVERY term must appear in the game's
   searchable text (AND semantics, the scores-board contract), so
   "chiefs bills" or "kc buffalo" narrows across fields while a term
   that appears nowhere matches nothing, never everything. Filtering
   renders from the last board pulled (lastPM / lastKalshi), so the
   query is board state that survives tab switches and the silent
   refresh instead of being wiped by them; while a search is active
   the page caps lift (Polymarket renders every match, Kalshi shows
   all matches instead of the first page), so a search can find any
   game on the tab. The "Your teams" strip and the Kalshi pulse strip
   are computed over the FILTERED board, so a chip never promises a
   card the search hid; the tab note and live count still describe
   the whole board. No query -> both tabs render byte-identically. */
var searchQ = "", lastPM = null, lastKalshi = null, renderGen = 0;
function searchTerms(q){
  return String(q == null ? "" : q).toLowerCase().split(/\s+/).filter(function(t){ return !!t; });
}
function termsMatch(hay, q){
  var terms = searchTerms(q);
  if(!terms.length) return true;
  if(!hay) return false;
  for(var i = 0; i < terms.length; i++){ if(hay.indexOf(terms[i]) === -1) return false; }
  return true;
}
/* Pure: the searchable text for one Polymarket game — the event title
   plus the outcome names on its moneyline / spread / total markets
   (the priced team names, so a nickname the title abbreviates can
   still match). When the caller passes the team directory + league +
   GIU.teamFind (renderPM does), both title sides' abbreviations are
   appended too, so "kc" finds the Chiefs game the way it does on the
   Kalshi tabs' sub lines; a side that doesn't resolve simply adds
   nothing — never a fuzzy guess. Garbage in -> "" (matches only a
   blank query). */
function pmSearchText(g, dir, league, find){
  var ev = (g && g.ev) || {};
  var parts = [];
  if(ev.title) parts.push(String(ev.title));
  [g && g.mls, g && g.spread, g && g.total].forEach(function(ms){
    (Array.isArray(ms) ? ms : (ms ? [ms] : [])).forEach(function(m){
      parseArr(m && m.outcomes).forEach(function(o){ if(o) parts.push(String(o)); });
    });
  });
  if(typeof find === "function"){
    var tp = String(ev.title || "").split(/\s+vs\.?\s+/);
    if(tp.length === 2){
      tp.forEach(function(side){
        var hit = null;
        try{ hit = find(dir, league, side.trim()); }catch(e){ hit = null; }
        if(hit && hit.abbr) parts.push(String(hit.abbr));
      });
    }
  }
  return parts.join(" ").toLowerCase();
}
/* Pure: the searchable text for one Kalshi snapshot game — the title,
   the sub line (which carries both abbreviations, "KC vs BUF (...)"),
   and the priced team names. Garbage in -> "". */
function kalshiSearchText(g){
  if(!g) return "";
  var parts = [];
  if(g.title) parts.push(String(g.title));
  if(g.sub) parts.push(String(g.sub));
  (Array.isArray(g.teams) ? g.teams : []).forEach(function(t){
    if(t && t.name) parts.push(String(t.name));
  });
  return parts.join(" ").toLowerCase();
}
function pmMatchesSearch(g, q, dir, league, find){ return termsMatch(pmSearchText(g, dir, league, find), q); }
function kalshiMatchesSearch(g, q){ return termsMatch(kalshiSearchText(g), q); }
/* Honest count + Clear visibility, narrated only while a search is
   active — the tab note stays the story otherwise. Null-guarded:
   pages/tests without the hooks render exactly as before. */
function renderSearchMeta(shown, total){
  var c = $("marketCount"), b = $("marketClear");
  var active = searchTerms(searchQ).length > 0;
  if(c) c.textContent = (active && total > 0)
    ? (shown === 0 ? "No matches" : shown + " of " + total + " games") : "";
  if(b) b.hidden = !active;
}
try{
  if(typeof window !== "undefined"){
    window.GIU = window.GIU || {};
    window.GIU.marketsSearchTerms = searchTerms;
    window.GIU.marketsPmSearchText = pmSearchText;
    window.GIU.marketsKalshiSearchText = kalshiSearchText;
    window.GIU.marketsPmMatchesSearch = pmMatchesSearch;
    window.GIU.marketsKalshiMatchesSearch = kalshiMatchesSearch;
  }
}catch(e){}

/* ---- followed teams (v1.155.0) ----
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") already mark odds, scores, predictions, injuries
   and weather; this page was the last board they meant nothing on. Both
   sources here now mark followed-team games (gold rail + "★ Your team"
   tag) and a "Your teams" jump strip above the grid carries one chip per
   followed game on the active tab:
   - Polymarket tabs: game titles resolve through GIU.teamFind against
     the ESPN-sourced directory (the predictions.js v1.150.0 approach), so
     abbreviations compare in the follow list's ESPN namespace; a side
     that doesn't resolve simply can't match — never a fuzzy guess.
     Every card gains a #pm-<slug> anchor.
   - Kalshi tabs: the snapshot's own sub abbreviations ("CHI vs GB")
     normalize through Disagree.normAbbr (Kalshi WAS->ESPN WSH, CWS->CHW,
     JAC->JAX) before comparing. Settled games never match — a result is
     not a market. Every Kalshi card already carries #km-<ticker>; a
     followed game hidden behind "Show all N games" gets a chip that
     expands the list first, then lands on the card (the pulse-chip
     mechanism, shared via pulseScrollTo below).
   No follows, or no followed team on this tab: the strip stays hidden
   and the cards render exactly as before. */
function teamFollow(){ try{ return (window.GIU && window.GIU.TeamFollow) || null; }catch(e){ return null; } }
function followedList(){
  var T = teamFollow();
  try{ return T ? T.load() : []; }catch(e){ return []; }
}
function cleanFollow(followed){
  var f = [], seen = {};
  (Array.isArray(followed) ? followed : []).forEach(function(x){
    if(typeof x !== "string") return;
    var n = x.trim().toUpperCase();
    if(/^[A-Z]{2,4}$/.test(n) && !seen[n]){ seen[n] = 1; f.push(n); }
  });
  return f;
}
/* pmKey: the Polymarket card anchor key — the event's slug (URL-safe by
   construction), else its id, else a slugified title, else a positional
   key. Sanitized regardless of source so a hostile slug can never break
   out of the id attribute. (Same contract as predictions.js rowKey.) */
function pmKey(ev, idx){
  ev = ev || {};
  var raw = String(ev.slug || ev.id || "").trim().toLowerCase();
  var k = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if(k) return k;
  var t = String(ev.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return t || ("game-" + (idx || 0));
}
/* followedPM: pure matcher over the Polymarket tab's internal games
   ({ev:{title, slug, ...}}). Returns one record per game a followed team
   plays in: {key, abbr (the followed side), abbrA, abbrB ("" when a side
   doesn't resolve), aName, bName}. First followed entry wins when both
   sides are followed. Garbage in -> []. Exported for tests. */
function followedPM(games, followed, dir, league, find){
  var f = cleanFollow(followed);
  if(!f.length || !Array.isArray(games) || typeof find !== "function") return [];
  var out = [];
  games.forEach(function(g, idx){
    var ev = (g && g.ev) || {};
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
    out.push({ key: pmKey(ev, idx), abbr: hit, abbrA: aa, abbrB: bb,
               aName: tp[0].trim(), bName: tp[1].trim() });
  });
  return out;
}
/* followedKalshi: pure matcher over K.games() output ({ticker, sub,
   title, teams, settled}). Abbreviations come from the game's own sub
   and pass through the caller's norm (Disagree.normAbbr in the browser)
   before comparing against the follow list. Settled games and games
   whose sub carries no abbreviations never match. Chip labels prefer
   the title's two sides ("IND Colts" / "WAS Commanders"), falling back
   to the priced team names. Garbage in -> []. Exported for tests. */
function followedKalshi(games, followed, norm){
  var f = cleanFollow(followed);
  if(!f.length || !Array.isArray(games)) return [];
  var nf = (typeof norm === "function") ? norm : function(a){ return a; };
  var out = [];
  games.forEach(function(g){
    if(!g || g.settled || !g.ticker) return;
    var ab = kalshiAbbrs(g);
    if(!ab) return;
    var aa = "", bb = "";
    try{ aa = String(nf(ab[0]) || "").trim().toUpperCase(); }catch(e){ aa = ""; }
    try{ bb = String(nf(ab[1]) || "").trim().toUpperCase(); }catch(e){ bb = ""; }
    if(!aa && !bb) return;
    var hit = null, i;
    for(i = 0; i < f.length; i++){ if(f[i] === aa || f[i] === bb){ hit = f[i]; break; } }
    if(!hit) return;
    var tp = String(g.title || "").split(/\s+vs\.?\s+/);
    var aName = (tp.length === 2 && tp[0].trim()) ? tp[0].trim()
      : ((g.teams && g.teams[0] && g.teams[0].name) || "");
    var bName = (tp.length === 2 && tp[1].trim()) ? tp[1].trim()
      : ((g.teams && g.teams[1] && g.teams[1].name) || "");
    out.push({ ticker: String(g.ticker), abbr: hit, abbrA: aa, abbrB: bb,
               aName: aName, bName: bName });
  });
  return out;
}
/* The "Your teams" jump strip (a stable element above the grid, so tab
   renders only ever rewrite its contents): one chip per followed game
   on the active tab, anchor-linked to the card. A Kalshi chip whose
   game sits behind "Show all" carries data-expand=<ticker>; the click
   handler expands the list and lands on the card. Empty match list ->
   strip hidden and emptied, so tab switches, empty boards and feed
   errors never leave a stale strip behind. */
function renderFollowStrip(chips){
  var el = $("followStrip");
  if(!el) return;
  if(!chips || !chips.length){ el.innerHTML = ""; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<span class="follow-strip-label">★ Your teams</span>' +
    chips.map(function(c){
      return '<a class="follow-chip-link" href="#'+GIU.esc(c.id)+'"'+
        (c.expand ? ' data-expand="'+GIU.esc(c.expand)+'"' : '')+'>'+
        '<b>★ '+GIU.esc(c.abbr)+'</b> '+GIU.esc(c.aText)+' vs '+GIU.esc(c.bText)+'</a>';
    }).join("");
}
function pmChips(matches){
  return (matches || []).map(function(m){
    return { id: "pm-" + m.key, abbr: m.abbr,
             aText: m.abbrA || m.aName || "", bText: m.abbrB || m.bName || "",
             expand: null };
  });
}
function kalshiChips(matches, shownSet){
  return (matches || []).map(function(m){
    return { id: "km-" + m.ticker, abbr: m.abbr,
             aText: m.abbrA || m.aName || "", bText: m.abbrB || m.bName || "",
             expand: (shownSet && shownSet[m.ticker]) ? null : m.ticker };
  });
}
/* One delegated listener on the stable strip element, bound once:
   a chip for a Kalshi game hidden behind "Show all" expands the list
   first, then lands via the shared pulseScrollTo hand-off in
   loadKalshi. Chips whose card is already in the DOM keep the plain
   anchor behavior (and the gold :target ring). */
function bindFollowStrip(){
  var el = $("followStrip");
  if(!el || el._followBound || !el.addEventListener) return;
  el._followBound = true;
  el.addEventListener("click", function(ev){
    var t = ev.target, chip = null;
    while(t && t !== el){
      if(t.classList && t.classList.contains && t.classList.contains("follow-chip-link")){ chip = t; break; }
      t = t.parentNode;
    }
    if(!chip) return;
    var ticker = chip.getAttribute("data-expand");
    if(!ticker || !kalshiTab) return;
    /* data-expand is stamped at render time only when the game was NOT
       among the shown cards — the flag is the source of truth, exactly
       like the pulse chips' data-shown. */
    if(ev.preventDefault) ev.preventDefault();
    pulseScrollTo = "km-" + ticker;
    kalshiShowAll[kalshiTab] = true;
    loadKalshi(tabSeq, true, kalshiTab);
  });
}
try{
  if(typeof window !== "undefined"){
    window.GIU = window.GIU || {};
    window.GIU.marketsFollowedPM = followedPM;
    window.GIU.marketsFollowedKalshi = followedKalshi;
    window.GIU.marketsPmKey = pmKey;
  }
}catch(e){}

function isHidden(){ try{ return !!document.hidden; }catch(e){ return false; } }
function clearLive(){ if(liveTimer){ clearInterval(liveTimer); liveTimer = null; } }
/* Polymarket events expose startTime but no explicit in-progress flag; a game
   that started within the last 4 hours is very likely live (NFL/NBA/MLB games
   rarely run longer), so prices on those games are the ones worth refreshing. */
function likelyLive(games){
  var now = Date.now(), n = 0;
  (games||[]).forEach(function(g){
    var t = startOf(g.ev || {});
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
    var what = kalshiTab ? snapN + (snapN > 1 ? " games" : " game") + " on this snapshot"
                         : liveN + (liveN > 1 ? " live games" : " live game");
    var cadence = kalshiTab ? "auto-refresh every 5 min" : "auto-refresh every 90s";
    s.innerHTML = '<span class="live-dot" aria-hidden="true"></span>'+
      GIU.esc(what + " — " + cadence)+
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

function parseArr(s){
  try{ var v = typeof s==="string" ? JSON.parse(s) : s; return Array.isArray(v)?v:[]; }
  catch(e){ return []; }
}
function money(v){
  v = Number(v)||0;
  if(v>=1e6) return "$"+(v/1e6).toFixed(1)+"M";
  if(v>=1e3) return "$"+(v/1e3).toFixed(0)+"K";
  return "$"+v.toFixed(0);
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
/* Live order-book line: bid/ask spread straight from Polymarket's book.
   A 1-2¢ spread means a deep, tight market (the quoted price is real);
   a wide spread means thin liquidity — the price may slip on real size. */
function bookLine(m){
  var b = Number(m.bestBid), a = Number(m.bestAsk);
  if(!(b>0) || !(a>=b)) return ""; /* no book posted — show nothing rather than junk */
  var bc = Math.round(b*100), ac = Math.round(a*100), sp = Math.max(0, ac-bc);
  var cls = sp<=2 ? "green" : sp<=5 ? "blue" : "red";
  var lbl = sp<=2 ? "tight book" : sp<=5 ? "decent liquidity" : "thin — price may move";
  return ' · book <b class="num" style="color:var(--text)">'+bc+'¢/'+ac+'¢</b> '+
    '<span class="tag '+cls+'" title="Live bid/ask spread from Polymarket\'s order book — the gap between the best buy and sell price right now.">'+sp+'¢ spread · '+lbl+'</span>';
}
/* 7-day price movement + 24h volume, straight from Polymarket's own fields.
   oneWeekPriceChange is the market's reported 7-day price move (0-1 units);
   volume24hr is dollars traded in the last 24h. Missing fields → show nothing. */
function chgChip(m){
  var c = Number(m.oneWeekPriceChange);
  if(!isFinite(c) || Math.abs(c) < 0.001) return "";
  var cls = c>0 ? "mv-up" : "mv-dn";
  return ' · <span class="'+cls+'" title="7-day price change for this market, reported by Polymarket — where the money has been pushing the price.">'+
    (c>0?"▲ +":"▼ −")+(Math.abs(c)*100).toFixed(1)+'¢ <span style="color:var(--faint)">7d</span></span>';
}
function volLine(m){
  var v24 = Number(m.volume24hr);
  if(isFinite(v24) && v24 > 0) return "24h vol "+money(v24)+" · all-time "+money(m.volume);
  return "Volume "+money(m.volume);
}
function marketRow(m){
  var outs = parseArr(m.outcomes), prices = parseArr(m.outcomePrices);
  if(outs.length!==2 || prices.length!==2) return "";
  var p0 = Math.round(Number(prices[0])*100), p1 = 100-p0;
  return '<div style="margin-bottom:12px"><div style="font-size:.8rem;color:var(--faint);margin-bottom:5px">'+GIU.esc(shortQ(m.question))+'</div>'+
    [["0",outs[0],p0],["1",outs[1],p1]].map(function(o){
      return '<div style="display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:4px"><span>'+GIU.esc(o[1])+'</span><b class="num" style="color:var(--gold-soft)">'+o[2]+'¢</b></div>'+
      '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-bottom:6px"><div style="height:100%;width:'+o[2]+'%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--gold))"></div></div>';
    }).join("")+
    '<div style="font-size:.76rem;color:var(--faint)">'+volLine(m)+bookLine(m)+chgChip(m)+'</div></div>';
}

function vsFor(title, leagueKey, dir){
  /* "Ravens vs. Cowboys" -> identity header; "" keeps the caller's plain title */
  var p = String(title||"").split(/\s+vs\.?\s+/);
  if(p.length !== 2) return "";
  return window.GIU.vsHeader(dir, leagueKey, p[0], p[1]);
}

/* Cross-book edge: Polymarket vs Kalshi on the same game-winners.
   Fetched separately after the main board renders, so a snapshot hiccup
   never blocks the live prices. Used on the NFL and MLB tabs (each reads
   its own Kalshi snapshot). Returns "" when there is nothing honest to show. */
function disagreeCard(games, snap, dir, league){
  league = league || "nfl";
  var leagueNoun = league === "mlb" ? "MLB postseason games" : "NFL games";
  var D = window.Disagree;
  if(!D || !snap) return "";
  var evs = games.map(function(g){ return g.ev; });
  /* Settled Kalshi games never cross-check — the same rule predictions.js
     applies: a finished game has no live price to compare, and its 99c side
     is a result, not a prediction. Kalshi keeps finished games in its "open"
     listing until settlement finalizes, so without this the settlement-lag
     window manufactures a fake cross-book "edge". */
  var klGames = (snap.games||[]).filter(function(g){
    return !(window.Kalshi && window.Kalshi.settled(g));
  });
  var mtchs = D.matches(evs, klGames, dir, window.GIU.teamFind, league);
  if(!mtchs.length) return "";
  var dis = D.disagreements(mtchs, 3);
  /* The card compares a LIVE Polymarket price against a FROZEN Kalshi price,
     so the snapshot's age is first-class information here: a 4c "edge"
     against a 2h-old frozen number may be nothing at all. Name the age in
     the note and tag the frozen side on every row. */
  var snapAge = agoShort(snap.updated_at);
  var snapAgeTxt = snapAge ? "refreshed "+snapAge : "rebuilt regularly";
  var kalshiTip = GIU.esc("Kalshi price is from the server-side snapshot ("+snapAgeTxt+"), not a live feed — confirm the live price before you bet.");
  var head = '<div class="card disagree-card"><span class="tag">Cross-book edge</span>'+
    '<h3 style="margin:10px 0 4px">Where the two markets disagree</h3>'+
    '<p class="disagree-note">Polymarket (live) and Kalshi (snapshot, '+snapAgeTxt+') price the same '+
    'game-winners. A gap of 3¢ or more means the books disagree — one of them is off, and that\'s where edge lives. '+
    'Kalshi\'s numbers are frozen at the snapshot time and its fee structure differs from Polymarket\'s, so confirm both '+
    'prices are live before you bet.</p>';
  var body;
  if(!dis.length){
    body = '<div class="disagree-agree">✓ Polymarket and Kalshi agree within 3¢ on all '+
      mtchs.length+' matched '+leagueNoun+' right now.</div>';
  } else {
    body = '<div class="disagree-rows">'+dis.map(function(x){
      var ta = window.GIU.teamFind(dir, league, x.abbrA),
          tb = window.GIU.teamFind(dir, league, x.abbrB);
      var cls = x.delta > 0 ? "mv-up" : "mv-dn";
      var who = (x.delta > 0 ? "Polymarket" : "Kalshi") + " prices " + x.abbrA +
        " higher by " + Math.abs(x.delta) + " cents";
      return '<div class="disagree-row" tabindex="0" title="'+GIU.esc(who)+'">'+
        '<span class="disagree-teams">'+
          (ta ? window.GIU.teamLogo(ta, 26) : "") + window.GIU.teamChip(ta || {}, x.abbrA)+
          '<span class="vs-x">vs</span>'+
          (tb ? window.GIU.teamLogo(tb, 26) : "") + window.GIU.teamChip(tb || {}, x.abbrB)+
        '</span>'+
        '<span class="disagree-nums"><b class="num" style="color:var(--gold-soft)">'+x.pmA+'¢</b>'+
        '<span class="disagree-src">Polymarket · live</span>'+
        '<b class="num" style="color:var(--gold-soft)">'+x.kalshiA+'¢</b><span class="disagree-src" title="'+kalshiTip+'">Kalshi · snapshot</span></span>'+
        '<span class="'+cls+' num">'+(x.delta > 0 ? "▲ +" : "▼ −") + Math.abs(x.delta) + '¢</span>'+
      '</div>';
    }).join("")+'</div>';
  }
  return head + body + '</div>';
}

function load(my, silent){
  my = (my===undefined) ? tabSeq : my;
  clearLive(); /* league switches and silent refreshes always reschedule */
  kalshiTab = null; /* v1.162.0 — the finder re-renders the ACTIVE board; a Polymarket load owns the page from here */
  var box = $("marketGrid");
  if(!silent){
    box.innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>'.repeat(3);
    $("marketNote").textContent = "Loading live markets — this is a large data feed, one moment…";
    renderFollowStrip([]); /* a fresh tab never inherits the last tab's strip */
  }
  var lname = LEAGUES[cur][0], lkey = LEAGUES[cur][1];
  seriesFor(lkey).then(function(sid){
    return Promise.all([
      GIU.fetchJSON(GIU.pmEventsUrl(sid)),
      GIU.teamDir()
    ]);
  }).then(function(x){
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    var d = x[0], dir = x[1];
    var evs = Array.isArray(d) ? d : (d.events||[]);
    var games = [];
    evs.forEach(function(ev){
      var title = ev.title||"";
      if(title.indexOf(" vs")<0 || / - /.test(title)) return;  /* main game events only */
      var live = (ev.markets||[]).filter(function(m){ return !m.closed && m.active!==false; });
      function top(type){
        var ms = live.filter(function(m){ return m.sportsMarketType===type; });
        ms = ms.filter(function(m){ var o=parseArr(m.outcomes); return o.length===2; });
        ms.sort(function(a,b){ return (Number(b.volume)||0)-(Number(a.volume)||0); });
        return ms[0]||null;
      }
      var mls = live.filter(function(m){ return m.sportsMarketType==="moneyline"; })
                    .filter(function(m){ return parseArr(m.outcomes).length===2; });
      var spread = top("spreads"), total = top("totals");
      if(!mls.length && !spread && !total) return;
      games.push({ev:ev, mls:mls, spread:spread, total:total});
    });
    games.sort(function(a,b){ return startOf(a.ev)-startOf(b.ev); });
    /* v1.162.0 — the parsed board (BEFORE the 10-game cap, so a search
       can reach every game on the tab) is cached and rendered by
       renderPM, which re-applies the active query on every render. */
    lastPM = { games: games, dir: dir, lname: lname, lkey: lkey };
    lastUpdated = Date.now();
    renderPM();
  }).catch(function(){
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    lastPM = null;
    box.innerHTML = GIU.failBox("Polymarket's API didn't respond. No prices are shown rather than stale ones.");
    $("marketNote").textContent = "";
    renderFollowStrip([]);
    renderSearchMeta(0, 0);
    liveN = 0; renderLiveStatus();
  });
}

/* Render the Polymarket board from lastPM, applying the find-a-game
   query (v1.162.0). Called by load() on every fresh pull and by the
   finder on every keystroke — it never refetches the feed itself.
   The cross-book card rides along after the render, guarded by
   renderGen so a slow snapshot read can never land on a newer
   (re-filtered) board. */
function renderPM(){
  var st = lastPM; if(!st) return;
  var box = $("marketGrid");
  var gen = ++renderGen;
  var games = st.games, dir = st.dir, lkey = st.lkey, lname = st.lname;
  clearLive(); /* a search keystroke re-enters here — never stack the 90s tick */
  if(!games.length){
    box.innerHTML = '<div class="empty">No upcoming '+GIU.esc(lname)+' game markets on Polymarket right now. Markets cluster around game days — check back mid-week.</div>';
    $("marketNote").textContent = "";
    renderFollowStrip([]);
    renderSearchMeta(0, 0);
    liveN = 0; renderLiveStatus();
    return;
  }
  var searching = searchTerms(searchQ).length > 0;
  var visible = games.filter(function(g){ return pmMatchesSearch(g, searchQ, dir, lkey, (GIU && GIU.teamFind) || null); });
  $("marketNote").textContent = games.length+" games · prices live from Polymarket · volume in $";
  /* ---- followed teams (v1.155.0): mark this tab's followed games.
     v1.162.0 — computed over the FILTERED board, so a strip chip never
     promises a card the search hid (the scores/news discipline). ---- */
  var folPM = followedPM(visible, followedList(), dir, lkey, (GIU && GIU.teamFind) || null);
  var folByKey = {};
  folPM.forEach(function(m){ folByKey[m.key] = m; });
  if(searching && !visible.length){
    /* Named empty state — never a blank grid under an active search. */
    box.innerHTML = '<div class="empty">No markets match &quot;'+GIU.esc(String(searchQ).trim())+
      '&quot; on this tab. Clear the search to see all '+games.length+' games.</div>';
  } else {
    /* No query -> the board keeps its 10-game cap, byte-identical to
       before. Searching lifts the cap: every match renders. */
    var shownGames = searching ? visible : visible.slice(0, 10);
    box.innerHTML = shownGames.map(function(g){
      var gi = games.indexOf(g);
      var t = fmtT(g.ev.startTime || g.ev.eventDate);
      var slug = g.ev.slug||"";
      var body = g.mls.map(marketRow).join("") +
                 (g.spread ? marketRow(g.spread) : "") +
                 (g.total ? marketRow(g.total) : "");
      var head = vsFor(g.ev.title, lkey, dir) ||
        '<h3 style="margin:10px 0 4px">'+GIU.esc(g.ev.title)+'</h3>';
      var fk = pmKey(g.ev, gi), fm = folByKey[fk];
      return '<div class="card'+(fm ? " followed" : "")+'" id="pm-'+GIU.esc(fk)+'"><span class="tag green">Live market</span>'+
        (fm ? ' <span class="tag your-team">★ Your team</span>' : '')+
        head+
        (t ? '<div class="game-meta" style="margin-bottom:12px"><span>'+t+'</span></div>' : '<div style="height:8px"></div>')+
        body+
        '<div class="game-meta"><a href="https://polymarket.com/event/'+GIU.esc(slug)+'" target="_blank" rel="noopener">Trade on Polymarket →</a></div></div>';
    }).join("");
  }
  renderFollowStrip(pmChips(folPM));
  renderSearchMeta(visible.length, games.length);
  /* ---- cross-book disagreement (NFL and MLB tabs) ----
     Each tab's Kalshi snapshot prices the same game-winners as Polymarket;
     when the two books differ by 3c+ on a side, that gap is a real edge
     signal. This fetch rides along after the main board renders — a
     snapshot hiccup hides the strip, never the live prices. Computed
     over the filtered board, so the card only ever compares games
     actually on screen. */
  var kalFile = lkey === "nfl" ? "data/kalshi-nfl.json"
              : (lkey === "mlb" ? "data/kalshi-mlb.json" : null);
  if(kalFile && visible.length && window.Disagree){
    GIU.fetchJSON(kalFile).then(function(snap){
      if(gen !== renderGen) return; /* a newer render (tab/search/refresh) already won */
      var html = disagreeCard(visible, snap, dir, lkey);
      if(html) box.insertAdjacentHTML("afterbegin", html);
    }).catch(function(){ /* optional strip — failure shows nothing, not junk */ });
  }
  /* ---- live auto-refresh ----
     Refresh in-place every 90s, but only while a shown game is likely
     in-progress — otherwise the timer would burn requests on dead pages.
     The live count describes the whole tab pulled, not the filtered view. */
  kalshiTab = null;
  liveN = likelyLive(games);
  renderLiveStatus();
  if(liveN > 0 && autoOn){
    liveTimer = setInterval(function(){ if(!isHidden()) load(tabSeq, true); }, PM_MS);
  }
}

/* Kalshi — a second prediction-market book on this page. Kalshi's public API
   rejects browser cross-origin calls, so the improvement-loop script
   scripts/fetch-kalshi.py fetches it server-side and commits timestamped
   snapshots (data/kalshi-nfl.json for the NFL tab, data/kalshi-mlb.json for
   the MLB postseason tab, data/kalshi-ncaaf.json for the NCAAF tab),
   refreshed regularly. This
   tab renders that snapshot honestly: a "snapshot" tag, the refresh time, and
   a stale warning if the snapshot goes cold — never presented as live. */
function agoShort(iso){
  var t = Date.parse(iso || ""); if(!isFinite(t)) return "";
  var m = Math.floor((Date.now() - t) / 60000);
  if(m < 1) return "just now";
  if(m < 60) return m + "m ago";
  var h = Math.floor(m / 60); if(h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
function kalshiAbbrs(g){
  /* sub looks like "CAR vs CLE (Sep 27)" — abbreviations are the reliable
     key. Pro codes run 2-3 letters; college codes run longer (NAVY, MSST,
     CLMB, CONN), so the pattern allows up to 5 — a pro sub never carries a
     4-5 letter code, so the wider net changes nothing on the NFL/MLB tabs. */
  var m = String((g&&g.sub)||"").match(/^([A-Z]{2,5})\s+vs\s+([A-Z]{2,5})\b/);
  return m ? [m[1], m[2]] : null;
}
/* Kalshi price-history sparkline: a per-game canvas chart of the yes-price
   history accumulated server-side (data/kalshi-history.json — timestamped
   snapshots, never labeled live). The favorite side plots in gold, the other
   side in blue when it has at least 2 points of its own (one dot is never a
   trend — with <2 points the card shows the honest accumulating note instead
   of a chart). The canvas carries an aria-label with the same numbers as the
   visible caption, so screen readers get the story too. Hand-rolled canvas
   only — no external chart CDN. */
function kalshiSpark(game, hist, snapAt){
  var K = window.Kalshi;
  if(!K || !K.sparkPath || !K.gameHist || !K.sparkCaption || !GIU || !GIU.esc) return "";
  var byTeam = K.gameHist(game, hist || {});
  var fav = game.teams[0], dog = game.teams[1];
  function yeses(t){ return t ? (byTeam[t.name] || []).map(function(p){ return p.yes; }) : []; }
  var favS = yeses(fav), dogS = yeses(dog);
  var favG = K.sparkPath(favS, 600, 120);
  var wrap = 'margin-top:10px;border-top:1px solid var(--line-soft);padding-top:10px';
  if(!favG){
    /* Not enough history for a chart — say so honestly, never fake points. */
    return '<div style="'+wrap+'"><span class="tag green">Kalshi</span> '+
      '<span style="font-size:.8rem;color:var(--faint)">'+GIU.esc(K.sparkCaption(favS.length, snapAt))+'</span></div>';
  }
  var dogG = K.sparkPath(dogS, 600, 120);
  var caption = K.sparkCaption(favS.length, snapAt);
  var label = "Kalshi price history for " + fav.name + " vs " + (dog ? dog.name : "field") +
    ": " + favS.length + " snapshots; latest yes prices " + fav.name + " " + fav.price + " cents" +
    (dog ? ", " + dog.name + " " + dog.price + " cents" : "") +
    " (server-side snapshot, not live)";
  var legend = '<span style="display:inline-block;width:14px;height:3px;background:#f0b429;border-radius:2px;margin-right:5px;vertical-align:middle"></span>'+
    GIU.esc(fav.name)+
    (dogG ? ' &nbsp;·&nbsp; <span style="display:inline-block;width:14px;height:3px;background:#4aa8ff;border-radius:2px;margin-right:5px;vertical-align:middle"></span>'+GIU.esc(dog.name) : "");
  return '<div style="'+wrap+'"><div style="font-size:.78rem;color:var(--faint);margin-bottom:6px"><span class="tag green">Kalshi</span> '+GIU.esc(caption)+'</div>'+
    '<canvas class="kalshi-spark" width="600" height="120" role="img" aria-label="'+GIU.esc(label)+'" '+
    'style="width:100%;max-width:360px;height:auto;display:block" '+
    'data-fav="'+GIU.esc(JSON.stringify(favG.pts))+'"'+
    (dogG ? ' data-dog="'+GIU.esc(JSON.stringify(dogG.pts))+'"' : "")+'>'+
    GIU.esc(label)+'</canvas>'+
    '<div style="font-size:.72rem;color:var(--faint);margin-top:4px">'+legend+'</div></div>';
}
/* Draw every kalshi-spark canvas after the cards land in the DOM (points
   ride in data attributes). Degrades gracefully: no canvas support, no
   points, or no draw context leaves the aria-label + caption telling the
   story — never junk. Colors read the site's CSS variables with hard
   fallbacks so the chart keeps the dark-sportsbook identity. */
function cssVar(name, fallback){
  try{
    var v = (document.defaultView || window).getComputedStyle(document.documentElement).getPropertyValue(name);
    v = String(v || "").trim();
    return v || fallback;
  }catch(e){ return fallback; }
}
function drawSparkLine(ctx, pts, color, fill){
  if(!pts || pts.length < 2) return;
  if(fill){
    ctx.save();
    ctx.beginPath();
    pts.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.lineTo(pts[pts.length - 1][0], 120);
    ctx.lineTo(pts[0][0], 120);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  pts.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.stroke();
  var last = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(last[0], last[1], 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = color; ctx.fill();
}
function drawKalshiSparks(box){
  var cs;
  try{ cs = box.querySelectorAll("canvas.kalshi-spark"); }catch(e){ return; }
  var gold = cssVar("--gold", "#f0b429"), blue = cssVar("--blue", "#4aa8ff");
  Array.prototype.forEach.call(cs || [], function(cv){
    var ctx = null;
    try{ ctx = cv.getContext("2d"); }catch(e){ ctx = null; }
    if(!ctx) return;
    var fav = parseArr(cv.getAttribute("data-fav")), dog = parseArr(cv.getAttribute("data-dog"));
    drawSparkLine(ctx, fav, "rgba(240,180,41,.28)", true);
    drawSparkLine(ctx, fav, gold, false);
    drawSparkLine(ctx, dog, blue, false);
  });
}
/* ---- "Market pulse": biggest Kalshi movers above the cards ----
   Thirty NFL cards (twelve MLB) make the per-card ▲/▼ badges easy to miss,
   so the tab opens with the largest snapshot-to-snapshot moves as
   jump-to-game chips. All numbers come from the baked snapshot diff via
   K.topMoves — the strip can never show a move the cards don't badge.
   Chips for games hidden behind "Show all N games" expand the list before
   scrolling (their card isn't in the DOM until the re-render); an empty
   board gets an honest quiet note, never a hidden section. pulseScrollTo
   carries the landing target across the expand re-render. */
var pulseScrollTo = null;
function pulseStrip(games, shown, moveMap, prevAt, newSet, cfg){
  var K = window.Kalshi;
  if(!K || !K.topMoves || !GIU || !GIU.esc) return "";
  var esc = GIU.esc;
  var top = K.topMoves(games, moveMap, 5);
  var shownSet = {};
  (shown || []).forEach(function(g){ if(g && g.ticker) shownSet[g.ticker] = 1; });
  var prevWhen = (prevAt && K.fmtWhen) ? K.fmtWhen(Date.parse(prevAt)) : "";
  var base = prevWhen ? "since the " + prevWhen + " snapshot" : "since the previous snapshot";
  var head = '<section class="card pulse-card" aria-label="Biggest Kalshi price moves on the ' + esc(cfg.name) + ' tab">' +
    '<span class="tag gold">Market pulse</span>';
  if(!top.length){
    return head +
      '<h3 style="margin:10px 0 4px">The crowd is sitting still</h3>' +
      '<p class="pulse-note">No Kalshi game moved 2¢ or more ' + esc(base) +
      ' — every price below is steady as of the snapshot.</p></section>';
  }
  var chips = top.map(function(m){
    var cls = m.delta > 0 ? "mv-up" : "mv-dn";
    var glyph = m.delta > 0 ? "▲ +" : "▼ −";
    var tip = (m.delta > 0 ? "Up " : "Down ") + Math.abs(m.delta) +
      " cents " + base + " — jump to the " + m.title + " card.";
    return '<a class="mover-chip ' + cls + '" href="#km-' + esc(m.ticker) + '"' +
      ' data-ticker="' + esc(m.ticker) + '"' +
      ' data-shown="' + (shownSet[m.ticker] ? "1" : "0") + '"' +
      ' title="' + esc(tip) + '">' +
      '<span class="num">' + glyph + Math.abs(m.delta) + '¢</span>' +
      '<b>' + esc(m.team) + '</b>' +
      '<span class="mover-game">' + esc(m.title) + '</span></a>';
  }).join("");
  var newN = newSet ? Object.keys(newSet).length : 0;
  var note = "Biggest snapshot-to-snapshot moves " + base +
    " — only 2¢+ moves make the cut, and every chip jumps to its game's card." +
    (newN ? " " + newN + (newN > 1 ? " new markets" : " new market") + " on the board this snapshot." : "");
  return head +
    '<h3 style="margin:10px 0 4px">Biggest moves ' + esc(base) + '</h3>' +
    '<div class="movers-row">' + chips + '</div>' +
    '<p class="pulse-note">' + esc(note) + '</p></section>';
}
/* Chips for games hidden behind "Show all N games" expand the list first,
   then land on the card (it isn't in the DOM until the re-render). One
   delegated listener on the stable grid element — re-renders replace only
   innerHTML — bound once; missing card support degrades to the anchor. */
function bindPulseChips(box){
  if(!box || box._pulseBound || !box.addEventListener) return;
  box._pulseBound = true;
  box.addEventListener("click", function(ev){
    var t = ev.target, chip = null;
    while(t && t !== box){
      if(t.classList && t.classList.contains && t.classList.contains("mover-chip")){ chip = t; break; }
      t = t.parentNode;
    }
    if(!chip || chip.getAttribute("data-shown") === "1") return;
    if(ev.preventDefault) ev.preventDefault();
    var ticker = chip.getAttribute("data-ticker");
    if(!kalshiTab || !ticker) return;
    pulseScrollTo = "km-" + ticker;
    kalshiShowAll[kalshiTab] = true;
    loadKalshi(tabSeq, true, kalshiTab);
  });
}
function kalshiCard(g, dir, cfg, moveMap, isNew, prevAt, hist, snapAt, folAbbr){
  var ab = kalshiAbbrs(g);
  /* Kalshi's abbreviations don't always match ESPN's (CWS vs CHW) — run them
     through the shared alias map so the header keeps full team identity. */
  if(ab && window.Disagree && window.Disagree.normAbbr)
    ab = [window.Disagree.normAbbr(ab[0]), window.Disagree.normAbbr(ab[1])];
  var head = (ab && window.GIU.vsHeader(dir, cfg.dirKey, ab[0], ab[1])) ||
    '<h3 style="margin:10px 0 4px">'+GIU.esc(g.title)+'</h3>';
  /* Kickoff (v2.0.11): the snapshot's real start time (Kalshi's
     occurrence_datetime, via K.games' start) in the visitor's timezone —
     before this, a Kalshi card named only the date ("(Oct 3)") while the
     Polymarket cards beside it showed the start time. No start in the
     snapshot -> no kickoff span, never a guessed one. */
  var kick = (window.Kalshi && window.Kalshi.fmtWhen) ? window.Kalshi.fmtWhen(g.start) : "";
  var meta = (g.sub || kick)
    ? '<div class="game-meta" style="margin-bottom:12px">'
      + (g.sub ? '<span>'+GIU.esc(g.sub)+'</span>' : "")
      + (kick ? '<span>Kickoff '+GIU.esc(kick)+'</span>' : "")
      + '</div>'
    : '<div style="height:8px"></div>';
  /* Snapshot-to-snapshot price moves, baked into the file by the fetch
     script (see K.diffMoves): a badge on the team whose price moved 2c+
     since the previous snapshot. moveBadge returns "" for anything below
     the bar, so the row stays clean when nothing moved. */
  var badgeFor = function(team){
    if(window.Kalshi && window.Kalshi.moveBadge && moveMap)
      return window.Kalshi.moveBadge(moveMap[team], team, prevAt);
    return "";
  };
  var newTag = isNew
    ? ' <span class="tag gold" title="This game wasn\'t in the previous Kalshi snapshot — a new market on the board.">new market</span>'
    : "";
  if(g.settled){
    /* Settled game (Kalshi keeps finished games in its "open" listing until
       settlement finalizes): show the RESULT honestly, never as a live
       prediction — no probability bars, no book line. */
    var win = (g.teams && g.teams[0]) || null;
    var vol = win && win.vol ? GIU.esc(win.vol) : "";
    return '<div class="card" id="km-'+GIU.esc(g.ticker)+'"><span class="tag">Settled</span> <span class="tag blue">'+GIU.esc(cfg.name)+'</span> '+head+meta+
      '<div style="margin:4px 0 12px"><span style="font-size:1.05rem">'+GIU.esc(win ? win.name : "Game")+'</span> '+
      '<span class="tag green">won · final</span></div>'+
      '<div style="font-size:.8rem;color:var(--faint);margin-bottom:8px">This game is over — the price reflects the final result, not a prediction. '+(vol ? vol : "")+'</div>'+
      '<div class="game-meta"><a href="https://kalshi.com/browse" target="_blank" rel="noopener">Trade on Kalshi →</a></div></div>';
  }
  var rows = g.teams.map(function(t){
    var book = t.book
      ? ' · book <b class="num" style="color:var(--text)">'+t.book.bid+'¢/'+t.book.ask+'¢</b> '+
        '<span class="tag '+t.book.cls+'" title="Live bid/ask spread from Kalshi\'s order book at snapshot time — the gap between the best buy and sell price.">'+t.book.spread+'¢ spread · '+t.book.lbl+'</span>'
      : "";
    return '<div style="margin-bottom:12px"><div style="font-size:.8rem;color:var(--faint);margin-bottom:5px">Yes — '+GIU.esc(t.name)+'</div>'+
      '<div style="display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:4px"><span>'+GIU.esc(t.name)+' wins</span><b class="num" style="color:var(--gold-soft)">'+t.price+'¢'+badgeFor(t.name)+'</b></div>'+
      '<div style="height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-bottom:6px" role="img" aria-label="'+GIU.esc(t.name)+' priced at '+t.price+' cents"><div style="height:100%;width:'+t.price+'%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--gold))"></div></div>'+
      '<div style="font-size:.76rem;color:var(--faint)">'+(t.vol ? GIU.esc(t.vol) : "No volume reported")+book+'</div></div>';
  }).join("");
  return '<div class="card'+(folAbbr ? " followed" : "")+'" id="km-'+GIU.esc(g.ticker)+'"><span class="tag green">Kalshi</span> <span class="tag blue">'+GIU.esc(cfg.name)+'</span> '+
    '<span class="tag" title="Prices come from a server-side snapshot because Kalshi\'s API blocks browser requests.">snapshot</span>'+newTag+
    (folAbbr ? ' <span class="tag your-team">★ Your team</span>' : '')+
    head+meta+
    rows+
    kalshiSpark(g, hist, snapAt)+
    '<div class="game-meta"><a href="https://kalshi.com/browse" target="_blank" rel="noopener">Trade on Kalshi →</a></div></div>';
}
function loadKalshi(my, silent, league){
  my = (my===undefined) ? tabSeq : my;
  league = league || "nfl";
  var cfg = KALSHI_TABS[league] || KALSHI_TABS.nfl;
  clearLive(); /* league switches and silent refreshes always reschedule */
  kalshiTab = league; /* v1.162.0 — the finder re-renders the ACTIVE board from here */
  var box = $("marketGrid");
  if(!silent){
    box.innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>'.repeat(3);
    $("marketNote").textContent = "Loading the Kalshi snapshot…";
    renderFollowStrip([]); /* a fresh tab never inherits the last tab's strip */
  }
  Promise.all([
    GIU.fetchJSON(cfg.file),
    /* Price history accumulates server-side next to the snapshot; a missing
       file (first run) is not an error — the cards render with the honest
       "accumulating" note and everything else keeps working. */
    GIU.fetchJSON("data/kalshi-history.json").catch(function(){ return {}; }),
    GIU.teamDir()
  ]).then(function(x){
    var snap = x[0], hist = x[1] || {}, dir = x[2];
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    /* v1.162.0 — the loaded snapshot board is cached and rendered by
       renderKalshi, which re-applies the active query on every render. */
    lastKalshi = { snap: snap, hist: hist, dir: dir, league: league, cfg: cfg,
                   games: window.Kalshi.games(snap) };
    lastUpdated = Date.now();
    renderKalshi();
  }).catch(function(){
    if(my !== tabSeq) return; /* user moved to another tab meanwhile */
    lastKalshi = null;
    box.innerHTML = GIU.failBox("The Kalshi snapshot couldn't be loaded. Kalshi's API blocks browser requests, so this page depends on the server-side snapshot — nothing is shown rather than stale prices.");
    $("marketNote").textContent = "";
    renderFollowStrip([]);
    renderSearchMeta(0, 0);
    liveN = 0; renderLiveStatus();
  });
}

/* Render the Kalshi tab from lastKalshi, applying the find-a-game
   query (v1.162.0). Called by loadKalshi() on every fresh snapshot
   and by the finder on every keystroke — it never refetches itself.
   While a search is active the first-page cap lifts: every match
   renders, and the pulse + follow strips are computed over the
   filtered board so no chip promises a card the search hid. */
function renderKalshi(){
  var st = lastKalshi; if(!st) return;
  var snap = st.snap, hist = st.hist, dir = st.dir,
      league = st.league, cfg = st.cfg, games = st.games;
  var box = $("marketGrid");
  ++renderGen;
  clearLive(); /* a search keystroke re-enters here — never stack the 5-min tick */
  if(!games.length){
    box.innerHTML = '<div class="empty">'+GIU.esc(cfg.empty)+'</div>';
    $("marketNote").textContent = "";
    renderFollowStrip([]);
    renderSearchMeta(0, 0);
    liveN = 0; renderLiveStatus();
    return;
  }
  var when = agoShort(snap.updated_at);
  $("marketNote").textContent = games.length+" games · snapshot refreshed "+when+" · Kalshi's API blocks browsers, so prices update when the snapshot rebuilds";
  var stale = window.Kalshi.stale(snap.updated_at)
    ? '<div class="notice" style="margin-bottom:16px"><strong>This snapshot is stale</strong> (over 6 hours old). Treat these prices as a rough guide until the next refresh — we\'d rather say so than let you bet on cold numbers.</div>'
    : "";
  var searching = searchTerms(searchQ).length > 0;
  var visible = games.filter(function(g){ return kalshiMatchesSearch(g, searchQ); });
  /* "What moved" wiring: the fetch script bakes a snapshot-to-snapshot
     diff into the file (K.diffMoves contract). Index it by event ticker
     so each card can badge the teams whose price moved 2c+ since the
     previous snapshot — and tag games that weren't listed before. */
  var moveMap = {}, newSet = {};
  (snap.moves || []).forEach(function(mv){
    if(!mv || !mv.event_ticker) return;
    (moveMap[mv.event_ticker] = moveMap[mv.event_ticker] || {})[mv.team] = mv.delta;
  });
  (snap.new_games || []).forEach(function(et){ if(et) newSet[et] = 1; });
  var prevAt = snap.prev_at || null;
  /* ---- followed teams (v1.155.0): mark this tab's followed games.
     v1.162.0 — computed over the FILTERED board (scores discipline). ---- */
  var folK = followedKalshi(visible, followedList(),
    (window.Disagree && window.Disagree.normAbbr) || null);
  var folByTicker = {};
  folK.forEach(function(m){ folByTicker[m.ticker] = m; });
  /* No query -> the first-page cap works exactly as before. Searching
     lifts it: every match is shown, so the toggle steps aside. */
  var showAll = !!kalshiShowAll[league];
  var shown = searching ? visible : (showAll ? visible : visible.slice(0, KALSHI_PAGE));
  var shownSet = {};
  shown.forEach(function(g){ if(g && g.ticker) shownSet[g.ticker] = 1; });
  if(searching && !visible.length){
    /* Named empty state — never a blank grid under an active search. */
    box.innerHTML = stale + '<div class="empty">No markets match &quot;'+GIU.esc(String(searchQ).trim())+
      '&quot; on this tab. Clear the search to see all '+games.length+' games.</div>';
  } else {
    box.innerHTML = stale +
      pulseStrip(visible, shown, moveMap, prevAt, newSet, cfg) +
      shown.map(function(g){
      return kalshiCard(g, dir, cfg, moveMap[g.ticker], !!newSet[g.ticker], prevAt, hist, snap.updated_at,
        folByTicker[g.ticker] ? folByTicker[g.ticker].abbr : null);
    }).join("") +
      (!searching && games.length > KALSHI_PAGE
        ? '<div style="margin:8px 0 34px;text-align:center"><button class="btn btn-ghost" id="kalshiShowAll" aria-expanded="'+showAll+'">'+
          (showAll ? "Show fewer games" : "Show all "+games.length+" games")+'</button></div>'
        : "");
  }
  drawKalshiSparks(box); /* paint the price-history canvases just rendered */
  bindPulseChips(box); /* pulse chips for hidden games expand-then-scroll */
  renderFollowStrip(kalshiChips(folK, shownSet));
  renderSearchMeta(visible.length, games.length);
  if(pulseScrollTo){
    /* a pulse chip on a hidden card expanded the list — land on the card
       now that the re-render put it in the DOM. */
    var land = null;
    try{ land = document.getElementById(pulseScrollTo); }catch(e){ land = null; }
    pulseScrollTo = null;
    if(land && land.scrollIntoView){
      var reduce = false;
      try{ reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }catch(e2){}
      try{ land.scrollIntoView({behavior: reduce ? "auto" : "smooth", block: "start"}); }catch(e3){}
    }
  }
  var tgl = $("kalshiShowAll");
  if(tgl) tgl.addEventListener("click", function(){
    kalshiShowAll[league] = !kalshiShowAll[league];
    renderKalshi(); /* v1.162.0 — local re-render from the loaded snapshot; no refetch, search state kept */
  });
  /* ---- live auto-refresh ----
     The snapshot file is rebuilt regularly server-side, so a
     silent 5-minute re-fetch picks up fresh prices between site pushes —
     no page reload, no shimmer. Counts describe the whole tab, not
     the filtered view. */
  kalshiTab = league;
  snapN = games.length; liveN = games.length;
  renderLiveStatus();
  if(games.length > 0 && autoOn){
    liveTimer = setInterval(function(){ if(!isHidden()) loadKalshi(tabSeq, true, kalshiTab); }, KAL_MS);
  }
}

$("marketTabs").innerHTML = LEAGUES.map(function(q,i){
  return '<button class="tab'+(i===0?" active":"")+'" data-i="'+i+'">'+q[0]+'</button>';
}).join("")+'<button class="tab" data-kalshi="nfl">Kalshi · NFL</button><button class="tab" data-kalshi="mlb">Kalshi · MLB</button><button class="tab" data-kalshi="ncaaf">Kalshi · NCAAF</button>';
Array.prototype.forEach.call($("marketTabs").querySelectorAll(".tab"), function(t){
  t.addEventListener("click", function(){
    Array.prototype.forEach.call($("marketTabs").querySelectorAll(".tab"), function(x){x.classList.remove("active");});
    t.classList.add("active");
    var my = ++tabSeq;
    var kl = t.getAttribute("data-kalshi");
    if(kl){ loadKalshi(my, false, kl); return; }
    cur = Number(t.getAttribute("data-i")); load(my);
  });
});
$("pauseBtn").addEventListener("click", function(){
  autoOn = !autoOn;
  if(autoOn && liveN > 0){
    /* resume: refresh now; the loader reschedules the timer */
    if(kalshiTab) loadKalshi(tabSeq, true, kalshiTab); else load(tabSeq, true);
  } else { clearLive(); renderLiveStatus(); }
});
/* v1.162.0 — find-a-game wiring. The query lives in module state, so
   it survives tab switches and both silent refreshes; filtering
   re-renders whichever board is active from its cached pull, never a
   refetch. No hooks on the page -> nothing is wired and the page
   behaves exactly as before. */
var searchInput = $("marketQ"), searchClearBtn = $("marketClear");
function rerenderForSearch(){
  if(kalshiTab && lastKalshi && lastKalshi.league === kalshiTab) renderKalshi();
  else if(!kalshiTab && lastPM) renderPM();
  else renderSearchMeta(0, 0);
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
bindFollowStrip(); /* "Your teams" chips for hidden Kalshi games expand-then-scroll */
load(++tabSeq);
})();
