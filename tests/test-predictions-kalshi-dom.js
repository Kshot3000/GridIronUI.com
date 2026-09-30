/* GridIronUI v1.52.0 — Kalshi row wiring on the shipped predictions page.
   Loads the real js/kalshi-logic.js + js/disagree-logic.js + js/predictions.js
   in a vm sandbox with a stubbed DOM and feeds: verifies the NFL tab fetches
   the Kalshi snapshot, renders a Kalshi row for a matched game (with the
   Polymarket gap chip), and degrades gracefully when the snapshot fails.
   Run: node tests/test-predictions-kalshi-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const JS = path.join(__dirname, "..", "js");

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
const els = {};
const FUTURE = new Date(Date.now() + 6*3600*1000).toISOString();
const FRESH_SNAP = new Date(Date.now() - 3600*1000).toISOString();
/* The synthetic PM event starts 6h from now; its Eastern game day must
   equal the Kalshi ticker's game day or matches() (same-day rule, v1.96.0)
   correctly drops it. */
const MONS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const GD = new Date(Date.parse(FUTURE) - 4*3600000);
const TIC_DATE = String(GD.getUTCFullYear()).slice(2) + MONS[GD.getUTCMonth()] +
  String(GD.getUTCDate()).padStart(2, "0");

const pmEvent = {
  title: "Philadelphia Eagles vs. Chicago Bears",
  slug: "nfl-eagles-bears",
  startTime: FUTURE,
  markets: [{
    sportsMarketType: "moneyline", closed: false, active: true,
    outcomes: JSON.stringify(["Philadelphia Eagles", "Chicago Bears"]),
    outcomePrices: JSON.stringify(["0.65", "0.35"]),
  }],
};
const snapshot = {
  updated_at: FRESH_SNAP,
  games: [{
    sub_title: "PHI vs CHI (game day)", event_ticker: "KXNFLGAME-"+TIC_DATE+"PHICHI",
    markets: [
      {ticker: "KXNFLGAME-"+TIC_DATE+"PHICHI-PHI", kind: "winner", yes_bid: 65, yes_ask: 66},
      {ticker: "KXNFLGAME-"+TIC_DATE+"PHICHI-CHI", kind: "winner", yes_bid: 34, yes_ask: 35},
    ],
  }],
};

const calls = [];
function runCase(snapMode, done){
  const els2 = {};
  const sandbox = {
    document: {
      getElementById: id => (els2[id] || (els2[id] = makeEl(id))),
      createElement: t => makeEl(t),
      addEventListener(){},
    },
    GIU: {
      esc: s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
      failBox: msg => "<div class=fail>" + msg + "</div>",
      vsHeader: () => "",
      pmEventsUrl: (sid, limit) => "https://gamma-api.polymarket.com/events?series_id="+encodeURIComponent(sid)+"&active=true&closed=false&limit="+(limit||30)+"&order=startTime&ascending=true",
      teamDir: () => Promise.resolve({}),
      teamFind: (dir, league, q) => {
        const m = {"philadelphia eagles":"PHI","chicago bears":"CHI","phi":"PHI","chi":"CHI"};
        const a = m[String(q || "").toLowerCase()];
        return a ? {abbr: a} : null;
      },
      fetchJSON: url => {
        calls.push(url);
        if(/gamma-api\.polymarket\.com\/sports$/.test(url)) return Promise.resolve([{sport:"nfl", series:"999"}]);
        if(url.indexOf("/events?series_id=") > -1) return Promise.resolve([pmEvent]);
        if(url === "data/kalshi-nfl.json"){
          if(snapMode === "fail") return Promise.reject(new Error("blocked"));
          return Promise.resolve(snapshot);
        }
        return Promise.reject(new Error("unexpected url " + url));
      },
    },
    setInterval(){ return 0; }, clearInterval(){}, setTimeout, clearTimeout, console,
    Date, JSON, Promise, Array, Math, String, Number, isFinite, Object, RegExp, encodeURIComponent,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS,"kalshi-logic.js"),"utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS,"disagree-logic.js"),"utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS,"predictions.js"),"utf8"), sandbox);
  setTimeout(() => done(sandbox, els2), 60);
}

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("ok  ", name); } else { fail++; console.log("FAIL:", name); } }

runCase("ok", (sb, els2) => {
  const html = els2.predGrid.innerHTML;
  ok("NFL tab fetches the Kalshi snapshot", calls.indexOf("data/kalshi-nfl.json") > -1);
  ok("Polymarket card renders", html.indexOf("Market-implied") > -1);
  ok("Kalshi row rendered", html.indexOf(">Kalshi</span>") > -1);
  ok("Kalshi prices shown (66% / 35%)", html.indexOf("66%") > -1 && html.indexOf("35%") > -1);
  ok("gap chip vs Polymarket (|65-66|=1)", html.indexOf("\u03941\u00a2 vs Polymarket") > -1);
  ok("snapshot time labeled", /snapshot/i.test(html));
  ok("names escaped, not raw html", html.indexOf("Philadelphia Eagles") > -1);

  /* snapshot failure: Polymarket cards still render, no Kalshi row */
  runCase("fail", (sb2, e2) => {
    const h2 = e2.predGrid.innerHTML;
    ok("Polymarket cards render when snapshot fails", h2.indexOf("Market-implied") > -1);
    ok("no Kalshi row when snapshot fails", h2.indexOf(">Kalshi</span>") === -1);
    console.log(fail ? `\n${fail} FAILURES` : `\nALL ${pass} PREDICTIONS-KALSHI DOM TESTS PASSED`);
    process.exit(fail ? 1 : 0);
  });
});
