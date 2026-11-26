/** Strict preflight for the supervisor/coordinator-only attendance policy. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
const expectedProject='agora-dejavu-38b8c';
if(project!==expectedProject)throw Error('Proyecto Firebase distinto al autorizado');
if(!token)throw Error('No hay credencial temporal para consultar reglas vigentes');
const candidate=readFileSync('firestore.rules','utf8');
const baseline=readFileSync('.github/firebase-staff/production-before-supervisor-attendance.rules','utf8');
// Firestore rules activated by run 45709572614 (commit 030fe5c).
const supervisedAttendanceGitBlob='b3a5c2aeae11cd3851351fdde9b143c729de2e77';
const baselineGitBlob='865e1a3f89baa4411e787f342674d915f543b8a0';
function gitBlob(s){return createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex')}
if(gitBlob(baseline)!==baselineGitBlob)throw Error('La base aprobada de producción fue alterada; despliegue cancelado.');
function replaceActions(source,sectionStart,sectionEnd,replacement){
  const a=source.indexOf(sectionStart),b=source.indexOf(sectionEnd,a);
  if(a<0||b<=a||source.indexOf(sectionStart,a+1)!==-1)throw Error('No se identifica de forma única la regla de asistencia; despliegue cancelado.');
  const begin=source.indexOf('      allow create:',a),finish=source.indexOf('      allow delete: if false;',begin);
  if(begin<0||finish<begin||finish>b)throw Error('Las cláusulas de asistencia no tienen el formato aprobado; despliegue cancelado.');
  return source.slice(0,begin)+replacement+source.slice(finish);
}
const clockDeny='      // La asistencia nueva la registra coordinación mediante hojas delegadas de asistencia.\n      // Los marcajes legados siguen siendo consultables, pero ya no se escriben desde la cuenta Staff.\n      allow create, update: if false;\n';
const breakDeny='      // Descansos oficiales también se registran por el responsable en el flujo delegado.\n      allow create, update: if false;\n';
function replaceRegion(source,startMarker,endMarker,replacement){
 const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
 if(start<0||end<=start||source.indexOf(startMarker,start+1)!==-1)throw Error("No se identifica la sección protegida; despliegue cancelado.");
 return source.slice(0,start)+replacement+source.slice(end);
}
function copyRegion(source,startMarker,endMarker){
 const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
 if(start<0||end<=start||source.indexOf(startMarker,start+1)!==-1)throw Error("No se identifica la fuente de asistencia; despliegue cancelado.");
 return source.slice(start,end);
}
function includeAttendanceChanges(expected,source){
 const helperStart="    function attendanceSheetPath(eventId) {";
 const assignmentStart="    // Solicitudes de jornadas de Coordinación";
 expected=replaceRegion(expected,helperStart,assignmentStart,copyRegion(source,helperStart,assignmentStart));
 const sheetsStart="    match /agora_ops_attendance_sheets/{eventId} {";
 const claimsStart="    // Autorregistros laborales privados";
 return replaceRegion(expected,sheetsStart,claimsStart,copyRegion(source,sheetsStart,claimsStart));
}
let expected=replaceActions(baseline,'    match /agora_ops_clock/{id} {','    // Descansos certificados:',clockDeny);
expected=replaceActions(expected,'    match /agora_ops_breaks/{id} {','    match /agora_ops_trips/{id} {',breakDeny);
expected=includeAttendanceChanges(expected,candidate);
function normalize(s){return String(s).replace(/\r\n?/g,'\n').trim()}
if(normalize(candidate)!==normalize(expected))throw Error('El candidato cambia reglas fuera del pase de lista autorizado; despliegue cancelado.');
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
  if(normalize(live)!==normalize(candidate))throw Error('Las reglas activas no coinciden con el candidato de asistencia.');
  console.log('Firestore en producción coincide con el candidato publicado: '+release.rulesetName);
  process.exit(0);
}
const dir='.github/firebase-staff/.preflight';
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/antes-dejavu.rules',live,'utf8');writeFileSync(dir+'/ruleset-name.txt',release.rulesetName+'\n','utf8');
if(normalize(live)===normalize(candidate))console.log('Producción ya contiene exactamente la política aprobada; no se requiere cambiar reglas.');
else if(gitBlob(live)===supervisedAttendanceGitBlob)console.log('Producción coincide con el pase de lista supervisado publicado; se habilita la validación remota.');
else if(normalize(live)===normalize(baseline))console.log('Producción coincide exactamente con el respaldo aprobado; sólo se deshabilita la escritura de asistencia desde Staff.');
else throw Error('REGLAS DISTINTAS EN PRODUCCIÓN. Se guardó respaldo. Se detiene para NO sobrescribir permisos existentes.');
console.log('Verificación previa completada. Proyecto: '+project);
