/**
 * ÁGORA · Credencial y asistencia.
 * Helpers puros. La credencial pública identifica, pero NO autoriza marcajes.
 * El reloj oficial sigue en agora_ops_clock/{uid}_{eventId}.
 */
const ms=value=>{
  if(value instanceof Date)return value.getTime();
  if(typeof value?.toMillis==="function")return value.toMillis();
  if(typeof value?.seconds==="number")return value.seconds*1000;
  if(value==null)return NaN;
  const n=new Date(value).getTime();
  return Number.isFinite(n)?n:NaN;
};
export const clockKey=(uid,eventId)=>{
  if(typeof uid!=="string"||!uid||uid.includes("/")||
      typeof eventId!=="string"||!eventId||eventId.length>100||eventId.includes("/"))
    throw Error("Identificador de jornada inválido.");
  return uid+"_"+eventId;
};
export function ownAttendanceShifts(privateDoc,member,now=new Date()){
  if(!privateDoc||member?.active!==true||member.role!=="staff"||
     !member.personId||member.personId!==privateDoc.personId||
     !Array.isArray(privateDoc.events))return [];
  const today=ms(now);
  return privateDoc.events.flatMap(e=>{
    if(!e||!e.id||e.status==="cancelado"||e.status==="borrador")return [];
    const own=Array.isArray(e.staff)?e.staff.find(x=>x?.personId===member.personId):null;
    if(!own)return [];
    const start=ms(own.start??e.start),end=ms(own.end??e.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
    // Jornadas del período actual; la consulta no descarga agenda general ni otros UID.
    if(start>today+7*86400000||end<today-2*86400000)return [];
    const eventId=String(e.id);
    if(eventId.length>100||eventId.includes("/"))return [];
    return [{
      eventId,
      title:String(e.title||e.project||e.type||"Jornada").slice(0,140),
      site:String(e.venueName||e.location||"Por confirmar").slice(0,140),
      activity:String((e.type||"Actividad")+" · "+(e.title||"Operación programada")).slice(0,240),
      start,end
    }];
  }).sort((a,b)=>a.start-b.start).slice(0,30);
}
export function attendanceState(permit,clock,now=new Date()){
  if(clock?.status==="finalizada")return {status:"finalizada",action:"none"};
  if(clock?.status==="en_curso")return {status:"en_curso",action:"exit"};
  const start=ms(permit?.startsAt),end=ms(permit?.endsAt),time=ms(now);
  if(permit?.enabled===true&&Number.isFinite(start)&&Number.isFinite(end)&&
      time>=start&&time<=end)return {status:"habilitada",action:"entry"};
  return {status:"pendiente",action:"none"};
}
export function entryPayload(uid,personId,eventId,activity,geo,stamp){
  clockKey(uid,eventId);
  if(!personId||!geo||!Number.isFinite(geo.lat)||
    !Number.isFinite(geo.lng)||!Number.isFinite(geo.accuracy)||
    geo.lat < -90||geo.lat>90||geo.lng < -180||geo.lng>180||
    geo.accuracy<0||geo.accuracy>10000)
    throw Error("La ubicación puntual de entrada es inválida.");
  return {
    ownerUid:uid,personId,eventId,
    activity:String(activity||"Actividad · Jornada").slice(0,240),
    status:"en_curso",startGeo:geo,startedAt:stamp,
    lastGeo:geo,lastGeoAt:stamp,updatedAt:stamp
  };
}
export function exitPayload(note,geo,stamp){
  const text=String(note||"Jornada finalizada desde mi credencial").trim().slice(0,240);
  if(text.length<4)throw Error("Agrega una nota breve de salida.");
  const payload={status:"finalizada",endNote:text,endedAt:stamp,updatedAt:stamp};
  if(geo){
    if(!Number.isFinite(geo.lat)||!Number.isFinite(geo.lng)||
       !Number.isFinite(geo.accuracy)||geo.lat < -90||geo.lat>90||
       geo.lng < -180||geo.lng>180||geo.accuracy<0||geo.accuracy>10000)
      throw Error("Ubicación de salida incorrecta.");
    payload.endGeo=geo;
  }
  return payload;
}
