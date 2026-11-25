/**
 * Verificación estricta antes de habilitar autorregistros laborales en Firestore.
 * Conserva una copia de las reglas activas y sólo admite añadir el bloque
 * agora_ops_work_claims cuando todo el resto coincide exactamente.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
const expectedProject='agora-dejavu-38b8c';
if(project!==expectedProject)throw Error('Proyecto Firebase distinto al autorizado');
if(!token)throw Error('No hay credencial temporal para consultar reglas vigentes');
const candidate=readFileSync('firestore.rules','utf8');
const claimMarker='    // Autorregistros laborales privados.';
const catchAllMarker='    // Todas las demás colecciones permanecen cerradas.';
const claimAt=candidate.indexOf(claimMarker);
const catchAllAt=candidate.indexOf(catchAllMarker,claimAt);
if(claimAt<0||catchAllAt<=claimAt||candidate.indexOf(claimMarker,claimAt+1)!==-1||candidate.indexOf(catchAllMarker,catchAllAt+1)!==-1){
  throw Error('El bloque de autorregistros no está delimitado de forma única; despliegue cancelado.');
}
const claimBlock=candidate.slice(claimAt,catchAllAt);
if(!claimBlock.includes('match /agora_ops_work_claims/{claimId}')||
   !claimBlock.includes('match /history/{entryId}')||
   claimBlock.includes('allow delete: if true')){
  throw Error('El bloque de autorregistros no es el esperado; despliegue cancelado.');
}
const baselineCandidate=candidate.slice(0,claimAt)+candidate.slice(catchAllAt);
function normalize(s){return String(s).replace(/\r\n?/g,'\n').trim()}
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function getJson(path){
  const response=await fetch('https://firebaserules.googleapis.com/v1/'+path,{headers});
  if(!response.ok)throw Error('No se pudieron consultar reglas vigentes de Firebase (HTTP '+response.status+'). Se cancela sin publicar.');
  return response.json();
}
const release=await getJson('projects/'+project+'/releases/cloud.firestore');
if(!/^projects\/[a-zA-Z0-9._-]+\/rulesets\/[a-zA-Z0-9._-]+$/.test(release.rulesetName||'')){
  throw Error('No se pudo identificar la versión actual de las reglas; despliegue cancelado');
}
const ruleSet=await getJson(release.rulesetName);
const files=ruleSet.source?.files;
if(!Array.isArray(files)||files.length!==1||typeof files[0]?.content!=='string'){
  throw Error('Las reglas actuales no están almacenadas como un único archivo: no se reemplazan automáticamente');
}
const live=files[0].content;
const dir='.github/firebase-staff/.preflight';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/antes-dejavu.rules',live,'utf8');
writeFileSync(dir+'/ruleset-name.txt',release.rulesetName+'\n','utf8');
// Sólo se permite que producción sea la base exacta del candidato o que ya
// tenga desplegado el candidato completo. Cualquier otra diferencia se detiene.
if(normalize(live)===normalize(candidate)){
  console.log('Las reglas vigentes ya contienen los autorregistros; no se requiere cambiar contenido.');
}else if(normalize(live)===normalize(baselineCandidate)){
  console.log('Producción coincide exactamente al quitar el bloque aislado de autorregistros. Se preservan todas las reglas vigentes.');
}else{
  throw Error('REGLAS DISTINTAS EN PRODUCCIÓN. Se guardó respaldo. Se detiene para NO sobrescribir permisos existentes.');
}
console.log('Verificación previa completada. Proyecto: '+project);
