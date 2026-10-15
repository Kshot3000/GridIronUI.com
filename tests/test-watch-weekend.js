/* GridIronUI — watch page weekend pass (v1.148.0).
   Branded per-outlet posters (W.OUTLETS lookup keyed by the uploads-playlist
   list id, outlet accent hue on the poster button) and the date-gated
   #weekend-spotlight band (shown only inside its data-start/data-end window,
   removes itself outside it). Also pins the editorial claims in the spotlight
   against the real data files so the copy can never drift from the snapshot:
   the LCS Game 3/4 pairings and the if-needed Game 5 come from
   data/kalshi-mlb.json and the Week 7 game count from data/kalshi-nfl.json.
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
ok(/id="weekend-spotlight"[^>]*data-start="2026-10-13"[^>]*data-end="2026-10-19"[^>]*hidden/.test(html) ||
   /id="weekend-spotlight"[^>]*hidden/.test(html) && html.indexOf('data-start="2026-10-13"') >= 0,
   "spotlight band ships hidden with the Oct 13-19 window in data attributes");
var band = html.slice(html.indexOf('id="weekend-spotlight"'));
band = band.slice(0, band.indexOf("</section>"));
ok(band.indexOf("This band shows Oct 13–19 only, then hides itself") >= 0,
   "band states its own expiry honestly in the copy");

/* the editorial claims are pinned to the real snapshot data, not typed by hand */
var mlb = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-mlb.json"), "utf8"));
var g1 = mlb.games.filter(function(g){ return /^Game [34]:/.test(g.title); })
                 .map(function(g){ return g.title.replace(/^Game [34]:\s*/, ""); });
/* Floor follows the snapshot, per the established pin discipline: when the
   previous band shipped (Oct 7 snapshot) all four Division Series Game 3/4s
   were on the board; as those games went Final they dropped out (Oct 8: 3,
   Oct 9: 2 — only the NLCS Games 3/4). The Oct 11 snapshot opened the
   Championship Series phase with 4 again, and the Oct 13 and Oct 14
   snapshots still carried 4: the NLCS Games 3/4 (Milwaukee vs Los Angeles D, twice) plus
   the ALCS Games 3/4 (Tampa Bay vs Cleveland, twice). The Oct 15 snapshot
   carries 3: Milwaukee won NLCS Game 3 in Los Angeles 6-2 (ESPN Final) to
   lead 3-0, so that game dropped out, leaving the ALCS Game 3 plus both
   Game 4s. So the floor drops to 3. The per-pairing loop below still
   requires every Game 3/4 the snapshot DOES carry to be named in the
   band, and the settled-fixture pins after the Game 2 loop require the
   band to stop listing the played games as fixtures. */
ok(g1.length >= 3, "kalshi-mlb.json carries Game 3s and 4s (" + g1.length + " found)");
g1.forEach(function(pairing){
  ok(band.indexOf(pairing) >= 0,
     "spotlight names the real Game 3/4 pairing: " + pairing);
});
/* The previous band named tonight's game — the ALCS Game 2 — but Tampa
   Bay won it 3-1 on Oct 13 (ESPN Final) to tie the series 1-1, so the
   Oct 14 snapshot carries no Game 2 at all: both LCS Game 2s are settled
   and gone. The pin inverts, like the Game 1 pin below: the band reports
   the Game 2 result as a result, never as a fixture. */
var lcs2 = mlb.games.filter(function(g){ return /^Game 2:/.test(g.title); })
                 .map(function(g){ return g.title.replace(/^Game 2:\s*/, ""); });
ok(lcs2.length === 0, "kalshi-mlb.json carries no Game 2 — both LCS Game 2s are settled (" + lcs2.length + " found)");
/* The LCS openers the previous band headlined are settled now — Milwaukee
   won NLCS Game 1 2-1 and Game 2 7-4, Cleveland won ALCS Game 1 7-3 (all
   ESPN Finals) — so the snapshot carries no Game 1 title at all and the
   band must not list any played game as a fixture anymore. NLCS Game 3
   joins the settled list in the Oct 15 snapshot: Milwaukee won it 6-2 in
   Los Angeles (ESPN Final) to lead 3-0, so its fixture title is banned
   from the copy too — the band reports it as a result, and the only
   Milwaukee vs Los Angeles D fixture left is Game 4. (The band may still
   report those results as results; what is pinned here is that their
   Kalshi fixture titles are gone from the copy.) The deciding DS
   Game 5 pin from the previous band stays for the same reason. */
var g1s = mlb.games.filter(function(g){ return /^Game 1:/.test(g.title); });
ok(g1s.length === 0, "kalshi-mlb.json carries no Game 1 — both LCS openers are settled (" + g1s.length + " found)");
ok(band.indexOf("Game 1: Los Angeles D vs Milwaukee") === -1 &&
   band.indexOf("Game 1: Cleveland vs Tampa Bay") === -1 &&
   band.indexOf("Game 2: Los Angeles D vs Milwaukee") === -1 &&
   band.indexOf("Game 2: Cleveland vs Tampa Bay") === -1 &&
   band.indexOf("Game 3: Milwaukee vs Los Angeles D") === -1,
   "spotlight no longer lists any settled LCS game as a fixture");
/* A Game 5 is back on the board — but it is the ALCS's if-needed game,
   newly listed in the Oct 14 snapshot (Tampa Bay vs Cleveland), not the
   settled Division Series decider. Pin both facts: the snapshot carries
   exactly that one Game 5 and the band names its full fixture title,
   while the DS decider stays gone from the copy. */
var g5 = mlb.games.filter(function(g){ return /^Game 5:/.test(g.title); })
                 .map(function(g){ return g.title; });
ok(g5.length === 1, "kalshi-mlb.json carries exactly one Game 5 — the if-needed ALCS game (" + g5.length + " found)");
g5.forEach(function(title){
  ok(band.indexOf(title) >= 0,
     "spotlight names the real if-needed Game 5 fixture: " + title);
});
ok(band.indexOf("Game 5: Chicago WS vs Cleveland") === -1,
   "spotlight no longer lists the settled DS Game 5 as a fixture");
var nfl = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-nfl.json"), "utf8"));
/* The band's count is the Week 7 slate listed in the snapshot — games
   occurring Oct 16-20Z (Thu Oct 15 night through Mon Oct 19 night, US
   time). Week 6 is fully settled (it closed Monday night, Buffalo 37-34
   at the LA Rams, ESPN Final) and every Week 6 game has dropped out of
   the snapshot, so the count is the full Week 7 slate: 14 at the Oct 13
   snapshot. The snapshot also carries Week 8 openers, so the pin derives
   the count from the same occurrence window the copy claims, not the
   raw length. */
var week7 = nfl.games.filter(function(g){
  return g.occ >= "2026-10-16T00:00:00Z" && g.occ < "2026-10-21T00:00:00Z";
});
ok(band.indexOf(week7.length + "-game") >= 0,
   "spotlight's Week 7 game count matches the Kalshi NFL snapshot (" + week7.length + " games in the Oct 16-20Z window)");
["UUoLrcjPV5PbUrUyXq5mjc_A", "UUiio0ydw439X13KyZgMIcHw", "UUvQrivswRDGK0lZ_AcUHp8g"].forEach(function(id){
  ok(band.indexOf("list=" + id) >= 0, "spotlight links the real playlist " + id);
});
ok(band.indexOf('href="markets.html"') >= 0, "spotlight links the markets page for Kalshi prices");
var ytFrames = (html.match(/<iframe[^>]*youtube\.com\/embed\//g) || []).length;
ok(ytFrames === 7, "watch.html still embeds exactly 7 youtube players (NFL card stays a link, no embed)");

console.log("\n" + (fails ? fails + " FAILURES (" + n + " checks)" : "ALL " + n + " CHECKS PASSED"));
process.exit(fails ? 1 : 0);
