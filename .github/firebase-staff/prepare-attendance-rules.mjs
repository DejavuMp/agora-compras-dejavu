/**
 * Publicación ADITIVA sobre reglas VIVAS de Firestore.
 * Se preservan las reglas activas, excepto una restricción puntual y comprobada:
 * Staff no puede crear validaciones administrativas de asistencia. El módulo
 * de asistencia se inserta sin cambiar el resto del ruleset.
 *
 * Modo inicial: descargar reglas reales, respaldarlas y preparar el ruleset
 * reconciliado. Segunda etapa: revisar el SHA y ruleset de la versión activa.
 * Tercera etapa: verificar que producción coincide con lo desplegado.
 *
 * No publica directamente: GitHub Actions ejecuta emulador sobre el
 * ruleset reconciliado y lo despliega solamente si todo está correcto.
 */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const project="agora-dejavu-38b8c";
const marker="    // ÁGORA ASISTENCIA · Registro mínimo delegado por jornada.";
const ending="    // Todas las demás colecciones permanecen cerradas.";
const dir=".github/firebase-staff/.preflight/attendance";
const baselineSha="8960ea9e75899fd9a61499be894979a2beb5125a";
const token=process.env.FIREBASE_ACCESS_TOKEN;
const checking=process.argv.includes("--check-before-write");
const verifying=process.argv.includes("--verify");
const stage=checking||verifying;
const stateFile=dir+"/estado.json";
const expectedFile=dir+"/firestore-asistencia-reconciliada.rules";

if(process.env.FIREBASE_PROJECT_ID!==project||!token)
 throw Error("Proyecto Firebase o token federado no verificado.");
if(process.env.GITHUB_REF!=="refs/heads/main"||
   process.env.GITHUB_EVENT_NAME!=="workflow_dispatch")
 throw Error("Publicación limitada a ejecución manual desde main.");
const sha=s=>createHash("sha256").update(s,"utf8").digest("hex");
function reconcileIdentityPhoneAccess(content,repositoryRules){
 const helperMatches=[...repositoryRules.matchAll(/function identitySignedIn\(\)\s*\{/g)];
 if(helperMatches.length!==1)throw Error("No hay una única función de identidad telefónica revisada en reglas de main.");
 const helperStart=helperMatches[0].index;
 const helperEnd=repositoryRules.indexOf("\n    function ",helperStart+1);
 if(helperEnd<0)throw Error("No se reconoce el límite de identitySignedIn.");
 const approvedHelper=repositoryRules.slice(helperStart,helperEnd).trimEnd();
 if(!approvedHelper.includes("request.auth.token.firebase.sign_in_provider == 'phone'")||
    !approvedHelper.includes("request.auth.token.phone_number is string"))
  throw Error("La función de identidad telefónica no coincide con la variante segura revisada.");
 const liveHelpers=[...content.matchAll(/function identitySignedIn\(\)\s*\{/g)];
 if(liveHelpers.length>1)throw Error("Hay varias funciones identitySignedIn en producción.");
 let result=content;
 if(liveHelpers.length===0){
  const insertion=result.indexOf("\n    function userPath()");
  if(insertion<0)throw Error("No se reconoce dónde insertar la función de identidad telefónica.");
  result=result.slice(0,insertion)+"\n    "+approvedHelper+"\n"+result.slice(insertion);
 }else{
  const liveStart=liveHelpers[0].index;
  const liveEnd=result.indexOf("\n    function ",liveStart+1);
  if(liveEnd<0)throw Error("No se reconoce el límite de identitySignedIn activo.");
  const liveHelper=result.slice(liveStart,liveEnd);
  if(!liveHelper.includes("request.auth.token.firebase.sign_in_provider == 'phone'")||
     !liveHelper.includes("request.auth.token.phone_number is string"))
   throw Error("identitySignedIn activo difiere de la variante segura revisada.");
 }
 function updateMatch(path,actions,appendOwnGet=false){
  const matches=[...result.matchAll(new RegExp("match "+path+"\\s*\\{","g"))];
  if(matches.length!==1)throw Error("No se reconoce una única regla "+path+"; detener.");
  const start=matches[0].index;
  const next=result.indexOf("\n    match ",start+1);
  const close=result.indexOf("\n    }\n",start);
  if(close<0||(next>=0&&next<close))throw Error("No se reconoce el límite de "+path+"; detener.");
  const block=result.slice(start,close+7);
  let changes=0;
  const updated=block.replace(/allow (get|create): if ([\s\S]*?);/g,(whole,action,expr)=>{
   if(!actions.includes(action))return whole;
   changes++;
   if(action==="get"&&appendOwnGet&&!expr.includes("request.auth.uid == uid"))
    return "allow get: if ("+expr+") || (identitySignedIn() && request.auth.uid == uid);";
   let safeExpr=expr;
   if(!safeExpr.includes("identitySignedIn()")){
    if(!safeExpr.includes("signedIn()"))
     throw Error("La regla "+path+" "+action+" no usa el predicado esperado; detener.");
    safeExpr=safeExpr.replace(/\bsignedIn\(\)/g,"identitySignedIn()");
   }
   if(path==="/agora_identity_registrations/\\{uid\\}"&&action==="create"){
    const unsafeEmail="request.resource.data.email == request.auth.token.email";
    const safeEmail="request.resource.data.email == request.auth.token.get('email','')";
    if(safeExpr.includes(unsafeEmail)){
     if(safeExpr.split(unsafeEmail).length-1!==1)
      throw Error("La validación del correo telefónico no es única; detener.");
     safeExpr=safeExpr.replace(unsafeEmail,safeEmail);
    }else if(!safeExpr.includes(safeEmail))
     throw Error("La validación del correo de identidad difiere; detener.");
   }
   if(safeExpr===expr)return whole;
   return "allow "+action+": if "+safeExpr+";";
  });
  for(const action of actions)
   if(!new RegExp("allow "+action+": if ").test(block))
    throw Error("Falta la autorización "+action+" en "+path+"; detener.");
  if(changes<actions.length)throw Error("No se procesaron todas las reglas de "+path+"; detener.");
  result=result.slice(0,start)+updated+result.slice(close+7);
 }
 updateMatch("/agora_users/\\{uid\\}",["get"],true);
 updateMatch("/agora_identity_registrations/\\{uid\\}",["get","create"]);
 function approvedFunction(source,name){
  const matches=[...source.matchAll(new RegExp("function "+name+"\\\\(\\\\)\\\\s*\\\\{","g"))];
  if(matches.length!==1)throw Error("No se reconoce una única función "+name+" en las reglas revisadas.");
  const start=matches[0].index;
  const end=source.indexOf("\\n    function ",start+1);
  if(end<0)throw Error("No se reconoce el límite de "+name+".");
  return source.slice(start,end).trimEnd();
 }
 for(const name of ["identityCoordinator","identityAssigned"]){
  const approved=approvedFunction(repositoryRules,name);
  if(name==="identityCoordinator"&&
     (!approved.includes("activeStaff()")||!approved.includes("role() == 'coordinador'")))
   throw Error("identityCoordinator no coincide con la regla segura revisada.");
  if(name==="identityAssigned"&&
     (!approved.includes("identityCoordinator()")||!approved.includes("request.auth.uid in record.coordinatorUids")))
   throw Error("identityAssigned no coincide con la regla segura revisada.");
  const matches=[...result.matchAll(new RegExp("function "+name+"\\\\(\\\\)\\\\s*\\\\{","g"))];
  if(matches.length>1)throw Error("Hay varias funciones "+name+" en reglas activas.");
  if(matches.length===1){
   const start=matches[0].index,end=result.indexOf("\\n    function ",start+1);
   if(end<0)throw Error("No se reconoce el límite activo de "+name+".");
   const active=result.slice(start,end);
   const required=name==="identityCoordinator"?
     ["activeStaff()","role() == 'coordinador'"]:
     ["identityCoordinator()","request.auth.uid in record.coordinatorUids"];
   if(required.some(part=>!active.includes(part)))
    throw Error(name+" activa difiere de la función segura revisada.");
  }else{
   const insertion=result.indexOf("\\n    function identityJob(");
   if(insertion<0)throw Error("No se reconoce dónde insertar "+name+"; detener.");
   result=result.slice(0,insertion)+"\\n    "+approved+"\\n"+result.slice(insertion);
  }
 }
 const registryMatches=[...result.matchAll(/match\\s+\\/agora_identity_registry\\/\\{[^}]+\\}\\s*\\{/g)];
 if(registryMatches.length!==1)throw Error("No se reconoce una única regla de directorio de identidad.");
 const registryStart=registryMatches[0].index;
 const registryNext=result.indexOf("\\n    match ",registryStart+1);
 const registryClose=result.indexOf("\\n    }\\n",registryStart);
 if(registryClose<0||(registryNext>=0&&registryNext<registryClose))
  throw Error("No se reconoce el límite de agora_identity_registry.");
 const registryBlock=result.slice(registryStart,registryClose+7);
 const assignedList="allow list: if identityAssigned(resource.data);";
 if(!registryBlock.includes(assignedList))
  result=result.slice(0,registryClose)+"\\n      "+assignedList+result.slice(registryClose);
 return result;
}

function reconcileOperationsRules(content){
 const matches=[...content.matchAll(/match\s+\/agora_ops_incidents\/\{[^}]+\}\s*\{/g)];
 if(matches.length!==1)
  throw Error("No se reconoce una única regla de incidentes; conservar producción y detener.");
 const start=matches[0].index;
 const close=content.indexOf("\n    }\n",start);
 const nextMatch=content.indexOf("\n    match ",start);
 if(close<0||(nextMatch>=0&&nextMatch<close))
  throw Error("No se reconoce el límite de la regla de incidentes; detener.");
 const block=content.slice(start,close+7);
 const create=/allow create: if ([\s\S]*?);/g;
 let count=0;
 const updated=block.replace(create,(whole,expr)=>{
  count++;
  if(expr.includes("(canEdit() || request.resource.data.type != 'validacion_asistencia')"))
   return whole;
  return "allow create: if ("+expr+") &&\n        (canEdit() || request.resource.data.type != 'validacion_asistencia');";
 });
 if(count===0)
  throw Error("No se encontró autorización de creación de incidentes; detener.");
 const incidentRules=content.slice(0,start)+updated+content.slice(close+7);
 // Missing verification claims stay denied without a Firestore rules evaluation error.
 const authHelpers=[...incidentRules.matchAll(/function signedIn\(\)\s*\{/g)];
 if(authHelpers.length!==1)
  throw Error("No se reconoce una única función de inicio de sesión; detener.");
 const authStart=authHelpers[0].index;
 const authEnd=incidentRules.indexOf("\n    function ",authStart+1);
 if(authEnd<0)
  throw Error("No se reconoce la siguiente función después de signedIn; detener.");
 const authBlock=incidentRules.slice(authStart,authEnd);
 const unsafeClaim="request.auth.token.email_verified == true";
 const safeClaim="request.auth.token.get('email_verified',false) == true";
 let identityRules=incidentRules;
 if(authBlock.includes(unsafeClaim)){
  if((authBlock.match(/request\.auth\.token\.email_verified\s*==\s*true/g)||[]).length!==1)
   throw Error("La verificación del claim no es única; detener.");
  const safeAuthBlock=authBlock.replace(unsafeClaim,safeClaim);
  identityRules=incidentRules.slice(0,authStart)+safeAuthBlock+incidentRules.slice(authEnd);
 }else if(!authBlock.includes(safeClaim)){
  throw Error("La regla de email_verified no coincide con ninguna variante segura conocida; detener.");
 }
 // Production may omit paymentDueDate although Operations and its tests use it.
 const helpers=[...identityRules.matchAll(/function opsValidReport\(\)\s*\{/g)];
 if(helpers.length!==1)
  throw Error("No se reconoce una única validación de reportes de Operaciones; detener.");
 const helperStart=helpers[0].index;
 const helperEnd=identityRules.indexOf("\n    function opsOwnReport()",helperStart);
 if(helperEnd<0)
  throw Error("No se reconoce el límite del esquema de reportes; detener.");
 const helper=identityRules.slice(helperStart,helperEnd);
 if(helper.includes("'paymentDueDate'")) return identityRules;
 const fieldList=/['"]returnNote['"]\s*,\s*['"]revision['"]\s*,\s*['"]updatedAt['"]\s*,\s*['"]type['"]\s*,\s*['"]status['"]/g;
 if((helper.match(fieldList)||[]).length!==1)
  throw Error("El esquema de reportes no coincide con la versión revisada; detener.");
 const updatedHelper=helper.replace(fieldList,
  "'returnNote','paymentDueDate','revision','updatedAt','type','status'");
 return identityRules.slice(0,helperStart)+updatedHelper+identityRules.slice(helperEnd);
}

const candidate=readFileSync(stage?dir+"/firestore-repositorio.rules":"firestore.rules","utf8");
const a=candidate.indexOf(marker),b=candidate.indexOf(ending,a);
if(a<0||b<=a||candidate.indexOf(marker,a+1)!==-1||
   candidate.indexOf(ending,b+1)!==-1||candidate[a-1]!=="\n")
 throw Error("Marcadores de reglas ambiguos: no desplegar.");
const block=candidate.slice(a,b);
const without=candidate.slice(0,a-1)+candidate.slice(b);
const baseline=execFileSync("git",["show",baselineSha+":firestore.rules"],{encoding:"utf8"});
if(without!==baseline)
 throw Error("El PR modificó reglas fuera del bloque de asistencia aprobado.");
for(const phrase of [
 "match /agora_ops_attendance_sheets/{eventId}",
 "match /agora_ops_assignment_requests/{requestId}",
 "match /entries/{id}","match /activities/{activityId}",
 "match /approvals/{personId}","function attendanceSupervisor(eventId)"
]){
 if(!block.includes(phrase))throw Error("Bloque de asistencia incompleto: "+phrase);
}
const expectedTail=candidate.slice(b);
if(!expectedTail.startsWith(ending)||
 !/match \/\{document=\*\*\} \{\s*allow read, write: if false;/m.test(expectedTail))
 throw Error("Cierre de reglas no reconocido.");

const headers={Authorization:"Bearer "+token,Accept:"application/json"};
async function readLive(){
 const response=await fetch("https://firebaserules.googleapis.com/v1/projects/"+
  project+"/releases/cloud.firestore",{headers});
 if(!response.ok)throw Error("No se pudo consultar release Firebase: "+response.status);
 const release=await response.json();
 const name=release.rulesetName;
 if(typeof name!=="string"||!name.startsWith("projects/"+project+"/rulesets/"))
  throw Error("Nombre de ruleset inesperado.");
 const result=await fetch("https://firebaserules.googleapis.com/v1/"+name,{headers});
 if(!result.ok)throw Error("No se pudo obtener ruleset activo: "+result.status);
 const ruleset=await result.json();
 const files=ruleset.source?.files;
 if(!Array.isArray(files)||files.length!==1||
    typeof files[0].content!=="string")
  throw Error("El ruleset activo contiene múltiples fuentes o un formato inesperado.");
 return {name,content:files[0].content};
}
const live=await readLive();
if(!live.content.startsWith("rules_version = '2';")||
   live.content.length<1000||live.content.length>450000)
 throw Error("Contenido de reglas reales no reconocido; detener.");
const protectedLive=reconcileIdentityPhoneAccess(
 reconcileOperationsRules(live.content),candidate);

if(stage){
 const state=JSON.parse(readFileSync(stateFile,"utf8"));
 const expected=readFileSync(expectedFile,"utf8");
 if(readFileSync("firestore.rules","utf8")!==expected)
  throw Error("El archivo para deploy no coincide con el ruleset probado.");
 if(sha(expected)!==state.expectedHash)
  throw Error("El ruleset probado cambió después del respaldo.");
 if(verifying){
  if(sha(live.content)!==state.expectedHash)
   throw Error("La versión publicada no coincide con el ruleset reconciliado y probado.");
  console.log("CONFIRMADO: Firestore en producción coincide con la adición aprobada.");
 }else{
  if(state.mode==="deploy"&&
    (sha(live.content)!==state.baseHash||live.name!==state.baseRuleset))
   throw Error("Las reglas reales cambiaron tras el respaldo. NO sobrescribir.");
  if(state.mode==="already"&&sha(live.content)!==state.expectedHash)
   throw Error("El ruleset previamente activo cambió tras el respaldo.");
  console.log("CONFIRMADO: versión activa idéntica al respaldo antes del despliegue.");
 }
}else{
 mkdirSync(dir,{recursive:true});
 // Crear respaldo antes de cualquier validación de compatibilidad.
 writeFileSync(dir+"/antes-firestore-asistencia.rules",live.content,"utf8");
 writeFileSync(dir+"/ruleset-anterior.txt",live.name+"\n","utf8");
 writeFileSync(dir+"/firestore-repositorio.rules",candidate,"utf8");
 const occurrences=(value,needle)=>value.split(needle).length-1;
 const matches=occurrences(protectedLive,ending);
 if(matches!==1)throw Error("Marcador de inserción no es único.");
 const index=protectedLive.indexOf(ending);
 const tail=protectedLive.slice(index);
 if(tail!==expectedTail)
  throw Error("El cierre de las reglas reales difiere del cierre autorizado.");
 const existing=protectedLive.indexOf(marker);
 let reconciled,mode;
 if(existing!==-1){
  // Ejecuciones repetidas son seguras: nunca duplicar el módulo.
  if(occurrences(protectedLive,marker)!==1 ||
     protectedLive.slice(existing,index)!==block)
   throw Error("Asistencia ya existe pero difiere del bloque aprobado.");
  reconciled=protectedLive;
  mode=reconciled===live.content?"already":"deploy";
 }else{
  // Rechazar cualquier colisión con helpers o colecciones previas.
  const reserved=[
   "match /agora_ops_attendance_sheets/{",
   "match /agora_ops_assignment_requests/{",
   "function attendanceSupervisor(",
   "function attendanceEntryCreate(",
   "function attendanceSheetPath(",
   "function attendanceRosterPath(",
   "function attendanceEntryPath(",
   "function attendanceValidated(",
   "function attendanceClockCompleted("
  ];
  if(reserved.some(key=>protectedLive.includes(key)))
   throw Error("Nombres de asistencia ya utilizados por las reglas reales.");
  // La autorización existente se estrecha arriba; asistencia se inserta al cierre.
  reconciled=protectedLive.slice(0,index)+block+protectedLive.slice(index);
  if(reconciled.slice(0,index)+reconciled.slice(index+block.length)!==protectedLive)
   throw Error("La conciliación alteró reglas fuera de la excepción autorizada.");
  mode="deploy";
 }
 const state={
  mode,baseHash:sha(live.content),baseRuleset:live.name,
  expectedHash:sha(reconciled),blockHash:sha(block),
  oldRuleBytes:Buffer.byteLength(live.content),
  newRuleBytes:Buffer.byteLength(reconciled),
  strategy:"staff-validation-deny+ops-paymentDueDate+safe-email-verified+attendance"
 };
 writeFileSync(expectedFile,reconciled,"utf8");
 writeFileSync(stateFile,JSON.stringify(state,null,2)+"\n","utf8");
 if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,
  "ATTENDANCE_DEPLOY_MODE="+mode+"\n");
 console.log("Respaldo realizado. Modo: "+mode+
  ". Reglas históricas conservadas con bloqueo puntual a validación de Staff. Bytes anteriores: "+
  state.oldRuleBytes+"; bytes reconciliados: "+state.newRuleBytes+".");
}
