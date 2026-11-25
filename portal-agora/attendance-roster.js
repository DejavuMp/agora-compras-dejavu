/**
 * Lista de entrada/salida para coordinación y administración.
 * SOLO consulta marcajes oficiales existentes; no inventa presencias.
 * Las reglas Firestore limitan agora_ops_clock a canEdit() o titular.
 */
import {collection,query,where,getDocsFromServer}
 from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const toDate=v=>v?.toDate?v.toDate():new Date(v);
const readableTime=v=>{
 if(!v)return "—";
 const d=toDate(v);
 return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(d):"—";
};
const readableDay=v=>{
 const d=toDate(v);
 return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat("es-MX",{weekday:"short",day:"numeric",month:"short"}).format(d):"Por confirmar";
};
const sessions=new WeakMap();
function eventRoster(schedule,eventId){
 const e=(schedule?.payload?.events||[]).find(x=>x?.id===eventId);
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
    Number.isFinite(toDate(e.start).getTime())&&
    Math.abs(toDate(e.start).getTime()-time)<30*86400000)
  .sort((a,b)=>toDate(a.start).getTime()-toDate(b.start).getTime())
  .slice(0,100)
  .map(e=>({id:String(e.id),title:String(e.title||e.project||"Jornada"),date:e.start}));
}
function renderSelect(session){
 const {target,events}=session;
 target.innerHTML='<label class="attendance-roster-select-label">Jornada a revisar'+
   '<select id="attendance-roster-select"><option value="">Selecciona la jornada…</option>'+
   events.map(e=>'<option value="'+esc(e.id)+'">'+esc(readableDay(e.date))+' · '+esc(e.title)+'</option>').join("")+
   '</select></label>'+
   '<div id="attendance-roster-results" role="status" aria-live="polite">'+
     '<p class="credential-attendance-empty">Selecciona una jornada para consultar la lista oficial.</p></div>'+
   '<p class="credential-attendance-foot">La lista se lee desde los marcajes oficiales en Firebase. Escanear una credencial confirma su identidad, pero no registra entrada o salida automáticamente.</p>';
 const select=target.querySelector("select");
 select.addEventListener("change",()=>loadRoster(session,select.value));
}
async function loadRoster(session,eventId){
 const box=session.target.querySelector("#attendance-roster-results");
 if(!box)return;
 if(!eventId){box.textContent="Selecciona una jornada.";return}
 const event=eventRoster(session.schedule,eventId);
 if(!event){box.textContent="No se encontró la jornada seleccionada.";return}
 box.textContent="Consultando entradas y salidas oficiales…";
 try{
  const q=query(collection(session.db,"agora_ops_clock"),where("eventId","==",eventId));
  const snaps=await getDocsFromServer(q);
  const byPerson=new Map();
  for(const d of snaps.docs){
   const v=d.data();
   if(v.eventId!==eventId||!event.roster.some(r=>r.personId===v.personId))continue;
   // Evitar exponer el GPS, importes, datos ajenos o notas.
   byPerson.set(v.personId,{
    status:v.status,startedAt:v.startedAt,endedAt:v.endedAt
   });
  }
  const shown=event.roster.map(person=>{
   const row=byPerson.get(person.personId);
   return '<tr><td>'+esc(person.name)+'</td>'+
     '<td>'+esc(row?.startedAt?readableTime(row.startedAt):"—")+'</td>'+
     '<td>'+esc(row?.endedAt?readableTime(row.endedAt):"—")+'</td>'+
     '<td><span class="attendance-roster-state">'+esc(
       row?.status==="finalizada"?"Salida registrada":
       row?.status==="en_curso"?"En jornada":"Sin entrada registrada"
     )+'</span></td></tr>';
  }).join("");
  box.innerHTML='<div class="attendance-roster-summary"><strong>'+esc(event.name)+'</strong>'+
     '<span>'+event.roster.length+' integrante(s) asignados</span></div>'+
     (event.roster.length?'<div class="attendance-roster-table-scroll"><table class="attendance-roster-table">'+
       '<thead><tr><th>Integrante</th><th>Entrada</th><th>Salida</th><th>Estado</th></tr></thead>'+
       '<tbody>'+shown+'</tbody></table></div>':
       '<p>No hay personal registrado en esta jornada.</p>')+
     '<button type="button" class="profile-button profile-button-outline" data-roster-reload="'+esc(eventId)+'">Actualizar lista</button>';
 }catch(e){
  box.textContent="No se pudo consultar la lista. Revisa tus permisos de coordinación o tu conexión.";
  console.warn("Lista de asistencia:",e?.code||"error");
 }
}
export function mountRoster({db,target,schedule}){
 if(!target)return;
 let session=sessions.get(target);
 if(session){
   session.schedule=schedule;
   session.events=rosterEvents(schedule);
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
