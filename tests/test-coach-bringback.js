/* Node tests for the AI coach game-stack bring-back passthrough (js/ai-coach-core.js
   directive contract + js/ai-coach.js browser wiring).
   Run: node tests/test-coach-bringback.js
   Covers: build_lineup.bring_back validation (boolean only, optional), system +
   nano prompt documentation of the flag, salvageIntent detecting bring-back /
   runback phrasing (GPP only, off by default), and the shipped ai-coach.html
   cache-key pins for the two changed coach files. The seating itself is the
   shared OPT.seatBringBack picker (already covered in test-dfs-bringback.js). */
"use strict";
var fs = require("fs"), path = require("path");
var C = require("../js/ai-coach-core.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
function mkPool(){
  var p = [];
  function add(id,name,pos,team){
    p.push({ id:id, name:name, team:team, pos:[pos], salary:7000, proj:20, floor:10, ceil:30, own:5 });
  }
  add(1,"Mahomes","QB","KC"); add(2,"Kelce","TE","KC"); add(3,"Allen","QB","BUF");
  return p;
}
var pool = mkPool();
function base(){ return { action:"build_lineup", mode:"gpp", num_lineups:3 }; }

/* ---- validation ---- */
ok("validate: bring_back true accepted", C.validateAction(
  Object.assign(base(), {bring_back:true}), pool).ok === true);
ok("validate: bring_back false accepted", C.validateAction(
  Object.assign(base(), {bring_back:false}), pool).ok === true);
ok("validate: bring_back omitted accepted (defaults off)", C.validateAction(
  base(), pool).ok === true);
ok("validate: bring_back string rejected", C.validateAction(
  Object.assign(base(), {bring_back:"yes"}), pool).ok === false);
ok("validate: bring_back 1 rejected", C.validateAction(
  Object.assign(base(), {bring_back:1}), pool).ok === false);
ok("validate: error message names the field", /bring_back/.test(
  C.validateAction(Object.assign(base(), {bring_back:"yes"}), pool).error));

/* ---- prompt documentation ---- */
var CFG = { site:"DraftKings", sport:"NFL", cap:50000, slots:["QB","RB","WR"] };
var ctx = C.buildPromptContext(CFG, pool, {mode:"gpp"});
var sys = C.systemPrompt(ctx);
ok("systemPrompt: documents bring_back in actions list",
  sys.indexOf("bring_back") !== -1);
ok("systemPrompt: bring_back scoped to NFL tournaments",
  /bring_back.*NFL/i.test(sys) || /NFL tournaments only[\s\S]*bring_back|bring_back[\s\S]*NFL tournament/.test(sys));
ok("systemPrompt: example block shows bring_back",
  sys.indexOf('"bring_back":true') !== -1);
var nanoCtx = C.buildNanoContext(CFG, pool, {mode:"gpp"});
var nano = C.nanoSystemPrompt(nanoCtx);
ok("nanoSystemPrompt: documents bring_back", nano.indexOf("bring_back") !== -1);
ok("nanoSystemPrompt: example block shows bring_back",
  nano.indexOf('"bring_back":true') !== -1);

/* ---- salvageIntent ---- */
var s1 = C.salvageIntent("ok building", "build me 5 gpp lineups with bring backs", pool);
ok("salvage: 'with bring backs' sets bring_back", !!s1 && s1.bring_back === true);
ok("salvage: bring-back intent stays gpp", !!s1 && s1.mode === "gpp");
var s2 = C.salvageIntent("ok", "build me 5 lineups with a runback", pool);
ok("salvage: 'runback' slang sets bring_back", !!s2 && s2.bring_back === true);
var s3 = C.salvageIntent("ok building", "build me 5 gpp lineups", pool);
ok("salvage: no mention -> bring_back off by default",
  !!s3 && (s3.bring_back === undefined || s3.bring_back === false));
ok("salvage: salvaged bring_back directive validates",
  !!s1 && C.validateAction(s1, pool).ok === true);

/* ---- shipped wiring: ai-coach.html cache keys ---- */
var ROOT = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(ROOT, "ai-coach.html"), "utf8");
var m1 = html.match(/js\/ai-coach-core\.js\?v=([\d.]+)/);
var m2 = html.match(/js\/ai-coach\.js\?v=([\d.]+)/);
ok("ai-coach.html pins ai-coach-core.js?v=1.8.0 (this release)", m1 && m1[1] === "1.8.0");
ok("ai-coach.html pins ai-coach.js?v=1.8.0 (this release)", m2 && m2[1] === "1.8.0");

/* ---- shipped wiring: browser glue mentions ---- */
var coach = fs.readFileSync(path.join(ROOT, "js", "ai-coach.js"), "utf8");
ok("ai-coach.js: coachGenerate seats OPT.seatBringBack",
  coach.indexOf("OPT.seatBringBack") !== -1);
ok("ai-coach.js: bringBack only for NFL GPP",
  /mode==="gpp" && c\.sport==="NFL" && !!opts\.bringBack/.test(coach));
ok("ai-coach.js: honest error on missing opponent info",
  coach.indexOf("Bring-back stacks need opponent info") !== -1);
ok("ai-coach.js: desc note shows bring-backs",
  coach.indexOf("· bring-backs") !== -1);
ok("ai-coach.js: zero-lineup honest error surfaced",
  coach.indexOf("No QB stack could seat a bring-back") !== -1 &&
  coach.indexOf("res.error") !== -1);

if(fails){ console.error(fails + " FAILURE(S)"); process.exit(1); }
console.log("coach-bringback: all green");
