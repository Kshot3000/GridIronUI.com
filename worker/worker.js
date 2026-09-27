/* GridIronUI "Grid" chat proxy — Cloudflare Worker (plain JS, no build step).
 *
 * Why this exists: GridIronUI is a static GitHub Pages site, so it can't
 * hide an AI API key. This Worker keeps Kyle's key server-side and exposes
 * a tiny POST /chat endpoint the site calls. Visitors then get instant
 * answers with zero setup: no key, no download, no sign-in.
 *
 * Setup (5 minutes, free Cloudflare account — see README.md):
 *   1. Workers & Pages → Create Worker → paste this file.
 *   2. Bind Workers AI as "AI" (wrangler.toml already declares it).
 *   3. Copy the worker's public URL into GRID_WORKER_URL in js/ai-coach.js.
 *
 * Guardrails (no paid features):
 *   - CORS locked to https://kshot3000.github.io (+ ALLOWED_ORIGINS env var
 *     for Kyle's future custom domain). Browsers always send Origin on
 *     cross-origin POSTs, so unknown origins get a 403 before any AI spend.
 *   - Per-IP rate limit: 20 requests/minute (in-memory, per isolate).
 *   - Max request body 32 KB; empty/non-chat messages rejected.
 *   - Model call capped at ~800 tokens, temperature 0.7.
 */

var MODEL = "@cf/meta/llama-3.1-8b-instruct";
var MAX_TOKENS = 800;
var TEMPERATURE = 0.7;
var MAX_BODY_BYTES = 32 * 1024;
var RATE_LIMIT = 20;               /* requests per window, per IP */
var RATE_WINDOW_MS = 60 * 1000;

/* in-memory hit counters: ip -> {count, reset}. Simple and free; each
   Worker isolate tracks its own slice, which is fine for abuse throttling. */
var hits = new Map();

function allowedOrigins(env){
  var list = ["https://kshot3000.github.io"];
  if(env && env.ALLOWED_ORIGINS){
    String(env.ALLOWED_ORIGINS).split(",").forEach(function(o){
      var t = o.trim().replace(/\/+$/, "");
      if(t) list.push(t);
    });
  }
  return list;
}

function checkOrigin(request, env){
  var origin = request.headers.get("Origin");
  if(!origin) return { ok: true, origin: null };      /* non-browser client */
  var allowed = allowedOrigins(env);
  if(allowed.indexOf(origin.replace(/\/+$/, "")) !== -1) return { ok: true, origin: origin };
  return { ok: false, origin: origin };
}

function rateLimited(ip){
  var now = Date.now();
  var rec = hits.get(ip);
  if(!rec || now > rec.reset){
    rec = { count: 0, reset: now + RATE_WINDOW_MS };
    hits.set(ip, rec);
  }
  rec.count += 1;
  if(hits.size > 5000){
    hits.forEach(function(v, k){ if(now > v.reset) hits.delete(k); });
  }
  return rec.count > RATE_LIMIT;
}

function json(data, status, corsOrigin){
  var headers = { "Content-Type": "application/json" };
  if(corsOrigin){
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(JSON.stringify(data), { status: status || 200, headers: headers });
}

export default {
  async fetch(request, env, ctx){
    var url = new URL(request.url);
    var path = url.pathname.replace(/\/+$/, "") || "/";

    if(request.method === "OPTIONS"){
      var pre = checkOrigin(request, env);
      var h = { "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Max-Age": "86400" };
      if(pre.ok && pre.origin) h["Access-Control-Allow-Origin"] = pre.origin;
      return new Response(null, { status: 204, headers: h });
    }

    /* Public health endpoint — doubles as the site's silent reachability
       probe (no AI spend). Safe to expose cross-origin. */
    if(request.method === "GET" && path === "/"){
      var g = checkOrigin(request, env);
      return json({ ok: true, service: "gridironui-grid-chat" }, 200,
                  g.ok ? (g.origin || "*") : null);
    }

    if(request.method !== "POST" || path !== "/chat"){
      return json({ error: "not_found" }, 404, null);
    }

    var chk = checkOrigin(request, env);
    if(!chk.ok){
      return json({ error: "forbidden", message: "Origin not allowed." }, 403, null);
    }
    var corsOrigin = chk.origin; /* browsers always send Origin cross-origin */

    var ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if(rateLimited(ip)){
      return json({ error: "rate_limited",
                    message: "Too many requests — slow down a touch and try again." },
                  429, corsOrigin);
    }

    var body;
    try{
      var raw = await request.text();
      if(raw.length > MAX_BODY_BYTES) throw new Error("body too large");
      body = JSON.parse(raw);
    }catch(e){
      return json({ error: "bad_request",
                    message: "Send JSON like {system, messages:[{role,content}]}." },
                  400, corsOrigin);
    }

    var system = String(body.system || "").slice(0, 8000);
    var rawMsgs = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    var messages = rawMsgs
      .filter(function(m){
        return m && (m.role === "user" || m.role === "assistant") &&
               String(m.content || "").trim().length > 0;
      })
      .map(function(m){
        return { role: m.role, content: String(m.content).slice(0, 4000) };
      });
    if(!messages.length){
      return json({ error: "bad_request", message: "messages must not be empty." },
                  400, corsOrigin);
    }

    try{
      var aiMessages = [];
      if(system) aiMessages.push({ role: "system", content: system });
      messages.forEach(function(m){ aiMessages.push(m); });
      var out = await env.AI.run(MODEL, {
        messages: aiMessages,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE
      });
      var reply = String((out && out.response) || "").trim();
      if(!reply) throw new Error("empty model response");
      return json({ reply: reply }, 200, corsOrigin);
    }catch(e){
      return json({ error: "ai_error",
                    message: "The AI didn't respond — try again in a moment." },
                  502, corsOrigin);
    }
  }
};
