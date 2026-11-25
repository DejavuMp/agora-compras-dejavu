/**
 * Activación estrictamente aditiva del control de asistencia en Firestore.
 * No sobreescribe versiones de producción diferentes al respaldo conocido.
 * Si GitHub o Firebase han cambiado por fuera, detiene la publicación.
 *
 * Etapas: prepare, --check-before-write, --verify.
 * Sólo se ejecuta vía GitHub Actions en main con Workload Identity Federation.
 */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const project="agora-dejavu-38b8c";
const marker="    // ÁGORA ASISTENCIA · Registro mínimo delegado por jornada.";
const ending="    // Todas las demás colecciones permanecen cerradas.";
const dir=".github/firebase-staff/.preflight/attendance";
const token=process.env.FIREBASE_ACCESS_TOKEN;
if(process.env.FIREBASE_PROJECT_ID!==project||!token)
 throw Error("Proyecto o identidad temporal de Firebase no verificada.");
if(process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("Publicación de reglas no autorizada fuera de main.");
const sha=s=>createHash("sha256").update(s,"utf8").digest("hex");
const candidate=readFileSync("firestore.rules","utf8");
const a=candidate.indexOf(marker),b=candidate.indexOf(ending,a);
if(a<0||b<=a||candidate.indexOf(marker,a+1)!==-1||
  candidate.indexOf(ending,b+1)!==-1)
 throw Error("Bloque de asistencia ausente o ambiguo: detener.");
const block=candidate.slice(a,b);
for(const phrase of [
 "match /agora_ops_attendance_sheets/{eventId}",
 "match /entries/{id}","match /activities/{activityId}",
 "match /approvals/{personId}","function attendanceSupervisor(eventId)"
])if(!block.includes(phrase))throw Error("Bloque de reglas incompleto: "+phrase);
if(candidate[a-1]!=='\n')throw Error("Bloque de asistencia sin delimitador de línea seguro.");
const without=candidate.slice(0,a-1)+candidate.slice(b);
// Línea base inmutable: main ANTES de fusionar la asistencia (#57).
// Esto permite reintentar manualmente días después sin autorizar nuevas reglas ajenas.
const baseCommit="8960ea9e75899fd9a61499be894979a2beb5125a";
const before=execFileSync("git",["show",baseCommit+":firestore.rules"],{encoding:"utf8"});
// Confirmar que el PR cambió ÚNICAMENTE el módulo nuevo.
if(without!==before)throw Error("Las reglas anteriores cambiaron junto con asistencia; intervención manual necesaria.");
const headers={Authorization:"Bearer "+token,Accept:"application/json"};
async function readLive(){
 const response=await fetch("https://firebaserules.googleapis.com/v1/projects/"+project+
   "/releases/cloud.firestore",{headers});
 if(!response.ok)throw Error("No se pudo consultar la versión real Firestore: "+response.status);
 const release=await response.json();
 const ruleName=release.rulesetName;
 if(!ruleName?.startsWith("projects/"+project+"/rulesets/"))
  throw Error("Nombre del ruleset inesperado.");
 const result=await fetch("https://firebaserules.googleapis.com/v1/"+ruleName,{headers});
 if(!result.ok)throw Error("No se pudo leer reglas actuales: "+result.status);
 const ruleset=await result.json();
 if(ruleset.source?.files?.length!==1||typeof ruleset.source.files[0].content!=="string")
  throw Error("El ruleset real tiene formato inesperado.");
 return {name:ruleName,content:ruleset.source.files[0].content};
}
const live=await readLive();
const verify=process.argv.includes("--verify");
const second=process.argv.includes("--check-before-write");
const detailsPath=dir+"/estado.json";
if(verify||second){
 const state=JSON.parse(readFileSync(detailsPath,"utf8"));
 if(verify){
  if(sha(live.content)!==sha(candidate))
   throw Error("La publicación no coincide con las reglas aprobadas.");
  console.log("Producción coincide con el bloque exacto de asistencia aprobado.");
 }else if(state.mode==="deploy"){
  if(sha(live.content)!==state.baseHash||live.name!==state.baseRuleset)
   throw Error("Producción cambió entre respaldo y despliegue. No sobrescribir.");
  console.log("Versión real sigue idéntica al respaldo: autorizado desplegar solo reglas.");
 }else if(sha(live.content)!==sha(candidate)){
  throw Error("Ruleset que ya estaba publicado ahora difiere.");
 }
}else{
 mkdirSync(dir,{recursive:true});
 writeFileSync(dir+"/antes-firestore-asistencia.rules",live.content,"utf8");
 writeFileSync(dir+"/ruleset-anterior.txt",live.name+"\n","utf8");
 let mode;
 if(sha(live.content)===sha(candidate))mode="already";
 else if(sha(live.content)===sha(without))mode="deploy";
 else {
  writeFileSync(dir+"/DIAGNOSTICO.txt",
   "No se publica: las reglas de producción difieren de la base anterior. "+
   "Conservar respaldo y conciliar las diferencias manualmente.\n");
  throw Error("REGLAS REALES DIFERENTES: detenido sin sobrescribir ningún permiso.");
 }
 const state={mode,baseHash:sha(live.content),baseRuleset:live.name,
  expectedHash:sha(candidate)};
 writeFileSync(detailsPath,JSON.stringify(state,null,2)+"\n","utf8");
 if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,
  "ATTENDANCE_DEPLOY_MODE="+mode+"\n");
 console.log("Respaldado ruleset real. Modo seguro: "+mode);
}
