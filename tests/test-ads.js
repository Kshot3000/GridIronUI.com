/* GridIronUI display-ad + referral test — loads the shipped js/site.js with a
   stubbed DOM and exercises the v1.29.0 advertising machinery, plus static
   file checks:
   - ads.txt carries the exact AdSense authorized-sellers line;
   - every HTML page carries the AdSense library script tag in <head>;
   - no placeholder/example ad IDs anywhere;
   - CSS carries the .ad-slot "Advertisement" label + .ref-card rules;
   - slot markup exists on the right pages with the right slot names;
   - GIU.CONFIG holds Kyle's real publisher ID, the three real AdSense ad-unit
     slot IDs, and exact referral URLs;
   - ad slots render live <ins> tags while client + slot IDs are configured,
     and are removed from the DOM when the client is empty;
   - a configured ad-unit slot renders a live <ins> with client + slot ID;
   - referral slots render Partner cards (sponsored rel, _blank, 21+ affiliate
     note) and are removed when their link is empty;
   - initAds/initReferrals are called on page boot (mount). */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "..");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

/* ---------------- static file checks ---------------- */
var ADS_LINE = "google.com, pub-3316742664595468, DIRECT, f08c47fec0942fa0";
var ads = fs.readFileSync(path.join(ROOT, "ads.txt"), "utf8");
assert(ads.indexOf(ADS_LINE) !== -1, "ads.txt carries the exact AdSense authorized-sellers line");
assert(ads.indexOf("GridIronUI") !== -1, "ads.txt header names GridIronUI");

var HEAD_TAG = 'src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3316742664595468"';
function htmlFiles(dir){
  var out = [];
  fs.readdirSync(dir).forEach(function(f){
    if(f === "node_modules" || f[0] === ".") return;
    var p = path.join(dir, f), st = fs.statSync(p);
    if(st.isDirectory()) out = out.concat(htmlFiles(p));
    else if(/\.html$/.test(f)) out.push(p);
  });
  return out;
}
var pages = htmlFiles(ROOT);
assert(pages.length >= 20, pages.length + " HTML pages scanned");
var missing = pages.filter(function(p){ return fs.readFileSync(p, "utf8").indexOf(HEAD_TAG) === -1; });
assert(missing.length === 0, "AdSense head script tag present on all pages" +
       (missing.length ? " — MISSING: " + missing.map(function(p){return path.relative(ROOT,p);}).join(", ") : ""));

var BAD = [/ca-pub-XXXX/i, /ca-pub-0{4,}/, /your-publisher-id/i, /data-ad-slot="\d+"/];
["js/site.js","css/style.css","index.html","odds.html","news.html","markets.html","privacy.html"].forEach(function(rel){
  var src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  BAD.forEach(function(re){
    assert(!re.test(src), rel + " has no placeholder ad IDs (" + re + ")");
  });
  /* every publisher ID that appears must be Kyle's real one */
  var ids = src.match(/ca-pub-[0-9A-Za-z]+/g) || [];
  assert(ids.length === 0 || ids.every(function(id){ return id === "ca-pub-3316742664595468"; }),
         rel + ": every publisher ID present is Kyle's real one" +
         (ids.length && !ids.every(function(id){ return id === "ca-pub-3316742664595468"; })
           ? " — found: " + ids.join(", ") : ""));
});

var css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
assert(css.indexOf(".ad-slot.is-live::before") !== -1, "CSS: .ad-slot.is-live::before Advertisement label");
assert(/content:\s*"Advertisement"/.test(css), "CSS: the live-slot label reads Advertisement");
assert(css.indexOf(".ref-card") !== -1, "CSS: .ref-card rules");
assert(css.indexOf(".ref-badge") !== -1, "CSS: .ref-badge rules");
assert(/prefers-reduced-motion/.test(css), "CSS: reduced-motion guard present");

function pageHas(page, attr, name){
  return fs.readFileSync(path.join(ROOT, page), "utf8").indexOf('data-' + attr + '="' + name + '"') !== -1;
}
assert(pageHas("index.html", "ad-slot", "homeLeaderboard"), "homepage carries the homeLeaderboard ad slot");
assert(pageHas("news.html", "ad-slot", "newsInline"), "news page carries the newsInline ad slot");
assert(pageHas("odds.html", "ad-slot", "oddsInline"), "odds page carries the oddsInline ad slot");
assert(pageHas("markets.html", "ref-slot", "polymarket"), "markets page carries the Polymarket referral slot");
assert(pageHas("markets.html", "ref-slot", "kalshi"), "markets page carries the Kalshi referral slot");

/* ---------------- behavioral checks (real site.js in vm) ---------------- */
var src = fs.readFileSync(path.join(ROOT, "js/site.js"), "utf8");
assert(src.indexOf("window.GIU.initAds();") !== -1, "site.js calls GIU.initAds() on boot");
assert(src.indexOf("window.GIU.initReferrals();") !== -1, "site.js calls GIU.initReferrals() on boot");

function makeEl(tag, attrs){
  var children = [], cls = {};
  var el = {
    tagName: (tag || "div").toUpperCase(),
    children: children,
    attrs: attrs || {},
    removed: false,
    parentNode: null,
    style: {},
    textContent: "",
    innerHTML: "",
    href: "",
    classList: {
      add: function(c){ cls[c] = 1; },
      remove: function(c){ delete cls[c]; },
      contains: function(c){ return !!cls[c]; },
      toggle: function(c){ if(cls[c]) delete cls[c]; else cls[c] = 1; return !!cls[c]; }
    },
    setAttribute: function(k, v){ el.attrs[k] = String(v); },
    getAttribute: function(k){ return el.attrs.hasOwnProperty(k) ? el.attrs[k] : null; },
    removeAttribute: function(k){ delete el.attrs[k]; },
    appendChild: function(c){ children.push(c); c.parentNode = el; return c; },
    remove: function(){ el.removed = true; },
    addEventListener: function(){},
    querySelectorAll: function(){ return []; },
    closest: function(){ return null; }
  };
  return el;
}

var slotMode = "none"; /* mount() runs with no slots: early return, no interference */
var adSlots = [], refSlots = [], headScripts = [];
var sandbox = {
  window: {
    GIU_BASE: ".",
    GIU: {}, /* pre-seeded: mount() runs mid-script while readyState is "complete" */
    addEventListener: function(){},
    matchMedia: function(){ return { matches: true }; }
  },
  document: {
    readyState: "complete",
    getElementById: function(){ return null; },
    querySelector: function(){ return null; },
    querySelectorAll: function(sel){
      if(sel === "[data-ad-slot]" && slotMode === "ads") return adSlots;
      if(sel === "[data-ref-slot]" && slotMode === "refs") return refSlots;
      return [];
    },
    createElement: function(tag){ return makeEl(tag); },
    head: { appendChild: function(c){ headScripts.push(c); return c; } },
    body: { hasAttribute: function(){ return false; } },
    addEventListener: function(){}
  },
  location: { pathname: "/GridIronUI.com/index.html" },
  navigator: {},
  fetch: function(){ return Promise.reject(new Error("no network in tests")); },
  setInterval: setInterval, clearInterval: clearInterval,
  setTimeout: setTimeout, clearTimeout: clearTimeout
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "site.js" });

var GIU = sandbox.window.GIU;
assert(GIU && GIU.CONFIG, "GIU.CONFIG exists after boot");
assert(GIU.CONFIG.ads.client === "ca-pub-3316742664595468",
       "CONFIG.ads.client is Kyle's AdSense publisher ID");
assert(GIU.CONFIG.ads.slots.homeLeaderboard === "4554911928" &&
       GIU.CONFIG.ads.slots.newsInline === "9231775101" &&
       GIU.CONFIG.ads.slots.oddsInline === "1437045569",
       "all three ad-unit slot IDs are the real AdSense units (v1.41.0)");
assert(GIU.CONFIG.referrals.polymarket ===
         "https://polymarket.us/squad/join/vLoDh9A8ch54gJmkbqrE?referrer=fancyjaguar1280",
       "Polymarket referral URL is Kyle's exact squad link");
assert(GIU.CONFIG.referrals.kalshi === "https://kalshi.com/t/9g8izs5o",
       "Kalshi referral URL is Kyle's exact link");

/* ad slots: kept and rendered live while ad-unit IDs are configured (live state) */
slotMode = "ads";
var EXPECTED = { homeLeaderboard: "4554911928", newsInline: "9231775101", oddsInline: "1437045569" };
adSlots = ["homeLeaderboard","newsInline","oddsInline"].map(function(n){
  return makeEl("div", { "data-ad-slot": n });
});
GIU.initAds();
adSlots.forEach(function(el){
  var name = el.getAttribute("data-ad-slot");
  assert(!el.removed, name + " slot kept while its ad-unit ID is configured");
  assert(el.classList.contains("is-live"), name + " slot gets the is-live class");
  assert(el.children.length === 1 && el.children[0].tagName === "INS",
         name + " slot gets exactly one <ins>");
  assert(el.children[0].getAttribute("data-ad-slot") === EXPECTED[name],
         name + " ins carries the real ad-unit ID " + EXPECTED[name]);
  assert(el.children[0].getAttribute("data-ad-client") === "ca-pub-3316742664595468",
         name + " ins carries the publisher ID");
});

/* ad slots: removed when the publisher client is empty */
var savedClient = GIU.CONFIG.ads.client;
GIU.CONFIG.ads.client = "";
adSlots = [makeEl("div", { "data-ad-slot": "homeLeaderboard" })];
GIU.initAds();
assert(adSlots[0].removed, "ad slot removed when publisher client is empty");
GIU.CONFIG.ads.client = savedClient;

/* ad slots: a configured unit renders a live <ins> */
adSlots = [makeEl("div", { "data-ad-slot": "homeLeaderboard" })];
GIU.initAds();
var s = adSlots[0];
assert(!s.removed, "slot with an ad-unit ID is kept");
assert(s.classList.contains("is-live"), "live slot gets the is-live class");
assert(s.getAttribute("role") === "complementary" &&
       s.getAttribute("aria-label") === "Advertisement",
       "live slot carries complementary role + Advertisement label");
assert(s.children.length === 1 && s.children[0].tagName === "INS",
       "live slot gets exactly one <ins>");
var ins = s.children[0];
assert(ins.className === "adsbygoogle", "ins carries the adsbygoogle class");
assert(ins.getAttribute("data-ad-client") === "ca-pub-3316742664595468",
       "ins carries the publisher ID");
assert(ins.getAttribute("data-ad-slot") === "4554911928", "ins carries the ad-unit ID");
assert(ins.getAttribute("data-ad-format") === "auto" &&
       ins.getAttribute("data-full-width-responsive") === "true",
       "ins is responsive auto-format");

/* referrals: Partner cards render with compliant attrs */
slotMode = "refs";
refSlots = ["polymarket","kalshi"].map(function(k){
  return makeEl("div", { "data-ref-slot": k });
});
GIU.initReferrals();
refSlots.forEach(function(el, i){
  var key = ["polymarket","kalshi"][i];
  assert(!el.removed, key + " referral slot kept while link is configured");
  assert(el.classList.contains("ref-card"), key + " slot gets the ref-card class");
  assert(el.getAttribute("aria-label") === "Sponsored link: " + (key === "polymarket" ? "Polymarket" : "Kalshi"),
         key + " card has a sponsored aria-label");
  var a = el.children[0];
  assert(a && a.tagName === "A", key + " card renders a link");
  assert(a.href === GIU.CONFIG.referrals[key], key + " link href is the exact referral URL");
  assert(a.target === "_blank", key + " link opens in a new tab");
  assert(a.rel === "sponsored noopener nofollow", key + " link rel is sponsored noopener nofollow");
  var badge = a.children[0];
  assert(badge && badge.tagName === "SPAN" && badge.className === "ref-badge" &&
         badge.textContent === "Partner", key + " card shows the Partner badge");
  var sub = a.children[1] && a.children[1].children[1];
  assert(sub && /21\+/.test(sub.textContent), key + " card notes 21+");
  assert(sub && /affiliate link/.test(sub.textContent), key + " card discloses the affiliate link");
});

/* referrals: slots removed when their link is empty */
refSlots = [makeEl("div", { "data-ref-slot": "polymarket" })];
var savedPM = GIU.CONFIG.referrals.polymarket;
GIU.CONFIG.referrals.polymarket = "";
GIU.initReferrals();
assert(refSlots[0].removed, "referral slot removed when its link is empty");
GIU.CONFIG.referrals.polymarket = savedPM;

if(failures){ console.error(failures + " FAILURES"); process.exit(1); }
console.log("ALL ADS TESTS PASS");
