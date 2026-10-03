'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../js/site.js', 'utf8');
const helpers = source.slice(source.indexOf('window.GIU.fetchJSON = function'), source.indexOf('/* Polymarket game-event'));
function context(fetch) {
  const c = {window:{GIU:{}},fetch,AbortController,URL,Promise,setTimeout,clearTimeout};
  vm.runInNewContext(helpers,c);return c.window.GIU;
}
(async()=>{
  let signal;
  const stalled=context((u,o)=>{signal=o.signal;return new Promise(()=>{});});
  await assert.rejects(stalled.fetchJSON('https://example.com',15),/timeout/);
  assert(signal.aborted,'A timeout must abort its network request');
  const slowBody=context(()=>Promise.resolve({ok:true,json:()=>new Promise(()=>{})}));
  await assert.rejects(slowBody.fetchJSON('https://example.com',15),/timeout/);
  const good=context(()=>Promise.resolve({ok:true,json:()=>Promise.resolve({score:7})}));
  assert.equal((await good.fetchJSON('https://example.com')).score,7);
  const bad=context(()=>Promise.resolve({ok:false,status:429}));
  await assert.rejects(bad.fetchJSON('https://example.com'),/HTTP 429/);
  const rejected=context(()=>Promise.reject(new Error('offline')));
  await assert.rejects(rejected.fetchJSON('https://example.com'),/offline/);
  assert.equal(good.safeURL('javascript:alert(1)'), '');
  assert.equal(good.safeURL('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(good.safeURL(undefined), '');
  assert.equal(good.safeURL('https://espn.com/story?id=1'), 'https://espn.com/story?id=1');
  console.log('Network: actual abort, JSON-body timeout, errors and safe URL checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
