/** Despliegue solo Firestore Spark: conserva reglas reales y añade Reparaciones.
 * Descarga y respalda reglas activas; bloquea si cambian o si el repo difiere.
 * --verify confirma versión publicada. Sin Cloud Storage ni facturación.
 */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from "node:fs";
import {createHash} from "node:crypto";
const project=process.env.FIREBASE_PROJECT_ID,token=process.env.FIREBASE_ACCESS_TOKEN;
if(project!=="agora-dejavu-38b8c"||!token)throw Error("Identidad o proyecto Firebase no autorizado");
const sha256=text=>createHash("sha256").update(text,"utf8").digest("hex");
const originalBlob="7841d712855ea9ff628b4227049edb76ff73f828";
const liveBaseline="99e2bd8de21c8a67c4cd4afe3e30cc235fd3eee52f15187544da0cd6a4a5f994";
const marker="    // ÁGORA · Inventario, mantenimiento y reparaciones.";
const close="    // Todas las demás colecciones permanecen cerradas.";
const candidate=readFileSync("firestore.rules","utf8");
const blobSha=createHash("sha1").update("blob "+Buffer.byteLength(candidate,"utf8")+"\0"+candidate).digest("hex");
if(!process.argv.includes("--verify") && blobSha!==originalBlob)throw Error("El archivo Firestore del repositorio cambió: revisar y volver a aprobar.");
const at=candidate.indexOf(marker),until=candidate.indexOf(close,at);
if(at<0||until<=at||candidate.indexOf(marker,at+1)!==-1)throw Error("Fragmento de reparaciones ambiguo");
const fragment=candidate.slice(at,until);
for(const feature of [
 "match /agora_repair_photos/{id}",
 "match /agora_repair_requests/{id}",
 "match /agora_repair_assets/{id}",
 "match /agora_repair_invites/{token}",
 "match /agora_repair_events/{eventId}"
])if(!fragment.includes(feature))throw Error("Falta bloque obligatorio "+feature);
if(!fragment.includes("firestore:[a-f0-9-]{36}"))throw Error("No hay soporte Spark de fotos");
const headers={Authorization:"Bearer "+token,Accept:"application/json"};
async function getJSON(path){
 const response=await fetch("https://firebaserules.googleapis.com/v1/"+path,{headers});
 if(!response.ok)throw Error("No se pudo verificar Firestore real (HTTP "+response.status+")");
 return response.json();
}
const release=await getJSON("projects/"+project+"/releases/cloud.firestore");
if(!release.rulesetName?.startsWith("projects/"+project+"/rulesets/"))throw Error("Versión Firebase no verificable");
const ruleset=await getJSON(release.rulesetName);
if(ruleset.source?.files?.length!==1||typeof ruleset.source.files[0].content!=="string")
 throw Error("Producción no tiene exactamente una fuente de reglas verificable");
const live=ruleset.source.files[0].content;
const sep=live.indexOf(close);
if(sep<0||live.indexOf(close,sep+1)!==-1)throw Error("Cierre de permisos productivos alterado");
if(process.argv.includes("--verify")){
 const publishedHash=process.env.AGORA_SPARK_EXPECTED_SHA256;
 if(!publishedHash||sha256(live)!==publishedHash)throw Error("Las reglas publicadas no coinciden con la versión preparada.");
 console.log("Firestore real verificado: ampliación Spark coincide con la versión aprobada.");
}else{
 const folder=".github/firebase-staff/.preflight";
 mkdirSync(folder,{recursive:true});
 writeFileSync(folder+"/antes-firestore-spark.rules",live,"utf8");
 writeFileSync(folder+"/release-firestore-spark.txt",release.rulesetName+"\n","utf8");
 const atLive=live.indexOf(marker);
 let merged,mode;
 if(atLive>=0){
  // Idempotencia: una segunda ejecución no debe intentar reemplazar una
  // instalación que ya se comprobó y publicó.
  if(live.indexOf(marker,atLive+1)!==-1||atLive>=sep||
    live.slice(atLive,sep)!==fragment){
    throw Error("Hay un módulo Reparaciones distinto al revisado: detener sin sobrescribir.");
  }
  merged=live;mode="already_installed";
  console.log("Reparaciones Spark ya está publicado con el bloque exacto. No se modificará Firebase.");
 }else{
  if(sha256(live)!==liveBaseline){
   throw Error("Las reglas actuales no son la base auditada y aún no incluyen el módulo. Revisar antes de escribir.");
  }
  merged=live.slice(0,sep)+fragment+live.slice(sep);
  if(!merged.startsWith(live.slice(0,sep))||!merged.endsWith(live.slice(sep)))
    throw Error("Se detectó alteración fuera del módulo");
  mode="deploy";
  console.log("Reglas aditivas Spark preparadas. La versión original permanece respaldada.");
 }
 writeFileSync("firestore.rules",merged,"utf8");
 const digest=sha256(merged);
 if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,
   "AGORA_SPARK_EXPECTED_SHA256="+digest+"\nAGORA_SPARK_ACTION="+mode+"\n");
 console.log("Modo seguro: "+mode+". Respaldo completo preparado como artefacto obligatorio.");
}
