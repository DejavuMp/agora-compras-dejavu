/**
 * Preflight de Storage: lectura/autenticación de reglas activas y respaldo.
 * Nunca escribe a Firebase. Aborta si la versión en producción no corresponde
 * exactamente a la baseline respaldada o a la candidata aprobada.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
const bucket='agora-dejavu-38b8c.firebasestorage.app';
if(project!=='agora-dejavu-38b8c')throw Error('Proyecto Firebase no autorizado');
if(!token)throw Error('Credenciales de solo lectura no disponibles');
const path='projects/'+project+'/releases/firebase.storage/'+bucket;
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function fetchJson(name){
 const response=await fetch('https://firebaserules.googleapis.com/v1/'+name,{headers});
 if(!response.ok)throw Error('No se pudo verificar la regla activa de Storage (HTTP '+response.status+')');
 return response.json();
}
const release=await fetchJson(path);
if(!release?.rulesetName?.startsWith('projects/'+project+'/rulesets/')){
 throw Error('La publicación de Storage no expone un ruleset verificable');
}
const ruleset=await fetchJson(release.rulesetName);
const files=ruleset?.source?.files;
if(!Array.isArray(files)||files.length!==1||typeof files[0]?.content!=='string'){
 throw Error('El ruleset activo tiene archivos no previstos; abortar');
}
const live=files[0].content;
const folder='.github/firebase-staff/.preflight';
mkdirSync(folder,{recursive:true});
writeFileSync(folder+'/antes-storage.rules',live,'utf8');
writeFileSync(folder+'/storage-ruleset-name.txt',release.rulesetName+'\n','utf8');
const baseline=readFileSync('security/storage-before-reparaciones.rules','utf8');
const candidate=readFileSync('storage.rules','utf8');
const normalize=text=>String(text).replace(/\r\n?/g,'\n').trim();
if(![baseline,candidate].some(r=>normalize(r)===normalize(live))){
 throw Error('Las reglas de Storage en producción son distintas a la baseline respaldada. NO desplegar.');
}
console.log('Preflight Storage aprobado: baseline protegida y backup guardado.');
