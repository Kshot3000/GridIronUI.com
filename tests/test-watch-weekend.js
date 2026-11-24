/* GridIronUI — watch page weekend pass (v1.148.0).
   Branded per-outlet posters (W.OUTLETS lookup keyed by the uploads-playlist
   list id, outlet accent hue on the poster button) and the date-gated
   #weekend-spotlight band (shown only inside its data-start/data-end window,
   removes itself outside it). Also pins the editorial claims in the spotlight
   against the real data files so the copy can never drift from the snapshot:
   the World Series state comes from data/kalshi-mlb.json (empty since
   Milwaukee won the Series in Game 5 on Oct 28) and the Week 8/9 game
   counts from data/kalshi-nfl.json.
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
ok(/id="weekend-spotlight"[^>]*data-start="2026-11-24"[^>]*data-end="2026-11-30"[^>]*hidden/.test(html),
   "spotlight band ships hidden with the Nov 24-Nov 30 window in data attributes");
var band = html.slice(html.indexOf('id="weekend-spotlight"'));
band = band.slice(0, band.indexOf("</section>"));
ok(band.indexOf("This band shows Nov 24–Nov 30 only, then hides itself") >= 0,
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
   carried 3 after Milwaukee won NLCS Game 3. The Oct 16 snapshot carries
   just 1: Milwaukee won NLCS Game 4 in Los Angeles 6-4 (ESPN Final) to
   sweep the NLCS 4-0, and Cleveland won ALCS Game 3 at home 3-2 (ESPN
   Final) to lead 2-1, so both games dropped out, leaving only the ALCS
   Game 4. So the floor drops to 1. The Oct 17 snapshot still carries
   just that 1: ALCS Game 4 was postponed Friday for rain (ESPN
   Postponed, "ALCS - Game 4 Rain") — no result, the series still stands
   2-1 — and Kalshi keeps the same event, re-dated to tonight (Sat
   Oct 17 US, sub_title "TB vs CLE (Oct 17)"), so the floor stays 1 and
   the band must report the postponement, never a Friday result (the
   postponement pin after the Game 5 loop). The per-pairing loop below still
   requires every Game 3/4 the snapshot DOES carry to be named in the
   band, and the settled-fixture pins after the Game 2 loop require the
   band to stop listing the played games as fixtures. The Oct 18 snapshot
   carries none at all: the re-dated Game 4 was played Saturday night and
   Tampa Bay won it 7-3 in Cleveland (Reuters / USA Today Final) to tie
   the ALCS 2-2, so it dropped out alongside the already-settled Game 3,
   leaving only Game 5 on the board. The floor therefore falls to exactly
   0 — the pin inverts, like the Game 1 and Game 2 pins below: the
   snapshot must carry no Game 3/4 title and the band reports both games
   as results, never as fixtures. The Oct 20 snapshot opens the World
   Series phase: Tampa Bay won ALCS Game 6 in Tampa Bay 7-3 on Monday
   (Sportradar / USA Today Final) to beat Cleveland 4-2, so every LCS
   game is settled and gone, and the board instead carries the World
   Series Games 3/4 — both "Milwaukee vs Tampa Bay" (Game 3 Mon Oct 26
   and Game 4 Tue Oct 27, both in Tampa Bay). The count therefore rises
   to exactly 2 — both are World Series fixtures, not LCS games — and
   the per-pairing loop below requires the band to name the pairing
   (the band names both full fixture titles). The Oct 24 snapshot still
   carries exactly those two (Games 3/4 in Tampa Bay, Mon/Tue), so the
   count holds at exactly 2. The Oct 25 snapshot still carries exactly
   those two (Games 3/4 in Tampa Bay, Mon/Tue) after Game 2 settled, so
   the count holds at exactly 2. The Oct 26 snapshot holds that state
   on Game 3 day — Games 3/4 only, Game 3 tonight in Tampa Bay.
   The Oct 27 snapshot settles Game 3: Milwaukee won it 10-1 on
   Monday night in Tampa Bay (Sportradar / USA Today Final) to lead
   the Series 3-0, so Game 3 dropped out and only Game 4 remains —
   the count falls to exactly 1, Game 4 is tonight in Tampa Bay with
   Milwaukee one win from its first title, and Game 3's fixture
   title joins the settled ban list in the Game 1 block below.
   The Oct 28 snapshot settles Game 4: Tampa Bay won it 4-3 in 12
   innings on Tuesday night in Tampa Bay (Sportradar / Reuters /
   USA Today Final) to cut Milwaukee's lead to 3-1, so Game 4
   dropped out too and the count falls to exactly 0 — the pin
   inverts: the snapshot must carry no Game 3/4 title, Game 4's
   fixture title joins the settled ban list in the Game 1 block
   below, and the band reports Game 4 as a result (Pratt's 12th-
   inning homer answered by DeLuca's tying single and Williamson's
   walk-off), never as a fixture. The one fixture then on the
   board was Game 5, pinned in the Game 5 block below — and the
   Oct 29 snapshot settles Game 5 too (Milwaukee 4-1, champions),
   leaving the MLB board empty; see the Game 5 block. */
ok(g1.length === 0, "kalshi-mlb.json carries no Game 3/4 — World Series Game 4 is settled, Tampa Bay 4-3 in 12 innings (Final), and Game 3 settled Milwaukee 10-1 (Final) (" + g1.length + " found)");
g1.forEach(function(pairing){
  ok(band.indexOf(pairing) >= 0,
     "spotlight names the real Game 3/4 pairing: " + pairing);
});
/* The previous band named tonight's game — the ALCS Game 2 — but Tampa
   Bay won it 3-1 on Oct 13 (ESPN Final) to tie the series 1-1, so the
   Oct 14 snapshot carries no Game 2 at all: both LCS Game 2s are settled
   and gone. The pin inverts, like the Game 1 pin below: the band reports
   the Game 2 result as a result, never as a fixture. The Oct 20 snapshot
   carries exactly one Game 2 again — but it is the World Series Game 2
   (Tampa Bay vs Milwaukee, Sat Oct 24 in Milwaukee), not an LCS game:
   the pin flips back to naming the one real fixture's full title, and
   the settled-fixture ban below still bars both LCS Game 2 titles. The
   Oct 24 snapshot still carries exactly that one Game 2 — it is
   tonight's game in Milwaukee (Rasmussen vs Henderson) — so the pin
   holds unchanged. The Oct 25 snapshot settles it: Milwaukee rallied
   from 4-0 down to beat Tampa Bay 5-4 on Saturday night in Milwaukee
   (Sportradar / Reuters / USA Today Final) to lead the Series 2-0, so
   Game 2 dropped out and the pin inverts again — the snapshot carries
   no Game 2, its fixture title joins the ban list in the Game 1 block
   below, and the band reports it as a result, never as a fixture. */
var lcs2 = mlb.games.filter(function(g){ return /^Game 2:/.test(g.title); })
                 .map(function(g){ return g.title; });
ok(lcs2.length === 0, "kalshi-mlb.json carries no Game 2 — the World Series Game 2 is settled, Milwaukee 5-4 (Final) (" + lcs2.length + " found)");
/* The LCS openers the previous band headlined are settled now — Milwaukee
   won NLCS Game 1 2-1 and Game 2 7-4, Cleveland won ALCS Game 1 7-3 (all
   ESPN Finals) — so the snapshot carries no Game 1 title at all and the
   band must not list any played game as a fixture anymore. NLCS Game 3
   joined the settled list in the Oct 15 snapshot (Milwaukee 6-2), and
   two more join it in the Oct 16 snapshot: Milwaukee won NLCS Game 4
   6-4 in Los Angeles (ESPN Final) to sweep the series 4-0, and Cleveland
   won ALCS Game 3 3-2 at home (ESPN Final) to lead 2-1, so their fixture
   titles are banned from the copy too — the band reports them as
   results, and no Milwaukee vs Los Angeles D fixture is left at all.
   ALCS Game 4 joins the ban in the Oct 18 snapshot: postponed Friday
   for rain, played Saturday in Cleveland, Tampa Bay won 7-3 (Final) to
   tie the series 2-2, so its fixture title is banned too.
   (The band may still report those results as results; what is pinned
   here is that their Kalshi fixture titles are gone from the copy.) The
   deciding DS Game 5 pin from the previous band stays for the same reason.
   ALCS Games 5 and 6 join the settled list in the Oct 19/20 snapshots
   (Tampa Bay won Game 5 3-1 in Cleveland on Sunday and Game 6 7-3 at
   home on Monday, both Finals, to win the series 4-2), so their fixture
   titles are banned in the Game 5/6 pins below. The Oct 20 snapshot
   carries exactly one Game 1 again — the World Series opener (Tampa Bay
   vs Milwaukee, Fri Oct 23 in Milwaukee) — so this pin flips back to
   requiring the band to name that one fixture's full title, while the
   ban list right below still bars both LCS Game 1 titles. The Oct 24
   snapshot settles the opener: Milwaukee won Game 1 3-2 on Friday night
   in Milwaukee (Sportradar / Reuters / USA Today Final) to lead the
   Series 1-0, so Game 1 dropped out and the pin inverts again — the
   snapshot carries no Game 1, its fixture title joins the ban list
   below, and the band reports it as a result, never as a fixture. The
   Oct 25 snapshot holds that state (the band rolls to its Oct 25-Nov 2
   window with Game 1 still reported as Friday's 3-2 result). */
var g1s = mlb.games.filter(function(g){ return /^Game 1:/.test(g.title); })
                 .map(function(g){ return g.title; });
ok(g1s.length === 0, "kalshi-mlb.json carries no Game 1 — the World Series opener is settled, Milwaukee 3-2 (Final) (" + g1s.length + " found)");
ok(band.indexOf("Game 1: Tampa Bay vs Milwaukee") === -1 &&
   band.indexOf("Game 1: Los Angeles D vs Milwaukee") === -1 &&
   band.indexOf("Game 1: Cleveland vs Tampa Bay") === -1 &&
   band.indexOf("Game 2: Tampa Bay vs Milwaukee") === -1 &&
   band.indexOf("Game 2: Los Angeles D vs Milwaukee") === -1 &&
   band.indexOf("Game 2: Cleveland vs Tampa Bay") === -1 &&
   band.indexOf("Game 3: Milwaukee vs Tampa Bay") === -1 &&
   band.indexOf("Game 4: Milwaukee vs Tampa Bay") === -1 &&
   band.indexOf("Game 5: Milwaukee vs Tampa Bay") === -1 &&
   band.indexOf("Game 3: Milwaukee vs Los Angeles D") === -1 &&
   band.indexOf("Game 3: Tampa Bay vs Cleveland") === -1 &&
   band.indexOf("Game 4: Milwaukee vs Los Angeles D") === -1 &&
   band.indexOf("Game 4: Tampa Bay vs Cleveland") === -1,
   "spotlight no longer lists any settled LCS game as a fixture");
/* A Game 5 was on the board — the ALCS's Game 5 (Tampa Bay vs Cleveland,
   first listed in the Oct 14 snapshot), not the settled Division Series
   decider. With Cleveland leading 2-1 after Game 3, Game 5 was guaranteed
   (a best-of-seven needs four wins), so the band named it without the
   old if-needed label. The Oct 17 snapshot still carried exactly that
   one Game 5 (sub_title "TB vs CLE (Oct 18)"): with Game 4 rained out
   Friday, Game 5 followed on Sunday in Cleveland (ESPN Scheduled), so
   the band's Sunday framing was the honest one. The Oct 18 snapshot
   still carried exactly that one Game 5: Game 4 was played Saturday
   (Tampa Bay 7-3, Final, series tied 2-2) and dropped out, and Game 5
   was that day in Cleveland (5 p.m. ET, per the published ALCS
   schedule), so the band's today framing was the honest one. The
   Oct 19 snapshot settles it: Tampa Bay won Game 5 in Cleveland 3-1
   (Final) to lead the series 3-2, so Game 5 dropped out and the pin
   inverts like the Game 1/2/3/4 pins — the snapshot carries no Game 5
   and the band reports it as a result, never as a fixture. In its
   place the board carries exactly one Game 6 (Cleveland vs Tampa Bay,
   sub_title "CLE vs TB (Oct 19)"): the pennant can be decided tonight
   in Tampa Bay, so the band names its full fixture title, while the
   DS decider stays gone from the copy. The Oct 20 snapshot settles
   that too: Tampa Bay won Game 6 at home 7-3 on Monday (Sportradar /
   USA Today Final) to beat Cleveland 4-2 and win the pennant, so
   Game 6 dropped out, no Game 7 was ever needed or listed, and no
   World Series Game 5/6 is listed yet (Kalshi lists the if-needed
   games only as the Series reaches them, as in past rounds) — the
   Game 6 pin inverts like the others: the snapshot carries no Game 6
   at all and the band reports Game 6 as a result, never as a fixture.
   The Oct 25 snapshot holds that state even with Milwaukee up 2-0 in
   the World Series: no if-needed World Series Game 5 or 6 is listed
   yet, so both pins stay at exactly 0. The Oct 26 snapshot holds it
   too, on Game 3 day. The Oct 27 snapshot holds it again even with
   Milwaukee up 3-0 and a sweep possible tonight: no if-needed
   World Series Game 5 or 6 is listed yet, so both pins stay 0.
   The Oct 28 snapshot flips the Game 5 pin: Tampa Bay won Game 4
   4-3 in 12 innings on Tuesday night (Final) to stay alive at 3-1,
   so Game 5 is real and Kalshi lists exactly one — "Game 5:
   Milwaukee vs Tampa Bay" (sub_title "MIL vs TB (Oct 28)"), tonight
   in Tampa Bay with Misiorowski starting for Milwaukee and Tampa
   Bay's starter unannounced. The pin flips to exactly 1 and the
   band must name its full fixture title; the Game 6 pin below
   stays at 0 (Game 6 is listed only if Tampa Bay wins tonight).
   The Oct 29 snapshot settles it the other way: Milwaukee won
   Game 5 on Wednesday night 4-1 (Sportradar / Reuters / USA
   Today Final) to win the Series 4-1 and the first World Series
   title in franchise history — Misiorowski 5 2/3 scoreless
   innings, Pratt two hits and two RBIs, Contreras the Series
   MVP — so Game 5 dropped out, Kalshi's MLB board is EMPTY
   (0 games), the pin inverts to exactly 0 like every settled
   pin before it, Game 5's fixture title joins the ban list in
   the Game 1 block above, and the band reports the championship
   as a result (with the MVP line), never as a fixture. No Game 6
   was ever listed or needed; the Game 6 pin stays at 0. */
var g5 = mlb.games.filter(function(g){ return /^Game 5:/.test(g.title); })
                 .map(function(g){ return g.title; });
ok(g5.length === 0, "kalshi-mlb.json carries no Game 5 — World Series Game 5 is settled, Milwaukee 4-1 (Final) to win its first title 4-1, and the ALCS Game 5 settled long ago (" + g5.length + " found)");
g5.forEach(function(title){
  ok(band.indexOf(title) >= 0,
     "spotlight names the real Game 5 fixture: " + title);
});
ok(band.indexOf("won Game 5 4–1") >= 0 && band.indexOf("World Series MVP") >= 0 &&
   band.indexOf("no Games 6 or 7 are needed") >= 0,
   "spotlight reports the World Series championship as a result: Milwaukee won Game 5 4-1, Contreras MVP, no Games 6/7 needed");
ok(band.indexOf("Game 5: Tampa Bay vs Cleveland") === -1,
   "spotlight no longer lists the settled ALCS Game 5 as a fixture");
var g6 = mlb.games.filter(function(g){ return /^Game 6:/.test(g.title); })
                 .map(function(g){ return g.title; });
ok(g6.length === 0, "kalshi-mlb.json carries no Game 6 — the ALCS Game 6 is settled and no World Series Game 6 was ever listed or needed, Milwaukee having won the Series in five (" + g6.length + " found)");
ok(band.indexOf("Game 6: Cleveland vs Tampa Bay") === -1,
   "spotlight no longer lists the settled ALCS Game 6 as a fixture");
ok(band.indexOf("Game 5: Chicago WS vs Cleveland") === -1,
   "spotlight no longer lists the settled DS Game 5 as a fixture");
/* ALCS Game 4 produced no result on Friday Oct 16 US — ESPN lists it
   STATUS_POSTPONED with the note "ALCS - Game 4 Rain", and every ESPN
   ALCS scoreboard since still reads "CLE leads series 2-1". The band
   must say so plainly: a visitor who saw Friday's band ("tonight's
   game") must not be left thinking a game was played. Pin the honest
   framing so the copy can never silently drop it inside the window.
   (The game was then played Saturday: Tampa Bay won 7-3 to tie the
   series 2-2 — the band now reports both facts, the Friday
   postponement and the Saturday result.) */
ok(band.indexOf("postponed Friday for rain") >= 0,
   "spotlight reports ALCS Game 4's Friday rain postponement (ESPN Postponed), not a result");
var nfl = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-nfl.json"), "utf8"));
/* The band's count was the Week 7 slate still listed in the snapshot —
   games occurring Oct 16-20Z (Thu Oct 15 night through Mon Oct 19 night,
   US time). The full slate was 14 at the Oct 13 snapshot, but the opener
   settled: Denver beat Seattle 17-14 in overtime on Thursday night
   (ESPN Final) and that game dropped out of the snapshot, so the count
   in the window was the 13-game remainder the band named (the copy
   still called the full slate 14-game). The Oct 18 snapshot dropped
   one more: Houston beat Jacksonville 34-31 in London on Sunday morning
   (Final) and that game dropped out too, so the window count was the
   12-game remainder the band named. The Oct 19 snapshot closes Week 7:
   the Sunday slate is final and only tonight's closer (Washington at
   San Francisco, occ Oct 20T03:15Z) remains, which the band reports as
   the closer without a count. The count the band now names is Week 8's
   slate — games occurring Oct 22-27Z (Thu Oct 22 night in Chicago
   through Mon Oct 26 night in Philadelphia, US time) — so the pin
   derives the count from that occurrence window, not the raw length:
   the snapshot's 15 games are tonight's closer plus the 14-game
   Week 8 slate the band names. The Oct 20 snapshot settles the closer:
   San Francisco beat Washington 23-17 on Monday night (Reuters /
   NBC Sports Final), so that game dropped out, Week 7 is fully final,
   and the board now carries the same 14-game Week 8 slate plus the
   following 14-game slate (Oct 30-Nov 3Z) — 28 games in all. The pin
   still derives the count from the Oct 22-27Z window, so the band's
   14-game Week 8 claim stays pinned to the real slate. The Oct 23
   snapshot settles the opener: Chicago beat New England 30-24 on
   Thursday night at Soldier Field (Sportradar / USA Today / NBC
   Sports Final), so that game dropped out and the window count is
   now the 13-game remainder the band names (the copy still calls
   the full slate 14-game). The Oct 25 snapshot drops one more:
   Pittsburgh beat New Orleans 16-10 on Sunday morning in Paris
   (Sportradar / Reuters / USA Today Final — the NFL's first game in
   France; external sources label it Week 7, the site's slate calls
   it Week 8, the same naming split as the Chicago opener), so the
   window count is now the 12-game remainder the band names. The
   band's new Oct 25-Nov 2 window also names Week 9's slate — games
   occurring Oct 30-Nov 3Z (Thu Oct 29 night in Green Bay through
   Mon Nov 2 night in Seattle, US time) — so a second pin below
   derives that count from its occurrence window too: the Oct 25
   snapshot carries the full 14-game Week 9 slate. The Oct 26
   snapshot settles Sunday's 11 games — including Seattle's 20-3
   Sunday-night win over Kansas City (Reuters / Sportradar /
   USA Today Final, the Chiefs' first loss of the season) — so the
   Oct 22-27Z window count is now the 1-game remainder the band
   names: tonight's Monday-night closer, Dallas at Philadelphia.
   Week 9's window count holds at the full 14. The Oct 27 snapshot
   closes Week 8: Dallas beat Philadelphia 38-21 on Monday night
   (Sportradar / NBC Sports / Reuters / USA Today Final), so that
   closer dropped out and NO game remains in the Oct 22-27Z window.
   The pin inverts, following the Week 7 closer precedent: the
   snapshot count is pinned at exactly 0, the band reports Week 8
   as closed with the MNF result and names no Week 8 remainder
   count at all (a "0-game" claim would be nonsense copy), and the
   "-game" count the band does name is Week 9's, pinned below.
   The Oct 30 snapshot settles the Week 9 opener: Green Bay beat
   Carolina 27-19 on Thursday night at Lambeau Field (Sportradar /
   Reuters / USA Today Final — Jordan Love 288 yards and three
   touchdowns, Christian Watson 113 receiving yards despite a
   mid-game hospital trip, six sacks of Bryce Young; the champion
   Brewers were honored at Lambeau with the World Series trophy
   before the game), so that game dropped out and the Oct 30-Nov 3Z
   window count is now the 13-game remainder the band names — the
   generic pin below therefore requires "13-game" in the copy, and
   the explicit pin after it requires the band to report the opener
   as a result, never as a fixture left to play. External sources
   label this slate Week 8; the site's slate naming (Week 9, from
   its Oct 30-Nov 3Z occurrence window) is unchanged, the same
   naming split noted for the Paris game above. The Oct 31 snapshot
   holds that state exactly: no NFL game has been played since the
   Thursday opener (the Sunday slate is tomorrow, Nov 1 US), so the
   window count stays the 13-game remainder, the band copy is
   unchanged, and both pins below hold as written. (Friday's NCAAF
   finals — Dartmouth 24-14 over previously unbeaten Harvard, Tulane
   38-31 in overtime at Charlotte, Baylor 41-9 at UCF and Sacramento
   State 31-10 over Kent State, all Finals — dropped those four
   games out of the NCAAF snapshot; the band never carried them.)
   The Nov 1 snapshot (fetched 18:49Z, ahead of the Sunday slate's
   21:00Z kickoffs) holds the Week 9 state exactly again: no NFL
   game has been played since the Thursday opener, so the Oct
   30-Nov 3Z window count stays the 13-game remainder and the band
   copy is unchanged — both pins below hold as written. (Saturday's
   103-game NCAAF slate settled and dropped out of the NCAAF
   snapshot — headline Finals, USA Today / SI: No. 25 USC 30-18
   over No. 2 Ohio State, the Buckeyes without injured QB Julian
   Sayin; No. 1 Miami 38-35 at North Carolina after two Tar Heel
   onside recoveries were called back on penalties; No. 3 Georgia
   27-8 over No. 20 Florida; No. 4 Indiana 23-16 over Minnesota in
   overtime; No. 9 BYU 27-20 over Arizona State; No. 12 Ole Miss
   45-15 over Auburn; Syracuse 30-27 over No. 16 SMU — and 107 new
   games for the coming week arrived, slate head Ball St. vs UMass
   on Tuesday Nov 4. The band never carried any of them. The band's
   Oct 25-Nov 2 window expires after Monday night's closer: the
   next run on/after Nov 3 must roll the band to a new window with
   the Week 9 Sunday/Monday results or it removes itself.)
   The Nov 2 snapshot (fetched 18:49Z, ahead of tonight's Monday-
   night closer) settles Sunday's 12 games, so the Oct 30-Nov 3Z
   window count falls to the 1-game remainder — tonight's closer,
   Chicago at Seattle — and the band now reports Sunday's Finals
   and names that 1-game remainder, so both pins below hold as
   written. Headline: Washington beat Philadelphia 27-10 on Sunday
   night (NBC Sports / USA Today Final), scoring 27 unanswered
   points after trailing 10-0, Jayden Daniels 217 yards and a
   touchdown, Philadelphia's sixth straight loss. The rest of
   Sunday (all Finals, Sportradar / AP recaps): Cincinnati 43-36
   over Tennessee in overtime (Burrow five TD passes plus the
   winning OT rushing score), Arizona 33-30 at Dallas in overtime,
   Buffalo 36-10 over Baltimore, Denver 28-24 over Kansas City,
   Tampa Bay 16-0 over Atlanta, Jacksonville 42-7 over
   Indianapolis, Pittsburgh 27-6 over Cleveland, Rams 24-9 over
   the Chargers, Detroit 19-15 over Minnesota, New England 24-19
   at Miami, Las Vegas 38-33 over the Jets. External sources label
   this slate Week 8; the site's Week 9 naming is unchanged. The
   band's Oct 25-Nov 2 window expires after tonight's closer: the
   next run on/after Nov 3 MUST roll the band to a new window
   (Week 9 results plus the next slate opening Thu Nov 5 US,
   Jacksonville at Baltimore, occ Nov 6Z) or it removes itself.
   The Nov 3 snapshot (fetched 18:50Z) settles that closer:
   Chicago beat Seattle 34-17 on Monday night at Lumen Field
   (Sportradar / Reuters / NBC Sports / USA Today Final) —
   D'Andre Swift rushed for three second-half touchdowns,
   Caleb Williams was 24-of-34 for 247 yards and a touchdown
   as Chicago (6-2) won its third straight, Seattle pulled
   within 20-17 early in the fourth on Darnold's touchdown
   pass to Cooper Kupp plus a two-point conversion to Tory
   Horton before Chicago scored the final 14, and Darnold
   finished 17-of-34 for 188 yards with two touchdowns and
   an interception (Jaxon Smith-Njigba 6-118-1). The closer
   dropped out, so the Oct 30-Nov 3Z window count falls to
   exactly 0 — the Week 9 pin below INVERTS, following the
   Week 7/8 closer precedent: the band reports Week 9 as
   closed with the MNF result and names no Week 9 remainder
   count, and the "-game" count the band does name is the
   new slate's, pinned after it. The band rolls to a NEW
   Nov 3-Nov 9 window: Week 9 reported closed, and the new
   slate — games occurring Nov 6-10Z (Thu Nov 5 night in
   Baltimore through Mon Nov 9 night in Minnesota, US
   time), the site's Week 10 naming (external sources call
   the MNF slate Week 9) — is named at its full count from
   that window. External sources label the closer's slate
   Week 8; the site's Week 9 naming is unchanged. The same
   snapshot adds the following 14-game slate (Nov 13-17Z),
   outside the band's window and not named in the band. */
var week8 = nfl.games.filter(function(g){
  return g.occ >= "2026-10-22T00:00:00Z" && g.occ < "2026-10-28T00:00:00Z";
});
ok(week8.length === 0,
   "kalshi-nfl.json carries no Week 8 game — the slate closed with Dallas 38-21 at Philadelphia on Monday night (Final) (" + week8.length + " games in the Oct 22-27Z window)");
ok(band.indexOf("Week 8 closed Monday night") >= 0,
   "spotlight reports Week 8 as closed, with no remainder count");
var week9 = nfl.games.filter(function(g){
  return g.occ >= "2026-10-30T00:00:00Z" && g.occ < "2026-11-04T00:00:00Z";
});
ok(week9.length === 0,
   "kalshi-nfl.json carries no Week 9 game — the slate closed with Chicago 34-17 at Seattle on Monday night (Final) (" + week9.length + " games in the Oct 30-Nov 3Z window)");
ok(band.indexOf("Week 9 closed Monday night") >= 0,
   "spotlight reports Week 9 as closed, with no remainder count");
var week10 = nfl.games.filter(function(g){
  return g.occ >= "2026-11-06T00:00:00Z" && g.occ < "2026-11-11T00:00:00Z";
});
ok(week10.length === 0,
   "kalshi-nfl.json carries no Week 10 game — the slate closed with Buffalo 23-6 at Minnesota on Monday night (Final) (" + week10.length + " games in the Nov 6-10Z window)");
ok(band.indexOf("Week 10 closed Monday night") >= 0,
   "spotlight reports Week 10 as closed, with no remainder count (this pin held the dynamic Week 10 count while the slate was live; it inverts on the closer's settlement, following the Week 8/9 precedent above)");
ok(band.indexOf("Chicago beat Seattle 34–17 (Final)") >= 0 &&
   band.indexOf("three second-half touchdowns") >= 0 &&
   band.indexOf("Caleb Williams was 24-of-34 for 247 yards") >= 0,
   "spotlight reports the Week 9 closer as a result: Chicago beat Seattle 34-17 (Final), Swift three second-half TDs, Williams 247 yards (Reuters)");
ok(band.indexOf("Green Bay beat Carolina 27–19 (Final)") >= 0 &&
   band.indexOf("Jordan Love threw for 288 yards and three touchdowns") >= 0,
   "spotlight reports the Week 9 opener as a result: Green Bay beat Carolina 27-19 (Final), Love 288 yards and three touchdowns (Reuters)");
/* The Nov 4 snapshot (fetched 18:49Z NFL / 18:55Z NCAAF) settles
   Tuesday night's two MACtion games. Kalshi groups all five midweek
   MAC games at occ Nov 4 03:00Z, but the real schedule splits them
   2/3 (Sportradar / NCAA / Akron Beacon Journal): Buffalo at Miami
   (OH) and Ohio at Akron were Tuesday Nov 3 US, while Ball St. at
   UMass, Central Michigan vs Eastern Michigan (Ford Field, Detroit)
   and Toledo at Sacramento St. are Wednesday Nov 4 US. The snapshot
   confirms the split exactly — the two Tuesday event tickers dropped
   out and the three Wednesday games remain, now heading the board.
   Tuesday's Finals (both cross-checked): Buffalo rallied from 31-16
   down in the fourth quarter to beat Miami (OH) 34-31 in overtime
   (AP — Jason Wright 358 passing yards, four total touchdowns,
   Oliver Hautanen's 27-yard OT field goal won it after Miami's tying
   attempt hit the upright; Buffalo 6-3, fourth straight win), and
   Ohio beat Akron 28-20 (Akron Beacon Journal — Akron led 17-14 in
   the fourth; Nick Poulos hit Dom Dorwart for a 60-yard touchdown,
   Duncan Brune broke a 91-yard touchdown run and finished with 111
   yards on 10 carries; Ohio 7-2, 5-0 MAC, recovered Akron's onside
   kick with 1:53 left). The band (same Nov 3-Nov 9 window) now
   reports both as results and names tonight's three Wednesday
   fixtures; the stale "opens tonight, Tuesday Nov 3" framing is
   banned below. NFL state is unchanged: 29 games, the Week 10
   window (Nov 6-10Z) still holds the full 15-game slate above. */
var ncaaf = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "kalshi-ncaaf.json"), "utf8"));
var ncaafTickers = ncaaf.games.map(function(g){ return g.event_ticker; });
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV03BUFFMOH") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV03OHIOAKR") === -1,
   "kalshi-ncaaf.json settles Tuesday's MACtion pair (Buffalo/Miami OH, Ohio/Akron gone) — the Wednesday trio this pin kept on Nov 4 settled that night and is pinned as gone in the Nov 5 block below");
ok(band.indexOf("Buffalo rallied from 31–16 down") >= 0 &&
   band.indexOf("34–31 in overtime (Final)") >= 0 &&
   band.indexOf("Jason Wright threw for 358 yards") >= 0,
   "spotlight reports Tuesday's MACtion OT result: Buffalo rallied from 31-16 down to beat Miami (OH) 34-31 in overtime (Final), Wright 358 yards (AP)");
ok(band.indexOf("Ohio beat Akron 28–20 (Final)") >= 0 &&
   band.indexOf("91-yard touchdown run") >= 0 &&
   band.indexOf("5–0 in the MAC") >= 0,
   "spotlight reports Tuesday's other MACtion result: Ohio beat Akron 28-20 (Final), Brune 91-yard TD run, Ohio 5-0 in the MAC (Akron Beacon Journal)");
ok(band.indexOf("Wednesday night with three Finals") >= 0 &&
   band.indexOf("Central Michigan beat Eastern Michigan") >= 0 &&
   band.indexOf("Toledo beat Sacramento St.") >= 0,
   "spotlight now reports the Wednesday MACtion trio it named as fixtures on Nov 4 as Finals (detailed result pins in the Nov 5 block below)");
ok(band.indexOf("opens tonight, Tuesday Nov 3, with MACtion") === -1,
   "spotlight no longer frames the settled Tuesday MACtion slate as tonight's opener");
/* The Nov 5 snapshot (fetched 18:50Z NFL / 18:56Z NCAAF) settles
   Wednesday night's three MACtion games — the Wednesday trio the
   Nov 4 block kept now drops out, and tonight's Thursday trio
   (South Carolina St. vs Howard, James Madison vs Southern Miss,
   UTSA vs Florida Atlantic, all occ Nov 6Z) heads the board.
   Wednesday's Finals (all cross-checked): UMass beat Ball St.
   31-30 in overtime (RANT Sports / The Star Press — Ball St.
   scored first in OT on Bonds' 1-yard run but Boehm missed the
   extra point wide left; Watson ran in from 13 yards and Morris
   made the winner; Watson 302 passing yards, three total TDs;
   UMass 5-4, four-game losing streak snapped), Central Michigan
   beat Eastern Michigan 35-7 at Ford Field (Chat Sports /
   By The Belt — 35 unanswered points, Woodford 123 rushing
   yards and three TDs, EMU 4-6 avoided the shutout on Stuckey's
   6-yard TD pass to Mack with 10 seconds left), and Toledo beat
   Sacramento St. 20-17 at Hornet Stadium (Yahoo Sports / Covers
   — Toledo 7-2, 4-1 MAC trailed 10-7 at the half and scored 13
   in the second half; Miller 135 rushing yards, Ison 101 and a
   TD; Sacramento St.'s late TD cut it to three with 2:20 left).
   The snapshot also adds two Nov 18 MAC games (Akron vs UMass,
   Central Michigan vs Buffalo). NFL state is unchanged in shape:
   29 games, 12 moves, the Week 10 window (Nov 6-10Z) still holds
   the full 15-game slate and its Thursday opener (Jacksonville
   at Baltimore) is tonight — reported as a fixture, never a
   result. The band (same Nov 3-Nov 9 window) now reports all
   three Wednesday Finals and names tonight's Thursday trio; the
   stale "continues tonight, Wednesday Nov 4" framing is banned
   below. */
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV03BALLMASS") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV03CMUEMU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV03TOLSAC") === -1,
   "kalshi-ncaaf.json settles Wednesday's MACtion trio (Ball St./UMass, CMU/EMU, Toledo/Sacramento St. gone) — the Thursday trio this pin kept on Nov 5 settled that night and is pinned as gone in the Nov 6 block below");
ok(band.indexOf("UMass beat Ball St. 31–30 in overtime (Final)") >= 0 &&
   band.indexOf("William Watson III ran in from 13 yards") >= 0 &&
   band.indexOf("302 passing yards and three total touchdowns") >= 0,
   "spotlight reports Wednesday's MACtion OT result: UMass beat Ball St. 31-30 in overtime (Final), Watson 13-yard OT run and 302 passing yards (RANT Sports / Star Press)");
ok(band.indexOf("Central Michigan beat Eastern Michigan 35–7 (Final)") >= 0 &&
   band.indexOf("Nick Woodford ran for 123 yards and three touchdowns") >= 0 &&
   band.indexOf("35 unanswered points") >= 0,
   "spotlight reports Wednesday's Motor City MACtion result: Central Michigan beat Eastern Michigan 35-7 (Final) at Ford Field, Woodford 123 yards and three TDs (Chat Sports)");
ok(band.indexOf("Toledo beat Sacramento St. 20–17 (Final)") >= 0 &&
   band.indexOf("CJ Miller ran for 135 yards") >= 0 &&
   band.indexOf("4–1 in the MAC") >= 0,
   "spotlight reports Wednesday's other MACtion result: Toledo beat Sacramento St. 20-17 (Final), Miller 135 rushing yards, Toledo 4-1 in the MAC (Yahoo Sports)");
ok(band.indexOf("Thursday night with three Finals") >= 0 &&
   band.indexOf("South Carolina St. beat Howard") >= 0 &&
   band.indexOf("James Madison beat Southern Miss") >= 0 &&
   band.indexOf("Florida Atlantic beat UTSA") >= 0,
   "spotlight now reports the Thursday trio it named as fixtures on Nov 5 as Finals (detailed result pins in the Nov 6 block below)");
ok(band.indexOf("MACtion continues tonight, Wednesday Nov 4") === -1,
   "spotlight no longer frames the settled Wednesday MACtion slate as tonight's fixtures");
/* The Nov 6 snapshot (fetched 18:50Z NFL / 18:56Z NCAAF) settles
   Thursday night's Week 10 opener and Thursday's
   college trio — all four games the Nov 5 band named as fixtures
   now drop out, and tonight's Friday college quintet (Virginia
   Tech vs SMU, South Florida vs East Carolina, Nebraska vs
   Illinois, New Mexico vs Nevada, TCU vs Arizona, all occ Nov 7Z)
   heads the NCAAF board. Thursday's Finals (all cross-checked):
   Jacksonville beat Baltimore 33-10 (Reuters — Lawrence 242 yards
   and one TD, a 50-yard scoring pass to Washington just before
   halftime; Little four field goals; Tuten and Rodriguez Jr.
   rushing TDs; three forced turnovers and 227 total yards allowed;
   Jaguars 6-2, fifth win in six; Baltimore 4-5, fourth straight
   loss, Jackson (right thumb) and Huntley (right toe) injured,
   rookie Fagnano's first start, Hill's 65-yard run the only TD),
   South Carolina St. beat Howard 35-28 (South Carolina State
   Athletics — Brown season-high 143 rushing yards and two TDs,
   the winner from 9 yards with 17 seconds left capping a
   seven-play, 74-yard drive after Howard tied it at 28 with 1:31
   left; SC St. 8-2, 3-0 MEAC, MEAC streak 13), James Madison beat
   Southern Miss 54-23 (AP — Evans four total TDs, three rushing
   and one passing, 251 passing yards in his first start since the
   opener; JMU 8-2, 5-2 Sun Belt, 38 second-half points; Southern
   Miss 3-6, White 266 yards in his first start), and Florida
   Atlantic beat UTSA 60-29 (Palm Beach Post / UTSA Athletics —
   Messer four TDs, three receiving and one passing, eight catches
   for 85 yards and 12 TDs in his last three games; FAU 6-3, 3-2
   American, 339 rushing yards, bowl-eligible for the first time
   since 2020, snapped UTSA's five-game winning streak; UTSA 7-2).
   NFL state: 28 games, 9 moves, 0 new — the Week 10 window
   (Nov 6-10Z) falls to the 14-game remainder pinned dynamically
   above. NCAAF state: 253 games, 195 moves, 3 new (Nov 19:
   Northwestern St. vs Stephen F. Austin, Southeastern Louisiana
   vs Nicholls St., Rice vs Temple). The band (same Nov 3-Nov 9
   window) now reports all four
   Thursday Finals and names tonight's Friday quintet; the stale
   Thursday-fixture framing is banned below. */
var nflTickers = nfl.games.map(function(g){ return g.event_ticker; });
ok(nflTickers.indexOf("KXNFLGAME-26NOV05JACBAL") === -1,
   "kalshi-nfl.json settles the Week 10 opener (Jacksonville at Baltimore gone) — Jacksonville won 33-10 (Final)");
ok(band.indexOf("Jacksonville beat Baltimore 33–10 (Final)") >= 0 &&
   band.indexOf("Trevor Lawrence passed for 242 yards and a touchdown") >= 0 &&
   band.indexOf("Cam Little kicked four field goals") >= 0,
   "spotlight reports the Week 10 opener as a result: Jacksonville beat Baltimore 33-10 (Final), Lawrence 242 yards and a TD, Little four field goals (Reuters)");
ok(band.indexOf("held Baltimore to 227 total yards") >= 0 &&
   band.indexOf("Justice Hill's 65-yard run") >= 0 &&
   band.indexOf("rookie Joe Fagnano made his first NFL start") >= 0,
   "spotlight reports the opener detail: Jacksonville held Baltimore to 227 yards, Fagnano's first start, Hill's 65-yard run Baltimore's only TD (Reuters)");
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV05SCSTHOW") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV05JMUUSM") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV05UTSAFAU") === -1,
   "kalshi-ncaaf.json settles Thursday's trio (SC St./Howard, JMU/Southern Miss, UTSA/FAU gone) — the Friday quintet this pin kept on Nov 6 settled that night and is pinned as gone in the Nov 7 block below");
ok(band.indexOf("South Carolina St. beat Howard 35–28 (Final)") >= 0 &&
   band.indexOf("Ricorian Brown ran for a season-high 143 yards and two touchdowns") >= 0 &&
   band.indexOf("17 seconds left") >= 0,
   "spotlight reports Thursday's MEAC result: South Carolina St. beat Howard 35-28 (Final), Brown 143 yards and two TDs including the winner with 17 seconds left (South Carolina State Athletics)");
ok(band.indexOf("James Madison beat Southern Miss 54–23 (Final)") >= 0 &&
   band.indexOf("JC Evans accounted for four touchdowns") >= 0 &&
   band.indexOf("throwing for 251 yards") >= 0,
   "spotlight reports Thursday's Sun Belt result: James Madison beat Southern Miss 54-23 (Final), Evans four total TDs and 251 passing yards (AP)");
ok(band.indexOf("Florida Atlantic beat UTSA 60–29 (Final)") >= 0 &&
   band.indexOf("Easton Messer scored four touchdowns") >= 0 &&
   band.indexOf("12 touchdowns in his last three games") >= 0,
   "spotlight reports Thursday's American result: Florida Atlantic beat UTSA 60-29 (Final), Messer four TDs and 12 in his last three games (Palm Beach Post)");
ok(band.indexOf("Friday night with five Finals") >= 0 &&
   band.indexOf("SMU beat Virginia Tech") >= 0 &&
   band.indexOf("East Carolina beat South Florida") >= 0 &&
   band.indexOf("Illinois beat Nebraska") >= 0 &&
   band.indexOf("New Mexico beat Nevada") >= 0 &&
   band.indexOf("Arizona beat TCU") >= 0,
   "spotlight now reports the Friday quintet it named as fixtures on Nov 6 as Finals (detailed result pins in the Nov 7 block below)");
ok(band.indexOf("College football continues tonight, Thursday Nov 5") === -1 &&
   band.indexOf("15-game") === -1 &&
   band.indexOf("opens Thursday night, Nov 5, in Baltimore (Jacksonville at Baltimore)") === -1,
   "spotlight no longer frames the settled Thursday opener or Thursday college trio as tonight's fixtures, and no longer counts the full 15-game Week 10 slate");
/* The Nov 7 snapshot (fetched 18:49Z NFL / 18:54Z NCAAF) settles
   Friday night's college quintet — all five games the Nov 6 band
   named as fixtures now drop out, and today's Saturday slate
   (85 games occ Nov 7Z, headed by BYU vs Utah) takes over the
   NCAAF board. Friday's Finals (all cross-checked): SMU beat
   Virginia Tech 51-28 (AP — Jennings 350 yards and four TDs,
   three to Knight, SMU scored on its first eight drives and
   piled up 569 yards; SMU 7-2, 5-2 ACC; Virginia Tech 6-3),
   East Carolina beat South Florida 20-17 (247Sports / USF
   Athletics — Conrad's 55-yard field goal as time expired;
   ECU 5-4, 3-2 American, fourth straight win over USF; USF
   6-3), Illinois beat Nebraska 24-13 (AP — Dixon two TD catches
   from Houser including the record-breaking score for the most
   single-season receiving TDs in Illinois history; Illinois
   6-3, 4-2 Big Ten, bowl-eligible on a fourth straight win;
   Nebraska 5-4, fourth straight loss, Colandrea season-high
   284 passing yards), New Mexico beat Nevada 31-3 (AP — the
   No. 22 Lobos won the first game in the AP poll in school
   history; Humphrey 107 yards and two TDs; New Mexico 8-1,
   5-0 Mountain West, held Nevada to minus-9 rushing yards and
   97 total yards; Nevada 3-6), and Arizona beat TCU 29-28
   (Arizona Sports / USA Today — No. 22 Arizona trailed 28-20
   with 6:35 left; Fifita 24-of-37 for 313 yards and two TDs,
   the Craig TD with 1:43 left, the failed two-point try,
   Watson's recovered pooch onside kick, Salgado-Medina's
   37-yard field goal with 38 seconds left, Boss's sealing
   interception; Arizona 7-2, 4-2 Big 12; TCU 4-5). NFL state:
   28 games, 4 moves, 0 new — the Week 10 window (Nov 6-10Z)
   stays the 14-game remainder pinned dynamically above, Sunday
   head Cincinnati vs Atlanta. NCAAF state: 271 games, 280
   moves, 23 new (Nov 20: Iowa St. vs UCF, Bowling Green vs
   Toledo, Clemson vs Duke, Oregon vs Michigan St., UTEP vs
   Air Force, New Mexico vs Wyoming; Nov 21: 17 FCS games).
   The band (same Nov 3-Nov 9 window) now reports all five
   Friday Finals and names today's Saturday slate; the stale
   Friday-fixture framing is banned below. */
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV06VTSMU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV06USFECU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV06NEBILL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV06UNMNEV") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV06TCUARIZ") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV07BYUUTAH") === -1,
   "kalshi-ncaaf.json settles Friday's quintet (Virginia Tech/SMU, South Florida/East Carolina, Nebraska/Illinois, New Mexico/Nevada, TCU/Arizona gone) — the Saturday slate this pin kept on Nov 7 (headed by BYU vs Utah) settled that day and is pinned as gone in the Nov 8 block below");
ok(band.indexOf("SMU beat Virginia Tech 51–28 (Final)") >= 0 &&
   band.indexOf("Kevin Jennings threw for 350 yards and four touchdowns") >= 0 &&
   band.indexOf("scored on each of its first eight drives") >= 0,
   "spotlight reports Friday's ACC result: SMU beat Virginia Tech 51-28 (Final), Jennings 350 yards and four TDs, scored on its first eight drives (AP)");
ok(band.indexOf("East Carolina beat South Florida 20–17 (Final)") >= 0 &&
   band.indexOf("Andrew Conrad kicked a 55-yard field goal as time expired") >= 0 &&
   band.indexOf("fourth straight time") >= 0,
   "spotlight reports Friday's American result: East Carolina beat South Florida 20-17 (Final) on Conrad's 55-yard field goal as time expired (247Sports / USF Athletics)");
ok(band.indexOf("Illinois beat Nebraska 24–13 (Final)") >= 0 &&
   band.indexOf("Collin Dixon caught two touchdown passes") >= 0 &&
   band.indexOf("most single-season receiving touchdowns in Illinois history") >= 0,
   "spotlight reports Friday's Big Ten result: Illinois beat Nebraska 24-13 (Final), Dixon two TD catches including the Illinois single-season record-breaker (AP)");
ok(band.indexOf("New Mexico beat Nevada 31–3 (Final)") >= 0 &&
   band.indexOf("first game in the AP poll in school history") >= 0 &&
   band.indexOf("minus-9 rushing yards and 97 total yards") >= 0,
   "spotlight reports Friday's Mountain West result: New Mexico beat Nevada 31-3 (Final) in the Lobos' first game in the AP poll in school history, Nevada held to minus-9 rushing yards (AP)");
ok(band.indexOf("Arizona beat TCU 29–28 (Final)") >= 0 &&
   band.indexOf("Michael Salgado-Medina kicked a 37-yard field goal with 38 seconds left") >= 0 &&
   band.indexOf("Tyrese Boss sealed it with an interception") >= 0,
   "spotlight reports Friday's Big 12 result: Arizona beat TCU 29-28 (Final) on Salgado-Medina's 37-yard field goal with 38 seconds left, Boss's interception sealing it (Arizona Sports / USA Today)");
ok(band.indexOf("Saturday slate is Final now too") >= 0 &&
   band.indexOf("Saturday slate takes over today, Nov 7") === -1,
   "spotlight now reports the Saturday slate it named as fixtures on Nov 7 as Finals (detailed result pins in the Nov 8 block below)");
ok(band.indexOf("College football continues tonight, Friday Nov 6") === -1 &&
   band.indexOf("Virginia Tech vs SMU, South Florida vs East Carolina") === -1,
   "spotlight no longer frames the settled Friday quintet as tonight's fixtures");
/* The Nov 8 snapshot (fetched 18:49Z NFL / 18:53Z NCAAF) settles
   Saturday's 85-game college slate and Sunday morning's Madrid
   NFL game — the four Saturday games the Nov 7 band named as
   fixtures drop out, as does Cincinnati vs Atlanta (occ Nov 8
   17:30Z, the 9:30 a.m. ET Madrid kickoff, already Final at the
   fetch). Saturday's Finals (all cross-checked): No. 3 Utah
   beat No. 9 BYU 28-20 in the Holy War at Rice-Eccles Stadium
   (AP / USA Today — Dampier four total TDs, 177 passing and
   two scores plus 87 rushing and two more for 264 yards of
   offense; BYU led 20-14 at the half and was shut out after it;
   Bachmeier four interceptions, the last in the end zone with
   two seconds left; Utah 9-0, 6-0 Big 12; BYU 7-2), No. 9
   Alabama beat No. 15 LSU 31-13 at Tiger Stadium (AP —
   Russell 206 yards and three TDs; LSU led 13-10 in the third
   before 21 unanswered Alabama points; LSU 6-3 outgained
   Alabama 457-285 but went 0-for-4 on fourth down), No. 7
   Texas beat No. 18 Missouri 34-20 at Faurot Field (247Sports
   / Missouri Athletics — Manning 28-of-38 for 297 yards and
   three TDs; Missouri 6-3 led 20-13 in the third before 21
   unanswered Texas points, the go-ahead score Manning's
   23-yard TD pass to Brown with 5:03 left; Texas 7-2), and
   No. 5 UCLA beat Minnesota 34-20 at Huntington Bank Stadium
   (UCLA Athletics / NBC Sports — Dieffenbach 303 yards and
   three TDs on eight completions, back-to-back 75-yard TD
   passes to Mizell breaking a 17-17 fourth-quarter tie; UCLA
   9-0, 6-0 Big Ten, first 9-0 start since 1998; Minnesota
   held to 296 yards). The Madrid Final (Sportradar / Athlon
   Sports / Bengals): Cincinnati beat Atlanta 34-17 at
   Santiago Bernabéu Stadium — Burrow 24-of-29 for 271 yards
   and three TD passes (two to Higgins, one to Chase) plus a
   rushing TD; Chase 142 receiving yards by halftime;
   Cincinnati 6-2, fourth straight win; Atlanta 3-6. NFL
   state: 27 games, 33 moves, 0 new — the Week 10 window
   (Nov 6-10Z) falls to the 13-game remainder pinned
   dynamically above, the rest of today's slate headed by
   Cleveland vs New Orleans at 21:00Z. NCAAF state: 256
   games, 244 moves, 95 new per the snapshot's new_games
   (96 by event-ticker set-diff — Chattanooga vs Alabama,
   Nov 21, is on the board but absent from new_games, a
   fetcher diff quirk noted in the run log, not in the copy);
   the board now heads with Tuesday Nov 10's MACtion trio
   (Kent St. vs Bowling Green, Ohio vs Miami (OH), Western
   Michigan vs Akron, occ Nov 11Z). The band (same Nov 3-Nov 9
   window) now reports all four Saturday Finals and the
   Madrid result, and names Tuesday's MACtion trio as the
   next slate; the stale Saturday-fixture framing and the
   14-game remainder count are banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV08CINATL") === -1,
   "kalshi-nfl.json settles the Madrid game (Cincinnati vs Atlanta gone) — Cincinnati won 34-17 (Final)");
ok(band.indexOf("Cincinnati beat Atlanta 34–17 (Final)") >= 0 &&
   band.indexOf("Santiago Bernabéu Stadium") >= 0 &&
   band.indexOf("Joe Burrow was 24-of-29 for 271 yards and three touchdown passes") >= 0,
   "spotlight reports the Madrid result: Cincinnati beat Atlanta 34-17 (Final) at Santiago Bernabéu, Burrow 24-of-29 for 271 yards and three TD passes (Sportradar / Athlon Sports)");
ok(band.indexOf("142 receiving yards by halftime") >= 0 &&
   band.indexOf("won its fourth straight") >= 0 &&
   band.indexOf("Atlanta fell to 3–6") >= 0,
   "spotlight reports the Madrid detail: Chase 142 receiving yards by halftime, Cincinnati's fourth straight win, Atlanta 3-6");
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV07BYUUTAH") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV07TEXMIZZ") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV07UCLAMINN") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV07ALALSU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV10KENTBGSU") === -1,
   "kalshi-ncaaf.json settles Saturday's marquee four (BYU/Utah, Texas/Missouri, UCLA/Minnesota, Alabama/LSU gone) — the Tuesday MACtion head this pin kept on Nov 8 (Kent St. vs Bowling Green) settled Tuesday night, Bowling Green won 33-28 (Final), and its settlement is pinned in the Nov 11 block below");
ok(band.indexOf("Utah beat No. 9 BYU 28–20 (Final)") >= 0 &&
   band.indexOf("Devon Dampier accounted for four touchdowns") >= 0 &&
   band.indexOf("Bear Bachmeier threw four interceptions") >= 0,
   "spotlight reports Saturday's Holy War result: No. 3 Utah beat No. 9 BYU 28-20 (Final), Dampier four total TDs, Bachmeier four interceptions (AP / USA Today)");
ok(band.indexOf("Alabama beat No. 15 LSU 31–13 (Final)") >= 0 &&
   band.indexOf("Keelon Russell threw for 206 yards and three touchdowns") >= 0 &&
   band.indexOf("0-for-4 on fourth down") >= 0,
   "spotlight reports Saturday's SEC result: No. 9 Alabama beat No. 15 LSU 31-13 (Final), Russell 206 yards and three TDs, LSU 0-for-4 on fourth down (AP)");
ok(band.indexOf("Texas beat No. 18 Missouri 34–20 (Final)") >= 0 &&
   band.indexOf("Arch Manning was 28-of-38 for 297 yards and three touchdowns") >= 0 &&
   band.indexOf("23-yard touchdown pass to Raleek Brown with 5:03 left") >= 0,
   "spotlight reports Saturday's other SEC result: No. 7 Texas beat No. 18 Missouri 34-20 (Final), Manning 297 yards and three TDs, go-ahead TD to Brown with 5:03 left (247Sports)");
ok(band.indexOf("UCLA beat Minnesota 34–20 (Final)") >= 0 &&
   band.indexOf("Ty Dieffenbach threw for 303 yards and three touchdowns on just eight completions") >= 0 &&
   band.indexOf("back-to-back 75-yard touchdown passes to Aidan Mizell") >= 0 &&
   band.indexOf("9–0 for the first time since 1998") >= 0,
   "spotlight reports Saturday's Big Ten result: No. 5 UCLA beat Minnesota 34-20 (Final), Dieffenbach 303 yards on eight completions with back-to-back 75-yard TDs to Mizell, first 9-0 start since 1998 (UCLA Athletics / NBC Sports)");
ok(band.indexOf("Tuesday MACtion is Final now too") >= 0 &&
   band.indexOf("Miami (OH) beat Ohio 34–17 (Final)") >= 0,
   "spotlight now reports the Tuesday Nov 10 MACtion slate it named as fixtures on Nov 8 as Finals (detailed result pins in the Nov 11 block below)");
ok(band.indexOf("Saturday slate takes over today, Nov 7") === -1 &&
   band.indexOf("BYU vs Utah, Texas vs Missouri, UCLA vs Minnesota, and Alabama vs LSU head the Kalshi NCAAF board") === -1,
   "spotlight no longer frames the settled Saturday slate as today's fixtures (the stale 14-game Week 10 remainder ban from this block is lifted in the Nov 9 block below: 14 games is now Week 11's real slate count, pinned dynamically there)");
/* The Nov 9 snapshot (fetched 18:50Z NFL / 18:51Z MLB /
   18:55Z NCAAF) settles Sunday's twelve remaining Week 10 games —
   every Sunday ticker the Nov 8 band named as the 13-game
   remainder except tonight's Monday closer (Buffalo at
   Minnesota, occ Nov 10Z) drops out. Sunday's Finals (all
   cross-checked): Chicago beat Tampa Bay 27-24 on Sunday night
   at Soldier Field (Reuters / AP — Tampa Bay forced five
   turnovers including the first four-interception game of
   Caleb Williams' career; Tampa Bay trailed 24-13 early in the
   fourth, Irving's second TD and Mayfield's two-point run tied
   it 24-24 with 2:51 left; Williams hit Loveland for 38 yards
   to the Tampa Bay 16 and Santos kicked a 38-yard field goal
   as time expired; Williams 22-of-37 for 279 yards and two
   TDs, Jaylon Johnson's pick-six; Bears 7-2, fourth straight;
   Mayfield 18-of-32 for 243 yards with two interceptions;
   Tampa Bay 3-6), Green Bay beat New England 45-27 (Providence
   Journal — Love 372 yards and three TDs), Houston routed the
   Los Angeles Chargers 44-22 (AP — Stroud's flu game: five TD
   passes, 21-of-35 for 384 yards; Chargers 0-8), San Francisco
   beat Las Vegas 38-17, Kansas City beat the New York Jets
   35-12, Dallas beat Indianapolis 27-23, New Orleans beat
   Cleveland 23-22, the New York Giants beat Philadelphia
   19-11, Denver beat Carolina 26-21, Detroit beat Miami 19-9,
   the Los Angeles Rams beat Washington 20-13, and Seattle beat
   Arizona 17-3 (Corner Wire / JAM scoreboard roundup). NFL
   state: 15 games, 23 moves, 0 new — the Week 10 window
   (Nov 6-10Z) falls to the 1-game remainder pinned dynamically
   above, and the Week 11 window (Nov 13-17Z) holds the full
   14-game slate pinned dynamically below. The band ROLLS to a
   new Nov 9-Nov 16 window: it reports all twelve Sunday
   Finals, names tonight's Week 10 closer and the Week 11
   slate (Thursday Nov 12 Washington at the New York Giants
   through Monday Nov 16 the Los Angeles Chargers at
   Baltimore, Sunday night Pittsburgh vs Cincinnati), and
   keeps Tuesday Nov 10's MACtion trio as the next college
   slate; the stale Sunday-fixture framing is banned below. */
["KXNFLGAME-26NOV08CLENO", "KXNFLGAME-26NOV08DALIND", "KXNFLGAME-26NOV08DENCAR",
 "KXNFLGAME-26NOV08DETMIA", "KXNFLGAME-26NOV08LARWAS", "KXNFLGAME-26NOV08NYGPHI",
 "KXNFLGAME-26NOV08NYJKC", "KXNFLGAME-26NOV08HOULAC", "KXNFLGAME-26NOV08ARISEA",
 "KXNFLGAME-26NOV08GBNE", "KXNFLGAME-26NOV08LVSF", "KXNFLGAME-26NOV08TBCHI"].forEach(function(t){
  ok(nflTickers.indexOf(t) === -1,
     "kalshi-nfl.json settles Sunday's Week 10 game (" + t + " gone)");
});
ok(nflTickers.indexOf("KXNFLGAME-26NOV09BUFMIN") === -1,
   "kalshi-nfl.json settles the Week 10 closer (Buffalo at Minnesota gone) — this pin kept the closer on the Nov 9 board; Buffalo won 23-6 (Final) and the settlement is pinned in the Nov 10 block below");
var week11 = nfl.games.filter(function(g){
  return g.occ >= "2026-11-13T00:00:00Z" && g.occ < "2026-11-18T00:00:00Z";
});
ok(week11.length === 0 && band.indexOf("Week 11 closed Monday night") >= 0,
   "spotlight reports Week 11 as closed, with no remainder count (" + week11.length + " games left in the Nov 13-17Z window — this pin held the full 14-game slate while the week was unplayed, followed the remainder once the Thursday opener settled, per the Week 8/9 precedent above, fell 13 to 12 on Nov 15 and 12 to 1 on Nov 16, and inverts on the closer's settlement on Nov 17, following the Week 8/9/10 precedent: the Los Angeles Chargers beat Baltimore 23-20 (Final) on Monday night, pinned in the Nov 17 block below)");
ok(band.indexOf("Chicago beat Tampa Bay 27–24 (Final)") >= 0 &&
   band.indexOf("Cairo Santos kicked a 38-yard field goal as time expired") >= 0 &&
   band.indexOf("Colston Loveland for 38 yards") >= 0,
   "spotlight reports Sunday night's result: Chicago beat Tampa Bay 27-24 (Final), Loveland's 38-yard catch setting up Santos' 38-yard field goal as time expired (Reuters / AP)");
ok(band.indexOf("first four-interception game of Caleb Williams' career") >= 0 &&
   band.indexOf("Williams finished 22-of-37 for 279 yards and two touchdowns") >= 0 &&
   band.indexOf("Jaylon Johnson returned an interception for a touchdown") >= 0 &&
   band.indexOf("Mayfield was 18-of-32 for 243 yards with two interceptions") >= 0,
   "spotlight reports the SNF detail: Williams' first four-interception game, 22-of-37 for 279 yards and two TDs, Johnson's pick-six, Mayfield 18-of-32 for 243 yards (Reuters / AP)");
ok(band.indexOf("Bucky Irving's second touchdown") >= 0 &&
   band.indexOf("tied it 24–24 with 2:51 left") >= 0 &&
   band.indexOf("Tampa Bay fell to 3–6") >= 0,
   "spotlight reports the SNF comeback detail: Irving's second TD and the 24-24 tie with 2:51 left, Tampa Bay 3-6 (Reuters / AP)");
ok(band.indexOf("Green Bay beat New England 45–27 (Final)") >= 0 &&
   band.indexOf("Jordan Love's 372 passing yards and three touchdowns") >= 0 &&
   band.indexOf("Houston routed the Los Angeles Chargers 44–22 (Final)") >= 0 &&
   band.indexOf("five C.J. Stroud touchdown passes") >= 0 &&
   band.indexOf("21-of-35 for 384 yards") >= 0,
   "spotlight reports Sunday's other marquee Finals: Green Bay 45-27 New England (Love 372 yards, three TDs) and Houston 44-22 over the Chargers (Stroud five TD passes, 384 yards) (Providence Journal / AP)");
ok(band.indexOf("San Francisco beat Las Vegas 38–17 (Final)") >= 0 &&
   band.indexOf("Kansas City beat the New York Jets 35–12 (Final)") >= 0 &&
   band.indexOf("Seattle beat Arizona 17–3 (Final)") >= 0,
   "spotlight reports Sunday's remaining Finals list (San Francisco, Kansas City, Seattle among them) (Corner Wire)");
ok(band.indexOf("Buffalo beat Minnesota 23–6 (Final)") >= 0 &&
   band.indexOf("Washington beat the New York Giants 24–21 (Final)") >= 0 &&
   band.indexOf("Cincinnati beat Pittsburgh 38–18 on Sunday night (Final)") >= 0 &&
   band.indexOf("the Los Angeles Chargers beat Baltimore 23–20 (Final)") >= 0,
   "spotlight reports the Week 10 closer as a Final (Buffalo beat Minnesota 23-6; detailed pins in the Nov 10 block below — this pin named it as tonight's fixture on Nov 9) and the Week 11 opener as a Final too (Washington beat the New York Giants 24-21; detailed pins in the Nov 13 block below — this pin named it as Thursday's fixture on Nov 9), and now reports Sunday night's game as a Final too (Cincinnati beat Pittsburgh 38-18; detailed pins in the Nov 16 block below — this pin named it as Sunday's fixture on Nov 9), and the Week 11 closer as a Final too (the Los Angeles Chargers beat Baltimore 23-20; detailed pins in the Nov 17 block below — this pin named it as tonight's fixture on Nov 9)");
ok(band.indexOf("runs through today, Sunday, Nov 8") === -1 &&
   band.indexOf("Sunday night is Tampa Bay at Chicago") === -1,
   "spotlight no longer frames the settled Sunday slate as today's fixtures (the stale 13-game Week 10 remainder ban from this pin is lifted in the Nov 13 block below: 13 games is now Week 11's real remainder count after Thursday's opener settled, pinned dynamically above)");
/* The Nov 10 snapshot (fetched 18:51Z NFL / 18:51Z MLB /
   18:55Z NCAAF) settles Monday night's
   Week 10 closer — Buffalo at Minnesota (occ Nov 10Z) drops
   out and the NFL board becomes Week 11's 14-game slate plus
   Week 12's first 13 listed games (Thu Nov 19 Indianapolis at
   Houston through Mon Nov 23 Cincinnati at Washington). The
   MNF Final (cross-checked Sportradar / USA Today / DAZN /
   Democrat and Chronicle): Buffalo beat Minnesota 23-6 at
   U.S. Bank Stadium — Buffalo led 10-6 at the half and scored
   13 unanswered points after it; Allen 21-of-31 for 234 yards
   with a 25-yard TD pass to Keleki Latu (his first career
   score, 44 seconds left in the first half) and an
   interception, sacked four times; Cook 107 yards and a TD on
   31 carries, his 5-yard score capping a 15-play, 84-yard
   drive that ate 8:32 of the fourth quarter; Bass 3-for-3 on
   field goals including the 52-yarder with 4:40 left that set
   the final score; Buffalo's defense forced three turnovers,
   held Minnesota without a touchdown and to 0-for-8 on third
   down, outgained the Vikings 339-178 and held the ball for
   42:32; Wentz 8-of-25 for 81 yards with two interceptions
   and a lost fumble before Brosmer replaced him in the fourth
   quarter; Buffalo 7-1 with a fourth straight win, Minnesota
   6-2 with a second straight loss after a 6-0 start. NFL
   state: 27 games, 9 moves, 13 new. NCAAF state: 258 games,
   182 moves, 2 new (Nov 21: Texas A&M vs Oklahoma, LSU vs
   Tennessee) — tonight's Tuesday Nov 10 MACtion trio still
   heads the board. The band (same Nov 9-Nov
   16 window) now headlines the MNF result, reports Week 10 as
   closed, and keeps the Week 11 slate and tonight's Tuesday
   Nov 10 MACtion trio as the next slates; the stale MNF-fixture
   framing is banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV09BUFMIN") === -1,
   "kalshi-nfl.json settles Monday night's Week 10 closer (Buffalo at Minnesota gone) — Buffalo won 23-6 (Final)");
ok(band.indexOf("Washington stunned Cincinnati 22–20 on Monday night in Landover") >= 0 &&
   band.indexOf("Jayden Daniels drove 64 yards in the final 39 seconds and Drew Stevens' fifth field goal walked it off as time expired, snapping the Bengals' five-game winning streak and closing Week 12") >= 0,
   "spotlight headlines Monday night's walk-off: Washington stunned Cincinnati 22-20 in Landover, Daniels driving 64 yards in the final 39 seconds for Stevens' fifth field goal as time expired, snapping the Bengals' five-game winning streak and closing Week 12 (this pin held the Nov 23 San Francisco headline — San Francisco dismantled Minnesota 35-10 in Mexico City, Purdy's three TD passes hanging 35 points on the league's stingiest defense with the 49ers alone atop the NFC at 9-1 — which rolled to the Washington walk-off on Nov 24 when the band rolled to its Nov 24-Nov 30 window; the 49ers result stays pinned as a body result in the Nov 23 block below. This pin earlier held the Nov 22 Michigan headline — Michigan toppled unbeaten No. 4 UCLA 18-16 in triple overtime at the Big House, Underwood's two-point conversion pass to Hoffman winning it after the Bruins tied the game with 10 seconds left in regulation — which rolled to the 49ers rout on Nov 23; the Michigan result stays pinned as a body result in the Nov 22 block below, and the Nov 16 Burrow headline it replaced stays pinned there)");
ok(band.indexOf("Buffalo beat Minnesota 23–6 (Final)") >= 0 &&
   band.indexOf("Josh Allen was 21-of-31 for 234 yards") >= 0 &&
   band.indexOf("25-yard touchdown pass to Keleki Latu") >= 0 &&
   band.indexOf("first career score, with 44 seconds left in the first half") >= 0,
   "spotlight reports the MNF result: Buffalo beat Minnesota 23-6 (Final), Allen 21-of-31 for 234 yards with the 25-yard TD to Latu, his first career score with 44 seconds left in the first half (USA Today / DAZN)");
ok(band.indexOf("James Cook ran for 107 yards and a touchdown on 31 carries") >= 0 &&
   band.indexOf("15-play, 84-yard drive that ate 8:32 of the fourth quarter") >= 0 &&
   band.indexOf("52-yarder with 4:40 left that set the final score") >= 0,
   "spotlight reports the MNF ground detail: Cook 107 yards and a TD on 31 carries, the 15-play 84-yard drive eating 8:32, Bass's 52-yarder with 4:40 left setting the final score (DAZN / Democrat and Chronicle)");
ok(band.indexOf("held Minnesota without a touchdown and to 0-for-8 on third down") >= 0 &&
   band.indexOf("outgained the Vikings 339–178 while holding the ball for 42:32") >= 0 &&
   band.indexOf("Carson Wentz was 8-of-25 for 81 yards with two interceptions and a lost fumble") >= 0,
   "spotlight reports the MNF defensive detail: Minnesota held without a touchdown and to 0-for-8 on third down, outgained 339-178 with 42:32 possession, Wentz 8-of-25 for 81 yards with two interceptions and a lost fumble (Democrat and Chronicle)");
ok(band.indexOf("Buffalo (7–1) won its fourth straight") >= 0 &&
   band.indexOf("Minnesota (6–2) lost its second straight after a 6–0 start") >= 0 &&
   band.indexOf("Week 10 closed Monday night in Minneapolis") >= 0,
   "spotlight closes Week 10 with the records: Buffalo 7-1, fourth straight; Minnesota 6-2, second straight loss after a 6-0 start");
ok(band.indexOf("closes tonight, Monday night, Nov 9, with Buffalo at Minnesota") === -1 &&
   band.indexOf("1-game</strong> remainder") === -1,
   "spotlight no longer frames the settled MNF closer as tonight's fixture or counts the stale 1-game Week 10 remainder");
/* The Nov 11 snapshot (fetched 18:50Z NFL / 18:50Z MLB /
   18:54Z NCAAF) settles Tuesday night's MACtion trio — all
   three tickers drop out and tonight's Wednesday Nov 11 trio
   (Buffalo vs Ball St., UMass vs Toledo, Sacramento St. vs
   Central Michigan, all occ Nov 11 23:00Z) heads the board.
   Tuesday's Finals (all cross-checked): Miami (OH) beat Ohio
   34-17 in the 103rd Battle of the Bricks at Yager Stadium
   (Miami Athletics / Sportradar / SI / USA Today) — Ohio led
   17-0 in the second quarter before 34 unanswered Miami
   points: Smith's 15-yard WR-pass TD to Huggins with 1:02
   left in the half, Ohio's fake field goal broken up in the
   end zone before the break (after a Miami unsportsmanlike
   flag for the video-board graphic on the original kick
   try), Jones's 1-yard TD run in the third, Stidham's
   36-yard tying FG early in the fourth and his 25-yard
   go-ahead FG with 3:55 left, McCain's forced-and-recovered
   fumble on fourth down with 1:55 left, Jones's 48-yard TD
   on the next play and Knighten's 58-yard pick-six on the
   next snap; Bellisari (true freshman, off the bench for the
   injured Heavner) 99 passing yards, 64 rushing, no
   turnovers; Jones a career-high 115 yards and two TDs;
   Miami 6-4 (4-2 MAC), bowl-eligible, biggest comeback win
   since 2014; Ohio 7-3 (5-1), first MAC loss; crowd 17,156.
   Bowling Green beat Kent St. 33-28 at Doyt L. Perry Stadium
   (Kent State Athletics / Beacon Journal / Sportradar) —
   Kent St. rallied from 27-14 down in the fourth to lead
   28-27 on DeShields' 25-yard TD run with 2:34 left, but
   Amachree's 48-yard TD run with 1:51 left (two plays, nine
   seconds, 64 yards) reclaimed it; DeShields 19-of-38 for
   332 yards with two passing and two rushing TDs, Harris
   eight catches for 143 yards and two scores, Kent St.
   outgained Bowling Green 409-347 but fell to 3-7 (2-4) with
   its bowl hopes ended; Bowling Green 3-7 (3-3). Western
   Michigan beat Akron 42-14 at InfoCision Stadium (Western
   Michigan Athletics / Sportradar) — a season-high 566
   yards (360 rushing), possession 42:46; Lowry a perfect
   15-for-15 for 149 yards and a TD, Reynolds two TD passes
   to Levicki, Buckley 126 yards and two TDs, Cabana 107
   yards including an 82-yard TD run for the second straight
   game; Western Michigan 7-3 (5-1) stayed tied atop the
   MAC; Broughton's two TD passes to Williams were Akron's
   (1-9, 0-6) only scores. NFL state: 27 games, 25 moves, 0
   new — the board is unchanged (Week 11's 14-game slate
   plus Week 12's 13 listed games). NCAAF state: 257 games,
   169 moves, 2 new (Nov 24: Miami (OH) vs Western Michigan,
   Kent St. vs Eastern Michigan — the set-diff matches
   new_games exactly this run). The band (same Nov 9-Nov 16
   window) now headlines the Miami comeback, reports all
   three Tuesday Finals, and names tonight's Wednesday trio
   as the next slate; the stale Tuesday-fixture framing and
   the Nov 10 MNF headline are banned below. */
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV10KENTBGSU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV10OHIOMOH") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV10WMUAKR") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV11BUFFBALL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV11MASSTOL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV11SACCMU") === -1,
   "kalshi-ncaaf.json settles Tuesday's MACtion trio (Kent St./Bowling Green, Ohio/Miami (OH), Western Michigan/Akron gone) — the Wednesday trio this pin kept on Nov 11 (Buffalo vs Ball St., UMass vs Toledo, Sacramento St. vs Central Michigan) settled Wednesday night and its settlement is pinned in the Nov 12 block below");
ok(band.indexOf("Miami (OH) beat Ohio 34–17 (Final) in the 103rd Battle of the Bricks at Yager Stadium") >= 0 &&
   band.indexOf("Ohio led 17–0 in the second quarter, but Miami scored 34 unanswered points") >= 0 &&
   band.indexOf("Scoop Smith threw a 15-yard touchdown pass to Maleek Huggins with 1:02 left in the half") >= 0,
   "spotlight reports Tuesday's Battle of the Bricks result: Miami (OH) beat Ohio 34-17 (Final), 34 unanswered points after a 17-0 deficit, Smith's 15-yard WR-pass TD to Huggins with 1:02 left in the half (Miami Athletics)");
ok(band.indexOf("Ohio's fake field goal was broken up in the end zone before the break") >= 0 &&
   band.indexOf("video-board graphic shown during the original kick try (USA Today)") >= 0 &&
   band.indexOf("D'Shawntae Jones ran in from a yard out in the third quarter") >= 0,
   "spotlight reports the Bricks turning points: Ohio's fake field goal broken up in the end zone after Miami's video-board unsportsmanlike flag (USA Today), Jones's 1-yard third-quarter TD (Miami Athletics)");
ok(band.indexOf("Brady Stidham tied it with a 36-yard field goal early in the fourth") >= 0 &&
   band.indexOf("put Miami ahead for the first time, 20–17, with a 25-yarder with 3:55 left") >= 0 &&
   band.indexOf("Malcolm McCain forced and recovered a fumble on fourth down with 1:55 left") >= 0,
   "spotlight reports the Bricks finish: Stidham's 36-yard tying FG and 25-yard go-ahead FG with 3:55 left, McCain's forced-and-recovered fumble with 1:55 left (Miami Athletics)");
ok(band.indexOf("Jones raced 48 yards for a touchdown on the next play") >= 0 &&
   band.indexOf("Amariyun Knighten returned an interception 58 yards for a pick-six on Ohio's next snap") >= 0 &&
   band.indexOf("true freshman Drew Bellisari came off the bench for the injured Caleb Heavner and threw for 99 yards with 64 rushing yards and no turnovers") >= 0,
   "spotlight reports the Bricks exclamation points: Jones's 48-yard TD on the next play, Knighten's 58-yard pick-six on the next snap, freshman Bellisari 99 passing and 64 rushing yards with no turnovers off the bench (Miami Athletics)");
ok(band.indexOf("Jones finished with a career-high 115 yards and two touchdowns") >= 0 &&
   band.indexOf("Miami (6–4, 4–2 in the MAC) became bowl-eligible with its biggest comeback win since 2014") >= 0 &&
   band.indexOf("Ohio (7–3, 5–1) took its first MAC loss before a crowd of 17,156") >= 0,
   "spotlight closes the Bricks with the records: Jones a career-high 115 yards and two TDs, Miami 6-4 (4-2) bowl-eligible with its biggest comeback win since 2014, Ohio 7-3 (5-1) first MAC loss, crowd 17,156 (Miami Athletics)");
ok(band.indexOf("Bowling Green beat Kent St. 33–28 (Final) at Doyt L. Perry Stadium") >= 0 &&
   band.indexOf("Kent St. rallied from 27–14 down in the fourth quarter to lead 28–27 on Dru DeShields' 25-yard touchdown run with 2:34 left") >= 0 &&
   band.indexOf("Nakai Amachree answered with a 48-yard touchdown run with 1:51 left — two plays, nine seconds, 64 yards") >= 0,
   "spotlight reports Tuesday's other rally: Bowling Green beat Kent St. 33-28 (Final), DeShields' 25-yard TD run putting Kent St. ahead with 2:34 left before Amachree's 48-yard winner with 1:51 left — two plays, nine seconds, 64 yards (Kent State Athletics / Beacon Journal)");
ok(band.indexOf("DeShields finished 19-of-38 for 332 yards with two passing and two rushing touchdowns") >= 0 &&
   band.indexOf("Wayne Harris caught eight passes for 143 yards and two scores") >= 0 &&
   band.indexOf("Kent St. outgained Bowling Green 409–347 but fell to 3–7 (2–4 in the MAC)") >= 0 &&
   band.indexOf("Bowling Green is 3–7 (3–3)") >= 0,
   "spotlight reports the Kent St. detail: DeShields 19-of-38 for 332 yards with four total TDs, Harris 8-143-2, Kent St. outgained Bowling Green 409-347 but fell to 3-7 (2-4) with its bowl hopes ended, Bowling Green 3-7 (3-3) (Kent State Athletics)");
ok(band.indexOf("Western Michigan beat Akron 42–14 (Final) at InfoCision Stadium") >= 0 &&
   band.indexOf("season-high 566 yards, 360 of them rushing, and held the ball for 42:46") >= 0 &&
   band.indexOf("Broc Lowry was a perfect 15-for-15 for 149 yards and a touchdown") >= 0 &&
   band.indexOf("Mayson Reynolds threw two touchdown passes to Nate Levicki") >= 0,
   "spotlight reports Tuesday's rout: Western Michigan beat Akron 42-14 (Final), a season-high 566 yards (360 rushing) with 42:46 possession, Lowry a perfect 15-for-15 for 149 yards and a TD, Reynolds two TD passes to Levicki (Western Michigan Athletics)");
ok(band.indexOf("Jalen Buckley ran for 126 yards and two touchdowns") >= 0 &&
   band.indexOf("Cole Cabana added 107 yards including an 82-yard touchdown run for the second straight game") >= 0 &&
   band.indexOf("Western Michigan (7–3, 5–1 in the MAC) stayed tied atop the MAC") >= 0 &&
   band.indexOf("Cibastian Broughton threw two touchdown passes to Marcel Williams for Akron (1–9, 0–6)") >= 0,
   "spotlight reports the Western Michigan ground detail: Buckley 126 yards and two TDs, Cabana 107 yards including the 82-yard TD, Western Michigan 7-3 (5-1) tied atop the MAC, Broughton's two TD passes to Williams for Akron 1-9 (0-6) (Western Michigan Athletics)");
ok(band.indexOf("College football’s Wednesday MACtion is Final now too") >= 0 &&
   band.indexOf("Buffalo beat Ball St. 28–7 (Final)") >= 0 &&
   band.indexOf("Toledo shut out UMass 24–0 (Final)") >= 0 &&
   band.indexOf("Central Michigan beat Sacramento St. 28–7 (Final)") >= 0,
   "spotlight now reports the Wednesday Nov 11 MACtion slate it named as fixtures on Nov 11 as Finals (detailed result pins in the Nov 12 block below)");
ok(band.indexOf("opens Tuesday night, Nov 10, with MACtion") === -1 &&
   band.indexOf("Kent St. vs Bowling Green, Ohio vs Miami (OH), and Western Michigan vs Akron head the Kalshi NCAAF board") === -1 &&
   band.indexOf("Buffalo beat Minnesota 23–6 on Monday night — James Cook's") === -1,
   "spotlight no longer frames the settled Tuesday trio as tonight's fixtures and no longer carries the Nov 10 MNF headline (the MNF result itself stays in the body, pinned in the Nov 10 block above)");
/* The Nov 12 snapshot (fetched 18:50Z NFL / 18:50Z MLB /
   18:54Z NCAAF) settles Wednesday night's MACtion trio —
   all three tickers drop out and tonight's Thursday Nov 12
   pair (Memphis vs South Florida, occ Nov 13 04:00Z;
   Louisiana vs Louisiana-Monroe, occ Nov 13 05:00Z) heads
   the board. Wednesday's Finals (all cross-checked):
   Buffalo beat Ball St. 28-7 at Scheumann Stadium in Muncie
   (AP / The Star Press / Sportradar) — rain-soaked, kickoff
   delayed 15 minutes by weather; Ball State's only score
   was a blocked punt recovered in the end zone and its
   offense never scored; Burch a career-high 209 yards and
   two TDs on 31 carries (the 2-yard go-ahead TD with 3:10
   left in the third capping a 12-play, 79-yard drive that
   ate more than six minutes; a 67-yard run made him the
   12th player in Buffalo history to rush for 1,000 yards
   in a season), Shelton a career-high 92 yards and the
   final score, Buffalo 302 team rushing yards with Ball
   State held to 48 passing yards; the Cardinals drove
   inside Buffalo's 30 six times with no offensive point
   (Boehm missed all three field goals) and fell to 3-7
   (2-4) with bowl hopes ended for the fifth straight
   season; Buffalo 7-3 (5-1), a fifth straight win,
   bowl-eligible for the ninth time in program history, in
   a four-way tie atop the MAC (with Toledo, Ohio and
   Western Michigan); former Ball State head coach Pete
   Lembo is now 2-0 against his old team with the Bulls.
   Toledo shut out UMass 24-0 at the Glass Bowl (Toledo
   Athletics / UMass Athletics / Covers) — all 24 points in
   the first half: Walendzak's 69-yard Wildcat TD run
   (five plays, 90 yards) late in the first quarter in his
   return from injury, Griffith's 27-yard field goal and
   Thompson's 62-yard pick-six in the second quarter, and
   Walendzak's 17-yard TD catch from Richter with 1:51
   left in the half; Walendzak a career-high 117 rushing
   yards; Toledo 8-2 (5-1) outgained UMass 436-188 and
   never let UMass reach the red zone; UMass QB Watson
   left in the first quarter after re-injuring his ankle
   and did not return; UMass 5-5 (2-4); the shutout was
   Toledo's first in back-to-back seasons since 1992-93.
   Central Michigan beat Sacramento St. 28-7 at
   Kelly/Shorts Stadium in Mount Pleasant (Central
   Michigan Athletics / Sacramento State Athletics /
   Sportradar) — tied 7-7 on Ene's 37-yard TD run in the
   second quarter, then 21 unanswered CMU points behind
   319 rushing yards and four rushing TDs: Clerveaux a
   27-yard TD and 100 yards, Woodford 119 yards, Townsend
   a 40-yard TD capping a 97-yard drive (CMU's longest of
   the season) in the third quarter and a 6-yard TD with
   1:05 left; CMU 5-5 (3-3) ran 30 more plays, outgained
   Sacramento St. 424-211, held the ball nearly 40 minutes
   and moved within a win of bowl eligibility with a
   second straight win; Sacramento St. 2-9 (1-7) closed
   its first MAC season and gets 17 days off before its
   Nov 28 finale at Hawaii. NFL state: 27 games, 4 moves,
   0 new — the board is unchanged (Week 11's 14-game slate
   opens tonight, Thursday Nov 12, Washington at the New
   York Giants). NCAAF state: 254 games, 162 moves, 0 new.
   The band (same Nov 9-Nov 16 window) now headlines
   Burch's 209-yard night, reports all three Wednesday
   Finals, and names tonight's Thursday pair as the next
   slate; the stale Wednesday-fixture framing and the
   Nov 11 Miami headline are banned below. */
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV11BUFFBALL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV11MASSTOL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV11SACCMU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV12MEMUSF") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV12ULLULM") === -1,
   "kalshi-ncaaf.json settles Wednesday's MACtion trio (Buffalo/Ball St., UMass/Toledo, Sacramento St./Central Michigan gone) — the Thursday pair this pin kept on Nov 12 (Memphis vs South Florida, Louisiana vs Louisiana-Monroe) settled Thursday night and is pinned as gone in the Nov 13 block below; the Friday quartet that block headed settled Friday night and is pinned as gone in the Nov 14 block below");
ok(band.indexOf("Buffalo beat Ball St. 28–7 (Final) at Scheumann Stadium in Muncie") >= 0 &&
   band.indexOf("a brief weather delay pushed kickoff back 15 minutes on a rain-soaked night") >= 0 &&
   band.indexOf("Ball State scored first by recovering a blocked punt in the end zone, and its offense never scored at all") >= 0,
   "spotlight reports Wednesday's Muncie result: Buffalo beat Ball St. 28-7 (Final) at Scheumann Stadium, kickoff delayed 15 minutes by weather, Ball State's only score a blocked punt recovered in the end zone with zero offensive points (AP / The Star Press)");
ok(band.indexOf("Messiah Burch ran for a career-high 209 yards and two touchdowns on 31 carries") >= 0 &&
   band.indexOf("his 2-yard score with 3:10 left in the third quarter capped a 12-play, 79-yard drive that ate more than six minutes") >= 0 &&
   band.indexOf("a 67-yard run made him the 12th player in Buffalo history to rush for 1,000 yards in a season") >= 0,
   "spotlight reports the Burch detail: a career-high 209 yards and two TDs on 31 carries, the 2-yard go-ahead score with 3:10 left in the third capping a 12-play 79-yard drive, the 67-yarder making him Buffalo's 12th 1,000-yard rusher (AP)");
ok(band.indexOf("Shelton added a career-high 92 yards and the final score") >= 0 &&
   band.indexOf("Buffalo ran for 302 yards as a team and held Ball State to 48 passing yards") >= 0 &&
   band.indexOf("Buffalo (7–3, 5–1) won its fifth straight, became bowl-eligible for the ninth time in program history and joined a four-way tie atop the MAC") >= 0 &&
   band.indexOf("the Cardinals (3–7, 2–4 in the MAC) drove inside Buffalo’s 30 six times without an offensive point") >= 0,
   "spotlight closes Buffalo's win with the records: Shelton a career-high 92 yards, 302 team rushing yards with Ball State held to 48 passing yards, Buffalo 7-3 (5-1) with a fifth straight win and a four-way MAC tie, Ball State 3-7 (2-4) with six trips inside the 30 and no offensive point (The Star Press)");
ok(band.indexOf("Toledo shut out UMass 24–0 (Final) at the Glass Bowl") >= 0 &&
   band.indexOf("all 24 points came in the first half") >= 0 &&
   band.indexOf("Connor Walendzak, back from injury, opened the scoring late in the first quarter with a 69-yard touchdown run out of the Wildcat to finish a five-play, 90-yard drive") >= 0,
   "spotlight reports Wednesday's Glass Bowl shutout: Toledo beat UMass 24-0 (Final) with all 24 points in the first half, Walendzak's 69-yard Wildcat TD opening the scoring in his return from injury (Toledo Athletics)");
ok(band.indexOf("Nicholas Thompson returned an interception 62 yards for a touchdown") >= 0 &&
   band.indexOf("Walendzak caught a 17-yard scoring pass from John Alan Richter with 1:51 left in the half") >= 0 &&
   band.indexOf("Walendzak finished with a career-high 117 rushing yards") >= 0 &&
   band.indexOf("Toledo (8–2, 5–1) outgained UMass 436–188 and never let the Minutemen reach the red zone") >= 0,
   "spotlight reports the Toledo detail: Thompson's 62-yard pick-six, Walendzak's 17-yard TD catch with 1:51 left in the half and a career-high 117 rushing yards, Toledo 8-2 (5-1) outgaining UMass 436-188 with no red-zone trip allowed (Toledo Athletics / Covers)");
ok(band.indexOf("starting quarterback William “Pop” Watson III left in the first quarter after re-injuring his ankle and did not return") >= 0 &&
   band.indexOf("UMass fell to 5–5 (2–4)") >= 0 &&
   band.indexOf("the shutout gave Toledo one in back-to-back seasons for the first time since 1992–93") >= 0,
   "spotlight closes the shutout with the records: Watson out in the first quarter (ankle), UMass 5-5 (2-4), Toledo's first shutout in back-to-back seasons since 1992-93 (UMass Athletics / Toledo Athletics)");
ok(band.indexOf("Central Michigan beat Sacramento St. 28–7 (Final) at Kelly/Shorts Stadium in Mount Pleasant") >= 0 &&
   band.indexOf("after Ene’s 37-yard touchdown run tied it 7–7 in the second quarter, the Chippewas scored the final 21 points behind 319 rushing yards and four rushing touchdowns") >= 0 &&
   band.indexOf("Jayden Clerveaux opened the scoring with a 27-yard run and finished with 100 yards") >= 0 &&
   band.indexOf("Nick Woodford ran for 119 yards") >= 0,
   "spotlight reports Wednesday's Mount Pleasant result: Central Michigan beat Sacramento St. 28-7 (Final), 21 unanswered points after a 7-7 tie behind 319 rushing yards, Clerveaux 100 yards and Woodford 119 (Central Michigan Athletics)");
ok(band.indexOf("Brock Townsend capped a 97-yard drive — Central Michigan’s longest of the season — with a 40-yard touchdown in the third quarter before adding a 6-yard score with 1:05 left") >= 0 &&
   band.indexOf("Central Michigan (5–5, 3–3) ran 30 more plays than Sacramento St., outgained it 424–211") >= 0 &&
   band.indexOf("Sacramento St. (2–9, 1–7) closed its first MAC season and now gets 17 days off before its finale at Hawaii on Nov 28") >= 0,
   "spotlight reports the CMU finish: Townsend's 40-yard TD capping a 97-yard drive and his 6-yard score with 1:05 left, Central Michigan 5-5 (3-3) outgaining Sacramento St. 424-211, Sacramento St. 2-9 (1-7) done in the MAC until its Nov 28 finale at Hawaii (Sacramento State Athletics)");
ok(band.indexOf("College football continued Thursday night with two Finals") >= 0 &&
   band.indexOf("Memphis beat South Florida 52–41 (Final)") >= 0 &&
   band.indexOf("Louisiana beat Louisiana-Monroe 42–21 (Final)") >= 0,
   "spotlight now reports the Thursday Nov 12 pair it named as fixtures on Nov 12 as Finals (detailed result pins in the Nov 13 block below)");
ok(band.indexOf("opens tonight, Wednesday night, Nov 11, with MACtion") === -1 &&
   band.indexOf("Buffalo vs Ball St., UMass vs Toledo, and Sacramento St. vs Central Michigan head the Kalshi NCAAF board") === -1 &&
   band.indexOf("Miami (OH) scored 34 unanswered points to stun Ohio 34–17") === -1,
   "spotlight no longer frames the settled Wednesday trio as tonight's fixtures and no longer carries the Nov 11 Miami headline (the Miami result itself stays in the body, pinned in the Nov 11 block above)");
/* The Nov 13 snapshot (fetched 18:50Z NFL / 18:50Z MLB /
   18:56Z NCAAF) settles Thursday night's Week 11 opener —
   Washington at the New York Giants (occ Nov 13 04:15Z)
   drops out, leaving Week 11's 13-game remainder — and
   Thursday's college pair; tonight's Friday Nov 13 quartet
   (Florida St. vs Pittsburgh, Illinois vs UCLA, Southern
   Utah vs Portland St., Houston vs Colorado) heads the
   NCAAF board. Thursday's Finals (all cross-checked):
   Washington beat the New York Giants 24-21 at MetLife
   Stadium (Reuters / USA Today / ESPN) — New York led
   21-17 on McCarthy's 66-yard TD pass to Likely with 8:13
   left, but Daniels drove Washington 71 yards in 49
   seconds and hit Diggs for a 32-yard go-ahead TD with 57
   seconds left, and Douglas intercepted McCarthy at the
   Washington 11 with 25 seconds left to seal it; Daniels
   23-of-33 for 249 yards with three TDs and his first two
   interceptions of the season, Diggs six catches for 83
   yards, Skattebo 78 rushing yards and two TDs for New
   York, Likely nine catches for 127 yards; Washington
   3-5-1 took the head-to-head tiebreaker and stayed alive
   in the NFC East, the Giants fell to 5-3-1. Memphis beat
   South Florida 52-41 at Raymond James Stadium (Memphis
   Athletics / USF Athletics / Covers) — a 21-0 Memphis
   first-quarter lead behind Stokes' career-long 47-yard
   TD run (the longest scoring run by a Memphis QB in 30
   years), a 41-17 USF run and the Bulls' first lead,
   41-38, on Gramatica's 38-yard FG with 8:04 left, Stokes'
   76-yard TD pass to Davis two plays later with 7:34
   left, a fourth-and-goal stop from the 4 with under four
   minutes left, and Carter's second TD with 44 seconds
   left; Stokes 15-of-31 for 313 yards and three passing
   TDs with 73 rushing yards and two more scores (five
   total TDs for the third straight game), Davis 5-161 in
   his first 100-yard game, Carter 109 yards and the 10th
   1,000-yard rushing season in Memphis history;
   Kromenhoek 416 total yards for USF (271 passing and
   three TDs, a career-high 146 rushing yards on 30
   carries and another score), a USF season-best 552
   yards, 93 combined points and 1,133 combined yards,
   and a season-high seven Memphis sacks in its sixth
   straight win over the Bulls; Memphis 8-2 (5-1
   American), USF 6-4 (2-4). Louisiana beat
   Louisiana-Monroe 42-21 at FMOL Health | St. Francis
   Stadium in Monroe in the 62nd Battle on the Bayou
   (Louisiana Athletics / AP / The News Star) — ULM led
   14-7 in the second quarter before 28 unanswered
   Louisiana points: Wade's 8-yard TD run with 40 seconds
   left in the half tying it 14-14, Johnson's 18-yard
   fumble-return TD with 12:27 left in the third for the
   Cajuns' first lead, and Garner's TD runs of 19 and 18
   yards; Louisiana rushed for 274 yards behind Garner
   (104 yards on nine carries, a rushing TD for the
   seventh straight game) and Blanco (a career-high 113
   yards and the final 2-yard score with 1:57 left), the
   first Louisiana pair over 100 rushing yards in the
   same game since 2023, and the defense forced three
   turnovers with Johnson adding nine tackles and two
   fumble recoveries; Louisiana 7-3 (4-2 Sun Belt), a
   fourth straight win over its rival and its 16th in
   the last 19 meetings; ULM 2-8 (2-4), still winless at
   home. NFL state: 26 games, 4 moves, 0 new — Week 11's
   13-game remainder plus Week 12's 13 listed games.
   NCAAF state: 257 games, 162 moves, 5 new (Nov 26: TCU
   vs TTU; Nov 27: BUFF vs AKR, MSST vs MISS, NEB vs
   IOWA, TOL vs OHIO — the set-diff matches new_games
   exactly). The band (same Nov 9-Nov 16 window) now
   headlines the Daniels-to-Diggs winner, reports the
   TNF Final and both Thursday college Finals, and names
   tonight's Friday quartet as the next slate; the stale
   Thursday-fixture framing and the Nov 12 Burch headline
   are banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV12WASNYG") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV12MEMUSF") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV12ULLULM") === -1,
   "kalshi snapshots settle Thursday's Week 11 opener (Washington at the New York Giants gone) and Thursday's college pair (Memphis/South Florida, Louisiana/Louisiana-Monroe gone) — the Friday quartet this pin kept on Nov 13 (Florida St. vs Pittsburgh, Illinois vs UCLA, Southern Utah vs Portland St., Houston vs Colorado) settled Friday night and is pinned as gone in the Nov 14 block below");
ok(band.indexOf("Week 11 opened Thursday night at MetLife Stadium, where Washington beat the New York Giants 24–21 (Final)") >= 0 &&
   band.indexOf("New York led 21–17 after J.J. McCarthy hit Isaiah Likely for a 66-yard touchdown with 8:13 left") >= 0,
   "spotlight reports Thursday's TNF result: Washington beat the New York Giants 24-21 (Final) at MetLife after Likely's 66-yard TD put New York up 21-17 with 8:13 left (Reuters)");
ok(band.indexOf("Jayden Daniels drove Washington 71 yards in 49 seconds and found Stefon Diggs for a 32-yard go-ahead touchdown with 57 seconds left") >= 0 &&
   band.indexOf("Rasul Douglas intercepted McCarthy at the Washington 11 with 25 seconds left to seal it") >= 0,
   "spotlight reports the TNF finish: Daniels' 71-yard drive in 49 seconds to Diggs' 32-yard go-ahead TD with 57 seconds left, Douglas' interception at the Washington 11 with 25 seconds left (Reuters)");
ok(band.indexOf("Daniels finished 23-of-33 for 249 yards with three touchdowns and his first two interceptions of the season") >= 0 &&
   band.indexOf("Diggs caught six passes for 83 yards") >= 0 &&
   band.indexOf("Cam Skattebo ran for 78 yards and two touchdowns for the Giants") >= 0 &&
   band.indexOf("Likely caught nine passes for 127 yards") >= 0,
   "spotlight reports the TNF detail: Daniels 23-of-33 for 249 yards with three TDs and his first two interceptions, Diggs 6-83, Skattebo 78 yards and two TDs, Likely 9-127 (Reuters)");
ok(band.indexOf("Washington (3–5–1) took the head-to-head tiebreaker and stayed alive in the NFC East, while the Giants fell to 5–3–1 (Reuters)") >= 0 &&
   band.indexOf("Week 11's Sunday slate is Final now too") >= 0 &&
   band.indexOf("Week 11's remaining <strong>12-game</strong> slate is under way today, Sunday, Nov 15") === -1,
   "spotlight closes TNF with the records (Washington 3-5-1 with the tiebreaker, Giants 5-3-1) and now reports Week 11's Sunday slate as Final (detailed pins in the Nov 16 block below) — this pin named the 13-game remainder on Nov 13 and the 12-game remainder under way on Nov 15; both counts settled on Nov 16, pinned dynamically in the Nov 9 block above");
ok(band.indexOf("Memphis beat South Florida 52–41 (Final) at Raymond James Stadium in Tampa") >= 0 &&
   band.indexOf("raced to a 21–0 first-quarter lead behind Marcus Stokes' career-long 47-yard touchdown run, the longest scoring run by a Memphis quarterback in 30 years") >= 0,
   "spotlight reports Thursday's Tampa shootout: Memphis beat South Florida 52-41 (Final), a 21-0 first-quarter lead behind Stokes' career-long 47-yard TD run, the longest scoring run by a Memphis QB in 30 years (Memphis Athletics)");
ok(band.indexOf("South Florida answered with a 41–17 run and took its first lead, 41–38, on Nico Gramatica's 38-yard field goal with 8:04 left") >= 0 &&
   band.indexOf("Stokes answered two plays later with a 76-yard touchdown pass to Jemyri Davis with 7:34 left") >= 0 &&
   band.indexOf("the Tigers stopped the Bulls on fourth-and-goal from the 4 with under four minutes to play") >= 0 &&
   band.indexOf("Jaylin Carter sealed it with his second touchdown with 44 seconds left") >= 0,
   "spotlight reports the shootout swing: USF's 41-17 run to a 41-38 lead on Gramatica's 38-yard FG with 8:04 left, Stokes' 76-yard TD to Davis two plays later with 7:34 left, the fourth-and-goal stop from the 4, and Carter's sealing TD with 44 seconds left (USF Athletics / Memphis Athletics)");
ok(band.indexOf("Stokes finished 15-of-31 for 313 yards and three passing touchdowns with 73 rushing yards and two more scores — five total touchdowns for the third straight game") >= 0 &&
   band.indexOf("Davis caught five passes for 161 yards in his first 100-yard game") >= 0 &&
   band.indexOf("Carter ran for 109 yards to become the 10th player in Memphis history to rush for 1,000 yards in a season") >= 0,
   "spotlight reports the Memphis detail: Stokes 15-of-31 for 313 yards with five total TDs for the third straight game, Davis 5-161 in his first 100-yard game, Carter 109 yards and Memphis's 10th 1,000-yard rushing season (Memphis Athletics)");
ok(band.indexOf("Luke Kromenhoek posted 416 total yards for South Florida (271 passing yards and three touchdowns, a career-high 146 rushing yards on 30 carries and another score)") >= 0 &&
   band.indexOf("the Bulls (6–4, 2–4) piled up a season-best 552 yards in a game the teams combined for 93 points and 1,133 yards") >= 0 &&
   band.indexOf("Memphis recorded a season-high seven sacks in its sixth straight win over the Bulls (Memphis Athletics / USF Athletics)") >= 0,
   "spotlight reports the USF detail: Kromenhoek's 416 total yards (271 passing, a career-high 146 rushing on 30 carries), a season-best 552 USF yards in a 93-point, 1,133-yard game, and seven Memphis sacks in a sixth straight win over the Bulls (USF Athletics)");
ok(band.indexOf("Louisiana beat Louisiana-Monroe 42–21 (Final) at FMOL Health | St. Francis Stadium in Monroe in the 62nd Battle on the Bayou") >= 0 &&
   band.indexOf("ULM (2–8, 2–4 in the Sun Belt) led 14–7 in the second quarter, but Louisiana scored 28 unanswered points") >= 0 &&
   band.indexOf("KeDarius Wade's 8-yard touchdown run with 40 seconds left in the half tied it 14–14") >= 0 &&
   band.indexOf("Micah Johnson returned a fumble 18 yards for a touchdown with 12:27 left in the third quarter for the Cajuns' first lead") >= 0,
   "spotlight reports Thursday's Battle on the Bayou: Louisiana beat Louisiana-Monroe 42-21 (Final) in Monroe, 28 unanswered points after a 14-7 deficit — Wade's 8-yard TD tying it with 40 seconds left in the half and Johnson's 18-yard fumble-return TD for the first lead (Louisiana Athletics)");
ok(band.indexOf("JJ Garner ran for touchdowns of 19 and 18 yards") >= 0 &&
   band.indexOf("Louisiana (7–3, 4–2) rushed for 274 yards behind Garner (104 yards on nine carries, a rushing touchdown for the seventh straight game) and Steven Blanco (a career-high 113 yards and the final 2-yard score with 1:57 left)") >= 0 &&
   band.indexOf("the first Louisiana pair to top 100 rushing yards in the same game since 2023") >= 0 &&
   band.indexOf("its defense forced three turnovers as Johnson added nine tackles and two fumble recoveries") >= 0 &&
   band.indexOf("Louisiana's fourth straight win over its in-state rival and its 16th in the last 19 meetings, and ULM stayed winless at home (Louisiana Athletics / AP)") >= 0,
   "spotlight reports the Bayou detail: Garner's 19- and 18-yard TDs, Louisiana's 274 rushing yards behind Garner (104, a TD for the seventh straight game) and Blanco (a career-high 113 and the final score with 1:57 left) — the first Louisiana 100-yard pair since 2023 — three forced turnovers with Johnson's nine tackles and two recoveries, a fourth straight rivalry win and 16th in 19 meetings, ULM still winless at home (Louisiana Athletics / AP)");
ok(band.indexOf("Florida St. beat Pittsburgh 16–10 (Final)") >= 0 &&
   band.indexOf("UCLA beat Illinois 22–14 (Final)") >= 0 &&
   band.indexOf("Southern Utah beat Portland St. 23–21 (Final)") >= 0 &&
   band.indexOf("Colorado beat No. 14 Houston 42–32 (Final)") >= 0,
   "spotlight now reports the Friday Nov 13 quartet it named as fixtures on Nov 13 as Finals (detailed result pins in the Nov 14 block below)");
ok(band.indexOf("opens tonight, Thursday night, Nov 12") === -1 &&
   band.indexOf("Memphis vs South Florida and Louisiana vs Louisiana-Monroe head the Kalshi NCAAF board") === -1 &&
   band.indexOf("Messiah Burch ran for a career-high 209 yards in the Muncie rain") === -1 &&
   band.indexOf("slate opens Thursday night, Nov 12, with Washington at the New York Giants") === -1 &&
   band.indexOf("opens tonight, Friday night, Nov 13") === -1 &&
   band.indexOf("Jayden Daniels hit Stefon Diggs for a 32-yard touchdown with 57 seconds left as Washington rallied past the New York Giants 24–21 at MetLife — a season-saving") === -1,
   "spotlight no longer frames the settled Thursday pair or the settled TNF opener as tonight's fixtures and no longer carries the Nov 12 Burch headline (the Burch result itself stays in the body, pinned in the Nov 12 block above); the Friday-fixture framing and the Nov 13 Daniels headline are also banned here — they settled/rolled on Nov 14 and are pinned in the Nov 14 block below (the Daniels result itself stays in the body, pinned in the Nov 13 block above)");
/* The Nov 14 snapshot (fetched 18:50Z NFL / 18:50Z MLB /
   18:54Z NCAAF) settles Friday night's Nov 13 quartet —
   all four games drop out and today's Saturday Nov 14
   slate (117 games by Nov 14 ticker, headed by Bryant vs
   Sacred Heart at 20:00Z) heads the NCAAF board. Friday's
   Finals (all cross-checked): Florida St. beat Pittsburgh
   16-10 at Acrisure Stadium (Tallahassee Democrat / FSU
   Athletics) — FSU 5-5 (3-4 ACC), second straight road win,
   2-0 under interim Stockstill, one win from first bowl
   since 2023; Pitt 6-4 (3-4) led 7-6 at half on Dailey's
   11-yard TD to Turner, Kennedy's INT off a deflection off
   Diggis set up Thomas's 1-yard TD early in Q3, Panikowski
   3-for-3 on FGs (27, 37, 47) to move to 11-for-11, FSU
   defense 7 TFL / 2 sacks / 6 hurries, Pitt 5-of-16 on
   third and 1-of-4 on fourth; Dailey 16-of-34 for 157,
   Daniels 163 passing yards, FSU held to 260 total yards.
   No. 4 UCLA beat Illinois 22-14 at a rainy Rose Bowl
   (UCLA Athletics / Illinois Athletics) — UCLA 10-0 (7-0
   Big Ten), first 10-0 since 1998, matched program wins
   record; Illinois 6-4 (4-3) scoreless in first half,
   Feagin TD within 12-7 in Q3, Dixon's record 13th TD
   (7 yards) cut it to 19-14 with 7:14 left; Dieffenbach
   13-of-20 for 232 yards, 2 TDs, 1 INT, returned from
   elbow/ankle injuries for a Q4 TD to Morgan, Mizell
   6-176 career highs, Jackson 2 INTs (Big Ten-leading 5),
   UCLA defense 3 INTs (FBS-leading 20 INTs / 30 takeaways),
   Illinois held to 240 yards, Gobaira Q3 safety (first
   UCLA safety since 2022), Bhaghani FG after Jackson's
   second INT set 22-14. Southern Utah beat Portland St.
   23-21 at Hillsboro Stadium (SuperWest Sports / EIN
   Presswire) — SUU blew a 20-7 lead, Portland led 21-20
   late, Rogers' 33-yard FG with 17 seconds left won it;
   Burns 2 TD passes, Spjut TD + 79 receiving, Vance 11
   tackles, Malo INT; Thompson 169 rushing yards + TD,
   Helmstetler 11 stops, Portland outgained SUU 335-330,
   three lead changes. Colorado beat No. 14 Houston 42-32
   at Folsom Field (Colorado Athletics / Houston
   Athletics) — Colorado 4-6 (2-5 Big 12), trailed 20-7,
   28 unanswered, first top-15 win since 2007, five rushing
   TDs and 249 rushing yards; Young 99 yards + 2 TDs (48
   and the 2-yarder with 3:59 left for 42-26), Taylor
   67-yard TD, Smith 32-yard TD in final 109 seconds of
   first half for first lead 21-20, Wilson 17-of-25 for
   217 + TD, Williams 5-80 with a 52-yard TD, Sweetwyne
   14-yard TD; Weigman 26-of-42 for 272 + 3 TDs, Hughes
   106 yards + TD on 15 carries, Overmyer 9-116 + TD;
   Houston 7-3 (4-3) per Houston Athletics (Colorado's
   recap intro carried Houston's pregame 8-2 line — the
   postgame Houston record is used). NFL state: 26 games,
   0 moves, 0 new — Week 11's 13-game remainder unchanged.
   NCAAF state: 265 games, 274 moves, 12 new (Nov 27:
   APP vs USA, TEM vs MEM, TLSA vs UTSA, FLA vs FSU, NDSU
   vs SJSU, AFA vs UNM, MINN vs WIS, TEX vs TXAM, WVU vs
   UTAH; Nov 28: CMU vs BALL, MASS vs BGSU, MICH vs OSU —
   the set-diff matches new_games exactly). History:
   2,198 tickers, max 41 points, 32,804 total points
   (32,222 + 52 NFL + 0 MLB + 530 NCAAF = exactly one
   append per priced market, verified against the
   pre-fetch backup; +24 tickers = 12 new games x 2). The
   band (same Nov 9-Nov 16 window) now headlines the UCLA
   result, reports all four Friday Finals, and names
   today's Saturday slate; the stale Friday-fixture
   framing and the Nov 13 Daniels headline are banned
   below. */
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV13FSUPITT") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13ILLUCLA") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13SUUPRST") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13HOUCOLO") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14BRYSHU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14BUTMRST") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14CCSULIU") === -1,
   "kalshi snapshots settle Friday's quartet (Florida St./Pittsburgh, Illinois/UCLA, Southern Utah/Portland St., Houston/Colorado gone) and the Saturday Nov 14 slate this pin headed on Nov 14 (Bryant vs Sacred Heart, Butler vs Marist, Central Connecticut St. vs LIU) settled Saturday and is pinned as gone in the Nov 15 block below");
ok(band.indexOf("Florida St. beat Pittsburgh 16–10 (Final) at Acrisure Stadium") >= 0 &&
   band.indexOf("within one win of its first bowl game since 2023") >= 0 &&
   band.indexOf("Gabe Panikowski made all three of his field goals (27, 37 and 47 yards) to move to 11-for-11 on the season") >= 0,
   "spotlight reports Friday's ACC result: Florida St. beat Pittsburgh 16-10 (Final) at Acrisure, one win from its first bowl since 2023, Panikowski 3-for-3 (27, 37, 47) to move to 11-for-11 (Tallahassee Democrat)");
ok(band.indexOf("Rylan Kennedy's interception") >= 0 &&
   band.indexOf("Amari Thomas's 1-yard touchdown early in the third quarter for a 13–7 lead") >= 0 &&
   band.indexOf("seven tackles for loss, two sacks and six quarterback hurries") >= 0 &&
   band.indexOf("Dailey finished 16-of-34 for 157 yards and Ashton Daniels threw for 163 yards") >= 0,
   "spotlight reports the FSU detail: Kennedy's interception setting up Thomas's 1-yard TD for 13-7, seven TFL / two sacks / six hurries, Dailey 16-of-34 for 157 and Daniels 163 yards (Tallahassee Democrat)");
ok(band.indexOf("No. 4 UCLA beat Illinois 22–14 (Final) at a rainy Rose Bowl Stadium in Pasadena") >= 0 &&
   band.indexOf("reached 10–0 for the first time since 1998 and matched the program record for wins") >= 0 &&
   band.indexOf("Collin Dixon's 7-yard touchdown") >= 0 &&
   band.indexOf("cut it to 19–14 with 7:14 left") >= 0,
   "spotlight reports Friday's Big Ten result: No. 4 UCLA beat Illinois 22-14 (Final) at a rainy Rose Bowl, 10-0 for the first time since 1998 and a matched program wins record, Dixon's 7-yard TD cutting it to 19-14 with 7:14 left (UCLA Athletics / Illinois Athletics)");
ok(band.indexOf("Ty Dieffenbach finished 13-of-20 for 232 yards with two touchdowns and an interception") >= 0 &&
   band.indexOf("Aidan Mizell caught six passes for a career-high 176 yards") >= 0 &&
   band.indexOf("Scooter Jackson grabbed two interceptions to take the Big Ten lead with five") >= 0 &&
   band.indexOf("FBS-leading totals to 20 interceptions and 30 takeaways") >= 0 &&
   band.indexOf("Mateen Bhaghani's field goal after Jackson's second interception set the final 22–14 margin") >= 0,
   "spotlight reports the UCLA detail: Dieffenbach 13-of-20 for 232 yards with two TDs, Mizell 6-176, Jackson's two INTs for a Big Ten-leading five, FBS-leading 20 INTs / 30 takeaways, Bhaghani's FG setting 22-14 (UCLA Athletics)");
ok(band.indexOf("Southern Utah beat Portland St. 23–21 (Final) at Hillsboro Stadium") >= 0 &&
   band.indexOf("Jayden Rogers kicked a 33-yard field goal with 17 seconds left to win it") >= 0 &&
   band.indexOf("Delon Thompson rushed for 169 yards and a touchdown") >= 0 &&
   band.indexOf("Portland St., which outgained Southern Utah 335–330 in a game with three lead changes") >= 0,
   "spotlight reports Friday's FCS result: Southern Utah beat Portland St. 23-21 (Final) at Hillsboro on Rogers' 33-yard FG with 17 seconds left, Thompson 169 rushing yards, Portland outgaining SUU 335-330 with three lead changes (SuperWest Sports / EIN Presswire)");
ok(band.indexOf("Colorado beat No. 14 Houston 42–32 (Final) at Folsom Field in Boulder") >= 0 &&
   band.indexOf("trailed 20–7 in the second quarter before scoring 28 unanswered points for its first win over a top-15 team since 2007") >= 0 &&
   band.indexOf("Richard Young rushed for 99 yards and two touchdowns") >= 0 &&
   band.indexOf("Conner Weigman finished 26-of-42 for 272 yards and three touchdowns for Houston") >= 0 &&
   band.indexOf("Houston fell to 7–3 (4–3 in the Big 12) (Colorado Athletics / Houston Athletics)") >= 0,
   "spotlight reports Friday's Big 12 upset: Colorado beat No. 14 Houston 42-32 (Final) at Folsom, 28 unanswered after a 20-7 deficit for its first top-15 win since 2007, Young 99 yards and two TDs, Weigman 26-of-42 for 272 and three TDs, Houston 7-3 (Colorado Athletics / Houston Athletics)");
ok(band.indexOf("College football's Saturday slate is Final now too") >= 0 &&
   band.indexOf("Ball St. vs Ohio, Eastern Michigan vs Western Michigan and Miami (OH) vs Kent St. head the Kalshi NCAAF board") === -1,
   "spotlight names the next college slate after Saturday's Finals: Monday night's MACtion (Ball St. vs Ohio, Eastern Michigan vs Western Michigan, Miami (OH) vs Kent St.) — this pin named the trio as the next slate on Nov 14; the trio settled Tuesday night and its Finals are pinned in the Nov 18 block below; this pin named the Saturday Nov 14 slate (Bryant vs Sacred Heart, Butler vs Marist, Central Connecticut St. vs LIU) as today's fixtures on Nov 14; that slate settled Saturday and its Finals are pinned in the Nov 15 block below");
ok(band.indexOf("opens tonight, Friday night, Nov 13") === -1 &&
   band.indexOf("Florida St. vs Pittsburgh, Illinois vs UCLA, Southern Utah vs Portland St. and Houston vs Colorado head the Kalshi NCAAF board") === -1 &&
   band.indexOf("Jayden Daniels hit Stefon Diggs for a 32-yard touchdown with 57 seconds left") === -1,
   "spotlight no longer frames the settled Friday quartet as tonight's fixtures and no longer carries the Nov 13 Daniels headline (the Daniels result itself stays in the body, pinned in the Nov 13 block above)");
/* The Nov 15 snapshot (fetched 18:49Z NFL / 18:49Z MLB /
   18:54Z NCAAF) settles Saturday's Nov 14 slate — 116 of
   the 117 Nov 14-ticker games drop out; the exception is
   Ole Miss vs Oklahoma, which the SEC moved to Sunday
   noon in Norman after Ole Miss could not fly out
   following Friday's nationwide FAA ground stop, so
   Kalshi still lists it under its Saturday ticker and it
   heads the board ahead of Monday night's MACtion trio
   (Ball St. vs Ohio, Eastern Michigan vs Western
   Michigan, Miami (OH) vs Kent St., occ Nov 18 03:00Z).
   Saturday's Finals (all cross-checked): No. 8 Texas
   beat No. 22 LSU 22-21 at Tiger Stadium (USA Today) —
   LSU led nearly all night and by 11 in the second half;
   Manning threw three interceptions but drove Texas 58
   yards in the final 2:15 and hit Brown for a 4-yard TD
   with three seconds left; Texas 8-2 (5-2 SEC), first
   win in Baton Rouge since 1952; LSU 6-4 (3-4), Kiffin's
   first season, outgained Texas 366-273. No. 2 Utah beat
   No. 23 Arizona 40-39 at Casino Del Sol Stadium (AP /
   Utah Athletics) — Utah 10-0 (7-0 Big 12), arrived
   hours before a kickoff pushed back three hours by the
   ground stop, trailed 39-33 after Fifita's 10-yard TD
   to Mizell with 3:13 left, Dampier answered with a
   70-yard TD to Whittemore with 2:35 left and a
   fourth-down stop sealed it; Dampier four TDs (204
   passing / two scores, 100 rushing / two more), Bray
   197 rushing yards, Fifita 356 yards and three TDs,
   seven lead changes, Arizona 7-3 (4-3). No. 1 Georgia
   beat No. 22 Missouri 48-21 at Sanford Stadium
   (Georgia Athletics) — INT on the game's first play,
   scores on the first five possessions, 31-0 midway
   through Q2, Frazier three TDs, 468 yards; Georgia
   9-1 (7-1), Missouri 6-4 (3-4) with three late Simmons
   TD passes. No. 18 Oregon beat Michigan 31-7 at Autzen
   Stadium (Michigan Athletics / Register-Guard) —
   Raiola 20-of-28 for 341 yards and four TDs, Oregon
   the first team to score 30+ on Michigan this season,
   Hill's 49-yard TD with 4:03 left, Hiter's 70-yard TD
   run Michigan's only score, Michigan outrushed Oregon
   215-126; Oregon 7-3 (5-2), Michigan 5-5 (2-5). No. 7
   Alabama beat Vanderbilt 21-6 at FirstBank Stadium
   (Alabama Athletics) — Bama held Vanderbilt out of the
   end zone, 21 points in a 7:53 span across Q2/Q3,
   Russell 217 yards and three TDs on an ailing ankle,
   Taylor FGs of 52 and 57 Vanderbilt's only points,
   Vanderbilt 12 rushing yards, Lee's 83-yard kickoff
   return set up the final TD; Alabama 8-2 (6-2),
   Vanderbilt 4-6 (1-6). No. 9 Tennessee beat Texas A&M
   22-7 at Kyle Field (Tennessee Athletics / NBC
   Sports) — Tennessee trailed 7-6 at the half, 19
   unanswered, Ranvier a career-high five FGs (23, 27,
   30, 32, 44), Texas A&M held to 179 yards, freshman
   Brandon finished at QB after MacIntyre's third-quarter
   right knee injury, Bishop 97 yards on 34 carries,
   Brame's TD catch the Vols' only touchdown; Tennessee
   8-2 (5-2), Texas A&M 4-6 (1-6). NFL state: 25 games,
   23 moves, 0 new — the Week 11 window falls to the
   12-game remainder pinned dynamically in the Nov 9
   block above (the Sunday opener, New England at
   Detroit, kicked off at 17:30Z and dropped off the
   board unplayed in the snapshot's terms — no result is
   claimed for it). NCAAF state: 185 games, 234 moves,
   36 new (all Nov 28/29, headed by Georgia Tech vs
   Georgia and LSU vs Arkansas — the set-diff matches
   new_games exactly). History: 2,270 tickers, max 41
   points, 33,224 total points (32,804 + 50 NFL + 0 MLB
   + 370 NCAAF = exactly one append per priced market,
   verified against the pre-fetch backup; +72 tickers =
   36 new games x 2). The band (same Nov 9-Nov 16
   window) now headlines the Texas result, reports all
   six Saturday Finals plus the Ole Miss postponement,
   and names Monday night's MACtion as the next college
   slate; the stale Saturday-fixture framing and the
   Nov 14 UCLA headline are banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV15NEDET") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14ALAVAN") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14MICHORE") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14TEXLSU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14TENNTXAM") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14UTAHARIZ") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14MIZZUGA") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV14MISSOKLA") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV17BALLOHIO") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV17EMUWMU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV17MOHKENT") === -1,
   "kalshi snapshots settle Saturday's marquee seven (Alabama/Vanderbilt, Michigan/Oregon, Texas/LSU, Tennessee/Texas A&M, Utah/Arizona, Missouri/Georgia gone) and the NFL Sunday opener (New England at Detroit gone at kickoff) — Ole Miss vs Oklahoma stayed listed under its Saturday ticker on Nov 15 (moved to Sunday noon by the SEC), played Sunday and settled in the Nov 16 snapshot (Oklahoma won 24-17, pinned in the Nov 16 block below), ahead of Tuesday night's MACtion trio (Ball St. vs Ohio, Eastern Michigan vs Western Michigan, Miami (OH) vs Kent St.) — the trio this pin kept settled Tuesday night (Ohio beat Ball St. 35-28, Western Michigan beat Eastern Michigan 34-27, Miami (OH) beat Kent St. 20-3) and its settlement is pinned in the Nov 18 block below");
ok(band.indexOf("No. 8 Texas beat No. 22 LSU 22–21 (Final) at Tiger Stadium in Baton Rouge") >= 0 &&
   band.indexOf("Arch Manning, despite three interceptions, drove Texas 58 yards in the final 2:15 and hit Raleek Brown for a 4-yard touchdown with three seconds left") >= 0 &&
   band.indexOf("LSU (6–4, 3–4) lost in Lane Kiffin's first season despite outgaining Texas 366–273 (USA Today)") >= 0,
   "spotlight reports Saturday's SEC thriller: No. 8 Texas beat No. 22 LSU 22-21 (Final) at Tiger Stadium, Manning's 58-yard drive in the final 2:15 to Brown's 4-yard TD with three seconds left despite three interceptions, LSU 6-4 in Kiffin's first season despite outgaining Texas 366-273 (USA Today)");
ok(band.indexOf("No. 2 Utah beat No. 23 Arizona 40–39 (Final) at Casino Del Sol Stadium in Tucson") >= 0 &&
   band.indexOf("trailed 39–33 after Noah Fifita's third touchdown pass, a 10-yarder to Isaiah Mizell with 3:13 left") >= 0 &&
   band.indexOf("Devon Dampier answered with a 70-yard touchdown pass to Creed Whittemore with 2:35 left") >= 0 &&
   band.indexOf("Daniel Bray ran for 197 yards, Fifita threw for 356 yards and three touchdowns") >= 0 &&
   band.indexOf("Arizona fell to 7–3 (4–3) in a game with seven lead changes (AP / Utah Athletics)") >= 0,
   "spotlight reports Saturday's Big 12 classic: No. 2 Utah beat No. 23 Arizona 40-39 (Final) in Tucson, Dampier's 70-yard TD to Whittemore with 2:35 left answering Fifita's go-ahead score with 3:13 left, Bray 197 rushing yards, Fifita 356 yards and three TDs, seven lead changes (AP / Utah Athletics)");
ok(band.indexOf("No. 1 Georgia beat No. 22 Missouri 48–21 (Final) at Sanford Stadium") >= 0 &&
   band.indexOf("intercepted the game's first play, scored on its first five possessions and led 31–0 midway through the second quarter") >= 0 &&
   band.indexOf("three Nate Frazier touchdowns and 468 total yards") >= 0,
   "spotlight reports Saturday's Athens rout: No. 1 Georgia beat No. 22 Missouri 48-21 (Final), an interception on the first play and scores on the first five possessions to lead 31-0, Frazier's three TDs and 468 yards (Georgia Athletics)");
ok(band.indexOf("No. 18 Oregon beat Michigan 31–7 (Final) at Autzen Stadium") >= 0 &&
   band.indexOf("Dylan Raiola was 20-of-28 for 341 yards and four touchdowns") >= 0 &&
   band.indexOf("became the first team to score more than 30 points on Michigan this season") >= 0 &&
   band.indexOf("Savion Hiter's 70-yard touchdown run despite outrushing the Ducks 215–126") >= 0,
   "spotlight reports Saturday's Big Ten result: No. 18 Oregon beat Michigan 31-7 (Final) at Autzen, Raiola 20-of-28 for 341 yards and four TDs, the first 30-point game against Michigan this season, Hiter's 70-yard TD run Michigan's only score despite a 215-126 rushing edge (Michigan Athletics / Register-Guard)");
ok(band.indexOf("No. 7 Alabama beat Vanderbilt 21–6 (Final) at FirstBank Stadium in Nashville") >= 0 &&
   band.indexOf("scoring 21 points in a 7:53 span across the second and third quarters behind Keelon Russell, who started on an ailing ankle and threw for 217 yards and three touchdowns") >= 0 &&
   band.indexOf("Brock Taylor field goals of 52 and 57 yards and 12 rushing yards") >= 0 &&
   band.indexOf("Dijon Lee Jr.'s 83-yard kickoff return set up Alabama's final touchdown (Alabama Athletics)") >= 0,
   "spotlight reports Saturday's Nashville result: No. 7 Alabama beat Vanderbilt 21-6 (Final), 21 points in a 7:53 span behind Russell's 217 yards and three TDs on an ailing ankle, Taylor's 52- and 57-yard FGs Vanderbilt's only points with 12 rushing yards, Lee's 83-yard return setting up the final TD (Alabama Athletics)");
ok(band.indexOf("No. 9 Tennessee beat Texas A&amp;M 22–7 (Final) at Kyle Field") >= 0 &&
   band.indexOf("Cooper Ranvier kicked a career-high five field goals (23, 27, 30, 32 and 44 yards)") >= 0 &&
   band.indexOf("the Vols held Texas A&amp;M (4–6, 1–6) to 179 total yards") >= 0 &&
   band.indexOf("freshman Faizon Brandon finished at quarterback after George MacIntyre left in the third quarter with a right knee injury") >= 0 &&
   band.indexOf("DeSean Bishop ran for 97 yards on 34 carries and DaSaahn Brame caught Tennessee's only touchdown (Tennessee Athletics / NBC Sports)") >= 0,
   "spotlight reports Saturday's College Station result: No. 9 Tennessee beat Texas A&M 22-7 (Final), Ranvier's career-high five FGs, Texas A&M held to 179 yards, Brandon finishing at QB after MacIntyre's third-quarter knee injury, Bishop 97 yards on 34 carries and Brame's TD catch (Tennessee Athletics / NBC Sports)");
ok(band.indexOf("in the game the SEC moved to Sunday noon after Ole Miss could not fly out following Friday's nationwide ground stop") >= 0 &&
   band.indexOf("College football's Tuesday MACtion is Final now too") >= 0,
   "spotlight reports the moved game as played (the SEC moved No. 19 Ole Miss at Oklahoma to Sunday noon in Norman after Ole Miss could not fly out following Friday's ground stop; the result itself is pinned in the Nov 16 block below — this pin carried the postponement framing on Nov 15) and now reports Tuesday night's MACtion as Finals (detailed pins in the Nov 18 block below — this pin named it as the next college slate on Nov 15; the games occurred Tuesday night US, occ Nov 18 03:00Z)");
ok(band.indexOf("College football's Saturday slate takes over today, Nov 14") === -1 &&
   band.indexOf("Bryant vs Sacred Heart, Butler vs Marist and Central Connecticut St. vs LIU head the Kalshi NCAAF board") === -1 &&
   band.indexOf("No. 4 UCLA held off Illinois 22–14 at a rainy Rose Bowl to reach 10–0 for the first time since 1998") === -1 &&
   band.indexOf("Week 11's remaining <strong>13-game</strong> slate runs through Sunday, Nov 15") === -1,
   "spotlight no longer frames the settled Saturday slate as today's fixtures, no longer carries the Nov 14 UCLA headline (the UCLA result itself stays in the body, pinned in the Nov 14 block above), and no longer counts Week 11's remainder at 13 (the 12-game remainder was pinned dynamically in the Nov 9 block above; it fell to 1 on Nov 16, pinned there now)");
/* The Nov 16 snapshot (fetched 18:51Z NFL / 18:51Z MLB /
   18:54Z NCAAF) settles Sunday's eleven Week 11 games —
   the twelfth Sunday game (New England at Detroit) had
   already dropped off at kickoff on Nov 15 — and the
   moved Ole Miss at Oklahoma game; tonight's Monday-night
   closer (the Los Angeles Chargers at Baltimore) heads
   the NFL board, followed by Week 12's 13 games (Thu
   Nov 19 Indianapolis at Houston through Mon Nov 23
   Cincinnati at Washington). Sunday's Finals (all
   cross-checked): Cincinnati beat Pittsburgh 38-18 on
   Sunday night at Paycor Stadium (AP / Bengals /
   Cincinnati.com) — Burrow 35-of-44 for 409 yards and
   four TDs, Chase 11 catches for 231 yards, Chase Brown
   two receiving TDs and 82 scrimmage yards, Cincinnati
   484-222 in total yards and 24-3 at the half, Rodgers
   15-of-29 for 143 yards with both TD passes in the
   fourth quarter; Cincinnati 7-2 with a fifth straight
   win and sole possession of first place in the AFC
   North, Pittsburgh 6-3; the 38-18 final was the first
   in NFL history (Scorigami, the league's 1,100th unique
   score — CBS Sports). Detroit beat New England 35-10
   at Allianz Arena in Munich (Detroit Lions / Free
   Press / Reuters) — a record crowd of 70,225, Gibbs
   252 total yards (153 rushing on 22 carries, 99
   receiving) and two TDs, St. Brown two TD catches (56
   and 28 yards), TeSlaa a 12-yard diving TD catch, Goff
   20-of-31 for 303 yards and three TDs, Detroit 494
   total yards and a 21-3 halftime lead; Maye left with
   an ankle injury on Hutchinson's sack and Hutchinson
   hurt his own knee celebrating it; Detroit 7-2 with
   five straight wins, New England 5-5. San Francisco
   beat Dallas 46-40 at AT&T Stadium (USA Today / AP) —
   Purdy a career-high 389 yards (22-of-28) and three
   TDs with no interception, McCaffrey 223 scrimmage
   yards and three scores including the 66-yard TD catch
   that sealed it, San Francisco 584 yards (the
   third-most the Cowboys have ever allowed, AP) with
   three TDs of 65-plus yards; Prescott matched his
   career high with five TD passes (343 yards), Pickens
   three TD catches for 145 yards, Dallas 21 fourth-
   quarter points cutting a 19-point lead to six; San
   Francisco 8-1, Dallas 4-6, crowd 93,715. Cleveland
   beat Houston 27-24 at Huntington Bank Field (AP /
   Beacon Journal) — Houston led 17-0 in the second
   quarter (Stroud TD passes, the second an 11-yarder to
   Hutchinson), Watson's 6-yard TD run and Concepcion's
   6-yard end-around TD tied it 17-17, Szmyt's 26-yard FG
   made it 20-17, Stroud's 11-yard TD to Schultz with
   9:17 left put Houston back up 24-20, and Judkins'
   5-yard TD run with 53 seconds left won it after
   Watson hit Fannin for 30 yards down the seam; Watson
   312 passing yards and 50 rushing; Cleveland 6-4 (4-0
   at home), the first team in NFL history whose first
   six wins of a season all came by four points or fewer,
   each on a go-ahead fourth-quarter Watson drive;
   Houston 3-6. Carolina beat New Orleans 20-17 at
   Caesars Superdome (NBC Sports / AP / Panthers Wire) —
   Shough's 4-yard TD pass to Kamara gave New Orleans a
   14-10 fourth-quarter lead, Hubbard's 1-yard TD put
   Carolina ahead 17-14 with 1:49 left, Smyth's 55-yard
   FG tied it with 41 seconds left, and a 30-yard
   pass-interference flag on McKinstry set up
   Fitzgerald's 54-yard FG as time expired; Hubbard 172
   scrimmage yards (92 rushing, 80 receiving) and both
   Carolina TDs, Carolina a franchise-record 17 penalties
   for 152 yards but held New Orleans to 222 yards and
   2.1 yards per carry with three takeaways; Carolina
   4-5 alone in first place in the NFC South (snapping a
   three-game losing streak), New Orleans 3-6. The list:
   Buffalo 31-12 at the Jets (Allen three total TDs,
   Cook's 74-yard TD run; Buffalo 8-1, Jets 2-8), Kansas
   City 35-13 at Atlanta (Mahomes five TD passes; KC
   7-2, Atlanta 3-7), Jacksonville 40-23 at Tennessee
   (Lawrence 352 yards and three TDs; Jacksonville 7-2,
   Tennessee 1-8), Indianapolis 24-22 over Miami (Colts
   snap a five-game skid; Miami 1-8), Minnesota 30-10 at
   Green Bay (Cousins' return — eight sacks of Love;
   Minnesota 7-2, Green Bay 6-4), the Rams 34-6 at
   Arizona, and Seattle 21-13 at Las Vegas (Seattle 6-4,
   Las Vegas 4-6). Oklahoma beat No. 19 Ole Miss 24-17
   on Sunday in Norman (AP / The Oklahoman / Ole Miss
   Athletics) — detail in the pin below. NFL state: 14
   games, 16 moves, 0 new. NCAAF state: 185 games, 228
   moves, 1 new (Nov 21: Virginia Tech vs Miami — the
   set-diff matches new_games exactly). History: 2,272
   tickers, max 41 points, 33,622 total points (33,224 +
   28 NFL + 0 MLB + 370 NCAAF = exactly one append per
   priced market, verified against the pre-fetch backup;
   +2 tickers = 1 new game x 2). The band ROLLS to a new
   Nov 16-Nov 23 window: it headlines the Burrow night,
   reports all twelve Sunday Finals and the Ole Miss
   result, names tonight's MNF closer, the Week 12 slate
   and Tuesday night's MACtion; the stale Sunday-fixture
   framing, the Nov 15 Texas headline and the Week 11
   prices link are banned below. The window closes after
   Monday night's Week 12 closer (Nov 23), so the next
   run on/after Nov 24 must roll it again. */
["KXNFLGAME-26NOV15BUFNYJ", "KXNFLGAME-26NOV15CARNO", "KXNFLGAME-26NOV15HOUCLE",
 "KXNFLGAME-26NOV15JACTEN", "KXNFLGAME-26NOV15KCATL", "KXNFLGAME-26NOV15MIAIND",
 "KXNFLGAME-26NOV15MINGB", "KXNFLGAME-26NOV15LARARI", "KXNFLGAME-26NOV15SEALV",
 "KXNFLGAME-26NOV15SFDAL", "KXNFLGAME-26NOV15PITCIN"].forEach(function(t){
  ok(nflTickers.indexOf(t) === -1,
     "kalshi-nfl.json settles Sunday's Week 11 game (" + t + " gone)");
});
ok(nflTickers.indexOf("KXNFLGAME-26NOV16LACBAL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV21VTMIA") === -1,
   "kalshi snapshots settle the Week 11 closer (the Los Angeles Chargers at Baltimore gone — this pin kept it on Nov 16; Los Angeles won 23-20 (Final) and the settlement is pinned in the Nov 17 block below) and settle the one new NCAAF game added Nov 16 (Virginia Tech vs Miami, kicked off late Saturday night Nov 21 and gone in the Nov 22 snapshot)");
ok(band.indexOf("Cincinnati beat Pittsburgh 38–18 on Sunday night (Final) at Paycor Stadium") >= 0 &&
   band.indexOf("Burrow was 35-of-44 for 409 yards and four touchdowns") >= 0 &&
   band.indexOf("Ja'Marr Chase caught 11 passes for 231 yards") >= 0 &&
   band.indexOf("the 38–18 score was a Scorigami — the first in NFL history and the league's 1,100th unique final score (AP / CBS Sports)") >= 0,
   "spotlight reports Sunday night's result: Cincinnati beat Pittsburgh 38-18 (Final) at Paycor Stadium, Burrow 35-of-44 for 409 yards and four TDs, Chase 11-231, the first 38-18 final in NFL history (Scorigami, the league's 1,100th unique score) (AP / CBS Sports)");
ok(band.indexOf("Detroit beat New England 35–10 (Final) at Allianz Arena in Munich before a record crowd of 70,225") >= 0 &&
   band.indexOf("Jahmyr Gibbs produced 252 total yards (153 rushing, 99 receiving) and two touchdowns") >= 0 &&
   band.indexOf("New England (5–5) lost Drake Maye to an ankle injury on a sack by Aidan Hutchinson, who hurt his own knee celebrating the play (Detroit Lions / Free Press)") >= 0,
   "spotlight reports Sunday's Munich result: Detroit beat New England 35-10 (Final) before a record crowd of 70,225, Gibbs 252 total yards and two TDs, Maye's ankle injury on Hutchinson's sack — Hutchinson hurt his own knee celebrating (Detroit Lions / Free Press)");
ok(band.indexOf("San Francisco beat Dallas 46–40 (Final) at AT&T Stadium") >= 0 &&
   band.indexOf("Brock Purdy threw for a career-high 389 yards and three touchdowns") >= 0 &&
   band.indexOf("Christian McCaffrey piled up 223 yards from scrimmage and three scores including the 66-yard touchdown catch") >= 0 &&
   band.indexOf("Dak Prescott matched his career high with five touchdown passes for Dallas (4–6)") >= 0,
   "spotlight reports Sunday's Arlington shootout: San Francisco beat Dallas 46-40 (Final), Purdy a career-high 389 yards and three TDs, McCaffrey 223 scrimmage yards and three scores including the 66-yard sealer, Prescott a career-high-tying five TD passes for Dallas 4-6 (USA Today / AP)");
ok(band.indexOf("Cleveland beat Houston 27–24 (Final) at Huntington Bank Field") >= 0 &&
   band.indexOf("Quinshon Judkins' 5-yard touchdown run with 53 seconds left") >= 0 &&
   band.indexOf("the first team in NFL history whose first six wins of a season all came by four points or fewer") >= 0,
   "spotlight reports Sunday's Cleveland comeback: the Browns beat Houston 27-24 (Final) from 17-0 down on Judkins' 5-yard TD run with 53 seconds left, the first team in NFL history whose first six wins of a season all came by four points or fewer (AP)");
ok(band.indexOf("Carolina beat New Orleans 20–17 (Final) at Caesars Superdome") >= 0 &&
   band.indexOf("Ryan Fitzgerald's 54-yard field goal as time expired") >= 0 &&
   band.indexOf("Chuba Hubbard accounted for 172 yards from scrimmage and both Carolina touchdowns") >= 0 &&
   band.indexOf("a franchise-record 17 penalties for 152 yards") >= 0,
   "spotlight reports Sunday's Superdome walk-off: Carolina beat New Orleans 20-17 (Final) on Fitzgerald's 54-yard FG as time expired, Hubbard 172 scrimmage yards and both Carolina TDs, a franchise-record 17 penalties for 152 yards (NBC Sports / AP)");
ok(band.indexOf("Buffalo beat the New York Jets 31–12 (Final)") >= 0 &&
   band.indexOf("Kansas City beat Atlanta 35–13 (Final) behind five Patrick Mahomes touchdown passes") >= 0 &&
   band.indexOf("Jacksonville beat Tennessee 40–23 (Final)") >= 0 &&
   band.indexOf("Indianapolis beat Miami 24–22 (Final)") >= 0 &&
   band.indexOf("Minnesota beat Green Bay 30–10 (Final)") >= 0 &&
   band.indexOf("the Los Angeles Rams beat Arizona 34–6 (Final)") >= 0 &&
   band.indexOf("Seattle beat Las Vegas 21–13 (Final)") >= 0,
   "spotlight reports Sunday's remaining Finals list (Buffalo, Kansas City, Jacksonville, Indianapolis, Minnesota, the Rams, Seattle) (AP / USA Today)");
ok(band.indexOf("Oklahoma beat No. 19 Ole Miss 24–17 (Final) on Sunday at Gaylord Family Oklahoma Memorial Stadium in Norman") >= 0 &&
   band.indexOf("Isaiah Sategna III's 75-yard punt-return touchdown") >= 0 &&
   band.indexOf("John Mateer accounted for 181 yards of offense (111 passing yards and a team-high 70 rushing yards with a touchdown)") >= 0 &&
   band.indexOf("his Hail Mary was batted down in the end zone as time expired") >= 0 &&
   band.indexOf("the Rebels (6–4, 4–4) lost their second straight despite outgaining Oklahoma 307–299 (AP / The Oklahoman)") >= 0,
   "spotlight reports the moved game's result: Oklahoma beat No. 19 Ole Miss 24-17 (Final) in Norman, Sategna's 75-yard punt-return TD in a 14-0 first quarter, Mateer's 181 yards of offense, Chambliss's Hail Mary batted down as time expired, Ole Miss 6-4 (4-4) despite a 307-299 yardage edge (AP / The Oklahoman)");
ok(band.indexOf("Week 12 opened Thursday night in Houston, where Houston beat Indianapolis 26–3 (Final) at Reliant Stadium") >= 0 &&
   band.indexOf("Week 12 closed Monday night in Landover, where Washington beat Cincinnati 22–20 (Final) at Northwest Stadium") >= 0 &&
   band.indexOf("Kalshi Week 13 prices") >= 0,
   "spotlight names the new window's slate: Week 12 opened Thursday night, Nov 19 in Houston (Houston beat Indianapolis 26-3, Final — detailed pins in the Nov 20 block below) and closed Monday night, Nov 23 in Landover (Washington beat Cincinnati 22-20, Final — detailed pins in the Nov 24 block below) — this pin kept the closes-tonight framing until Nov 24, when the closer settled and the band rolled to its Nov 24-Nov 30 window — and links the Week 13 Kalshi prices");
ok(band.indexOf("Arch Manning hit Raleek Brown for a 4-yard touchdown with three seconds left as No. 8 Texas rallied from 11 down") === -1 &&
   band.indexOf("Sunday night is Pittsburgh vs Cincinnati") === -1 &&
   band.indexOf("under way today, Sunday, Nov 15") === -1 &&
   band.indexOf("Monday night's MACtion") === -1 &&
   band.indexOf("Kalshi Week 11 prices") === -1 &&
   band.indexOf("Kalshi Week 12 prices") === -1,
   "spotlight no longer carries the Nov 15 Texas headline (the Texas result itself stays in the body, pinned in the Nov 15 block above), no longer frames Sunday night as a fixture, drops the wrong-day Monday MACtion label and links Week 13 prices, not Week 11 or Week 12");
/* The Nov 17 snapshot (fetched 18:50Z NFL / 18:50Z MLB /
   18:54Z NCAAF) settles Monday night's Week 11 closer —
   the Los Angeles Chargers at Baltimore drops out, Week
   12's 13 games (Thu Nov 19 Indianapolis at Houston
   through Mon Nov 23 Cincinnati at Washington) head the
   NFL board, and a new 16-game Thanksgiving-week slate
   (Wed Nov 25 Green Bay at the Los Angeles Rams through
   Mon Nov 30 Carolina at Tampa Bay) is added. The MNF
   Final (cross-checked): the Los Angeles Chargers beat
   Baltimore 23-20 at M&T Bank Stadium (AP / ESPN /
   theScore / Ravens Wire) — Herbert's 22-yard scoring
   run on the first possession gave Los Angeles a lead it
   never relinquished, Hampton powered in from the 1 on
   fourth down with 1:56 left in the half to make it 17-7
   and finished with 105 rushing yards, and the Chargers
   outrushed Baltimore 160-16; Herbert completed 12
   passes for 129 yards, ran for 51 more and threw no
   interception for the first time this season; Henry was
   held to 10 yards on 10 carries but scored both
   Baltimore TDs (2 yards to cut it to 10-7, 1 yard to cut
   it to 23-20 with 10:23 left); Brissett threw for 340
   yards (33-of-49, Ravens Wire) in his Ravens debut;
   Still forced Flowers' fumble with 2:03 remaining and
   Molden recovered at the Los Angeles 46, then Herbert
   hit ex-Raven Charlie Kolar for the sealing first down;
   Los Angeles 1-8 (first win after 11 straight losses
   dating to last season; the combined 15 straight losses
   entering was a Monday-night record, AP), Baltimore 4-6
   with a fifth straight loss. NFL state: 29 games, 7
   moves, 16 new (set-diff matches new_games exactly; the
   only drop is the settled closer). MLB state: 0 games.
   NCAAF state: 191 games, 124 moves, 6 new (all Nov 28:
   NC St. vs North Carolina, Southern Miss vs Old
   Dominion, Virginia vs Virginia Tech, USC vs UCLA, UTEP
   vs Northern Illinois, Arizona St. vs Arizona — set-diff
   matches new_games exactly), 0 dropped; tonight's
   Tuesday MACtion trio (Ball St. vs Ohio, Eastern
   Michigan vs Western Michigan, Miami (OH) vs Kent St.)
   still heads the board. History: 2,316 tickers, max 41
   points, 34,062 total points (33,622 + 58 NFL + 0 MLB +
   382 NCAAF = exactly one append per priced market,
   verified against the pre-fetch backup; +44 tickers =
   22 new games x 2). The band stays in its Nov 16-Nov 23
   window (no roll — Week 12 is the band's slate): it
   reports Week 11 as closed with the MNF result and
   still names Week 12's opener; the stale closes-tonight
   framing and the 1-game remainder are banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV16LACBAL") === -1 &&
   nflTickers.indexOf("KXNFLGAME-26NOV19INDHOU") === -1 &&
   nflTickers.indexOf("KXNFLGAME-26NOV25GBLAR") >= 0 &&
   nflTickers.indexOf("KXNFLGAME-26NOV30CARTB") >= 0,
   "kalshi-nfl.json settled the Week 11 closer (the Los Angeles Chargers at Baltimore gone), kept Week 12's opener (Indianapolis vs Houston, Nov 19) at the head on Nov 17 and added the 16-game Thanksgiving-week slate (Green Bay at the Los Angeles Rams, Nov 25 through Carolina at Tampa Bay, Nov 30 — set-diff matched new_games exactly) — the opener settled Nov 19 (Houston won 26-3) and its settlement is pinned in the Nov 20 block below");
ok(ncaafTickers.indexOf("KXNCAAFGAME-26NOV17BALLOHIO") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV28USCUCLA") >= 0,
   "kalshi-ncaaf.json settles the Tuesday MACtion head (Ball St. vs Ohio gone — this pin kept it on Nov 17; Ohio won 35-28 (Final) and the settlement is pinned in the Nov 18 block below) and keeps the six new Nov 28 games added Nov 17 (USC vs UCLA among them — set-diff matches new_games exactly)");
ok(band.indexOf("Week 11 closed Monday night in Baltimore, where the Los Angeles Chargers beat Baltimore 23–20 (Final)") >= 0 &&
   band.indexOf("Herbert's 22-yard scoring run on the Chargers' first possession gave Los Angeles a lead it never relinquished") >= 0 &&
   band.indexOf("Hampton powered in from the 1 on fourth down with 1:56 left in the half to make it 17–7 and finished with 105 rushing yards") >= 0 &&
   band.indexOf("the Chargers (1–8) outrushed Baltimore 160–16 to earn their first win of the season after 11 straight losses dating to last season") >= 0,
   "spotlight reports the Week 11 closer as a Final: the Los Angeles Chargers beat Baltimore 23-20, Herbert's 22-yard TD run on the first possession, Hampton's fourth-down 1-yard TD with 1:56 left in the half and 105 rushing yards, outrushed 160-16, first win at 1-8 after 11 straight losses (AP / ESPN)");
ok(band.indexOf("Herbert completed 12 passes for 129 yards, ran for 51 more and threw no interception for the first time this season") >= 0 &&
   band.indexOf("Derrick Henry was held to 10 yards on 10 carries but scored both Baltimore touchdowns — his 1-yard run cut it to 23–20 with 10:23 left") >= 0 &&
   band.indexOf("Jacoby Brissett threw for 340 yards in his Ravens debut") >= 0 &&
   band.indexOf("Tarheeb Still forced Zay Flowers' fumble with 2:03 remaining, Elijah Molden recovering at the Los Angeles 46") >= 0 &&
   band.indexOf("Baltimore (4–6) lost its fifth straight (AP / ESPN)") >= 0,
   "spotlight reports the MNF detail: Herbert 12 passes for 129 yards, 51 rushing yards and no interception for the first time this season, Henry 10 yards on 10 carries with both Baltimore TDs (the 1-yarder cutting it to 23-20 with 10:23 left), Brissett 340 yards in his Ravens debut, Still forcing Flowers' fumble with 2:03 left and Molden recovering at the Los Angeles 46, Baltimore 4-6 with a fifth straight loss (AP / ESPN)");
ok(band.indexOf("Week 12 opened Thursday night in Houston, where Houston beat Indianapolis 26–3 (Final) at Reliant Stadium") >= 0 &&
   band.indexOf("closes tonight, Monday night, Nov 16, with the Los Angeles Chargers at Baltimore") === -1 &&
   band.indexOf("Week 11's remaining <strong>1-game</strong> slate") === -1,
   "spotlight reports Week 12's opener as a Final (Houston beat Indianapolis 26-3 on Thursday night, Nov 19 — detailed pins in the Nov 20 block below) and no longer frames the settled Week 11 closer as tonight's fixture or counts its 1-game remainder");
/* The Nov 18 snapshot (fetched 18:49Z NFL / 18:49Z MLB /
   18:54Z NCAAF) settles Tuesday night's MACtion trio —
   Ball St. at Ohio, Eastern Michigan at Western Michigan
   and Miami (OH) at Kent St. all drop out; tonight's
   MACtion pair (Akron vs UMass, Central Michigan vs
   Buffalo, both occ Nov 18 23:00Z) heads the NCAAF
   board. The Finals (all cross-checked): Ohio beat
   Ball St. 35-28 at Peden Stadium (Ohio Athletics /
   The Star Press / Covers) — Ball St. led 20-14 at the
   half; James-Hamilton's 34-yard pick-six opened the
   fourth quarter, Poulos threw for 155 yards and ran
   for 58 with two rushing TDs, Ball St. tied it 28-28
   with 2:23 left, and Poulos hit Dorwart for a 29-yard
   TD with 1:16 left; Ohio 8-3 (6-1 MAC) with an 18th
   straight home win, Ball St. 3-8. Western Michigan
   beat Eastern Michigan 34-27 at Waldo Stadium (EMU
   Athletics / WMU Athletics) — Buckley's 72-yard TD
   run on the first snap, 140 rushing yards and two
   TDs, Broncos 31-7 at the half; Blue's career-high
   160 rushing yards and three TDs led a 20-3 second
   half, his third score cutting it to 34-27 with 7:36
   left; Western Michigan 8-3 (6-1 MAC), Eastern
   Michigan 4-7. Miami (OH) beat Kent St. 20-3 at Dix
   Stadium (Miami Athletics) — 58 carries for 301
   yards, nearly 39 minutes of possession, Jones 29
   carries for 121 yards and two 1-yard TDs, freshman
   Bellisari 124 passing yards and a 23-yard TD run in
   his first career start, Kent St. held to 31 rushing
   yards and 170 total, scoreless over the final 51
   minutes; Miami 7-4 (5-2 MAC), Kent St. 3-8. NFL
   state: 29 games, 30 moves, 0 new, 0 dropped — Week
   12's opener (Thu Nov 19 Indianapolis at Houston)
   still heads the board. MLB state: 0 games. NCAAF
   state: 188 games, 142 moves, 0 new, exactly the
   trio dropped (set-diff verified). History: 2,316
   tickers, max 41 points, 34,496 total points (34,062
   + 58 NFL + 0 MLB + 376 NCAAF = exactly one append
   per priced market, verified against the pre-fetch
   backup). The band stays in its Nov 16-Nov 23 window
   (no roll — Week 12 is the band's slate): it reports
   the MACtion trio as Finals and names tonight's pair;
   the stale next-slate trio framing is banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV19INDHOU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV17BALLOHIO") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV17EMUWMU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV17MOHKENT") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV18AKRMASS") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV18CMUBUFF") === -1,
   "kalshi snapshots settle Tuesday's MACtion trio (Ball St./Ohio, Eastern Michigan/Western Michigan, Miami (OH)/Kent St. gone) and headed the NCAAF board with that night's pair (Akron vs UMass, Central Michigan vs Buffalo) — the pair settled that night (Akron won 34-33, Buffalo won 40-21) and its settlement is pinned in the Nov 19 block below; Week 12's NFL opener (Indianapolis vs Houston, Nov 19) was still at the head then and settled Nov 19 (Houston won 26-3, pinned in the Nov 20 block below)");
ok(band.indexOf("Ohio beat Ball St. 35–28 (Final) at Peden Stadium in Athens") >= 0 &&
   band.indexOf("Darren James-Hamilton's 34-yard pick-six opened the fourth quarter") >= 0 &&
   band.indexOf("Nick Poulos threw for 155 yards and ran for 58 more with two rushing touchdowns") >= 0 &&
   band.indexOf("Poulos hit Dom Dorwart for a 29-yard touchdown with 1:16 remaining") >= 0 &&
   band.indexOf("Ohio (8–3, 6–1 in the MAC) won its 18th straight home game") >= 0,
   "spotlight reports Tuesday's Athens Final: Ohio beat Ball St. 35-28, James-Hamilton's 34-yard pick-six opening the fourth quarter, Poulos 155 passing yards and 58 rushing with two rushing TDs, the 29-yard Dorwart winner with 1:16 left, Ohio 8-3 with an 18th straight home win (Ohio Athletics / The Star Press)");
ok(band.indexOf("Western Michigan beat Eastern Michigan 34–27 (Final) at Waldo Stadium in Kalamazoo") >= 0 &&
   band.indexOf("Jalen Buckley scored on a 72-yard run on the game's first snap and finished with 140 rushing yards and two touchdowns") >= 0 &&
   band.indexOf("Amareon Blue's career-high 160 rushing yards and three touchdowns") >= 0 &&
   band.indexOf("Blue's third score cutting it to 34–27 with 7:36 left") >= 0,
   "spotlight reports Tuesday's Kalamazoo Final: Western Michigan beat Eastern Michigan 34-27, Buckley's 72-yard TD on the first snap and 140 rushing yards, Blue's career-high 160 yards and three TDs cutting it to 34-27 with 7:36 left (EMU Athletics / WMU Athletics)");
ok(band.indexOf("Miami (OH) beat Kent St. 20–3 (Final) at Dix Stadium in Kent") >= 0 &&
   band.indexOf("the RedHawks ran 58 times for 301 yards and held the ball for nearly 39 minutes") >= 0 &&
   band.indexOf("D'Shawntae Jones carried 29 times for 121 yards and two 1-yard touchdowns") >= 0 &&
   band.indexOf("freshman Drew Bellisari threw for 124 yards and ran for a 23-yard touchdown in his first career start") >= 0 &&
   band.indexOf("Miami's defense held Kent St. to 31 rushing yards and 170 total yards, scoreless over the final 51 minutes") >= 0,
   "spotlight reports Tuesday's Kent Final: Miami (OH) beat Kent St. 20-3, 58 carries for 301 yards and nearly 39 minutes of possession, Jones 121 yards and two 1-yard TDs, Bellisari 124 passing yards and a 23-yard TD run in his first career start, Kent St. held to 31 rushing yards and scoreless over the final 51 minutes (Miami Athletics)");
ok(band.indexOf("College football's next slate is tonight's MACtion pair — Akron vs UMass and Central Michigan vs Buffalo head the Kalshi NCAAF board") === -1 &&
   band.indexOf("Ball St. vs Ohio, Eastern Michigan vs Western Michigan and Miami (OH) vs Kent St. head the Kalshi NCAAF board") === -1,
   "spotlight named that night's MACtion pair (Akron vs UMass, Central Michigan vs Buffalo) as the next college slate on Nov 18 — the pair settled that night and is now reported as Finals (detailed pins in the Nov 19 block below) — and no longer frames the settled Tuesday trio as the next slate (the generic Tuesday-night's-MACtion framing this pin once banned returned legitimately on Nov 22 for the new Nov 24 pair, Miami (OH)/Western Michigan and Kent St./Eastern Michigan, pinned in the Nov 22 block below)");
/* The Nov 19 snapshot (fetched 18:50Z NFL / 18:50Z MLB /
   18:53Z NCAAF) settles Wednesday night's MACtion pair —
   Akron at UMass and Central Michigan at Buffalo both
   drop out; tonight's trio (Northwestern St. vs Stephen
   F. Austin, Southeastern Louisiana vs Nicholls St.,
   Rice vs Temple, occ Nov 20 03:00-03:30Z) heads the
   NCAAF board. The Finals (all cross-checked): Akron
   beat UMass 34-33 at McGuirk Alumni Stadium (UMass
   Athletics / Akron Athletics / Beacon Journal) —
   UMass led 26-7 in the first half behind three Logan
   Inagawa touchdown passes (Inagawa in for the injured
   Watson III), but Jordan Gant ran for 151 yards and
   two TDs including a career-long 73-yarder, Brandon
   Hills returned the second-half kickoff 100 yards for
   a TD, and Aidan Stire's 28-yard FG with 5:34 left
   gave Akron its first lead; Akron 2-9 (1-6 MAC),
   eight-game losing streak snapped, first win since
   September; UMass 5-6 (2-5) ran for 269 yards, its
   most since 2021, behind Faulkner's career-high 105.
   (The Beacon Journal's 5:13 FG time is an outlier
   against both schools' recaps at 5:34 — 5:34 used.)
   Buffalo beat Central Michigan 40-21 at Broadview
   Stadium (Central Michigan Athletics / AP) — Messiah
   Burch ran for 200 yards and two TDs, his 75-yarder
   on Buffalo's next play answering CMU's third-quarter
   TD that cut it to 26-21, Terrance Shelton added 81
   yards and the clinching 1-yard TD, Buffalo piled up
   283 rushing yards for a sixth straight win; Buffalo
   8-3 (6-1 MAC) tied atop the MAC, Central Michigan
   5-6 (3-4) with three turnovers despite Glasser's
   career-high three TD passes and Duley's school-
   record 86-yard punt, the longest in the FBS this
   season. NFL state: 29 games, 6 moves, 0 new, 0
   dropped — Week 12's opener (tonight, Thu Nov 19
   Indianapolis at Houston) still heads the board. MLB
   state: 0 games. NCAAF state: 186 games, 113 moves, 0
   new, exactly the settled pair dropped (set-diff
   verified). History: 2,316 tickers, max 41 points,
   34,926 total points (34,496 + 58 NFL + 0 MLB + 372
   NCAAF = exactly one append per priced market,
   verified against the pre-fetch backup). The band
   stays in its Nov 16-Nov 23 window (no roll — Week 12
   is the band's slate): it reports the MACtion pair as
   Finals and names tonight's trio; the stale tonight's-
   pair framing is banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV19INDHOU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV18AKRMASS") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV18CMUBUFF") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV19NWSTSFA") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV19SELANICH") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV19RICETEM") === -1,
   "kalshi snapshots settled Wednesday's MACtion pair (Akron/UMass, Central Michigan/Buffalo gone) and headed the NCAAF board with that night's trio (Northwestern St./Stephen F. Austin, Southeastern Louisiana/Nicholls St., Rice/Temple) — the trio and Week 12's NFL opener (Indianapolis vs Houston) settled that night (Houston won 26-3, Stephen F. Austin won 66-0, Southeastern Louisiana won 38-10, Rice won 31-27) and their settlement is pinned in the Nov 20 block below");
ok(band.indexOf("Akron beat UMass 34–33 (Final) at McGuirk Alumni Stadium in Amherst") >= 0 &&
   band.indexOf("UMass jumped out to a 26–7 first-half lead behind three Logan Inagawa touchdown passes") >= 0 &&
   band.indexOf("Jordan Gant ran for 151 yards and two touchdowns including a career-long 73-yarder") >= 0 &&
   band.indexOf("Brandon Hills returned the second-half kickoff 100 yards for a touchdown") >= 0 &&
   band.indexOf("Aidan Stire's 28-yard field goal with 5:34 left gave Akron (2–9, 1–6 in the MAC) its first lead of the night and snapped its eight-game losing streak") >= 0 &&
   band.indexOf("UMass (5–6, 2–5) ran for 269 yards, its most since 2021") >= 0,
   "spotlight reports Wednesday's Amherst Final: Akron beat UMass 34-33, UMass's 26-7 lead behind three Inagawa TD passes, Gant 151 yards and two TDs with a career-long 73-yarder, Hills's 100-yard kickoff-return TD, Stire's 28-yard winner with 5:34 left snapping Akron's eight-game skid at 2-9, UMass 269 rushing yards (UMass Athletics / Akron Athletics)");
ok(band.indexOf("Buffalo beat Central Michigan 40–21 (Final) at Broadview Stadium in Buffalo") >= 0 &&
   band.indexOf("Messiah Burch ran for 200 yards and two touchdowns") >= 0 &&
   band.indexOf("a 75-yard score on Buffalo's very next play") >= 0 &&
   band.indexOf("Terrance Shelton added 81 rushing yards and the clinching 1-yard touchdown") >= 0 &&
   band.indexOf("the Bulls (8–3, 6–1 in the MAC) piled up 283 rushing yards to win their sixth straight") >= 0 &&
   band.indexOf("Declan Duley's school-record 86-yard punt, the longest in the FBS this season") >= 0,
   "spotlight reports Wednesday's Buffalo Final: Buffalo beat Central Michigan 40-21, Burch 200 yards and two TDs with the 75-yard answer, Shelton 81 yards and the clincher, 283 team rushing yards and a sixth straight win at 8-3, Duley's school-record 86-yard punt (Central Michigan Athletics)");
ok(band.indexOf("College football's next slate is tonight's trio") === -1 &&
   band.indexOf("College football's next slate is tonight's MACtion pair") === -1,
   "spotlight named that night's trio (Northwestern St./Stephen F. Austin, Southeastern Louisiana/Nicholls, Rice/Temple) as the next college slate on Nov 19 — the trio settled that night and is now reported as Finals (detailed pins in the Nov 20 block below) — and no longer frames the settled MACtion pair as the next slate");
/* The Nov 20 snapshot (fetched 18:49Z NFL / 18:49Z MLB /
   18:53Z NCAAF) settles Thursday night's four games —
   Week 12's NFL opener (Indianapolis at Houston) drops
   out and tonight's NCAAF trio (Northwestern St. at
   Stephen F. Austin, Southeastern Louisiana at Nicholls,
   Rice at Temple) drops out; tonight's Friday night card
   (Iowa St. vs UCF, Bowling Green vs Toledo, Clemson vs
   Duke, occ Nov 21 02:00-03:30Z) heads the NCAAF board
   and Sunday's NFL slate (Arizona vs Kansas City first,
   occ Nov 22 21:00Z) heads the NFL board. The Finals
   (all cross-checked): Houston beat Indianapolis 26-3
   at Reliant Stadium (Reuters / Pro Football Reference)
   — Stroud 21-of-27 for 194 yards and three TDs (42 to
   Collins, 24 to Boutte, 13 to Klein), Montgomery 107
   rushing yards on 26 carries in his return from a
   groin injury, Anderson's end-zone sack of Jones for
   a third-quarter safety (NFL-best 11.5 sacks), the
   Colts held to 167 yards and eight first downs with
   Taylor at 21 yards on 11 carries and Shrader's
   opening-drive 34-yard FG their only score; Houston
   4-6 (fourth win in six, first home win of the
   season), Indianapolis 3-8. Stephen F. Austin beat
   Northwestern St. 66-0 at Homer Bryce Stadium (SFA
   Athletics) — a 35-point second quarter made it 52-0
   at the half, Kitna threw for 253 yards and three
   TDs, Mortimer scored on a 70-yard catch and a
   45-yard punt return, nine Lumberjacks scored, 703
   total yards against 210 allowed; SFA 11-1 (8-1
   Southland) with a second straight conference title,
   Northwestern St. 0-12. Southeastern Louisiana beat
   Nicholls 38-10 in the River Bell Classic at John L.
   Guidry Stadium (SELA Athletics) — 477-164 yardage,
   a season-high 324 rushing yards, Lowe threw for 153
   yards and two TDs and ran for 107 yards and two
   more, Joseph's school-record 14 catches for 139
   yards and a TD, three Lion TDs in the final 10
   minutes breaking a 17-10 game open; SELA 6-6 (4-5
   Southland), River Bell retained a third straight
   year, Nicholls 4-8. Rice beat Temple 31-27 at
   Lincoln Financial Field (Rice Athletics) — Temple
   led 27-17 in the fourth quarter, Crayton Jr. came
   off the bench and converted a fourth-and-10 on each
   of the last two drives (47 yards to Mosey setting up
   Ochoa's 9-yard TD to Mosey at 1:55, then an 18-yard
   strike to Clark before the 30-yard winner to Brown
   with six seconds left), Hardeman's career-high 137
   rushing yards; Rice 2-9 (1-6 American) snapped a
   nine-game losing streak with its first conference
   win, Temple 2-9 (1-6) lost a sixth straight. NFL
   state: 28 games, 9 moves, 0 new, exactly the opener
   dropped (set-diff verified). MLB state: 0 games.
   NCAAF state: 183 games, 72 moves, 0 new, exactly
   the settled trio dropped (set-diff verified).
   History: 2,316 tickers, max 41 points, 35,348 total
   points (34,926 + 56 NFL + 0 MLB + 366 NCAAF =
   exactly one append per priced market, verified
   against the pre-fetch backup). The band stays in
   its Nov 16-Nov 23 window (no roll — Week 12 is the
   band's slate): it reports all four Thursday Finals
   and names tonight's Friday night card; the stale
   Week 12-opens and tonight's-trio framings are
   banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV19INDHOU") === -1 &&
   nflTickers.indexOf("KXNFLGAME-26NOV22ARIKC") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV19NWSTSFA") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV19SELANICH") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV19RICETEM") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20ISUUCF") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20BGSUTOL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20CLEMDUKE") === -1,
   "kalshi snapshots settle Thursday night's four games (Indianapolis/Houston gone from the NFL board, the Northwestern St./Stephen F. Austin, Southeastern Louisiana/Nicholls and Rice/Temple trio gone from the NCAAF board) and headed the NCAAF board with that night's Friday night card (Iowa St./UCF, Bowling Green/Toledo, Clemson/Duke) — the card settled that night (UCF won 48-17, Toledo won 19-0, Clemson won 20-10) and its settlement is pinned in the Nov 21 block below; Sunday's NFL slate (Arizona vs Kansas City) stays at the NFL head — the slate settled Sunday (Kansas City won 34-7) and its settlement is pinned in the Nov 23 block below");
ok(band.indexOf("Houston beat Indianapolis 26–3 (Final) at Reliant Stadium") >= 0 &&
   band.indexOf("C.J. Stroud completed 21 of 27 passes for 194 yards and three touchdowns, a 42-yarder to Nico Collins, a 24-yarder to Kayshon Boutte and a 13-yarder to Marlin Klein") >= 0 &&
   band.indexOf("David Montgomery rushed for 107 yards on 26 carries in his return after missing four games with a groin injury") >= 0 &&
   band.indexOf("Will Anderson Jr. sacked Daniel Jones in the end zone for a third-quarter safety, raising his NFL-best sack total to 11.5") >= 0 &&
   band.indexOf("the Texans held the Colts to 167 yards and eight first downs in Houston's first home win of the season") >= 0 &&
   band.indexOf("Jonathan Taylor managed just 21 yards on 11 carries") >= 0 &&
   band.indexOf("Spencer Shrader's 34-yard field goal on the opening drive was Indianapolis's only score") >= 0 &&
   band.indexOf("Houston (4–6) won for the fourth time in six games and Indianapolis fell to 3–8 (Reuters)") >= 0,
   "spotlight reports the Week 12 opener Final: Houston beat Indianapolis 26-3 at Reliant Stadium, Stroud 21-of-27 for 194 yards and three TDs (Collins 42, Boutte 24, Klein 13), Montgomery 107 yards in his return, Anderson's safety sack (NFL-best 11.5), 167 yards and eight first downs allowed, Taylor 21 yards, Shrader's opening FG the Colts' only score, Houston 4-6 and Indianapolis 3-8 (Reuters)");
ok(band.indexOf("No. 5 Stephen F. Austin beat Northwestern St. 66–0 (Final) at Homer Bryce Stadium in Nacogdoches") >= 0 &&
   band.indexOf("the Lumberjacks scored 35 points in the second quarter to lead 52–0 at the half") >= 0 &&
   band.indexOf("JT Kitna threw for 253 yards and three touchdowns") >= 0 &&
   band.indexOf("Bugs Mortimer scored on a 70-yard reception and a 45-yard punt return") >= 0 &&
   band.indexOf("nine different Lumberjacks scored as Stephen F. Austin piled up 703 total yards and held Northwestern St. to 210") >= 0 &&
   band.indexOf("finishing 11–1 (8–1 in the Southland) with its second straight Southland Conference championship while Northwestern St. closed its season 0–12 (Stephen F. Austin Athletics)") >= 0,
   "spotlight reports Thursday's Nacogdoches Final: Stephen F. Austin beat Northwestern St. 66-0, a 35-point second quarter for 52-0 at the half, Kitna 253 yards and three TDs, Mortimer's 70-yard catch and 45-yard punt-return TDs, nine scorers and 703-210 yardage, SFA 11-1 (8-1) with a second straight Southland title and Northwestern St. 0-12 (Stephen F. Austin Athletics)");
ok(band.indexOf("Southeastern Louisiana beat Nicholls 38–10 (Final) in the River Bell Classic at John L. Guidry Stadium in Thibodaux") >= 0 &&
   band.indexOf("the Lions outgained Nicholls 477–164 and ran for a season-high 324 yards") >= 0 &&
   band.indexOf("Kyle Lowe threw for 153 yards and two touchdowns and ran for 107 yards and two more") >= 0 &&
   band.indexOf("Dkhai Joseph set a school record with 14 receptions for 139 yards and a touchdown") >= 0 &&
   band.indexOf("Southeastern Louisiana (6–6, 4–5 in the Southland) scored three times in the final 10 minutes to pull away from a 17–10 game and retain the River Bell for the third straight season; Nicholls finished 4–8 (Southeastern Louisiana Athletics)") >= 0,
   "spotlight reports Thursday's River Bell Final: Southeastern Louisiana beat Nicholls 38-10 in Thibodaux, 477-164 yardage and a season-high 324 rushing yards, Lowe's four total TDs (153 passing, 107 rushing), Joseph's school-record 14 catches for 139 yards, three late TDs breaking a 17-10 game open, SELA 6-6 with the River Bell retained a third straight year and Nicholls 4-8 (Southeastern Louisiana Athletics)");
ok(band.indexOf("Rice beat Temple 31–27 (Final) at Lincoln Financial Field in Philadelphia") >= 0 &&
   band.indexOf("Temple led 27–17 in the fourth quarter, but Patrick Crayton Jr. came off the bench and converted a fourth-and-10 on each of Rice's last two drives") >= 0 &&
   band.indexOf("hitting Max Mosey for 47 yards to set up Gael Ochoa's 9-yard touchdown pass to Mosey with 1:55 left and then finding Jacurri Brown for a 30-yard touchdown with six seconds remaining") >= 0 &&
   band.indexOf("D'Andre Hardeman Jr. rushed for a career-high 137 yards") >= 0 &&
   band.indexOf("Rice (2–9, 1–6 in the American) snapped a nine-game losing streak with its first conference win of the season while Temple (2–9, 1–6) lost its sixth straight (Rice Athletics)") >= 0,
   "spotlight reports Thursday's Philadelphia Final: Rice beat Temple 31-27, erasing a 27-17 fourth-quarter deficit as Crayton Jr. converted two fourth-and-10s and hit Brown for the 30-yard winner with six seconds left after Ochoa's 9-yard TD to Mosey at 1:55, Hardeman's career-high 137 rushing yards, Rice 2-9 snapping a nine-game skid and Temple 2-9 losing a sixth straight (Rice Athletics)");
ok(band.indexOf("College football's next slate is tonight's Friday night card — Iowa St. vs UCF, Bowling Green vs Toledo and Clemson vs Duke head the Kalshi NCAAF board") === -1 &&
   band.indexOf("Week 12 opens Thursday night, Nov 19, with Indianapolis at Houston") === -1 &&
   band.indexOf("College football's Thursday slate is Final now too") >= 0,
   "spotlight named that night's Friday night card (Iowa St./UCF, Bowling Green/Toledo, Clemson/Duke) as the next college slate on Nov 20 — the card settled that night and is now reported as Finals (detailed pins in the Nov 21 block below) — reports Thursday's slate as Final and no longer frames Week 12 as opening Thursday night");
/* The Nov 21 snapshot (fetched 18:49Z NFL / 18:49Z MLB /
   18:54Z NCAAF) settles Friday night's six-game college
   card — Iowa St. at UCF, Bowling Green at Toledo,
   Clemson at Duke, Oregon at Michigan St., UTEP at Air
   Force and New Mexico at Wyoming all drop out; today's
   Saturday card (96 games occ Nov 21, headed by Albany
   vs North Carolina A&T, Cornell vs Columbia and
   Duquesne vs Central Connecticut St., all occ Nov 21
   20:00Z) heads the NCAAF board and Sunday's NFL slate
   (Arizona vs Kansas City first, occ Nov 22 21:00Z)
   still heads the NFL board. The Finals (all
   cross-checked): UCF beat Iowa St. 48-17 at Acrisure
   Bounce House (UCF Athletics / AP) — Barnett III
   17-of-27 for 255 yards and four TDs, three to Derry
   (21, 65, 24 yards; Derry 4 catches for 125 yards,
   first UCF receiver with three TD catches in a game
   since Jacob Harris vs South Florida in 2020), plus a
   15-yard rushing TD; Watson 113 rushing yards; UCF
   forced four turnovers worth 21 points after Iowa St.
   led 3-0 early; UCF 6-5 (4-4 Big 12), bowl-eligible
   for the first time since 2023, Iowa St. 5-6 (3-5).
   Toledo beat Bowling Green 19-0 at the Glass Bowl
   (Toledo Athletics / AP) — Battle of I-75; Griffith's
   career-high four FGs (46, 30, 39, 42), Richter
   14-of-24 for 191 yards and the 35-yard TD to Dabbs
   in the final minute of the first half (16-0 at the
   half), 10 TFL and three sacks, BGSU one red-zone
   trip; Toledo's first shutout of BGSU since 1970 and
   first back-to-back shutouts since 1981; Toledo 9-2
   (6-1 MAC), fifth straight win, series 44-43-4, first
   Battle of I-75 win since 2023; BGSU 3-8 (3-4).
   Clemson beat Duke 20-10 at Wallace Wade Stadium (AP)
   — Pearman 164 passing yards and 51 rushing in his
   first career start with a 9-yard TD run (10-0 in the
   third), Denson 16 carries for 71 yards and a 7-yard
   TD (17-7 midway through the fourth), Clemson held
   Duke to 247 total yards, Sheppard 116 rushing yards
   with a 55-yard TD, Hauser's 39-yard FG clinched it
   with 1:01 left; Clemson 7-4 (5-3 ACC), Duke 7-4
   (4-4) with a second straight loss. No. 14 Oregon
   beat Michigan St. 45-7 at Spartan Stadium (AP / NBC
   Sports) — Smith's career-high 121 rushing yards and
   two TDs, Hurych's 15-yard fake-field-goal TD run
   with two seconds left in the first half; Oregon 8-3
   (6-2 Big Ten), fourth straight win, Michigan St.
   3-8 (1-7). Air Force beat UTEP 52-3 at Falcon
   Stadium (AP / UTEP Athletics) — 429 rushing yards,
   586 total on 64 attempts, Medders two TD passes and
   Martin one (three of four completions for TDs),
   first downs 27-6, first meeting since 1995; Air
   Force 9-2 (5-2), UTEP 1-10 (0-7). New Mexico beat
   Wyoming 24-17 at War Memorial Stadium (7220 Sports /
   Wyoming News) — Lobos led 17-0 in the second quarter
   and 24-7 after three, 433-188 yardage and 38:01
   possession, Wyoming's 10 fourth-quarter points too
   late; New Mexico 9-2 (6-1 Mountain West), first win
   in Laramie since 2021, Wyoming 7-4 (6-2) with a
   five-game win streak snapped and its chance to host
   the conference championship gone. NFL state: 28
   games, 7 moves, 0 new, 0 dropped (set-diff
   verified). MLB state: 0 games. NCAAF state: 177
   games, 189 moves, 0 new, exactly the Friday six
   dropped (set-diff verified). History: 2,316 tickers,
   max 41 points, 35,758 total points (35,348 + 56 NFL
   + 0 MLB + 354 NCAAF = exactly one append per priced
   market, verified against the pre-fetch backup; the
   /tmp backup was lost to a mid-run service restart
   after the NFL/MLB fetches landed, so the NCAAF fetch
   was re-run once from a durable backup — its first
   attempt never wrote). The band stays in its
   Nov 16-Nov 23 window (no roll — Week 12 is the
   band's slate): it reports all six Friday Finals and
   names today's Saturday card; the stale tonight's-
   Friday-card framing is banned below. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV22ARIKC") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20ISUUCF") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20BGSUTOL") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20CLEMDUKE") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20OREMSU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20UTEPAFA") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV20UNMWYO") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV21ALBYNCAT") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV21CORCLMB") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV21DUQCCSU") === -1,
   "kalshi snapshots settle Friday night's six games (Iowa St./UCF, Bowling Green/Toledo, Clemson/Duke, Oregon/Michigan St., UTEP/Air Force, New Mexico/Wyoming gone) and headed the NCAAF board with the Saturday card (Albany/North Carolina A&T, Cornell/Columbia, Duquesne/Central Connecticut St.) — the card this pin kept on Nov 21 settled that night (Michigan won 18-16 in triple overtime, Georgia won 34-6, Utah won 38-17) and its settlement is pinned in the Nov 22 block below; Sunday's NFL slate (Arizona vs Kansas City) still at the NFL head — the slate settled Sunday (Kansas City won 34-7) and its settlement is pinned in the Nov 23 block below");
ok(band.indexOf("UCF beat Iowa St. 48–17 (Final) at Acrisure Bounce House in Orlando") >= 0 &&
   band.indexOf("Alonza Barnett III threw for 255 yards and four touchdowns, three of them to Josh Derry (21, 65 and 24 yards)") >= 0 &&
   band.indexOf("the first UCF receiver with three touchdown catches in a game since Jacob Harris against South Florida in 2020") >= 0 &&
   band.indexOf("UCF's defense forced four turnovers that became 21 points") >= 0 &&
   band.indexOf("UCF (6–5, 4–4 in the Big 12) became bowl-eligible for the first time since 2023") >= 0 &&
   band.indexOf("Iowa St. fell to 5–6 (3–5) in its final road game of the season (UCF Athletics / AP)") >= 0,
   "spotlight reports Friday's Orlando Final: UCF beat Iowa St. 48-17, Barnett III 255 yards and four TDs (three to Derry), Derry the first UCF receiver with three TD catches in a game since 2020, four forced turnovers worth 21 points, UCF 6-5 bowl-eligible for the first time since 2023 and Iowa St. 5-6 (UCF Athletics / AP)");
ok(band.indexOf("Toledo beat Bowling Green 19–0 (Final) at the Glass Bowl in Toledo in the Battle of I-75") >= 0 &&
   band.indexOf("Reice Griffith kicked a career-high four field goals (46, 30, 39 and 42 yards)") >= 0 &&
   band.indexOf("John Alan Richter finished 14-of-24 for 191 yards in his first rivalry start and hit Adjatay Dabbs for a 35-yard touchdown in the final minute of the first half to make it 16–0") >= 0 &&
   band.indexOf("Toledo's first shutout of Bowling Green since a 20–0 win in 1970") >= 0 &&
   band.indexOf("Toledo (9–2, 6–1 in the MAC) won its fifth straight to stay tied atop the MAC and take a 44–43–4 lead in the 91-game series") >= 0 &&
   band.indexOf("Bowling Green fell to 3–8 (3–4) (Toledo Athletics / AP)") >= 0,
   "spotlight reports Friday's Battle of I-75 Final: Toledo beat Bowling Green 19-0, Griffith's career-high four FGs, Richter 191 yards and the 35-yard Dabbs TD for 16-0 at the half, Toledo's first shutout of BGSU since 1970, Toledo 9-2 atop the MAC with a 44-43-4 series lead and BGSU 3-8 (Toledo Athletics / AP)");
ok(band.indexOf("Clemson beat Duke 20–10 (Final) at Wallace Wade Stadium in Durham") >= 0 &&
   band.indexOf("walk-on Trent Pearman threw for 164 yards and ran for 51 more in his first career start, scoring on a 9-yard run for a 10–0 third-quarter lead") >= 0 &&
   band.indexOf("Chris Denson ran 16 times for 71 yards and scored from the 7 for a 17–7 lead midway through the fourth") >= 0 &&
   band.indexOf("Clemson's defense held Duke to 247 total yards") >= 0 &&
   band.indexOf("Nolan Hauser's 39-yard field goal clinched it with 1:01 left") >= 0 &&
   band.indexOf("Clemson (7–4, 5–3 in the ACC) closed its conference schedule with a birthday win for Dabo Swinney, and Duke (7–4, 4–4) lost its second straight on Senior Night (AP)") >= 0,
   "spotlight reports Friday's Durham Final: Clemson beat Duke 20-10, Pearman's 164 passing yards and 9-yard TD run in his first career start, Denson's 71 yards and 7-yard TD, Duke held to 247 total yards, Hauser's 39-yard clincher with 1:01 left, Clemson 7-4 and Duke 7-4 with a second straight loss (AP)");
ok(band.indexOf("No. 14 Oregon beat Michigan St. 45–7 (Final) at Spartan Stadium in East Lansing") >= 0 &&
   band.indexOf("Brandon Smith set career highs with 121 rushing yards and two touchdowns as an injury replacement at featured back") >= 0 &&
   band.indexOf("kicker Gage Hurych ran for a 15-yard touchdown on a fake field goal with two seconds left in the first half") >= 0 &&
   band.indexOf("Oregon (8–3, 6–2 in the Big Ten) won its fourth straight to keep its College Football Playoff hopes alive while Michigan St. fell to 3–8 (1–7) (AP / NBC Sports)") >= 0,
   "spotlight reports Friday's East Lansing Final: No. 14 Oregon beat Michigan St. 45-7, Smith's career-high 121 yards and two TDs, Hurych's 15-yard fake-field-goal TD, Oregon 8-3 with a fourth straight win and Michigan St. 3-8 (AP / NBC Sports)");
ok(band.indexOf("Air Force beat UTEP 52–3 (Final) at Falcon Stadium") >= 0 &&
   band.indexOf("the Falcons ran for 429 yards and piled up 586 total yards on 64 rushing attempts") >= 0 &&
   band.indexOf("Evan Medders threw two touchdown passes and Maguire Martin one as three of Air Force's four completions went for touchdowns") >= 0 &&
   band.indexOf("Air Force (9–2, 5–2) won on Senior Night in the schools' first meeting since 1995, when both were in the Western Athletic Conference; UTEP fell to 1–10 (0–7) (AP / UTEP Athletics)") >= 0,
   "spotlight reports Friday's Falcon Stadium Final: Air Force beat UTEP 52-3, 429 rushing yards and 586 total on 64 attempts, three of four completions for TDs (Medders two, Martin one), Air Force 9-2 in the schools' first meeting since 1995 and UTEP 1-10 (AP / UTEP Athletics)");
ok(band.indexOf("New Mexico beat Wyoming 24–17 (Final) at War Memorial Stadium in Laramie") >= 0 &&
   band.indexOf("the Lobos led 17–0 in the second quarter and 24–7 after three, outgained Wyoming 433–188 and held the ball for 38:01") >= 0 &&
   band.indexOf("New Mexico (9–2, 6–1 in the Mountain West) won in Laramie for the first time since 2021 to sit atop the Mountain West") >= 0 &&
   band.indexOf("Wyoming (7–4, 6–2) saw its five-game winning streak snapped and its chance to host the conference championship game end with the loss (7220 Sports / Wyoming News)") >= 0,
   "spotlight reports Friday's Laramie Final: New Mexico beat Wyoming 24-17, 17-0 and 24-7 leads with a 433-188 yardage edge and 38:01 of possession, New Mexico 9-2 atop the Mountain West with its first Laramie win since 2021 and Wyoming 7-4 with its five-game streak snapped (7220 Sports / Wyoming News)");
ok(band.indexOf("College football's next slate is today's Saturday card — Albany vs North Carolina A&T, Cornell vs Columbia and Duquesne vs Central Connecticut St. head the Kalshi NCAAF board") === -1 &&
   band.indexOf("College football's Friday night card is Final now too") >= 0 &&
   band.indexOf("College football's next slate is tonight's Friday night card") === -1,
   "spotlight named the Saturday card (Albany/North Carolina A&T, Cornell/Columbia, Duquesne/Central Connecticut St.) as the next college slate on Nov 21 — the card settled that night and is now reported as Finals (detailed pins in the Nov 22 block below) — reports Friday's card as Final and no longer frames the settled Friday card as tonight's slate");
/* The Nov 22 snapshot (fetched 18:49Z NFL / 18:49Z MLB /
   18:50Z NCAAF) settles Saturday's 116-game college card
   — the 96 games occ Nov 21 plus the 20 late kickoffs occ
   Nov 22 00:00-06:30Z all drop out; Tuesday night's
   MACtion pair (Miami (OH) vs Western Michigan, occ
   Nov 24 23:00Z, and Kent St. vs Eastern Michigan, occ
   Nov 25 03:00Z) heads the NCAAF board and Sunday's NFL
   slate (Arizona vs Kansas City first, occ Nov 22
   21:00Z) still heads the NFL board. NFL state: 28
   games, 26 moves, 0 new. NCAAF state: 72 games, 91
   moves, 11 new. The Finals (all cross-checked):
   Michigan beat No. 4 UCLA 18-16 in triple overtime at
   Michigan Stadium (AP / UCLA Athletics) — Underwood's
   6-yard TD to Bonner early in the fourth for 10-3,
   Woods' 1-yard jump pass to Loftin with 10 seconds
   left tied it at the end of a 15-play, 77-yard drive,
   field goals traded through two overtimes, UCLA's
   two-point try failed in the third and Underwood hit
   Hoffman for the winner; Michigan held UCLA to 296
   yards and a season-low 107 rushing and won turnovers
   3-1; Michigan 6-5 (3-5 Big Ten) bowl-eligible, UCLA
   10-1 (7-1) with its first loss and a missed Big Ten
   title-game clinch. No. 1 Georgia beat No. 21 South
   Carolina 34-6 at Williams-Brice Stadium (AP) — SC
   led 6-3 in the second quarter, Georgia scored 31
   unanswered: Frazier 94 yards and two TDs, Stockton
   281 yards and a 14-yard TD to Dandridge Jr., Georgia
   held SC to 118 yards over the final three quarters;
   Georgia 10-1 (8-1 SEC) clinched the SEC title game
   with a record sixth straight appearance, SC 6-5
   (4-5). No. 2 Utah beat TCU 38-17 at Amon G. Carter
   Stadium (AP) — Utah led 17-0, TCU tied it 17-17 on
   Lemmerman's 32-yard FG with 9:26 left, then 21
   unanswered: Andrews' 2-yard TD with 5:46 left,
   Dampier's 85-yard TD pass and 10-yard scoring run
   (68-yard TD pass before halftime); Utah 11-0 (8-0
   Big 12), 17th straight win, the nation's only
   unbeaten team, Big 12 title game clinched; TCU 5-6
   (3-5). No. 9 Tennessee beat LSU 27-13 at Neyland
   Stadium (AP / Tennessee Athletics) — LSU led 6-0 on
   two first-quarter FGs, Tennessee outscored them 27-7
   from there: Brandon 112 rushing yards and two
   fourth-quarter TDs including the 55-yarder with 4:13
   left, eight sacks of Leavitt, LSU held to 265 yards;
   Tennessee 9-2 (6-2 SEC), first home win over LSU
   since 2001; LSU 6-5 (3-5), third straight loss in
   Kiffin's return to Neyland. Nebraska beat No. 14
   Ohio St. 31-28 at Memorial Stadium (USA Today /
   theScore) — Colandrea 200 passing yards and three
   TDs plus a rushing score, the 26-yard TD to Clark
   made it 31-21 with 7:41 left after an Ohio St.
   interception, both Buckeye giveaways became TDs and
   Nebraska committed none; Nebraska 7-4 (4-4 Big Ten)
   snapped a 31-game losing streak vs AP Top 25 dating
   to 2016, Ohio St. 7-4 (5-3) with its Big Ten title
   and CFP hopes over. No. 8 Texas beat Arkansas 45-3
   at Darrell K Royal-Texas Memorial Stadium (AP /
   Texas Athletics) — Manning 21-of-25 for 287 yards
   and two TDs with a 3-yard scoring run and no
   turnovers before sitting the fourth, TD passes to
   Winston (21 yards) and Mosley V (17 yards) in the
   final 2:20 of the first half built the 31-3 halftime
   lead, the Longhorns' biggest of the season; Texas
   9-2 (6-2 SEC), fifth straight win; Arkansas 4-7
   (2-6), no TD for the first time in 41 games, bowl
   eligibility gone. The band (same Nov 16-Nov 23
   window) now headlines the Michigan upset, reports
   Saturday's slate as Final, and names Tuesday's
   MACtion as the next college slate. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV22ARIKC") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV21ALBYNCAT") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV21CORCLMB") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV21DUQCCSU") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV24MOHWMU") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV24KENTEMU") >= 0,
   "kalshi snapshots settle Saturday's 116-game college card (the Albany/North Carolina A&T, Cornell/Columbia and Duquesne/Central Connecticut St. headliners gone) and head the NCAAF board with Tuesday night's MACtion pair (Miami (OH)/Western Michigan, Kent St./Eastern Michigan), with Sunday's NFL slate (Arizona vs Kansas City) still at the NFL head — the Sunday slate settled the next day (Kansas City won 34-7) and its settlement is pinned in the Nov 23 block below");
ok(band.indexOf("Michigan beat No. 4 UCLA 18–16 in triple overtime (Final) at Michigan Stadium in Ann Arbor") >= 0 &&
   band.indexOf("Michigan led 10–3 after Bryce Underwood's 6-yard touchdown pass to Mason Bonner early in the fourth quarter") >= 0 &&
   band.indexOf("UCLA forced overtime at the end of a 15-play, 77-yard drive on Anthony Woods' 1-yard jump pass to Brayden Loftin with 10 seconds left in regulation") >= 0 &&
   band.indexOf("after UCLA's two-point try failed in the third overtime, Underwood found Jalen Hoffman for the winning two-point conversion") >= 0 &&
   band.indexOf("Michigan's defense held the Bruins to 296 total yards and a season-low 107 rushing yards and won the turnover battle 3–1") >= 0 &&
   band.indexOf("UCLA (10–1, 7–1) lost for the first time and missed its chance to clinch a Big Ten championship game spot (AP / UCLA Athletics)") >= 0,
   "spotlight reports Saturday's Ann Arbor Final: Michigan beat No. 4 UCLA 18-16 in triple overtime, Underwood's 6-yard TD to Bonner for 10-3, Woods' 1-yard jump pass to Loftin with 10 seconds left tying it after a 15-play 77-yard drive, Hoffman's winning two-point conversion in the third overtime, UCLA held to 296 yards and a season-low 107 rushing with turnovers 3-1, Michigan 6-5 bowl-eligible and UCLA 10-1 with a first loss (AP / UCLA Athletics)");
ok(band.indexOf("No. 1 Georgia beat No. 21 South Carolina 34–6 (Final) at Williams-Brice Stadium in Columbia") >= 0 &&
   band.indexOf("South Carolina led 6–3 in the second quarter before Georgia scored 31 unanswered points") >= 0 &&
   band.indexOf("Nate Frazier ran for 94 yards and two touchdowns, Gunnar Stockton threw for 281 yards and a 14-yard touchdown to Craig Dandridge Jr.") >= 0 &&
   band.indexOf("Georgia's defense held the Gamecocks to 118 yards over the final three quarters") >= 0 &&
   band.indexOf("Georgia (10–1, 8–1 in the SEC) clinched a spot in the SEC championship game with a record sixth straight appearance") >= 0 &&
   band.indexOf("South Carolina fell to 6–5 (4–5) (AP)") >= 0,
   "spotlight reports Saturday's Columbia Final: No. 1 Georgia beat No. 21 South Carolina 34-6, 31 unanswered after a 6-3 deficit, Frazier 94 yards and two TDs, Stockton 281 yards and the 14-yard TD to Dandridge Jr., South Carolina held to 118 yards over the final three quarters, Georgia 10-1 into the SEC title game with a record sixth straight appearance and South Carolina 6-5 (AP)");
ok(band.indexOf("No. 2 Utah beat TCU 38–17 (Final) at Amon G. Carter Stadium in Fort Worth") >= 0 &&
   band.indexOf("Utah led 17–0 before TCU tied it 17–17 on Kyle Lemmerman's 32-yard field goal with 9:26 left") >= 0 &&
   band.indexOf("Hunter Andrews' 2-yard touchdown run with 5:46 left snapping the tie") >= 0 &&
   band.indexOf("Devon Dampier — who had thrown a 68-yard touchdown pass before halftime — threw an 85-yard touchdown pass and ran for a 10-yard score") >= 0 &&
   band.indexOf("Utah (11–0, 8–0 in the Big 12) won its 17th straight, stayed the nation's only unbeaten team and clinched a Big 12 championship game spot") >= 0 &&
   band.indexOf("TCU fell to 5–6 (3–5) (AP)") >= 0,
   "spotlight reports Saturday's Fort Worth Final: No. 2 Utah beat TCU 38-17, TCU tying 17-17 on Lemmerman's 32-yard FG with 9:26 left before 21 unanswered Ute points, Andrews' 2-yard tiebreaker with 5:46 left, Dampier's 68-yard and 85-yard TD passes and 10-yard scoring run, Utah 11-0 with a 17th straight win as the nation's only unbeaten team and a Big 12 title game spot, TCU 5-6 (AP)");
ok(band.indexOf("No. 9 Tennessee beat LSU 27–13 (Final) at Neyland Stadium in Knoxville") >= 0 &&
   band.indexOf("LSU led 6–0 on two first-quarter field goals, but Tennessee outscored the Tigers 27–7 the rest of the way") >= 0 &&
   band.indexOf("freshman Faizon Brandon, who ran for 112 yards and two fourth-quarter touchdowns including the 55-yarder with 4:13 left") >= 0 &&
   band.indexOf("a defense that sacked Sam Leavitt eight times and held LSU to 265 total yards") >= 0 &&
   band.indexOf("Tennessee (9–2, 6–2 in the SEC) beat LSU at home for the first time since 2001") >= 0 &&
   band.indexOf("LSU (6–5, 3–5) lost its third straight in Lane Kiffin's return to Neyland Stadium (AP / Tennessee Athletics)") >= 0,
   "spotlight reports Saturday's Knoxville Final: No. 9 Tennessee beat LSU 27-13, outscoring the Tigers 27-7 after a 6-0 deficit, Brandon's 112 rushing yards and two fourth-quarter TDs including the 55-yarder with 4:13 left, eight sacks of Leavitt and LSU held to 265 yards, Tennessee 9-2 with its first home win over LSU since 2001 and LSU 6-5 with a third straight loss (AP / Tennessee Athletics)");
ok(band.indexOf("Nebraska beat No. 14 Ohio St. 31–28 (Final) at Memorial Stadium in Lincoln") >= 0 &&
   band.indexOf("Anthony Colandrea threw for 200 yards and three touchdowns and ran for a fourth score") >= 0 &&
   band.indexOf("his 26-yard touchdown pass to Quinn Clark made it 31–21 with 7:41 left after an Ohio St. interception") >= 0 &&
   band.indexOf("Nebraska turned both Buckeye giveaways into touchdowns while committing none of its own") >= 0 &&
   band.indexOf("Nebraska (7–4, 4–4 in the Big Ten) snapped a 31-game losing streak against AP Top 25 opponents dating to 2016") >= 0 &&
   band.indexOf("Ohio St. (7–4, 5–3) saw its Big Ten title and College Football Playoff hopes end (USA Today / theScore)") >= 0,
   "spotlight reports Saturday's Lincoln Final: Nebraska beat No. 14 Ohio St. 31-28, Colandrea's 200 passing yards and three TDs plus a rushing score, the 26-yard TD to Clark for 31-21 with 7:41 left after an interception, both Buckeye giveaways turned into TDs with none committed, Nebraska 7-4 snapping a 31-game losing streak vs the AP Top 25 dating to 2016 and Ohio St. 7-4 with its title and CFP hopes over (USA Today / theScore)");
ok(band.indexOf("No. 8 Texas beat Arkansas 45–3 (Final) at Darrell K Royal–Texas Memorial Stadium in Austin") >= 0 &&
   band.indexOf("Arch Manning was 21-of-25 for 287 yards and two touchdowns with a 3-yard scoring run and no turnovers before sitting out the fourth quarter") >= 0 &&
   band.indexOf("his touchdown passes to Emaree Winston (21 yards) and Emmett Mosley V (17 yards) in the final 2:20 of the first half built a 31–3 halftime lead, the Longhorns' biggest of the season") >= 0 &&
   band.indexOf("Texas (9–2, 6–2 in the SEC) won its fifth straight") >= 0 &&
   band.indexOf("Arkansas (4–7, 2–6) went without a touchdown for the first time in 41 games and lost its bowl eligibility (AP / Texas Athletics)") >= 0,
   "spotlight reports Saturday's Austin Final: No. 8 Texas beat Arkansas 45-3, Manning 21-of-25 for 287 yards and two TDs with a 3-yard scoring run and no turnovers, the Winston (21 yards) and Mosley V (17 yards) TDs in the final 2:20 of the half building a 31-3 lead, Texas 9-2 with a fifth straight win and Arkansas 4-7 without a TD for the first time in 41 games (AP / Texas Athletics)");
ok(band.indexOf("College football's next slate is tonight's Tuesday MACtion — Miami (OH) vs Western Michigan and Kent St. vs Eastern Michigan head the Kalshi NCAAF board") >= 0 &&
   band.indexOf("College football's Saturday slate is Final now too") >= 0 &&
   band.indexOf("College football's next slate is today's Saturday card") === -1,
   "spotlight names tonight's Tuesday MACtion (Miami (OH)/Western Michigan, Kent St./Eastern Michigan) as the next college slate — this pin named it as Tuesday night's slate on Nov 23, when the pair was a day away; it is tonight's slate on Nov 24 — reports Saturday's card as Final and no longer frames the settled Saturday card as today's slate");
/* The Nov 23 snapshot (fetched 18:49Z NFL / 18:49Z MLB /
   18:50Z NCAAF) settles Sunday's 11-game NFL slate — all
   eleven Nov 22 games drop out; tonight's Week 12 closer
   (Cincinnati at Washington, occ Nov 24 01:15Z) heads the
   NFL board and Tuesday night's MACtion pair still heads
   the NCAAF board. NFL state: 17 games, 24 moves, 0 new.
   NCAAF state: 72 games, 80 moves, 0 new. The Finals
   (all cross-checked): San Francisco beat Minnesota
   35-10 on Sunday night at Estadio Banorte in Mexico
   City (NBC Sports / Vikings) — Purdy 21-of-26 for 255
   yards and three TDs with no interceptions, 21
   second-quarter points for a 28-10 halftime lead
   against a defense that had allowed a league-low 14.5
   points per game, McCaffrey's 5-yard TD run capped a
   98-yard drive, Evans six catches for 109 yards with a
   one-handed TD grab; San Francisco 9-1 atop the NFC,
   Minnesota 7-3 (Cousins 235 yards and a pick-six before
   Wentz finished). Kansas City beat Arizona 34-7 at
   Arrowhead Stadium (Niners Nation) — Mahomes 324 yards
   and three TDs, two to Kelce, 435 total yards; Arizona
   3-8 started 40-year-old Josh Johnson with Beck ailing,
   his 2-yard TD to Fehoko the Cardinals' only score.
   Carolina beat Baltimore 35-33 at Bank of America
   Stadium (SI / Tar Heel Tribune) — Baltimore led 12-0
   after an early safety, then a fumble out of the end
   zone for a touchback, two muffed punts and four
   turnovers in a sixth straight loss; Walker's 86-yard
   kickoff-return TD made it 19-14 Ravens, Hubbard 120
   yards and two TDs, Young 254 yards and two scores,
   Fitzgerald's 37-yard FG with 1:44 left won it;
   Carolina 5-5, Baltimore 4-7. Dallas beat Tennessee
   51-30 at AT&T Stadium (Bleacher Report) — Prescott
   28-of-33 for 325 yards and four TDs plus a rushing
   score, touchdowns on the Cowboys' first six
   possessions and scores on all eight meaningful drives,
   the first 51-30 final in NFL history (Scorigami).
   The rest: Buffalo 26-9 Miami, Detroit 31-21 Tampa
   Bay, Philadelphia 19-16 Pittsburgh, the Jets 27-24
   over the Chargers, the Giants 23-18 Jacksonville,
   Chicago 21-13 New Orleans, Denver 38-24 Las Vegas.
   The band (same Nov 16-Nov 23 window, its last day)
   now headlines the 49ers rout, reports Sunday's slate
   as Final, and frames Week 12 as closing tonight. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV22ARIKC") === -1 &&
   nflTickers.indexOf("KXNFLGAME-26NOV22MINSF") === -1 &&
   nflTickers.indexOf("KXNFLGAME-26NOV22BALCAR") === -1 &&
   nflTickers.indexOf("KXNFLGAME-26NOV22TENDAL") === -1 &&
   nflTickers.indexOf("KXNFLGAME-26NOV23CINWAS") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV24MOHWMU") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV24KENTEMU") >= 0,
   "kalshi snapshots settle Sunday's 11-game NFL slate (Arizona/Kansas City, Minnesota/San Francisco, Baltimore/Carolina and Tennessee/Dallas gone) and headed the NFL board with the Week 12 closer (Cincinnati at Washington) — this pin kept the closer on the board on Nov 23; it settled Monday night (Washington won 22-20, Final) and its settlement is pinned in the Nov 24 block below — with Tuesday night's MACtion pair still heading the NCAAF board");
ok(band.indexOf("San Francisco beat Minnesota 35–10 (Final) on Sunday night at Estadio Banorte in Mexico City") >= 0 &&
   band.indexOf("Brock Purdy was 21-of-26 for 255 yards and three touchdowns with no interceptions") >= 0 &&
   band.indexOf("the 49ers scored 21 points in the second quarter to lead 28–10 at the half against a Minnesota defense that had allowed a league-low 14.5 points per game") >= 0 &&
   band.indexOf("Christian McCaffrey's 5-yard touchdown run capped a 98-yard drive") >= 0 &&
   band.indexOf("Mike Evans caught six passes for 109 yards including a one-handed touchdown grab") >= 0 &&
   band.indexOf("San Francisco (9–1) strengthened its hold on the NFC's top seed while Minnesota (7–3) got 235 passing yards and a pick-six from Kirk Cousins before Carson Wentz finished the game (NBC Sports / Vikings)") >= 0,
   "spotlight reports Sunday night's Mexico City Final: San Francisco beat Minnesota 35-10, Purdy 21-of-26 for 255 yards and three TDs with no interceptions, 21 second-quarter points for a 28-10 halftime lead against the league-low 14.5-points-allowed defense, McCaffrey's 5-yard TD capping a 98-yard drive, Evans 6-109 with a one-handed TD grab, San Francisco 9-1 atop the NFC and Minnesota 7-3 with Cousins' 235 yards and a pick-six before Wentz finished (NBC Sports / Vikings)");
ok(band.indexOf("Kansas City beat Arizona 34–7 (Final) at Arrowhead Stadium") >= 0 &&
   band.indexOf("Patrick Mahomes threw for 324 yards and three touchdowns, two of them to Travis Kelce, the Chiefs (8–2) piled up 435 total yards") >= 0 &&
   band.indexOf("Arizona (3–8) started 40-year-old Josh Johnson with rookie Carson Beck ailing, its only score his 2-yard touchdown pass to Simi Fehoko in the second quarter (Niners Nation)") >= 0,
   "spotlight reports Sunday's Arrowhead Final: Kansas City beat Arizona 34-7, Mahomes 324 yards and three TDs with two to Kelce and 435 total yards, Arizona 3-8 starting 40-year-old Josh Johnson with Beck ailing and Fehoko's 2-yard catch the only score (Niners Nation)");
ok(band.indexOf("Carolina beat Baltimore 35–33 (Final) at Bank of America Stadium") >= 0 &&
   band.indexOf("Baltimore (4–7) led 12–0 after forcing an early safety but fumbled a ball out of the back of the end zone for a touchback, muffed two punts and committed four turnovers in its sixth straight loss") >= 0 &&
   band.indexOf("Tez Walker's 86-yard kickoff-return touchdown put the Ravens ahead 19–14 in the second quarter") >= 0 &&
   band.indexOf("Chuba Hubbard ran for 120 yards and two touchdowns, Bryce Young threw for 254 yards and two scores") >= 0 &&
   band.indexOf("Ryan Fitzgerald's 37-yard field goal with 1:44 left won it for the Panthers (5–5) (SI / Tar Heel Tribune)") >= 0,
   "spotlight reports Sunday's Charlotte Final: Carolina beat Baltimore 35-33, the Ravens blowing a 12-0 lead with a fumble out of the end zone, two muffed punts and four turnovers in a sixth straight loss, Walker's 86-yard kickoff-return TD for 19-14, Hubbard 120 yards and two TDs, Young 254 yards and two scores, Fitzgerald's 37-yard FG with 1:44 left winning it for 5-5 Carolina (SI / Tar Heel Tribune)");
ok(band.indexOf("Dallas beat Tennessee 51–30 (Final) at AT&T Stadium") >= 0 &&
   band.indexOf("Dak Prescott was 28-of-33 for 325 yards and four touchdowns and ran for a fifth score") >= 0 &&
   band.indexOf("the Cowboys scored on all eight of their meaningful possessions with touchdowns on their first six") >= 0 &&
   band.indexOf("the 51–30 final was a Scorigami, the first in NFL history (Bleacher Report)") >= 0,
   "spotlight reports Sunday's Arlington Final: Dallas beat Tennessee 51-30, Prescott 28-of-33 for 325 yards and four TDs plus a rushing score, touchdowns on the first six possessions and scores on all eight meaningful drives, the first 51-30 final in NFL history (Bleacher Report)");
ok(band.indexOf("Buffalo beat Miami 26–9 (Final), Detroit beat Tampa Bay 31–21 (Final), Philadelphia beat Pittsburgh 19–16 (Final), the New York Jets beat the Los Angeles Chargers 27–24 (Final), the New York Giants beat Jacksonville 23–18 (Final), Chicago beat New Orleans 21–13 (Final) and Denver beat Las Vegas 38–24 (Final)") >= 0,
   "spotlight reports Sunday's remaining Finals list: Buffalo over Miami 26-9, Detroit over Tampa Bay 31-21, Philadelphia over Pittsburgh 19-16, the Jets over the Chargers 27-24, the Giants over Jacksonville 23-18, Chicago over New Orleans 21-13 and Denver over Las Vegas 38-24");
ok(band.indexOf("Week 12 closed Monday night in Landover, where Washington beat Cincinnati 22–20 (Final) at Northwest Stadium") >= 0 &&
   band.indexOf("Week 12's Sunday slate is Final now too") >= 0 &&
   band.indexOf("Week 12 closes tonight, Monday night, Nov 23, when Cincinnati visits Washington") === -1 &&
   band.indexOf("Week 12 runs through Monday night, Nov 23, when Cincinnati visits Washington — Sunday night is Minnesota at San Francisco") === -1,
   "spotlight frames Week 12 as closed (Monday night, Nov 23, in Landover — Washington beat Cincinnati 22-20, Final; detailed pins in the Nov 24 block below), reports Sunday's slate as Final and no longer frames the closer or Sunday night as fixtures — this pin held the closes-tonight framing on Nov 23, the old window's last day");
/* The Nov 24 snapshot (fetched 18:50Z NFL / 18:50Z MLB /
   18:52Z NCAAF) settles Monday night's Week 12 closer \u2014
   Cincinnati at Washington drops out, Green Bay at the
   Los Angeles Rams heads the NFL board and Week 14's
   first 14 games are added (Thu Dec 3 Kansas City at the
   Los Angeles Rams through Mon Dec 7 Dallas at Seattle).
   NFL state: 30 games, 1 move, 14 new. NCAAF state: 73
   games, 38 moves, 1 new (Sat Nov 28 Illinois vs
   Northwestern) \u2014 tonight's Tuesday MACtion pair still
   heads the board. The MNF Final (cross-checked AP via
   theScore / Bengals / Commanders Wire / USA Today):
   Washington beat Cincinnati 22-20 at Northwest Stadium
   in Landover \u2014 rookie Drew Stevens kicked five field
   goals, all in the second half, the last a 26-yarder as
   time expired after Jayden Daniels, taking over at his
   own 28 with 39 seconds left and no timeouts after Evan
   McPherson's 56-yard field goal had put Cincinnati
   ahead 20-19 with 46 seconds left, hit rookie Antonio
   Williams for 22 yards and then on a 42-yard
   catch-and-run to the Cincinnati 8; Daniels finished
   with 283 passing yards and a team-high 55 rushing
   yards, Williams caught nine passes for 122 yards, and
   Washington (4-5-1) ended the game with six consecutive
   scoring drives of 50-plus yards, the first team in at
   least 30 years to do so (OptaSTATS), while its defense
   held Joe Burrow (300 yards, two touchdowns) to
   checkdowns \u2014 Ja'Marr Chase and Tee Higgins combined
   for just seven catches for 74 yards \u2014 as Cincinnati
   (7-3) saw its five-game winning streak, in which it
   had scored at least 31 points every week, snapped.
   The band ROLLS to a new Nov 24-Nov 30 window (the
   Nov 16-23 window expired after Monday night): it
   headlines the walk-off, reports Week 12 as closed,
   names the full Week 13 Thanksgiving slate, frames
   tonight's MACtion as tonight's, and links the Week 13
   Kalshi prices. */
ok(nflTickers.indexOf("KXNFLGAME-26NOV23CINWAS") === -1 &&
   nflTickers[0] === "KXNFLGAME-26NOV25GBLAR" &&
   nflTickers.indexOf("KXNFLGAME-26DEC03KCLAR") >= 0 &&
   nflTickers.indexOf("KXNFLGAME-26DEC07DALSEA") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV24MOHWMU") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV24KENTEMU") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV28ILLNW") >= 0,
   "kalshi snapshots settle Monday night's Week 12 closer (Cincinnati at Washington gone \u2014 Washington won 22-20, Final), head the NFL board with Thanksgiving Eve (Green Bay at the Los Angeles Rams) and add Week 14's first 14 games (Kansas City at the Los Angeles Rams through Dallas at Seattle), with tonight's MACtion pair still heading the NCAAF board and Illinois vs Northwestern the one new college game");
ok(band.indexOf("Washington beat Cincinnati 22\u201320 (Final) at Northwest Stadium") >= 0 &&
   band.indexOf("rookie Drew Stevens kicked five field goals, all in the second half, the last a 26-yarder as time expired") >= 0 &&
   band.indexOf("taking over at his own 28 with 39 seconds left and no timeouts after Evan McPherson's 56-yard field goal had put Cincinnati ahead 20\u201319 with 46 seconds left") >= 0 &&
   band.indexOf("hit rookie Antonio Williams for 22 yards and then on a 42-yard catch-and-run to the Cincinnati 8") >= 0,
   "spotlight reports Monday night's Landover Final: Washington beat Cincinnati 22-20, Stevens' five field goals all in the second half with the 26-yard walk-off as time expired, Daniels taking over at his own 28 with 39 seconds left and no timeouts after McPherson's 56-yarder put Cincinnati up 20-19 with 46 seconds left, and the two Williams throws (22 yards, then a 42-yard catch-and-run to the 8) (AP via theScore)");
ok(band.indexOf("Daniels finished with 283 passing yards and a team-high 55 rushing yards, Williams caught nine passes for 122 yards") >= 0 &&
   band.indexOf("Washington (4\u20135\u20131) ended the game with six consecutive scoring drives of 50-plus yards, the first team in at least 30 years to do so (OptaSTATS)") >= 0 &&
   band.indexOf("its defense held Joe Burrow (300 yards and two touchdowns) to checkdowns \u2014 Ja'Marr Chase and Tee Higgins combined for just seven catches for 74 yards") >= 0 &&
   band.indexOf("Cincinnati (7\u20133) saw its five-game winning streak, in which it had scored at least 31 points every week, snapped (AP via theScore)") >= 0,
   "spotlight reports the MNF detail: Daniels 283 passing yards and a team-high 55 rushing, Williams 9 catches for 122 yards, Washington 4-5-1 with six straight 50-plus-yard scoring drives (first team in at least 30 years, OptaSTATS), Burrow's 300 yards and two TDs held to checkdowns with Chase and Higgins combining for 7 catches and 74 yards, and 7-3 Cincinnati's five-game win streak (31-plus points every week) snapped (AP via theScore)");
ok(band.indexOf("Week 13 opens Wednesday night, Nov 25 \u2014 Thanksgiving Eve \u2014 when Green Bay visits the Los Angeles Rams at SoFi Stadium in the NFL's first Thanksgiving Eve game") >= 0 &&
   band.indexOf("continues Thanksgiving Day, Thursday, Nov 26, with Chicago at Detroit, Philadelphia at Dallas and Kansas City at Buffalo") >= 0 &&
   band.indexOf("then Black Friday, Nov 27, with Denver at Pittsburgh, Sunday's ten-game slate on Nov 29 and Monday night's closer, Nov 30, when Carolina visits Tampa Bay") >= 0 &&
   band.indexOf("Kalshi Week 13 prices") >= 0,
   "spotlight names the Week 13 Thanksgiving slate in the new Nov 24-Nov 30 window: Thanksgiving Eve Wed Nov 25 (Green Bay at the Los Angeles Rams, the NFL's first Thanksgiving Eve game), Thanksgiving Day Thu Nov 26 (Chicago at Detroit, Philadelphia at Dallas, Kansas City at Buffalo), Black Friday Nov 27 (Denver at Pittsburgh), Sunday's ten games Nov 29 and the Mon Nov 30 closer (Carolina at Tampa Bay) \u2014 and links the Week 13 Kalshi prices");
ok(band.indexOf("College football's next slate is tonight's Tuesday MACtion \u2014 Miami (OH) vs Western Michigan and Kent St. vs Eastern Michigan head the Kalshi NCAAF board") >= 0 &&
   band.indexOf("San Francisco dismantled Minnesota 35\u201310 on Sunday night in Mexico City") === -1,
   "spotlight frames tonight's Tuesday MACtion as tonight's in the new window and no longer carries the Nov 23 San Francisco headline (the 49ers result itself stays in the body, pinned in the Nov 23 block above)");
["UUoLrcjPV5PbUrUyXq5mjc_A", "UUiio0ydw439X13KyZgMIcHw", "UUvQrivswRDGK0lZ_AcUHp8g"].forEach(function(id){
  ok(band.indexOf("list=" + id) >= 0, "spotlight links the real playlist " + id);
});
ok(band.indexOf('href="markets.html"') >= 0, "spotlight links the markets page for Kalshi prices");
var ytFrames = (html.match(/<iframe[^>]*youtube\.com\/embed\//g) || []).length;
ok(ytFrames === 7, "watch.html still embeds exactly 7 youtube players (NFL card stays a link, no embed)");

console.log("\n" + (fails ? fails + " FAILURES (" + n + " checks)" : "ALL " + n + " CHECKS PASSED"));
process.exit(fails ? 1 : 0);
