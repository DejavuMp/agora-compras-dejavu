/* ÁGORA · Ficha de Jornada / Evento. Modelado y PDF sin dependencias externas.
 * No publica enlaces a datos privados ni envía pagos/correos. */
import {buildPayroll,reviewLabel} from "./ops-payroll-preview.mjs";
const str=x=>String(x??"");
const ms=value=>{
 if(value?.toMillis)return value.toMillis();
 if(typeof value?.seconds==="number")return value.seconds*1000;
 const n=new Date(value).getTime();return Number.isFinite(n)?n:NaN;
};
const day=value=>{
 const n=ms(value);if(!Number.isFinite(n))return "";
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(n)).map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
};
const time=value=>{
 const n=ms(value);return Number.isFinite(n)?new Intl.DateTimeFormat("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(n)):"—";
};
const mxn=value=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(value)||0);
const money=x=>Math.round((Number(x)||0)*100)/100;
export const safeHtml=value=>str(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const active=e=>e?.status!=="cancelado";
const paired=(e,id)=>(e.staff||[]).find(x=>x.personId===id);
const personMap=people=>new Map((people||[]).map(x=>[x.id,x]));
const refDate=v=>{const x=ms(v);return Number.isFinite(x)?new Date(x).toISOString():""};
const review=(db,id,eventId)=>(db.incidents||[]).find(x=>x.type==="validacion_asistencia"&&x.personId===id&&x.eventId===eventId);
export function existingAssignments(db,personId,{excludeEventId="",start="",end=""}={}){
 const lower=ms(start),upper=ms(end);
 const result=[];
 for(const e of db.events||[]){
  if(!active(e)||e.id===excludeEventId)continue;
  for(const a of e.staff||[]){
   if(a.personId!==personId)continue;
   const first=ms(a.start),last=ms(a.end);
   if(Number.isFinite(lower)&&last<lower||Number.isFinite(upper)&&first>upper)continue;
   result.push({eventId:e.id,title:e.title||"Actividad",campaign:e.campaign||e.project||"",
     day:day(a.start),start:a.start,end:a.end,site:e.venueName||e.location||"",type:e.type||""});
  }
 }
 return result.sort((x,y)=>ms(x.start)-ms(y.start)||str(x.eventId).localeCompare(str(y.eventId)));
}
export function suggestedEventStaff(db,{campaign="",title="",site="",excludeEventId=""}={}){
 const norm=x=>str(x).trim().toLocaleLowerCase("es-MX");
 const c=norm(campaign),t=norm(title),v=norm(site);
 if(!c&&!t)return [];
 const matches=(db.events||[]).filter(e=>{
  if(!active(e)||!e.staff?.length||e.id===excludeEventId)return false;
  const ec=norm(e.campaign),et=norm(e.title),ev=norm(e.venueName||e.location);
  if(c&&ec!==c)return false;
  if(!c&&t&&et!==t)return false;
  if(v&&ev&&ev!==v)return false;
  return true;
 }).sort((a,b)=>ms(b.start)-ms(a.start));
 const chosen=new Map();
 for(const e of matches){
  for(const a of e.staff||[]){
   if(!chosen.has(a.personId))chosen.set(a.personId,{personId:a.personId,sourceEventId:e.id,sourceTitle:e.title,start:a.start,end:a.end});
  }
 }
 return [...chosen.values()];
}
export function buildJornadaSheet(db,eventId,{scope="evento"}={}){
 const all=(db.events||[]);
 const selected=all.find(x=>x.id===eventId);
 if(!selected)throw Error("La jornada seleccionada no existe.");
 const seriesId=selected.seriesId||selected.id;
 const events=(scope==="evento"?
    all.filter(x=>active(x)&&(x.seriesId||x.id)===seriesId):[selected])
   .sort((a,b)=>ms(a.start)-ms(b.start)||str(a.id).localeCompare(str(b.id)));
 if(!events.length)throw Error("No hay jornadas vigentes en el evento.");
 const people=personMap(db.people),unitMap=new Map((db.vehicles||[]).map(x=>[x.id,x]));
 const clocks=db.clocks||[],logs=db.logs||[];
 const roster=[],unique=new Set(),dates=new Map();
 for(const e of events){
  let d=day(e.start);
  if(!dates.has(d))dates.set(d,[]);
  for(const shift of e.staff||[]){
   const key=e.id+"|"+shift.personId;if(unique.has(key))continue;unique.add(key);
   const p=people.get(shift.personId)||{id:shift.personId,name:shift.personName||"Integrante por identificar",role:""};
   const clock=clocks.find(x=>x.eventId===e.id&&x.personId===shift.personId);
   const log=logs.find(x=>x.eventId===e.id&&x.personId===shift.personId);
   const adjudication=review(db,shift.personId,e.id);
   const staffLine={
    eventId:e.id,personId:shift.personId,person:p.name||"Personal",role:p.role||"",assignedByName:shift.assignedByName||e.assignedByName||"",
    phone:p.phone||"",date:day(shift.start)||d,day:d,activity:e.title||"Jornada",start:shift.start,end:shift.end,
    scheduledStart:time(shift.start),scheduledEnd:time(shift.end),
    actualStart:clock?.startedAt?time(clock.startedAt):log?.start?time(log.start):"Sin entrada",
    actualEnd:clock?.endedAt?time(clock.endedAt):log?.end?time(log.end):"Sin salida",
    attendance:reviewLabel(adjudication?.status||"pendiente"),reviewStatus:adjudication?.status||"pendiente",
    notes:adjudication?.notes||"",
    plannedHours:Math.max(0,Math.round((ms(shift.end)-ms(shift.start))/36000)/100),
    eventStatus:e.status||""
   };
   roster.push(staffLine);
   dates.get(d).push(staffLine);
  }
 }
 const months=[...new Set(roster.map(r=>r.date.slice(0,7)).filter(x=>/^\d{4}-(0[1-9]|1[0-2])$/.test(x)))];
 const payrollRows=[];
 for(const month of months){
   const monthDue=db.settings?.payrollPlan?.[month]||"";
   const payroll=buildPayroll({...db,events,month,dueDate:monthDue});
   payrollRows.push(...payroll.rows);
 }
 const payByKey=new Map(payrollRows.map(r=>[r.eventId+"|"+r.personId,r]));
 for(const r of roster){const p=payByKey.get(r.eventId+"|"+r.personId);r.payroll=p||null;}
 const calendar=[...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,lines])=>({
  date,count:lines.length,people:lines.map(x=>({id:x.personId,name:x.person,role:x.role,start:x.scheduledStart,end:x.scheduledEnd})),
  events:[...new Set(lines.map(x=>x.eventId))]
 }));
 const site=e=>e.venueName||db.sites?.find(x=>x.id===e.siteId)?.name||e.location||"Sin sede";
 const first=events[0];
 const amount=money(payrollRows.reduce((sum,r)=>sum+r.amount,0));
 const sumStatus=status=>money(payrollRows.filter(r=>r.status===status).reduce((a,r)=>a+r.amount,0));
 return {
  eventId:selected.id,seriesId,scope,folio:"DV-JOR-"+str(seriesId).replace(/[^a-zA-Z0-9-]/g,"").slice(0,30).toUpperCase(),
  title:first.title||"Jornada",campaign:first.campaign||"",project:first.project||"",type:first.type||"Actividad",
  site:site(first),dateFrom:day(events[0].start),dateTo:day(events.at(-1).end),
  scheduledStart:time(events[0].start),scheduledEnd:time(events.at(-1).end),
  status:first.status||"",days:calendar,events:events.map(e=>({
    id:e.id,day:day(e.start),start:time(e.start),end:time(e.end),title:e.title,
    site:site(e),dayIndex:e.dayIndex||null,dayCount:e.dayCount||null,
    vehicles:(e.vehicles||[]).map(id=>unitMap.get(id)?.name||id),
    travelMin:Number(e.travelMin)||0
  })),roster,assignedPeople:new Set(roster.map(r=>r.personId)).size,
  payroll:payrollRows,totals:{estimated:amount,authorized:sumStatus("Autorizado"),programmed:sumStatus("Programado"),
    paid:sumStatus("Pagado"),pending:sumStatus("Previsto")+sumStatus("Por autorizar")},
  generatedAt:new Date().toISOString(),moneyWarning:"Importes internos estimados; no equivalen a pago realizado ni CFDI."
 };
}
export function jornadaShareText(report,{includePayroll=false}={}){
 const lines=["Dejavú Marketing · Ficha de jornada",report.title,
   "Folio: "+report.folio,"Campaña: "+(report.campaign||report.project||"Sin definir"),
   "Sede: "+report.site,"Fechas: "+report.dateFrom+(report.dateTo!==report.dateFrom?" al "+report.dateTo:""),
   "Jornadas: "+report.events.length+" · Personal: "+report.assignedPeople];
 for(const event of report.events.slice(0,12))lines.push(event.day+" · "+event.start+"–"+event.end+" · "+event.title);
 if(report.events.length>12)lines.push("Y "+(report.events.length-12)+" jornadas más.");
 if(includePayroll){lines.push("PRENÓMINA INTERNA (confidencial)","Total estimado: "+mxn(report.totals.estimated),
   "Autorizado: "+mxn(report.totals.authorized),"Programado: "+mxn(report.totals.programmed),
   "Pagado: "+mxn(report.totals.paid));}
 lines.push("Documento generado desde ÁGORA. Revisa el PDF adjunto antes de distribuir.");
 return lines.join("\n");
}
export function jornadaEmail(report,options={}){
 return {subject:"ÁGORA Dejavú | Jornada "+report.title+" | "+report.dateFrom,
   body:jornadaShareText(report,options)+"\n\nAdjunto la ficha PDF de la jornada para su revisión.\n\nDejavú Marketing"};
}
// Generador mínimo de PDF A4 apaisado válido con fuentes Standard 14 (WinAnsi).
// Sin subida a servicios externos, hojas blancas ni dependencias de red.
function pdfCharacters(text){
 return str(text).replace(/[\u2013\u2014]/g,"-").replace(/[\u2018\u2019]/g,"'")
   .replace(/[\u201c\u201d]/g,'"').replace(/[\u2022]/g,"-")
   .replace(/\u20ac/g,"EUR").replace(/[^\u0020-\u00ff]/g,"?");
}
function literal(text){
 return pdfCharacters(text).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}
function byteArray(text){return Uint8Array.from(Array.from(text),c=>c.charCodeAt(0)&255)}
function lineWrap(text,limit=112){
 const words=pdfCharacters(text).split(/\s+/),lines=[];
 let cur="";
 for(const word of words){
  if((cur+" "+word).trim().length>limit&&cur){lines.push(cur);cur=""}
  if(word.length>limit){if(cur){lines.push(cur);cur=""}for(let i=0;i<word.length;i+=limit)lines.push(word.slice(i,i+limit));continue}
  cur=(cur?cur+" ":"")+word;
 }
 if(cur)lines.push(cur);
 return lines.length?lines:[""];
}
function makePdf(pages){
 const objects=[""];const pageRefs=[],contentRefs=[];const fontRef=3+2*pages.length;
 for(let i=0;i<pages.length;i++){pageRefs.push(3+2*i);contentRefs.push(4+2*i)}
 objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
 objects[2]="<< /Type /Pages /Kids [ "+pageRefs.map(x=>x+" 0 R").join(" ")+" ] /Count "+pages.length+" >>";
 for(let i=0;i<pages.length;i++){
  objects[pageRefs[i]]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 "+fontRef+" 0 R /F2 "+(fontRef+1)+" 0 R >> >> /Contents "+contentRefs[i]+" 0 R >>";
  const commands=["0.14 0.15 0.17 rg","36 554 770 3 re f"];
  let y=534;
  for(const item of pages[i]){
   const size=item.title?16:item.section?12:9.5;
   commands.push("0.13 0.14 0.16 rg","BT /"+(item.title||item.section?"F2":"F1")+" "+size+" Tf 42 "+y+" Td ("+literal(item.text)+") Tj ET");
   y-=item.title?27:item.section?19:13;
  }
  commands.push("0.40 0.41 0.43 rg","BT /F1 8 Tf 42 20 Td (Dejavu Marketing - Documento interno - Pagina "+(i+1)+"/"+pages.length+") Tj ET");
  const stream=commands.join("\n")+"\n";
  objects[contentRefs[i]]="<< /Length "+byteArray(stream).length+" >>\nstream\n"+stream+"endstream";
 }
 objects[fontRef]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
 objects[fontRef+1]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
 let doc="%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";const offsets=[0];
 for(let i=1;i<objects.length;i++){
  offsets[i]=byteArray(doc).length;
  doc+=i+" 0 obj\n"+objects[i]+"\nendobj\n";
 }
 const xref=byteArray(doc).length;
 doc+="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
 for(let i=1;i<objects.length;i++)doc+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
 doc+="trailer\n<< /Size "+objects.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
 return byteArray(doc);
}
export function jornadaPdf(report,{includePayroll=false}={}){
 const lines=[];
 const add=(text,style="")=>{
  for(const chunk of lineWrap(text,style==="title"?74:112))lines.push({text:chunk,title:style==="title",section:style==="section"});
 };
 add("DEJAVÚ MARKETING | FICHA DE JORNADA","title");
 add(report.title+" · "+report.type,"section");
 add("Folio: "+report.folio+" | "+report.dateFrom+" a "+report.dateTo);
 add("Campaña: "+(report.campaign||"Sin indicar")+" | Proyecto: "+(report.project||"Sin indicar"));
 add("Sucursal: "+report.site+" | Personal único: "+report.assignedPeople);
 add("CALENDARIO OPERATIVO","section");
 for(const e of report.events){
  add(e.day+"  "+e.start+" - "+e.end+"  "+e.title+"  "+e.site);
  if(e.vehicles.length)add("Camionetas: "+e.vehicles.join(", ")+" | Trayecto previsto: "+e.travelMin+" min");
 }
 add("PERSONAL ASIGNADO Y ASISTENCIA","section");
 if(!report.roster.length)add("No hay personal asignado.");
 for(const r of report.roster){
  add(r.date+" | "+r.person+" ("+(r.role||"Personal")+") | Previsto "+r.scheduledStart+"-"+r.scheduledEnd+" | Asigno: "+(r.assignedByName||"No registrado"));
  add("Entrada: "+r.actualStart+" | Salida: "+r.actualEnd+" | Revisión: "+r.attendance);
 }
 if(includePayroll){
  add("PRENÓMINA DEL EVENTO · CONFIDENCIAL","section");
  for(const p of report.payroll){
   add(p.date+" | "+p.person+" | "+p.hours.toFixed(2)+" h | "+p.basis+" | Tarifa "+mxn(p.rate)+" | "+mxn(p.amount));
   add("Estado de pago: "+p.status+" | Asistencia: "+p.attendance+" | Pago previsto: "+(p.dueDate||"Por definir"));
  }
  add("Total estimado "+mxn(report.totals.estimated)+" | Autorizado "+mxn(report.totals.authorized));
  add("Programado "+mxn(report.totals.programmed)+" | Pagado "+mxn(report.totals.paid)+" | Por revisar "+mxn(report.totals.pending));
  add(report.moneyWarning);
 }else add("Este PDF operativo no incluye tarifas ni importes. La prenómina es de uso exclusivo de coordinación.");
 add("Documento generado desde ÁGORA · Las horas reales requieren validación de coordinación.");
 const pages=[];let current=[],y=0;
 for(const row of lines){
  const h=row.title?27:row.section?19:13;
  if(current.length&&y+h>500){pages.push(current);current=[];y=0}
  current.push(row);y+=h;
 }
 if(current.length)pages.push(current);
 return makePdf(pages);
}
