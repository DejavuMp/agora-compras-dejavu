/* ÁGORA: prenómina interna. Solo se usa en la vista de coordinación.
   No emite CFDI, no envía correos, no marca pagos como realizados. */
const s=v=>String(v??"");
const esc=v=>s(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const numeric=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>Math.round(numeric(v)*100)/100;
const dateValue=v=>Number.isFinite(new Date(v).getTime())?new Date(v).getTime():NaN;
const isoDay=v=>{
 const t=dateValue(v);if(!Number.isFinite(t))return "";
 const x=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return x.year+"-"+x.month+"-"+x.day;
};
export function phaseByTime(event,now=Date.now()){
 if(event?.status==="cancelado")return "cancelado";
 const st=dateValue(event?.start),en=dateValue(event?.end);
 if(!Number.isFinite(st)||!Number.isFinite(en)||st>=en)return "sin_horario";
 return now<st?"programada":now<en?"en_curso":"terminada_programacion";
}
export function attendanceReviewId(personId,eventId){
 let h=2166136261>>>0;
 for(const ch of s(personId)+"\u001f"+s(eventId))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
 return "asistencia_"+h.toString(16).padStart(8,"0");
}
export const ATTENDANCE_DECISIONS=["pendiente","correcta","retardo","falta","justificada","observacion"];
export function officialReview(incidents,personId,eventId){
 return (incidents||[]).find(i=>i.type==="validacion_asistencia"&&i.personId===personId&&i.eventId===eventId)||null;
}
export const reviewLabel=v=>({pendiente:"Pendiente de coordinación",correcta:"Correcta",retardo:"Retardo validado",falta:"Falta validada",justificada:"Justificada",observacion:"Requiere aclaración"})[v]||"Pendiente de coordinación";
export function buildPayroll({events=[],people=[],logs=[],incidents=[],month="",dueDate="",includeForecast=true}={}){
 if(!/^\d{4}-\d{2}$/.test(month))throw Error("Mes inválido");
 if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw Error("Fecha prevista de pago inválida");
 const monthTag=month.replace("-",""),byPerson=new Map(people.map(p=>[p.id,p]));
 const byEvent=new Map(events.map(e=>[e.id,e]));
 const logByPair=new Map();
 for(const log of logs){
   if(!log.eventId||!log.personId)continue;
   const key=log.eventId+"\u001f"+log.personId;
   if(!logByPair.has(key)||s(log.id)<s(logByPair.get(key).id))logByPair.set(key,log);
 }
 const rows=[],keys=new Set();
 function add(event,person,shift,log){
   const key=event.id+"\u001f"+person.id;
   if(keys.has(key))return;keys.add(key);
   const actual=log&&Number.isFinite(dateValue(log.start))&&Number.isFinite(dateValue(log.end))&&dateValue(log.end)>dateValue(log.start);
   const from=actual?log.start:shift.start,to=actual?log.end:shift.end;
   const shiftMinutes=Math.max(0,(dateValue(to)-dateValue(from))/60000);
   const hours=Math.max(0,(shiftMinutes-numeric(actual?log.breakMins:0))/60);
   const basis=log?.paymentBasis==="jornada"?"jornada":log?.paymentBasis==="hora"?"hora":
     person.hourRate>0?"hora":person.dayRate>0?"jornada":"hora";
   const rate=numeric(basis==="jornada"?person.dayRate:person.hourRate);
   const base=basis==="jornada"?rate:hours*rate;
   const approved=log&&["validado","programado","pagado"].includes(log.paymentStatus)&&Number.isFinite(Number(log.approvedAmount))&&log.approvedAmount!=null;
   const amount=money(approved?log.approvedAmount:base);
   const review=officialReview(incidents,person.id,event.id);
   const status=log?.paymentStatus==="pagado"?"Pagado":log?.paymentStatus==="programado"?"Programado":
     approved?"Autorizado":log?.paymentStatus==="solicitado"?"Por autorizar":"Previsto";
   const verified=review?.status||"pendiente";
   const folio="DV-"+monthTag+"-"+String(rows.length+1).padStart(4,"0");
   rows.push({folio,eventId:event.id,logId:log?.id||"",personId:person.id,
     person:person.name||"Sin nombre",project:event.project||"",campaign:event.campaign||"",
     activity:event.title||"",date:isoDay(shift.start),start:from,end:to,hours:Math.round(hours*100)/100,
     basis,rate:money(rate),amount,status,attendance:reviewLabel(verified),reviewCode:verified,
     dueDate:log?.paymentDueDate||dueDate||"",isApproved:!!approved,
     notes:log?.returnNote||"",hasTariff:rate>0});
 }
 for(const e of events){
   if(e.status==="cancelado")continue;
   for(const shift of e.staff||[]){
     const person=byPerson.get(shift.personId);
     if(!person||!shift.start||!shift.end||isoDay(shift.start).slice(0,7)!==month)continue;
     const log=logByPair.get(e.id+"\u001f"+person.id);
     if(!includeForecast&&!log)continue;
     add(e,person,shift,log);
   }
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.person.localeCompare(b.person)||a.eventId.localeCompare(b.eventId));
 rows.forEach((row,index)=>row.folio="DV-"+monthTag+"-"+String(index+1).padStart(4,"0"));
 const selected=rows.filter(row=>row.status!=="Pagado");
 const total=money(selected.reduce((x,row)=>x+row.amount,0));
 const authorized=money(selected.filter(r=>r.isApproved).reduce((x,row)=>x+row.amount,0));
 const pending=money(selected.filter(r=>!r.isApproved).reduce((x,row)=>x+row.amount,0));
 return {folio:"DV-PRENOM-"+monthTag,month,dueDate,rows,total,authorized,pending,
   currency:"MXN",generatedAt:new Date().toISOString(),count:rows.length};
}
const mxn=v=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(numeric(v));
export function payrollHtml(data){
 const table=data.rows.map(r=>'<tr><td>'+esc(r.folio)+'</td><td>'+esc(r.person)+'</td><td>'+esc(r.date)+'</td>'+
   '<td>'+esc(r.activity)+'</td><td>'+esc(r.project||r.campaign)+'</td><td>'+esc(r.hours.toFixed(2))+'</td>'+
   '<td>'+esc(r.basis)+'</td><td>'+esc(mxn(r.rate))+'</td><td>'+esc(mxn(r.amount))+'</td>'+
   '<td>'+esc(r.attendance)+'</td><td>'+esc(r.status)+'</td><td>'+esc(r.dueDate)+'</td></tr>').join("");
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+esc(data.folio)+'</title>'+
 '<style>body{font:12px Arial;color:#222;margin:30px}h1{font-size:23px}header{border-bottom:3px solid #af9058;padding-bottom:15px}'+
 'table{width:100%;border-collapse:collapse;font-size:10px}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}th{background:#eee}'+
 '.summary{display:flex;gap:30px;margin:20px 0}.summary div{padding:10px;border:1px solid #ddd}.note{font-size:11px;color:#555}'+
 '@media print{button{display:none}body{margin:9mm}@page{size:landscape;margin:10mm}}</style></head><body>'+
 '<header><h1>DEJAVÚ MARKETING · Prenómina interna</h1><p>Folio: '+esc(data.folio)+' · Período: '+esc(data.month)+
 ' · Pago previsto: '+esc(data.dueDate||"Sin fecha")+'</p><p class="note">Documento de planeación, no CFDI de nómina ni constancia de transferencia. Los importes previstos requieren validación.</p></header>'+
 '<div class="summary"><div>Total previsto: <b>'+mxn(data.total)+'</b></div><div>Autorizado: <b>'+mxn(data.authorized)+
 '</b></div><div>Pendiente: <b>'+mxn(data.pending)+'</b></div></div>'+
 '<button onclick="window.print()">Imprimir / Guardar como PDF</button><table><thead><tr>'+[
 'Folio','Integrante','Fecha','Actividad','Proyecto','Horas','Modalidad','Tarifa','Importe','Asistencia','Pago','Fecha prevista'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+table+
 '</tbody></table><p class="note">Preparado para revisión administrativa. No incluye CLABE, domicilio, ubicación GPS ni datos médicos.</p></body></html>';
}
export function payrollEmail(data){
 return {subject:"Dejavú | Prenómina prevista "+data.month+" | "+data.folio,
 body:"Comparto la prenómina interna del período "+data.month+".\nFolio: "+data.folio+
 "\nFecha prevista de pago: "+(data.dueDate||"Por definir")+
 "\nJornadas: "+data.count+"\nTotal previsto: "+mxn(data.total)+
 "\nAutorizado: "+mxn(data.authorized)+"\nPor revisar: "+mxn(data.pending)+
 "\n\nAdjunto el archivo de prenómina para revisión y programación del pago. No acredita pago realizado.\n\nDejavú Marketing"};
}
// ZIP no comprimido válido para Excel, sin dependencias de terceros ni fórmulas ejecutables.
const encoder=new TextEncoder();
const u16=(b,v)=>{b.push(v&255,(v>>>8)&255)};
const u32=(b,v)=>{u16(b,v);u16(b,v>>>16)};
const crc32=bytes=>{let c=0xffffffff;for(const v of bytes){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0};
function zip(entries){
 const chunks=[],central=[];let offset=0;
 for(const [name,xml] of entries){
   const n=encoder.encode(name),data=encoder.encode(xml),crc=crc32(data),local=[];
   u32(local,0x04034b50);u16(local,20);u16(local,0);u16(local,0);u16(local,0);u16(local,0);
   u32(local,crc);u32(local,data.length);u32(local,data.length);u16(local,n.length);u16(local,0);
   chunks.push(new Uint8Array(local),n,data);
   const cd=[];u32(cd,0x02014b50);u16(cd,20);u16(cd,20);u16(cd,0);u16(cd,0);u16(cd,0);u16(cd,0);
   u32(cd,crc);u32(cd,data.length);u32(cd,data.length);u16(cd,n.length);u16(cd,0);u16(cd,0);u16(cd,0);u16(cd,0);u32(cd,0);u32(cd,offset);
   central.push(new Uint8Array(cd),n);offset+=local.length+n.length+data.length;
 }
 const centralStart=offset;for(const part of central){chunks.push(part);offset+=part.length}
 const end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,entries.length);u16(end,entries.length);u32(end,offset-centralStart);u32(end,centralStart);u16(end,0);chunks.push(new Uint8Array(end));offset+=end.length;
 const output=new Uint8Array(offset);let pos=0;for(const part of chunks){output.set(part,pos);pos+=part.length}return output;
}
function sheet(rows){
 const cell=(v,i)=>{const col=(()=>{let x=i+1,q="";while(x){x--;q=String.fromCharCode(65+x%26)+q;x=Math.floor(x/26)}return q})();
   const type=typeof v==="number"&&Number.isFinite(v)?"n":"inlineStr";
   return '<c r="'+col+'" t="'+type+'">'+(type==="n"?"<v>"+v+"</v>":"<is><t xml:space=\"preserve\">"+esc(v)+"</t></is>")+"</c>";
 };
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
 rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map(cell).join('')+'</row>').join('')+
 '</sheetData></worksheet>';
}
export function payrollXlsx(data){
 const columns=["Folio","Integrante","Proyecto","Campaña","Actividad","Fecha","Inicio","Fin","Horas","Modalidad","Tarifa MXN","Importe MXN","Asistencia","Estado de pago","Pago previsto","Referencia"];
 const rows=data.rows.map(r=>[r.folio,r.person,r.project,r.campaign,r.activity,r.date,r.start,r.end,r.hours,r.basis,r.rate,r.amount,r.attendance,r.status,r.dueDate,r.logId||r.eventId]);
 const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Prenomina" sheetId="1" r:id="rId1"/><sheet name="Resumen" sheetId="2" r:id="rId2"/></sheets></workbook>';
 const rels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>';
 const root='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 const types='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
 return zip([["[Content_Types].xml",types],["_rels/.rels",root],["xl/workbook.xml",workbook],["xl/_rels/workbook.xml.rels",rels],
 ["xl/worksheets/sheet1.xml",sheet([columns,...rows])],
 ["xl/worksheets/sheet2.xml",sheet([["Folio",data.folio],["Mes",data.month],["Fecha prevista",data.dueDate],["Jornadas",data.count],["Total previsto MXN",data.total],["Autorizado MXN",data.authorized],["Pendiente MXN",data.pending],["Aviso","Prenómina interna, no CFDI SAT ni pago realizado"]])]]);
}
