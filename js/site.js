/* GridIronUI shared chrome: header, ticker tape, footer, feed-health.
   Loaded on every page. window.GIU_BASE must be set before this script. */
(function(){
"use strict";
var BASE = (window.GIU_BASE !== undefined) ? window.GIU_BASE : ".";
var P = function(p){
  /* On guides/ pages (BASE=".."), same-folder targets must not keep the guides/ prefix. */
  if(BASE === ".." && p.indexOf("guides/") === 0) return p.slice(7);
  return BASE + "/" + p;
};

var NAV = [
  ["Home","index.html"],
  ["Odds","odds.html"],
  ["Markets","markets.html"],
  ["Scores","scores.html"],
  ["Predictions","predictions.html"],
  ["News","news.html"],
  ["Injuries","injuries.html"],
  ["Weather","weather.html"],
  ["Watch","watch.html"],
  ["DFS Lab","dfs.html"],
  ["Tools","tools.html"],
  ["Guides","guides/betting-101.html"],
  ["Links","links.html"]
];
var path = location.pathname;
function isActive(href){
  var f = href.split("/").pop();
  if(f === "index.html") return /\/$|\/index\.html$/.test(path) || path.endsWith("/GridIronUI.com/") || path.endsWith("/GridIronUI.com");
  if(href.indexOf("guides/") === 0) return path.indexOf("/guides/") !== -1;
  return path.endsWith("/"+f);
}

var navHtml = NAV.map(function(n){
  return '<a href="'+P(n[1])+'" class="'+(isActive(n[1])?"active":"")+'">'+n[0]+'</a>';
}).join("");

var headerHtml =
 '<div class="wrap header-inner">'+
   '<a class="brand" href="'+P("index.html")+'"><span class="brand-mark">G</span>GridIron<em>UI</em></a>'+
   '<button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>'+
   '<nav class="main-nav" id="mainNav">'+navHtml+'</nav>'+
   '<span class="feed-pill" id="feedPill" title="Live data feed status"><span class="feed-dot"></span><span id="feedTxt">FEEDS</span></span>'+
 '</div>'+
 '<div class="ticker" id="ticker" hidden><div class="ticker-track" id="tickerTrack"></div></div>'+
 '<div class="headlines" id="headlines" hidden><span class="hl-label">📰 Headlines</span><a class="hl-text" id="hlText">Loading headlines…</a></div>';

var footerHtml =
 '<div class="footer-compliance"><div class="wrap">'+
   '<div class="age">21+</div>'+
   '<p><strong style="color:var(--text)">All outbound links on this site lead exclusively to licensed and authorized gambling operators.</strong></p>'+
   '<p>Betting involves risk. Never wager more than you can afford to lose. If gambling stops being fun, help is free and confidential:</p>'+
   '<p class="helpline">Call or text 1-800-GAMBLER</p>'+
   '<p style="font-size:.78rem">National Council on Problem Gambling · <a href="https://www.ncpgambling.org">ncpgambling.org</a> · 1-800-MY-RESET · <a href="'+P("responsible-gambling.html")+'">Responsible gambling resources</a></p>'+
 '</div></div>'+
 '<div class="wrap"><div class="footer-grid">'+
   '<div><h4>GridIronUI</h4>'+
     '<p style="font-size:.88rem;color:var(--muted)">The one-stop shop for sports betting knowledge — guides, tools, live odds, prediction markets, scores, news and weather, all in one place.</p>'+
     '<p style="margin-top:12px"><a href="https://x.com/kshot9000" target="_blank" rel="noopener" style="font-weight:700">𝕏 @kshot9000</a></p>'+
     '<div class="donate-box"><b style="color:var(--gold-soft)">Tip the build (PRL)</b>'+
       '<code id="prlAddr">prl1p62v09vuzyd8kdz9l23jaf3kph4wwx6jqcmhkkhg8lhr2qlxky8psu3zw9d</code>'+
       '<button class="copy-btn" id="copyPrl">Copy address</button></div>'+
   '</div>'+
   '<div><h4>Learn</h4><ul>'+
     '<li><a href="'+P("guides/betting-101.html")+'">Betting 101</a></li>'+
     '<li><a href="'+P("guides/bet-types.html")+'">Bet types</a></li>'+
     '<li><a href="'+P("guides/bankroll.html")+'">Bankroll management</a></li>'+
     '<li><a href="'+P("guides/advanced.html")+'">Advanced strategy</a></li>'+
     '<li><a href="'+P("glossary.html")+'">Glossary</a></li>'+
     '<li><a href="'+P("tools.html")+'">Betting calculators</a></li>'+
   '</ul></div>'+
   '<div><h4>Live data</h4><ul>'+
     '<li><a href="'+P("odds.html")+'">Odds board</a></li>'+
     '<li><a href="'+P("markets.html")+'">Prediction markets</a></li>'+
     '<li><a href="'+P("scores.html")+'">Scores &amp; stats</a></li>'+
     '<li><a href="'+P("predictions.html")+'">Predictions</a></li>'+
     '<li><a href="'+P("news.html")+'">News</a></li>'+
     '<li><a href="'+P("injuries.html")+'">Injuries</a></li>'+
     '<li><a href="'+P("weather.html")+'">Game weather</a></li>'+
     '<li><a href="'+P("watch.html")+'">Watch</a></li>'+
     '<li><a href="'+P("dfs.html")+'">DFS Lab</a></li>'+
   '</ul></div>'+
   '<div><h4>Company</h4><ul>'+
     '<li><a href="'+P("about.html")+'">About</a></li>'+
     '<li><a href="'+P("partners.html")+'">Partner with us</a></li>'+
     '<li><a href="'+P("contact.html")+'">Contact</a></li>'+
     '<li><a href="'+P("legality.html")+'">Legality</a></li>'+
     '<li><a href="'+P("links.html")+'">Links directory</a></li>'+
     '<li><a href="'+P("privacy.html")+'">Privacy</a></li>'+
     '<li><a href="'+P("terms.html")+'">Terms</a></li>'+
     '<li><a href="'+P("affiliate-disclosure.html")+'">Affiliate disclosure</a></li>'+
   '</ul></div>'+
 '</div>'+
 '<div class="footer-bottom"><span>© 2026 GridIronUI · Educational content only. No real-money wagering on this site.</span><span>Photography via Unsplash · Data: ESPN, Polymarket, Open-Meteo</span></div>'+
 '</div>';

function mount(){
  var h = document.getElementById("site-header");
  if(h){ h.outerHTML = '<header class="site-header">'+headerHtml+'</header>'; }
  var f = document.getElementById("site-footer");
  if(f){ f.outerHTML = '<footer class="site-footer">'+footerHtml+'</footer>'; }
  var t = document.getElementById("navToggle");
  if(t) t.addEventListener("click", function(){ document.getElementById("mainNav").classList.toggle("open"); });
  var c = document.getElementById("copyPrl");
  if(c) c.addEventListener("click", function(){
    var txt = document.getElementById("prlAddr").textContent;
    if(navigator.clipboard) navigator.clipboard.writeText(txt).then(function(){ c.textContent="Copied ✓"; setTimeout(function(){c.textContent="Copy address";},1600); });
  });
  startTicker();
  startHeadlines();
  if(document.body.hasAttribute("data-feedcheck")) checkFeeds();
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();

/* ---------- live odds ticker tape ---------- */
var tickerCache = null, tickerAt = 0;
function startTicker(){
  var box = document.getElementById("ticker"), track = document.getElementById("tickerTrack");
  if(!box || !track) return;
  function render(items){
    if(!items.length){
      track.innerHTML = '<span class="tick-item">NFL offseason — futures markets live on the <b>&nbsp;Predictions&nbsp;</b> page</span>';
    } else {
      track.innerHTML = items.map(function(g){
        var live = g.live ? '<span class="live-dot"></span><b>LIVE</b> ' : "";
        return '<span class="tick-item">'+live+'<b>'+g.away+'</b> <span class="t-score">'+g.aScore+'</span> @ <b>'+g.home+'</b> <span class="t-score">'+g.hScore+'</span> <span>'+g.meta+'</span></span>';
      }).join("");
    }
    box.hidden = false;
  }
  function load(){
    var now = Date.now();
    if(tickerCache && now - tickerAt < 5*60*1000){ render(tickerCache); return; }
    fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){
        var items = (d.events||[]).slice(0,14).map(function(ev){
          var c = ev.competitions[0], st = c.status.type;
          var home = c.competitors.find(function(t){return t.homeAway==="home";});
          var away = c.competitors.find(function(t){return t.homeAway==="away";});
          var live = st.state === "in";
          var meta = live ? (st.shortDetail||"") : fmtDate(ev.date);
          return {away:away.team.abbreviation, home:home.team.abbreviation,
                  aScore:away.score, hScore:home.score, meta:meta, live:live};
        });
        tickerCache = items; tickerAt = now; render(items);
      })
      .catch(function(){ /* ticker stays hidden — graceful */ });
  }
  load();
  setInterval(load, 5*60*1000);
}
function fmtDate(iso){
  try{
    var d = new Date(iso);
    return d.toLocaleDateString("en-US",{weekday:"short"})+" "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }catch(e){ return ""; }
}

/* ---------- global headline strip ---------- */
var hlTimer = null;
function startHeadlines(){
  var box = document.getElementById("headlines"), el = document.getElementById("hlText");
  if(!box || !el) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fetchLeague(path){
    return fetch("https://site.api.espn.com/apis/site/v2/sports/"+path+"/news?limit=8", {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){
        return (d.articles||[]).map(function(a){
          var href = a.links && a.links.web && a.links.web.href;
          return {h:a.headline, href:href};
        }).filter(function(x){ return x.h; });
      }).catch(function(){ return []; });
  }
  Promise.all([fetchLeague("football/nfl"), fetchLeague("basketball/nba")]).then(function(rs){
    var items = [], seen = {};
    rs.forEach(function(arr){ arr.forEach(function(x){
      if(!seen[x.h]){ seen[x.h]=1; items.push(x); }
    }); });
    if(!items.length) return; /* stays hidden — graceful */
    var i = 0;
    var newsHref = P("news.html");
    function applyHref(x){
      if(x.href){ el.href = x.href; el.target = "_blank"; el.rel = "noopener"; }
      else { el.href = newsHref; el.removeAttribute("target"); el.removeAttribute("rel"); }
    }
    function show(){
      el.classList.add("hl-fade");
      setTimeout(function(){
        el.textContent = items[i].h;
        applyHref(items[i]);
        el.classList.remove("hl-fade");
      }, 220);
    }
    el.textContent = items[0].h;
    applyHref(items[0]);
    box.hidden = false;
    if(reduce || items.length < 2) return;
    hlTimer = setInterval(function(){ i = (i+1)%items.length; show(); }, 7000);
    box.addEventListener("mouseenter", function(){ if(hlTimer){ clearInterval(hlTimer); hlTimer=null; } });
    box.addEventListener("mouseleave", function(){
      if(!hlTimer) hlTimer = setInterval(function(){ i = (i+1)%items.length; show(); }, 7000);
    });
  });
}

/* ---------- feed health indicator ---------- */
function checkFeeds(){
  var pill = document.getElementById("feedPill"), txt = document.getElementById("feedTxt");
  if(!pill) return;
  function ping(url, ms){
    return new Promise(function(res){
      var to = setTimeout(function(){ res(false); }, ms||8000);
      fetch(url, {cache:"no-store"}).then(function(r){ clearTimeout(to); res(r.ok); }).catch(function(){ clearTimeout(to); res(false); });
    });
  }
  Promise.all([
    ping("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"),
    ping("https://gamma-api.polymarket.com/public-search?q=NFL&limit=1"),
    ping("https://api.open-meteo.com/v1/forecast?latitude=41.88&longitude=-87.62&current=temperature_2m")
  ]).then(function(rs){
    var ok = rs.filter(Boolean).length;
    if(ok === rs.length){ pill.classList.add("ok"); txt.textContent = "ALL FEEDS LIVE"; }
    else { pill.classList.add("warn"); txt.textContent = "FEEDS DEGRADED ("+ok+"/"+rs.length+")"; }
    pill.title = "ESPN: "+(rs[0]?"ok":"down")+" · Polymarket: "+(rs[1]?"ok":"down")+" · Open-Meteo: "+(rs[2]?"ok":"down");
  });
}

/* ---------- shared helpers ---------- */
window.GIU = window.GIU || {};
window.GIU.el = function(tag, cls, html){
  var e = document.createElement(tag); if(cls) e.className = cls; if(html!==undefined) e.innerHTML = html; return e;
};
window.GIU.fetchJSON = function(url, ms){
  ms = ms || 12000;
  return new Promise(function(res, rej){
    var to = setTimeout(function(){ rej(new Error("timeout")); }, ms);
    fetch(url, {cache:"no-store"}).then(function(r){
      clearTimeout(to);
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.json();
    }).then(res).catch(rej);
  });
};
window.GIU.esc = function(s){
  return String(s==null?"":s).replace(/[&<>"']/g, function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});
};
window.GIU.failBox = function(msg){
  return '<div class="notice"><strong>Couldn\'t load live data.</strong> '+window.GIU.esc(msg)+' Please check your connection and refresh. Nothing here is cached or estimated — when a feed is down, we say so.</div>';
};
})();
