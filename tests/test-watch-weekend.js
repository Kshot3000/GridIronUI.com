/* GridIronUI — watch page weekend pass (v1.148.0).
   Branded per-outlet posters (W.OUTLETS lookup keyed by the uploads-playlist
   list id, outlet accent hue on the poster button) and the date-gated
   #weekend-spotlight band (shown only inside its data-start/data-end window,
   removes itself outside it). Also pins the editorial claims in the spotlight
   against the real data files so the copy can never drift from the snapshot:
   the World Series Game 3/4 fixtures come from
   data/kalshi-mlb.json and the Week 8/9 game counts from data/kalshi-nfl.json.
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
ok(/id="weekend-spotlight"[^>]*data-start="2026-10-25"[^>]*data-end="2026-11-02"[^>]*hidden/.test(html) ||
   /id="weekend-spotlight"[^>]*hidden/.test(html) && html.indexOf('data-start="2026-10-25"') >= 0,
   "spotlight band ships hidden with the Oct 25-Nov 2 window in data attributes");
var band = html.slice(html.indexOf('id="weekend-spotlight"'));
band = band.slice(0, band.indexOf("</section>"));
ok(band.indexOf("This band shows Oct 25–Nov 2 only, then hides itself") >= 0,
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
   title joins the settled ban list in the Game 1 block below. */
ok(g1.length === 1, "kalshi-mlb.json carries exactly one Game 3/4 — World Series Game 4 in Tampa Bay, Game 3 settled Milwaukee 10-1 (Final) (" + g1.length + " found)");
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
   World Series Game 5 or 6 is listed yet, so both pins stay 0. */
var g5 = mlb.games.filter(function(g){ return /^Game 5:/.test(g.title); })
                 .map(function(g){ return g.title; });
ok(g5.length === 0, "kalshi-mlb.json carries no Game 5 — the ALCS Game 5 is settled and no World Series Game 5 is listed yet (" + g5.length + " found)");
ok(band.indexOf("Game 5: Tampa Bay vs Cleveland") === -1,
   "spotlight no longer lists the settled ALCS Game 5 as a fixture");
var g6 = mlb.games.filter(function(g){ return /^Game 6:/.test(g.title); })
                 .map(function(g){ return g.title; });
ok(g6.length === 0, "kalshi-mlb.json carries no Game 6 — the ALCS Game 6 is settled and no World Series Game 6 is listed yet (" + g6.length + " found)");
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
   "-game" count the band does name is Week 9's, pinned below. */
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
ok(band.indexOf(week9.length + "-game") >= 0,
   "spotlight's Week 9 game count matches the Kalshi NFL snapshot (" + week9.length + " games in the Oct 30-Nov 3Z window)");
["UUoLrcjPV5PbUrUyXq5mjc_A", "UUiio0ydw439X13KyZgMIcHw", "UUvQrivswRDGK0lZ_AcUHp8g"].forEach(function(id){
  ok(band.indexOf("list=" + id) >= 0, "spotlight links the real playlist " + id);
});
ok(band.indexOf('href="markets.html"') >= 0, "spotlight links the markets page for Kalshi prices");
var ytFrames = (html.match(/<iframe[^>]*youtube\.com\/embed\//g) || []).length;
ok(ytFrames === 7, "watch.html still embeds exactly 7 youtube players (NFL card stays a link, no embed)");

console.log("\n" + (fails ? fails + " FAILURES (" + n + " checks)" : "ALL " + n + " CHECKS PASSED"));
process.exit(fails ? 1 : 0);
