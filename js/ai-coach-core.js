/* GridIronUI AI Coach — pure logic (no DOM, no fetch).
   Directive extraction, prompt-context building, action validation, SSE helpers.
   Browser: window.AICoachCore · node: module.exports */
(function(){
"use strict";

var ACTIONS = ["build_lineup", "set_exposure", "compare", "explain_pick"];
var MAX_POOL_IN_PROMPT = 40;

/* ---------- directive block extraction ----------
   Finds fenced ```gridiron ...``` blocks. Malformed JSON is skipped silently. */
function extractDirectives(text){
  var out = [];
  if(!text) return out;
  var re = /```gridiron\s*\n([\s\S]*?)```/g, m;
  while((m = re.exec(text)) !== null){
    var raw = m[1].trim();
    if(!raw) continue;
    try{
      var d = JSON.parse(raw);
      if(d && typeof d === "object" && typeof d.action === "string") out.push(d);
    }catch(e){ /* malformed block: ignore, never crash the chat */ }
  }
  return out;
}

/* ---------- prompt context builder ----------
   Compact system-prompt context. Top MAX_POOL_IN_PROMPT players by projection.
   Never embeds secrets — the builder takes no credentials at all. */
function buildPromptContext(cfg, pool, opts){
  opts = opts||{};
  var mode = opts.mode || "gpp";
  var sorted = (pool||[]).slice().sort(function(a,b){ return (b.proj||0)-(a.proj||0); });
  var truncated = sorted.length > MAX_POOL_IN_PROMPT;
  var top = sorted.slice(0, MAX_POOL_IN_PROMPT);
  var lines = top.map(function(p){
    return [p.name, p.team, (p.pos||[]).join("/"), "$"+p.salary,
            "proj "+num(p.proj), "floor "+num(p.floor),
            "ceil "+num(p.ceil), "own "+num(p.own)+"%"].join(" | ");
  });
  return {
    text:
      "SITE: "+cfg.site+" ("+(cfg.site==="DraftKings"?"DK":"FD")+")\n"+
      "SPORT: "+cfg.sport+"\n"+
      "CONTEST MODE: "+(mode==="cash"?"50/50 cash (high floor, low variance)":"tournament GPP (ceiling, stacks, ownership leverage)")+"\n"+
      "SALARY CAP: $"+cfg.cap.toLocaleString()+"\n"+
      "ROSTER SLOTS: "+cfg.slots.join(", ")+"\n"+
      "PLAYER POOL ("+top.length+" of "+sorted.length+" shown, sorted by projection):\n"+
      lines.join("\n")+
      (truncated ? "\n[pool truncated to top "+MAX_POOL_IN_PROMPT+" by projection — ask the user to narrow the slate if they need deeper players]" : ""),
    shown: top.length,
    total: sorted.length,
    truncated: truncated
  };
}
function num(v){ return (v==null||!isFinite(v)) ? "?" : (+v).toFixed(1); }

/* ---------- action validation ---------- */
function findPlayer(pool, name){
  if(!name) return null;
  var n = String(name).trim().toLowerCase();
  return (pool||[]).filter(function(p){ return String(p.name).trim().toLowerCase()===n; })[0] || null;
}
function validateAction(d, pool){
  if(!d || ACTIONS.indexOf(d.action)===-1)
    return { ok:false, error:"Unknown action '"+(d&&d.action)+"'. Supported: "+ACTIONS.join(", ")+"." };
  if(d.action==="build_lineup"){
    var mode = d.mode||"gpp";
    if(mode!=="cash"&&mode!=="gpp") return { ok:false, error:"build_lineup.mode must be 'cash' or 'gpp'." };
    var n = d.num_lineups==null?1:Number(d.num_lineups);
    if(!isFinite(n)||Math.floor(n)!==n||n<1||n>20)
      return { ok:false, error:"build_lineup.num_lineups must be an integer 1–20." };
    var me = d.max_exposure==null?null:Number(d.max_exposure);
    if(me!==null && (!isFinite(me)||me<0||me>100))
      return { ok:false, error:"build_lineup.max_exposure must be 0–100." };
    var bad = [];
    (d.locks||[]).forEach(function(l){ if(!findPlayer(pool, l&&l.name)) bad.push("lock '"+(l&&l.name)+"'"); });
    (d.excludes||[]).forEach(function(x){ if(!findPlayer(pool, x)) bad.push("exclude '"+x+"'"); });
    (d.stacks||[]).forEach(function(s){
      var t = String((s&&s.team)||"").trim().toUpperCase();
      if(!t) bad.push("stack with empty team");
      else if(!(pool||[]).some(function(p){ return p.team===t && p.pos.indexOf("QB")!==-1; }))
        bad.push("stack team '"+t+"' (no QB of that team in pool)");
    });
    if(bad.length) return { ok:false, error:"build_lineup references unknown pool entries: "+bad.join(", ")+"." };
    return { ok:true };
  }
  if(d.action==="set_exposure"){
    var p = findPlayer(pool, d.player);
    if(!p) return { ok:false, error:"set_exposure: player '"+d.player+"' is not in the current pool." };
    var pct = Number(d.pct);
    if(!isFinite(pct)||pct<0||pct>100)
      return { ok:false, error:"set_exposure.pct must be 0–100." };
    return { ok:true, player:p };
  }
  if(d.action==="compare"){
    var names = d.players||[];
    if(!Array.isArray(names)||names.length<2)
      return { ok:false, error:"compare needs at least 2 player names." };
    var missing = names.filter(function(x){ return !findPlayer(pool, x); });
    if(missing.length) return { ok:false, error:"compare: not in pool: "+missing.join(", ")+"." };
    return { ok:true };
  }
  if(d.action==="explain_pick"){
    var q = findPlayer(pool, d.player);
    if(!q) return { ok:false, error:"explain_pick: player '"+d.player+"' is not in the current pool." };
    return { ok:true, player:q };
  }
  return { ok:false, error:"Unhandled action." };
}

/* ---------- model mapping ---------- */
var MODEL_IDS = { openai:"openai", mistral:"mistral", llama:"llama", deepseek:"deepseek" };
function modelId(name){ return MODEL_IDS[name] || "openai"; }

/* ---------- SSE stream helper ----------
   Extracts assistant text from one OpenAI-style SSE data line.
   Reasoning/thinking deltas (gpt-oss) are ignored. */
function extractStreamContent(dataLine){
  if(!dataLine || dataLine==="[DONE]") return "";
  var chunk;
  try{ chunk = JSON.parse(dataLine); }catch(e){ return ""; }
  try{
    var delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    if(!delta) return "";
    return typeof delta.content === "string" ? delta.content : "";
  }catch(e){ return ""; }
}

/* ---------- system prompt ---------- */
function systemPrompt(ctx){
  return (
"You are Grid, GridIronUI's DFS lineup coach — a sharp, friendly assistant who helps users build DraftKings and FanDuel daily-fantasy lineups by talking with them.\n\n"+
"CONTEXT (live, from the user's DFS Lab):\n"+ctx.text+"\n\n"+
"RULES:\n"+
"1. Only reference players from the pool above. NEVER invent player names, teams, or salaries. If the user asks about someone not in the pool, say so plainly and suggest they add the player in the DFS Lab.\n"+
"2. Lineups are built by a rules-based optimizer from the user's own editable projections — they are NOT predictions and NEVER guarantee wins. Never promise or imply guaranteed profit. Say this when you build lineups.\n"+
"3. If the pool is empty, do NOT invent players. Tell the user to load the DEMO slate or upload a CSV in the DFS Lab (dfs.html), then come back.\n"+
"4. Keep answers conversational and concise. Use the data (value = projection/salary, ownership, ceiling) to justify picks.\n"+
"5. When the user wants lineups built, comparisons, or a pick explained, end your reply with one or more fenced directive blocks like:\n"+
"```gridiron\n{\"action\":\"build_lineup\",\"mode\":\"gpp\",\"num_lineups\":3,\"locks\":[],\"excludes\":[],\"stacks\":[{\"team\":\"KC\"}],\"max_exposure\":60}\n```\n"+
"Actions: build_lineup {mode: cash|gpp, num_lineups 1-20, locks [{name, slot?}], excludes [names], stacks [{team}], max_exposure 0-100}; set_exposure {player, pct 0-100}; compare {players: [2+ names]}; explain_pick {player}. "+
"Put prose OUTSIDE the blocks — the app parses and executes them. Only use exact player names from the pool.\n"+
"6. You may suggest strategy (stacks, leverage, chalk) but label optimizer outputs as optimizer outputs.");
}

var api = {
  ACTIONS: ACTIONS, MAX_POOL_IN_PROMPT: MAX_POOL_IN_PROMPT,
  extractDirectives: extractDirectives,
  buildPromptContext: buildPromptContext,
  validateAction: validateAction,
  findPlayer: findPlayer,
  modelId: modelId,
  extractStreamContent: extractStreamContent,
  systemPrompt: systemPrompt
};

if(typeof module !== "undefined" && module.exports){ module.exports = api; }
else { window.AICoachCore = api; }
})();
