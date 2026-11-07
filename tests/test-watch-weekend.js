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
ok(/id="weekend-spotlight"[^>]*data-start="2026-11-03"[^>]*data-end="2026-11-09"[^>]*hidden/.test(html),
   "spotlight band ships hidden with the Nov 3-Nov 9 window in data attributes");
var band = html.slice(html.indexOf('id="weekend-spotlight"'));
band = band.slice(0, band.indexOf("</section>"));
ok(band.indexOf("This band shows Nov 3–Nov 9 only, then hides itself") >= 0,
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
ok(band.indexOf(week10.length + "-game") >= 0,
   "spotlight's Week 10 game count matches the Kalshi NFL snapshot (" + week10.length + " games in the Nov 6-10Z window)");
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
   ncaafTickers.indexOf("KXNCAAFGAME-26NOV07BYUUTAH") >= 0,
   "kalshi-ncaaf.json settles Friday's quintet (Virginia Tech/SMU, South Florida/East Carolina, Nebraska/Illinois, New Mexico/Nevada, TCU/Arizona gone) and heads today's Saturday slate (BYU vs Utah)");
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
ok(band.indexOf("Saturday slate takes over today, Nov 7") >= 0 &&
   band.indexOf("BYU vs Utah") >= 0 &&
   band.indexOf("Alabama vs LSU") >= 0,
   "spotlight names today's Saturday college slate (BYU vs Utah, Texas vs Missouri, UCLA vs Minnesota, Alabama vs LSU)");
ok(band.indexOf("College football continues tonight, Friday Nov 6") === -1 &&
   band.indexOf("Virginia Tech vs SMU, South Florida vs East Carolina") === -1,
   "spotlight no longer frames the settled Friday quintet as tonight's fixtures");
["UUoLrcjPV5PbUrUyXq5mjc_A", "UUiio0ydw439X13KyZgMIcHw", "UUvQrivswRDGK0lZ_AcUHp8g"].forEach(function(id){
  ok(band.indexOf("list=" + id) >= 0, "spotlight links the real playlist " + id);
});
ok(band.indexOf('href="markets.html"') >= 0, "spotlight links the markets page for Kalshi prices");
var ytFrames = (html.match(/<iframe[^>]*youtube\.com\/embed\//g) || []).length;
ok(ytFrames === 7, "watch.html still embeds exactly 7 youtube players (NFL card stays a link, no embed)");

console.log("\n" + (fails ? fails + " FAILURES (" + n + " checks)" : "ALL " + n + " CHECKS PASSED"));
process.exit(fails ? 1 : 0);
