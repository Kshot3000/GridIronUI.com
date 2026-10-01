/* GridIronUI v1.125.0 — "Next game" spotlight on the predictions page.
   Loads the real js/kalshi-logic.js + js/disagree-logic.js + js/home-strip.js
   (for the tested kickoffIn countdown) + js/predictions.js in a vm sandbox
   with a stubbed DOM and feeds. Verifies:
   - the nearest upcoming game is featured in #predSpot with a league-aware
     kicker and a live countdown from home-strip's kickoffIn
   - the featured game is removed from #predGrid (no duplication)
   - the countdown ticks on a 60s timer
   - past games never spotlight (stale kickoff -> grid only)
   - EPL tab uses the soccer kicker label
   - the Kalshi cross-check rides along in the spotlight card
   - shipped predictions.html wiring pins (predSpot slot, script cache keys)
   Run: node tests/test-predictions-spotlight.js */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const JS = path.join(ROOT, "js");

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

function pmEvent(title, startIso, slug){
  return {
    title, slug: slug || "test-event", startTime: startIso,
    markets: [{
      sportsMarketType: "moneyline", closed: false, active: true,
      outcomes: JSON.stringify([title.split(/\s+vs\.?\s+/)[0], title.split(/\s+vs\.?\s+/)[1] || "Away"]),
      outcomePrices: JSON.stringify(["0.60", "0.40"]),
      oneWeekPriceChange: "0.02",
    }],
  };
}

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL:", name); } }

function runCase(cfg, done){
  const els = {};
  const intervals = [];
  let timerSeq = 0;
  const tabs = ["nfl","nba","mlb","nhl","epl"].map(k => {
    const t = makeEl("tab-"+k);
    t.getAttribute = a => (a === "data-k" ? k : undefined);
    t.classList.add = function(){}; t.classList.remove = function(){};
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
      teamFind: (dir, league, q) => {
        const m = {"philadelphia eagles":"PHI","chicago bears":"CHI","phi":"PHI","chi":"CHI"};
        const a = m[String(q || "").toLowerCase()];
        return a ? {abbr: a} : null;
      },
      fetchJSON: url => {
        if(/gamma-api\.polymarket\.com\/sports$/.test(url)) return Promise.resolve(cfg.sports);
        if(url.indexOf("/events?series_id=") > -1) return Promise.resolve(cfg.events);
        if(url === "data/kalshi-nfl.json") return cfg.snap ? Promise.resolve(cfg.snap) : Promise.reject(new Error("blocked"));
        return Promise.reject(new Error("unexpected url " + url));
      },
    },
    setInterval(fn, ms){ const id = ++timerSeq; intervals.push([fn, ms, id]); return id; },
    clearInterval(id){ const i = intervals.findIndex(e => e[2] === id); if(i > -1) intervals.splice(i, 1); }, setTimeout, clearTimeout, console,
    Date, JSON, Promise, Array, Math, String, Number, isFinite, Object, RegExp, encodeURIComponent,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS,"kalshi-logic.js"),"utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS,"disagree-logic.js"),"utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS,"home-strip.js"),"utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS,"predictions.js"),"utf8"), sandbox);
  setTimeout(() => {
    /* The script auto-loads the NFL tab; click into the configured tab. */
    const tab = tabs.filter(t => t.getAttribute("data-k") === cfg.tab)[0];
    tab.fire("click");
    setTimeout(() => done(sandbox, els, intervals, tabs), 60);
  }, 60);
}

/* ---------- NFL: two future games, nearest is featured ---------- */
const evNear = pmEvent("Philadelphia Eagles vs. Chicago Bears", iso(NOW + 3*H), "nfl-eagles-bears");
const evFar  = pmEvent("Kansas City Chiefs vs. Buffalo Bills", iso(NOW + 50*H), "nfl-chiefs-bills");
/* Kalshi ticker date must be the PM event's Eastern game day (same-day rule,
   v1.96.0) — computed dynamically so this stays green any day it runs. */
const MONS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const GD = new Date(Date.parse(evNear.startTime) - 4*3600000);
const TIC_DATE = String(GD.getUTCFullYear()).slice(2) + MONS[GD.getUTCMonth()] +
  String(GD.getUTCDate()).padStart(2, "0");
const snap = {
  updated_at: iso(NOW - H),
  games: [{
    sub_title: "PHI vs CHI (game day)", event_ticker: "KXNFLGAME-"+TIC_DATE+"PHICHI",
    markets: [
      {ticker: "KXNFLGAME-"+TIC_DATE+"PHICHI-PHI", kind: "winner", yes_bid: 65, yes_ask: 66},
      {ticker: "KXNFLGAME-"+TIC_DATE+"PHICHI-CHI", kind: "winner", yes_bid: 34, yes_ask: 35},
    ],
  }],
};

runCase({
  tab: "nfl", snap,
  sports: [{sport:"nfl", series:"999"}],
  events: [evFar, evNear], /* deliberately unsorted: page must sort */
}, (sb, els, intervals) => {
  const spot = els.predSpot.innerHTML, grid = els.predGrid.innerHTML;
  ok("spotlight kicker is league-aware (NFL -> Next kickoff)", /NEXT KICKOFF/i.test(spot));
  ok("spotlight shows the nearest game", spot.indexOf("Philadelphia Eagles") > -1);
  const HS = sb.window.GIU.homeStrip;
  const expectCd = HS.kickoffIn(evNear.startTime);
  ok("countdown rendered from home-strip kickoffIn ("+expectCd+")",
     expectCd !== null &&
     spot.indexOf('id="spotCountdown"') > -1 && spot.indexOf(expectCd) > -1);
  ok("spotlight carries the Polymarket probability bars", spot.indexOf("Market-implied") > -1);
  ok("featured game removed from the grid (no duplication)",
     grid.indexOf("Philadelphia Eagles") === -1);
  ok("second game still in the grid", grid.indexOf("Kansas City Chiefs") > -1);
  ok("Kalshi cross-check rides along in the spotlight", spot.indexOf(">Kalshi</span>") > -1);
  ok("60s countdown timer registered",
     intervals.some(([fn, ms]) => ms === 60000));
  ok("only one 60s timer (no stacking)", intervals.filter(([fn, ms]) => ms === 60000).length === 1);

  /* ---------- past-only games: no spotlight, grid still works ---------- */
  runCase({
    tab: "nfl", snap: null,
    sports: [{sport:"nfl", series:"999"}],
    events: [pmEvent("Denver Broncos vs. Las Vegas Raiders", iso(NOW - H), "nfl-past")],
  }, (sb2, els2, iv2) => {
    const spot2 = els2.predSpot.innerHTML, grid2 = els2.predGrid.innerHTML;
    ok("no spotlight when every game already started", spot2 === "");
    ok("past game still listed in the grid", grid2.indexOf("Denver Broncos") > -1);
    ok("no countdown timer when nothing to spotlight",
       iv2.every(([fn, ms]) => ms !== 60000));

    /* ---------- EPL tab: soccer kicker + spotlight ---------- */
    runCase({
      tab: "epl", snap: null,
      sports: [{sport:"nfl", series:"999"}, {sport:"epl", series:"888"}],
      events: [pmEvent("Arsenal vs Chelsea", iso(NOW + 26*H), "epl-ars-chel")],
    }, (sb3, els3) => {
      const spot3 = els3.predSpot.innerHTML, grid3 = els3.predGrid.innerHTML;
      ok("EPL kicker uses the soccer label (Next kick-off)", /NEXT KICK-OFF/i.test(spot3));
      ok("EPL game featured", spot3.indexOf("Arsenal") > -1);
      const HS3 = sb3.window.GIU.homeStrip;
      const expectCd3 = HS3.kickoffIn(iso(NOW + 26*H));
      ok("EPL countdown uses home-strip kickoffIn ("+expectCd3+")",
         expectCd3 !== null && spot3.indexOf(expectCd3) > -1);
      ok("EPL game removed from its grid", grid3.indexOf("Arsenal") === -1);

      /* ---------- shipped wiring pins ---------- */
      const html = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
      ok("predictions.html has the #predSpot slot", html.indexOf('id="predSpot"') > -1);
      ok("predictions.js cache key bumped to v1.135.0", html.indexOf("js/predictions.js?v=1.135.0") > -1);
      ok("home-strip.js included for kickoffIn reuse", html.indexOf("js/home-strip.js?v=1.129.1") > -1);
      ok("home-strip.js loads before predictions.js",
         html.indexOf("js/home-strip.js") < html.indexOf("js/predictions.js"));

      console.log(fail ? `\n${fail} FAILURES` : `\nALL ${pass} PREDICTIONS-SPOTLIGHT TESTS PASSED`);
      process.exit(fail ? 1 : 0);
    });
  });
});
