/* Node tests for js/dfs-injuries.js — run: node tests/test-dfs-injuries.js */
var I = require("../js/dfs-injuries.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra||""); }
  else console.log("ok  ", name);
}
function entry(name, team, status){
  return { name:name, team:team, status:status, severity:I.sevRank(status),
           comment:"", strength:"full", espnName:name };
}

/* ---- team map ---- */
ok("NFL team resolves", I.teamAbbr("Kansas City Chiefs")==="KC");
ok("NFL team resolves (Raiders)", I.teamAbbr("Las Vegas Raiders")==="LV");
ok("NBA team resolves", I.teamAbbr("Los Angeles Lakers")==="LAL");
ok("NBA Clippers distinct from Lakers", I.teamAbbr("LA Clippers")==="LAC");
ok("unknown team null", I.teamAbbr("Springfield Atoms")===null);
ok("all 32 NFL + 30 NBA mapped",
  Object.keys(I.TEAM_ABBR).length===62, Object.keys(I.TEAM_ABBR).length+" keys");

/* ---- severity ---- */
ok("Out is 3", I.sevRank("Out")===3);
ok("Injured Reserve is 3", I.sevRank("Injured Reserve")===3);
ok("Doubtful is 2", I.sevRank("Doubtful")===2);
ok("Questionable is 1", I.sevRank("Questionable")===1);
ok("Day-To-Day is 1", I.sevRank("Day-To-Day")===1);
ok("Active (cleared) is 0", I.sevRank("Active")===0);
ok("Suspension is 0", I.sevRank("Suspension")===0);

/* ---- name normalization ---- */
ok("suffix stripped", I.normName("Cameron Ward Jr.")==="cameron ward");
ok("periods stripped", I.normName("J. Allen")==="j allen");
ok("apostrophe stripped", I.normName("Odell Beckham Jr.")==="odell beckham");
ok("team normalized", I.normTeam(" buf ")==="BUF");

/* ---- flatten ---- */
var payload = {
  injuries: [
    { displayName:"Kansas City Chiefs", injuries:[
      { status:"Out", shortComment:"knee", longComment:"",
        athlete:{ displayName:"Isiah Pacheco", firstName:"Isiah", lastName:"Pacheco" } },
      { status:"Active", shortComment:"cleared", longComment:"",
        athlete:{ displayName:"Patrick Mahomes", firstName:"Patrick", lastName:"Mahomes" } },
      { status:"Questionable", shortComment:"", longComment:"ankle",
        athlete:{ firstName:"Travis", lastName:"Kelce" } }
    ]},
    { displayName:"Buffalo Bills", injuries:[
      { status:"Doubtful", shortComment:"hammy", longComment:"",
        athlete:{ displayName:"James Cook", firstName:"James", lastName:"Cook" } },
      { status:"Out", shortComment:"", longComment:"",
        athlete:{ displayName:"" } }  /* nameless entry dropped */
    ]},
    { displayName:"Springfield Atoms", injuries:[  /* unmapped team dropped */
      { status:"Out", shortComment:"", longComment:"",
        athlete:{ displayName:"Fake Player", firstName:"Fake", lastName:"Player" } }
    ]}
  ]
};
var flat = I.flattenInjuries(payload);
ok("flatten drops Active + nameless + unmapped team", flat.length===3, flat.length+" kept");
ok("flatten maps team", flat.every(function(e){ return e.team==="KC"||e.team==="BUF"; }));
ok("flatten falls back to first+last name", flat.some(function(e){ return e.name==="Travis Kelce"; }));
ok("flatten keeps status+comment", flat[0].status==="Out" && flat[0].comment==="knee");
ok("flatten tolerates junk", I.flattenInjuries(null).length===0 && I.flattenInjuries({}).length===0);

/* ---- matching ---- */
function P(id,name,team){ return { id:id, name:name, pos:["QB"], team:team, opp:"X",
  salary:7000, proj:20, floor:10, ceil:35, own:10 }; }
var pool = [
  P(1,"Isiah Pacheco","KC"),     /* exact full-name + team */
  P(2,"Patrick Mahomes","KC"),   /* cleared on the feed: no flag */
  P(3,"T. Kelce","KC"),          /* last-name+initial+team, unique -> probable */
  P(4,"James Cook","BUF"),       /* doubtful */
  P(5,"James Cook","MIA"),       /* same name, wrong team -> no flag */
  P(6,"Demo QB1","KC"),          /* synthetic demo name never matches */
  P(7,"","KC"),                  /* nameless pool row skipped */
  P(8,"Isiah Pacheco","BUF")     /* same name, wrong team -> no flag */
];
var flags = I.matchInjuries(pool, flat);
ok("exact full-name match flags", !!flags[1] && flags[1].strength==="full");
ok("flagged severity correct", flags[1].severity===3);
ok("cleared player not flagged", !flags[2]);
ok("probable last-name match flags", !!flags[3] && flags[3].strength==="probable");
ok("doubtful flags severity 2", !!flags[4] && flags[4].severity===2);
ok("wrong-team same name not flagged", !flags[5] && !flags[8]);
ok("demo names never match", !flags[6]);
ok("nameless pool row skipped", !flags[7]);

/* ambiguity guard: two Smiths on KC, one Smith on the feed -> neither flagged */
var pool2 = [ P(11,"Amon-Ra St. Brown","DET"), P(12,"Equanimeous St. Brown","DET") ];
var flat2 = [ entry("Equanimeous St. Brown","DET","Questionable") ];
var flags2 = I.matchInjuries(pool2, flat2);
ok("ambiguous pool side: exact still flags", !!flags2[12] && flags2[12].strength==="full");
ok("ambiguous pool side: other not flagged", !flags2[11]);
var pool3 = [ P(13,"DeVonta Smith","PHI") ];
var flat3 = [ entry("DeVonta Smith","PHI","Questionable"), entry("D. Smith","PHI","Out") ];
var flags3 = I.matchInjuries(pool3, flat3);
ok("ambiguous feed side: exact match wins, probable suppressed",
  !!flags3[13] && flags3[13].strength==="full");

/* empty inputs */
ok("empty entries -> no flags", Object.keys(I.matchInjuries(pool, [])).length===0);
ok("empty pool -> no flags", Object.keys(I.matchInjuries([], flat)).length===0);

/* ---- summarize ---- */
var s = I.summarize(flags);
ok("summarize counts", s.total===3 && s.out===1 && s.doubtful===1 && s.questionable===1,
  JSON.stringify(s));

console.log(fails ? "\n"+fails+" FAILURES" : "\nALL DFS-INJURY TESTS PASSED");
process.exit(fails ? 1 : 0);
