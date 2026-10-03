/* Local references, duplicate IDs, release assets and JavaScript syntax. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let issues=[],pages=0,refs=0;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!['.git','node_modules'].includes(e.name)).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(root)){
 if(file.endsWith('.html')){
  pages++;const html=fs.readFileSync(file,'utf8'),seen=new Set();
  for(const m of html.replace(/<script\b[\s\S]*?<\/script>/gi,'').matchAll(/\sid="([^"]+)"/g)){if(seen.has(m[1]))issues.push(`${path.relative(root,file)}: duplicate ID ${m[1]}`);seen.add(m[1]);}
  for(const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)){
   const ref=m[1];if(/^(?:https?:|mailto:|tel:|data:|#|\/\/)/.test(ref)||ref.includes("'+")||ref.includes('{{'))continue;
   const target=ref.split(/[?#]/)[0];if(!target)continue;refs++;
   if(!fs.existsSync(path.resolve(path.dirname(file),target)))issues.push(`${path.relative(root,file)}: missing ${target}`);
  }
  for(const expected of ['css/upgrade.css?v=2.0.0','js/upgrade.js?v=2.0.0','js/site.js?v=2.0.0'])if(!html.includes(expected))issues.push(`${file}: missing release asset ${expected}`);
 }
 if(file.endsWith('.js')&&!file.includes(path.sep+'tests'+path.sep)&&!file.includes(path.sep+'worker'+path.sep)){
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)issues.push(r.stderr);
 }
}
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log(`${pages} HTML pages, ${refs} local references and browser script syntax checked.`);
