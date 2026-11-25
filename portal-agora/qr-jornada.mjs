/**
 * QR exclusivo para jornadas y actividades.
 *
 * Un QR NO autoriza por sí mismo: contiene referencias y caducidad de
 * presentación. La persona que escanea debe tener rol de coordinación,
 * comprobar la asignación en el cronograma y confirmar presencia física.
 *
 * Los registros se guardan como VALIDACIONES DE QR en agora_ops_incidents,
 * nunca como reloj oficial agora_ops_clock. No se crean jornadas adicionales.
 */
export const QR_VERSION="1";
export const QR_LIFETIME_MS=90_000;
export const QR_ACTIONS=Object.freeze(["entrada","salida","actividad"]);
const safeString=(v,max)=>String(v??"").trim().slice(0,max);
const safeId=(v,max=120)=>typeof v==="string"&&v.length>0&&v.length<=max&&
  !/[\/\\\s?#]/.test(v);
export function newShiftQr({root,uid,eventId,personId,activityKey="",now=Date.now()}){
 if(!safeId(uid,128)||!safeId(eventId,100)||!safeId(personId,120)||
   (activityKey&&!safeId(activityKey,80)))
  throw Error("Identificadores de jornada inválidos.");
 const time=Number(now);
 if(!Number.isFinite(time)||time<=0)throw Error("Hora de QR inválida.");
 const url=new URL("escanear/",root);
 const q=url.searchParams;
 q.set("v",QR_VERSION);
 q.set("u",uid);q.set("e",eventId);q.set("p",personId);
 if(activityKey)q.set("a",activityKey);
 q.set("t",String(Math.floor(time)));
 return url.href;
}
export function parseShiftQr(input,{origin,now=Date.now()}={}){
 if(typeof input!=="string"||input.length>3000)throw Error("QR inválido.");
 let url;
 try{url=new URL(input)}catch{throw Error("Escanea un QR de jornada de ÁGORA.");}
 const expected=new URL("escanear/",origin||url.origin+"/portal-agora/");
 if(url.origin!==expected.origin||url.pathname!==expected.pathname)
  throw Error("Este QR no pertenece a las jornadas de ÁGORA.");
 const q=url.searchParams;
 if(q.get("v")!==QR_VERSION)throw Error("Versión del QR no reconocida.");
 const uid=q.get("u"),eventId=q.get("e"),personId=q.get("p"),activityKey=q.get("a")||"";
 const issuedAt=Number(q.get("t"));
 if(!safeId(uid,128)||!safeId(eventId,100)||!safeId(personId,120)||
  (activityKey&&!safeId(activityKey,80))||!Number.isSafeInteger(issuedAt))
  throw Error("Los datos del QR son inválidos.");
 const age=now-issuedAt;
 if(age < -30_000||age>QR_LIFETIME_MS)
  throw Error("Este QR de jornada ya caducó. Solicita uno nuevo al colaborador.");
 return {uid,eventId,personId,activityKey,issuedAt};
}
const activityId=(activity,i)=>safeString(activity?.id??String(i+1),80);
const activityName=activity=>safeString(typeof activity==="string"?activity:
 activity?.name||activity?.title||activity?.description,240);
export function verifyShiftAssignment(schedule,scan){
 const events=schedule?.payload?.events;
 const people=schedule?.payload?.people;
 if(!Array.isArray(events)||!Array.isArray(people))
  throw Error("El cronograma operativo no está disponible.");
 const event=events.find(e=>String(e?.id)===scan.eventId);
 if(!event||["cancelado","borrador"].includes(event.status))
  throw Error("La jornada no existe o no está publicada.");
 const slot=(Array.isArray(event.staff)?event.staff:[]).find(
   a=>String(a?.personId)===scan.personId);
 if(!slot)throw Error("La persona no está asignada a esta jornada.");
 const person=people.find(p=>String(p?.id)===scan.personId);
 if(!person||person.active===false||person.authUid!==scan.uid)
  throw Error("El colaborador no tiene UID verificado en esta asignación.");
 const activities=Array.isArray(slot.activities)?slot.activities:
  Array.isArray(event.activities)?event.activities:[];
 const available=activities.map((a,i)=>({key:activityId(a,i),name:activityName(a)}))
  .filter(a=>a.name);
 const originName=safeString(slot.activity||event.activity,240);
 if(originName&&!available.some(a=>a.key==="origen"))
  available.unshift({key:"origen",name:originName});
 let activity=null;
 if(scan.activityKey){
   activity=available.find(a=>a.key===scan.activityKey);
   if(!activity)throw Error("La actividad ya no aparece en esta asignación.");
 }
 return {
  uid:scan.uid,personId:scan.personId,
  eventId:scan.eventId,
  eventTitle:safeString(event.title||event.project||"Jornada",160),
  fullName:safeString(person.name||"Colaborador",140),
  activity,
  assigned:true
 };
}
export function validateScanPermit(permit,assignment,now=Date.now()){
 if(!permit||permit.enabled!==true||
  permit.ownerUid!==assignment.uid||permit.personId!==assignment.personId||
  permit.eventId!==assignment.eventId)
  throw Error("La jornada no está habilitada para esta persona.");
 const at=v=>v?.toMillis?v.toMillis():new Date(v).getTime();
 const starts=at(permit.startsAt),ends=at(permit.endsAt);
 if(!Number.isFinite(starts)||!Number.isFinite(ends)||
  now<starts-30*60_000||now>ends+30*60_000)
   throw Error("La jornada está fuera de la ventana de validación autorizada.");
 return true;
}
export function qrValidationKey(scan,action){
 if(!QR_ACTIONS.includes(action))throw Error("Tipo de validación no permitido.");
 if(action==="actividad"&&!scan.activityKey)
  throw Error("Selecciona un QR de actividad.");
 if(action!=="actividad"&&scan.activityKey)
  throw Error("Usa el QR general de jornada para entrada o salida.");
 // Cadena única y segura para usar en Web Crypto.
 return [scan.uid,scan.eventId,action,scan.activityKey||""].join("\u001f");
}
export async function qrValidationDocId(scan,action,subtle=globalThis.crypto?.subtle){
 const key=qrValidationKey(scan,action);
 if(!subtle?.digest)throw Error("Este dispositivo no ofrece verificación criptográfica segura.");
 const digest=await subtle.digest("SHA-256",new TextEncoder().encode(key));
 const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 return "qr_"+hex.slice(0,48);
}
export function qrValidationRecord({scan,assignment,action,actorUid,actorName,stamp}){
 qrValidationKey(scan,action);
 if(!safeId(actorUid,128)||!assignment?.assigned||
  assignment.uid!==scan.uid||assignment.eventId!==scan.eventId||
  assignment.personId!==scan.personId)
  throw Error("La asignación o el supervisor no están validados.");
 const note=[
  "Verificación presencial por QR",
  "Acción: "+action,
  "Capturada por UID: "+actorUid,
  "Capturada por: "+safeString(actorName,100),
  "Actividad: "+(assignment.activity?.name||"Jornada general"),
  "QR presentado personalmente y asignación comprobada"
 ].join(" | ").slice(0,800);
 return {
  ownerUid:scan.uid,personId:scan.personId,
  eventId:scan.eventId,type:action==="actividad"?"validacion_actividad":"validacion_asistencia",
  status:action==="actividad"?"actividad_verificada":action,
  notes:note,revision:1,updatedAt:stamp
 };
}
