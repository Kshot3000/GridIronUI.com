/* GridIronUI teaser DOM wiring test — loads the shipped js/tools.js with a
   stubbed DOM and exercises the teaser calculator: leg rows, teased lines,
   Wong/dead verdicts, push-risk flags, empty note, bad-input errors, escaping.
   Run: node tests/test-teaser-dom.js */
"use strict";
const fs = require("fs");
const vm = require("vm");

function makeEl(id){
  const cls = new Set();
  const attrs = {};
  const handlers = {};
  const kids = [];
  return {
    id, attrs, handlers, kids, textContent: "", innerHTML: "", value: "",
    checked: false, style: {}, className: "",
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, force) => { const v = force !== undefined ? force : !cls.has(c); v ? cls.add(c) : cls.delete(c); return v; },
      contains: c => cls.has(c),
    },
    setAttribute: (k,v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k],
    addEventListener: (t,h) => { (handlers[t] = handlers[t] || []).push(h); },
    fire: function(t, ev){ (handlers[t] || []).forEach(h => h.call(this, ev || {})); },
    appendChild: function(c){ kids.push(c); return c; },
    querySelectorAll: () => [],
    closest: () => null,
  };
}
const els = {};
const sandbox = {
  document: {
    getElementById: id => (els[id] || (els[id] = makeEl(id))),
    createElement: tag => makeEl(tag),
    addEventListener: () => {},
  },
  GIU: {
    esc: s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),
  },
  setInterval: () => 0, clearInterval: () => {}, setTimeout, clearTimeout, console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/../js/betmath.js", "utf8"), sandbox, {filename:"betmath.js"});
vm.runInContext(fs.readFileSync(__dirname + "/../js/tools.js", "utf8"), sandbox, {filename:"tools.js"});

let pass = 0, fail = 0;
function ok(name, cond){ cond ? pass++ : (fail++, console.log("FAIL:", name)); }
const $ = id => sandbox.document.getElementById(id);

/* two Wong legs: Chiefs -7.5 fav, Bears +1.5 dog, 6 pts at -120, ties push */
$("tzName1").value = "Chiefs"; $("tzLeg1").value = "-7.5"; $("tzSide1").value = "spread|fav";
$("tzName2").value = "Bears";  $("tzLeg2").value = "+1.5"; $("tzSide2").value = "spread|dog";
$("tzPts").value = "6"; $("tzPrice").value = "-120"; $("tzPush").value = "push";
$("tzGo").fire("click");

const out = $("tzOut");
ok("tzOut shown", out.style.display === "block");
ok("names rendered", out.innerHTML.includes("Chiefs") && out.innerHTML.includes("Bears"));
ok("teased lines shown", out.innerHTML.includes("-7.5 \u2192 -1.5") && out.innerHTML.includes("+1.5 \u2192 +7.5"));
ok("key numbers shown", out.innerHTML.includes("3, 4, 6, 7"));
ok("Wong badge", out.innerHTML.includes("WONG"));
ok("textbook Wong verdict", out.innerHTML.includes("Textbook Wong teaser"));
ok("breakeven per leg", out.innerHTML.includes("73.85%"));
ok("ties-push copy", out.innerHTML.includes("Ties push"));
ok("fine print present", out.innerHTML.includes("never turns -EV legs into +EV ones"));

/* dead leg: -3 fav teased to +3 crosses nothing, lands on 3 */
$("tzLeg1").value = "-3"; $("tzSide1").value = "spread|fav";
$("tzLeg2").value = "-3"; $("tzSide2").value = "spread|fav";
$("tzGo").fire("click");
ok("no-Wong verdict", $("tzOut").innerHTML.includes("No Wong legs"));
ok("dead-leg badge", $("tzOut").innerHTML.includes("no key numbers"));
ok("lands-on flag", $("tzOut").innerHTML.includes("lands on 3"));

/* ties-lose copy */
$("tzPush").value = "lose";
$("tzGo").fire("click");
ok("ties-lose copy", $("tzOut").innerHTML.includes("Ties lose"));

/* totals leg wiring */
$("tzLeg1").value = "47.5"; $("tzSide1").value = "total|over";
$("tzLeg2").value = "47.5"; $("tzSide2").value = "total|over";
$("tzPush").value = "push";
$("tzGo").fire("click");
ok("total teased down", $("tzOut").innerHTML.includes("47.5 \u2192 41.5"));
ok("totals verdict", $("tzOut").innerHTML.includes("Totals teaser"));

/* empty legs -> friendly note, not an error */
$("tzLeg1").value = ""; $("tzLeg2").value = "";
$("tzGo").fire("click");
ok("empty legs note", $("tzOut").innerHTML.includes("Add at least two legs"));

/* malformed price -> error, no crash */
$("tzLeg1").value = "-7.5"; $("tzSide1").value = "spread|fav";
$("tzLeg2").value = "+1.5"; $("tzSide2").value = "spread|dog";
$("tzPrice").value = "banana";
$("tzGo").fire("click");
ok("bad price error", $("tzOut").innerHTML.includes("American odds"));

/* malformed line -> error naming the line */
$("tzPrice").value = "-120";
$("tzLeg1").value = "banana";
$("tzGo").fire("click");
ok("bad line error", $("tzOut").innerHTML.includes("numeric line"));

/* names are escaped, not injected */
$("tzLeg1").value = "-7.5";
$("tzName1").value = "<img src=x onerror=alert(1)>";
$("tzGo").fire("click");
ok("name escaped", $("tzOut").innerHTML.includes("&lt;img") && !$("tzOut").innerHTML.includes("<img src=x"));

if(fail){ console.log(fail + " FAILURES"); process.exit(1); }
console.log("teaser DOM wiring: " + pass + " assertions passed");
