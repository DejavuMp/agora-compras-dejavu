/** Vista de staff: únicamente campos de su propia ficha y registros por UID. */
import {instant,elapsedMinutes} from "./jornadas-logic.mjs";
const pad=n=>String(n).padStart(2,"0");
export function localDay(value){
  const n=instant(value);
  if(!Number.isFinite(n))return "";
  const d=new Date(n);
  return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join("-");
}
export function atLocalDay(day){
  if(typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day))return NaN;
  const [y,m,d]=day.split("-").map(Number);
  const x=new Date(y,m-1,d);
  return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d?x.getTime():NaN;
}
export function shiftOf(event,personId){
  return (event?.staff||[]).find(s=>s.personId===personId)||event?.staff?.[0]||{};
}
export function eventStart(event,personId){
  return shiftOf(event,personId).start||event?.start;
}
export function eventEnd(event,personId){
  return shiftOf(event,personId).end||event?.end;
}
export function myEvents(events,personId){
  return (Array.isArray(events)?events:[]).filter(e=>e?.id&&e.status!=="cancelado")
    .slice().sort((a,b)=>instant(eventStart(a,personId))-instant(eventStart(b,personId)));
}
export function filteredEvents(events,personId,from,days){
  const start=atLocalDay(from);
  if(!Number.isFinite(start))return [];
  const until=new Date(start);
  until.setDate(until.getDate()+Number(days||1));
  return myEvents(events,personId).filter(e=>{
    const d=instant(eventStart(e,personId));
    return Number.isFinite(d)&&d>=start&&d<until.getTime();
  });
}
export const payLabel={
  capturado:"Horas capturadas",solicitado:"En revisión",revision:"Corrección solicitada",
  validado:"Validado",programado:"Pago programado",pagado:"Marcado como pagado"
};
export function paymentFilter(status,filter){
  switch(filter){
    case "pendientes":return ["capturado","revision"].includes(status);
    case "revision":return status==="solicitado";
    case "pagados":return ["validado","programado","pagado"].includes(status);
    default:return true;
  }
}
export function netHours(log){
  const minutes=elapsedMinutes(log?.start,log?.end);
  return Math.max(0,minutes-Math.max(0,Number(log?.breakMins)||0))/60;
}
export function reportFromFinishedClock({clock,event,uid,personId,id}){
  if(!clock||clock.status!=="finalizada"||!event)
    throw Error("Termina primero tu jornada para preparar el reporte.");
  const start=instant(clock.startedAt),end=instant(clock.endedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
    throw Error("La hora oficial no está disponible. Espera a que Firebase la confirme.");
  if(!id||id.length>100||id.includes("/"))
    throw Error("La jornada tiene un identificador no compatible. Consulta a coordinación.");
  const activity=String(clock.endNote||clock.activity||"").slice(0,240).trim();
  if(activity.length<4)throw Error("La jornada necesita una descripción de la actividad.");
  return {
    id,ownerUid:uid,personId,eventId:event.id,
    start:new Date(start).toISOString(),end:new Date(end).toISOString(),
    breakMins:0,activity,
    place:String(event.venueName||event.location||"Sede asignada").slice(0,240),
    notes:"Registro basado en entrada y salida verificadas por Firebase.",
    paymentBasis:"hora",paymentStatus:"capturado",revision:1
  };
}
