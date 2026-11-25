/** Simulates the production-rules preflight; never calls Firebase. */
import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/dejavu-staff-firebase-rules.yml','utf8');
assert.match(workflow,/name: respaldo-reglas-agora-antes-dejavu-staff[\s\S]*?include-hidden-files: true[\s\S]*?if-no-files-found: error/,'El respaldo real es obligatorio');
const candidate=readFileSync('firestore.rules','utf8');
const baseline=readFileSync('.github/firebase-staff/production-before-supervisor-attendance.rules','utf8');
const clockDeny='      // La asistencia nueva la registra coordinación mediante hojas delegadas de asistencia.\n      // Los marcajes legados siguen siendo consultables, pero ya no se escriben desde la cuenta Staff.\n      allow create, update: if false;\n';
const breakDeny='      // Descansos oficiales también se registran por el responsable en el flujo delegado.\n      allow create, update: if false;\n';
function replaceActions(source,sectionStart,sectionEnd,replacement){
  const a=source.indexOf(sectionStart),b=source.indexOf(sectionEnd,a);
  assert.ok(a>=0&&b>a&&source.indexOf(sectionStart,a+1)<0,'sección única '+sectionStart);
  const begin=source.indexOf('      allow create:',a),finish=source.indexOf('      allow delete: if false;',begin);
  assert.ok(begin>=0&&finish>=begin&&finish<b,'acciones limitadas a la regla');
  return source.slice(0,begin)+replacement+source.slice(finish);
}
let expected=replaceActions(baseline,'    match /agora_ops_clock/{id} {','    // Descansos certificados:',clockDeny);
expected=replaceActions(expected,'    match /agora_ops_breaks/{id} {','    match /agora_ops_trips/{id} {',breakDeny);
assert.equal(candidate.trim(),expected.trim(),'candidato contiene únicamente el cambio de asistencia aprobado');
const drift=baseline.replace('allow read, write: if false;','allow read, write: if true;');
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
try{await verify('producción exacta, base aprobada',baseline,true);await verify('candidato ya desplegado',candidate,true);await verify('deriva ajena rechazada',drift,false);}finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
