/* Verifies the 7d-movement + 24h-volume rendering in the SHIPPED js files.
   Stubs the DOM, loads js/markets.js and js/predictions.js for real, feeds
   canned Polymarket-shaped data, and asserts on the rendered HTML. */
"use strict";
var fs = require("fs"), vm = require("vm"), path = require("path");
var ROOT = "/home/hatch/workspace/gridironui";

function makeEl(){
  return {
    innerHTML: "", textContent: "", style: {}, value: "",
    addEventListener: function(){}, querySelectorAll: function(){ return []; }
  };
}
var els = {};
function getEl(id){ if(!els[id]) els[id] = makeEl(); return els[id]; }

/* canned Polymarket data, shaped like the real gamma responses */
var mkML = {
  id: 3664737, question: "Ravens vs. Cowboys", sportsMarketType: "moneyline",
  outcomes: '["Ravens","Cowboys"]', outcomePrices: '["0.615","0.385"]',
  volume: "268256.52", volume24hr: "112658.80", oneWeekPriceChange: "0.015",
  bestBid: "0.61", bestAsk: "0.62", closed: false, active: true
};
var mkMLNoChg = Object.assign({}, mkML, {
  id: 3664738, question: "Lions vs. Packers", volume24hr: undefined,
  oneWeekPriceChange: undefined, outcomePrices: '["0.55","0.45"]'
});
var mkSpread = {
  id: 3701423, question: "Spread: Ravens (-1.5)", sportsMarketType: "spreads",
  outcomes: '["Ravens","Cowboys"]', outcomePrices: '["0.595","0.405"]',
  volume: "946", volume24hr: undefined, oneWeekPriceChange: "-0.065",
  bestBid: "0.59", bestAsk: "0.60", closed: false, active: true
};
var ev1 = { title: "Ravens vs. Cowboys", slug: "ravens-vs-cowboys", startTime: "2026-10-04T17:00:00Z", markets: [mkML, mkSpread] };
var ev2 = { title: "Lions vs. Packers", slug: "lions-vs-packers", startTime: "2026-10-05T17:00:00Z", markets: [mkMLNoChg] };

var fetchStub = function(url){
  if(url.indexOf("/sports") >= 0) return Promise.resolve([{sport:"nfl", series:"12185"}]);
  if(url.indexOf("series_id") >= 0) return Promise.resolve([ev1, ev2]);
  return Promise.reject(new Error("unexpected url "+url));
};

var sandbox = {
  console: console,
  document: { getElementById: getEl },
  localStorage: { getItem: function(){return null;}, setItem: function(){}, removeItem: function(){} },
  window: {},
  GIU: {
    fetchJSON: fetchStub,
    esc: function(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); },
    failBox: function(m){ return '<div class="fail">'+m+"</div>"; }
  }
};
sandbox.window.GIU = sandbox.GIU;
vm.createContext(sandbox);

["js/markets.js", "js/predictions.js"].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, {filename: f});
});

var fails = [];
function check(name, cond){ console.log((cond?"PASS":"FAIL")+" - "+name); if(!cond) fails.push(name); }

setTimeout(function(){
  var mhtml = els["marketGrid"].innerHTML;
  check("markets: 7d chip on moneyline (▲ +1.5¢)", mhtml.indexOf("▲ +1.5¢") >= 0 && mhtml.indexOf('class="mv-up"') >= 0);
  check("markets: 7d chip on spread (▼ −6.5¢)", mhtml.indexOf("▼ −6.5¢") >= 0 && mhtml.indexOf('class="mv-dn"') >= 0);
  check("markets: 24h vol shown when present", mhtml.indexOf("24h vol $113K") >= 0 && mhtml.indexOf("all-time $268K") >= 0);
  check("markets: fallback 'Volume' when no 24h vol", mhtml.indexOf("Volume $1K") >= 0 || mhtml.indexOf("Volume $946") >= 0);
  check("markets: no 7d chip when field missing (Lions card)", (function(){
    var i = mhtml.indexOf("Lions vs. Packers"); if(i<0) return false;
    var seg = mhtml.slice(i, i+2500); return seg.indexOf("7d") < 0;
  })());
  check("markets: book line intact", mhtml.indexOf("book") >= 0 && mhtml.indexOf("tight book") >= 0);
  check("markets: Polymarket trade link intact", mhtml.indexOf("polymarket.com/event/ravens-vs-cowboys") >= 0);

  var phtml = els["predGrid"].innerHTML;
  check("predictions: 7d chip next to first outcome (Ravens 62%)", phtml.indexOf("62%") >= 0 && phtml.indexOf("▲ +1.5¢") >= 0);
  check("predictions: no chip when field missing", (function(){
    var i = phtml.indexOf("Lions vs. Packers"); if(i<0) return false;
    var seg = phtml.slice(i, i+1500); return seg.indexOf("7d") < 0;
  })());
  check("predictions: honest source label intact", phtml.indexOf("Source: Polymarket live price") >= 0);

  if(fails.length){ console.log("\n"+fails.length+" FAILURES"); process.exit(1); }
  console.log("\nALL MOVEMENT TESTS PASSED");
}, 300);
