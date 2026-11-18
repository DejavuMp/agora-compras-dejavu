/** Comprobante personal imprimible. No contiene GPS, selfie ni datos bancarios. */
import {timeStatement,workModeLabel,hours} from "./ops-timekeeping.mjs";
import {instant} from "./jornadas-logic.mjs";
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stamp=v=>{
  const n=instant(v);
  return Number.isFinite(n)?new Intl.DateTimeFormat("es-MX",{
    dateStyle:"medium",timeStyle:"short",timeZone:"America/Mexico_City"
  }).format(n):"Por confirmar";
};
const idHash=s=>{
  let h=2166136261>>>0;
  for(const ch of String(s)){h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0}
  return h.toString(16).toUpperCase().padStart(8,"0");
};
export function receiptData({log,event,clock,person,personId}){
  if(!log?.id||!event||!person||!clock)throw Error("Faltan registros para elaborar el comprobante.");
  if(log.eventId!==event.id||log.personId!==personId||person.id!==personId)
    throw Error("Los datos no corresponden a la misma jornada.");
  if(clock.status!=="finalizada"||!Number.isFinite(instant(clock.endedAt)))
    throw Error("La jornada todavía no tiene salida certificada.");
  const summary=timeStatement({clock,event,personId,breakMins:log.breakMins||0});
  return {
    folio:"AGO-"+new Intl.DateTimeFormat("en-US",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant(clock.startedAt)).filter(p=>["year","month","day"].includes(p.type)).sort((a,b)=>({year:0,month:1,day:2}[a.type]-({year:0,month:1,day:2}[b.type]))).map(p=>p.value).join("")+"-"+idHash(log.id),
    name:person.name||"Integrante de Dejavú Marketing",
    activity:event.title||event.type||"Actividad",
    type:workModeLabel(event),
    campaign:event.campaign||event.project||"",
    site:event.venueName||event.location||"Sede asignada",
    officialStart:stamp(clock.startedAt),officialEnd:stamp(clock.endedAt),
    planned:hours(summary.plannedMinutes),
    gross:hours(summary.grossMinutes),rest:summary.breakMinutes+" min",
    net:hours(summary.netMinutes),
    overtime:hours(summary.overtimeCandidateMinutes),
    status:log.paymentStatus||"capturado",
    hasUnapprovedOvertime:summary.reviewRequired,
    validatedHours:typeof log.approvedHours==="number"?hours(log.approvedHours*60):null,
    notes:String(log.notes||"").slice(0,600)
  };
}
export function receiptHtml(data){
  const x=k=>safe(data[k]);
  return '<!doctype html><html lang="es-MX"><head><meta charset="utf-8">'+
    '<title>ÁGORA | Comprobante '+x("folio")+'</title>'+
    '<style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;background:#f7f7f5;font:13px/1.55 Arial,sans-serif;color:#1b2023}'+
    'main{max-width:740px;margin:24px auto;background:white;border:1px solid #deded9;border-radius:11px;padding:38px}'+
    'header{display:flex;justify-content:space-between;border-bottom:4px solid #242629;padding-bottom:22px;gap:20px}'+
    'h1{font-size:23px;line-height:1.2;margin:0}h2{font-size:14px;margin:25px 0 8px}p{margin:7px 0}.folio{font-weight:bold}'+
    'small,footer{font-size:11px;color:#5f676b}.pill{display:inline-block;background:#f3e8d3;padding:5px 10px;border-radius:30px}'+
    'dl{display:grid;grid-template-columns:180px 1fr;gap:8px 16px;margin:0}dt{color:#596168}dd{margin:0;font-weight:bold}'+
    '.hours{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}.hours div{background:#f7f6f3;padding:14px;border-radius:9px}'+
    '.hours b{font-size:21px;display:block}.hours small{display:block}.warning{border-left:4px solid #a9853d;background:#fffaec;padding:12px}'+
    '.smallprint{border-top:1px solid #ddd;padding-top:18px;margin-top:22px}.tools{margin:12px auto;max-width:740px;display:flex;gap:8px}button{padding:12px 18px;background:#222;color:white;border:0;border-radius:8px;cursor:pointer}'+
    '@media print{body{background:white}main{padding:0;border:0;margin:0;max-width:none}.tools{display:none}}'+
    '</style></head><body>'+
    '<div class="tools"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>'+
    '<main><header><div><small>DEJAVÚ MARKETING · ÁGORA OPERACIONES</small><h1>Comprobante de jornada</h1>'+
    '<p>Registro individual de horas y actividades</p></div>'+
    '<div><small>FOLIO DE CONSULTA</small><p class="folio">'+x("folio")+'</p><span class="pill">'+x("status")+'</span></div></header>'+
    '<h2>Datos de la actividad</h2><dl>'+
    '<dt>Integrante</dt><dd>'+x("name")+'</dd>'+
    '<dt>Modalidad</dt><dd>'+x("type")+'</dd>'+
    '<dt>Actividad</dt><dd>'+x("activity")+'</dd>'+
    '<dt>Campaña / proyecto</dt><dd>'+x("campaign")+'</dd>'+
    '<dt>Sede</dt><dd>'+x("site")+'</dd>'+
    '<dt>Entrada oficial</dt><dd>'+x("officialStart")+'</dd>'+
    '<dt>Salida oficial</dt><dd>'+x("officialEnd")+'</dd></dl>'+
    '<h2>Resumen de tiempo</h2><div class="hours">'+
    '<div><small>Programadas</small><b>'+x("planned")+'</b></div>'+
    '<div><small>Horas transcurridas</small><b>'+x("gross")+'</b></div>'+
    '<div><small>Descanso declarado</small><b>'+x("rest")+'</b></div>'+
    '<div><small>Trabajadas netas</small><b>'+x("net")+'</b></div>'+
    '<div><small>Excedente por revisar</small><b>'+x("overtime")+'</b></div>'+
    '<div><small>Horas validadas</small><b>'+safe(data.validatedHours||"Pendiente")+'</b></div></div>'+
    (data.hasUnapprovedOvertime?'<p class="warning"><b>Tiempo excedente detectado:</b> requiere revisión y aprobación de coordinación. No constituye pago autorizado.</p>':'')+
    '<h2>Observaciones</h2><p>'+safe(data.notes||"Sin observaciones adicionales.")+'</p>'+
    '<footer class="smallprint">Este documento se genera desde el expediente individual en ÁGORA. No es un CFDI, una nómina, un recibo bancario ni una certificación oficial de pago. Las horas y los importes están sujetos a validación de coordinación. No incluye información biométrica ni bancaria.</footer>'+
    '</main></body></html>';
}
