/* GridIronUI DFS Lab — projected points per $1k ("value") readout.
   Verifies DFSOpt.value(): the pool table's Value column math, the zero /
   missing salary guard, and that value() is exported on both the node
   module and the browser window.DFSOpt surface. */
"use strict";
var OPT = require("../js/dfs-opt.js");
var failures = 0;
function assert(cond, msg){
  if(!cond){ failures++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

assert(typeof OPT.value === "function", "DFSOpt.value is exported");
assert(Math.abs(OPT.value({proj:14, salary:7000}) - 2.0) < 1e-9,
       "14 pts at $7k -> 2.00 pts/$1k");
assert(Math.abs(OPT.value({proj:22.5, salary:7800}) - 22.5/7.8) < 1e-9,
       "22.5 pts at $7.8k -> 2.885 pts/$1k");
assert(OPT.value({proj:10, salary:0}) === 0,
       "zero salary returns 0 instead of dividing by zero");
assert(OPT.value({proj:10}) === 0,
       "missing salary returns 0");
assert(OPT.value({salary:5000}) === 0,
       "missing projection counts as 0, not NaN");
assert(OPT.value(null) === 0, "null player returns 0");
/* ordering sanity: cheaper same-projection play must read higher */
assert(OPT.value({proj:14, salary:4500}) > OPT.value({proj:14, salary:7000}),
       "cheaper player with same projection has higher value");

/* browser surface: the same object the page uses */
var fs = require("fs"), vm = require("vm"), path = require("path");
var sb = { window: {}, console: console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/dfs-opt.js"), "utf8"),
                sb, {filename: "js/dfs-opt.js"});
assert(typeof sb.window.DFSOpt.value === "function",
       "window.DFSOpt.value exists in the browser build");
assert(Math.abs(sb.window.DFSOpt.value({proj:14, salary:4500}) - 14/4.5) < 1e-9,
       "browser build value() computes the same number");

if(failures){ console.error(failures + " FAILURE(S)"); process.exit(1); }
console.log("dfs-value: all green");
