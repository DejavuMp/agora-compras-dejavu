/**
 * Dejavú Marketing · comprobación no destructiva antes de publicar Firestore Rules.
 * Se ejecuta exclusivamente desde un flujo manual con identidad autorizada.
 * Si las reglas vigentes difieren de la base de Ágora del repositorio, detiene
 * el despliegue para evitar sobrescribir cambios de Compras / Archivos.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const project=process.env.FIREBASE_PROJECT_ID;
const token=process.env.FIREBASE_ACCESS_TOKEN;
const expectedProject='agora-dejavu-38b8c';
if(project!==expectedProject)throw Error('Proyecto Firebase distinto al autorizado');
if(!token)throw Error('No hay credencial temporal para consultar reglas vigentes');
const candidate=readFileSync('firestore.rules','utf8');
const start='    // Dejavú Staff: cada ficha pertenece al correo verificado asignado.';
const middle='    // Catálogo público de fichas que un coordinador de Dejavú DECIDIÓ publicar.';
const end='    // Todas las demás colecciones permanecen cerradas.';
function assertIndexOrder(text){
 const a=text.indexOf(start),b=text.indexOf(middle),c=text.indexOf(end);
 if(a<0||b<=a||c<=b)throw Error('El archivo local no contiene los bloques de Staff en el orden previsto');
 return {a,b,c};
}
const {a,b,c}=assertIndexOrder(candidate);
const base=candidate.slice(0,a)+candidate.slice(c);
const privateOnly=candidate.slice(0,b)+candidate.slice(c);
function normalize(s){return String(s).replace(/\r\n?/g,'\n').trim()}
const allowed=new Set([normalize(base),normalize(privateOnly),normalize(candidate)]);
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
if(!allowed.has(normalize(live))){
 throw Error('REGLAS DISTINTAS EN PRODUCCIÓN. Se guardó respaldo. Se detiene para NO modificar permisos de Ágora Compras, Archivos u otros módulos.');
}
if(normalize(live)===normalize(candidate)){
 console.log('Las reglas de Staff ya coinciden con el repositorio. No se requiere cambiar contenido.');
}else{
 console.log('La base activa de Ágora coincide con una versión conocida. Es seguro añadir los bloques de Staff sin cambiar los demás permisos.');
}
console.log('Verificación previa de reglas completada. Proyecto: '+project);
