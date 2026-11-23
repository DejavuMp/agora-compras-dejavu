import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
process.env.FIREBASE_PROJECT_ID='agora-dejavu-38b8c';
process.env.FIREBASE_ACCESS_TOKEN='mock-only';
const folder='.github/firebase-staff/.preflight';
const oldFetch=globalThis.fetch,oldArgs=[...process.argv];
let current={name:'agora-dejavu-38b8c.firebasestorage.app',metageneration:'11',
 cors:[{origin:['https://otra-herramienta.example'],method:['GET'],maxAgeSeconds:1800}]};
let writes=0,id=0;
globalThis.fetch=async (url,options={})=>{
 assert.ok(String(url).startsWith('https://storage.googleapis.com/storage/v1/b/agora-dejavu-38b8c.firebasestorage.app'));
 if(options.method==='PATCH'){
  assert.ok(String(url).includes('ifMetagenerationMatch=11'));
  writes++;
  const body=JSON.parse(options.body);
  assert.deepEqual(body.cors[0],current.cors[0],'CORS existente conservado');
  current={...current,metageneration:'12',cors:body.cors};
  return {ok:true,json:async()=>current};
 }
 return {ok:true,json:async()=>current};
};
async function run(apply=false){
 process.argv=apply?[...oldArgs,'--apply']:[...oldArgs];
 await import('./safe-bucket-cors.mjs?case='+ ++id);
}
try{
 await run(false);
 const backup=JSON.parse(readFileSync(folder+'/antes-cors.json','utf8'));
 assert.equal(backup.metageneration,'11');
 assert.deepEqual(backup.cors,current.cors);
 assert.equal(writes,0,'El preflight no debe modificar el bucket');
 await run(true);
 assert.equal(writes,1,'Se agregó origen permitido una sola vez');
 assert.equal(current.cors.length,2);
 assert.ok(current.cors[1].origin.includes('https://dejavump.github.io'));
 await run(false);await run(true);
 assert.equal(writes,1,'Operación idempotente');
 console.log('CORS: respaldo, condición de versión, preservación e idempotencia OK');
}finally{globalThis.fetch=oldFetch;process.argv=oldArgs;rmSync(folder,{recursive:true,force:true});}
