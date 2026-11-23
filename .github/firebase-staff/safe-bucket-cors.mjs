/**
 * CORS del bucket de imágenes: añade exclusivamente el origen ÁGORA GitHub Pages.
 * Siempre respalda configuración original y usa ifMetagenerationMatch para no
 * sobrescribir cambios ajenos. Preflight sin escrituras salvo con --apply.
 */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const token=process.env.FIREBASE_ACCESS_TOKEN,project=process.env.FIREBASE_PROJECT_ID;
if(project!=='agora-dejavu-38b8c'||!token)throw Error('Bucket/proyecto no autorizado');
const bucket='agora-dejavu-38b8c.firebasestorage.app';
const endpoint='https://storage.googleapis.com/storage/v1/b/'+bucket;
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function request(url,options={}){
 const response=await fetch(url,{headers,...options});
 if(!response.ok)throw Error('No se pudo consultar/configurar CORS de Storage (HTTP '+response.status+')');
 return response.json();
}
const current=await request(endpoint+'?fields=name,metageneration,cors');
if(current.name!==bucket||!current.metageneration)throw Error('Bucket o metageneración no verificable');
const original=Array.isArray(current.cors)?current.cors:[];
const desiredOrigin='https://dejavump.github.io';
const already=original.some(rule=>
 (rule.origin||[]).some(v=>v===desiredOrigin||v==='*')&&
 (rule.method||[]).includes('GET'));
const expected=already?original:[...original,{origin:[desiredOrigin],method:['GET'],maxAgeSeconds:3600}];
const folder='.github/firebase-staff/.preflight';
const config=folder+'/antes-cors.json';
const requestedApply=process.argv.includes('--apply');
if(!requestedApply){
 mkdirSync(folder,{recursive:true});
 writeFileSync(config,JSON.stringify({bucket,metageneration:current.metageneration,cors:original},null,2)+'\n','utf8');
 console.log('CORS leído y respaldado. Compatible con navegador: '+(already?'sí':'debe añadirse una entrada'));
}else{
 const before=JSON.parse(readFileSync(config,'utf8'));
 if(before.bucket!==bucket||before.metageneration!==current.metageneration ||
    JSON.stringify(before.cors)!==JSON.stringify(original)){
   throw Error('CORS cambió entre el respaldo y el despliegue. Cancelado.');
 }
 if(!already){
  const patched=await request(endpoint+'?ifMetagenerationMatch='+encodeURIComponent(current.metageneration),{
   method:'PATCH',headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({cors:expected})
  });
  if(patched.name!==bucket)throw Error('No se confirmó el bucket al actualizar CORS');
 }
 const verified=await request(endpoint+'?fields=name,metageneration,cors');
 const allowed=(verified.cors||[]).some(rule=>(rule.origin||[]).some(v=>v===desiredOrigin||v==='*')&&(rule.method||[]).includes('GET'));
 if(!allowed)throw Error('El bucket no permite descarga autenticada desde ÁGORA.');
 console.log('CORS del bucket autorizado sin eliminar reglas anteriores.');
}
