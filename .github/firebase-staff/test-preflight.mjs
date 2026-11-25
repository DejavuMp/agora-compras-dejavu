/** Preflight simulado: nunca consulta ni escribe Firebase real. */
import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/dejavu-staff-firebase-rules.yml','utf8');
assert.match(workflow,/name: respaldo-reglas-agora-antes-dejavu-staff[\s\S]*?include-hidden-files: true[\s\S]*?if-no-files-found: error/,'El respaldo real es obligatorio');
const candidate=readFileSync('firestore.rules','utf8');
const claimMarker='    // Autorregistros laborales privados.';
const endMarker='    // Todas las demás colecciones permanecen cerradas.';
assert.equal(candidate.split(claimMarker).length,2,'El bloque laboral aparece una vez');
assert.equal(candidate.split(endMarker).length,2,'El cierre general aparece una vez');
const claimAt=candidate.indexOf(claimMarker),endAt=candidate.indexOf(endMarker,claimAt);
assert.ok(endAt>claimAt,'El bloque laboral está aislado antes del cierre');
const withoutClaims=candidate.slice(0,claimAt)+candidate.slice(endAt);
const optionalExitGeo="           request.resource.data.keys().hasAll(['endNote','endedAt']) &&\n           (!request.resource.data.keys().hasAny(['endGeo']) ||\n             shiftGeoValid(request.resource.data.endGeo)) &&";
const strictExitGeo="           request.resource.data.keys().hasAll(['endGeo','endNote','endedAt']) &&\n           shiftGeoValid(request.resource.data.endGeo) &&";
assert.equal(withoutClaims.split(optionalExitGeo).length,2,'La excepción GPS aparece una vez');
const baseline=withoutClaims.replace(optionalExitGeo,strictExitGeo);
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
try{await verify('base real + cambios delimitados',baseline,true);await verify('candidato ya desplegado',candidate,true);await verify('deriva ajena rechazada',drift,false);await verify('GPS solo, sin autorregistro, rechazado',withoutClaims,false);}finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
