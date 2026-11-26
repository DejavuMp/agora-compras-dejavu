/** Simulates the production-rules preflight; never calls Firebase. */
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/dejavu-staff-firebase-rules.yml','utf8');
assert.match(workflow,/name: respaldo-reglas-agora-antes-dejavu-staff[\s\S]*?include-hidden-files: true[\s\S]*?if-no-files-found: error/,'El respaldo real es obligatorio');
const candidate=readFileSync('firestore.rules','utf8');
const prior=execFileSync('git',['show','56817ade04fb81a1248a80f536cba5a8d94d8f0f:firestore.rules'],{encoding:'utf8'});
const operations='    // ÁGORA · Centro de Operaciones V4';
const mask=(source,start)=>{
 const first=source.indexOf(start),last=source.indexOf(operations,first);
 assert.ok(first>=0&&last>first,'Ubicar la sección de Finanzas');
 return source.slice(0,first)+source.slice(last);
};
assert.equal(mask(prior,'function financeHasHoursOrigin(data)'),mask(candidate,'function financeHasHoursOrigin(data)'),
 'La publicación solo modifica reglas de Finanzas');
const drift=prior+'\n// deriva ajena\n';
const dir='.github/firebase-staff/.preflight',rulesBackup=dir+'/antes-dejavu.rules',refBackup=dir+'/ruleset-name.txt';
process.env.FIREBASE_PROJECT_ID='agora-dejavu-38b8c';process.env.FIREBASE_ACCESS_TOKEN='qa-token-not-real';
const originalFetch=globalThis.fetch;let attempts=0;
async function verify(label,live,shouldPass){
 const rulesetName='projects/agora-dejavu-38b8c/rulesets/qa-preflight';
 globalThis.fetch=async url=>{const path=String(url);assert.ok(path.startsWith('https://firebaserules.googleapis.com/v1/'),'Solo Rules API');const response=path.endsWith('/releases/cloud.firestore')?{rulesetName}:path.endsWith('/rulesets/qa-preflight')?{source:{files:[{name:'firestore.rules',content:live}]}}:null;assert.ok(response,'Ruta API reconocida');return {ok:true,json:async()=>response};};
 attempts++;let thrown=null;try{await import('./safe-rules-preflight.mjs?fixture='+attempts)}catch(e){thrown=e}
 assert.equal(Boolean(thrown),!shouldPass,label+': resultado');if(!shouldPass)assert.match(thrown.message,/REGLAS DISTINTAS EN PRODUCCIÓN/,label+': deriva detenida');
 assert.equal(readFileSync(rulesBackup,'utf8'),live,label+': respaldo íntegro');assert.equal(readFileSync(refBackup,'utf8'),rulesetName+'\n',label+': ruleset guardado');console.log('OK '+label);
}
try{
 await verify('versión de Finanzas desplegada',prior,true);
 await verify('candidato ya desplegado',candidate,true);
 await verify('deriva ajena rechazada',drift,false);
}finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
