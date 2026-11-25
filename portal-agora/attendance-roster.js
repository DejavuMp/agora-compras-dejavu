/**
 * Lista de jornada: RELOJ OFICIAL y VALIDACIÓN POR QR son fuentes distintas.
 * Lee exclusivamente documentos autorizados por canEdit(); no consulta pagos.
 */
import {collection,query,where,getDocsFromServer}
 from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const asDate=v=>v?.toDate?v.toDate():new Date(v);
const formatTime=v=>{
 if(!v)return "—";
 const d=asDate(v);
 return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(d):"—";
};
const formatDay=v=>{
 const d=asDate(v);
 return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat("es-MX",{weekday:"short",day:"numeric",month:"short"}).format(d):"Por confirmar";
};
const sessions=new WeakMap();
function eventRoster(schedule,eventId){
 const e=(schedule?.payload?.events||[]).find(x=>String(x?.id)===eventId);
 if(!e)return null;
 const names=new Map((schedule?.payload?.people||[]).map(p=>[p.id,String(p.name||"Personal")]));
 const roster=(Array.isArray(e.staff)?e.staff:[]).map(slot=>({
   personId:String(slot.personId||""),
   name:names.get(slot.personId)||String(slot.personName||"Integrante asignado")
 })).filter(x=>x.personId);
 return {name:String(e.title||e.project||"Jornada"),date:e.start,roster};
}
export function rosterEvents(schedule,now=new Date()){
 const time=now.getTime();
 return (Array.isArray(schedule?.payload?.events)?schedule.payload.events:[])
  .filter(e=>e?.id&&e.status!=="cancelado"&&e.status!=="borrador"&&
    Number.isFinite(asDate(e.start).getTime())&&
    Math.abs(asDate(e.start).getTime()-time)<30*86400000)
  .sort((a,b)=>asDate(a.start).getTime()-asDate(b.start).getTime())
  .slice(0,100)
  .map(e=>({id:String(e.id),title:String(e.title||e.project||"Jornada"),date:e.start}));
}
function renderSelect(session){
 const {target,events}=session;
 target.innerHTML='<label class="attendance-roster-select-label">Jornada a revisar'+
   '<select id="attendance-roster-select"><option value="">Selecciona la jornada…</option>'+
   events.map(e=>'<option value="'+esc(e.id)+'">'+esc(formatDay(e.date))+' · '+esc(e.title)+'</option>').join("")+
   '</select></label>'+
   '<div id="attendance-roster-results" role="status" aria-live="polite">'+
     '<p class="credential-attendance-empty">Selecciona una jornada para consultar las verificaciones.</p></div>'+
   '<p class="credential-attendance-foot">El reloj oficial registra el marcaje del titular. La verificación QR se registra por Coordinación y aparece en una columna separada; no se sustituyen ni mezclan las horas.</p>';
 const select=target.querySelector("select");
 select.addEventListener("change",()=>loadRoster(session,select.value));
}
async function loadRoster(session,eventId){
 const box=session.target.querySelector("#attendance-roster-results");
 if(!box)return;
 if(!eventId){box.textContent="Selecciona una jornada.";return}
 const event=eventRoster(session.schedule,eventId);
 if(!event){box.textContent="No se encontró la jornada.";return}
 box.textContent="Consultando reloj oficial y validaciones QR…";
 try{
  const [clockSnaps,qrSnaps,entrySnaps]=await Promise.all([
   getDocsFromServer(query(collection(session.db,"agora_ops_clock"),where("eventId","==",eventId))),
   getDocsFromServer(query(collection(session.db,"agora_ops_incidents"),where("eventId","==",eventId))),
   getDocsFromServer(collection(session.db,"agora_ops_attendance_sheets",eventId,"entries"))
  ]);
  const assigned=new Set(event.roster.map(p=>p.personId));
  const clockByPerson=new Map();
  for(const snapshot of clockSnaps.docs){
   const data=snapshot.data();
   if(data.eventId!==eventId||!assigned.has(data.personId))continue;
   clockByPerson.set(data.personId,{
    status:data.status,startedAt:data.startedAt,endedAt:data.endedAt
   });
  }
  const scanByPerson=new Map();
  for(const snapshot of qrSnaps.docs){
   const v=snapshot.data();
   if(v.eventId!==eventId||!assigned.has(v.personId)||
      !["validacion_asistencia","validacion_actividad"].includes(v.type))continue;
   const previous=scanByPerson.get(v.personId)||{};
   if(v.type==="validacion_asistencia"&&v.status==="entrada")
    previous.entrada=v.updatedAt;
   if(v.type==="validacion_asistencia"&&v.status==="salida")
    previous.salida=v.updatedAt;
   if(v.type==="validacion_actividad"&&v.status==="actividad_verificada")
    previous.actividades=(previous.actividades||0)+1;
   scanByPerson.set(v.personId,previous);
  }
  for(const snapshot of entrySnaps.docs){
   const v=snapshot.data();
   if(!assigned.has(v.personId)||!['entrada','salida'].includes(v.action))continue;
   const previous=scanByPerson.get(v.personId)||{};
   if(v.status==='validado')previous[v.action]=v.capturedAt||v.createdAt;
   else previous.pending=true;
   previous.source=v.source;previous.reviewer=v.actorName||"";
   scanByPerson.set(v.personId,previous);
  }
  const rows=event.roster.map(person=>{
   const clock=clockByPerson.get(person.personId);
   const scan=scanByPerson.get(person.personId);
   const qrSummary=scan?[
    scan.entrada?"Entrada "+formatTime(scan.entrada):"",
    scan.salida?"Salida "+formatTime(scan.salida):"",
    scan.actividades?"Actividades "+scan.actividades:""
   ].filter(Boolean).join(" · "):"—";
   const status=clock?.status==="finalizada"?"Salida oficial registrada":
     clock?.status==="en_curso"?"Reloj oficial en curso":
    scan?.pending?"Pase pendiente de validación":
    scan?(scan.source==="remoto"?"Pase remoto · "+(scan.reviewer||"Responsable"):
      scan.source?"Pase "+scan.source+" · Sin marcaje oficial":"QR verificado · Sin marcaje oficial"):
      "Sin registro";
   return '<tr><td>'+esc(person.name)+'</td>'+
    '<td>'+esc(formatTime(clock?.startedAt))+'</td>'+
    '<td>'+esc(formatTime(clock?.endedAt))+'</td>'+
    '<td>'+esc(qrSummary)+'</td>'+
    '<td><span class="attendance-roster-state">'+esc(status)+'</span></td></tr>';
  }).join("");
  box.innerHTML='<div class="attendance-roster-summary"><strong>'+esc(event.name)+'</strong>'+
    '<span>'+event.roster.length+' integrante(s) asignados</span></div>'+
    (event.roster.length?'<div class="attendance-roster-table-scroll"><table class="attendance-roster-table">'+
     '<thead><tr><th>Integrante</th><th>Reloj entrada</th><th>Reloj salida</th><th>Pase de lista</th><th>Estado</th></tr></thead>'+
     '<tbody>'+rows+'</tbody></table></div>':
     '<p>No hay personal registrado en esta jornada.</p>')+
    '<button type="button" class="profile-button profile-button-outline" data-roster-reload="'+esc(eventId)+'">Actualizar lista</button>';
 }catch(e){
  box.textContent="No fue posible consultar la lista. Revisa tus permisos de coordinación o la conexión.";
  console.warn("Lista:",e?.code||e);
 }
}
export function mountRoster({db,target,schedule}){
 if(!target)return;
 let session=sessions.get(target);
 if(session){
  session.schedule=schedule;session.events=rosterEvents(schedule);
  renderSelect(session);return;
 }
 session={db,target,schedule,events:rosterEvents(schedule)};
 sessions.set(target,session);
 renderSelect(session);
 target.addEventListener("click",event=>{
  const button=event.target.closest("[data-roster-reload]");
  if(button)loadRoster(session,button.getAttribute("data-roster-reload"));
 });
}
