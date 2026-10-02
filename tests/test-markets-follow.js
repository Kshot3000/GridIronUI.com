/* Tests for followed teams on the Markets page (v1.155.0, js/markets.js).
   The odds board's ★ follows (js/team-follow.js, localStorage
   "giu-followed-teams") already mark odds / scores / predictions /
   injuries / weather; they now mark BOTH sources on this page too:
   followed-team games get a gold rail + "★ Your team" tag, Polymarket
   cards gain #pm-<slug> anchors, and a "Your teams" jump strip opens
   the board with one chip per followed game on the active tab — a
   Kalshi chip for a game hidden behind "Show all N games" expands the
   list before landing. Covers:
   - the pure followedPM contract (both title sides resolved via the
     injected teamFind, normalization, first-followed wins, pmKey
     sanitization, garbage in -> [])
   - the pure followedKalshi contract (sub abbreviations normalized via
     the injected norm — Kalshi WAS -> ESPN WSH — settled games and
     abbr-less subs never match, garbage in -> [])
   - DOM wiring with the REAL team-follow.js + seeded localStorage:
     Kalshi tab strip chips (shown vs data-expand), card marks, chip
     click expanding the list, tab round-trip, corrupt storage
   - the Polymarket tab: strip + card marks from a stubbed gamma feed
   - shipped-file pins (markets.html wiring + cache keys + styles)
   Run: node tests/test-markets-follow.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function eq(a, b, msg){ assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

var ABBR = { "philadelphia eagles": "PHI", "chicago bears": "CHI", "detroit lions": "DET",
             "kansas city chiefs": "KC", "buffalo bills": "BUF", "washington commanders": "WSH" };
function findStub(dir, league, q){
  var a = ABBR[String(q || "").toLowerCase()];
  return a ? { abbr: a } : null;
}
var ALIAS = { JAC: "JAX", WAS: "WSH", CWS: "CHW" };
function normStub(a){ a = String(a || "").trim().toUpperCase(); return ALIAS[a] || a; }

function escStub(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function makeEl(id){
  var handlers = {};
  var el = { id: id || "", innerHTML: "", textContent: "", style: {}, hidden: false,
    _attrs: {}, _children: [],
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    insertAdjacentHTML: function(pos, html){ if(pos === "afterbegin") this.innerHTML = String(html) + this.innerHTML; else this.innerHTML += String(html); },
    querySelector: function(){ return null; },
    classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){ return false; } },
    _fire: function(ev, target, extra){
      var e = { target: target || this };
      if(extra) for(var k in extra) e[k] = extra[k];
      (handlers[ev] || []).forEach(function(fn){ fn.call(this, e); }, this);
    },
    _handlers: handlers };
  return el;
}

/* Sandbox builder: real kalshi-logic + disagree-logic + team-follow in a
   vm, GIU stubs with a caller-supplied fetchJSON. `seed` is the raw
   localStorage value for giu-followed-teams (null = key absent). */
function buildSandbox(fetchJSON, seed){
  var els = {};
  function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
  ["marketGrid", "marketNote", "marketTabs", "liveStatus", "pauseBtn", "followStrip"].forEach(getEl);
  var store = {};
  if(seed !== null && seed !== undefined) store["giu-followed-teams"] = seed;
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(){ return 0; }, clearInterval: function(){},
    localStorage: { getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
                    setItem: function(k, v){ store[k] = String(v); } },
    document: { getElementById: getEl, hidden: false }, window: {},
    GIU: { fetchJSON: fetchJSON,
           pmEventsUrl: function(sid){ return "https://gamma-api.polymarket.com/events?series_id=" + sid; },
           teamDir: function(){ return Promise.resolve({}); },
           vsHeader: function(){ return ""; },
           teamFind: findStub,
           esc: escStub,
           failBox: function(m){ return '<div class="fail">' + m + "</div>"; } } };
  sandbox.window.GIU = sandbox.GIU;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/kalshi-logic.js"), "utf8"), sandbox, { filename: "js/kalshi-logic.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/disagree-logic.js"), "utf8"), sandbox, { filename: "js/disagree-logic.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/team-follow.js"), "utf8"), sandbox, { filename: "js/team-follow.js" });
  var tab0 = makeEl("tab-0"); tab0.setAttribute("data-i", "0");
  var tabK = makeEl("tab-kalshi"); tabK.setAttribute("data-kalshi", "nfl");
  getEl("marketTabs")._children = [tab0, tabK];
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8"), sandbox, { filename: "js/markets.js" });
  return { sandbox: sandbox, els: els, getEl: getEl, tabK: tabK, tab0: tab0, store: store };
}
function parkedFetch(){ return new Promise(function(){}); }

/* ---------------- pure followedPM (captured exports) ------------------ */
var cap = buildSandbox(parkedFetch, null);
var G = cap.sandbox.window.GIU;
var FP = G.marketsFollowedPM, FK = G.marketsFollowedKalshi, PK = G.marketsPmKey;
assert(typeof FP === "function", "marketsFollowedPM exported on GIU");
assert(typeof FK === "function", "marketsFollowedKalshi exported on GIU");
assert(typeof PK === "function", "marketsPmKey exported on GIU");

function pmGame(title, slug){ return { ev: { title: title, slug: slug } }; }
var pmGames = [ pmGame("Philadelphia Eagles vs. Chicago Bears", "nfl-eagles-bears"),
                pmGame("Kansas City Chiefs vs. Buffalo Bills", "nfl-chiefs-bills"),
                pmGame("Chicago Bears vs. Detroit Lions", "nfl-bears-lions") ];
var m = FP(pmGames, ["CHI"], {}, "nfl", findStub);
eq(m.length, 2, "PM: followed CHI matches its away game and its home game");
eq(m[0].key, "nfl-eagles-bears", "PM: first match key is the event slug");
eq(m[0].abbr, "CHI", "PM: match stamps the followed abbreviation");
eq(m[0].abbrA, "PHI", "PM: match carries side A abbreviation");
eq(m[0].abbrB, "CHI", "PM: match carries side B abbreviation");
eq(FP(pmGames, ["det"], {}, "nfl", findStub)[0].abbr, "DET", "PM: lowercase follow entries are normalized");
eq(FP(pmGames, ["DET", "CHI"], {}, "nfl", findStub).filter(function(x){ return x.key === "nfl-bears-lions"; })[0].abbr, "DET",
   "PM: both sides followed — the earlier follow-list entry wins");
eq(FP(pmGames, [], {}, "nfl", findStub).length, 0, "PM: no follows -> no matches");
eq(FP(pmGames, ["SEA"], {}, "nfl", findStub).length, 0, "PM: followed team not on the board -> no matches");
eq(FP(null, ["CHI"], {}, "nfl", findStub).length, 0, "PM: null games -> []");
eq(FP(pmGames, null, {}, "nfl", findStub).length, 0, "PM: null follows -> []");
eq(FP(pmGames, ["CHI"], {}, "nfl", null).length, 0, "PM: missing teamFind -> [] (never a guess)");
eq(FP(pmGames, ["CHI"], {}, "nfl", function(){ throw new Error("boom"); }).length, 0,
   "PM: a throwing teamFind degrades to no matches, never a crash");
eq(FP([{ ev: { title: "No Versus Here", slug: "x" } }, { ev: {} }, null,
       pmGame("Chicago Bears vs. Detroit Lions", "ok-slug")], ["CHI"], {}, "nfl", findStub).length, 1,
   "PM: malformed games are skipped, the real one still matches");
eq(FP(pmGames, ["CHI", 42, "", "toolongname", "CHI"], {}, "nfl", findStub).length, 2,
   "PM: non-string / implausible / duplicate follow entries are dropped");
var oneSide = FP([pmGame("Chicago Bears vs. Mystery Team", "mystery")], ["CHI"], {}, "nfl", findStub);
eq(oneSide.length, 1, "PM: one resolvable side is enough to match");
eq(oneSide[0].abbrB, "", "PM: the unresolvable side carries an empty abbreviation");
eq(PK({ slug: "NFL Eagles Bears!" }, 0), "nfl-eagles-bears", "pmKey sanitizes a hostile slug");
eq(PK({ title: "Chicago Bears vs. Detroit Lions" }, 0), "chicago-bears-vs-detroit-lions",
   "pmKey falls back to a slugified title when slug/id are missing");
eq(PK({}, 3), "game-3", "pmKey falls back to a positional key as a last resort");
eq(PK(null, 0), "game-0", "pmKey survives a null event");

/* ---------------- pure followedKalshi (captured exports) -------------- */
function kGame(ticker, sub, title, settled){
  return { ticker: ticker, sub: sub, title: title, settled: !!settled,
           teams: [{ name: "A", price: 60 }, { name: "B", price: 40 }] };
}
var kGames = [ kGame("K1", "IND vs WAS (Oct 4)", "IND Colts vs WAS Commanders"),
               kGame("K2", "CHI vs GB (Oct 5)", "CHI Bears vs GB Packers"),
               kGame("K3", "CWS vs CLE (Oct 4)", "CWS White Sox vs CLE Guardians"),
               kGame("K4", "DET vs KC (Oct 6)", "DET Lions vs KC Chiefs", true),
               kGame("K5", "Mystery Game", "Someone vs Someone Else") ];
var km = FK(kGames, ["WSH"], normStub);
eq(km.length, 1, "Kalshi: follow WSH matches the WAS-sub game via the alias map");
eq(km[0].ticker, "K1", "Kalshi: match carries the event ticker");
eq(km[0].abbr, "WSH", "Kalshi: match stamps the normalized followed abbreviation");
eq(km[0].abbrA, "IND", "Kalshi: side A abbreviation from the sub");
eq(km[0].abbrB, "WSH", "Kalshi: side B abbreviation normalized WAS -> WSH");
eq(km[0].bName, "WAS Commanders", "Kalshi: chip label side comes from the title");
eq(FK(kGames, ["CHW"], normStub).length, 1, "Kalshi: follow CHW matches the CWS-sub game via the alias map");
eq(FK(kGames, ["chi"], normStub)[0].abbr, "CHI", "Kalshi: lowercase follow entries are normalized");
eq(FK(kGames, ["DET"], normStub).length, 0, "Kalshi: settled games never match — a result is not a market");
eq(FK(kGames, ["KC"], normStub).length, 0, "Kalshi: a followed team only on a settled game earns nothing");
eq(FK(kGames, ["GB", "CHI"], normStub).filter(function(x){ return x.ticker === "K2"; })[0].abbr, "GB",
   "Kalshi: both sides followed — the earlier follow-list entry wins");
eq(FK(kGames, ["CHI"], null).length, 1, "Kalshi: a missing norm degrades to identity, matches still work");
eq(FK(kGames, ["CHI"], function(){ throw new Error("boom"); }).length, 0,
   "Kalshi: a throwing norm degrades to no matches, never a crash");
eq(FK(null, ["CHI"], normStub).length, 0, "Kalshi: null games -> []");
eq(FK(kGames, null, normStub).length, 0, "Kalshi: null follows -> []");
eq(FK("junk", ["CHI"], normStub).length, 0, "Kalshi: non-array games -> []");
eq(FK([null, { ticker: "KX" }, kGame("K9", "CHI vs GB (Oct 5)", "CHI Bears vs GB Packers")], ["CHI"], normStub).length, 1,
   "Kalshi: malformed games are skipped, the real one still matches");

/* ---------------- DOM wiring: Kalshi tab ------------------------------ */
function mkSnapGame(i, awayAbbr, homeAbbr, awayName, homeName, settled){
  var t = Date.now() + i * 3600 * 1000;
  function mkt(team, b, a){
    return { kind: "winner", team: team, ticker: "T-" + awayAbbr + homeAbbr + "-" + team,
             yes_bid: b, yes_ask: a, volume: "1000", volume_24h: "100",
             close_time: new Date(t).toISOString() };
  }
  return { event_ticker: "KXNFLGAME-G" + i,
           title: awayAbbr + " " + awayName + " vs " + homeAbbr + " " + homeName,
           sub_title: awayAbbr + " vs " + homeAbbr + " (Oct " + (i + 3) + ")",
           markets: settled ? [mkt(awayName, 99, 100), mkt(homeName, 0, 1)]
                            : [mkt(awayName, 60, 62), mkt(homeName, 38, 40)] };
}
var snapGames = [];
for(var i = 1; i <= 14; i++) snapGames.push(mkSnapGame(i, "A" + i, "B" + i, "Alpha" + i, "Beta" + i));
snapGames[1] = mkSnapGame(2, "IND", "WAS", "Colts", "Commanders");       /* shown, followed via WSH */
snapGames[13] = mkSnapGame(14, "CHI", "GB", "Bears", "Packers");          /* hidden (past 12), followed */
var kalshiSnap = { updated_at: new Date().toISOString(), prev_at: null, moves: [], new_games: [], games: snapGames };

function domFetch(url){
  if(url.indexOf("/sports") !== -1) return Promise.resolve([{ sport: "nfl", series: "SID1" }]);
  if(url.indexOf("kalshi-nfl.json") !== -1) return Promise.resolve(kalshiSnap);
  if(url.indexOf("kalshi-history.json") !== -1) return Promise.resolve({});
  if(url.indexOf("events?series_id") !== -1) return Promise.resolve([]);
  return Promise.reject(new Error("unexpected fetch url: " + url));
}
function settle(fn){ setTimeout(fn, 60); }

var dom = buildSandbox(domFetch, JSON.stringify(["CHI", "WSH"]));
settle(function(){
  dom.tabK._fire("click"); /* onto the Kalshi · NFL tab */
  settle(function(){
    var grid = dom.getEl("marketGrid").innerHTML;
    var strip = dom.getEl("followStrip");
    assert(strip.hidden === false, "DOM Kalshi: strip is visible when followed teams are on the tab");
    assert(strip.innerHTML.indexOf("★ Your teams") !== -1, "DOM Kalshi: strip carries the Your teams label");
    assert(strip.innerHTML.indexOf('href="#km-KXNFLGAME-G2"') !== -1, "DOM Kalshi: chip for the shown WAS game anchors to its card");
    assert(strip.innerHTML.indexOf('href="#km-KXNFLGAME-G14"') !== -1, "DOM Kalshi: chip for the hidden CHI game anchors to its card");
    assert(strip.innerHTML.indexOf('data-expand="KXNFLGAME-G14"') !== -1, "DOM Kalshi: the hidden game's chip is stamped data-expand");
    assert(strip.innerHTML.indexOf('data-expand="KXNFLGAME-G2"') === -1, "DOM Kalshi: the shown game's chip needs no expansion");
    assert(strip.innerHTML.indexOf("★ WSH") !== -1 && strip.innerHTML.indexOf("★ CHI") !== -1,
           "DOM Kalshi: chips name the followed abbreviations (WSH normalized from WAS)");
    assert(grid.indexOf('id="km-KXNFLGAME-G14"') === -1, "DOM Kalshi: the CHI card starts hidden behind Show all");
    var g2 = grid.split('id="km-KXNFLGAME-G2"')[0].split("<div").pop();
    assert(g2.indexOf("followed") !== -1, "DOM Kalshi: the WAS card carries the followed class");
    assert(grid.indexOf("★ Your team") !== -1, "DOM Kalshi: the followed card carries the ★ Your team tag");

    /* chip click for the hidden game expands the list, then the card lands */
    var chipEl = { classList: { contains: function(c){ return c === "follow-chip-link"; } },
                   getAttribute: function(k){ return k === "data-expand" ? "KXNFLGAME-G14" : null; },
                   parentNode: strip };
    var prevented = false;
    strip._fire("click", chipEl, { preventDefault: function(){ prevented = true; } });
    assert(prevented, "DOM Kalshi: hidden-game chip click prevents the dead anchor jump");
    settle(function(){
      var grid2 = dom.getEl("marketGrid").innerHTML;
      assert(grid2.indexOf('id="km-KXNFLGAME-G14"') !== -1, "DOM Kalshi: expand-on-click renders the hidden CHI card");
      var g14 = grid2.split('id="km-KXNFLGAME-G14"')[0].split("<div").pop();
      assert(g14.indexOf("followed") !== -1, "DOM Kalshi: the expanded CHI card carries the followed class");
      var strip2 = dom.getEl("followStrip").innerHTML;
      assert(strip2.indexOf("data-expand") === -1, "DOM Kalshi: after expanding, no chip needs expansion");

      /* Polymarket tab: strip + marks come from the live feed instead */
      dom.tab0._fire("click");
      settle(function(){
        var strip3 = dom.getEl("followStrip");
        assert(strip3.hidden === true && strip3.innerHTML === "",
               "DOM PM: switching to a tab whose feed is empty clears the strip (no stale chips)");
        finishDom();
      });
    });
  });
});

function finishDom(){
  /* Corrupt storage: the whole page degrades to a clean, unmarked board */
  var bad = buildSandbox(domFetch, "{not json");
  settle(function(){
    bad.tabK._fire("click");
    settle(function(){
      var strip = bad.getEl("followStrip");
      assert(strip.hidden === true && strip.innerHTML === "", "DOM corrupt storage: strip stays hidden");
      assert(bad.getEl("marketGrid").innerHTML.indexOf("★ Your team") === -1,
             "DOM corrupt storage: no card is marked");
      pmTabTest();
    });
  });
}

/* ---------------- DOM wiring: Polymarket tab -------------------------- */
function pmTabTest(){
  var H = 3600 * 1000, NOW = Date.now();
  function pmEvent(title, slug, hrs){
    var parts = title.split(/\s+vs\.?\s+/);
    return { title: title, slug: slug, startTime: new Date(NOW + hrs * H).toISOString(),
      markets: [{ sportsMarketType: "moneyline", closed: false, active: true,
        outcomes: JSON.stringify(parts), outcomePrices: JSON.stringify(["0.60", "0.40"]),
        question: "Will " + parts[0] + " win?", volume: 1000, volume24hr: 10 }] };
  }
  var events = [ pmEvent("Kansas City Chiefs vs. Buffalo Bills", "nfl-chiefs-bills", 50),
                 pmEvent("Philadelphia Eagles vs. Chicago Bears", "nfl-eagles-bears", 30) ];
  function pmFetch(url){
    if(url.indexOf("/sports") !== -1) return Promise.resolve([{ sport: "nfl", series: "SID1" }]);
    if(url.indexOf("events?series_id") !== -1) return Promise.resolve(events);
    if(url.indexOf("kalshi-nfl.json") !== -1) return Promise.resolve(kalshiSnap);
    if(url.indexOf("kalshi-mlb.json") !== -1) return Promise.resolve(kalshiSnap);
    return Promise.reject(new Error("unexpected fetch url: " + url));
  }
  var pm = buildSandbox(pmFetch, JSON.stringify(["CHI"]));
  settle(function(){ /* initial load() is the NFL Polymarket tab already */
    var grid = pm.getEl("marketGrid").innerHTML;
    var strip = pm.getEl("followStrip");
    assert(strip.hidden === false, "DOM PM: strip is visible when a followed team is on the tab");
    assert(strip.innerHTML.indexOf('href="#pm-nfl-eagles-bears"') !== -1, "DOM PM: chip anchors to the CHI card's #pm- slug");
    assert(grid.indexOf('id="pm-nfl-eagles-bears"') !== -1, "DOM PM: the card carries the #pm- anchor id");
    var chi = grid.split('id="pm-nfl-eagles-bears"')[0].split("<div").pop();
    assert(chi.indexOf("followed") !== -1, "DOM PM: the CHI card carries the followed class");
    assert(grid.indexOf("★ Your team") !== -1, "DOM PM: the followed card carries the ★ Your team tag");
    var kc = grid.split('id="pm-nfl-chiefs-bills"')[0].split("<div").pop();
    assert(kc.indexOf("followed") === -1, "DOM PM: an unfollowed card stays unmarked");
    pins();
  });
}

/* ---------------- shipped-file pins ----------------------------------- */
function pins(){
  var html = fs.readFileSync(path.join(ROOT, "markets.html"), "utf8");
  assert(html.indexOf('id="followStrip"') !== -1, "markets.html carries the #followStrip container");
  assert(html.indexOf("js/team-follow.js?v=1.142.0") !== -1, "markets.html loads team-follow.js at its content version v1.142.0");
  assert(html.indexOf("js/markets.js?v=1.155.0") !== -1, "markets.html keys markets.js at v1.155.0");
  assert(html.indexOf(".follow-strip") !== -1 && html.indexOf(".card.followed") !== -1 && html.indexOf(".tag.your-team") !== -1,
         "markets.html carries the page-scoped follow styles");
  assert(html.indexOf('<script src="js/team-follow.js') < html.indexOf('<script src="js/markets.js'), "team-follow.js loads before markets.js");
  var js = fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8");
  assert(js.indexOf("renderFollowStrip(pmChips(folPM))") !== -1, "markets.js renders the strip on the Polymarket path");
  assert(js.indexOf("renderFollowStrip(kalshiChips(folK, shownSet))") !== -1, "markets.js renders the strip on the Kalshi path");
  console.log(failures ? ("\n" + failures + " FAILURES") : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}
