# Grid chat worker — 5-minute setup (Kyle)

This Cloudflare Worker is what makes Grid "just work": the AI key lives
server-side in your free Cloudflare account, so visitors get instant answers
with zero setup — no key, no download, no sign-in. Until you deploy this,
the site quietly uses the on-device AI / Gemini-key options instead.

## Option A — dashboard (no tools needed)

1. Sign up / log in at [cloudflare.com](https://cloudflare.com) (free plan —
   **no credit card required**).
2. Left sidebar → **Workers & Pages** → **Create** → **Create Worker** →
   **Deploy** (accept the starter), then **Edit code**.
3. Delete the starter code, paste the entire contents of `worker.js`,
   then **Save and deploy**.
4. **Bindings** (in the Worker's left menu) → **Add binding** →
   **Workers AI** → variable name `AI` → **Deploy** again.
   (Workers AI free tier: 10,000 neurons/day — plenty for a chat widget.)
5. (Optional, later) **Settings** → **Variables** → add
   `ALLOWED_ORIGINS` = `https://www.your-domain.com` when you buy a custom
   domain. `https://kshot3000.github.io` is always allowed.

## Option B — wrangler CLI

```bash
cd worker
npx wrangler login
npx wrangler deploy   # wrangler.toml already declares the AI binding
```

## Final step — point the site at it

1. Copy your Worker's public URL. It looks like:
   `https://gridironui-grid-chat.<your-subdomain>.workers.dev`
   (Workers & Pages → your worker → the URL is at the top.)
2. In the repo, open `js/ai-coach.js` and set:
   `var GRID_WORKER_URL = "https://gridironui-grid-chat.<your-subdomain>.workers.dev";`
3. Commit + push. The AI Coach page probes the Worker silently on load —
   once it answers, the status pill reads "⚡ Ready — answers instantly"
   and every visitor's first message gets an instant reply.

## How it behaves

- `GET /` → `{ok:true}` health check (also the site's silent probe — no AI spend).
- `POST /chat` with `{system, messages:[{role,content}]}` → `{reply}`.
- Guardrails: CORS locked to your site, 20 req/min per IP, 32 KB max body,
  empty messages rejected, model capped at ~800 tokens.
- If the Worker ever errors or is unreachable, the site falls through to
  on-device AI / Gemini key automatically — visitors never see a dead end.
