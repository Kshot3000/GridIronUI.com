/* Node tests for the AI Coach provider chain (js/ai-coach-core.js),
   provider UI contract, nav link, and error rendering.
   Run: node tests/test-ai-coach-chain.js */
var fs = require("fs");
var path = require("path");
var C = require("../js/ai-coach-core.js");
var fails = 0;
var pending = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra||""); }
  else console.log("ok  ", name);
}
function asyncTest(name, fn){
  pending++;
  Promise.resolve().then(fn).then(
    function(){ ok(name, true); pending--; finish(); },
    function(e){ ok(name, false, String((e&&e.message)||e)); pending--; finish(); }
  );
}
function finish(){
  if(pending===0){
    console.log(fails ? ("\n"+fails+" FAILURES") : "\nALL PASS");
    process.exit(fails ? 1 : 0);
  }
}
function mkRun(text, failMsg){
  return function(){ return failMsg ? Promise.reject(new Error(failMsg)) : Promise.resolve(text); };
}

/* ---- provider chain: order + fallback ---- */
asyncTest("chain: first success wins, no fallback needed", function(){
  return C.runProviderChain([
    { id:"a", label:"A", run: mkRun("hello") },
    { id:"b", label:"B", run: mkRun("world") }
  ]).then(function(res){
    if(res.provider.id!=="a" || res.text!=="hello" || res.attempts.length!==0)
      throw new Error("wrong winner");
  });
});

asyncTest("chain: falls back on failure, records attempt", function(){
  var order = [];
  return C.runProviderChain([
    { id:"a", label:"Alpha", run: function(){ order.push("a"); return Promise.reject(new Error("boom1")); } },
    { id:"b", label:"Beta",  run: function(){ order.push("b"); return Promise.resolve("ok-text"); } }
  ]).then(function(res){
    if(order.join(",")!=="a,b") throw new Error("wrong order: "+order.join(","));
    if(res.provider.id!=="b" || res.text!=="ok-text") throw new Error("wrong winner");
    if(res.attempts.length!==1 || res.attempts[0].id!=="a" || res.attempts[0].error!=="boom1")
      throw new Error("attempts not recorded: "+JSON.stringify(res.attempts));
  });
});

asyncTest("chain: all fail → rejects with attempts", function(){
  return C.runProviderChain([
    { id:"a", label:"A", run: mkRun(null, "nope1") },
    { id:"b", label:"B", run: mkRun(null, "nope2") }
  ]).then(
    function(){ throw new Error("should have rejected"); },
    function(e){
      if(e.message!=="all_failed") throw new Error("wrong error: "+e.message);
      if(!e.attempts || e.attempts.length!==2) throw new Error("attempts missing");
    }
  );
});

asyncTest("chain: credits-text counts as failure, never an answer", function(){
  return C.runProviderChain([
    { id:"a", label:"A", run: mkRun("The account behind this API key doesn't have enough credits. Please top up or complete a quest") },
    { id:"b", label:"B", run: mkRun("real answer") }
  ]).then(function(res){
    if(res.provider.id!=="b") throw new Error("credits text was accepted as an answer");
    if(res.attempts.length!==1) throw new Error("credits failure not recorded");
  });
});

asyncTest("chain: onAttempt fires per provider tried", function(){
  var seen = [];
  return C.runProviderChain([
    { id:"a", label:"A", run: mkRun(null, "x") },
    { id:"b", label:"B", run: mkRun("y") }
  ], function(p){ seen.push(p.id); }).then(function(){
    if(seen.join(",")!=="a,b") throw new Error("onAttempt wrong: "+seen.join(","));
  });
});

/* ---- Gemini key path: only ever the Google endpoint ---- */
ok("gemini: url is Google-only",
  C.geminiUrl("K").indexOf("https://generativelanguage.googleapis.com/")===0);
ok("gemini: key travels as query param",
  C.geminiUrl("TESTKEY123").indexOf("key=TESTKEY123")!==-1);
ok("gemini: key is encoded",
  C.geminiUrl("a&b=c").indexOf("key=a%26b%3Dc")!==-1);
ok("gemini: host constant is Google", C.GEMINI_HOST==="https://generativelanguage.googleapis.com");

asyncTest("gemini: posts to Google endpoint only, key never in body", function(){
  var seenUrl = null, seenBody = null;
  function fakeFetch(url, opts){
    seenUrl = url; seenBody = opts.body;
    return Promise.resolve({
      ok: true,
      text: function(){
        return Promise.resolve(JSON.stringify({ candidates:[{ content:{ parts:[{ text:"hi there" }] } }] }));
      }
    });
  }
  return C.geminiGenerateText([{role:"system",content:"sys"},{role:"user",content:"hi"}],
                              "SECRETKEY", fakeFetch).then(function(t){
    if(t!=="hi there") throw new Error("bad text: "+t);
    if(seenUrl.indexOf("generativelanguage.googleapis.com")===-1)
      throw new Error("wrong host: "+seenUrl);
    if(seenBody.indexOf("SECRETKEY")!==-1)
      throw new Error("key leaked into request body");
    var b = JSON.parse(seenBody);
    if(!b.system_instruction || b.contents.length!==1 || b.contents[0].role!=="user")
      throw new Error("bad body shape");
  });
});

asyncTest("gemini: 400 surfaces as bad_key", function(){
  function fakeFetch(){
    return Promise.resolve({
      ok: false, status: 400,
      text: function(){ return Promise.resolve(JSON.stringify({ error:{ message:"API key not valid." } })); }
    });
  }
  return C.geminiGenerateText([{role:"user",content:"hi"}], "BAD", fakeFetch).then(
    function(){ throw new Error("should have rejected"); },
    function(e){ if(e.code!=="bad_key") throw new Error("wrong code: "+e.code); }
  );
});

/* ---- credits detection ---- */
ok("credits: detects the top-up message",
  C.isCreditsError("The account behind this API key doesn't have enough credits. Please top up or complete a quest"));
ok("credits: detects rate limit", C.isCreditsError("HTTP 429 rate_limited"));
ok("credits: normal reply not flagged", !C.isCreditsError("Here is your GPP lineup"));
ok("credits: empty safe", !C.isCreditsError(""));

/* ---- safe markdown-lite renderer ---- */
var r1 = C.renderRich("[top up](https://example.com/a?b=1)");
ok("rich: markdown link linkified",
  r1.indexOf('<a href="https://example.com/a?b=1"')!==-1 && r1.indexOf(">top up</a>")!==-1);
var r2 = C.renderRich("see https://example.com/x for details");
ok("rich: bare URL linkified", r2.indexOf('<a href="https://example.com/x"')!==-1);
ok("rich: bold rendered", C.renderRich("a **big** win").indexOf("<strong>big</strong>")!==-1);
ok("rich: code rendered", C.renderRich("use `kelly` now").indexOf("<code>kelly</code>")!==-1);
var r3 = C.renderRich('<script>alert(1)</script>');
ok("rich: script tag escaped", r3.indexOf("<script>")===-1 && r3.indexOf("&lt;script&gt;")!==-1);
var r4 = C.renderRich('[x](javascript:alert(1))');
ok("rich: javascript: scheme never linkified",
  r4.indexOf("javascript:alert")!==-1 && r4.indexOf("<a href")!==-1 ? false : r4.indexOf("<a")!==-1 ? false : true);
ok("rich: javascript: shown as inert text",
  C.renderRich('[x](javascript:alert(1))').indexOf("<a")!==-1 ? false : true);
var r5 = C.renderRich('<img src=x onerror=alert(1)>');
ok("rich: event-handler HTML escaped", r5.indexOf("onerror")!==-1 && r5.indexOf("<img")!==-1 ? false : true);

/* ---- directive parsing still works ---- */
var d = C.extractDirectives('ok\n```gridiron\n{"action":"build_lineup","mode":"gpp","num_lineups":2}\n```\ndone');
ok("directives: still parsed", d.length===1 && d[0].action==="build_lineup" && d[0].num_lineups===2);
ok("directives: json fence not executed",
  C.extractDirectives('```json\n{"action":"build_lineup"}\n```').length===0);

/* ---- provider chain: Nano primary, Gemini key fallback, no Pollinations ---- */
ok("chain: no pollinations models or mapping exported",
  C.modelId===undefined && C.POLLINATIONS_MODELS===undefined);
ok("chain: nano context builder exported",
  typeof C.buildNanoContext==="function" && typeof C.nanoSystemPrompt==="function");
ok("chain: lenient directive tools exported",
  typeof C.extractDirectivesLenient==="function" && typeof C.findMalformedDirectives==="function");

asyncTest("chain: error codes recorded (nano_download case)", function(){
  return C.runProviderChain([
    { id:"nano", label:"on-device AI",
      run: function(){ return Promise.reject({ code:"nano_download", message:"needs download" }); } },
    { id:"gemini-key", label:"your Gemini key", run: mkRun("gemini says hi") }
  ]).then(function(res){
    if(res.provider.id!=="gemini-key") throw new Error("gemini should win after nano_download");
    if(res.attempts.length!==1) throw new Error("attempts missing");
    if(res.attempts[0].code!=="nano_download") throw new Error("code not recorded: "+JSON.stringify(res.attempts[0]));
  });
});

/* ---- nav + links (read the shipped files) ---- */
var root = path.join(__dirname, "..");
var siteJs = fs.readFileSync(path.join(root, "js", "site.js"), "utf8");
ok("nav: AI Coach entry present in nav array",
  /"AI Coach"\s*,\s*"ai-coach\.html"/.test(siteJs));
ok("nav: AI Coach in footer link list",
  siteJs.indexOf('ai-coach.html')!==-1);

var coachHtml = fs.readFileSync(path.join(root, "ai-coach.html"), "utf8");
ok("html: back link points to dfs.html", coachHtml.indexOf('href="dfs.html"')!==-1);
ok("html: no dead model options",
  coachHtml.indexOf('value="mistral"')===-1 && coachHtml.indexOf('value="llama"')===-1 &&
  coachHtml.indexOf('value="deepseek"')===-1 && coachHtml.indexOf('id="modelSel"')===-1);
ok("html: nano download banner present",
  coachHtml.indexOf('id="nanoBanner"')!==-1 && coachHtml.indexOf('id="nanoDownloadBtn"')!==-1 &&
  coachHtml.indexOf("1.7 GB")!==-1);
ok("html: honest Gemini caption (free tier, data use)",
  coachHtml.indexOf("may use free-tier data")!==-1);
ok("html: provider status pill present", coachHtml.indexOf('id="providerStatus"')!==-1);
ok("html: gemini key UI present",
  coachHtml.indexOf('id="gemKey"')!==-1 && coachHtml.indexOf('id="gemSave"')!==-1 &&
  coachHtml.indexOf('id="gemClear"')!==-1);
ok("html: AI Studio link present", coachHtml.indexOf("aistudio.google.com/apikey")!==-1);

function htmlFiles(dir, out){
  fs.readdirSync(dir).forEach(function(f){
    var p = path.join(dir, f);
    var st = fs.statSync(p);
    if(st.isDirectory()){ if(f!=="node_modules" && f[0]!==".") htmlFiles(p, out); }
    else if(/\.html$/.test(f)) out.push(p);
  });
  return out;
}
var allHtml = htmlFiles(root, []);
var badLinks = allHtml.filter(function(p){
  return fs.readFileSync(p, "utf8").indexOf("dfs-lab.html")!==-1;
});
ok("links: no page references dfs-lab.html ("+allHtml.length+" html files scanned)",
  badLinks.length===0, badLinks.join(", "));

var coachJs = fs.readFileSync(path.join(root, "js", "ai-coach.js"), "utf8");
ok("js: no hardcoded API keys", !/sk-[A-Za-z0-9]{8,}/.test(coachJs));
ok("js: pollinations fully removed", coachJs.toLowerCase().indexOf("pollinations")===-1);
ok("js: nano provider first in chain",
  coachJs.indexOf('id:"nano"')!==-1 && coachJs.indexOf('id:"nano"') < coachJs.indexOf('id:"gemini-key"'));
ok("js: downloadprogress monitor wired",
  coachJs.indexOf("downloadprogress")!==-1 && coachJs.indexOf("LM.create(")!==-1);
ok("js: on-device badge text", coachJs.indexOf("Running 100% on your device")!==-1);
ok("js: gemini badge text", coachJs.indexOf("Answered by Gemini (your free key)")!==-1);
ok("js: chain uses CORE.runProviderChain", coachJs.indexOf("runProviderChain")!==-1);
ok("js: failures render via CORE.renderRich", coachJs.indexOf("CORE.renderRich")!==-1);
ok("js: provider status always updated", coachJs.indexOf("providerStatus(")!==-1);

/* footer branding untouched */
ok("footer: @kshot9000", siteJs.indexOf("x.com/kshot9000")!==-1);
ok("footer: Pearl address", siteJs.indexOf("prl1p62v09vuzyd8kdz9l23jaf3kph4wwx6jqcmhkkhg8lhr2qlxky8psu3zw9d")!==-1);
ok("footer: 21+", siteJs.indexOf("21+")!==-1);
ok("footer: 1-800-GAMBLER", siteJs.indexOf("1-800-GAMBLER")!==-1);

finish();
