/** Cálculos de tiempo operativo. No equivalen a autorización de nómina. */
import {instant} from "./jornadas-logic.mjs";
const MINUTE=60000;
const mins=(from,to)=>{
  const a=instant(from),b=instant(to);
  return Number.isFinite(a)&&Number.isFinite(b)&&b>a?Math.floor((b-a)/MINUTE):0;
};
const whole=v=>Number.isInteger(Number(v))?Math.max(0,Number(v)):0;
export const isJornada=event=>["jornada_oficina","jornada_campo","jornada_activaciones"].includes(event?.workMode);
export const workModeLabel=event=>({
  jornada_oficina:"Jornada de oficina",jornada_campo:"Jornada de campo",
  jornada_activaciones:"Jornada de activaciones",actividad_horas:"Actividad puntual por horas"
})[event?.workMode]||"Actividad por horas";
export function scheduledMinutes(event,personId){
  const shift=(event?.staff||[]).find(p=>p.personId===personId);
  return mins(shift?.start||event?.start,shift?.end||event?.end);
}
export function workedMinutes(clock){
  if(!clock?.endedAt||clock?.status!=="finalizada")return 0;
  return mins(clock.startedAt,clock.endedAt);
}
/** Declaración manual de descanso: siempre distinguida de un marcaje certificado. */
export function timeStatement({clock,event,personId,breakMins=0}){
  const gross=workedMinutes(clock),planned=scheduledMinutes(event,personId);
  const rest=whole(breakMins);
  if(rest>gross)throw Error("El descanso no puede exceder la duración de la jornada.");
  const net=Math.max(0,gross-rest);
  // Jamás se aprueban automáticamente excedentes; la coordinación los determina.
  const overtime=Math.max(0,net-planned);
  return {
    plannedMinutes:planned,grossMinutes:gross,breakMinutes:rest,
    netMinutes:net,overtimeCandidateMinutes:overtime,
    ordinaryMinutes:Math.min(net,planned),paymentBasis:isJornada(event)?"jornada":"hora",
    mode:workModeLabel(event),reviewRequired:overtime>0
  };
}
export const hours=minutes=>(Math.max(0,Number(minutes)||0)/60)
  .toLocaleString("es-MX",{minimumFractionDigits:0,maximumFractionDigits:2})+" h";
export const overtimeText=statement=>statement.reviewRequired?
  hours(statement.overtimeCandidateMinutes)+" adicionales por revisar":"Sin excedente detectado";
