/* GridIronUI DFS injury cross-check — pure functions, no DOM.
   Matches DFS player-pool rows against the ESPN injuries feed and flags pool
   players who appear on the injury report. Conservative by design:
     - exact normalized full-name + team match -> strength "full"
     - last-name + team match, unique on BOTH sides -> strength "probable"
   Entries whose status is benign (e.g. "Active" = cleared to play) are dropped,
   as are entries whose team can't be resolved. Demo-slate names never match
   real athletes, so the check stays quiet on the synthetic pool.
   Browser: window.DFSInj · node: module.exports */
(function(){
"use strict";

/* ESPN injuries feed groups injuries by team displayName; this maps the
   canonical displayNames (verified live 2026-09-27) to DFS abbreviations. */
var TEAM_ABBR = {
  /* NFL (32) */
  "Arizona Cardinals":"ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL",
  "Buffalo Bills":"BUF","Carolina Panthers":"CAR","Chicago Bears":"CHI",
  "Cincinnati Bengals":"CIN","Cleveland Browns":"CLE","Dallas Cowboys":"DAL",
  "Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB",
  "Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAX",
  "Kansas City Chiefs":"KC","Las Vegas Raiders":"LV","Los Angeles Chargers":"LAC",
  "Los Angeles Rams":"LAR","Miami Dolphins":"MIA","Minnesota Vikings":"MIN",
  "New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG",
  "New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT",
  "San Francisco 49ers":"SF","Seattle Seahawks":"SEA","Tampa Bay Buccaneers":"TB",
  "Tennessee Titans":"TEN","Washington Commanders":"WAS",
  /* NBA (30) */
  "Atlanta Hawks":"ATL","Boston Celtics":"BOS","Brooklyn Nets":"BKN",
  "Charlotte Hornets":"CHA","Chicago Bulls":"CHI","Cleveland Cavaliers":"CLE",
  "Dallas Mavericks":"DAL","Denver Nuggets":"DEN","Detroit Pistons":"DET",
  "Golden State Warriors":"GSW","Houston Rockets":"HOU","Indiana Pacers":"IND",
  "LA Clippers":"LAC","Los Angeles Lakers":"LAL","Memphis Grizzlies":"MEM",
  "Miami Heat":"MIA","Milwaukee Bucks":"MIL","Minnesota Timberwolves":"MIN",
  "New Orleans Pelicans":"NOP","New York Knicks":"NYK","Oklahoma City Thunder":"OKC",
  "Orlando Magic":"ORL","Philadelphia 76ers":"PHI","Phoenix Suns":"PHX",
  "Portland Trail Blazers":"POR","Sacramento Kings":"SAC","San Antonio Spurs":"SAS",
  "Toronto Raptors":"TOR","Utah Jazz":"UTA","Washington Wizards":"WAS"
};

function teamAbbr(espnDisplayName){
  return TEAM_ABBR[String(espnDisplayName||"")] || null;
}

/* Severity ranking for DFS relevance: Out > Doubtful > Questionable/Day-To-Day.
   Statuses are ESPN free text (verified live 2026-09-27): NFL uses Out /
   Injured Reserve / Doubtful / Questionable; NBA "Day-To-Day"; plus cleared
   players listed as "Active", which rank 0 and are dropped from matching. */
function sevRank(s){
  s = String(s||"");
  if(/out|injured reserve|\bil\b|injured list/i.test(s)) return 3;
  if(/doubtful/i.test(s)) return 2;
  if(/questionable|day[- ]to[- ]day/i.test(s)) return 1;
  return 0;
}

var SUFFIX = {jr:1,sr:1,ii:1,iii:1,iv:1,v:1};
function normName(name){
  var t = String(name||"").toLowerCase()
    .replace(/[.,'’`]/g,"")          /* O'Brien -> obrien, "Jr." -> "jr" */
    .replace(/[^a-z0-9 ]/g," ")
    .replace(/\s+/g," ").trim();
  var parts = t.split(" ").filter(function(p){ return p && !SUFFIX[p]; });
  return parts.join(" ");
}
function lastName(normed){ var p = String(normed||"").split(" "); return p[p.length-1] || ""; }
function normTeam(t){ return String(t||"").trim().toUpperCase(); }

/* Flatten one ESPN injuries payload into match-ready entries.
   Skips: entries without an athlete name, benign statuses, unresolvable teams. */
function flattenInjuries(payload){
  var out = [];
  var groups = (payload && payload.injuries) || [];
  groups.forEach(function(g){
    var abbr = teamAbbr(g && g.displayName);
    if(!abbr) return;
    ((g && g.injuries) || []).forEach(function(i){
      var a = (i && i.athlete) || {};
      var name = a.displayName || ((a.firstName||"")+" "+(a.lastName||"")).trim();
      if(!name) return;
      var sev = sevRank(i && i.status);
      if(sev < 1) return; /* cleared ("Active") or unranked: not DFS-relevant */
      out.push({
        name: name,
        team: abbr,
        status: String(i.status||""),
        severity: sev,
        comment: String(i.shortComment || i.longComment || "")
      });
    });
  });
  return out;
}

/* Match pool players [{id,name,team,...}] against injury entries.
   Returns {playerId: {status, severity, comment, strength, espnName}}. */
function matchInjuries(pool, entries){
  var flags = {};
  var usable = (entries||[]).filter(function(e){ return e && e.name && e.team; });
  if(!usable.length) return flags;
  /* count last-name+team pairs for the ambiguity guard */
  var poolLast = {}, entLast = {};
  (pool||[]).forEach(function(p){
    var n = normName(p.name), t = normTeam(p.team);
    if(!n || !t) return;
    var k = lastName(n)+"|"+t;
    poolLast[k] = (poolLast[k]||0)+1;
  });
  usable.forEach(function(e){
    var k = lastName(normName(e.name))+"|"+e.team;
    entLast[k] = (entLast[k]||0)+1;
  });
  (pool||[]).forEach(function(p){
    if(p == null || p.id == null) return;
    var n = normName(p.name), t = normTeam(p.team);
    if(!n || !t) return;
    var hit = null;
    var i;
    for(i=0;i<usable.length;i++){ /* tier 1: full normalized name + team */
      if(usable[i].team===t && normName(usable[i].name)===n){ hit = usable[i]; break; }
    }
    var strength = "full";
    if(!hit){ /* tier 2: last name + team, only when unambiguous both sides */
      var k = lastName(n)+"|"+t;
      if(poolLast[k]===1 && entLast[k]===1){
        for(i=0;i<usable.length;i++){
          if(usable[i].team===t && lastName(normName(usable[i].name))===lastName(n)){ hit = usable[i]; break; }
        }
        strength = "probable";
      }
    }
    if(hit){
      flags[p.id] = { status:hit.status, severity:hit.severity,
        comment:hit.comment, strength:strength, espnName:hit.name };
    }
  });
  return flags;
}

function summarize(flags){
  var s = { total:0, out:0, doubtful:0, questionable:0 };
  Object.keys(flags||{}).forEach(function(id){
    s.total++;
    var sev = flags[id].severity;
    if(sev===3) s.out++;
    else if(sev===2) s.doubtful++;
    else if(sev===1) s.questionable++;
  });
  return s;
}

var api = { TEAM_ABBR:TEAM_ABBR, teamAbbr:teamAbbr, sevRank:sevRank,
  normName:normName, lastName:lastName, normTeam:normTeam,
  flattenInjuries:flattenInjuries, matchInjuries:matchInjuries,
  summarize:summarize };

if(typeof module !== "undefined" && module.exports){ module.exports = api; }
else { window.DFSInj = api; }
})();
