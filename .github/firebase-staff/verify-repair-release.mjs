/**
 * Verificación posterior al despliegue, SIN escrituras. Comprueba las fuentes
 * activas de Firestore y Storage contra las versiones revisadas en GitHub.
 */
import {readFileSync} from 'node:fs';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
if(project!=='agora-dejavu-38b8c'||!token)throw Error('La verificación exige acceso al proyecto autorizado');
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function remote(name){
 const r=await fetch('https://firebaserules.googleapis.com/v1/'+name,{headers});
 if(!r.ok)throw Error('No se puede confirmar la publicación ('+r.status+')');
 return r.json();
}
const normalized=s=>String(s).replace(/\r\n?/g,'\n').trim();
for(const item of [
 {service:'cloud.firestore',file:'firestore.rules'},
 {service:'firebase.storage/agora-dejavu-38b8c.firebasestorage.app',file:'storage.rules'}
]){
 const release=await remote('projects/'+project+'/releases/'+item.service);
 const ruleSet=await remote(release.rulesetName);
 const files=ruleSet.source?.files;
 if(files?.length!==1||typeof files[0].content!=='string')throw Error('Reglas publicadas no verificables para '+item.service);
 const local=readFileSync(item.file,'utf8');
 if(normalized(files[0].content)!==normalized(local))throw Error('VERIFICACIÓN FALLIDA: '+item.service+' difiere del repositorio');
 console.log('Reglas publicadas verificadas: '+item.service);
}
