/**
 * ÁGORA Operaciones por rol: proyecciones sin escrituras.
 * No exponer tarifas, nóminas, GPS, banco ni tiempos de traslado.
 */
const text=(v,n=200)=>String(v??"").trim().slice(0,n);
const instant=v=>v instanceof Date?v.getTime():typeof v?.toMillis==="function"?v.toMillis():typeof v?.seconds==="number"?v.seconds*1000:new Date(v).getTime();
const dayKey=v=>{
 const ms=instant(v);if(!Number.isFinite(ms))return "";
 const d=new Date(ms);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
};
const liveEvent=e=>e&&e.status!=="cancelado"&&e.status!=="borrador";
export function ownJornadas(doc,now=new Date(),max=50){
 const personId=text(doc?.personId,120);
 if(!personId||!Array.isArray(doc?.events))return [];
 const list=[];
 for(const event of doc.events){
  if(!liveEvent(event))continue;
  const mine=Array.isArray(event.staff)?event.staff.find(a=>a?.personId===personId):null;
  if(!mine)continue;
  const start=instant(mine.start??event.start),end=instant(mine.end??event.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<instant(now)-7*86400000)continue;
  const raw=Array.isArray(mine.activities)?mine.activities:Array.isArray(event.activities)?event.activities:[];
  const activities=raw.map((a,i)=>({
   key:text(a?.id||String(i+1),80),
   name:text(typeof a==="string"?a:a?.name||a?.title||a?.description,240),
   status:text(a?.status||"pendiente",30)
  })).filter(a=>a.name);
  const label=text(mine.activity||event.activity,240);
  if(label&&!activities.some(a=>a.name===label))activities.unshift({key:"origen",name:label,status:"asignada"});
  list.push({
   key:text(event.id,120),title:text(event.title||event.project||event.campaign||"Jornada",180),
   project:text(event.project||event.campaign,180),
   site:text(event.venueName||event.siteName||event.location||"Por confirmar",180),
   start,end,day:dayKey(start),status:text(event.status||"programada",30),
   responsible:text(mine.assignedByName||event.assignedByName||"Por confirmar",140),
   instructions:text(mine.instructions||event.instructions,400),activities
  });
 }
 return list.sort((a,b)=>a.start-b.start).slice(0,Math.max(1,Math.min(Number(max)||50,100)));
}
export function coordinationJornadas(schedule,now=new Date(),max=80){
 const events=Array.isArray(schedule?.payload?.events)?schedule.payload.events:[];
 const list=[];
 for(const e of events){
  if(!liveEvent(e))continue;
  const start=instant(e.start),end=instant(e.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<instant(now)-14*86400000)continue;
  list.push({
   key:text(e.id,120),title:text(e.title||e.project||e.campaign||"Jornada",180),
   project:text(e.project||e.campaign,140),
   site:text(e.venueName||e.siteName||e.location||"Por confirmar",180),
   start,end,day:dayKey(start),status:text(e.status||"programada",30),
   staffCount:Array.isArray(e.staff)?e.staff.length:0,
   activitiesCount:Array.isArray(e.activities)?e.activities.length:
    Array.isArray(e.staff)?e.staff.filter(a=>a?.activity).length:0
  });
 }
 return list.sort((a,b)=>a.start-b.start).slice(0,Math.max(1,Math.min(Number(max)||80,100)));
}
export function operationTotals(list,now=new Date()){
 const day=dayKey(now),future=instant(now);
 return {
  today:list.filter(x=>x.day===day).length,
  upcoming:list.filter(x=>x.start>=future).length,
  assignments:list.reduce((n,x)=>n+(x.staffCount||0),0)
 };
}
export const REQUEST_CHANNELS=Object.freeze(["WhatsApp","Llamada","Correo","Presencial","Otro"]);
export function validateAssignmentDraft(v){
 const requester=text(v.requester,140),channel=text(v.channel,30),
  project=text(v.project,150),site=text(v.site,150),date=text(v.date,10),
  start=text(v.start,5),end=text(v.end,5);
 const activities=(Array.isArray(v.activities)?v.activities:[]).map(x=>text(x,200)).filter(Boolean);
 if(!requester)throw Error("Indica quién solicitó la jornada.");
 if(!REQUEST_CHANNELS.includes(channel))throw Error("Selecciona el medio de solicitud.");
 if(!project)throw Error("Indica el proyecto o motivo.");
 if(!site)throw Error("Indica la sede.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(instant(date+"T12:00:00")))
  throw Error("Indica una fecha válida.");
 if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||
     !Number.isFinite(instant(date+"T"+start+":00"))||
     !Number.isFinite(instant(date+"T"+end+":00")))throw Error("Indica horarios válidos.");
 return {
  requester,channel,contact:text(v.contact,120),requestedAt:text(v.requestedAt,40),
  project,site,date,start,end,description:text(v.description,600),activities,
  headcount:Math.max(1,Math.min(999,Math.round(Number(v.headcount)||1))),
  evidenceNote:text(v.evidenceNote,400),capturedBy:text(v.capturedBy,150)
 };
}
export function assignmentDraftText(value){
 const d=validateAssignmentDraft(value);
 return [
  "ÁGORA · BORRADOR DE SOLICITUD (NO REGISTRADO)",
  "Solicitado por: "+d.requester,"Medio: "+d.channel,
  "Contacto: "+(d.contact||"No indicado"),
  "Recibido: "+(d.requestedAt||"Sin registrar"),
  "Capturado por: "+(d.capturedBy||"Sesión actual"),
  "Proyecto: "+d.project,"Sede: "+d.site,
  "Jornada: "+d.date+" · "+d.start+" – "+d.end,
  "Personal requerido: "+d.headcount,
  "Trabajo solicitado: "+(d.description||"Sin detalle adicional"),
  "Actividades:",...((d.activities.length?d.activities:["Por definir"]).map((a,i)=>String(i+1)+". "+a)),
  "Evidencia: "+(d.evidenceNote||"No adjuntada"),
  "Estado: BORRADOR. No hay autorización, asignación ni archivo guardado en Firebase."
 ].join("\n");
}
