/* GridIronUI v2.0.9 — live auto-refresh on the matchup hub.
   The hub was the last game page that froze at load: a live game's
   score/clock, the ESPN free line, injuries and the Polymarket price
   labeled "fetched just now" never moved after the first paint.
   Verifies the shipped matchup.html inline script in a vm sandbox
   with captured timers:
   - a live game arms a 60s timer; the pill carries the sibling
     live-status contract (live text + updated clock + pause button);
   - a tick re-pulls the summary and the header score + ESPN line
     update, while the Odds API book section is NOT re-fetched
     (the visitor's quota is guarded by the 5-minute slow bucket)
     and the Kalshi snapshot file is not re-pulled either;
   - ticks skip while the tab is hidden;
   - a failed silent tick keeps the hub on screen and the timer armed;
   - pause clears the timer and flips the pill; resume refreshes
     immediately and re-arms;
   - when a tick lands a final, the hub renders it and stops;
   - a pre-game hub arms the 5-minute cadence, a final arms nothing;
   - shipped matchup.html pins (pill markup + matchup.js v2.0.9).
   Run: node tests/test-matchup-live.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond, extra){
  if(!cond){ failures++; console.error("FAIL:", name, extra === undefined ? "" : String(extra).slice(0, 240)); }
  else console.log("ok:", name);
}
function esc(s){
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function flush(){
  var p = Promise.resolve(), i;
  for(i = 0; i < 20; i++) p = p.then(function(){ return new Promise(function(r){ setImmediate(r); }); });
  return p;
}
function summary(state, detail, aScore, hScore, line){
  return { header: { competitions: [{ date: "2026-10-03T17:00:00Z",
      status: { type: { state: state, shortDetail: detail } },
      competitors: [
        { homeAway: "away", score: aScore, record: [{type: "total", summary: "2-2"}],
          team: { abbreviation: "DAL", displayName: "Dallas Cowboys", shortDisplayName: "Cowboys" } },
        { homeAway: "home", score: hScore, record: [{type: "total", summary: "3-1"}],
          team: { abbreviation: "HOU", displayName: "Houston Texans", shortDisplayName: "Texans" } } ] }] },
    pickcenter: [{ details: line, overUnder: 48.5 }],
    gameInfo: { venue: { fullName: "NRG Stadium" } } };
}
var ODDS_EVENTS = [{ id: "ev1", away_team: "Dallas Cowboys", home_team: "Houston Texans",
  commence_time: "2026-10-03T17:00:00Z",
  bookmakers: [{ key: "draftkings", title: "DraftKings", markets: [] }] }];

function makeEl(id){
  var classes = {}, attrs = {}, listeners = {};
  return { id: id || "", innerHTML: "", textContent: "", hidden: false, style: {},
    classList: { add: function(c){ classes[c] = 1; }, remove: function(c){ delete classes[c]; },
      toggle: function(c, f){ if(f === undefined ? !classes[c] : !!f) classes[c] = 1; else delete classes[c]; },
      contains: function(c){ return !!classes[c]; } },
    setAttribute: function(k, v){ attrs[k] = String(v); },
    getAttribute: function(k){ return k in attrs ? attrs[k] : null; },
    addEventListener: function(k, f){ listeners[k] = f; },
    querySelectorAll: function(){ return []; }, querySelector: function(){ return null; },
    _attrs: attrs, _listeners: listeners };
}

function boot(opts){
  opts = opts || {};
  var ids = ["hubBoot", "hubBody", "hubHead", "hubLinesBody", "hubMovesBody",
             "hubWxBody", "hubInjBody", "hubKalshiBody", "hubPmBody", "hubTitle",
             "liveStatus", "pauseBtn"];
  var els = {};
  ids.forEach(function(id){ els[id] = makeEl(id); });
  var store = {};
  if(opts.key) store["giu_odds_key"] = "TESTKEY";
  var counts = { summary: 0, inj: 0, kalshi: 0, pm: 0, book: 0 };
  var state = { summary: opts.summary, failSummary: false };
  var timers = {}, timerSeq = 0;
  var doc = { hidden: false, addEventListener: function(){},
    getElementById: function(id){ return els[id] || null; } };
  var sandbox = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function(fn, ms){ var id = ++timerSeq; timers[id] = { fn: fn, ms: ms, cleared: false }; return id; },
    clearInterval: function(id){ if(timers[id]) timers[id].cleared = true; },
    location: { search: "?league=nfl&event=401872999" },
    localStorage: { getItem: function(k){ return k in store ? store[k] : null; },
                    setItem: function(k, v){ store[k] = String(v); },
                    removeItem: function(k){ delete store[k]; } },
    document: doc,
    fetch: function(url){
      if(String(url).indexOf("the-odds-api.com") !== -1){
        counts.book++;
        return Promise.resolve({ ok: true, status: 200,
          json: function(){ return Promise.resolve(ODDS_EVENTS); } });
      }
      return Promise.reject(new Error("unexpected fetch " + url));
    }
  };
  sandbox.window = sandbox;
  sandbox.GIU = {
    esc: esc,
    fetchJSON: function(url){
      url = String(url);
      if(url.indexOf("/summary?event=") !== -1){
        counts.summary++;
        if(state.failSummary) return Promise.reject(new Error("espn down"));
        return Promise.resolve(state.summary);
      }
      if(url.indexOf("/injuries") !== -1){ counts.inj++; return Promise.resolve({}); }
      if(url.indexOf("data/kalshi-") !== -1){ counts.kalshi++; return Promise.resolve({}); }
      if(url.indexOf("gamma-api.polymarket.com/sports") !== -1){
        return Promise.resolve([{ sport: "nfl", series: "123" }]);
      }
      if(url.indexOf("pm-events") !== -1){ counts.pm++; return Promise.resolve([]); }
      return Promise.reject(new Error("unstubbed: " + url));
    },
    pmEventsUrl: function(series){ return "https://example.invalid/pm-events?series=" + series; },
    teamDir: function(){ return Promise.resolve({}); },
    vsHeader: function(){ return ""; },
    failBox: function(m){ return "FAILBOX: " + m; }
  };
  sandbox.OddsPm = { pmPrices: function(){ return {}; } };
  /* GIU.homeStrip / homeWx / OddsLogic / TeamFollow intentionally absent:
     weather + Kalshi take honest gate paths, book rows render header-only,
     and the follow strip no-ops — the live machinery is what is under test. */
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/matchup.js"), "utf8"), sandbox, { filename: "matchup.js" });
  var html = fs.readFileSync(path.join(ROOT, "matchup.html"), "utf8");
  var m = html.match(/<script>\n(\(function\(\)\{[\s\S]*?\}\)\(\);\n)<\/script>/);
  if(!m){ ok("inline hub script extracted", false); return null; }
  vm.runInContext(m[1], sandbox, { filename: "matchup.html#inline" });
  return { els: els, counts: counts, state: state, doc: doc,
    activeTimers: function(){
      return Object.keys(timers).filter(function(id){ return !timers[id].cleared; })
        .map(function(id){ return timers[id]; });
    },
    fireTick: function(){
      var act = this.activeTimers();
      if(!act.length) return false;
      act[act.length - 1].fn();
      return true;
    } };
}

(async function(){
  /* ---- live game: arm, tick, quota guard, hidden skip, failure, pause/resume, final ---- */
  var b = boot({ key: true, summary: summary("in", "Q2 5:00", "10", "14", "HOU -3") });
  await flush();
  ok("boot: header shows the live score", b.els.hubHead.innerHTML.indexOf("10 – 14") !== -1, b.els.hubHead.innerHTML.slice(0, 200));
  ok("boot: pill shows live + 60s cadence + updated clock",
    b.els.liveStatus.innerHTML.indexOf("Live") !== -1 &&
    b.els.liveStatus.innerHTML.indexOf("every 60s") !== -1 &&
    b.els.liveStatus.innerHTML.indexOf("updated") !== -1, b.els.liveStatus.innerHTML);
  ok("boot: pause button visible", b.els.pauseBtn.style.display === "");
  var t0 = b.activeTimers();
  ok("boot: one 60s timer armed", t0.length === 1 && t0[0].ms === 60000, JSON.stringify(t0.map(function(t){ return t.ms; })));
  ok("boot: one pull each of summary/injuries/kalshi/book",
    b.counts.summary === 1 && b.counts.inj === 1 && b.counts.kalshi === 1 && b.counts.book === 1,
    JSON.stringify(b.counts));

  b.state.summary = summary("in", "Q3 1:00", "17", "14", "DAL -2.5");
  ok("tick fires", b.fireTick());
  await flush();
  ok("tick: header score updated in place", b.els.hubHead.innerHTML.indexOf("17 – 14") !== -1);
  ok("tick: ESPN free line updated", b.els.hubLinesBody.innerHTML.indexOf("DAL -2.5") !== -1, b.els.hubLinesBody.innerHTML.slice(0, 200));
  ok("tick: cached book section kept (no re-render loss)", b.els.hubLinesBody.innerHTML.indexOf("Best prices") !== -1);
  ok("tick: Odds API NOT re-fetched on a 60s tick (quota guard)", b.counts.book === 1, "book=" + b.counts.book);
  ok("tick: Kalshi snapshot NOT re-pulled inside the slow bucket", b.counts.kalshi === 1, "kalshi=" + b.counts.kalshi);
  ok("tick: summary + injuries + Polymarket re-pulled",
    b.counts.summary === 2 && b.counts.inj === 2 && b.counts.pm === 2, JSON.stringify(b.counts));

  b.doc.hidden = true;
  b.fireTick();
  await flush();
  ok("hidden tab: tick skipped, no summary pull", b.counts.summary === 2, "summary=" + b.counts.summary);
  b.doc.hidden = false;

  b.state.failSummary = true;
  b.state.summary = summary("in", "Q3 0:30", "99", "0", "DAL -40");
  b.fireTick();
  await flush();
  ok("failed tick: hub on screen is preserved (no 99-0, no error box)",
    b.els.hubHead.innerHTML.indexOf("17 – 14") !== -1 && b.els.hubHead.innerHTML.indexOf("99") === -1);
  ok("failed tick: timer still armed for the next retry", b.activeTimers().length === 1);
  b.state.failSummary = false;

  b.els.pauseBtn._listeners.click();
  ok("pause: timer cleared", b.activeTimers().length === 0);
  ok("pause: pill flips to paused + resume affordance",
    b.els.liveStatus.textContent === "auto-refresh paused" &&
    b.els.pauseBtn._attrs["aria-pressed"] === "true");
  var beforeResume = b.counts.summary;
  b.els.pauseBtn._listeners.click();
  await flush();
  ok("resume: immediate refresh + timer re-armed",
    b.counts.summary === beforeResume + 1 && b.activeTimers().length === 1,
    "summary=" + b.counts.summary);
  ok("resume: the recovered score lands (99 – 0 now real)", b.els.hubHead.innerHTML.indexOf("99 – 0") !== -1);

  b.state.summary = summary("post", "Final", "24", "21", "DAL -3");
  b.fireTick();
  await flush();
  ok("final tick: final score renders", b.els.hubHead.innerHTML.indexOf("24 – 21") !== -1);
  ok("final tick: refresh stops (no active timer)", b.activeTimers().length === 0);
  ok("final tick: pill says Final and pause hides",
    b.els.liveStatus.textContent.indexOf("Final") !== -1 && b.els.pauseBtn.style.display === "none",
    b.els.liveStatus.textContent);

  /* ---- pre-game: 5-minute cadence ---- */
  var p = boot({ key: false, summary: summary("pre", "Sat, Oct 3 · 1:00 PM", null, null, "HOU -3") });
  await flush();
  var tp = p.activeTimers();
  ok("pre: one 5-min timer armed", tp.length === 1 && tp[0].ms === 5*60*1000, JSON.stringify(tp.map(function(t){ return t.ms; })));
  ok("pre: pill names the 5-min cadence", p.els.liveStatus.innerHTML.indexOf("every 5 min") !== -1, p.els.liveStatus.innerHTML);
  ok("pre: no key -> honest key gate, no book fetch",
    p.els.hubLinesBody.innerHTML.indexOf("Best book prices need your free key") !== -1 && p.counts.book === 0);
  p.state.summary = summary("pre", "Sat, Oct 3 · 1:00 PM", null, null, "HOU -4.5");
  p.fireTick();
  await flush();
  ok("pre tick: line move lands without a key", p.els.hubLinesBody.innerHTML.indexOf("HOU -4.5") !== -1);

  /* ---- final at boot: nothing arms ---- */
  var f = boot({ summary: summary("post", "Final", "24", "21", "DAL -3") });
  await flush();
  ok("final boot: no timer armed", f.activeTimers().length === 0);
  ok("final boot: pill says Final, pause hidden",
    f.els.liveStatus.textContent.indexOf("Final") !== -1 && f.els.pauseBtn.style.display === "none");

  /* ---- shipped pins ---- */
  var html = fs.readFileSync(path.join(ROOT, "matchup.html"), "utf8");
  ok("pin: hub carries the live-status pill", html.indexOf('id="liveStatus" class="live-status"') !== -1);
  ok("pin: hub carries the pause button", html.indexOf('id="pauseBtn"') !== -1);
  ok("pin: hub keys matchup.js at v2.0.9", html.indexOf('js/matchup.js?v=2.0.9') !== -1);
  ok("pin: hub wires refreshHub + scheduleLive", html.indexOf("function refreshHub()") !== -1 && html.indexOf("function scheduleLive()") !== -1);
  ok("pin: hub cadence comes from M.refreshDelay", html.indexOf("M.refreshDelay(info)") !== -1);
  ok("pin: slow bucket comes from M.slowDue", html.indexOf("M.slowDue(lastSlowAt, lastUpdated)") !== -1);
  ok("pin: footnote no longer claims PM is load-only",
    html.indexOf("when you load this page") === -1 && html.indexOf("re-fetched on the hub") !== -1);

  console.log(failures ? "\n" + failures + " FAILURES" : "\nALL MATCHUP-LIVE TESTS PASSED");
  process.exit(failures ? 1 : 0);
})().catch(function(e){ console.error("ERROR:", e && e.stack || e); process.exit(1); });
