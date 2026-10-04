/* GridIronUI — watch page weekend pass (v1.148.0).
   Branded per-outlet posters (W.OUTLETS lookup keyed by the uploads-playlist
   list id, outlet accent hue on the poster button) and the date-gated
   #weekend-spotlight band (shown only inside its data-start/data-end window,
   removes itself outside it). Also pins the editorial claims in the spotlight
   against the real data files so the copy can never drift from the snapshot:
   the four Division Series pairings come from data/kalshi-mlb.json and the
   Week 5 game count from data/kalshi-nfl.json.
   Run: node tests/test-watch-weekend.js */
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

/* ---------- minimal fake DOM: the surface js/watch.js touches ---------- */
function MiniEl(tag){
  this.tag = tag;
  this.attrs = {};
  this.children = [];
  this.parentNode = null;
  this.innerHTML = "";
  var self = this;
  this.classList = {
    _set: {},
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
MiniEl.prototype.removeAttribute = function(k){ delete this.attrs[k]; };
MiniEl.prototype.appendChild = function(c){
  c.parentNode = this; this.children.push(c); return c;
};
MiniEl.prototype.removeChild = function(c){
  var i = this.children.indexOf(c);
  if(i < 0) throw new Error("not a child");
  this.children.splice(i, 1); c.parentNode = null; return c;
};
function MiniDoc(){
  this._byId = {};
}
MiniDoc.prototype.createElement = function(tag){ return new MiniEl(tag); };
MiniDoc.prototype.getElementById = function(id){ return this._byId[id] || null; };
MiniDoc.prototype.register = function(id, el){ this._byId[id] = el; };
function weekendSection(doc, start, end, hidden){
  var wrap = doc.createElement("div");
  var sec = doc.createElement("section");
  sec.setAttribute("id", "weekend-spotlight");
  sec.setAttribute("data-start", start);
  sec.setAttribute("data-end", end);
  if(hidden) sec.setAttribute("hidden", "");
  wrap.appendChild(sec);
  doc.register("weekend-spotlight", sec);
  return { wrap: wrap, sec: sec };
}

/* ---------- listIdOf ---------- */
ok(W.listIdOf("https://www.youtube.com/embed/videoseries?list=UUiWLfSweyRNmLpgEHekhoAg") ===
   "UUiWLfSweyRNmLpgEHekhoAg", "listIdOf extracts the uploads-playlist id");
ok(W.listIdOf("https://www.youtube.com/embed/videoseries?list=UUabc&autoplay=1") === "UUabc",
   "listIdOf stops at the next query param");
ok(W.listIdOf("https://www.youtube.com/embed/abc123") === null,
   "listIdOf returns null when there is no list param");
ok(W.listIdOf("https://example.com/player") === null, "listIdOf ignores non-youtube URLs");
ok(W.listIdOf(null) === null, "listIdOf tolerates null");

/* ---------- outletFor ---------- */
var SHIPPED = {
  "UUiWLfSweyRNmLpgEHekhoAg": "ESPN",
  "UUvQrivswRDGK0lZ_AcUHp8g": "NFL on FOX",
  "UUja8sZ2T4ylIqjggA1Zuukg": "CBS Sports",
  "UUqZQlzSHbVJrwrn5XvzrzcA": "NBC Sports",
  "UUiio0ydw439X13KyZgMIcHw": "NFL on ESPN",
  "UUvv0ade-LVRA2fp9C5-C6hQ": "Action Network",
  "UUNLTjT8_c2gyVNDIKf2YwEw": "WagerTalk TV"
};
Object.keys(SHIPPED).forEach(function(id){
  var o = W.outletFor(id);
  ok(!!o && o.name === SHIPPED[id] && typeof o.hue === "number",
     "outletFor(" + id + ") -> " + SHIPPED[id] + " with a numeric hue");
});
ok(W.outletFor("UUnotreal") === null, "outletFor returns null for an unknown list id");
ok(W.outletFor(null) === null, "outletFor tolerates null");
ok(Object.keys(W.OUTLETS).length === 7, "OUTLETS covers exactly the 7 shipped outlet players");

/* ---------- posterHtml ---------- */
var branded = W.posterHtml(W.outletFor("UUiWLfSweyRNmLpgEHekhoAg"));
ok(/vf-brand/.test(branded) && branded.indexOf("ESPN") >= 0,
   "branded poster carries the outlet wordmark");
ok(/aria-hidden="true">ESPN</.test(branded), "wordmark is aria-hidden (button carries the label)");
var generic = W.posterHtml(null);
ok(generic.indexOf("vf-brand") === -1 && /vf-disc/.test(generic) && /tap to play/.test(generic),
   "null outlet keeps the generic poster (disc + caption, no brand)");
ok(W.posterHtml() === generic, "posterHtml() with no args is the generic poster");
var hostile = W.posterHtml({ name: 'x"><img src=x onerror=alert(1)>', hue: 1 });
ok(hostile.indexOf("<img") === -1 && hostile.indexOf("&lt;img") >= 0,
   "a hostile outlet name is escaped, never injected as HTML");

/* ---------- date gate ---------- */
ok(W.inWindow("2026-10-02", "2026-10-05", "2026-10-02") === true, "inWindow: start boundary shows");
ok(W.inWindow("2026-10-02", "2026-10-05", "2026-10-05") === true, "inWindow: end boundary shows");
ok(W.inWindow("2026-10-02", "2026-10-05", "2026-10-04") === true, "inWindow: inside shows");
ok(W.inWindow("2026-10-02", "2026-10-05", "2026-10-01") === false, "inWindow: before start hides");
ok(W.inWindow("2026-10-02", "2026-10-05", "2026-10-06") === false, "inWindow: after end hides");
ok(W.inWindow("soon", "2026-10-05", "2026-10-03") === false, "inWindow: garbage start never shows");
ok(W.inWindow("2026-10-02", "2026-10-05", null) === false, "inWindow: garbage today never shows");
ok(/^\d{4}-\d{2}-\d{2}$/.test(W.todayStr(new Date(2026, 9, 3))),
   "todayStr renders a local YYYY-MM-DD date");

/* ---------- revealWeekend ---------- */
var d1 = new MiniDoc();
var s1 = weekendSection(d1, "2026-10-02", "2026-10-05", true);
ok(W.revealWeekend(d1, "2026-10-03") === "shown" && !s1.sec.hasAttribute("hidden") &&
   s1.sec.parentNode === s1.wrap,
   "revealWeekend unhides the band inside the window");
var d2 = new MiniDoc();
var s2 = weekendSection(d2, "2026-10-02", "2026-10-05", true);
ok(W.revealWeekend(d2, "2026-10-06") === "expired" && s2.sec.parentNode === null,
   "revealWeekend removes the band after the window (never stale)");
var d3 = new MiniDoc();
var s3 = weekendSection(d3, "garbage", "2026-10-05", true);
ok(W.revealWeekend(d3, "2026-10-03") === "expired" && s3.sec.parentNode === null,
   "revealWeekend removes the band when the window is unreadable (fail closed)");
var d4 = new MiniDoc();
ok(W.revealWeekend(d4, "2026-10-03") === "none", "revealWeekend is quiet with no band on the page");

/* ---------- shipped wiring pins ---------- */
var html = fs.readFileSync(path.join(ROOT, "watch.html"), "utf8");
ok(/<script src="js\/watch\.js\?v=1\.148\.0"><\/script>/.test(html),
   "watch.html loads js/watch.js with a v1.148.0 cache key");
ok(/\.vf-brand\{[^}]*font-weight:900/.test(html),
   "watch.html carries the page-scoped .vf-brand wordmark CSS");
ok(/\.wk-band\{[^}]*border-left:4px solid var\(--gold\)/.test(html),
   "watch.html carries the page-scoped .wk-band spotlight CSS");
ok(/id="weekend-spotlight"[^>]*data-start="2026-10-02"[^>]*data-end="2026-10-05"[^>]*hidden/.test(html) ||
   /id="weekend-spotlight"[^>]*hidden/.test(html) && html.indexOf('data-start="2026-10-02"') >= 0,
   "spotlight band ships hidden with the Oct 2-5 window in data attributes");
var band = html.slice(html.indexOf('id="weekend-spotlight"'));
band = band.slice(0, band.indexOf("</section>"));
ok(band.indexOf("This band shows Oct 2–5 only, then hides itself") >= 0,
   "band states its own expiry honestly in the copy");

/* the editorial claims are pinned to the real snapshot data, not typed by hand */
var mlb = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-mlb.json"), "utf8"));
var g1 = mlb.games.filter(function(g){ return /^Game 2:/.test(g.title); })
                 .map(function(g){ return g.title.replace(/^Game 2:\s*/, ""); });
ok(g1.length >= 4, "kalshi-mlb.json carries the Division Series Game 2s (" + g1.length + " found)");
g1.forEach(function(pairing){
  ok(band.indexOf(pairing) >= 0,
     "spotlight names the real Game 2 pairing: " + pairing);
});
var nfl = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-nfl.json"), "utf8"));
ok(band.indexOf(nfl.games.length + "-game") >= 0,
   "spotlight's Week 5 game count matches the Kalshi NFL snapshot (" + nfl.games.length + " games)");
["UUoLrcjPV5PbUrUyXq5mjc_A", "UUiio0ydw439X13KyZgMIcHw", "UUvQrivswRDGK0lZ_AcUHp8g"].forEach(function(id){
  ok(band.indexOf("list=" + id) >= 0, "spotlight links the real playlist " + id);
});
ok(band.indexOf('href="markets.html"') >= 0, "spotlight links the markets page for Kalshi prices");
var ytFrames = (html.match(/<iframe[^>]*youtube\.com\/embed\//g) || []).length;
ok(ytFrames === 7, "watch.html still embeds exactly 7 youtube players (NFL card stays a link, no embed)");

console.log("\n" + (fails ? fails + " FAILURES (" + n + " checks)" : "ALL " + n + " CHECKS PASSED"));
process.exit(fails ? 1 : 0);
