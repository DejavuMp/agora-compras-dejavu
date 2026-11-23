/**
 * Auditoría de reglas reales: sólo compara archivos ya descargados por preflight.
 * No toca Firebase y evita imprimir el texto de producción en los logs públicos.
 */
import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
const folder=".github/firebase-staff/.preflight";
mkdirSync(folder,{recursive:true});
const result={project:"agora-dejavu-38b8c",readOnly:true,collections:[]};
const sha=s=>createHash("sha256").update(s).digest("hex");
for(const item of [
 {label:"Firestore",live:folder+"/antes-dejavu.rules",candidate:"firestore.rules"},
 {label:"Storage",live:folder+"/antes-storage.rules",candidate:"storage.rules"}
]){
 if(!existsSync(item.live)){
  result.collections.push({service:item.label,availability:"No se pudo obtener un respaldo del servicio; detener publicación."});
  continue;
 }
 const previous=readFileSync(item.live,"utf8"),next=readFileSync(item.candidate,"utf8");
 const a=previous.replace(/\r\n?/g,"\n").trim().split("\n");
 const b=next.replace(/\r\n?/g,"\n").trim().split("\n");
 let commonPrefix=0,commonSuffix=0;
 while(commonPrefix<a.length&&commonPrefix<b.length&&a[commonPrefix]===b[commonPrefix])commonPrefix++;
 while(commonSuffix<a.length-commonPrefix&&commonSuffix<b.length-commonPrefix&&a[a.length-1-commonSuffix]===b[b.length-1-commonSuffix])commonSuffix++;
 const changes={service:item.label,availability:"respaldo obtenido",matches:a.length===b.length&&commonPrefix===a.length,
  liveSha256:sha(previous),candidateSha256:sha(next),liveLines:a.length,candidateLines:b.length,
  firstDifferentLiveLine:commonPrefix+1,firstDifferentCandidateLine:commonPrefix+1,
  differingLiveLines:a.length-commonPrefix-commonSuffix,differingCandidateLines:b.length-commonPrefix-commonSuffix};
 result.collections.push(changes);
 console.log(item.label+": "+(changes.matches?"idénticas":"distintas")+
   " (primer cambio cerca de línea "+changes.firstDifferentLiveLine+
   ", líneas distintas del archivo real "+changes.differingLiveLines+
   ", líneas distintas del candidato "+changes.differingCandidateLines+").");
}
const path=folder+"/diagnostico-reglas.json";
writeFileSync(path,JSON.stringify(result,null,2)+"\n");
console.log("Informe sin reglas confidenciales en logs: "+path);
console.log("Esta auditoría NO modifica Firebase ni concede permisos.");
if(result.collections.some(item=>item.availability!=="respaldo obtenido")){
 console.error("Auditoría incompleta: no fue posible leer todas las reglas vigentes. Verifica permisos antes de continuar.");
 process.exitCode=1;
}
