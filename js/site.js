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
  ["AI Coach","ai-coach.html"],
  ["Tools","tools.html"],
  ["Journal","journal.html"],
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
  var act = isActive(n[1]);
  return '<a href="'+P(n[1])+'" class="'+(act?"active":"")+'"'+(act?' aria-current="page"':"")+'>'+n[0]+'</a>';
}).join("");

var headerHtml =
 '<div class="wrap header-inner">'+
   '<a class="brand" href="'+P("index.html")+'"><span class="brand-mark">G</span>GridIron<em>UI</em></a>'+
   '<button class="nav-toggle" id="navToggle" aria-label="Menu" aria-controls="mainNav" aria-expanded="false">☰</button>'+
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
     '<div class="donate-box"><b style="color:var(--gold-soft)">Tip the build (BTC)</b>'+
       '<code id="btcAddr">3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK</code>'+
       '<button class="copy-btn" id="copyBtc">Copy address</button></div>'+
   '</div>'+
   '<div><h4>Learn</h4><ul>'+
     '<li><a href="'+P("guides/betting-101.html")+'">Betting 101</a></li>'+
     '<li><a href="'+P("guides/bet-types.html")+'">Bet types</a></li>'+
     '<li><a href="'+P("guides/bankroll.html")+'">Bankroll management</a></li>'+
     '<li><a href="'+P("guides/advanced.html")+'">Advanced strategy</a></li>'+
     '<li><a href="'+P("guides/live-betting.html")+'">Live betting</a></li>'+
     '<li><a href="'+P("guides/line-movement.html")+'">Reading line movement</a></li>'+
     '<li><a href="'+P("guides/props.html")+'">Player props playbook</a></li>'+
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
     '<li><a href="'+P("ai-coach.html")+'">AI Coach</a></li>'+
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

/* ---------- v1.29.0 — display ads (AdSense-ready) + referral links ----------
   Display ads: slots marked [data-ad-slot] are filled only when
   GIU.CONFIG.ads.client holds a real publisher ID; otherwise they're removed
   from the page entirely, so the site stays clean until ad revenue is on.
   Ad-unit slot IDs are filled from the AdSense account's real display units
   (v1.41.0) — a placement without an ad-unit ID is removed too. Fill is lazy: the AdSense library is already in
   the page <head>; a fallback injects it if it's ever missing, then each
   slot gets an <ins> that AdSense sizes itself.
   Referrals: slots marked [data-ref-slot] render a small sponsored CTA only
   when GIU.CONFIG.referrals holds a link for that partner; otherwise the
   slot is removed so the page stays clean until it's earning. Cards carry a
   "Partner" badge, rel="sponsored noopener nofollow" and a 21+ affiliate
   note, per the affiliate-disclosure page. */
window.GIU = window.GIU || {};
window.GIU.CONFIG = window.GIU.CONFIG || {};
window.GIU.CONFIG.ads = {
  client: "ca-pub-3316742664595468", /* live — Kyle's AdSense */
  slots: {
    homeLeaderboard: "4554911928", /* index.html — below the Market Pulse hero */
    newsInline: "9231775101",      /* news.html — under the news wire */
    oddsInline: "1437045569"       /* odds.html — under the odds board */
  }
};
window.GIU.CONFIG.referrals = {
  polymarket: "https://polymarket.us/squad/join/vLoDh9A8ch54gJmkbqrE?referrer=fancyjaguar1280", /* Kyle's Polymarket squad referral link */
  kalshi: "https://kalshi.com/t/9g8izs5o" /* Kyle's Kalshi referral link */
};

window.GIU.initAds = function(){
  if(!document.querySelectorAll) return; /* ancient DOM — slots can't exist */
  var slots = Array.prototype.slice.call(document.querySelectorAll("[data-ad-slot]"));
  if(!slots.length) return;
  var cfg = (window.GIU.CONFIG && window.GIU.CONFIG.ads) || {};
  var client = (cfg.client || "").trim();
  if(!client){
    slots.forEach(function(s){ s.remove(); });
    return;
  }
  var libLoaded = false;
  function ensureLib(){
    if(libLoaded) return;
    libLoaded = true;
    /* The AdSense library is also in the page <head>; this is a fallback so
       slots work even if the head tag is ever removed. */
    if(document.querySelector('script[src*="pagead2.googlesyndication.com"]')) return;
    var sc = document.createElement("script");
    sc.async = true;
    sc.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
    sc.crossOrigin = "anonymous";
    document.head.appendChild(sc);
  }
  ensureLib();
  slots.forEach(function(el){
    var name = el.getAttribute("data-ad-slot");
    var slotId = ((((cfg.slots || {})[name]) || "") + "").trim();
    if(!slotId){ el.remove(); return; } /* placement without an ad-unit ID stays empty */
    el.classList.add("is-live");
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", "Advertisement");
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", client);
    ins.setAttribute("data-ad-slot", slotId);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    el.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch(e){ /* ad-blocked or offline — slot stays quiet */ }
  });
};

window.GIU.initReferrals = function(){
  if(!document.querySelectorAll) return; /* ancient DOM — slots can't exist */
  var META = {
    polymarket: { label: "Polymarket", blurb: "Live prediction markets", cta: "Trade on Polymarket" },
    kalshi:     { label: "Kalshi",     blurb: "Regulated US prediction market", cta: "Trade on Kalshi" }
  };
  Array.prototype.slice.call(document.querySelectorAll("[data-ref-slot]")).forEach(function(el){
    var key = el.getAttribute("data-ref-slot");
    var meta = META[key];
    var href = ((((window.GIU.CONFIG && window.GIU.CONFIG.referrals) || {})[key]) || "").trim();
    if(!meta || !href){ el.remove(); return; }
    el.classList.add("ref-card");
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", "Sponsored link: " + meta.label);
    var a = document.createElement("a");
    a.className = "ref-link";
    a.href = href;
    a.target = "_blank";
    a.rel = "sponsored noopener nofollow";
    var badge = document.createElement("span");
    badge.className = "ref-badge";
    badge.textContent = "Partner";
    var t = document.createElement("span");
    t.className = "ref-text";
    var cta = document.createElement("strong");
    cta.textContent = meta.cta + " \u2197";
    var sub = document.createElement("small");
    sub.textContent = meta.blurb + " \u00b7 21+ \u00b7 affiliate link";
    t.appendChild(cta);
    t.appendChild(sub);
    a.appendChild(badge);
    a.appendChild(t);
    el.appendChild(a);
  });
};

function mount(){
  var h = document.getElementById("site-header");
  if(h){
    /* Skip link first in tab order: keyboard and screen-reader users jump past
       the 15-link nav straight to the content. The target is tagged at runtime
       (first content block after the header) so every page gets a working
       anchor with no per-page markup edits. */
    h.outerHTML = '<a class="skip-link" href="#giu-main">Skip to main content</a>'+
      '<header class="site-header">'+headerHtml+'</header>';
    var hdrEl = document.querySelector(".site-header"), main = hdrEl && hdrEl.nextElementSibling;
    while(main && main.tagName === "SCRIPT") main = main.nextElementSibling;
    if(main){ if(!main.id) main.id = "giu-main"; main.setAttribute("tabindex","-1"); }
  }
  var f = document.getElementById("site-footer");
  if(f){ f.outerHTML = '<footer class="site-footer">'+footerHtml+'</footer>'; }
  var t = document.getElementById("navToggle"), nav = document.getElementById("mainNav");
  if(t && nav){
    t.addEventListener("click", function(){
      var open = nav.classList.toggle("open");
      t.setAttribute("aria-expanded", open ? "true" : "false");
    });
    /* close the mobile menu on link tap or Escape so it never traps the page */
    nav.addEventListener("click", function(e){
      if(e.target.closest("a") && nav.classList.contains("open")){
        nav.classList.remove("open"); t.setAttribute("aria-expanded","false");
      }
    });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && nav.classList.contains("open")){
        nav.classList.remove("open"); t.setAttribute("aria-expanded","false"); t.focus();
      }
    });
  }
  var c = document.getElementById("copyBtc");
  if(c) c.addEventListener("click", function(){
    var txt = document.getElementById("btcAddr").textContent;
    if(navigator.clipboard) navigator.clipboard.writeText(txt).then(function(){ c.textContent="Copied ✓"; setTimeout(function(){c.textContent="Copy address";},1600); });
  });
  startTicker();
  startHeadlines();
  initReveal();
  window.GIU.initAds();
  window.GIU.initReferrals();
  if(document.body.hasAttribute("data-feedcheck")) checkFeeds();
  /* Collapse the ticker + headline strips once scrolled: the sticky header
     shrinks to the nav row so it never swallows buttons or headings below it. */
  var hdr = document.querySelector(".site-header"), slim = false;
  if(hdr){
    var onScroll = function(){
      var y = window.scrollY||window.pageYOffset||0;
      /* hysteresis: compact past 170, expand below 110 — no threshold flutter,
         and the CSS collapse is animated so the header never snaps the layout */
      var c = slim ? y > 110 : y > 170;
      if(c !== slim){ slim = c; hdr.classList.toggle("compact", c); }
    };
    window.addEventListener("scroll", onScroll, {passive:true});
    onScroll();
  }
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

/* ---------- reveal-on-scroll ---------- */
/* Cards fade/slide in as they enter the viewport — applied automatically to
   .card and .game-card, including content rendered later by page scripts.
   Disabled under prefers-reduced-motion. */
function initReveal(){
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce || !("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, {threshold:0.06, rootMargin:"0px 0px -24px 0px"});
  function sweep(root){
    var els = (root===document ? document : root).querySelectorAll ?
      root.querySelectorAll(".card:not(.rv):not(.in),.game-card:not(.rv):not(.in)") : [];
    for(var i=0;i<els.length;i++){ els[i].classList.add("rv"); io.observe(els[i]); }
  }
  sweep(document);
  if("MutationObserver" in window){
    var mo = new MutationObserver(function(muts){
      muts.forEach(function(m){
        for(var i=0;i<m.addedNodes.length;i++){
          var n = m.addedNodes[i];
          if(n.nodeType===1) sweep(n);
        }
      });
    });
    if(document.body) mo.observe(document.body, {childList:true, subtree:true});
  }
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
