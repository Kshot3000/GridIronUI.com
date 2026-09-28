/* GridIronUI nav a11y test — loads the shipped js/site.js with a stubbed DOM and
   exercises the mobile menu: aria-expanded, link-tap close, Escape close. */
"use strict";
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../js/site.js", "utf8");

function makeEl(id){
  const cls = new Set();
  const handlers = {};
  const attrs = {};
  return {
    id,
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: c => { const had = cls.has(c); had ? cls.delete(c) : cls.add(c); return !had; },
      contains: c => cls.has(c),
    },
    attrs,
    handlers,
    textContent: "", innerHTML: "", outerHTML: "",
    hidden: true, title: "",
    setAttribute: (k,v) => { attrs[k] = v; },
    getAttribute: k => attrs[k],
    removeAttribute: k => { delete attrs[k]; },
    addEventListener: (t,h) => { handlers[t] = handlers[t] || []; handlers[t].push(h); },
    fire: (t, ev) => { (handlers[t] || []).forEach(h => h(ev || {})); },
    closest: () => null,
    focus: () => { focused = id; },
    style: {},
  };
}
let focused = null;
const els = {};
["site-header","site-footer","navToggle","mainNav","feedPill","feedTxt",
 "ticker","tickerTrack","headlines","hlText","copyBtc","btcAddr"].forEach(id => els[id] = makeEl(id));

const docHandlers = {};
const sandbox = {
  window: { GIU_BASE: ".", addEventListener: () => {}, matchMedia: () => ({ matches: true }) },
  document: {
    readyState: "complete",
    getElementById: id => els[id] || null,
    querySelector: () => null,
    createElement: () => makeEl("dyn"),
    addEventListener: (t,h) => { docHandlers[t] = docHandlers[t] || []; docHandlers[t].push(h); },
    body: { hasAttribute: () => false },
  },
  location: { pathname: "/GridIronUI.com/index.html" },
  navigator: {},
  fetch: () => Promise.reject(new Error("no network in tests")),
  setInterval, clearInterval, setTimeout, clearTimeout,
  focused: null,
};
sandbox.window.window = sandbox.window;
const vm = require("vm");
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "site.js" });

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }

const nav = els.mainNav, tog = els.navToggle;
// header markup carries a11y attrs
const headerSrc = src;
ok("toggle markup has aria-controls", headerSrc.indexOf('aria-controls="mainNav"') !== -1);
ok("toggle markup starts aria-expanded=false", headerSrc.indexOf('aria-expanded="false"') !== -1);

// open via toggle
tog.fire("click");
ok("menu opens on toggle", nav.classList.contains("open"));
ok("aria-expanded=true when open", tog.attrs["aria-expanded"] === "true");
// close via toggle
tog.fire("click");
ok("menu closes on second toggle", !nav.classList.contains("open"));
ok("aria-expanded=false when closed", tog.attrs["aria-expanded"] === "false");

// reopen, then close by tapping a link
tog.fire("click");
nav.fire("click", { target: { closest: sel => sel === "a" ? {} : null } });
ok("menu closes on nav link tap", !nav.classList.contains("open"));
ok("aria-expanded=false after link tap", tog.attrs["aria-expanded"] === "false");

// reopen, then close with Escape
tog.fire("click");
docHandlers.keydown.forEach(h => h({ key: "Escape" }));
ok("menu closes on Escape", !nav.classList.contains("open"));
ok("aria-expanded=false after Escape", tog.attrs["aria-expanded"] === "false");
ok("focus returns to toggle on Escape", focused === "navToggle");

// skip link + aria-current (v1.58.0): keyboard/screen-reader navigation polish
var injected = els["site-header"].outerHTML || "";
ok("skip link injected before header", injected.indexOf('class="skip-link"') !== -1);
ok("skip link targets #giu-main", injected.indexOf('href="#giu-main"') !== -1);
ok("skip link reads 'Skip to main content'", injected.indexOf(">Skip to main content</a>") !== -1);
ok("active nav link carries aria-current=page",
  /<a href="[^"]*index\.html"[^>]*aria-current="page"/.test(injected));
ok("exactly one nav link is aria-current", (injected.match(/aria-current="page"/g) || []).length === 1);
ok("skip-target tagging code tags first content block",
  headerSrc.indexOf('main.id = "giu-main"') !== -1 && headerSrc.indexOf('tabindex","-1"') !== -1);
// skip-link styles exist and reveal on focus
var cssSrc = fs.readFileSync(__dirname + "/../css/style.css", "utf8");
ok("skip-link CSS hides off-screen until focused",
  /\.skip-link\{[^}]*top:-70px/.test(cssSrc));
ok("skip-link CSS reveals at top:0 on focus",
  /\.skip-link:focus[^{]*\{[^}]*top:0/.test(cssSrc));
ok("skip-link sits above the sticky header (z-index 400 > 60)",
  /\.skip-link\{[^}]*z-index:400/.test(cssSrc));
ok("skip-link honors reduced-motion", /prefers-reduced-motion[^}]*\.skip-link/.test(cssSrc));

console.log(`nav-a11y: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
