/* Avisos locales: solo mientras el visor esté abierto, nunca push en segundo plano. */
import {instant} from "./jornadas-logic.mjs";
export function upcomingNotice(event,personId,now=Date.now(),clock=null){
  if(!event||event.status==="cancelado"||clock)return null;
  const shift=(event.staff||[]).find(s=>s.personId===personId);
  const starts=instant(shift?.start||event.start);
  if(!Number.isFinite(starts))return null;
  const delta=(starts-now)/60000;
  const title=String(event.title||event.type||"Actividad").slice(0,120);
  const site=String(event.venueName||event.location||"sede asignada").slice(0,120);
  let kind="",heading="",description="";
  if(delta>45&&delta<=60){
    kind="60";heading="Prepara tu jornada";
    description=title+" en una hora · "+site;
  }else if(delta>20&&delta<=30){
    kind="30";heading="Tu jornada está cerca";
    description=title+" comienza en aproximadamente 30 minutos · "+site;
  }else if(delta>0&&delta<=10){
    kind="10";heading="Tu jornada comienza pronto";
    description=title+" · revisa tu hora de entrada y ubicación";
  }else if(delta<=-5&&delta>=-60){
    kind="pendiente";heading="Entrada pendiente de registrar";
    description=title+" · verifica tu asistencia o consulta a coordinación";
  }
  if(!kind)return null;
  return {key:String(event.id)+"_"+kind,heading,description,kind};
}
export function eligibleNotices(events,personId,clocks,now=Date.now()){
  return (events||[]).map(e=>upcomingNotice(e,personId,now,clocks?.get?.(e.id)||null))
    .filter(Boolean);
}
