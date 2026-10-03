/* GridIronUI v2.0.6 — NCAAF tab on the predictions page.
   The predictions board was the last major board without the college
   slate: Polymarket lists a real College Football series (sport key
   "cfb" — the same live gamma /sports lookup every other tab uses, and
   the series the markets page's CFB tab already reads), but the page's
   tabs stopped at the pros, so on a college Saturday there was no way
   to see what the crowd thinks of Navy vs Air Force here.
   Verifies, in a vm sandbox with the real kalshi-logic + disagree-logic
   + home-strip + predictions.js:
   - the cfb tab resolves its series through the live /sports lookup and
     fetches THAT series' events (per-series routing in the stub)
   - real-shaped CFB events render: " vs. " titles, the single moneyline
     market picked out of a pile of spread/total markets, prices as
     Market-implied bars, the nearest game spotlighted with the football
     "Next kickoff" kicker + countdown, featured game out of the grid
   - honest exclusions: a past game whose moneyline closed and a
     non-game (futures) event never render
   - honest gating: NO Kalshi row on college cards and the NCAAF
     snapshot is never fetched (SNAP stays NFL/MLB-only — no honest
     ESPN<->Kalshi college join exists for the per-game rows)
   - the NFL tab still renders exactly as before (regression)
   - shipped wiring pins (tab in predictions.html, LEAGUES/SPOT_KICKER/
     SNAP in predictions.js, cache key)
   Run: node tests/test-predictions-ncaaf.js */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const JS = path.join(ROOT, "js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL:", name); } }

/* ---------- shipped wiring pins ---------- */
const predJs = fs.readFileSync(path.join(JS, "predictions.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
ok("LEAGUES gains the NCAAF/cfb pair", predJs.indexOf('["NCAAF","cfb"]') > -1);
ok("LEAGUES order keeps NCAAF between NHL and EPL",
   predJs.indexOf('["NHL","nhl"]') < predJs.indexOf('["NCAAF","cfb"]') &&
   predJs.indexOf('["NCAAF","cfb"]') < predJs.indexOf('["EPL","epl"]'));
ok("SPOT_KICKER gives cfb the football label", /cfb:\s*"Next kickoff"/.test(predJs));
ok("SNAP stays NFL/MLB-only (no cfb snapshot entry)",
   !/SNAP\s*=\s*\{[^}]*cfb/.test(predJs) && predJs.indexOf("kalshi-ncaaf") === -1);
ok("predictions.html renders the NCAAF tab",
   html.indexOf('<button class="tab" data-k="cfb">NCAAF</button>') > -1);
ok("tab order in the page: NHL < NCAAF < EPL",
   html.indexOf('data-k="nhl"') < html.indexOf('data-k="cfb"') &&
   html.indexOf('data-k="cfb"') < html.indexOf('data-k="epl"'));
ok("predictions.js cache key bumped to v2.0.6",
   html.indexOf("js/predictions.js?v=2.0.6") > -1);

/* ---------- sandbox boot ---------- */
function makeEl(id){
  const handlers = {};
  return {
    id, textContent: "", innerHTML: "", value: "", style: {}, className: "",
    classList: { add(){}, remove(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return undefined; },
    addEventListener(t,h){ (handlers[t] = handlers[t] || []).push(h); },
    fire(t, ev){ (handlers[t] || []).forEach(h => h.call(this, ev || {})); },
    querySelectorAll(){ return []; },
  };
}

const H = 3600*1000;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

function mlMarket(outcomes, prices, extra){
  return Object.assign({
    sportsMarketType: "moneyline", closed: false, active: true,
    outcomes: JSON.stringify(outcomes), outcomePrices: JSON.stringify(prices),
    oneWeekPriceChange: "0.02",
  }, extra || {});
}
/* Real-shaped CFB events (mirrors the live gamma pull of 2026-10-03:
   title "A vs. B", exactly one moneyline market among many spread and
   total markets, team-name outcomes, decimal-string prices). */
const evNavy = {
  title: "Navy vs. Air Force", slug: "cfb-navy-airf-2026-10-03", startTime: iso(NOW + 3*H),
  markets: [
    { sportsMarketType: "spreads", closed: false, active: true,
      outcomes: JSON.stringify(["Navy", "Air Force"]), outcomePrices: JSON.stringify(["0.365", "0.635"]) },
    mlMarket(["Navy", "Air Force"], ["0.435", "0.565"]),
    { sportsMarketType: "totals", closed: false, active: true,
      outcomes: JSON.stringify(["Over", "Under"]), outcomePrices: JSON.stringify(["0.79", "0.21"]) },
  ],
};
const evMich = {
  title: "Michigan vs. Minnesota", slug: "cfb-mich-minn-2026-10-03", startTime: iso(NOW + 5*H),
  markets: [ mlMarket(["Michigan", "Minnesota"], ["0.62", "0.38"]) ],
};
const evPast = { /* played in September: its moneyline is closed */
  title: "Northern Illinois vs. Iowa", slug: "cfb-niu-iowa", startTime: iso(NOW - 30*24*H),
  markets: [ mlMarket(["Northern Illinois", "Iowa"], ["0.30", "0.70"], {closed: true}) ],
};
const evFutures = { /* not a game: no " vs" in the title */
  title: "2026 College Football Champion", slug: "cfb-champion", startTime: iso(NOW + 90*24*H),
  markets: [ mlMarket(["Georgia", "Ohio State"], ["0.20", "0.18"]) ],
};
const evNfl = {
  title: "Kansas City Chiefs vs. Buffalo Bills", slug: "nfl-chiefs-bills", startTime: iso(NOW + 26*H),
  markets: [ mlMarket(["Kansas City Chiefs", "Buffalo Bills"], ["0.60", "0.40"]) ],
};

const fetched = [];
const els = {};
const intervals = [];
let timerSeq = 0;
const tabs = ["nfl","nba","mlb","nhl","cfb","epl"].map(k => {
  const t = makeEl("tab-"+k);
  t.getAttribute = a => (a === "data-k" ? k : undefined);
  return t;
});
const predTabs = makeEl("predTabs");
predTabs.querySelectorAll = () => tabs;

const sandbox = {
  document: {
    getElementById: id => {
      if(id === "predTabs") return predTabs;
      return (els[id] || (els[id] = makeEl(id)));
    },
    createElement: t => makeEl(t),
    addEventListener(){},
  },
  GIU: {
    esc: s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
    failBox: msg => "<div class=fail>" + msg + "</div>",
    vsHeader: () => "",
    pmEventsUrl: sid => "https://gamma-api.polymarket.com/events?series_id="+encodeURIComponent(sid),
    teamDir: () => Promise.resolve({}),
    teamFind: () => null, /* no college namespace in the directory: never resolves, never guessed */
    fetchJSON: url => {
      fetched.push(url);
      if(/gamma-api\.polymarket\.com\/sports$/.test(url))
        return Promise.resolve([{sport:"nfl", series:"999"}, {sport:"cfb", series:"12756"}, {sport:"epl", series:"888"}]);
      if(url.indexOf("series_id=12756") > -1) return Promise.resolve([evMich, evPast, evNavy, evFutures]); /* unsorted on purpose */
      if(url.indexOf("series_id=999") > -1) return Promise.resolve([evNfl]);
      if(url === "data/kalshi-nfl.json") return Promise.reject(new Error("no snap in sandbox"));
      return Promise.reject(new Error("unexpected url " + url));
    },
  },
  setInterval(fn, ms){ const id = ++timerSeq; intervals.push([fn, ms, id]); return id; },
  clearInterval(id){ const i = intervals.findIndex(e => e[2] === id); if(i > -1) intervals.splice(i, 1); },
  setTimeout, clearTimeout, console,
  Date, JSON, Promise, Array, Math, String, Number, isFinite, Object, RegExp, encodeURIComponent,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(JS,"kalshi-logic.js"),"utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(JS,"disagree-logic.js"),"utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(JS,"home-strip.js"),"utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(JS,"predictions.js"),"utf8"), sandbox);

setTimeout(() => {
  /* Boot board is the NFL tab (regression baseline). */
  ok("NFL boot board renders its game", els.predGrid.innerHTML.indexOf("Buffalo Bills") > -1 ||
     els.predSpot.innerHTML.indexOf("Buffalo Bills") > -1);

  tabs.filter(t => t.getAttribute("data-k") === "cfb")[0].fire("click");

  setTimeout(() => {
    const spot = els.predSpot.innerHTML, grid = els.predGrid.innerHTML;
    ok("cfb tab fetched the CFB series' events (series 12756)",
       fetched.some(u => u.indexOf("series_id=12756") > -1));
    ok("nearest college game is spotlighted (Navy vs Air Force)", spot.indexOf("Navy") > -1 && spot.indexOf("Air Force") > -1);
    ok("spotlight kicker is the football label (Next kickoff)", /NEXT KICKOFF/i.test(spot));
    ok("spotlight carries a live countdown", spot.indexOf('id="spotCountdown"') > -1);
    ok("spotlight shows Market-implied bars", spot.indexOf("Market-implied") > -1);
    ok("featured game removed from the grid", grid.indexOf("Navy") === -1);
    ok("second college game in the grid (Michigan vs Minnesota)",
       grid.indexOf("Michigan") > -1 && grid.indexOf("Minnesota") > -1);
    ok("grid card cites the Polymarket source", grid.indexOf("Source: Polymarket live price") > -1);
    ok("past game with a closed moneyline never renders",
       (spot + grid).indexOf("Northern Illinois") === -1);
    ok("futures event never renders as a game", (spot + grid).indexOf("College Football Champion") === -1);
    ok("no Kalshi row on college cards (cross-check stays NFL/MLB)",
       (spot + grid).indexOf(">Kalshi</span>") === -1);
    ok("the NCAAF Kalshi snapshot was never fetched",
       !fetched.some(u => u.indexOf("kalshi-ncaaf") > -1));
    ok("follow strip stays hidden (no directory namespace to resolve)",
       els.followStrip.innerHTML === "" || els.followStrip.hidden === true);

    console.log(fail ? `\n${fail} FAILURES` : `\nALL ${pass} PREDICTIONS-NCAAF TESTS PASSED`);
    process.exit(fail ? 1 : 0);
  }, 80);
}, 80);
