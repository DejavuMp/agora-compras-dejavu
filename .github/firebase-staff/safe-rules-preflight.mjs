/**
 * Verificación estricta antes de habilitar autorregistros laborales en Firestore.
 * Conserva una copia de las reglas activas y sólo admite dos cambios conocidos:
 * el bloque aislado de autorregistros y salida sin coordenadas cuando el GPS falla.
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
const withoutClaims=candidate.slice(0,claimAt)+candidate.slice(catchAllAt);
const strictExitGeo="           request.resource.data.keys().hasAll(['endGeo','endNote','endedAt']) &&\n           shiftGeoValid(request.resource.data.endGeo) &&";
const optionalExitGeo="           request.resource.data.keys().hasAll(['endNote','endedAt']) &&\n           (!request.resource.data.keys().hasAny(['endGeo']) ||\n             shiftGeoValid(request.resource.data.endGeo)) &&";
if(withoutClaims.split(optionalExitGeo).length!==2){
  throw Error('La excepción de salida sin GPS no coincide exactamente; despliegue cancelado.');
}
const baselineCandidate=withoutClaims.replace(optionalExitGeo,strictExitGeo);
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
// Sólo se permite la base exacta del respaldo, más los dos cambios probados,
// o que producción ya tenga desplegado el candidato completo.
if(normalize(live)===normalize(candidate)){
  console.log('Las reglas vigentes ya contienen los cambios verificados; no se requiere modificar contenido.');
}else if(normalize(live)===normalize(baselineCandidate)){
  console.log('Producción coincide exactamente con la base respaldada; sólo se añaden los cambios probados.');
}else{
  throw Error('REGLAS DISTINTAS EN PRODUCCIÓN. Se guardó respaldo. Se detiene para NO sobrescribir permisos existentes.');
}
console.log('Verificación previa completada. Proyecto: '+project);
