/* GridIronUI — watch-page click-to-play facades (v1.130.0).
   The Watch page embeds seven YouTube playlist players; js/watch.js converts
   each .video-card iframe into a lightweight poster button that swaps in the
   real player on tap (user gesture -> autoplay allowed). Tests pure helpers,
   the DOM conversion/activation against a minimal fake DOM, and the shipped
   wiring pins on watch.html (page-scoped inline <style>, cache key).
   Run: node tests/test-watch-facade.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var W = require(path.join(ROOT, "js", "watch.js"));
var fails = 0, n = 0;
function ok(cond, label){
  n++;
  if(!cond){ fails++; console.error("FAIL: " + label); }
  else console.log("ok  : " + label);
}

/* ---------- minimal fake DOM: exactly the surface js/watch.js touches ---------- */
function MiniEl(tag){
  this.tag = tag;
  this.attrs = {};
  this.children = [];
  this.parentNode = null;
  this.innerHTML = "";
  var self = this;
  this.classList = {
    _set: {},
    add: function(c){ this._set[c] = 1; self._cls = Object.keys(this._set).join(" "); },
    contains: function(c){ return !!this._set[c]; }
  };
  this._cls = "";
}
Object.defineProperty(MiniEl.prototype, "className", {
  get: function(){ return this._cls; },
  set: function(v){
    this._cls = v || "";
    var s = this.classList._set;
    Object.keys(s).forEach(function(k){ delete s[k]; });
    (v || "").split(/\s+/).forEach(function(c){ if(c) s[c] = 1; });
  }
});
MiniEl.prototype.getAttribute = function(k){
  return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
};
MiniEl.prototype.setAttribute = function(k, v){ this.attrs[k] = String(v); };
MiniEl.prototype.hasAttribute = function(k){
  return Object.prototype.hasOwnProperty.call(this.attrs, k);
};
MiniEl.prototype.appendChild = function(c){
  c.parentNode = this; this.children.push(c); return c;
};
MiniEl.prototype.replaceChild = function(nw, old){
  var i = this.children.indexOf(old);
  if(i < 0) throw new Error("not a child");
  this.children[i] = nw; nw.parentNode = this; old.parentNode = null;
  return old;
};
function MiniDoc(){
  this._all = [];
  this._listeners = {};
}
MiniDoc.prototype.createElement = function(tag){
  var e = new MiniEl(tag); this._all.push(e); return e;
};
MiniDoc.prototype.querySelectorAll = function(sel){
  if(sel === ".video-card iframe"){
    return this._all.filter(function(e){
      if(e.tag !== "iframe") return false;
      var p = e.parentNode;
      while(p){
        if(p.classList && p.classList.contains("video-card")) return true;
        p = p.parentNode;
      }
      return false;
    });
  }
  return [];
};
MiniDoc.prototype.addEventListener = function(t, fn){
  (this._listeners[t] = this._listeners[t] || []).push(fn);
};
/* a fake watch page: `count` youtube iframes in .video-card divs */
function fakeWatchPage(count, opts){
  opts = opts || {};
  var doc = new MiniDoc();
  var cards = [];
  for(var i = 0; i < count; i++){
    var card = doc.createElement("div");
    card.className = "video-card";
    var f = doc.createElement("iframe");
    f.setAttribute("src", "https://www.youtube.com/embed/videoseries?list=UUabc" + i);
    f.setAttribute("title", "Outlet " + i + " latest uploads");
    f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
    f.setAttribute("allowfullscreen", "");
    card.appendChild(f);
    cards.push(card);
  }
  if(opts.extraNonYoutube){
    var card2 = doc.createElement("div");
    card2.className = "video-card";
    var g = doc.createElement("iframe");
    g.setAttribute("src", "https://example.com/player");
    card2.appendChild(g);
  }
  return {doc: doc, cards: cards};
}

/* ---------- pure helpers ---------- */
ok(W.autoplayUrl("https://www.youtube.com/embed/videoseries?list=UUabc") ===
   "https://www.youtube.com/embed/videoseries?list=UUabc&autoplay=1",
   "autoplayUrl appends &autoplay=1 to an embed URL with a query");
ok(W.autoplayUrl("https://www.youtube.com/embed/videoseries") ===
   "https://www.youtube.com/embed/videoseries?autoplay=1",
   "autoplayUrl appends ?autoplay=1 to an embed URL without a query");
ok(W.autoplayUrl("https://example.com/player") === "https://example.com/player",
   "autoplayUrl leaves non-youtube URLs untouched");
ok(W.autoplayUrl(null) === null, "autoplayUrl passes non-strings through");
ok(W.facadeLabel("ESPN latest uploads") === "Load the latest-uploads player: ESPN latest uploads",
   "facadeLabel names the outlet player honestly");
ok(W.facadeLabel("") === "Load the latest-uploads player",
   "facadeLabel has no dangling colon without a title");
ok(W.facadeLabel(null) === "Load the latest-uploads player",
   "facadeLabel tolerates null titles");
var ph1 = W.posterHtml(), ph2 = W.posterHtml();
ok(ph1 === ph2 && /vf-disc/.test(ph1) && /vf-cap/.test(ph1) && /tap to play/.test(ph1),
   "posterHtml is a constant decorative poster (disc + tap-to-play caption)");
ok(/aria-hidden="true"/.test(ph1), "poster content is aria-hidden (the button carries the label)");

/* ---------- facadeFor ---------- */
var d0 = new MiniDoc();
var bad = d0.createElement("iframe");
bad.setAttribute("src", "https://example.com/player");
ok(W.facadeFor(d0, bad) === null, "facadeFor skips non-youtube iframes");
ok(W.facadeFor(d0, {}) === null, "facadeFor returns null for degenerate input");
var f0 = d0.createElement("iframe");
f0.setAttribute("src", "https://www.youtube.com/embed/videoseries?list=UUiWLfSweyRNmLpgEHekhoAg");
f0.setAttribute("title", "ESPN latest uploads");
f0.setAttribute("allow", "accelerometer; autoplay");
f0.setAttribute("allowfullscreen", "");
var b0 = W.facadeFor(d0, f0);
ok(!!b0 && b0.tag === "button" && b0.classList.contains("v-facade"),
   "facadeFor builds a button.v-facade for a youtube embed");
ok(b0.getAttribute("type") === "button", "poster is type=button");
ok(b0.getAttribute("aria-label") === "Load the latest-uploads player: ESPN latest uploads",
   "poster aria-label names the outlet");
ok(b0.getAttribute("data-embed") === "https://www.youtube.com/embed/videoseries?list=UUiWLfSweyRNmLpgEHekhoAg",
   "poster carries the embed URL in data-embed");
ok(b0.getAttribute("data-title") === "ESPN latest uploads" &&
   b0.getAttribute("data-fullscreen") === "1",
   "poster carries title + fullscreen flag as data attributes");
var evil = d0.createElement("iframe");
evil.setAttribute("src", "https://www.youtube.com/embed/videoseries?list=UUx");
evil.setAttribute("title", 'x" onmouseover="alert(1)');
var be = W.facadeFor(d0, evil);
ok(be.getAttribute("aria-label").indexOf('onmouseover="alert(1)') >= 0 &&
   be.innerHTML.indexOf("onmouseover") === -1,
   "a hostile outlet title lives in attributes only, never in poster HTML (XSS-safe)");

/* ---------- convert ---------- */
var pg = fakeWatchPage(7, {extraNonYoutube: true});
var converted = W.convert(pg.doc);
ok(converted === 7, "convert replaces exactly the 7 youtube iframes (non-youtube iframe untouched)");
var allButtons = pg.cards.every(function(c){
  return c.children.length === 1 && c.children[0].tag === "button" &&
         c.children[0].classList.contains("v-facade");
});
ok(allButtons, "each card now holds exactly one button.v-facade");
var nonYt = pg.doc.querySelectorAll(".video-card iframe");
ok(nonYt.length === 1 && nonYt[0].getAttribute("src") === "https://example.com/player",
   "the non-youtube iframe survives conversion");
ok(W.convert(pg.doc) === 0, "convert is idempotent (posters are not re-converted)");

/* ---------- activate ---------- */
var btn = pg.cards[0].children[0];
var played = W.activate(pg.doc, btn);
ok(played.tag === "iframe", "activate swaps the poster for an iframe");
ok(played.getAttribute("src").indexOf("&autoplay=1") >= 0,
   "activated player autoplays (tap is the user gesture)");
ok(played.getAttribute("title") === "Outlet 0 latest uploads", "title preserved");
ok(played.getAttribute("allow").indexOf("autoplay") >= 0, "allow permissions preserved");
ok(played.hasAttribute("allowfullscreen"), "allowfullscreen preserved");
ok(pg.cards[0].children[0] === played && pg.cards[0].children.length === 1,
   "poster is removed; the player takes its exact slot");

/* ---------- closestFacade + boot ---------- */
var pg2 = fakeWatchPage(2);
W.convert(pg2.doc);
var inner = pg2.doc.createElement("span");
inner.className = "vf-tri";
pg2.cards[0].children[0].appendChild(inner);
ok(W.closestFacade(pg2.doc, inner) === pg2.cards[0].children[0],
   "closestFacade climbs from nested poster content to the button");
ok(W.closestFacade(pg2.doc, pg2.cards[1]) === null,
   "closestFacade returns null outside a poster");
var pg3 = fakeWatchPage(3);
ok(W.boot(pg3.doc) === 3 && (pg3.doc._listeners.click || []).length === 1,
   "boot converts and registers one delegated click listener");
var pg4 = fakeWatchPage(0);
ok(W.boot(pg4.doc) === 0, "boot is quiet on pages with no video cards");

/* ---------- shipped wiring pins ---------- */
var html = fs.readFileSync(path.join(ROOT, "watch.html"), "utf8");
ok(/<script src="js\/watch\.js\?v=1\.148\.0"><\/script>/.test(html),
   "watch.html loads js/watch.js with a v1.148.0 cache key");
ok(/<style>[\s\S]*?\.v-facade\{[^}]*aspect-ratio:16\/9/.test(html),
   "watch.html carries the page-scoped .v-facade poster CSS (16:9, matches old iframe box)");
ok(/\.v-facade:focus-visible/.test(html), "poster has a visible focus state");
ok(/prefers-reduced-motion/.test(html), "poster motion respects prefers-reduced-motion");
var cssBefore = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
ok(cssBefore.indexOf("v-facade") === -1, "style.css untouched (page-scoped CSS, no site-wide key churn)");
ok(/css\/style\.css\?v=1\.104\.0/.test(html), "style.css key untouched on watch.html");

console.log("\n" + (fails ? fails + " FAILURES (" + n + " checks)" : "ALL " + n + " CHECKS PASSED"));
process.exit(fails ? 1 : 0);
