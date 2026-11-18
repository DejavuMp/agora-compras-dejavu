/** Descansos individuales: únicamente tiempos emitidos por Firestore. */
import {instant} from "./jornadas-logic.mjs";
export function ownBreaks(records,uid,eventId){
  return (Array.isArray(records)?records:[]).filter(r=>
    r?.ownerUid===uid&&r?.eventId===eventId&&
    ["1","2","3","4","5","6","7","8"].includes(String(r.slot))
  ).sort((a,b)=>Number(a.slot)-Number(b.slot));
}
export function openBreak(records){
  return records.find(r=>r.status==="en_descanso")||null;
}
export function nextBreakSlot(records){
  const used=new Set(records.map(r=>String(r.slot)));
  for(let i=1;i<=8;i++)if(!used.has(String(i)))return String(i);
  return null;
}
/**
 * Las pausas simultáneas o superpuestas se consolidan en una sola franja,
 * para impedir doble descuento. Intervalos fuera del marcaje se recortan.
 */
export function verifiedBreakSummary(clock,records){
  const started=instant(clock?.startedAt);
  const ended=instant(clock?.status==="finalizada"?clock?.endedAt:Date.now());
  const active=openBreak(records);
  if(!Number.isFinite(started)||!Number.isFinite(ended)||ended<started)
    return {minutes:0,count:0,active,unverified:true};
  const spans=records.filter(r=>r.status==="reanudado").map(r=>{
    const start=instant(r.startedAt),end=instant(r.endedAt);
    return [Math.max(started,start),Math.min(ended,end)];
  }).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a)
    .sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const [a,b] of spans){
    const last=merged.at(-1);
    if(last&&a<=last[1])last[1]=Math.max(last[1],b);
    else merged.push([a,b]);
  }
  const minutes=Math.floor(merged.reduce((sum,[a,b])=>sum+b-a,0)/60000);
  return {minutes,count:spans.length,active,unverified:false};
}
