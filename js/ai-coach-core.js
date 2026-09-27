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

/* ---------- Nano (on-device) context ----------
   Gemini Nano is a small model: keep the pool tight (top 25) and fields terse. */
var NANO_MAX_POOL = 25;
function nanoNum(v){ return (v==null||!isFinite(v)) ? "?" : (+v).toFixed(1); }
function buildNanoContext(cfg, pool, opts){
  opts = opts||{};
  var mode = opts.mode || "gpp";
  var sorted = (pool||[]).slice().sort(function(a,b){ return (b.proj||0)-(a.proj||0); });
  var truncated = sorted.length > NANO_MAX_POOL;
  var top = sorted.slice(0, NANO_MAX_POOL);
  var lines = top.map(function(p){
    return [p.name, p.team, (p.pos||[]).join("/"), "$"+p.salary,
            nanoNum(p.proj)+"/"+nanoNum(p.floor)+"/"+nanoNum(p.ceil),
            nanoNum(p.own)+"%"].join("|");
  });
  return {
    text:
      (cfg.site==="DraftKings"?"DK":"FD")+" "+cfg.sport+" "+
      (mode==="cash"?"cash":"GPP")+" cap $"+cfg.cap.toLocaleString()+
      " slots "+cfg.slots.join(",")+"\n"+
      "POOL top "+top.length+" of "+sorted.length+" by proj (name|team|pos|$sal|proj/floor/ceil|own%):\n"+
      lines.join("\n")+
      (truncated ? "\n[truncated]" : ""),
    shown: top.length, total: sorted.length, truncated: truncated
  };
}
function nanoSystemPrompt(ctx){
  return (
"You are Grid, a DraftKings/FanDuel DFS lineup coach. Be short and conversational.\n"+
"POOL:\n"+ctx.text+"\n"+
"RULES: Only name players from the POOL. Never invent names, teams or salaries. "+
"Lineups come from a rules-based optimizer using the user's own projections; they are NOT predictions and NEVER guarantee wins. "+
"If the pool is empty, the app auto-loads the DEMO slate (synthetic players) — just note results are from demo data. "+
"To act, end your reply with a fenced block:\n"+
"```gridiron\n{\"action\":\"build_lineup\",\"mode\":\"gpp\",\"num_lineups\":3,\"locks\":[],\"excludes\":[],\"stacks\":[{\"team\":\"KC\"}],\"max_exposure\":60}\n```\n"+
"Actions: build_lineup, set_exposure {player,pct}, compare {players:[2+]}, explain_pick {player}. "+
"Use exact pool names. Prose outside blocks.");
}

/* ---------- lenient directive parsing (for small on-device models) ----------
   Nano is weaker at strict JSON. Try strict first, then safe repairs
   (trailing commas). findMalformedDirectives reports fences that still fail,
   so the chat can ask a clarifying question instead of failing silently. */
function tryJson(s){
  try{ return JSON.parse(s); }catch(e){ return null; }
}
function asDirective(d){
  if(d && typeof d === "object" && typeof d.action === "string" &&
     ACTIONS.indexOf(d.action) !== -1) return d;
  return null;
}
/* Strip // and block comments that models sometimes leave inside the fence.
   String-aware so http:// and apostrophes inside quotes survive. */
function stripJsonComments(s){
  var out="", i=0, n=s.length, inStr=false, q="";
  while(i<n){
    var c=s[i];
    if(inStr){
      out+=c;
      if(c==="\\" && i+1<n){ out+=s[i+1]; i+=2; continue; }
      if(c===q) inStr=false;
      i++; continue;
    }
    if(c==='"'||c==="'"){ inStr=true; q=c; out+=c; i++; continue; }
    if(c==="/" && i+1<n && s[i+1]==="/"){ while(i<n && s[i]!=="\n") i++; continue; }
    if(c==="/" && i+1<n && s[i+1]==="*"){ i+=2; while(i+1<n && !(s[i]==="*" && s[i+1]==="/")) i++; i+=2; continue; }
    out+=c; i++;
  }
  return out;
}
/* Quote unquoted object keys: {action:"build_lineup"} -> {"action":"build_lineup"} */
function quoteKeys(s){
  return s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}
/* Convert single-quoted strings to double-quoted */
function singleToDouble(s){
  return s.replace(/'([^'\\\n]*(?:\\.[^'\\\n]*)*)'/g, function(m, inner){
    return '"'+inner.replace(/\\'/g,"'")+'"';
  });
}
function parseDirectiveJson(raw){
  var s = String(raw==null?"":raw).trim();
  if(!s) return null;
  var d = asDirective(tryJson(s));
  if(d) return d;
  /* largest {...} span — handles prose accidentally left inside the fence */
  var a=s.indexOf("{"), b=s.lastIndexOf("}");
  var core = (a!==-1 && b>a) ? s.slice(a, b+1) : s;
  var noComment = stripJsonComments(core);
  var candidates = [
    core.replace(/,\s*([}\]])/g, "$1"),
    quoteKeys(noComment).replace(/,\s*([}\]])/g, "$1"),
    singleToDouble(quoteKeys(noComment)).replace(/,\s*([}\]])/g, "$1")
  ];
  for(var i=0;i<candidates.length;i++){
    d = asDirective(tryJson(candidates[i]));
    if(d) return d;
  }
  return null;
}
/* Fences: ```gridiron (closed or unclosed — small models run out of tokens),
   plus ```json / bare ``` fences that contain a recognizable action. */
var FENCE_RES = [
  /```gridiron[ \t]*\r?\n([\s\S]*?)(?:```|$)/g,
  /```(?:json)?[ \t]*\r?\n([\s\S]*?)(?:```|$)/g
];
function extractDirectivesLenient(text){
  var out = [], seen = {}, t = String(text==null?"":text), ri, m, raw, d, key;
  for(ri=0; ri<FENCE_RES.length; ri++){
    var re = new RegExp(FENCE_RES[ri].source, "g");
    while((m = re.exec(t)) !== null){
      if(m[0].length===0) break;
      raw = m[1].trim();
      if(!raw) continue;
      d = (ri===0) ? parseDirectiveJson(raw) : (asDirective(tryJson(raw)) || parseDirectiveJson(raw));
      if(d){
        key = d.action+JSON.stringify(d);
        if(!seen[key]){ seen[key]=1; out.push(d); }
      }
    }
  }
  return out;
}
function findMalformedDirectives(text){
  var bad = [], t = String(text==null?"":text), m, raw;
  var re = /```gridiron[ \t]*\r?\n([\s\S]*?)(?:```|$)/g;
  while((m = re.exec(t)) !== null){
    if(m[0].length===0) break;
    raw = m[1].trim();
    if(!raw) continue;
    if(!parseDirectiveJson(raw)) bad.push(raw.slice(0,120));
  }
  return bad;
}
/* Last-resort intent recovery: the model clearly meant to act but the fence
   was unsalvageable. Rebuild the directive from the user + reply text so the
   optimizer still runs instead of asking the user to rephrase. Conservative:
   only fires on explicit build/compare intent, and validateAction is the
   final gate (names are matched against the real pool). */
function salvageIntent(replyText, userText, pool){
  pool = pool||[];
  var t = String(userText==null?"":userText)+"\n"+String(replyText==null?"":replyText);
  var low = t.toLowerCase();
  if(/\b(build|generat|creat|make|give me|run)\b/.test(low) &&
     /\b(lineups?|rosters?|teams?|entries?)\b/.test(low)){
    var mode = /\b(cash|double[\s-]?up|fifty\/fifty|50\/50)\b/.test(low) ? "cash" : "gpp";
    var m = low.match(/(\d{1,2})\s*(lineups?|rosters?|teams?|entries?)/) ||
            low.match(/\b(\d{1,2})\s*(cash|gpp)\b/);
    var n = m ? Math.min(20, Math.max(1, parseInt(m[1],10))) : 1;
    var d = { action:"build_lineup", mode:mode, num_lineups:n,
              locks:[], excludes:[], stacks:[] };
    var sm = t.match(/\b([A-Za-z]{2,3})\s+stack\b/i);
    if(sm) d.stacks = [{ team: sm[1].toUpperCase() }];
    if(validateAction(d, pool).ok) return d;
    d.stacks = [];
    if(validateAction(d, pool).ok) return d;
    return null;
  }
  if(/\bcompar/.test(low) && pool.length){
    var names = [];
    pool.forEach(function(p){
      if(low.indexOf(String(p.name).toLowerCase())!==-1 && names.indexOf(p.name)===-1)
        names.push(p.name);
    });
    if(names.length>=2){
      var d2 = { action:"compare", players:names.slice(0,4) };
      if(validateAction(d2, pool).ok) return d2;
    }
  }
  return null;
}

/* ---------- credits / rate-limit detection ----------
   Pollinations' free tier sometimes answers with a "not enough credits / top
   up" message instead of a real reply. Detect it so the provider chain can
   fail over instead of showing it as an answer. */
function isCreditsError(t){
  return /enough credits|top[\s-]?up|complete a quest|insufficient|quota exceeded|rate[\s-_]?limit|429|payment required|402/i
    .test(String(t||""));
}

/* ---------- safe markdown-lite renderer (pure, DOM-free) ----------
   Escape HTML first, then render `code`, **bold**, [text](url) and bare
   URLs. Only http(s) links are emitted — javascript:/data: etc. never linkify. */
function escHtml(s){
  return String(s==null?"":s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function renderRich(text){
  var s = escHtml(text);
  var codes = [];
  s = s.replace(/`([^`\n]+)`/g, function(m,c){ codes.push(c); return "\uE000"+(codes.length-1)+"\uE000"; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function(m,t,u){
    return '<a href="'+u+'" target="_blank" rel="noopener">'+t+'</a>';
  });
  s = s.replace(/(^|[\s(>])((https?:\/\/)[^\s<)]+)/g, function(m,pre,url){
    return pre+'<a href="'+url+'" target="_blank" rel="noopener">'+url+'</a>';
  });
  s = s.replace(/\uE000(\d+)\uE000/g, function(m,i){ return "<code>"+codes[+i]+"</code>"; });
  return s;
}

/* ---------- Gemini (user-supplied free key) ----------
   The key is ONLY ever sent to Google's endpoint (as a query param, per
   Google's API). geminiUrl is pure so tests can pin the host. */
var GEMINI_HOST = "https://generativelanguage.googleapis.com";
function geminiUrl(key){
  return GEMINI_HOST + "/v1beta/models/gemini-2.0-flash:generateContent?key=" + encodeURIComponent(key);
}
function errMessage(err){
  if(!err) return "unknown error";
  if(typeof err === "string") return err;
  return String(err.message || err.code || err);
}
/* fetchFn is injected so node tests can mock it. Never sends the key anywhere
   except geminiUrl(key). */
function geminiGenerateText(messages, key, fetchFn){
  var sys = "", contents = [];
  (messages||[]).forEach(function(m){
    if(m.role==="system"){ sys += (sys?"\n":"")+m.content; }
    else contents.push({ role: m.role==="assistant" ? "model" : "user",
                         parts: [{ text: String(m.content) }] });
  });
  var body = { contents: contents,
               generationConfig: { temperature: 0.7, maxOutputTokens: 1500 } };
  if(sys) body.system_instruction = { parts: [{ text: sys }] };
  return fetchFn(geminiUrl(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(res){
    return res.text().then(function(t){
      var data;
      try{ data = JSON.parse(t); }
      catch(e){ throw { code:"bad_response", message:"Gemini returned a non-JSON response." }; }
      if(!res.ok){
        var msg = (data.error && data.error.message) || ("HTTP "+res.status);
        throw { code: res.status===400 ? "bad_key" : "gemini_error",
                message: "Gemini: "+String(msg).slice(0,200) };
      }
      var parts = data.candidates && data.candidates[0] &&
                  data.candidates[0].content && data.candidates[0].content.parts;
      var text = (parts||[]).map(function(p){ return p.text||""; }).join("");
      if(!text) throw { code:"empty", message:"Gemini returned no text." };
      return text;
    });
  });
}

/* ---------- provider chain (pure orchestration, providers injected) ----------
   Tries providers in order; records every attempt; resolves with
   {provider, text, attempts} or rejects with Error("all_failed") carrying
   .attempts. A "credits" reply counts as a failure, never an answer. */
function runProviderChain(providers, onAttempt){
  var attempts = [];
  var i = 0;
  function next(){
    if(i >= providers.length){
      var e = new Error("all_failed");
      e.attempts = attempts;
      return Promise.reject(e);
    }
    var p = providers[i++];
    if(onAttempt){ try{ onAttempt(p); }catch(ign){} }
    return Promise.resolve()
      .then(function(){ return p.run(); })
      .then(function(text){
        if(isCreditsError(text)) throw { code:"credits", message:"provider reported insufficient credits" };
        return { provider:p, text:text, attempts:attempts };
      })
      .catch(function(err){
        attempts.push({ id:p.id, label:p.label, code:(err&&err.code)||null, error:errMessage(err) });
        return next();
      });
  }
  return next();
}

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
"3. If the pool is empty, do NOT invent players — the app auto-loads the DEMO slate (synthetic players); note results are from demo data.\n"+
"4. Keep answers conversational and concise. Use the data (value = projection/salary, ownership, ceiling) to justify picks.\n"+
"5. When the user wants lineups built, comparisons, or a pick explained, end your reply with one or more fenced directive blocks like:\n"+
"```gridiron\n{\"action\":\"build_lineup\",\"mode\":\"gpp\",\"num_lineups\":3,\"locks\":[],\"excludes\":[],\"stacks\":[{\"team\":\"KC\"}],\"max_exposure\":60}\n```\n"+
"Actions: build_lineup {mode: cash|gpp, num_lineups 1-20, locks [{name, slot?}], excludes [names], stacks [{team}], max_exposure 0-100}; set_exposure {player, pct 0-100}; compare {players: [2+ names]}; explain_pick {player}. "+
"Put prose OUTSIDE the blocks — the app parses and executes them. Only use exact player names from the pool. "+
"Inside the fence: STRICT JSON only — double quotes, no comments, no trailing commas, no prose.\n"+
"6. You may suggest strategy (stacks, leverage, chalk) but label optimizer outputs as optimizer outputs.");
}

var api = {
  ACTIONS: ACTIONS, MAX_POOL_IN_PROMPT: MAX_POOL_IN_PROMPT,
  NANO_MAX_POOL: NANO_MAX_POOL, GEMINI_HOST: GEMINI_HOST,
  extractDirectives: extractDirectives,
  extractDirectivesLenient: extractDirectivesLenient,
  findMalformedDirectives: findMalformedDirectives,
  parseDirectiveJson: parseDirectiveJson,
  salvageIntent: salvageIntent,
  buildPromptContext: buildPromptContext,
  buildNanoContext: buildNanoContext,
  nanoSystemPrompt: nanoSystemPrompt,
  validateAction: validateAction,
  findPlayer: findPlayer,
  extractStreamContent: extractStreamContent,
  systemPrompt: systemPrompt,
  isCreditsError: isCreditsError,
  renderRich: renderRich,
  escHtml: escHtml,
  geminiUrl: geminiUrl,
  geminiGenerateText: geminiGenerateText,
  runProviderChain: runProviderChain
};

if(typeof module !== "undefined" && module.exports){ module.exports = api; }
else { window.AICoachCore = api; }
})();
