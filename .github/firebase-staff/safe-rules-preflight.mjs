/** Publishes only the reviewed ÁGORA finance rules over the verified attendance release. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
if(project!=='agora-dejavu-38b8c')throw Error('Proyecto Firebase distinto al autorizado');
if(!token)throw Error('No hay credencial temporal para consultar reglas vigentes');
const candidate=readFileSync('firestore.rules','utf8');
const previousBlob='31e1fc94ec19750528adf780295d5ba59ba4fd53';
const candidateBlob='ccb5e93353ec96f89f97fab9e05c9b12caab7ebb';
const gitBlob=text=>createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
const normalize=text=>String(text).replace(/\r\n?/g,'\n').trim();
if(gitBlob(candidate)!==candidateBlob)throw Error('El candidato no coincide con las reglas de Finanzas revisadas.');
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function getJson(path){
  const response=await fetch('https://firebaserules.googleapis.com/v1/'+path,{headers});
  if(!response.ok)throw Error('No se pudieron consultar reglas vigentes de Firebase (HTTP '+response.status+'). Se cancela sin publicar.');
  return response.json();
}
const release=await getJson('projects/'+project+'/releases/cloud.firestore');
if(!/^projects\/[a-zA-Z0-9._-]+\/rulesets\/[a-zA-Z0-9._-]+$/.test(release.rulesetName||''))throw Error('No se pudo identificar la versión actual de las reglas; despliegue cancelado');
const ruleSet=await getJson(release.rulesetName),files=ruleSet.source?.files;
if(!Array.isArray(files)||files.length!==1||typeof files[0]?.content!=='string')throw Error('Las reglas actuales no están en un solo archivo; no se reemplazan automáticamente');
const live=files[0].content;
if(process.argv.includes('--verify')){
  if(normalize(live)!==normalize(candidate))throw Error('Las reglas activas no coinciden con el candidato de Finanzas.');
  console.log('Firestore en producción coincide con el candidato publicado: '+release.rulesetName);
  process.exit(0);
}
const dir='.github/firebase-staff/.preflight';
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/antes-dejavu.rules',live,'utf8');writeFileSync(dir+'/ruleset-name.txt',release.rulesetName+'\n','utf8');
if(normalize(live)===normalize(candidate))console.log('Producción ya contiene exactamente las reglas aprobadas.');
else if(gitBlob(live)===previousBlob)console.log('Producción coincide con las reglas publicadas de Finanzas; se habilitan Mis trabajos y pagos.');
else throw Error('REGLAS DISTINTAS EN PRODUCCIÓN. Se guardó respaldo. Se detiene para NO sobrescribir permisos existentes.');
console.log('Verificación previa completada. Proyecto: '+project);
