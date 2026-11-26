/**
 * ÁGORA · Pase de lista: validaciones puras sin datos de nómina.
 * Una jornada, múltiples actividades; QR opcional, captura manual/provisional.
 */
const v=(input,n=140)=>String(input??"").trim().slice(0,n);
export const ID_RX=/^[A-Za-z0-9_-]{1,90}$/;
const time=value=>{
 const raw=value?.toDate?value.toDate():value;
 const t=raw instanceof Date?raw.getTime():new Date(raw).getTime();
 return Number.isFinite(t)?t:NaN;
};
export function shiftCandidates(schedule,now=new Date()){
 const list=Array.isArray(schedule?.payload?.events)?schedule.payload.events:[];
 const today=now.getTime();
 return list.filter(e=>
  e?.id&&ID_RX.test(String(e.id))&&
  !["cancelado","borrador"].includes(e.status)&&
  Number.isFinite(time(e.start))&&Number.isFinite(time(e.end))&&
  time(e.start)<=today+45*86400000&&time(e.end)>=today-40*86400000
 ).sort((a,b)=>time(a.start)-time(b.start));
}
export function minimalRoster(schedule,event){
 const people=Array.isArray(schedule?.payload?.people)?schedule.payload.people:[];
 const byId=new Map(people.map(p=>[String(p.id),p]));
 const seen=new Set();
 return (Array.isArray(event?.staff)?event.staff:[]).flatMap(slot=>{
  const id=v(slot?.personId,90);
  if(!ID_RX.test(id)||seen.has(id))return [];
  const person=byId.get(id);
  if(!person)return [];
  seen.add(id);
  const uid=v(person.authUid,128);
  const activities=Array.isArray(slot.activities)?slot.activities:
   Array.isArray(event.activities)?event.activities:[];
  const keys=activities.map((a,i)=>v(a?.id??i+1,80)).filter(x=>ID_RX.test(x));
  if(v(slot.activity||event.activity,180))keys.unshift("origen");
  return [{
   personId:id,uid,name:v(person.name,140)||"Colaborador",
   activityKeys:[...new Set(keys)].slice(0,100)
  }];
 });
}
export function shiftPreview(schedule,eventId){
 const event=shiftCandidates(schedule).find(e=>String(e.id)===String(eventId));
 if(!event)throw Error("No se encontró esta jornada vigente.");
 const roster=minimalRoster(schedule,event);
 const start=time(event.start),end=time(event.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>start+48*3600000)
  throw Error("La jornada tiene fechas incorrectas.");
 return {
  eventId:String(event.id),title:v(event.title||event.project||"Jornada",180),
  site:v(event.venueName||event.siteName||event.location,180),
  startsAt:new Date(start),endsAt:new Date(end),
  roster,people:(schedule?.payload?.people||[])
   .filter(p=>v(p.authUid,128)&&ID_RX.test(v(p.id,90)))
   .map(p=>({uid:v(p.authUid,128),personId:v(p.id,90),name:v(p.name,140)}))
 };
}
export function entryDocId(personId,action,activityKey="jornada"){
 if(!ID_RX.test(v(personId,90))||!["entrada","salida","actividad"].includes(action)||
  !ID_RX.test(activityKey)||activityKey.length>80||
  (action==="actividad"&&activityKey==="jornada")||
  (action!=="actividad"&&activityKey!=="jornada"))
  throw Error("Identificadores de asistencia inválidos.");
 return personId+"__"+action+"__"+activityKey;
}
export function freshProvisionalId(randomHex){
 if(!/^[a-f0-9]{20}$/.test(randomHex))throw Error("Folio provisional inválido.");
 return "prov_"+randomHex;
}
export function entryDraft({eventId,person,source,action,activityKey="jornada",
 reason="",notes="",actorUid,stamp}){
 const personId=v(person?.personId,90),ownerUid=v(person?.uid,128),
  personName=v(person?.name,140);
 const id=entryDocId(personId,action,activityKey);
 if(!ID_RX.test(v(eventId,100))||!ID_RX.test(v(actorUid,128))||
    personName.length<2)throw Error("Faltan datos de jornada o colaborador.");
 if(!["qr","manual","provisional"].includes(source))
  throw Error("Selecciona un medio de registro válido.");
 if(source==="provisional"&&!/^prov_[a-f0-9]{20}$/.test(personId))
  throw Error("El registro provisional necesita folio propio.");
 if(source==="provisional"&&v(reason,400).length<10)
  throw Error("Explica el motivo del alta provisional.");
 if(source==="qr"&&!ownerUid)throw Error("Sin UID no puede presentarse un QR.");
 if(ownerUid===actorUid)throw Error("No está permitido registrar tu propia asistencia.");
 return {
  id,eventId:String(eventId),personId,ownerUid,personName,source,action,
  activityKey,reason:v(reason,400),notes:v(notes,400),
  actorUid:String(actorUid),createdAt:stamp,status:"pendiente"
 };
}
export function calculateNetMinutes(start,end,breakMinutes){
 const from=time(start),to=time(end),breaks=Number(breakMinutes);
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||
    to>from+36*3600000||!Number.isInteger(breaks)||breaks<0||breaks>600)
  throw Error("Verifica entrada, salida y descansos.");
 const minutes=Math.round((to-from)/60000)-breaks;
 if(minutes<1||minutes>1440)throw Error("Las horas netas están fuera del rango permitido.");
 return minutes;
}
export function approvalDraft({eventId,person,entry,exit,breakMinutes,notes,actorUid,stamp}){
 const approvedMinutes=calculateNetMinutes(entry,exit,breakMinutes);
 if(!ID_RX.test(v(eventId,100))||!ID_RX.test(v(person?.personId,90))||
  !ID_RX.test(v(actorUid,128)))throw Error("Identidad o jornada inválida.");
 return {
  eventId:String(eventId),personId:v(person.personId,90),
  personName:v(person.name,140),startAt:entry,endAt:exit,
  breakMinutes:Number(breakMinutes),approvedMinutes,notes:v(notes,600),
  status:"horas_validadas",source:v(person.source,20)||"manual",
  approvedBy:String(actorUid),approvedAt:stamp
 };
}
export function payrollSummary(sheet,approvals){
 const rows=(approvals||[]).map(a=>{
  const hours=(a.approvedMinutes/60).toFixed(2);
  return [a.personName,a.personId,hours+" h",a.breakMinutes+" min",a.source].join(" | ");
 });
 return [
  "ÁGORA · HORAS VALIDADAS PARA REVISIÓN DE PAGO",
  "Jornada: "+v(sheet.title,180),
  "Sede: "+v(sheet.site,180),
  "Folio de jornada: "+sheet.eventId,
  "Personal | ID de asignación | Horas validadas | Descanso | Origen",
  ...rows,
  "Validación de horas, no autorización de transferencia. Confirmar tarifa y datos bancarios exclusivamente en el módulo de pagos."
 ].join("\n");
}

export function validatedHoursReceipt(sheet,approval){
 if(!sheet||approval?.eventId!==sheet.eventId||approval?.status!=="horas_validadas"||
    !Number.isInteger(approval.approvedMinutes)||approval.approvedMinutes<1||
    !v(approval.personId,90))throw Error("El recibo requiere horas validadas para esta jornada.");
 const date=new Intl.DateTimeFormat("es-MX",{
  dateStyle:"short",timeStyle:"short",timeZone:"America/Mexico_City"
 });
 const format=value=>{
  const instant=time(value);
  return Number.isFinite(instant)?date.format(instant):"Sin registrar";
 };
 return [
  "Recibo de horas validadas",
  "Jornada: "+v(sheet.title,180),
  "Folio de jornada: "+sheet.eventId,
  "Sede: "+v(sheet.site,180),
  "Colaborador: "+v(approval.personName,140),
  "ID de asignación: "+approval.personId,
  "Entrada validada: "+format(approval.startAt),
  "Salida validada: "+format(approval.endAt),
  "Descanso: "+approval.breakMinutes+" min",
  "Horas validadas: "+(approval.approvedMinutes/60).toFixed(2)+" h",
  "Registro: "+v(approval.source,20),
  "Hora del centro de México"
 ].join("\n");
}
