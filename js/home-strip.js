/* GridIronUI homepage strip — "Happening now / Today's games".
   Collects the ESPN scoreboards for the four US leagues in parallel, drops
   finished games, and ranks live games first, then by kickoff time. Pure
   logic lives here for node tests; the DOM wiring stays in index.html.
   Browser: window.GIU.homeStrip · node: module.exports */
(function(){
"use strict";
var LEAGUES = [
  ["football/nfl","NFL"],["baseball/mlb","MLB"],
  ["basketball/nba","NBA"],["hockey/nhl","NHL"]
];
function scoreUrl(path){
  return "https://site.api.espn.com/apis/site/v2/sports/"+path+"/scoreboard";
}
/* Flatten one league's scoreboard payload into strip rows. Finished ("post")
   games are dropped — the strip is for what's happening or coming up.
   Malformed events are skipped, never guessed. The original competitor
   objects are kept so the page can render them with GIU.teamRow. */
function collect(leagueLabel, payload){
  var evs = (payload && payload.events) || [];
  var out = [];
  evs.forEach(function(ev){
    try{
      var c = (ev.competitions||[])[0]; if(!c) return;
      var st = (((c.status||{}).type)||{}).state || "";
      if(st === "post") return;
      var home = null, away = null;
      ((c.competitors)||[]).forEach(function(t){
        if(t.homeAway === "home") home = t;
        else if(t.homeAway === "away") away = t;
      });
      if(!home || !away) return;
      out.push({
        id: ev.id,
        league: leagueLabel,
        date: ev.date || "",
        state: st,
        shortDetail: (((c.status||{}).type)||{}).shortDetail || "",
        away: away,
        home: home,
        venue: ((c.venue)||{}).fullName || ""
      });
    }catch(e){ /* skip the malformed event, keep the rest */ }
  });
  return out;
}
/* Live games first, then earliest kickoff. Unparseable dates sink to the end. */
function rankRows(a, b){
  var al = a.state === "in" ? 0 : 1, bl = b.state === "in" ? 0 : 1;
  if(al !== bl) return al - bl;
  var at = Date.parse(a.date), bt = Date.parse(b.date);
  at = isFinite(at) ? at : Infinity;
  bt = isFinite(bt) ? bt : Infinity;
  return at - bt;
}
/* Sorted top-n rows; n defaults to the strip size on the homepage. */
function top(rows, n){
  return (rows||[]).slice().sort(rankRows).slice(0, n == null ? 6 : n);
}
var api = {LEAGUES: LEAGUES, scoreUrl: scoreUrl, collect: collect,
           rankRows: rankRows, top: top};
if(typeof module !== "undefined" && module.exports) module.exports = api;
else (window.GIU = window.GIU || {}).homeStrip = api;
})();
