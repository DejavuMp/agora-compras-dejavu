import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
const candidate=readFileSync('storage.rules','utf8');
const baseline=readFileSync('security/storage-before-reparaciones.rules','utf8');
const dir='.github/firebase-staff/.preflight';
const release='projects/agora-dejavu-38b8c/releases/firebase.storage/agora-dejavu-38b8c.firebasestorage.app';
const rulesetName='projects/agora-dejavu-38b8c/rulesets/test-storage-baseline';
process.env.FIREBASE_PROJECT_ID='agora-dejavu-38b8c';
process.env.FIREBASE_ACCESS_TOKEN='fake-test-token';
const savedFetch=globalThis.fetch;
let counter=0;
async function verify(name,active,allowed){
 counter++;
 globalThis.fetch=async url=>{
  assert.ok(String(url).startsWith('https://firebaserules.googleapis.com/v1/'));
  if(String(url).endsWith(release))return {ok:true,json:async()=>({rulesetName})};
  if(String(url).endsWith(rulesetName))return {ok:true,json:async()=>({source:{files:[{name:'storage.rules',content:active}]}})};
  throw Error('Unexpected Rules API route');
 };
 let failure;
 try{await import('./safe-storage-preflight.mjs?test='+counter);}
 catch(e){failure=e;}
 assert.equal(Boolean(failure),!allowed,name);
 if(!allowed)assert.match(failure.message,/Storage en producción son distintas/);
 assert.equal(readFileSync(dir+'/antes-storage.rules','utf8'),active);
 assert.equal(readFileSync(dir+'/storage-ruleset-name.txt','utf8'),rulesetName+'\n');
 console.log('OK '+name);
}
try{
 await verify('baseline previa de Storage',baseline,true);
 await verify('reglas nuevas ya publicadas',candidate,true);
 await verify('deriva no autorizada',baseline.replace('allow read: if canEdit();','allow read: if true;'),false);
}finally{globalThis.fetch=savedFetch;rmSync(dir,{recursive:true,force:true});}
