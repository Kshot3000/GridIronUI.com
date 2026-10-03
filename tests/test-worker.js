'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
  const src=fs.readFileSync(__dirname+'/../worker/worker.js','utf8');
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default;
  let called=0;
  const env={AI:{run:async()=>{called++;return {response:'Hello from the test provider'};}}};
  function req(body,origin='https://gridironui.xyz'){return new Request('https://worker.example/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'test'},body:JSON.stringify(body)});}
  let r=await worker.fetch(req({messages:[{role:'user',content:'Hi'}]}),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://gridironui.xyz');assert.equal(r.headers.get('Vary'),'Origin');assert.equal(called,1);
  r=await worker.fetch(req({messages:[{role:'user',content:'Hi'}]},'https://not-allowed.example'),env);
  assert.equal(r.status,403);assert.equal(called,1);
  for(const body of [null,[],{}, {messages:[]}]){r=await worker.fetch(req(body),env);assert.equal(r.status,400);}
  r=await worker.fetch(req({messages:[{role:'user',content:'🙂'.repeat(9000)}]}),env);
  assert.equal(r.status,400,'UTF-8 bytes, not character count, enforce the body cap');
  console.log('Worker: production-domain CORS, rejected origins, null bodies and UTF-8 size checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
