/**
 * Diagnóstico de Firebase Storage SIN escrituras ni cambios en reglas.
 * Lista únicamente rutas/versiones visibles y códigos HTTP; no publica datos.
 */
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
if(project!=='agora-dejavu-38b8c'||!token)throw Error('Proyecto/credencial no autorizado');
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function check(label,url){
 try{
  const response=await fetch(url,{headers});
  const status=response.status;
  let payload={};
  if(response.ok)payload=await response.json();
  const info={test:label,httpStatus:status};
  if(label==='storage-releases'&&response.ok){
   info.releases=(payload.releases||[]).map(r=>r.name||'').filter(n=>
     n.startsWith('projects/'+project+'/releases/firebase.storage/'));
  }
  if(label.startsWith('bucket-metadata')&&response.ok)info.bucketName=payload.name;
  console.log(JSON.stringify(info));
  return info;
 }catch(e){
  console.log(JSON.stringify({test:label,errorType:'connection-failed'}));return null;
 }
}
await check('storage-releases','https://firebaserules.googleapis.com/v1/projects/'+project+'/releases?pageSize=100');
await check('bucket-metadata-primary','https://storage.googleapis.com/storage/v1/b/'+project+'.firebasestorage.app?fields=name,metageneration');
await check('bucket-metadata-legacy','https://storage.googleapis.com/storage/v1/b/'+project+'.appspot.com?fields=name,metageneration');
console.log('Diagnóstico de lectura completado; no se escribió ningún recurso.');
