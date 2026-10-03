/* GridIronUI markets page — "Market pulse" biggest-movers strip (v1.147.0).
   Thirty NFL cards make the per-card move badges easy to miss, so each
   Kalshi tab opens with the N largest snapshot-to-snapshot moves as
   jump-to-game chips. These tests pin:
   - K.topMoves (pure, in js/kalshi-logic.js): sorts by |delta| desc, caps
     at n (default 5), skips settled games / unknown tickers / teams not
     on the card / sub-2c moves, garbage-in -> [], raw fields out.
   - the shipped js/markets.js integration (vm sandbox, stub DOM): the
     strip renders above the cards with chips in |delta| order, chip hrefs
     match card ids, chips for games past the first page expand the list
     before scrolling, a quiet board gets the honest note (never hidden),
     and hostile team names are escaped everywhere.
   - shipped-file wiring pins: markets.html script keys + pulse CSS +
     notice copy; kalshi-logic.js keys on the pages that include it.
   Run: node tests/test-markets-movers.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var K = require("../js/kalshi-logic.js");

var pass = 0, fail = 0;
function ok(name, cond){
  if(cond) pass++;
  else { fail++; console.log("FAIL:", name); }
}

/* ---------- Part A: K.topMoves pure contract ---------- */
function mkGame(ticker, teams, settled){
  return { ticker: ticker, title: "Title " + ticker, sub: "Sub " + ticker,
           teams: teams.map(function(n){ return {name: n, price: 50}; }),
           settled: !!settled };
}
var gamesA = [
  mkGame("G1", ["Alpha", "Beta"]),
  mkGame("G2", ["Gamma", "Delta"]),
  mkGame("G3", ["Epsilon", "Zeta"]),
  mkGame("G4", ["Eta", "Theta"], true) /* settled */
];
var mapA = {
  G1: {"Alpha": 5, "Beta": -1},   /* Beta below the 2c bar */
  G2: {"Gamma": -8, "Delta": 3},
  G3: {"Epsilon": 0},             /* zero move */
  G4: {"Eta": 25},               /* settled game: excluded */
  GHOST: {"Nobody": 9}           /* unknown ticker: excluded */
};

var top = K.topMoves(gamesA, mapA);
ok("orders by |delta| desc", JSON.stringify(top.map(function(m){return m.team;})) ===
   JSON.stringify(["Gamma", "Alpha", "Delta"]));
ok("caps at 5 by default", K.topMoves(gamesA, mapA).length === 3);
ok("n=2 caps at 2", K.topMoves(gamesA, mapA, 2).length === 2 &&
   K.topMoves(gamesA, mapA, 2)[0].team === "Gamma");
ok("delta rounded to whole cents", (function(){
  var t = K.topMoves([mkGame("G9", ["P", "Q"])], {"G9": {"P": 4.6}});
  return t.length === 1 && t[0].delta === 5;
})());
ok("returns ticker/title/sub raw for the caller", top[0].ticker === "G2" &&
   top[0].title === "Title G2" && top[0].sub === "Sub G2");
ok("garbage in -> []", JSON.stringify(K.topMoves(null, {})) === "[]" &&
   JSON.stringify(K.topMoves(gamesA, null)) === "[]" &&
   JSON.stringify(K.topMoves("x", 42)) === "[]");
ok("team not on the card earns nothing", (function(){
  var t = K.topMoves([mkGame("GX", ["P", "Q"])], {"GX": {"Intruder": 7}});
  return t.length === 0;
})());
ok("sub-2c moves never listed", (function(){
  var t = K.topMoves([mkGame("GY", ["P", "Q"])], {"GY": {"P": 1, "Q": -1}});
  return t.length === 0;
})());
ok("tickerless games skipped", (function(){
  var g = mkGame(null, ["P", "Q"]); g.ticker = null;
  var t = K.topMoves([g], {null: {"P": 6}});
  return t.length === 0;
})());

/* ---------- Part B: shipped markets.js integration (vm sandbox) ---------- */
function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", style: {}, value: "", className: "",
    _text: "", _attrs: {},
    classList: { add: function(){}, remove: function(){},
                 toggle: function(){}, contains: function(){ return false; } },
    addEventListener: function(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return this._children || []; },
    _fire: function(ev, target, extra){
      var e = {target: target || this};
      if(extra) for(var k in extra) e[k] = extra[k];
      (handlers[ev] || []).forEach(function(fn){ fn.call(this, e); }, this);
    },
    _handlers: handlers
  };
  Object.defineProperty(el, "textContent", {
    get: function(){ return this._text; },
    set: function(v){ this._text = String(v); this.innerHTML = ""; },
    enumerable: true, configurable: true
  });
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["marketGrid", "marketNote", "marketTabs", "liveStatus", "pauseBtn"].forEach(getEl);

/* 15 games -> 12 shown, 3 hidden behind "Show all" (the settled game sorts
   last). Closes spaced an hour apart so K.games() order is deterministic. */
function mkSnapGame(i, opt){
  opt = opt || {};
  var t = Date.now() + i * 3600 * 1000;
  function mkt(team, b, a){
    return { kind: "winner", team: team, yes_bid: b, yes_ask: a,
             volume: "1000", volume_24h: "100",
             close_time: new Date(t).toISOString() };
  }
  var A = "Team A" + i, B = "Team B" + i;
  return { event_ticker: "KXNFLGAME-G" + i,
           title: "Side A" + i + " vs Side B" + i,
           sub_title: "A" + i + " vs B" + i + " (Oct " + i + ")",
           markets: opt.settled ? [mkt(A, 99, 100), mkt(B, 0, 1)]
                                : [mkt(A, 60, 62), mkt(B, 38, 40)] };
}
var snapGames = [];
for(var i = 1; i <= 15; i++) snapGames.push(mkSnapGame(i));
snapGames[6] = mkSnapGame(7, {settled: true}); /* G7 settled -> sorts last */
/* hostile team name on G10: must be escaped everywhere it renders */
snapGames[9].markets[0].team = '<img src=x onerror="evil()">';

var kalshiSnapshot = {
  updated_at: new Date().toISOString(),
  prev_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  new_games: ["KXNFLGAME-G8"],
  moves: [
    {event_ticker: "KXNFLGAME-G1", team: "Team A1", delta: 3},
    {event_ticker: "KXNFLGAME-G2", team: "Team B2", delta: -4},
    {event_ticker: "KXNFLGAME-G3", team: "Team A3", delta: 1},  /* below bar */
    {event_ticker: "KXNFLGAME-G5", team: "Ghost Team", delta: 8}, /* not on card */
    {event_ticker: "KXNFLGAME-G7", team: "Team A7", delta: 25}, /* settled */
    {event_ticker: "KXNFLGAME-G13", team: "Team A13", delta: 9}, /* shown card */
    {event_ticker: "KXNFLGAME-G14", team: "Team A14", delta: 11}, /* hidden card */
    {event_ticker: "KXNFLGAME-G15", team: "Team B15", delta: -7} /* hidden card */
  ],
  games: snapGames
};
var quietSnapshot = {
  updated_at: new Date().toISOString(),
  prev_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  moves: [], new_games: [], games: snapGames.slice(0, 2)
};
var currentKalshi = kalshiSnapshot;

var fetchStub = function(url){
  if(url.indexOf("/sports") !== -1) return Promise.resolve([{sport: "nfl", series: "SID1"}]);
  if(url.indexOf("teams.json") !== -1) return Promise.resolve({});
  if(url.indexOf("kalshi-nfl.json") !== -1) return Promise.resolve(currentKalshi);
  if(url.indexOf("kalshi-history.json") !== -1) return Promise.resolve({});
  if(url.indexOf("events?series_id") !== -1) return Promise.resolve([]);
  return Promise.reject(new Error("unexpected fetch url: " + url));
};
var intervals = [], nextId = 1;
var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(fn, ms){ var id = nextId++; intervals.push({id: id, fn: fn, ms: ms}); return id; },
  clearInterval: function(){},
  document: { getElementById: getEl, hidden: false },
  window: {},
  GIU: {
    fetchJSON: fetchStub,
    pmEventsUrl: function(sid){ return "https://gamma-api.polymarket.com/events?series_id=" + sid; },
    teamDir: function(){ return Promise.resolve({}); },
    vsHeader: function(){ return ""; },
    esc: function(s){
      return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
        return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c];
      });
    },
    failBox: function(m){ return '<div class="fail">' + m + "</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);
var tab0 = makeEl("tab-0"); tab0.setAttribute("data-i", "0");
var tabK = makeEl("tab-kalshi"); tabK.setAttribute("data-kalshi", "nfl");
getEl("marketTabs")._children = [tab0, tabK];
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/kalshi-logic.js"), "utf8"), sandbox, {filename: "js/kalshi-logic.js"});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8"), sandbox, {filename: "js/markets.js"});

function settle(fn){ setTimeout(fn, 80); }
function chips(html){
  var out = [], re = /class="mover-chip ([^"]+)"[^>]*data-ticker="([^"]+)"[^>]*data-shown="([01])"/g, m;
  while((m = re.exec(html))) out.push({cls: m[1], ticker: m[2], shown: m[3]});
  return out;
}

settle(function(){
  tabK._fire("click"); /* onto the Kalshi tab */
  settle(function(){
    var html = getEl("marketGrid").innerHTML;
    ok("pulse strip renders above the cards",
       html.indexOf("pulse-card") !== -1 && html.indexOf("Market pulse") !== -1 &&
       html.indexOf("pulse-card") < html.indexOf('id="km-KXNFLGAME-G1"'));
    ok("strip names the snapshot baseline",
       html.indexOf("since the") !== -1 && html.indexOf("snapshot") !== -1);
    var cs = chips(html);
    ok("five chips in |delta| order: G14 +11, G13 +9, G15 -7, G2 -4, G1 +3 (below-bar, ghost, settled excluded)",
       JSON.stringify(cs.map(function(c){ return c.ticker; })) ===
       JSON.stringify(["KXNFLGAME-G14", "KXNFLGAME-G13", "KXNFLGAME-G15", "KXNFLGAME-G2", "KXNFLGAME-G1"]));
    ok("no more than 5 chips", cs.length <= 5);
    ok("direction classes match delta sign",
       cs[0].cls === "mv-up" && cs[1].cls === "mv-up" && cs[2].cls === "mv-dn" &&
       cs[3].cls === "mv-dn" && cs[4].cls === "mv-up");
    ok("chip hrefs anchor to card ids",
       cs.every(function(c){ return html.indexOf('href="#km-' + c.ticker + '"') !== -1; }));
    ok("shown games carry card ids",
       html.indexOf('id="km-KXNFLGAME-G1"') !== -1 &&
       html.indexOf('id="km-KXNFLGAME-G2"') !== -1);
    ok("hidden-game chips marked data-shown=0, shown ones 1",
       cs[0].shown === "0" && cs[2].shown === "0" &&
       cs[1].shown === "1" && cs[3].shown === "1" && cs[4].shown === "1");
    ok("new-market note names the new games",
       html.indexOf("1 new market on the board") !== -1);
    ok("hostile team name escaped everywhere",
       html.indexOf('<img src=x') === -1 && html.indexOf("&lt;img src=x") !== -1);

    /* chip for a hidden card expands the list, then the card is in the DOM */
    var box = getEl("marketGrid");
    var hiddenChip = {
      classList: { contains: function(c){ return c === "mover-chip"; } },
      getAttribute: function(k){
        return k === "data-shown" ? "0" : (k === "data-ticker" ? "KXNFLGAME-G14" : null);
      },
      parentNode: box
    };
    var prevented = false;
    box._fire("click", hiddenChip, {preventDefault: function(){ prevented = true; }});
    ok("hidden-card chip click prevents the dead anchor jump", prevented);
    settle(function(){
      var h2 = getEl("marketGrid").innerHTML;
      ok("expand-on-click renders the hidden card",
         h2.indexOf('id="km-KXNFLGAME-G14"') !== -1);
      ok("toggle flips to show-fewer after expanding",
         h2.indexOf("Show fewer games") !== -1);
      var cs2 = chips(h2);
      ok("after expanding, all chips are data-shown=1",
         cs2.length > 0 && cs2.every(function(c){ return c.shown === "1"; }));
      ok("settled game: card renders as a result, never a chip",
         h2.indexOf('id="km-KXNFLGAME-G7"') !== -1 &&
         h2.indexOf("won · final") !== -1 &&
         cs2.every(function(c){ return c.ticker !== "KXNFLGAME-G7"; }));

      /* quiet board: honest note, no chips, no hidden section */
      currentKalshi = quietSnapshot;
      tabK._fire("click");
      settle(function(){
        var h3 = getEl("marketGrid").innerHTML;
        ok("quiet board keeps an honest strip",
           h3.indexOf("sitting still") !== -1 && h3.indexOf("pulse-card") !== -1);
        ok("quiet board renders zero chips", chips(h3).length === 0);

        /* ---------- Part C: shipped-file pins ---------- */
        var mkHtml = fs.readFileSync(path.join(ROOT, "markets.html"), "utf8");
        ok("markets.html pins js/markets.js?v=2.0.11",
           mkHtml.indexOf('js/markets.js?v=2.0.11') !== -1);
        ok("markets.html pins js/kalshi-logic.js?v=2.0.11",
           mkHtml.indexOf('js/kalshi-logic.js?v=2.0.11') !== -1);
        ok("markets.html carries the pulse-card styles",
           mkHtml.indexOf(".pulse-card") !== -1 && mkHtml.indexOf(".mover-chip") !== -1 &&
           mkHtml.indexOf("pulse-land") !== -1);
        ok("markets.html notice explains the Market pulse strip",
           mkHtml.indexOf("Market pulse") !== -1);
        var odHtml = fs.readFileSync(path.join(ROOT, "odds.html"), "utf8");
        ok("odds.html kalshi-logic.js key -> v2.0.11",
           odHtml.indexOf('js/kalshi-logic.js?v=2.0.11') !== -1);
        var prHtml = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
        ok("predictions.html kalshi-logic.js key -> v2.0.11",
           prHtml.indexOf('js/kalshi-logic.js?v=2.0.11') !== -1);
        var mkJs = fs.readFileSync(path.join(ROOT, "js/markets.js"), "utf8");
        ok("markets.js builds the strip + binds chips + lands on expand",
           mkJs.indexOf("pulseStrip(") !== -1 && mkJs.indexOf("bindPulseChips(") !== -1 &&
           mkJs.indexOf("pulseScrollTo") !== -1 && mkJs.indexOf('id="km-') !== -1);
        var klJs = fs.readFileSync(path.join(ROOT, "js/kalshi-logic.js"), "utf8");
        ok("kalshi-logic.js exports K.topMoves", klJs.indexOf("K.topMoves = function") !== -1);

        if(fail){ console.error(fail + " FAILURES"); process.exit(1); }
        console.log("ALL MARKETS-MOVERS TESTS PASS (" + pass + " assertions)");
      });
    });
  });
});
