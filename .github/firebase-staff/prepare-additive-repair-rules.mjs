/** Activación NO destructiva: solo insertar el bloque reparaciones sobre la
 * copia exacta de las reglas activas. Todo se limita al runner de GitHub Actions.
 * La huella vieja/candidata se verificó contra el respaldo de la auditoría.
 */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
if(project!=='agora-dejavu-38b8c'||!token)throw Error('Proyecto/credencial de Firebase desconocidos');
const src=readFileSync('firestore.rules','utf8');
const liveSha='99e2bd8de21c8a67c4cd4afe3e30cc235fd3eee52f15187544da0cd6a4a5f994';
const srcSha='9c23bee64e225f7212348cdd0c889168a0ab5b695e708d9750234cd148484204';
const hash=v=>createHash('sha256').update(v,'utf8').digest('hex');
if(hash(src)!==srcSha)throw Error('Se modificaron las reglas del repositorio: nueva auditoría obligatoria');
const marker='    // ÁGORA · Inventario, mantenimiento y reparaciones.';
const close='    // Todas las demás colecciones permanecen cerradas.';
const begin=src.indexOf(marker),end=src.indexOf(close,begin);
if(begin<0||end<=begin||src.indexOf(marker,begin+1)!==-1)throw Error('No se encontró un bloque reparaciones único');
const fragment=src.slice(begin,end);
if(!fragment.includes('match /agora_repair_requests/{id}')||
   !fragment.includes('match /agora_repair_invites/{token}')||
   !fragment.includes('match /agora_repair_assets/{assetId}')||
   !fragment.includes('match /agora_repair_events/{eventId}')){
 throw Error('Faltan reglas esperadas del módulo');
}
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function getJson(path){
 const r=await fetch('https://firebaserules.googleapis.com/v1/'+path,{headers});
 if(!r.ok)throw Error('No se pudo consultar reglas reales ('+r.status+')');
 return r.json();
}
const rel=await getJson('projects/'+project+'/releases/cloud.firestore');
if(!rel.rulesetName?.startsWith('projects/'+project+'/rulesets/'))throw Error('Ruleset no reconocido');
const set=await getJson(rel.rulesetName);
const files=set?.source?.files;
if(files?.length!==1||typeof files[0].content!=='string')throw Error('No hay una fuente única verificable');
const live=files[0].content;
if(hash(live)!==liveSha)throw Error('Producción cambió desde la auditoría: abortar sin modificar reglas');
if(live.includes(marker)||live.includes('match /agora_repair_requests/'))throw Error('Existe otro módulo de reparaciones. Reconciliar manualmente');
if(live.split(close).length!==2)throw Error('El cierre general de producción no es único');
const merged=live.replace(close,fragment+close);
if(!merged.startsWith(live.slice(0,live.indexOf(close))) ||
   !merged.endsWith(live.slice(live.indexOf(close))))throw Error('Se alteraron reglas fuera del bloque añadido');
const folder='.github/firebase-staff/.preflight';
mkdirSync(folder,{recursive:true});
writeFileSync(folder+'/antes-dejavu.rules',live,'utf8');
writeFileSync(folder+'/ruleset-name.txt',rel.rulesetName+'\n','utf8');
writeFileSync(folder+'/antes-candidato-repositorio.rules',src,'utf8');
writeFileSync('firestore.rules',merged,'utf8');
if(process.env.GITHUB_ENV){
 appendFileSync(process.env.GITHUB_ENV,'AGORA_REPAIR_ADDITIVE_ONLY=yes\n');
 appendFileSync(process.env.GITHUB_ENV,'AGORA_REPAIR_SOURCE_DIGEST='+srcSha+'\n');
 appendFileSync(process.env.GITHUB_ENV,'AGORA_REPAIR_MERGED_HASH='+hash(merged)+'\n');
}
console.log('Reglas de Reparaciones agregadas a una copia verificada de producción, conservando literalmente el resto.');
console.log('Este paso solo prepara el candidato en el runner, NO modifica Firebase.');
