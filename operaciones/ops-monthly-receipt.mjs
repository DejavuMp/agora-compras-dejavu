/** Resumen mensual privado basado en los marcajes propios y reportes de horas. */
import {receiptData} from "./ops-receipt.mjs";
import {timeStatement} from "./ops-timekeeping.mjs";
import {instant} from "./jornadas-logic.mjs";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mxDate=when=>{
  const n=instant(when);
  if(!Number.isFinite(n))return "";
  const pieces=new Intl.DateTimeFormat("en-US",{timeZone:"America/Mexico_City",
    year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(n));
  const map=Object.fromEntries(pieces.map(p=>[p.type,p.value]));
  return [map.year,map.month,map.day].join("-");
};
export function ownMonthReport({logs,events,clocks,person,personId,uid,month}){
  if(!person||person.id!==personId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))
    throw Error("Selecciona un mes válido y una identidad de personal autorizada.");
  const byId=new Map((events||[]).map(event=>[event.id,event]));
  const rows=[],seen=new Set();
  for(const log of logs||[]){
    if(log?.ownerUid!==uid||log?.personId!==personId||!log.id||seen.has(log.eventId))continue;
    const event=byId.get(log.eventId),clock=clocks?.get?.(log.eventId);
    if(!event||clock?.status!=="finalizada")continue;
    if(!mxDate(clock.startedAt).startsWith(month+"-"))continue;
    const info=receiptData({log,event,clock,person,personId});
    const time=timeStatement({clock,event,personId,breakMins:log.breakMins||0});
    seen.add(log.eventId);
    rows.push({eventId:event.id,logId:log.id,day:mxDate(clock.startedAt),
      activity:info.activity,site:info.site,type:info.type,
      start:info.officialStart,end:info.officialEnd,
      breakMinutes:time.breakMinutes,netMinutes:time.netMinutes,
      plannedMinutes:time.plannedMinutes,extraMinutes:time.overtimeCandidateMinutes,
      status:log.paymentStatus||"capturado"});
  }
  rows.sort((a,b)=>a.day.localeCompare(b.day)||a.activity.localeCompare(b.activity,"es-MX"));
  const total=rows.reduce((a,r)=>({
    plannedMinutes:a.plannedMinutes+r.plannedMinutes,
    breakMinutes:a.breakMinutes+r.breakMinutes,
    netMinutes:a.netMinutes+r.netMinutes,
    overtimeCandidateMinutes:a.overtimeCandidateMinutes+r.extraMinutes
  }),{plannedMinutes:0,breakMinutes:0,netMinutes:0,overtimeCandidateMinutes:0});
  return {month,staffName:String(person.name||"Integrante de Dejavú Marketing"),
    dayCount:new Set(rows.map(r=>r.day)).size,activityCount:rows.length,rows,total};
}
const duration=minutes=>(minutes/60).toLocaleString("es-MX",{maximumFractionDigits:2})+" h";
export function monthlyReceiptHtml(report){
  const rows=report.rows.map(r=>'<tr><td>'+esc(r.day)+'</td><td>'+esc(r.activity)+
    '<small>'+esc(r.site)+'</small></td><td>'+esc(r.type)+'</td><td>'+
    esc(r.start)+'<small>'+esc(r.end)+'</small></td><td>'+duration(r.netMinutes)+'</td><td>'+
    duration(r.extraMinutes)+'</td><td>'+esc(r.status)+'</td></tr>').join("");
  return '<!doctype html><html lang="es-MX"><head><meta charset="utf-8">'+
    '<title>ÁGORA | Resumen de '+esc(report.month)+'</title>'+
    '<style>@page{size:A4 landscape;margin:12mm}body{font:12px/1.5 Arial,sans-serif;color:#252525;background:#f7f7f6}'+
    'main{max-width:1180px;margin:20px auto;padding:30px;background:white;border:1px solid #ddd}'+
    'h1{font-size:23px;margin:5px 0}h2{font-size:15px}p{margin:8px 0}small{display:block;color:#667077;font-size:10px}'+
    'table{width:100%;border-collapse:collapse;margin:22px 0}th,td{border:1px solid #dededb;padding:9px;text-align:left;vertical-align:top}'+
    'th{background:#f1f0ed}dl{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}dl div{padding:12px;background:#f8f6f0}'+
    'dt{color:#666;font-size:10px}dd{margin:4px 0 0;font-weight:700;font-size:17px}.notice{padding:12px;border-left:4px solid #af8a44;background:#fff7e8}'+
    '.tools{max-width:1180px;margin:auto;display:flex;gap:10px}button{padding:12px;background:#252729;color:#fff;border:0;border-radius:7px;cursor:pointer}'+
    '@media print{body{background:white;margin:0}.tools{display:none}main{max-width:none;margin:0;padding:0;border:0}}'+
    '</style></head><body><div class="tools"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>'+
    '<main><small>DEJAVÚ MARKETING · ÁGORA OPERACIONES · RESUMEN INDIVIDUAL</small>'+
    '<h1>Reporte de días y horas trabajadas</h1><p><b>'+esc(report.staffName)+'</b> · '+esc(report.month)+'</p>'+
    '<dl><div><dt>Días distintos con reporte</dt><dd>'+report.dayCount+'</dd></div>'+
    '<div><dt>Actividades documentadas</dt><dd>'+report.activityCount+'</dd></div>'+
    '<div><dt>Horas netas</dt><dd>'+duration(report.total.netMinutes)+'</dd></div>'+
    '<div><dt>Excedente para revisión</dt><dd>'+duration(report.total.overtimeCandidateMinutes)+'</dd></div></dl>'+
    '<p><b>Horas programadas:</b> '+duration(report.total.plannedMinutes)+
    ' · <b>Descansos registrados o declarados:</b> '+report.total.breakMinutes+' minutos</p>'+
    '<table><thead><tr><th>Fecha</th><th>Actividad / sede</th><th>Modalidad</th><th>Entrada / salida</th>'+
    '<th>Trabajadas netas</th><th>Excedente</th><th>Reporte</th></tr></thead><tbody>'+
    (rows||'<tr><td colspan="7">No hay jornadas finalizadas con reporte en este periodo.</td></tr>')+
    '</tbody></table>'+
    '<p class="notice">Este reporte corresponde únicamente a las actividades finalizadas con marcaje y reporte de horas. '+
    'El tiempo adicional no constituye una aprobación de horas extras ni una obligación de pago sin revisión de coordinación.</p>'+
    '<small>Documento informativo de operación, no es CFDI, nómina ni comprobante bancario. '+
    'No incluye ubicación, fotografía, datos bancarios ni tarifas internas.</small></main></body></html>';
}
