/**
 * Dejavú Marketing · comprobación no destructiva antes de publicar Firestore Rules.
 * Se ejecuta exclusivamente desde un flujo manual con identidad autorizada.
 * Si las reglas vigentes difieren de la base de Ágora del repositorio, detiene
 * el despliegue para evitar sobrescribir cambios de Compras / Archivos.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
const expectedProject='agora-dejavu-38b8c';
if(project!==expectedProject)throw Error('Proyecto Firebase distinto al autorizado');
if(!token)throw Error('No hay credencial temporal para consultar reglas vigentes');
const candidate=readFileSync('firestore.rules','utf8');
const start='    // Dejavú Staff: archivo privado opcional por correo verificado.';
const middle='    // Catálogo de fichas que un coordinador DECIDIÓ publicar para todo el staff.';
const end='    // Todas las demás colecciones permanecen cerradas.';
function assertIndexOrder(text){
 const a=text.indexOf(start),b=text.indexOf(middle),c=text.indexOf(end);
 if(a<0||b<=a||c<=b)throw Error('El archivo local no contiene los bloques de Staff en el orden previsto');
 return {a,b,c};
}
// El bloque financiero es nuevo. Reconocer la versión anterior SIN Finanzas
// permite aplicar la ampliación sin alterar ninguna regla ya publicada.
const financeMarker='// ÁGORA · Recursos y Finanzas 2026';
const financeAt=candidate.indexOf(financeMarker);
if(financeAt<0||candidate.indexOf(financeMarker,financeAt+1)!==-1){
 throw Error('No se identificó un único bloque de Recursos y Finanzas; cancelar.');
}
const markerEnd='    // Todas las demás colecciones permanecen cerradas.';
const financeEnd=candidate.indexOf(markerEnd,financeAt);
if(financeEnd<financeAt)throw Error('Marcador final de Finanzas no encontrado');
const legacy=candidate.slice(0,financeAt)+candidate.slice(financeEnd);
// V4 agrega permisos de Operaciones después de Finanzas. La producción puede
// seguir en la versión anterior (con Finanzas, pero sin Operaciones).
const opsMarker='    // ÁGORA · Centro de Operaciones V4 (aislado de Compras y Finanzas).';
const opsAt=candidate.indexOf(opsMarker);
if(opsAt<0||candidate.indexOf(opsMarker,opsAt+1)!==-1||opsAt<=financeAt||opsAt>=financeEnd){
  throw Error('No se identificó un único bloque de Operaciones en la posición segura; cancelar.');
}
if(candidate[opsAt-1]!=='\n')throw Error('Separador de reglas de Operaciones inesperado');
const withoutOps=candidate.slice(0,opsAt-1)+candidate.slice(financeEnd);
// Esta ampliación añade marcajes tras el bloque de Operaciones sin modificar
// las reglas antiguas; reconocer el ruleset desplegado inmediatamente anterior.
const clockMarker='    // ÁGORA · Marcaje verificable y traslados (solo UID autorizado).';
const clockAt=candidate.indexOf(clockMarker);
if(clockAt<opsAt||clockAt>=financeEnd||candidate.indexOf(clockMarker,clockAt+1)!==-1 ||
   candidate[clockAt-1]!=='\n'){
 throw Error('Marcador de marcajes ambiguo; cancelar antes de consultar producción.');
}
const oldOps=candidate.slice(0,clockAt-1)+candidate.slice(financeEnd);
// Identidad Única se añadió después de Operaciones y marcajes. Una versión
// de producción legítima puede carecer SOLO de este bloque: reconocerla sin
// permitir cambios en ninguna regla previa de Compras, Archivos ni Staff.
const identityMarker='    // AGORA - Identidad Unica y RH. Fragmento para insertar dentro de';
const identityAt=candidate.indexOf(identityMarker);
if(identityAt<=clockAt || identityAt>=financeEnd ||
   candidate.indexOf(identityMarker,identityAt+1)!==-1 ||
   candidate.slice(identityAt-2,identityAt)!=='\n\n'){
 throw Error('Bloque de Identidad no delimitado exactamente; cancelar.');
}
const beforeIdentity=candidate.slice(0,identityAt)+candidate.slice(financeEnd);
// También admitir EXACTAMENTE la última versión publicada, antes de corregir
// la consulta de coordinación. Sin comodines ni relajación de otras reglas.
const coordinatorListNew="      allow list: if identityRh() ||\n        (identityCoordinator() && request.auth.uid in resource.data.coordinatorUids);";
const coordinatorListOld="      allow list: if identityRh() || identityAssigned(resource.data);";
if(candidate.split(coordinatorListNew).length!==2){
  throw Error('Regla de directorio de coordinación no coincide con la versión esperada');
}
const beforeCoordinatorListFix=candidate.replace(coordinatorListNew,coordinatorListOld);
const evidenceMarker='        // Fotos de evidencia compartidas: acceso a fichas publicadas.';
function normalize(s){return String(s).replace(/\r\n?/g,'\n').trim()}
function safeVariants(text){
 const {a,b,c}=assertIndexOrder(text);
 const evidenceAt=text.indexOf(evidenceMarker);
 if(evidenceAt<=b||evidenceAt>=c)throw Error('No se encontró el bloque de evidencias en el área de Staff');
 return [
  text,
  text.slice(0,a)+text.slice(c),
  text.slice(0,b)+text.slice(c),
  text.slice(0,evidenceAt)+text.slice(c)
 ];
}
// El módulo de reparaciones sólo añade un bloque ANTES del cierre general.
 // Exigir reconstruir exactamente la versión anterior de main, sin cambios
 // permisivos en ningún otro módulo. Esto permite una primera activación segura.
 const repairMarker='    // ÁGORA · Inventario, mantenimiento y reparaciones.';
 const repairAt=candidate.indexOf(repairMarker);
 const repairEnd=candidate.indexOf(end,repairAt);
 if(repairAt<0||repairEnd<=repairAt||candidate.indexOf(repairMarker,repairAt+1)!==-1){
  throw Error('El bloque de reparaciones no está delimitado exactamente; cancelar.');
 }
 const beforeRepairs=candidate.slice(0,repairAt)+candidate.slice(repairEnd);
 // Solo admitir reglas idénticas a versiones conocidas de Staff (con o sin el
 // NUEVO bloque financiero). Cualquier edición ajena cancela el despliegue.
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
async function getJson(path){
 const url='https://firebaserules.googleapis.com/v1/'+path;
 const response=await fetch(url,{headers});
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
mkdirSync('.github/firebase-staff/.preflight',{recursive:true});
writeFileSync('.github/firebase-staff/.preflight/antes-dejavu.rules',live,'utf8');
writeFileSync('.github/firebase-staff/.preflight/ruleset-name.txt',release.rulesetName+'\n','utf8');
// Conservar el respaldo antes incluso si fallan los chequeos de variantes.
const allowed=new Set([...safeVariants(candidate),...safeVariants(beforeCoordinatorListFix),...safeVariants(beforeIdentity),...safeVariants(oldOps),...safeVariants(withoutOps),...safeVariants(legacy),...safeVariants(beforeRepairs)].map(normalize));
// Auditoría real del 23-11-2026, run 45184043693 (artefacto con copia original).
// Versión de producción examinada: solo 12 segmentos puntuales de reglas
// anteriores + ausencia del nuevo módulo Reparaciones, sin cambios desconocidos.
// Aceptar EXCLUSIVAMENTE este SHA-256 de contenido íntegro, no versiones próximas.
// Si alguien cambia una sola línea en Firebase, detener en lugar de sobrescribir.
const verifiedProductionDigest='99e2bd8de21c8a67c4cd4afe3e30cc235fd3eee52f15187544da0cd6a4a5f994';
const verifiedCandidateDigest='9c23bee64e225f7212348cdd0c889168a0ab5b695e708d9750234cd148484204';
const liveDigest=createHash('sha256').update(live,'utf8').digest('hex');
const candidateDigest=createHash('sha256').update(candidate,'utf8').digest('hex');
// Si cambia el archivo candidato tras la auditoría, exigir conciliación de nuevo.
const recognizedProductionSnapshot=liveDigest===verifiedProductionDigest &&
  candidateDigest===verifiedCandidateDigest;
if(!allowed.has(normalize(live)) && !recognizedProductionSnapshot){
 throw Error('REGLAS DISTINTAS EN PRODUCCIÓN. Se guardó respaldo. Se detiene para NO modificar permisos de Ágora Compras, Archivos u otros módulos.');
}
if(normalize(live)===normalize(candidate)){
 console.log('Las reglas de ÁGORA coinciden con el repositorio. No se requiere cambiar contenido.');
}else if(recognizedProductionSnapshot){
 console.log('Producción coincide exactamente con el respaldo verificado el 23-11-2026 (SHA-256 completo). La actualización incluiría las ampliaciones versionadas, sin tocar otros documentos.');
}else{
 console.log('Las reglas activas de ÁGORA coinciden con una versión conocida; es seguro ampliar los permisos sin modificar las demás colecciones.');
}
console.log('Verificación previa de reglas completada. Proyecto: '+project);
