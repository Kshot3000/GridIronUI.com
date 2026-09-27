/* Node tests for js/ai-coach-core.js — run: node tests/test-ai-coach.js */
var C = require("../js/ai-coach-core.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra||""); }
  else console.log("ok  ", name);
}
function mkPool(n){
  var p = [];
  for(var i=0;i<n;i++){
    p.push({ id:i+1, name:"Player"+(i+1), team:"T"+(i%4), pos:["QB"], salary:7000-(i*50),
             proj:20-i*0.2, floor:10, ceil:30, own:5 });
  }
  return p;
}
var CFG = { site:"DraftKings", sport:"NFL", cap:50000, slots:["QB","RB","RB","WR","WR","WR","TE","FLEX","DST"] };

/* ---- directive extraction ---- */
var d1 = C.extractDirectives('Sure thing!\n```gridiron\n{"action":"build_lineup","mode":"gpp","num_lineups":3}\n```\nDone.');
ok("extract: valid block", d1.length===1 && d1[0].action==="build_lineup" && d1[0].num_lineups===3);

var d2 = C.extractDirectives("```gridiron\n{not valid json,,,\n```");
ok("extract: malformed JSON skipped", d2.length===0);

var d3 = C.extractDirectives("Just a normal chat message, no blocks here.");
ok("extract: no block → empty", d3.length===0);

var d4 = C.extractDirectives("```gridiron\n{\"action\":\"compare\",\"players\":[\"A\",\"B\"]}\n```\ntext\n```gridiron\n{\"action\":\"explain_pick\",\"player\":\"C\"}\n```");
ok("extract: multiple blocks", d4.length===2 && d4[1].action==="explain_pick");

var d5 = C.extractDirectives("```json\n{\"action\":\"build_lineup\"}\n```");
ok("extract: wrong fence language ignored", d5.length===0);

var d6 = C.extractDirectives('```gridiron\n["not","an","object"]\n```');
ok("extract: non-object JSON ignored", d6.length===0);

/* ---- prompt context ---- */
var big = mkPool(55);
var ctx = C.buildPromptContext(CFG, big, {mode:"gpp"});
ok("context: truncates at 40", ctx.shown===40 && ctx.total===55 && ctx.truncated===true);
ok("context: includes cap/slots/mode/site",
  ctx.text.indexOf("$50,000")!==-1 && ctx.text.indexOf("QB")!==-1 &&
  ctx.text.indexOf("GPP")!==-1 && ctx.text.indexOf("DraftKings")!==-1);
ok("context: sorted by projection desc", ctx.text.indexOf("Player1") < ctx.text.indexOf("Player40"));
ok("context: mentions truncation", ctx.text.indexOf("truncated to top 40")!==-1);

var small = mkPool(10);
var ctx2 = C.buildPromptContext(CFG, small, {mode:"cash"});
ok("context: small pool not truncated", ctx2.shown===10 && ctx2.truncated===false);
ok("context: cash mode labeled", ctx2.text.indexOf("cash")!==-1);

/* never includes secrets: plant a fake secret in env and confirm absence */
process.env.GIU_FAKE_SECRET = "sk-test-fake-secret-12345";
var ctx3 = C.buildPromptContext(CFG, big, {});
ok("context: never includes secrets",
  ctx3.text.indexOf("sk-test-fake-secret-12345")===-1 && ctx3.text.indexOf("sk-")===-1);
delete process.env.GIU_FAKE_SECRET;

/* ---- action validation ---- */
var pool = mkPool(5);
pool[0].name="Josh Allen"; pool[1].name="Jalen Hurts"; pool[2].name="Saquon Barkley";

ok("validate: unknown action rejected", C.validateAction({action:"fly_to_moon"}, pool).ok===false);
ok("validate: missing action rejected", C.validateAction({}, pool).ok===false);

var v1 = C.validateAction({action:"build_lineup", mode:"gpp", num_lineups:3, locks:[], excludes:[], stacks:[]}, pool);
ok("validate: good build_lineup", v1.ok===true);

ok("validate: num_lineups 0 rejected", C.validateAction({action:"build_lineup", num_lineups:0}, pool).ok===false);
ok("validate: num_lineups 21 rejected", C.validateAction({action:"build_lineup", num_lineups:21}, pool).ok===false);
ok("validate: num_lineups 20 ok", C.validateAction({action:"build_lineup", num_lineups:20}, pool).ok===true);
ok("validate: bad mode rejected", C.validateAction({action:"build_lineup", mode:"turbo"}, pool).ok===false);
ok("validate: exposure 150 rejected", C.validateAction({action:"build_lineup", max_exposure:150}, pool).ok===false);
ok("validate: exposure -5 rejected", C.validateAction({action:"build_lineup", max_exposure:-5}, pool).ok===false);
ok("validate: exposure 0 ok", C.validateAction({action:"build_lineup", max_exposure:0}, pool).ok===true);
ok("validate: exposure 100 ok", C.validateAction({action:"build_lineup", max_exposure:100}, pool).ok===true);
ok("validate: unknown lock rejected",
  C.validateAction({action:"build_lineup", locks:[{name:"Nobody McFake"}]}, pool).ok===false);
ok("validate: unknown exclude rejected",
  C.validateAction({action:"build_lineup", excludes:["Ghost Player"]}, pool).ok===false);
ok("validate: stack with no QB rejected",
  C.validateAction({action:"build_lineup", stacks:[{team:"ZZZ"}]}, pool).ok===false);

var v2 = C.validateAction({action:"set_exposure", player:"Josh Allen", pct:25}, pool);
ok("validate: good set_exposure", v2.ok===true && v2.player.name==="Josh Allen");
ok("validate: set_exposure 0 ok", C.validateAction({action:"set_exposure", player:"Josh Allen", pct:0}, pool).ok===true);
ok("validate: set_exposure 101 rejected", C.validateAction({action:"set_exposure", player:"Josh Allen", pct:101}, pool).ok===false);
ok("validate: set_exposure unknown player rejected",
  C.validateAction({action:"set_exposure", player:"Fake Guy", pct:25}, pool).ok===false);
ok("validate: set_exposure case-insensitive", C.validateAction({action:"set_exposure", player:"josh allen", pct:25}, pool).ok===true);

ok("validate: compare needs 2+", C.validateAction({action:"compare", players:["Josh Allen"]}, pool).ok===false);
ok("validate: good compare",
  C.validateAction({action:"compare", players:["Josh Allen","Jalen Hurts"]}, pool).ok===true);
ok("validate: compare unknown rejected",
  C.validateAction({action:"compare", players:["Josh Allen","Nope"]}, pool).ok===false);

var v3 = C.validateAction({action:"explain_pick", player:"Saquon Barkley"}, pool);
ok("validate: good explain_pick", v3.ok===true && v3.player.name==="Saquon Barkley");
ok("validate: explain_pick unknown rejected",
  C.validateAction({action:"explain_pick", player:"Nobody"}, pool).ok===false);

/* ---- Nano (on-device) context: small model, tight prompt ---- */
ok("nano: NANO_MAX_POOL is 25", C.NANO_MAX_POOL===25);
var nanoPool = mkPool(40);
var nctx = C.buildNanoContext(CFG, nanoPool, {mode:"gpp"});
ok("nano: truncates to 25", nctx.shown===25 && nctx.total===40 && nctx.truncated===true);
ok("nano: sorted by projection", nctx.text.indexOf("Player1|")!==-1 && nctx.text.indexOf("Player40|")===-1);
ok("nano: terse pipe format", /Player1\|T0\|QB\|\$7000\|20\.0\/10\.0\/30\.0\|5\.0%/.test(nctx.text));
ok("nano: gpp mode in header", nctx.text.indexOf("GPP")!==-1);
var nsp = C.nanoSystemPrompt(nctx);
ok("nanoSystemPrompt: short, names Grid, has directive example",
  nsp.length < 2500 && nsp.indexOf("Grid")!==-1 && nsp.indexOf("```gridiron")!==-1);
ok("nanoSystemPrompt: never-invent rule", nsp.toLowerCase().indexOf("never invent")!==-1);
ok("nanoSystemPrompt: not-a-prediction rule", nsp.toLowerCase().indexOf("not predictions")!==-1);

/* ---- lenient directive parsing (for small on-device models) ---- */
var lz = C.extractDirectivesLenient('ok\n```gridiron\n{"action":"build_lineup","mode":"gpp","num_lineups":2,}\n```');
ok("lenient: trailing comma repaired", lz.length===1 && lz[0].action==="build_lineup");
var lz2 = C.extractDirectivesLenient('ok\n```gridiron\n{"action":"compare","players":["A","B"]}\n```');
ok("lenient: valid block still parses", lz2.length===1 && lz2[0].action==="compare");
ok("lenient: garbage block skipped",
  C.extractDirectivesLenient('```gridiron\nnot json at all\n```').length===0);
ok("malformed: garbled block detected",
  C.findMalformedDirectives('```gridiron\nnot json at all\n```').length===1);
ok("malformed: valid block not flagged",
  C.findMalformedDirectives('```gridiron\n{"action":"build_lineup"}\n```').length===0);
ok("malformed: repairable block not flagged",
  C.findMalformedDirectives('```gridiron\n{"action":"build_lineup",}\n```').length===0);

/* ---- SSE extraction ---- */
ok("extractStreamContent: content delta",
  C.extractStreamContent('{"choices":[{"delta":{"content":"hello"}}]}')==="hello");
ok("extractStreamContent: reasoning delta ignored",
  C.extractStreamContent('{"choices":[{"delta":{"reasoning":"thinking"}}]}')==="");
ok("extractStreamContent: [DONE] → empty", C.extractStreamContent("[DONE]")==="");
ok("extractStreamContent: garbage → empty", C.extractStreamContent("not json")==="");
ok("extractStreamContent: missing delta → empty",
  C.extractStreamContent('{"choices":[{"finish_reason":"stop"}]}')==="");

/* ---- system prompt sanity ---- */
var sp = C.systemPrompt(ctx);
ok("systemPrompt: names Grid and rules",
  sp.indexOf("Grid")!==-1 && sp.indexOf("NEVER invent")!==-1 && sp.indexOf("```gridiron")!==-1);
ok("systemPrompt: no-guarantee rule", sp.toLowerCase().indexOf("never guarantee")!==-1);

console.log(fails ? ("\n"+fails+" FAILURES") : "\nALL PASS");
process.exit(fails ? 1 : 0);
