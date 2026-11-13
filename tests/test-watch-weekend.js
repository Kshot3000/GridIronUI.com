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
ok(/id="weekend-spotlight"[^>]*data-start="2026-11-09"[^>]*data-end="2026-11-16"[^>]*hidden/.test(html),
   "spotlight band ships hidden with the Nov 9-Nov 16 window in data attributes");
var band = html.slice(html.indexOf('id="weekend-spotlight"'));
band = band.slice(0, band.indexOf("</section>"));
ok(band.indexOf("This band shows Nov 9–Nov 16 only, then hides itself") >= 0,
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
ok(band.indexOf(week11.length + "-game") >= 0 && week11.length === 13,
   "spotlight's Week 11 remainder count matches the Kalshi NFL snapshot (" + week11.length + " games left in the Nov 13-17Z window — this pin held the full 14-game slate while the week was unplayed; it follows the remainder once the Thursday opener settles, per the Week 8/9 precedent above, and the opener's settlement is pinned in the Nov 13 block below)");
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
   band.indexOf("Sunday night is Pittsburgh vs Cincinnati") >= 0 &&
   band.indexOf("closes Monday night, Nov 16, with the Los Angeles Chargers at Baltimore") >= 0,
   "spotlight reports the Week 10 closer as a Final (Buffalo beat Minnesota 23-6; detailed pins in the Nov 10 block below — this pin named it as tonight's fixture on Nov 9) and the Week 11 opener as a Final too (Washington beat the New York Giants 24-21; detailed pins in the Nov 13 block below — this pin named it as Thursday's fixture on Nov 9), still naming the rest of the Week 11 slate (SNF Pittsburgh vs Cincinnati, MNF Nov 16 Chargers at Baltimore)");
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
ok(band.indexOf("Jayden Daniels hit Stefon Diggs for a 32-yard touchdown with 57 seconds left as Washington rallied past the New York Giants 24–21") >= 0 &&
   band.indexOf("a season-saving Thursday night win that kept the Commanders alive in the NFC East") >= 0,
   "spotlight headlines Thursday's Week 11 opener: Daniels' 32-yard touchdown to Diggs with 57 seconds left as Washington rallied past the New York Giants 24-21, a season-saving win that kept the Commanders alive in the NFC East (this pin held the Nov 12 Burch headline — a career-high 209 yards in the Muncie rain as Buffalo beat Ball State 28-7 — which rolled to the Daniels night on Nov 13; the Burch result stays pinned as a body result in the Nov 12 block below)");
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
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV12ULLULM") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13FSUPITT") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13ILLUCLA") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13SUUPRST") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13HOUCOLO") >= 0,
   "kalshi-ncaaf.json settles Wednesday's MACtion trio (Buffalo/Ball St., UMass/Toledo, Sacramento St./Central Michigan gone) — the Thursday pair this pin kept on Nov 12 (Memphis vs South Florida, Louisiana vs Louisiana-Monroe) settled Thursday night and is pinned as gone in the Nov 13 block below, which heads tonight's Friday quartet (Florida St. vs Pittsburgh, Illinois vs UCLA, Southern Utah vs Portland St., Houston vs Colorado)");
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
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV12ULLULM") === -1 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13FSUPITT") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13ILLUCLA") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13SUUPRST") >= 0 &&
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV13HOUCOLO") >= 0,
   "kalshi snapshots settle Thursday's Week 11 opener (Washington at the New York Giants gone) and Thursday's college pair (Memphis/South Florida, Louisiana/Louisiana-Monroe gone) and head tonight's Friday quartet (Florida St. vs Pittsburgh, Illinois vs UCLA, Southern Utah vs Portland St., Houston vs Colorado)");
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
   band.indexOf("Week 11's remaining <strong>13-game</strong> slate runs through Sunday, Nov 15") >= 0,
   "spotlight closes TNF with the records (Washington 3-5-1 with the tiebreaker, Giants 5-3-1) and names Week 11's remaining 13-game slate through Sunday, Nov 15 (Reuters)");
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
ok(band.indexOf("opens tonight, Friday night, Nov 13") >= 0 &&
   band.indexOf("Florida St. vs Pittsburgh, Illinois vs UCLA, Southern Utah vs Portland St. and Houston vs Colorado head the Kalshi NCAAF board") >= 0,
   "spotlight names the next college slate: tonight's Friday Nov 13 quartet (Florida St. vs Pittsburgh, Illinois vs UCLA, Southern Utah vs Portland St., Houston vs Colorado)");
ok(band.indexOf("opens tonight, Thursday night, Nov 12") === -1 &&
   band.indexOf("Memphis vs South Florida and Louisiana vs Louisiana-Monroe head the Kalshi NCAAF board") === -1 &&
   band.indexOf("Messiah Burch ran for a career-high 209 yards in the Muncie rain") === -1 &&
   band.indexOf("slate opens Thursday night, Nov 12, with Washington at the New York Giants") === -1,
   "spotlight no longer frames the settled Thursday pair or the settled TNF opener as tonight's fixtures and no longer carries the Nov 12 Burch headline (the Burch result itself stays in the body, pinned in the Nov 12 block above)");
["UUoLrcjPV5PbUrUyXq5mjc_A", "UUiio0ydw439X13KyZgMIcHw", "UUvQrivswRDGK0lZ_AcUHp8g"].forEach(function(id){
  ok(band.indexOf("list=" + id) >= 0, "spotlight links the real playlist " + id);
});
ok(band.indexOf('href="markets.html"') >= 0, "spotlight links the markets page for Kalshi prices");
var ytFrames = (html.match(/<iframe[^>]*youtube\.com\/embed\//g) || []).length;
ok(ytFrames === 7, "watch.html still embeds exactly 7 youtube players (NFL card stays a link, no embed)");

console.log("\n" + (fails ? fails + " FAILURES (" + n + " checks)" : "ALL " + n + " CHECKS PASSED"));
process.exit(fails ? 1 : 0);
