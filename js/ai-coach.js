/* GridIronUI AI Coach — "Grid". Chat UI + Matrix baseball face + multi-provider free LLM chain.
   Pure logic in js/ai-coach-core.js (window.AICoachCore); optimizer in js/dfs-opt.js (window.DFSOpt). */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var CORE = window.AICoachCore, OPT = window.DFSOpt;
var CFG_KEY = "giu_ai_cfg", CHAT_KEY = "giu_ai_exposure_";

function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

/* ================= settings & pool ================= */
var settings = { site:"DK", sport:"NFL", mode:"gpp" };
try{
  var s0 = JSON.parse(localStorage.getItem(CFG_KEY)||"null");
  if(s0 && s0.site && s0.sport && s0.mode) settings = s0;
}catch(e){}
function cfgKey(){ return settings.site+"_"+settings.sport; }
function cfg(){ return OPT.CONFIGS[cfgKey()]; }
function saveSettings(){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(settings)); }catch(e){} }
function loadPool(){
  try{
    var d = JSON.parse(localStorage.getItem("giu_dfs_pool_"+cfgKey())||"null");
    return (d && d.pool) ? d.pool : [];
  }catch(e){ return []; }
}
function savePool(){
  try{ localStorage.setItem("giu_dfs_pool_"+cfgKey(), JSON.stringify({pool:pool})); }catch(e){}
}
function exposureCaps(){
  try{ return JSON.parse(localStorage.getItem(CHAT_KEY+cfgKey())||"{}")||{}; }catch(e){ return {}; }
}
function saveExposureCaps(c){ try{ localStorage.setItem(CHAT_KEY+cfgKey(), JSON.stringify(c)); }catch(e){} }

/* ================= THE FACE — Matrix baseball =================
   A 3D-projected sphere skinned in falling green Matrix-style glyphs.
   The two classic baseball seam curves (with stitching ticks) are drawn in
   brighter, bolder glyphs so it reads unmistakably as a baseball.
   Pure canvas 2D, no libraries. */
var face = (function(){
  var canvas = $("faceCanvas"), ctx = canvas.getContext("2d");
  var W=0, H=0, DPR=1;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var GLYPHS = "\u30a2\u30a4\u30ab\u30ad\u30af\u30b1\u30b3\u30b5\u30b7\u30b9\u30bb\u30bd\u30bf\u30c1\u30c4\u30c6\u30c8\u30ca0123456789$#*+-<>/\\|=:.";
  var TILT = 0.45;            /* fixed X tilt so the seams read in 3D */
  var state = { mode:"idle", spin:0.6, glow:0, energy:0, t:0 };
  var rain = [];

  /* fibonacci sphere skin */
  var SKIN_N = 620, skin = [];
  (function(){
    var ga = Math.PI * (3 - Math.sqrt(5));
    for(var i=0;i<SKIN_N;i++){
      var y = 1 - (i/(SKIN_N-1))*2, r = Math.sqrt(Math.max(0,1-y*y)), th = ga*i;
      skin.push([Math.cos(th)*r, y, Math.sin(th)*r]);
    }
  })();

  /* baseball seam: one wavy great-circle-ish curve -> the two classic lobes.
     phi(t) = A*sin(2t) weaves the circle up/down, giving the familiar
     two-curved-seam look from any angle. */
  var SEAM_N = 150, seam = [];
  (function(){
    var A = 0.55;
    for(var i=0;i<SEAM_N;i++){
      var t = (i/SEAM_N)*Math.PI*2, ph = A*Math.sin(2*t), c = Math.cos(ph);
      seam.push([Math.cos(t)*c, Math.sin(ph), Math.sin(t)*c, t]);
    }
  })();
  var STITCH_EVERY = 7;       /* stitch tick every Nth seam sample */

  function resize(){
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio||1);
    W = Math.max(200, Math.floor(r.width)); H = Math.max(260, Math.floor(r.height));
    canvas.width = W*DPR; canvas.height = H*DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    rain = [];
    var cols = Math.floor(W/26);
    for(var i=0;i<cols;i++) rain.push({ x: i*26+Math.random()*14, y: Math.random()*H, sp: 1.2+Math.random()*2.6, len: 6+Math.random()*10 });
  }

  function rotY(p, a){
    var c=Math.cos(a), s=Math.sin(a);
    return [p[0]*c+p[2]*s, p[1], -p[0]*s+p[2]*c];
  }
  function rotX(p, a){
    var c=Math.cos(a), s=Math.sin(a);
    return [p[0], p[1]*c-p[2]*s, p[1]*s+p[2]*c];
  }
  function proj(p, f, cx, cy, S){
    var sc = f/(f+p[2]);
    return [cx+p[0]*sc*S, cy-p[1]*sc*S, sc, p[2]];
  }

  function drawBall(cx, cy, S){
    var a = state.spin, f = 3.4, gl = state.glow;
    /* ambient green aura while thinking */
    if(gl>0.02){
      var g = ctx.createRadialGradient(cx,cy,10,cx,cy,S*2.1);
      g.addColorStop(0,"rgba(23,201,100,"+(0.20*gl).toFixed(3)+")");
      g.addColorStop(1,"rgba(23,201,100,0)");
      ctx.fillStyle=g; ctx.fillRect(cx-S*2.2,cy-S*2.2,S*4.4,S*4.4);
    }
    var i, p, q;
    /* --- glyph skin: front hemisphere only, brightness encodes depth --- */
    for(i=0;i<skin.length;i++){
      p = rotX(rotY(skin[i], a), TILT);
      if(p[2] < -0.08) continue;                    /* back of the ball */
      q = proj(p, f, cx, cy, S);
      var depth = Math.max(0, Math.min(1, (1.1-q[3])/2.1));
      var bright = Math.min(1, 0.22 + 0.62*depth + gl*0.2 + state.energy*0.3);
      var ch = GLYPHS[(Math.random()*GLYPHS.length)|0];
      var fs = Math.max(6, 10.5*q[2]);
      ctx.font = fs.toFixed(1)+"px monospace";
      ctx.fillStyle = "rgba(46,255,128,"+bright.toFixed(2)+")";
      ctx.fillText(ch, q[0]-fs*0.35, q[1]+fs*0.35);
    }
    /* --- seams: brighter, bolder glyphs --- */
    var spts = [];
    for(i=0;i<seam.length;i++){
      p = rotX(rotY(seam[i], a), TILT);
      q = proj(p, f, cx, cy, S);
      spts.push(q);
      if(p[2] < 0.02) continue;                     /* seam on the far side */
      var ch2 = GLYPHS[(Math.random()*GLYPHS.length)|0];
      var fs2 = Math.max(8, 13*q[2]);
      ctx.font = "bold "+fs2.toFixed(1)+"px monospace";
      ctx.fillStyle = "rgba(255,236,170,"+Math.min(1,0.75+gl*0.25+state.energy*0.25).toFixed(2)+")";
      ctx.fillText(ch2, q[0]-fs2*0.35, q[1]+fs2*0.35);
    }
    /* --- stitching ticks: short bright dashes perpendicular to the seam --- */
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,214,110,"+Math.min(1,0.85+gl*0.15).toFixed(2)+")";
    ctx.lineCap = "round";
    for(i=0;i<seam.length;i+=STITCH_EVERY){
      var prev = spts[(i-1+seam.length)%seam.length], cur = spts[i], nxt = spts[(i+1)%seam.length];
      var pr = rotX(rotY(seam[i], a), TILT);
      if(pr[2] < 0.02) continue;
      var tx = nxt[0]-prev[0], ty = nxt[1]-prev[1];
      var tl = Math.hypot(tx,ty)||1; tx/=tl; ty/=tl;
      var nx=-ty, ny=tx, L=7*cur[2];
      ctx.beginPath();
      ctx.moveTo(cur[0]-nx*L, cur[1]-ny*L);
      ctx.lineTo(cur[0]+nx*L, cur[1]+ny*L);
      ctx.stroke();
    }
    /* faint outline to sell the sphere (unit ball at focal distance 3.4) */
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(23,201,100,"+(0.35+0.45*gl).toFixed(2)+")";
    ctx.beginPath(); ctx.arc(cx, cy, S*1.05, 0, Math.PI*2); ctx.stroke();
  }

  function drawRain(){
    ctx.font = "13px monospace";
    for(var ci=0;ci<rain.length;ci++){
      var c = rain[ci];
      c.y += c.sp;
      if(c.y - c.len*16 > H){ c.y = -Math.random()*120; c.sp = 1.2+Math.random()*2.6; }
      for(var i=0;i<c.len;i++){
        var y = c.y - i*16;
        if(y<0||y>H) continue;
        var head = i===0;
        ctx.fillStyle = head ? "rgba(180,255,200,0.85)" : "rgba(23,201,100,"+(0.35*(1-i/c.len)).toFixed(2)+")";
        ctx.fillText(GLYPHS[(Math.random()*GLYPHS.length)|0], c.x, y);
      }
    }
  }

  function frame(){
    state.t += 0.016;
    if(state.mode==="idle"){ state.spin += 0.008; state.glow += (0-state.glow)*0.06; }
    else if(state.mode==="thinking"){ state.spin += 0.06; state.glow = 0.55+0.45*Math.sin(state.t*7); }
    else if(state.mode==="speaking"){ state.spin += 0.016; state.glow = 0.3+0.25*Math.sin(state.t*5); }
    state.energy *= 0.93;
    ctx.fillStyle = "rgba(6,10,14,0.55)"; /* trails */
    ctx.fillRect(0,0,W,H);
    drawRain();
    var S = Math.min(W,H)/2.9;
    drawBall(W/2, H*0.52, S);
  }

  function loop(){ if(!reduced) requestAnimationFrame(loop); frame(); }
  window.addEventListener("resize", resize);
  resize(); frame(); if(!reduced) loop();

  return {
    setMode: function(m){ state.mode = m; $("faceStatus").textContent = m==="idle"?"idle":(m==="thinking"?"thinking\u2026":"responding\u2026"); },
    pulse: function(){ state.energy = Math.min(1, state.energy+0.55); }
  };
})();

/* ================= chat ================= */
var history = []; /* {role, content} for the LLM (raw text incl. directive blocks) */
var busy = false;
var pool = loadPool();

function setFace(m){ face.setMode(m); }

function scrollChat(){ var l=$("chatLog"); l.scrollTop = l.scrollHeight; }

function addMsg(role, html){
  var d = document.createElement("div");
  d.className = "msg "+(role==="user"?"user":role==="sys"?"sys":"grid");
  d.innerHTML = (role==="grid"?'<div class="who">GRID</div>':"")+html;
  $("chatLog").appendChild(d);
  scrollChat();
  return d;
}
function fmtText(t){
  return esc(t).replace(/\n/g,"<br>");
}
function stripDirectives(t){
  return String(t)
    .replace(/```gridiron\s*\n[\s\S]*?```/g,"")
    .replace(/```json\s*\n[\s\S]*?```/g,"")  /* models sometimes fence JSON here; never shown */
    .trim();
}

function refreshPoolBar(){
  var c = cfg();
  var n = pool.length;
  var demo = pool.some(function(p){return p.demo;});
  $("poolBar").innerHTML =
    '<span class="pool-pill">📦 Pool: <b>'+n+'</b> players · '+c.site+' '+c.sport+' · $'+c.cap.toLocaleString()+' cap'+(demo?' · <span class="demo-tag">DEMO</span>':"")+'</span>'+
    (n ? "" : '<span class="pool-warn">Pool is empty — just ask me to build and I\'ll load the DEMO slate, or <a href="dfs.html">bring your own CSV in the DFS Lab</a>.</span>');
}

function greeting(){
  addMsg("grid", fmtText(
    "Hey, I'm Grid — your AI lineup coach. Tell me what you're building and I'll talk it through, "+
    "compare players, or run the optimizer right here in chat.\n\n"+
    "Try: \"Build me 3 GPP lineups with a Chiefs stack\" — or ask me who's the best value under $6k."));
}

function exampleChips(){
  var ex = [
    "Build me 3 GPP lineups with a Chiefs stack",
    "Who's the best value RB under $6k?",
    "Compare Josh Allen vs Jalen Hurts"
  ];
  $("chips").innerHTML = ex.map(function(e){ return '<button class="chip" type="button">'+esc(e)+'</button>'; }).join("");
  Array.prototype.forEach.call($("chips").querySelectorAll(".chip"), function(b){
    b.addEventListener("click", function(){ $("chatInput").value = b.textContent; send(); });
  });
}

/* ---------- LLM provider chain ----------
   1. Grid cloud (Cloudflare Worker) — instant answers, zero setup, once Kyle
      deploys it (see worker/README.md). Until then it self-skips silently.
   2. free-cloud (LLM7) — instant answers, zero setup for every visitor:
      no key, no download, no account. Silent fall-through on 429/5xx/timeout.
   3. Chrome/Edge built-in on-device AI (Gemini Nano) — one-tap download.
   4. The visitor's optional free Gemini key (only if they pasted one).
   5. An honest failure state naming the options — never a fake reply,
      never an endless spinner.
   The status pill always shows which provider actually answered, and never
   promises "instant" unless an instant provider actually answered a probe. */
var GEMINI_KEY_LS = "giu_gemini_key";
function getGeminiKey(){ try{ return (localStorage.getItem(GEMINI_KEY_LS)||"").trim(); }catch(e){ return ""; } }
function providerStatus(html){ var el=$("providerStatus"); if(el) el.innerHTML = html; }

/* ----- Nano (on-device) session management ----- */
var nanoSession = null, nanoSessionKey = null, nanoAvailability = "unknown";
var nanoBannerDismissed = false, pendingAfterDownload = null;
function nanoApi(){
  return window.LanguageModel || (window.ai && window.ai.languageModel) || null;
}
function checkNanoAvailability(){
  var LM = nanoApi();
  if(!LM || typeof LM.availability !== "function")
    return Promise.resolve("unsupported");
  var p;
  try{
    p = LM.availability({ expectedOutputs:[{ type:"text", languages:["en"] }] });
  }catch(e){
    nanoAvailability = "unavailable";
    return Promise.resolve("unavailable");
  }
  return Promise.resolve(p).then(function(av){
    nanoAvailability = av || "unavailable";
    return nanoAvailability;
  }, function(){
    nanoAvailability = "unavailable";
    return "unavailable";
  });
}
function dropNanoSession(){
  if(nanoSession && typeof nanoSession.destroy === "function"){
    try{ nanoSession.destroy(); }catch(e){}
  }
  nanoSession = null; nanoSessionKey = null;
}
function getNanoSession(){
  /* one persistent session per pool/config; the session itself holds the
     conversation, so each turn only sends the latest user message */
  var key = cfgKey()+"|"+settings.mode+"|"+pool.length;
  if(nanoSession && nanoSessionKey===key) return Promise.resolve(nanoSession);
  dropNanoSession();
  var LM = nanoApi();
  var ctx = CORE.buildNanoContext(cfg(), pool, {mode: settings.mode});
  return LM.create({ systemPrompt: CORE.nanoSystemPrompt(ctx) }).then(function(s){
    nanoSession = s; nanoSessionKey = key;
    return s;
  });
}
function streamNano(session, userText, onToken){
  return new Promise(function(resolve, reject){
    var full = "";
    var stream;
    try{
      if(typeof session.promptStreaming !== "function") throw new Error("no-stream");
      stream = session.promptStreaming(userText);
    }catch(e){
      session.prompt(userText).then(function(out){
        var t = String(out==null?"":out); onToken(t); resolve(t);
      }, reject);
      return;
    }
    var reader = stream.getReader();
    (function pump(){
      reader.read().then(function(r){
        if(r.done){ resolve(full); return; }
        var chunk = String(r.value==null?"":r.value);
        full += chunk; onToken(chunk);
        pump();
      }, reject);
    })();
  });
}
function nanoRun(userText, onToken){
  return checkNanoAvailability().then(function(av){
    if(av === "available"){
      return getNanoSession().then(function(session){
        return streamNano(session, userText, onToken).then(function(t){
          if(!t || !t.trim()) throw { code:"nano_empty", message:"the on-device model returned nothing" };
          return t;
        });
      });
    }
    if(av === "downloadable" || av === "downloading")
      throw { code:"nano_download", availability: av,
              message:"on-device model is '"+av+"' — needs a one-time download first" };
    throw { code:"nano_unavailable",
            message: av==="unsupported"
              ? "this browser has no built-in AI (needs Chrome/Edge 138+ on desktop)"
              : "on-device AI is '"+av+"'" };
  });
}

/* ----- one-time model download banner ----- */
function showNanoBanner(){
  var b = $("nanoBanner");
  if(!b || nanoBannerDismissed) return;
  b.style.display = "block";
}
function hideNanoBanner(){ var b = $("nanoBanner"); if(b) b.style.display = "none"; }
function maybeOfferNanoDownload(){
  if(nanoBannerDismissed) return;
  checkNanoAvailability().then(function(av){
    if(av==="downloadable" || av==="downloading") showNanoBanner();
  });
}
function wireNanoBanner(){
  var btn = $("nanoDownloadBtn");
  if(btn) btn.addEventListener("click", downloadNanoModel);
  var x = $("nanoBannerClose");
  if(x) x.addEventListener("click", function(){ nanoBannerDismissed = true; hideNanoBanner(); });
}
function downloadNanoModel(){
  var LM = nanoApi();
  if(!LM) return;
  var btn = $("nanoDownloadBtn"), bar = $("nanoBar"),
      pct = $("nanoPct"), prog = $("nanoProgress");
  if(btn) btn.disabled = true;
  if(prog) prog.style.display = "flex";
  if(pct) pct.textContent = "starting…";
  var ctx = CORE.buildNanoContext(cfg(), pool, {mode: settings.mode});
  function onProgress(e){
    var p = (e && e.total) ? (e.loaded/e.total) : 0;
    if(bar) bar.style.width = Math.round(p*100)+"%";
    if(pct) pct.textContent = Math.round(p*100)+"%";
  }
  LM.create({
    systemPrompt: CORE.nanoSystemPrompt(ctx),
    monitor: function(m){ m.addEventListener("downloadprogress", onProgress); }
  }).then(function(session){
    nanoSession = session;
    nanoSessionKey = cfgKey()+"|"+settings.mode+"|"+pool.length;
    nanoAvailability = "available";
    hideNanoBanner();
    providerStatus("✅ Running 100% on your device");
    if(pendingAfterDownload){
      var t = pendingAfterDownload; pendingAfterDownload = null;
      send(t, true); /* user message already shown — don't echo it twice */
    } else {
      addMsg("grid", fmtText("The on-device model is ready — everything now runs 100% on your device. Ask me anything."));
    }
  }, function(){
    if(btn) btn.disabled = false;
    if(pct) pct.textContent = "download failed — check your connection and try again";
  });
}

/* Gemini via the visitor's own free key. The key is only ever sent to
   Google's endpoint (see CORE.geminiUrl) and stored in localStorage. */
function geminiRun(messages, onToken){
  return CORE.geminiGenerateText(messages, getGeminiKey(), fetch).then(function(t){
    onToken(t);
    return t;
  });
}

/* ----- Grid cloud (Cloudflare Worker) — the "just works" path -----
   GRID_WORKER_URL is the public URL of Kyle's Cloudflare Worker (see
   worker/README.md for the 5-minute setup). The AI key lives server-side in
   the Worker, so visitors get instant answers with zero setup: no key, no
   download, no sign-in.
   Until Kyle sets the URL (empty string below), this provider self-skips
   SILENTLY: it is never added to the chain, shows no UI, and logs no error.
   The status pill only promises "instant" after a successful reachability
   probe — never on configuration alone. */
var GRID_WORKER_URL = ""; /* e.g. "https://gridironui-grid-chat.<subdomain>.workers.dev" */
function gridCloudConfigured(){
  return typeof GRID_WORKER_URL === "string" && GRID_WORKER_URL.replace(/\/+$/,"").length > 8;
}
function gridCloudBase(){
  return GRID_WORKER_URL.replace(/\/+$/,"");
}
function gridCloudRun(messages, onToken){
  /* full-context: system prompt + last 10 turns, same as the Gemini path */
  var ctl = new AbortController();
  var timedOut = false;
  var to = setTimeout(function(){ timedOut = true; ctl.abort(); }, 25000);
  var payload = {
    system: (messages[0] && messages[0].role==="system") ? String(messages[0].content) : "",
    messages: messages.filter(function(m){ return m.role!=="system"; }).slice(-10)
      .map(function(m){ return { role:m.role, content:String(m.content) }; })
  };
  return fetch(gridCloudBase()+"/chat", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload),
    signal: ctl.signal
  }).then(function(r){
    clearTimeout(to);
    if(!r.ok) throw { code:"gridcloud_http", message:"the instant cloud AI returned HTTP "+r.status };
    return r.json();
  }).then(function(j){
    var t = String((j && j.reply)||"").trim();
    if(!t) throw { code:"gridcloud_empty", message:"the instant cloud AI returned nothing" };
    onToken(t); /* non-streaming: one token callback with the full reply */
    return t;
  }, function(e){
    clearTimeout(to);
    throw { code:"gridcloud_fail",
            message: timedOut ? "the instant cloud AI timed out" : "the instant cloud AI didn't respond" };
  });
}
/* Silent reachability probe: GET / answers {ok:true} without spending AI
   calls. Never shows UI; only used to word the status pill honestly. */
var gridCloudReady = false;
function probeGridCloud(){
  if(!gridCloudConfigured()) return Promise.resolve(false);
  var ctl = new AbortController();
  var to = setTimeout(function(){ ctl.abort(); }, 8000);
  return fetch(gridCloudBase()+"/", { signal: ctl.signal })
    .then(function(r){
      clearTimeout(to);
      gridCloudReady = !!r.ok;
      return gridCloudReady;
    }, function(){
      clearTimeout(to);
      gridCloudReady = false;
      return false;
    });
}

/* ----- free-cloud (LLM7) — the zero-setup instant path -----
   POST https://api.llm7.io/v1/chat/completions — OpenAI-compatible, fully
   browser-callable (CORS *). Anonymous auth: header "Authorization: Bearer
   unused". Model "default" is their stable selector (dynamic catalog — if it
   ever 404s/400s we treat it as a provider failure and fall through).
   Shared anonymous rate bucket: expect occasional 429s. ONE attempt only —
   no retry storms — then silent fall-through to the next provider. */
var LLM7_CHAT_URL = "https://api.llm7.io/v1/chat/completions";
var LLM7_MODELS_URL = "https://api.llm7.io/v1/models";
var LLM7_MODEL = "default";
function llm7Run(messages, onToken){
  /* full-context: system prompt + last 10 turns, same as the Gemini path */
  var ctl = new AbortController();
  var timedOut = false;
  var to = setTimeout(function(){ timedOut = true; ctl.abort(); }, 25000);
  var body = {
    model: LLM7_MODEL,
    messages: messages.slice(-11).map(function(m){ return { role:m.role, content:String(m.content) }; }),
    max_tokens: 800,
    temperature: 0.7,
    stream: false
  };
  return fetch(LLM7_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer unused" },
    body: JSON.stringify(body),
    signal: ctl.signal
  }).then(function(r){
    clearTimeout(to);
    if(!r.ok) throw { code:"freecloud_http", message:"the free AI service returned HTTP "+r.status };
    return r.json();
  }).then(function(j){
    var t = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content)||"").trim();
    if(!t) throw { code:"freecloud_empty", message:"the free AI service returned nothing" };
    onToken(t); /* non-streaming: one token callback with the full reply */
    return t;
  }, function(e){
    clearTimeout(to);
    throw { code:"freecloud_fail",
            message: timedOut ? "the free AI service timed out" : "the free AI service didn't respond" };
  });
}
/* Silent reachability probe: GET /v1/models returns the model catalog without
   spending AI calls. Never shows UI; only used to word the status pill
   honestly. */
var freeCloudReady = false;
function probeFreeCloud(){
  var ctl = new AbortController();
  var to = setTimeout(function(){ ctl.abort(); }, 8000);
  return fetch(LLM7_MODELS_URL, { signal: ctl.signal })
    .then(function(r){
      clearTimeout(to);
      freeCloudReady = !!r.ok;
      return freeCloudReady;
    }, function(){
      clearTimeout(to);
      freeCloudReady = false;
      return false;
    });
}

/* ---------- action execution (through the real optimizer) ---------- */
function seatLocks(cfg, pool, locks){
  /* locks: [{slot, player}] → returns {locked, lockedIds, errors} */
  var locked=[], lockedIds={}, errors=[];
  var usedSlots={};
  locks.forEach(function(l){
    var p = CORE.findPlayer(pool, l.name);
    if(!p){ errors.push("Couldn't find '"+l.name+"' in the pool."); return; }
    var slot = null;
    if(l.slot && OPT.eligible(p, l.slot, cfg) && (usedSlots[l.slot]||0) < cfg.slots.filter(function(s){return s===l.slot;}).length){
      slot = l.slot;
    } else {
      for(var i=0;i<cfg.slots.length;i++){
        var s = cfg.slots[i];
        if((usedSlots[s]||0) < cfg.slots.filter(function(x){return x===s;}).length && OPT.eligible(p,s,cfg)){ slot=s; break; }
      }
    }
    if(!slot){ errors.push("No open slot fits "+p.name+"."); return; }
    usedSlots[slot]=(usedSlots[slot]||0)+1;
    locked.push({slot:slot, player:p}); lockedIds[p.id]=1;
  });
  return { locked:locked, lockedIds:lockedIds, errors:errors };
}

function stackLocks(cfg, pool, team){
  team = String(team).toUpperCase();
  var qbs = pool.filter(function(p){ return p.team===team && p.pos.indexOf("QB")!==-1; })
    .sort(function(a,b){ return b.ceil-a.ceil; });
  if(!qbs.length) return { error:"No "+team+" QB in the pool." };
  var qb = qbs[0];
  var mates = pool.filter(function(p){
    return p.id!==qb.id && p.team===team && p.pos.some(function(x){return ["RB","WR","TE"].indexOf(x)!==-1;});
  }).sort(function(a,b){ return b.ceil-a.ceil; }).slice(0,2);
  if(mates.length<2) return { error:"Not enough "+team+" pass-catchers in the pool for a stack." };
  var locks = [{name:qb.name}].concat(mates.map(function(m){ return {name:m.name}; }));
  return seatLocks(cfg, pool, locks);
}

function diffCount(a,b){
  var sa={}; a.forEach(function(e){ sa[e.player.id]=1; });
  var d=0; b.forEach(function(e){ if(!sa[e.player.id]) d++; });
  return d;
}

function coachGenerate(mode, opts){
  /* opts: {numLineups, locked:[{slot,player}], lockedIds, excludeIds, stackNote} */
  var key = cfgKey(), c = cfg();
  var eff = pool.filter(function(p){ return !opts.excludeIds[p.id]; });
  /* locked players must remain eligible even under exposure caps */
  var caps = exposureCaps(); /* {lowerName: pct} */
  var idCaps = {};
  Object.keys(caps).forEach(function(nm){
    var p = CORE.findPlayer(pool, nm);
    if(p) idCaps[p.id] = caps[nm]/100;
  });
  var globalMax = opts.maxExposure!=null ? opts.maxExposure/100 : (mode==="cash"?1:0.6);
  var numWanted = Math.min(opts.numLineups||1, mode==="cash"?3:20);
  /* a cap below 1/numWanted can never accept even one lineup (the first pick
     already violates it) — relax it openly rather than failing every attempt */
  var askedCap = globalMax, capRelaxed = false;
  if(globalMax < 1/numWanted - 1e-9){ globalMax = 1/numWanted; capRelaxed = true; }
  var lineups=[], exposures={}, prevIds=[], banIdx=0, qbIdx=0, attempts=0;
  var minUnique = mode==="cash"?2:3;

  while(lineups.length<numWanted && attempts<numWanted*24){
    attempts++;
    var banned={};
    if(prevIds.length) for(var w=0;w<3;w++) banned[prevIds[(banIdx*3+w)%prevIds.length]]=1;
    banIdx++;
    var lockedGone = (opts.locked||[]).some(function(l){ return banned[l.player.id]; });
    if(lockedGone) continue;
    var maxed={};
    Object.keys(exposures).forEach(function(id){
      if(opts.lockedIds[id]) return; /* locks ignore the exposure cap — standard DFS behavior */
      var cap = idCaps[id]!=null?idCaps[id]:globalMax;
      /* mirror the acceptance rule below: exclude anyone who could not be picked
         again, so greedy aims at fresh players instead of burning attempts on
         lineups the exposure check would reject */
      if(((exposures[id]||0)+1)/numWanted > cap+1e-9) maxed[id]=1;
    });
    var ep = eff.filter(function(p){ return !banned[p.id] && !maxed[p.id]; });
    /* GPP NFL requires a QB stack — force one the way the DFS Lab does (rotating
       the QB for diversity) instead of hoping greedy stumbles into a stack */
    var lockedG = (opts.locked||[]).slice(), lidsG = {};
    (opts.locked||[]).forEach(function(e){ lidsG[e.player.id]=1; });
    if(mode==="gpp" && c.sport==="NFL" && !OPT.hasStack(lockedG)){
      var lockedQB = (opts.locked||[]).filter(function(e){ return e.player.pos.indexOf("QB")!==-1; })[0]||null;
      var qbsEff = ep.filter(function(p){ return p.pos.indexOf("QB")!==-1; })
        .sort(function(a,b){ return b.ceil-a.ceil; }).slice(0, Math.max(8, numWanted));
      var qbId;
      if(lockedQB){
        /* a user-locked QB becomes the stack QB — no rotation against their choice */
        if(!qbsEff.some(function(q){ return q.id===lockedQB.player.id; })) continue;
        qbId = lockedQB.player.id;
      } else {
        if(!qbsEff.length) continue;
        qbId = qbsEff[qbIdx % qbsEff.length].id;
        qbIdx++;
      }
      var core = OPT.buildStackCore(c, ep, mode, {volPenalty:0.5}, qbId, exposures);
      if(!core) continue;
      core.locked.forEach(function(e){
        if(!lidsG[e.player.id]){ lockedG.push(e); lidsG[e.player.id]=1; }
      });
    }
    var lu = OPT.greedy(c, ep, mode, {volPenalty:0.5}, lockedG);
    if(!lu) continue;
    lu = OPT.hillClimb(c, lu, ep, mode, {volPenalty:0.5}, lidsG);
    if(!OPT.validate(lu,c).ok) continue;
    if(mode==="gpp" && c.sport==="NFL" && !OPT.hasStack(lu)) continue;
    if(lineups.some(function(o){ return diffCount(o,lu)<minUnique; })) continue;
    var over=false;
    lu.forEach(function(e){
      if(opts.lockedIds[e.player.id]) return; /* locks exempt from exposure caps */
      var cap = idCaps[e.player.id]!=null?idCaps[e.player.id]:globalMax;
      if(((exposures[e.player.id]||0)+1)/numWanted > cap+1e-9) over=true;
    });
    if(over) continue;
    lu.forEach(function(e){ exposures[e.player.id]=(exposures[e.player.id]||0)+1; });
    lineups.push(lu);
    prevIds = lu.map(function(e){ return e.player.id; });
  }
  return { lineups:lineups, exposures:exposures, relaxed: lineups.length<numWanted,
           capRelaxed:capRelaxed, askedCap:askedCap, effCap:globalMax };
}

function lineupCard(lu, i, mode){
  var c = cfg();
  var rows = lu.map(function(e){
    return '<tr><td><b>'+esc(e.slot)+'</b></td><td>'+esc(e.player.name)+'</td><td>'+esc(e.player.team)+'</td>'+
      '<td class="num">$'+e.player.salary.toLocaleString()+'</td><td class="num">'+e.player.proj.toFixed(1)+'</td><td class="num">'+e.player.ceil.toFixed(1)+'</td></tr>';
  }).join("");
  var ins = OPT.insights(lu, pool, mode, cfgKey()).map(function(s){ return '<li>'+esc(s)+'</li>'; }).join("");
  return '<div class="card lineup-card"><div class="section-head" style="margin-bottom:8px"><h4 style="margin:0">Lineup '+(i+1)+'</h4>'+
    '<div class="game-meta"><span class="num">$'+OPT.salary(lu).toLocaleString()+'</span><span class="num">'+OPT.proj(lu).toFixed(1)+' proj</span><span class="num">'+OPT.ceil(lu).toFixed(1)+' ceil</span></div></div>'+
    '<div class="table-scroll"><table class="data"><thead><tr><th>Slot</th><th>Player</th><th>Team</th><th>Sal</th><th>Proj</th><th>Ceil</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<details class="faq" style="margin-top:10px"><summary>Why this lineup</summary><ul class="ins">'+ins+'</ul></details></div>';
}

function compareTable(names){
  var rows = names.map(function(n){
    var p = CORE.findPlayer(pool, n);
    var val = p.proj/p.salary*1000;
    return '<tr><td><b>'+esc(p.name)+'</b></td><td>'+esc(p.team)+'</td><td>'+p.pos.join("/")+'</td>'+
      '<td class="num">$'+p.salary.toLocaleString()+'</td><td class="num">'+p.proj.toFixed(1)+'</td>'+
      '<td class="num">'+p.floor.toFixed(1)+'</td><td class="num">'+p.ceil.toFixed(1)+'</td>'+
      '<td class="num">'+p.own.toFixed(0)+'%</td><td class="num">'+val.toFixed(2)+'</td></tr>';
  }).join("");
  return '<div class="table-scroll"><table class="data"><thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>Sal</th><th>Proj</th><th>Floor</th><th>Ceil</th><th>Own</th><th>Val/1K</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function explainPick(p){
  var sorted = pool.slice().sort(function(a,b){ return (b.proj/b.salary)-(a.proj/a.salary); });
  var rank = sorted.findIndex(function(x){ return x.id===p.id; })+1;
  var out = [
    "<b>"+esc(p.name)+"</b> ("+esc(p.team)+" · "+p.pos.join("/")+") — $"+p.salary.toLocaleString()+", "+p.proj.toFixed(1)+" proj, "+p.floor.toFixed(1)+" floor, "+p.ceil.toFixed(1)+" ceiling, "+p.own.toFixed(0)+"% owned.",
    "Value rank <b>#"+rank+"</b> of "+pool.length+" by projection-per-dollar.",
    p.own<10 ? "Low ownership ("+p.own.toFixed(0)+"%) — tournament leverage if the ceiling hits."
             : "Ownership is "+p.own.toFixed(0)+"% — " + (p.own>25 ? "chalky; fine for cash, less differentiating in GPP." : "moderate; playable in both formats."),
    "Ceiling is "+(p.ceil/Math.max(p.proj,0.1)).toFixed(1)+"× projection — "+(p.ceil>p.proj*1.4?"real spike-week upside.":"steady rather than explosive."),
    "Reminder: this is based on your editable projections, not a prediction — adjust the numbers in the DFS Lab if you disagree."
  ];
  return out;
}

function executeDirectives(text, hostEl, userText){
  /* lenient parse: small models may emit slightly-off JSON */
  var blocks = CORE.extractDirectivesLenient(text);
  if(!blocks.length){
    /* the model meant to act but the fence was unsalvageable — rebuild the
       intent from the conversation so the optimizer still runs */
    var salvaged = (typeof CORE.salvageIntent==="function")
      ? CORE.salvageIntent(text, userText, pool) : null;
    if(salvaged){
      blocks = [salvaged];
    } else {
      /* no parseable directives — but did it *try* and garble one? ask, don't fail */
      var malformed = CORE.findMalformedDirectives(text);
      if(malformed.length){
        addMsg("grid", "I tried to run that as an optimizer action, but the instruction came out garbled on my end — could you say it again in different words?");
      }
      return;
    }
  }
  var c = cfg();
  blocks.forEach(function(d){
    var v = CORE.validateAction(d, pool);
    if(!v.ok){
      var e = document.createElement("div");
      e.className = "action-note err";
      e.textContent = "⚙️ Grid tried to run '"+d.action+"' but I couldn't: "+v.error;
      hostEl.appendChild(e);
      return;
    }
    if(!pool.length && (d.action==="build_lineup"||d.action==="compare"||d.action==="explain_pick")){
      /* zero-setup: the pool is empty, so load the DEMO slate right here
         instead of sending the visitor to another page. Clearly labeled. */
      pool = OPT.buildDemoSlate(cfg());
      savePool(); refreshPoolBar();
      var w = document.createElement("div");
      w.className = "action-note";
      w.innerHTML = "📦 Your pool was empty, so I loaded the <b>DEMO slate</b> — synthetic players with made-up projections, just for trying the optimizer. Your "+(d.action==="build_lineup"?"lineups are":"result is")+" below. To use real projections, upload a CSV in the <a href='dfs.html'>DFS Lab</a> anytime.";
      hostEl.appendChild(w);
    }
    if(d.action==="build_lineup"){
      var mode = d.mode||settings.mode;
      var excludeIds = {};
      (d.excludes||[]).forEach(function(x){ var p=CORE.findPlayer(pool,x); if(p) excludeIds[p.id]=1; });
      var seat = { locked:[], lockedIds:{}, errors:[] };
      (d.stacks||[]).forEach(function(s){
        var r = stackLocks(c, pool.filter(function(p){ return !excludeIds[p.id]; }), s.team);
        if(r.error) seat.errors.push(r.error);
        else { seat.locked = seat.locked.concat(r.locked); r.locked.forEach(function(l){ seat.lockedIds[l.player.id]=1; }); }
      });
      var ls = seatLocks(c, pool, d.locks||[]);
      seat.errors = seat.errors.concat(ls.errors);
      seat.locked = seat.locked.concat(ls.locked);
      ls.locked.forEach(function(l){ seat.lockedIds[l.player.id]=1; });
      var note = document.createElement("div");
      note.className = "action-note";
      var desc = "⚙️ Building "+(d.num_lineups||1)+" "+(mode==="cash"?"cash":"tournament")+" lineup(s)"+
        ((d.stacks||[]).length ? " · stack: "+d.stacks.map(function(s){return esc(String(s.team).toUpperCase());}).join(", ") : "")+
        (seat.locked.length ? " · locks: "+seat.locked.map(function(l){return esc(l.player.name);}).join(", ") : "")+
        ((d.excludes||[]).length ? " · excluding "+(d.excludes||[]).length+" player(s)" : "")+
        (d.max_exposure!=null ? " · max exposure "+d.max_exposure+"%" : "");
      note.innerHTML = desc + (seat.errors.length ? ' <span style="color:var(--red)">('+seat.errors.map(esc).join("; ")+')</span>' : "");
      hostEl.appendChild(note);
      var res = coachGenerate(mode, {
        numLineups: d.num_lineups||1,
        locked: seat.locked, lockedIds: seat.lockedIds, excludeIds: excludeIds,
        maxExposure: d.max_exposure
      });
      if(!res.lineups.length){
        var ne = document.createElement("div");
        ne.className = "action-note err";
        ne.textContent = "⚙️ The optimizer couldn't fit a valid lineup — the pool may be too small or too expensive for the cap. Add cheaper players in the DFS Lab.";
        hostEl.appendChild(ne);
        return;
      }
      res.lineups.forEach(function(lu,i){
        var wrap = document.createElement("div");
        wrap.innerHTML = lineupCard(lu, i, mode);
        hostEl.appendChild(wrap);
      });
      if(res.capRelaxed){
        var crn = document.createElement("div");
        crn.className = "action-note";
        crn.textContent = "Heads up: max exposure "+Math.round(res.askedCap*100)+"% can't fill "+res.lineups.length+" lineup(s) — each player needs at least "+Math.round(res.effCap*100)+"% to appear once. I relaxed the cap to fit your request.";
        hostEl.appendChild(crn);
      }
      var disc = document.createElement("div");
      disc.className = "action-note";
      disc.textContent = res.relaxed
        ? "Only "+res.lineups.length+" unique lineup(s) fit this pool — add more players for better diversity. Optimizer output from your projections, not a prediction."
        : "All lineups hard-validated (cap, positions, no duplicates). Optimizer output from your projections — not a prediction, never a guarantee.";
      hostEl.appendChild(disc);
      scrollChat();
    }
    else if(d.action==="set_exposure"){
      var caps = exposureCaps();
      caps[v.player.name.toLowerCase()] = Number(d.pct);
      saveExposureCaps(caps);
      var se = document.createElement("div");
      se.className = "action-note";
      se.textContent = "⚙️ Exposure cap saved: "+v.player.name+" ≤ "+d.pct+"% of lineups (applies to future builds in this "+c.site+" "+c.sport+" slate).";
      hostEl.appendChild(se);
    }
    else if(d.action==="compare"){
      var ct = document.createElement("div");
      ct.innerHTML = '<div class="action-note">⚙️ Head-to-head:</div>'+compareTable(d.players);
      hostEl.appendChild(ct);
      scrollChat();
    }
    else if(d.action==="explain_pick"){
      var xp = document.createElement("div");
      xp.innerHTML = '<div class="action-note">⚙️ Why '+esc(v.player.name)+':</div><ul class="ins">'+
        explainPick(v.player).map(function(s){ return '<li>'+s+'</li>'; }).join("")+'</ul>';
      hostEl.appendChild(xp);
      scrollChat();
    }
  });
}

/* ---------- send ---------- */
/* prefill: message text to send; skipEcho: the user message is already on screen
   (used when resuming after the on-device model download) */
function send(prefill, skipEcho){
  if(busy) return;
  var input = $("chatInput");
  var text = (prefill!=null) ? String(prefill).trim() : input.value.trim();
  if(!text) return;
  if(!skipEcho){
    input.value = "";
    addMsg("user", fmtText(text));
  }

  if(!pool.length){
    /* still allow chat — the system prompt tells Grid to redirect to the DFS Lab */
  }

  busy = true;
  $("sendBtn").disabled = true;
  setFace("thinking");
  /* full-context messages for the Gemini fallback (Nano uses its own session) */
  var ctx = CORE.buildPromptContext(cfg(), pool, {mode: settings.mode});
  var sys = CORE.systemPrompt(ctx);
  var msgs = [{role:"system", content:sys}];
  history.slice(-10).forEach(function(h){ msgs.push(h); });
  msgs.push({role:"user", content:text});
  if(!skipEcho) history.push({role:"user", content:text});

  var bubble = addMsg("grid", '<span class="typing"><span></span><span></span><span></span></span>');
  bubble.classList.add("streaming");
  var body = bubble;
  var full = "";
  var started = false;

  function onToken(piece){
    if(!started){ started = true; setFace("speaking"); body.innerHTML = ""; }
    full += piece;
    face.pulse();
    /* render incrementally but strip directive blocks from view */
    var vis = stripDirectives(full);
    body.innerHTML = fmtText(vis) || '<span class="typing"><span></span><span></span><span></span></span>';
    scrollChat();
  }
  function onDone(aiText){
    busy = false; $("sendBtn").disabled = false;
    setFace("idle");
    bubble.classList.remove("streaming");
    history.push({role:"assistant", content:aiText});
    if(history.length>22) history = history.slice(-22);
    var vis = stripDirectives(aiText).trim();
    body.innerHTML = vis ? fmtText(vis) : '<i style="color:var(--faint)">Grid ran the optimizer below.</i>';
    executeDirectives(aiText, body, text);
    scrollChat();
  }
  function onFail(err){
    busy = false; $("sendBtn").disabled = false;
    setFace("idle");
    bubble.classList.remove("streaming");
    var attempts = (err && err.attempts) || [];
    var nanoDl = attempts.some(function(a){ return a.code==="nano_download"; });
    var hasKey = !!getGeminiKey();
    if(nanoDl && !hasKey){
      /* the only ways forward: download the model, or paste a Gemini key */
      pendingAfterDownload = text;
      showNanoBanner();
      providerStatus("💻 needs the on-device model or a Gemini key");
      var busyFree = attempts.some(function(a){ return a.id==="free-cloud" && CORE.isCreditsError((a.error||"")+" "+(a.code||"")); });
      var mdDl = busyFree
        ? "**The free shared AI is busy right now (rate limit) —** it clears on its own, so just try your message again in a bit. Or skip the wait, both options are free:\n\n"
        : "**Grid needs an AI to talk to — pick either option, both are free:**\n\n";
      mdDl +=
        "**1. On-device AI (recommended):** hit **Download free model** above (~1.7 GB, one time). It then runs 100% on your device — private, no key, no bill.\n\n" +
        "**2. Free Gemini key:** paste one from [AI Studio](https://aistudio.google.com/apikey) above (free tier, no credit card — it stays in your browser, only ever sent to Google).\n\n" +
        "On-device AI needs Chrome or Edge 138+ on a desktop computer — it isn't on mobile browsers.";
      body.innerHTML = CORE.renderRich(mdDl);
      scrollChat();
      return;
    }
    providerStatus("⚠️ all providers failed");
    var lines = attempts.map(function(a){ return "• "+a.label+" — "+a.error; });
    var quotaHit = attempts.some(function(a){ return CORE.isCreditsError(a.error); });
    var md = "**Grid couldn't reach any AI provider right now.**\n\n" +
      (lines.length ? "Tried:\n"+lines.join("\n")+"\n\n" : "") +
      (quotaHit
        ? "A provider hit a rate or quota limit — that usually clears on its own, so try again in a bit.\n\n"
        : "") +
      (hasKey
        ? "Your saved Gemini key didn't work — double-check it at [AI Studio](https://aistudio.google.com/apikey)."
        : "Not on Chrome/Edge desktop? Paste a free Gemini key from [AI Studio](https://aistudio.google.com/apikey) above and Grid will use it automatically. It stays in your browser — never sent anywhere but Google.");
    body.innerHTML = CORE.renderRich(md);
    scrollChat();
  }
  /* provider chain: Grid cloud first (zero setup once Kyle deploys the
     Worker — self-skips silently until then), then the free shared AI
     (zero setup for every visitor), then on-device Nano, then the
     optional user-supplied Gemini key. Whichever answers first wins,
     and the pill says who. */
  if(!gridCloudConfigured() && !freeCloudReady) maybeOfferNanoDownload();
  var providers = [];
  if(gridCloudConfigured()){
    providers.push({ id:"grid-cloud", label:"instant cloud AI",
                     run:function(){ return gridCloudRun(msgs, onToken); } });
  }
  providers.push({ id:"free-cloud", label:"free shared AI",
                   run:function(){ return llm7Run(msgs, onToken); } });
  providers.push({ id:"nano", label:"on-device AI",
                   run:function(){ return nanoRun(text, onToken); } });
  if(getGeminiKey()){
    providers.push({ id:"gemini-key", label:"your Gemini key",
                     run:function(){ return geminiRun(msgs, onToken); } });
  }

  CORE.runProviderChain(providers, function(p){
    providerStatus("⏳ trying "+esc(p.label)+"…");
  }).then(function(res){
    if(res.provider.id==="grid-cloud") providerStatus("⚡ Answered instantly");
    else if(res.provider.id==="free-cloud") providerStatus("⚡ Answered instantly (free AI)");
    else if(res.provider.id==="nano") providerStatus("✅ Running 100% on your device");
    else providerStatus("✅ Answered by Gemini (your free key)");
    onDone(res.text);
  }, function(chainErr){
    onFail(chainErr);
  });
}

/* ---------- settings wiring ---------- */
function wireTabs(id, key, cb){
  Array.prototype.forEach.call($(id).querySelectorAll(".tab"), function(t){
    if(t.getAttribute("data-v")===settings[key]) t.classList.add("active");
    t.addEventListener("click", function(){
      Array.prototype.forEach.call($(id).querySelectorAll(".tab"), function(x){x.classList.remove("active");});
      t.classList.add("active");
      settings[key] = t.getAttribute("data-v");
      saveSettings(); cb();
    });
  });
}
function onCfgChange(){
  pool = loadPool();
  dropNanoSession(); /* on-device session holds the old pool context */
  refreshPoolBar();
  var c = cfg();
  addMsg("sys", "Switched to "+c.site+" "+c.sport+" · "+(settings.mode==="cash"?"50/50 Cash":"Tournament")+". Pool: "+pool.length+" players. Cap $"+c.cap.toLocaleString()+".");
}

/* ---------- init ---------- */
$("chatForm").addEventListener("submit", function(e){ e.preventDefault(); send(); });
$("clearBtn").addEventListener("click", function(){
  history = [];
  dropNanoSession();
  $("chatLog").innerHTML = "";
  greeting();
});
/* Gemini key settings: stays in localStorage, only ever sent to Google */
function refreshGemUI(){
  var has = !!getGeminiKey();
  var inp = $("gemKey");
  if(inp){
    inp.value = "";
    inp.placeholder = has ? "Key saved ✓ — paste a new one to replace" : "Paste AI Studio key";
  }
  var lbl = $("gemState");
  if(lbl) lbl.textContent = has ? "saved in this browser" : "not set";
}
var gemSave = $("gemSave"), gemClear = $("gemClear");
if(gemSave) gemSave.addEventListener("click", function(){
  var v = ($("gemKey").value||"").trim();
  if(!v){ return; }
  try{ localStorage.setItem(GEMINI_KEY_LS, v); }catch(e){}
  refreshGemUI();
  addMsg("sys", "Gemini key saved in this browser. Grid will use it automatically whenever on-device AI isn't available.");
});
if(gemClear) gemClear.addEventListener("click", function(){
  try{ localStorage.removeItem(GEMINI_KEY_LS); }catch(e){}
  refreshGemUI();
  addMsg("sys", "Gemini key removed from this browser.");
});
refreshGemUI();
providerStatus("⏳ checking AI options…");
wireNanoBanner();
/* Reachability probes for the instant providers (both silent, no AI spend).
   The pill only promises "instant" when a provider actually answers —
   otherwise honest on-device wording, or a neutral prompt. */
probeGridCloud().then(function(cloudOk){
  if(cloudOk){
    providerStatus("⚡ Ready — answers instantly");
    return;
  }
  probeFreeCloud().then(function(freeOk){
    if(freeOk){
      providerStatus("⚡ Ready — answers instantly");
      return;
    }
    checkNanoAvailability().then(function(av){
      if(av==="available"){
        providerStatus("✅ Ready — on-device AI");
      } else if(av==="downloadable" || av==="downloading"){
        maybeOfferNanoDownload();
        providerStatus("💻 Ready — download the free on-device model");
      } else {
        providerStatus("Choose a free AI option below");
      }
    });
  });
});
wireTabs("cSite","site", onCfgChange);
wireTabs("cSport","sport", onCfgChange);
wireTabs("cMode","mode", onCfgChange);
refreshPoolBar();
exampleChips();
greeting();
})();
