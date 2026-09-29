/* Unit tests for upcomingMlbPostseason (js/wx-shared.js): the MLB postseason
   scoreboard pull (seasontype=3) with pre-state filtering. fetchJSON is
   injected so no live ESPN call happens in tests. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function ok(name, cond){ if(!cond){ failures++; console.error("FAIL", name); } else console.log("ok  ", name); }

var sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/wx-shared.js"), "utf8"), sandbox);
var W = require(path.join(ROOT, "js/wx-shared.js"));

ok("upcomingMlbPostseason exported on module + GIU", typeof W.upcomingMlbPostseason === "function" &&
  typeof sandbox.window.GIU.wxUpcomingMlbPostseason === "function");

function ev(id, state){
  return {id: id, competitions: [{status: {type: {state: state}},
    competitors: [{homeAway:"home",team:{abbreviation:"NYY"}},{homeAway:"away",team:{abbreviation:"BOS"}}]}]};
}
function stubFetch(payload){
  var seen = [];
  return { seen: seen, fn: function(url){ seen.push(url); return Promise.resolve(payload); } };
}

var MLB_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?seasontype=3";

var s1 = stubFetch({events: [ev("1","pre"), ev("2","in"), ev("3","post"), ev("4","pre")]});
W.upcomingMlbPostseason(s1.fn).then(function(res){
  ok("requests the postseason board (seasontype=3)", s1.seen[0] === MLB_URL);
  ok("keeps pre + in, drops post", res.events.length === 3 &&
    res.events.map(function(e){return e.id;}).join(",") === "1,2,4");

  var s2 = stubFetch({events: []});
  return W.upcomingMlbPostseason(s2.fn);
}).then(function(res2){
  ok("empty board -> empty events (section stays hidden)", Array.isArray(res2.events) && res2.events.length === 0);

  var s3 = stubFetch({});
  return W.upcomingMlbPostseason(s3.fn);
}).then(function(res3){
  ok("missing events key -> empty events, no crash", res3.events.length === 0);

  var bad = { fn: function(){ return Promise.reject(new Error("down")); } };
  return W.upcomingMlbPostseason(bad.fn).then(function(){
    ok("fetch failure -> rejects (caller shows feed state)", false);
  }, function(){
    ok("fetch failure -> rejects (caller shows feed state)", true);
  });
}).then(function(){
  console.log(failures ? ("\n"+failures+" FAILURES") : "\nALL MLB POSTSEASON TESTS PASS");
  process.exit(failures ? 1 : 0);
}).catch(function(e){
  failures++; console.error("FAIL unexpected throw", e);
  process.exit(1);
});
