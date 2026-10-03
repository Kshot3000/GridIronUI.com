/* Run every existing regression suite without shell glob dependencies. */
'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const queue=fs.readdirSync(path.join(root,'tests')).filter(f=>/^test-.*\.js$/.test(f)).sort();
let passed=0,failed=0;
function run(file){return new Promise(resolve=>{
 const p=spawn(process.execPath,[path.join(root,'tests',file)],{cwd:root});let output='';
 p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);
 const timeout=setTimeout(()=>p.kill(),30000);
 p.on('error',e=>output+=e.message);
 p.on('close',code=>{clearTimeout(timeout);if(code===0){passed++;process.stdout.write('.');}else{failed++;console.error('\nFAIL '+file+'\n'+output);}resolve();});
});}
async function work(){while(queue.length)await run(queue.shift());}
Promise.all(Array.from({length:4},work)).then(()=>{console.log(`\n${passed} suites passed; ${failed} failed.`);process.exitCode=failed?1:0;});
