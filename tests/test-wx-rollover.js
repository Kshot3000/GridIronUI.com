/* Unit tests for the weather week-rollover fetcher (js/wx-shared.js).
   ESPN's default scoreboard lags reality between the week's last game and the
   Tuesday rollover — the board is all-post and a naive `pre` filter yields a
   dead weather page on exactly the mornings bettors handicap the weekend.
   upcomingNfl() detects that window and pulls next week's slate explicitly.
   Run: node tests/test-wx-rollover.js */
"use strict";
var path = require("path");
var ROOT = path.join(__dirname, "..");
var WS = require(path.join(ROOT, "js/wx-shared.js"));

var failures = 0, pending = 0;
function ok(name, cond){
  if(!cond){ failures++; console.error("FAIL", name); }
  else console.log("ok  ", name);
}
function async(name, fn){
  pending++;
  Promise.resolve().then(fn).then(function(){
    console.log("ok  ", name); pending--;
  }, function(e){
    failures++; console.error("FAIL", name, "-", (e && e.message) || e); pending--;
  });
}

var BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
function ev(id, state){
  return { id: id, date: "2026-10-01T17:00Z",
    competitions: [{ status: { type: { state: state } },
      competitors: [
        { homeAway: "home", team: { abbreviation: "CHI" } },
        { homeAway: "away", team: { abbreviation: "GB" } } ] }] };
}
function board(states, weekNum, seasonType){
  return { week: { number: weekNum }, season: { type: seasonType },
    events: states.map(function(s, i){ return ev("e"+i, s); }) };
}

/* A: current week has pre games — one fetch, no fallback */
async("primary with pre games: single fetch, isFallback false", function(){
  var calls = [];
  return WS.upcomingNfl(function(url){ calls.push(url); return Promise.resolve(board(["pre","pre"], 4, 2)); })
    .then(function(r){
      ok("two pre events returned", r.events.length === 2);
      ok("only the default board was fetched", calls.length === 1 && calls[0] === BASE);
      ok("isFallback false", r.isFallback === false);
      ok("week reported", r.week === 4);
    });
});

/* B: all-post primary (the real Tuesday-morning shape) -> week+1 fetch */
async("all-post primary: fetches week=number+1 with same seasontype", function(){
  var calls = [];
  function fetch(url){
    calls.push(url);
    if(url === BASE) return Promise.resolve(board(["post","post"], 3, 2));
    return Promise.resolve(board(["pre","pre","pre"], 4, 2));
  }
  return WS.upcomingNfl(fetch).then(function(r){
    ok("fallback URL asks for week 4, seasontype 2",
      calls[1] === BASE + "?week=4&seasontype=2");
    ok("isFallback true", r.isFallback === true);
    ok("next-week pre games returned", r.events.length === 3);
    ok("week taken from the fallback payload", r.week === 4);
  });
});

/* C: in-progress games count as upcoming (matches the old !== "post" filter) */
async("in-progress games are kept, not dropped", function(){
  return WS.upcomingNfl(function(){ return Promise.resolve(board(["in","post"], 4, 2)); })
    .then(function(r){
      ok("one in-progress event returned", r.events.length === 1);
      ok("no fallback needed", r.isFallback === false);
    });
});

/* D: fallback fetch fails -> empty events, no throw (honest empty state) */
async("fallback failure resolves empty, isFallback true", function(){
  function fetch(url){
    if(url === BASE) return Promise.resolve(board(["post"], 3, 2));
    return Promise.reject(new Error("boom"));
  }
  return WS.upcomingNfl(fetch).then(function(r){
    ok("empty events", r.events.length === 0);
    ok("isFallback true", r.isFallback === true);
  });
});

/* E: fallback returns no pre games -> empty events, isFallback true */
async("empty fallback board resolves empty", function(){
  function fetch(url){
    if(url === BASE) return Promise.resolve(board(["post"], 3, 2));
    return Promise.resolve(board(["post"], 4, 2));
  }
  return WS.upcomingNfl(fetch).then(function(r){
    ok("empty events", r.events.length === 0);
    ok("isFallback true", r.isFallback === true);
  });
});

/* F: primary fetch fails -> rejects so the page shows its feed-failure box */
async("primary failure rejects", function(){
  var rejected = false;
  return WS.upcomingNfl(function(){ return Promise.reject(new Error("down")); })
    .then(function(){}, function(){ rejected = true; })
    .then(function(){ ok("rejected", rejected); });
});

/* G: missing/garbage week number -> no second fetch, no crash */
async("garbage week number: no fallback fetch attempted", function(){
  var calls = [];
  function fetch(url){ calls.push(url); return Promise.resolve(board(["post"], "soon", 2)); }
  return WS.upcomingNfl(fetch).then(function(r){
    ok("single fetch only", calls.length === 1);
    ok("empty events", r.events.length === 0);
    ok("isFallback false", r.isFallback === false);
  });
});

/* H: absurd week number guard — never asks ESPN for week 99 */
async("week number capped: no fallback past week 22", function(){
  var calls = [];
  function fetch(url){ calls.push(url); return Promise.resolve(board(["post"], 40, 2)); }
  return WS.upcomingNfl(fetch).then(function(r){
    ok("single fetch only", calls.length === 1);
    ok("isFallback false", r.isFallback === false);
  });
});

/* fallbackNoticeHTML: names the week, escapes hostile input */
ok("notice names the week",
  /Week 4/.test(WS.fallbackNoticeHTML(4)));
ok("notice escapes hostile week values",
  WS.fallbackNoticeHTML('<img src=x onerror=alert(1)>', function(s){
    return String(s).replace(/[<>&"]/g, function(c){
      return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c];
    });
  }).indexOf("<img") === -1);
ok("notice renders without an esc injector",
  WS.fallbackNoticeHTML(5).indexOf("Week 5") !== -1);

var spin = setInterval(function(){
  if(pending === 0){
    clearInterval(spin);
    console.log(failures ? failures + " FAILURES" : "ALL PASS");
    process.exit(failures ? 1 : 0);
  }
}, 25);
setTimeout(function(){ console.error("TIMEOUT"); process.exit(1); }, 8000);
