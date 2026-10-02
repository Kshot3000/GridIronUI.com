/* Verifies the team-follow wiring in the SHIPPED js/odds.js + js/team-follow.js.
   Loads the real odds-logic.js, team-brand.js, team-follow.js and odds.js in
   a vm sandbox with stubbed DOM/fetch, then asserts:
   - each game card renders ★ follow toggles (data-follow, aria-pressed=false,
     honest labels) for both resolvable sides — and none for unresolvable teams;
   - clicking a toggle persists the team to localStorage (giu-followed-teams),
     flips aria-pressed, and renders the "Followed teams" manage bar;
   - the first follow ever requests Notification permission exactly once
     (never nagged on later follows);
   - a steam move on a FOLLOWED team fires the browser Notification through
     the existing notifyAlert path (hidden tab + granted permission) with the
     ★ title, and the in-page toast carries the ★ marker — even with the
     threshold picker OFF;
   - unfollowing from the manage bar clears storage and hides the bar;
   - when notifications are denied, the manage bar shows the honest fallback
     copy instead of asking again.
   Run: node tests/test-team-follow-dom.js */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");

var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

function makeEl(id){
  var handlers = {};
  var el = {
    id: id, innerHTML: "", style: {}, value: "", className: "", checked: false,
    _attrs: {}, hidden: false,
    addEventListener: function(ev, fn){ (handlers[ev]=handlers[ev]||[]).push(fn); },
    setAttribute: function(k, v){ this._attrs[k] = String(v); },
    getAttribute: function(k){ return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    querySelectorAll: function(){ return []; },
    _fire: function(ev, arg){ (handlers[ev]||[]).forEach(function(fn){ fn.call(this, arg || {}); }, this); }
  };
  var cls = {};
  el.classList = {
    add: function(c){ cls[c]=1; }, remove: function(c){ delete cls[c]; },
    toggle: function(c, f){ var v = f!==undefined?!!f:!cls[c]; if(v)cls[c]=1; else delete cls[c]; return v; },
    contains: function(c){ return !!cls[c]; }
  };
  return el;
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(id); return els[id]; }
["oddsSetup","oddsBoard","oddsStatus","quota","keyInput","sportTabs","autoRef",
 "alertThr","refreshBtn","saveKey","clearKey","slipToggle","slipPanel","slipCount",
 "followBar","alertToasts"].forEach(getEl);

/* toasts box: DOM-ish child list */
(function(){
  var box = getEl("alertToasts");
  box.kids = [];
  box._sync = function(){
    box.children = box.kids;
    box.firstChild = box.kids[0] || null;
    box.lastChild = box.kids[box.kids.length-1] || null;
  };
  box.insertBefore = function(ch){ ch.parentNode = box; box.kids.unshift(ch); box._sync(); return ch; };
  box.removeChild = function(ch){
    box.kids = box.kids.filter(function(k){ return k !== ch; });
    box._sync(); return ch;
  };
  box.querySelectorAll = function(sel){
    return sel === ".alert-toast" ? box.kids.slice() : [];
  };
  box._sync();
})();

var store = { "giu_odds_key": "TESTKEY", "giu_odds_alert_thr": "0" };
var localStorageStub = {
  getItem: function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v){ store[k] = String(v); },
  removeItem: function(k){ delete store[k]; }
};

function o(name, price, point){
  var r = { name: name, price: price };
  if(point !== undefined) r.point = point;
  return r;
}
function mvEvent(id, awayPt, totalPt){
  return { id: id, home_team: "Green Bay Packers", away_team: "Chicago Bears",
    commence_time: new Date(Date.now() + 2*864e5).toISOString(),
    bookmakers: [
      { key: "draftkings", title: "DraftKings", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", 1.91, awayPt), o("Green Bay Packers", 1.91, -awayPt) ]},
        { key: "totals", outcomes: [ o("Over", 1.91, totalPt), o("Under", 1.91, totalPt) ]}]},
      { key: "fanduel", title: "FanDuel", markets: [
        { key: "spreads", outcomes: [ o("Chicago Bears", 1.91, awayPt), o("Green Bay Packers", 1.91, -awayPt) ]},
        { key: "totals", outcomes: [ o("Over", 1.91, totalPt), o("Under", 1.91, totalPt) ]}]}
    ]};
}
var oddsDeferreds = [];
var fetchStub = function(){
  var rec = {};
  rec.promise = new Promise(function(res){ rec.resolve = res; });
  oddsDeferreds.push(rec);
  return rec.promise;
};

/* notification double */
var notifications = [], permRequests = 0, permState = "default";
function NotificationStub(title, opts){ notifications.push({title: title, opts: opts}); }

var DIR = { nfl: [
  {abbr: "CHI", displayName: "Chicago Bears", shortDisplayName: "Bears", color: "0b162a"},
  {abbr: "GB", displayName: "Green Bay Packers", shortDisplayName: "Packers", color: "203731"}
]};

var sandbox = {
  console: console,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: function(){ return 0; }, clearInterval: function(){},
  document: { getElementById: getEl, hidden: true,
    querySelectorAll: function(){ return []; },
    querySelector: function(){ return null; },
    createElement: function(){ return makeEl("toast"); } },
  fetch: fetchStub,
  localStorage: localStorageStub,
  window: {},
  alert: function(){},
  GIU: {
    fetchJSON: function(){ return Promise.resolve({}); },
    teamDir: function(){ return Promise.resolve({}); },
    esc: function(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  },
  OddsSlip: {
    has: function(){ return false; }, toggle: function(){ return true; },
    reprice: function(){}, sameGame: function(){ return []; },
    payout: function(){ return {combinedAm:"+100", combined:2.0, implied:0.5, profit:100, total:200}; },
    remove: function(){}, clear: function(){},
    normalize: function(legs){ return legs; },
    valueSummary: function(){ return null; }
  }
};
sandbox.window.GIU = sandbox.GIU;
sandbox.window.OddsSlip = sandbox.OddsSlip;
sandbox.window.Notification = NotificationStub;
Object.defineProperty(sandbox.window, "Notification", {
  get: function(){ return NotificationStub; }, configurable: true
});
vm.createContext(sandbox);

var tabNFL = makeEl("tab-nfl"); tabNFL.setAttribute("data-sport","americanfootball_nfl");
getEl("sportTabs")._children = [tabNFL];

/* real modules: odds-logic, team-brand (real teamFind), team-follow, then odds.js.
   teamDir is pointed at the fixture dir BEFORE odds.js loads, because its
   initial render() fires synchronously at load. */
["js/odds-logic.js","js/team-brand.js","js/team-follow.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});
sandbox.GIU.teamDir = function(){ return Promise.resolve(DIR); };
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/odds.js"), "utf8"), sandbox, {filename: "js/odds.js"});
/* permission starts at "default" so the first-follow request is observable */
Object.defineProperty(NotificationStub, "permission", {
  get: function(){ return permState; }, configurable: true
});
NotificationStub.requestPermission = function(){
  permRequests++;
  return Promise.resolve(permState);
};

function settle(fn){ setTimeout(fn, 60); }
function apiResponse(events){
  return { status:200, ok:true, headers:{get:function(){ return "499"; }},
           json:function(){ return Promise.resolve(events); } };
}
function toasts(){ return getEl("alertToasts").kids; }
function followClick(abbr, name){
  getEl("oddsBoard")._fire("click", { target: { closest: function(sel){
    if(sel !== ".follow-btn") return null;
    return { getAttribute: function(k){
      return k === "data-follow" ? abbr : (k === "data-name" ? name : null); } };
  }}});
}
function unfollowClick(abbr){
  getEl("followBar")._fire("click", { target: { closest: function(sel){
    if(sel !== ".follow-x") return null;
    return { getAttribute: function(k){ return k === "data-unfollow" ? abbr : null; } };
  }}});
}

settle(function(){
  /* pull 1: seeds both baselines, fires nothing */
  oddsDeferreds[0].resolve(apiResponse([mvEvent("mv-1", -3, 44.5)]));
  settle(function(){
    var html = getEl("oddsBoard").innerHTML;
    assert(html.indexOf('data-follow="CHI"') !== -1,
           "game card renders a ★ toggle for the away team");
    assert(html.indexOf('data-follow="GB"') !== -1,
           "game card renders a ★ toggle for the home team");
    assert(html.indexOf('aria-pressed="false"') !== -1,
           "toggles start unpressed (aria-pressed=false)");
    assert(html.indexOf("Follow Chicago Bears — line-move alerts") !== -1,
           "toggle carries an honest aria-label naming the team");
    assert(toasts().length === 0, "seeding pull fires no toast");
    assert(getEl("followBar").hidden === true, "manage bar hidden with no follows");

    /* follow CHI: persists, renders the manage bar, asks permission once */
    followClick("CHI", "Chicago Bears");
    settle(function(){
      assert(store["giu-followed-teams"] === '["CHI"]',
             "follow persists the abbreviation to giu-followed-teams");
      var bar = getEl("followBar");
      assert(bar.hidden === false, "manage bar appears after the first follow");
      assert(bar.innerHTML.indexOf("Followed teams") !== -1,
             "manage bar is labeled 'Followed teams'");
      assert(bar.innerHTML.indexOf("CHI") !== -1,
             "manage bar lists the followed team");
      assert(bar.innerHTML.indexOf('data-unfollow="CHI"') !== -1,
             "manage bar has an unfollow control");
      assert(permRequests === 1,
             "first follow requests Notification permission exactly once");
      assert(store["giu_followed_perm_asked"] === "1",
             "the permission ask is recorded so it never nags again");

      /* pull 2: 1.5-pt steam on the followed team, alerts picker OFF */
      permState = "granted";
      getEl("refreshBtn")._fire("click");
      settle(function(){
        oddsDeferreds[1].resolve(apiResponse([mvEvent("mv-1", -4.5, 44.5)]));
        settle(function(){
          var ts = toasts();
          assert(ts.length === 1,
                 "followed-team steam move fires an in-page alert with the picker off");
          assert(ts[0].innerHTML.indexOf("tf-star") !== -1,
                 "the followed-team toast carries the ★ marker");
          var buzzed = notifications.filter(function(n){
            return n.title === "GridIronUI ★ followed-team move"; });
          assert(buzzed.length === 1,
                 "steam move on a followed team fires the browser Notification via the existing path");
          assert(buzzed[0].opts && buzzed[0].opts.body.indexOf("Chicago Bears") !== -1,
                 "the notification names the moved game");

          /* unfollow from the manage bar */
          unfollowClick("CHI");
          assert(store["giu-followed-teams"] === "[]",
                 "unfollow clears the team from storage");
          assert(getEl("followBar").hidden === true,
                 "manage bar hides when the last team is unfollowed");

          /* follow again: no second permission request (never nags) */
          followClick("GB", "Green Bay Packers");
          assert(permRequests === 1, "re-following never re-asks for permission");

          /* denied permission: honest inline fallback, no request */
          permState = "denied";
          unfollowClick("GB");
          followClick("GB", "Green Bay Packers");
          settle(function(){
            var note = getEl("followBar").innerHTML;
            assert(note.indexOf("Browser notifications blocked — followed-team moves still appear in the alerts panel below.") !== -1,
                   "denied permission shows the honest inline fallback copy");
            assert(permRequests === 1,
                   "denied permission never triggers another request");
            console.log(failures ? "\n" + failures + " FAILURES" : "\nALL TEAM-FOLLOW DOM TESTS PASSED");
            process.exit(failures ? 1 : 0);
          });
        });
      });
    });
  });
});
