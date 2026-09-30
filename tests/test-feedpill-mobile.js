/* GridIronUI feed-pill mobile test (v1.99.0).
   Regression guard for the mobile header-overflow bug: the feed-health pill
   in the sticky header rendered its full text ("ALL FEEDS LIVE" /
   "FEEDS DEGRADED (0/3)") with white-space:nowrap, pushing .header-inner
   ~38px past a 390px viewport. Fix: below 640px the pill collapses to a
   dot-only indicator; the live status stays on the tooltip and is mirrored
   to an aria-label (role=status, aria-live=polite) for screen readers. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
const css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
const site = fs.readFileSync(path.join(ROOT, "js", "site.js"), "utf8");

/* 1. mobile media query hides the pill text — extract the 640px block that
   mentions the pill by brace counting (there is more than one 640px block) */
function mediaBlock(cssSrc, query, mustContain){
  let from = 0;
  while(true){
    const i = cssSrc.indexOf(query, from);
    if(i < 0) return null;
    let d = 0, start = cssSrc.indexOf("{", i), end = -1;
    for(let j = start; j < cssSrc.length; j++){
      if(cssSrc[j] === "{") d++;
      else if(cssSrc[j] === "}"){ d--; if(d === 0){ end = j; break; } }
    }
    const block = cssSrc.slice(start, end + 1);
    if(!mustContain || block.indexOf(mustContain) !== -1) return block;
    from = end + 1;
  }
}
const block = mediaBlock(css, "@media(max-width:640px)", ".feed-pill");
ok("640px media block exists", !!block);
if(block){
  ok("dot-only rule: .feed-pill #feedTxt hidden at <=640px",
     /\.feed-pill\s+#feedTxt\s*\{\s*display\s*:\s*none/.test(block));
  ok("pill gap collapses when textless", /\.feed-pill\s*\{[^}]*gap\s*:\s*0/.test(block));
}

/* 2. pill keeps its full text on desktop (no global hide) */
const cssNoMedia = css.replace(/@media[^{]+\{([\s\S]*?)\}\s*(?=@media|$)/g, "");
ok("no desktop-wide #feedTxt hide", !/#feedTxt\s*\{\s*display\s*:\s*none/.test(cssNoMedia));

/* 3. header template carries accessible status semantics */
ok("pill has role=status", /id="feedPill"[^>]*role="status"/.test(site));
ok("pill has aria-live=polite", /id="feedPill"[^>]*aria-live="polite"/.test(site));
ok("pill has initial aria-label", /id="feedPill"[^>]*aria-label="Live data feed status: checking"/.test(site));
ok("feed dot is aria-hidden", /class="feed-dot"[^>]*aria-hidden="true"/.test(site));

/* 4. checkFeeds mirrors the live status into the aria-label */
ok("checkFeeds sets aria-label from status text",
   /pill\.setAttribute\("aria-label",\s*"Live data feed status: "\s*\+\s*txt\.textContent\)/.test(site));

/* 5. every shipped page carries the current keys (style.css 1.70.0, site.js 1.99.0 —
   bumped when the tab-list accessibility enhancement landed in site.js) */
function htmlFiles(dir, out){
  out = out || [];
  fs.readdirSync(dir).forEach(function(f){
    if(f === ".git" || f === "node_modules") return;
    const p = path.join(dir, f), st = fs.statSync(p);
    if(st.isDirectory()) htmlFiles(p, out);
    else if(/\.html$/.test(f)) out.push(p);
  });
  return out;
}
let bad = [];
htmlFiles(ROOT).forEach(function(h){
  const src = fs.readFileSync(h, "utf8");
  const cssKeys = [...src.matchAll(/style\.css\?v=([0-9.]+)/g)].map(x => x[1]);
  const jsKeys = [...src.matchAll(/js\/site\.js\?v=([0-9.]+)/g)].map(x => x[1]);
  if(cssKeys.some(k => k !== "1.70.0")) bad.push(path.relative(ROOT, h) + " css=" + cssKeys.join(","));
  if(jsKeys.some(k => k !== "1.99.0")) bad.push(path.relative(ROOT, h) + " site.js=" + jsKeys.join(","));
});
ok("all pages pin style.css at 1.70.0 + site.js at 1.99.0", bad.length === 0, bad.slice(0, 5).join(" | "));

if(fails){ console.error(fails + " FAILURES"); process.exit(1); }
console.log("feed-pill mobile test green");
