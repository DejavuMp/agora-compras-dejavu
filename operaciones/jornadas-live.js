/* ÁGORA Mis jornadas: solo ve y escribe datos del UID autenticado.
 * Firestore Rules aplican límites; la UI es únicamente presentación.
 * No se conserva historial de geolocalización continuo: solo último punto.
 */
import "../firebase-init.js";
import {
  GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect,signInWithEmailAndPassword,
  sendPasswordResetEmail,sendEmailVerification,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  doc,collection,getDocFromServer,onSnapshot,query,where,setDoc,updateDoc,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {
  allowedByPolicy,estimatedArrival,when,elapsedMinutes,timeLeft,gpsValid,mapsUrl,clampMinutes,instant
} from "./jornadas-logic.mjs";
import {localDay,atLocalDay,shiftOf,eventStart,eventEnd,myEvents,filteredEvents,payLabel,paymentFilter,netHours,reportFromFinishedClock} from "./staff-dashboard.mjs";
import {timeStatement,hours,overtimeText} from "./ops-timekeeping.mjs";
import {receiptData,receiptHtml} from "./ops-receipt.mjs";
import {ownBreaks,openBreak,nextBreakSlot,verifiedBreakSummary} from "./ops-breaks.mjs";
const {auth,firestore:fs}=window.AGORA_FIREBASE||{};
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const locUrl=g=>g&&gpsValid({latitude:g.lat,longitude:g.lng,accuracy:g.accuracy})?
  "https://www.google.com/maps?q="+g.lat+","+g.lng:"";
const errorMessage=e=>e?.code==="permission-denied"?"El servidor rechazó la operación. Verifica tu autorización y el horario.":
  String(e?.message||e||"No fue posible completar la operación");
let user=null,personId="",access=new Map(),records=new Map(),trips=new Map(),
  staff=null,selected="",authEpoch=0,unsubs=[],geoWatch=null,lastLiveUpdate=0,busy=false,
  logs=new Map(),logsLoaded=false,breaks=new Map(),breaksReady=false,staffTab="inicio",calendarMode="timeline",
  calendarDay=localDay(Date.now()),calendarDays=7,payFilter="todos";
const key=(uid,eventId)=>uid+"_"+eventId;
const accessRef=(id)=>doc(fs,"agora_ops_shift_access",key(user.uid,id));
const clockRef=(id)=>doc(fs,"agora_ops_clock",key(user.uid,id));
const tripRef=(id)=>doc(fs,"agora_ops_trips",key(user.uid,id));
function status(msg,kind=""){
  $("auth-status").textContent=msg;
  $("auth-status").className="status"+(kind?" "+kind:"");
}
function clearSubscriptions(){
  for(const off of unsubs.splice(0))try{off()}catch(_){}
  stopTracking();
  access.clear();records.clear();trips.clear();logs.clear();breaks.clear();breaksReady=false;logsLoaded=false;staff=null;selected="";personId="";
}
function stopTracking(){
  if(geoWatch!==null&&navigator.geolocation){navigator.geolocation.clearWatch(geoWatch);geoWatch=null}
  $("live-location").checked=false;
  $("location-state").textContent="Ubicación continua desactivada.";
}
function currentEvent(){
  return (staff?.events||[]).find(x=>x.id===selected)||null;
}
function currentPolicy(){return access.get(key(user?.uid||"",selected))}
function currentClock(){return records.get(key(user?.uid||"",selected))}
function currentTrip(){return trips.get(key(user?.uid||"",selected))}
function currentBreaks(){return ownBreaks([...breaks.values()],user?.uid||"",selected)}
function activeBreak(){return openBreak(currentBreaks())}
const nowText=v=>when(v);
function linkGeo(geo,label){
  const url=locUrl(geo);
  return url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' (±'+Math.round(geo.accuracy)+' m)</a>':"Ubicación sin confirmar";
}
const dateLabel=value=>{
  const n=instant(value);
  if(!Number.isFinite(n))return "Fecha pendiente";
  return new Intl.DateTimeFormat("es-MX",{weekday:"long",day:"numeric",month:"long"}).format(new Date(n));
};
const hourLabel=value=>{
  const n=instant(value);
  return Number.isFinite(n)?new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(new Date(n)):"—";
};
const statusOf=e=>{
  const clock=records.get(key(user?.uid||"",e.id));
  const policy=access.get(key(user?.uid||"",e.id));
  if(clock?.status==="finalizada")return ["Terminada","done"];
  if(clock?.status==="en_curso")return ["En curso","active"];
  if(policy?.enabled&&allowedByPolicy(policy).ok)return ["Lista para iniciar","active"];
  return ["Por habilitar","blocked"];
};
const eventSite=e=>(staff?.sites||[]).find(s=>s.id===e.siteId);
const destination=e=>e?.venueAddress||eventSite(e)?.address||e?.venueName||eventSite(e)?.name||e?.location||"";
const placeLabel=e=>e?.venueName||eventSite(e)?.name||e?.location||"Por confirmar";
const tripLabel=e=>e?.vehicles?.length?
  e.vehicles.map(id=>(staff?.vehicles||[]).find(v=>v.id===id)?.name||"Unidad asignada").join(", "):"Sin camioneta asignada";
const eventDescription=e=>{
  const s=shiftOf(e,personId);
  return '<b>Mi turno:</b> '+esc(hourLabel(s.start||e.start))+'–'+esc(hourLabel(s.end||e.end))+
    ' · '+esc(placeLabel(e))+
    (e.dayCount>1?' · Día '+esc(e.dayIndex||1)+' de '+esc(e.dayCount):"");
};
function setTab(tab){
  if(!["inicio","cronograma","asistencia","traslados","pagos"].includes(tab))return;
  staffTab=tab;
  $("staff-tabs").querySelectorAll("[data-staff-tab]").forEach(button=>{
    const active=button.dataset.staffTab===tab;
    button.classList.toggle("active",active);
    button.setAttribute("aria-selected",String(active));
  });
  document.querySelectorAll("#viewer-staff [data-staff-panel]").forEach(panel=>{
    panel.hidden=panel.dataset.staffPanel!==tab;
  });
}
function chooseEvent(id,tab){
  if(!(staff?.events||[]).some(e=>e.id===id))return;
  if(selected!==id)stopTracking();
  selected=id;
  if(tab)setTab(tab);
  render();
}
function renderSummary(events){
  const ongoing=events.filter(e=>statusOf(e)[1]==="active"&&records.get(key(user.uid,e.id))?.status==="en_curso").length;
  const future=events.filter(e=>instant(eventEnd(e,personId))>=Date.now()).length;
  const pendingPay=[...logs.values()].filter(l=>["capturado","revision","solicitado"].includes(l.paymentStatus)).length;
  $("j-summary").innerHTML=
    '<div class="staff-metric"><span class="label">Por realizar</span><strong>'+future+'</strong><small>Jornadas asignadas</small></div>'+
    '<div class="staff-metric"><span class="label">En curso</span><strong>'+ongoing+'</strong><small>Registros activos</small></div>'+
    '<div class="staff-metric"><span class="label">Pagos</span><strong>'+(logsLoaded?pendingPay:"—")+'</strong><small>Por solicitar o revisar</small></div>';
}
function renderHome(events){
  const upcoming=events.filter(e=>instant(eventEnd(e,personId))>=Date.now()-86400000);
  const featured=upcoming.find(e=>records.get(key(user.uid,e.id))?.status==="en_curso")||upcoming[0]||events.at(-1);
  if(!featured){
    $("j-today").innerHTML='<div class="staff-empty">Todavía no tienes jornadas asignadas. Coordinación debe agregarte a una actividad para mostrar tu cronograma.</div>';
    $("j-upcoming").innerHTML='<div class="staff-empty">En cuanto recibas una asignación, aparecerá aquí.</div>';
    return;
  }
  const [label,kind]=statusOf(featured);
  $("j-today").innerHTML='<div class="staff-featured"><span class="staff-pill '+kind+'">'+esc(label)+'</span>'+
    '<h4>'+esc(featured.title||featured.type||"Actividad")+'</h4>'+
    '<p><b>'+esc(dateLabel(eventStart(featured,personId)))+'</b></p>'+
    '<p>'+eventDescription(featured)+'</p>'+
    '<p>Campaña: '+esc(featured.campaign||featured.project||"No especificada")+'</p>'+
    '<p>Transporte: '+esc(tripLabel(featured))+'</p>'+
    '<div class="staff-featured-actions"><button type="button" class="primary" data-open-event="'+esc(featured.id)+'" data-open-tab="asistencia">Marcar jornada</button>'+
    '<button type="button" data-open-event="'+esc(featured.id)+'" data-open-tab="traslados">Ver traslado</button></div></div>';
  const others=upcoming.filter(e=>e.id!==featured.id).slice(0,4);
  $("j-upcoming").innerHTML=others.length?others.map(e=>
    '<div class="staff-upcoming-item"><strong>'+esc(e.title||e.type||"Actividad")+'</strong>'+
    '<small>'+esc(dateLabel(eventStart(e,personId)))+' · '+esc(hourLabel(eventStart(e,personId)))+
    ' · '+esc(placeLabel(e))+'</small>'+
    '<button type="button" data-open-event="'+esc(e.id)+'" data-open-tab="asistencia">Ver jornada</button></div>'
  ).join(""):'<div class="staff-empty">No tienes más jornadas próximas. Consulta el cronograma para ver las anteriores.</div>';
}
function renderChronogram(events){
  $("j-date").value=calendarDay;
  $("j-period").value=String(calendarDays);
  $("j-period-field").hidden=calendarMode==="dia";
  document.querySelectorAll("[data-calendar-mode]").forEach(b=>b.classList.toggle("active",b.dataset.calendarMode===calendarMode));
  const days=calendarMode==="dia"?1:calendarDays;
  const range=filteredEvents(events,personId,calendarDay,days);
  const until=new Date(atLocalDay(calendarDay));
  if(Number.isFinite(until.getTime()))until.setDate(until.getDate()+days-1);
  $("j-period-caption").textContent=calendarMode==="dia"?
    "Vista por día · "+dateLabel(atLocalDay(calendarDay)):
    "Cronograma del "+dateLabel(atLocalDay(calendarDay))+" al "+dateLabel(until);
  if(!range.length){
    $("j-events").innerHTML='<div class="staff-empty">No tienes actividades en este periodo. Usa Anterior, Siguiente o cambia la fecha para consultar otras jornadas.</div>';
    return;
  }
  const groups=new Map();
  for(const e of range){
    const date=localDay(eventStart(e,personId));
    if(!groups.has(date))groups.set(date,[]);
    groups.get(date).push(e);
  }
  $("j-events").innerHTML=[...groups].map(([date,entries])=>
    '<div class="staff-calendar-day"><h4>'+esc(dateLabel(atLocalDay(date)))+' · '+entries.length+' actividad(es)</h4>'+
    entries.map(e=>{
      const [label,kind]=statusOf(e);
      return '<article class="staff-event-row">'+
        '<div class="staff-time">'+esc(hourLabel(eventStart(e,personId)))+' – '+esc(hourLabel(eventEnd(e,personId)))+
        '<span class="staff-pill '+kind+'">'+esc(label)+'</span></div>'+
        '<div><strong>'+esc(e.title||e.type||"Actividad")+'</strong>'+
        '<small>'+esc(e.type||"Actividad")+' · '+esc(e.campaign||e.project||"Sin campaña")+' · '+esc(placeLabel(e))+
        (e.dayCount>1?' · Jornada '+esc(e.dayIndex||1)+' de '+esc(e.dayCount):"")+
        '</small><small>Vehículo: '+esc(tripLabel(e))+'</small></div>'+
        '<div class="staff-event-actions"><button type="button" data-open-event="'+esc(e.id)+'" data-open-tab="asistencia">Asistencia</button>'+
        '<button type="button" data-open-event="'+esc(e.id)+'" data-open-tab="traslados">Traslado</button></div></article>';
    }).join("")+'</div>'
  ).join("");
}
function renderSelectors(events){
  const options=events.map(e=>
    '<option value="'+esc(e.id)+'" '+(e.id===selected?"selected":"")+'>'+
    esc(dateLabel(eventStart(e,personId)))+' · '+esc(e.title||e.type||"Actividad")+
    '</option>').join("");
  for(const id of ["j-select-attendance","j-select-trip"]){
    const select=$(id);select.innerHTML=options||'<option value="">Sin jornadas asignadas</option>';
    select.disabled=events.length===0;
  }
}
function renderAttendance(){
  const e=currentEvent(),p=currentPolicy(),r=currentClock();
  if(!e){
    $("policy-state").textContent="Todavía no tienes jornadas asignadas.";
    $("j-active").innerHTML='<div class="staff-empty">Selecciona una jornada del cronograma cuando esté disponible.</div>';
    $("j-punches").innerHTML="";
    $("live-location").disabled=true;
    return;
  }
  const check=allowedByPolicy(p);
  $("policy-state").textContent=p?
    (p.enabled?"Acceso "+(check.ok?"habilitado":"fuera de horario")+" · "+(p.mode==="horas"?"Cupo de "+(p.maxMinutes/60).toFixed(1)+" horas":"Horario fijo")+
      " · "+when(p.startsAt)+" a "+when(p.endsAt):"Jornada bloqueada por coordinación"):
    "Coordinación todavía no ha habilitado el marcaje de esta jornada. Puedes consultar tu cronograma, pero no registrar entrada.";
  const remaining=r?.status==="en_curso"?timeLeft(p,r.startedAt):null;
  const canStart=check.ok&&!r&&!busy;
  const ended=r?.status==="finalizada";
  const existingNote=$("end-note")?.value||"";
  const existingActivity=$("start-activity")?.value||"";
  $("j-active").innerHTML='<div class="card"><b>'+esc(e.title||"Jornada")+'</b>'+
    '<p>Horario asignado: '+esc(when(eventStart(e,personId)))+' a '+esc(when(eventEnd(e,personId)))+'</p>'+
    '<p>Sede: '+esc(placeLabel(e))+'</p>'+
    (r?'<p><b>Entrada oficial:</b> '+esc(when(r.startedAt))+'<br>'+linkGeo(r.startGeo,"Ver punto de entrada")+'</p>':"")+
    (ended?'<p><b>Salida oficial:</b> '+esc(when(r.endedAt))+'<br>'+linkGeo(r.endGeo,"Ver punto de salida")+
      '</p><p>Actividad realizada: '+esc(r.endNote||"Sin descripción")+'</p>':"")+
    (r?.status==="en_curso"?'<p><b>En curso.</b> '+(remaining!==null?(remaining>0?remaining+" min autorizados restantes.":"Límite autorizado alcanzado; finaliza tu jornada."):"")+'</p>':"")+
    (!r?'<p><b>Actividad asignada:</b> '+esc(e.type||"Actividad")+' · '+esc(e.title||"Operación programada")+'</p>'+
      (e.notes?'<p><b>Indicaciones:</b> '+esc(e.notes)+'</p>':"")+
      '<button class="primary" id="start-shift" '+(!canStart?"disabled":"")+'>Confirmar GPS e iniciar jornada</button>':"")+
    (r?.status==="en_curso"?'<details class="staff-incidents"><summary>¿Hubo alguna incidencia? Agrega un comentario (opcional)</summary>'+
      '<label>Comentario de cierre<textarea id="end-note" maxlength="240" placeholder="Incidencia, resultado u observación"></textarea></label></details>'+
      '<button class="primary" id="end-shift" '+(busy?"disabled":"")+'>Confirmar GPS y finalizar jornada</button>':"")+
    (!check.ok&&!r?'<p class="notice">'+esc(check.reason)+'</p>':"")+
    (ended?'<p><button type="button" class="staff-subtle" data-staff-tab="pagos">Ir a mis pagos y reportes</button></p>':"")+
    '</div>';
  if($("end-note")&&existingNote)$("end-note").value=existingNote;
  if($("start-activity")&&existingActivity)$("start-activity").value=existingActivity;
  $("j-punches").innerHTML="";
  $("live-location").disabled=(!r&&!check.ok)||r?.status==="finalizada"||(remaining!==null&&remaining===0);
  if($("live-location").disabled&&geoWatch!==null)stopTracking();
}
function renderTrips(){
  const e=currentEvent(),p=currentPolicy(),t=currentTrip();
  $("trip-start").disabled=busy||!e||!allowedByPolicy(p).ok||!!t;
  $("trip-arrive").disabled=busy||!t||t.status!=="en_ruta";
  const link=$("j-route"),url=e?mapsUrl($("trip-origin").value.trim(),destination(e)):"";
  link.hidden=!url;if(url)link.href=url;
  $("j-trips").innerHTML=t?
    '<div class="card"><b>'+(t.status==="llegue"?"Llegada registrada":"Traslado en curso")+'</b>'+
    '<p>Salida oficial: '+esc(when(t.startedAt))+'<br>ETA estimada: '+esc(when(estimatedArrival(t.startedAt,t.travelMin,t.bufferMin)))+
    (t.status==="llegue"?'<br>Arribo real: '+esc(when(t.arrivedAt)):"")+'</p>'+
    '<p>'+esc(t.origin)+' → '+esc(t.destination)+'</p>'+
    (t.arrivalGeo?linkGeo(t.arrivalGeo,"Ubicación de llegada"):"")+'</div>':
    '<div class="staff-empty">'+(e?"Aún no registras un traslado para esta jornada.":"Selecciona una jornada del cronograma.")+'</div>';
}
const reportForEvent=eventId=>[...logs.values()].find(l=>l.eventId===eventId&&l.ownerUid===user?.uid);
const logHoursText=l=>Number(netHours(l).toFixed(2)).toLocaleString("es-MX",{maximumFractionDigits:2});
function renderPayments(events){
  const own=[...logs.values()].filter(l=>l.ownerUid===user.uid&&l.personId===personId)
    .sort((a,b)=>instant(b.start)-instant(a.start));
  const completed=events.filter(e=>records.get(key(user.uid,e.id))?.status==="finalizada");
  const unreported=completed.filter(e=>!own.some(l=>l.eventId===e.id));
  const requests=own.filter(l=>["solicitado","revision"].includes(l.paymentStatus)).length;
  const done=own.filter(l=>l.paymentStatus==="pagado").length;
  $("j-pay-summary").innerHTML=
    '<span>'+unreported.length+' jornada(s) sin reporte</span><span>'+requests+' solicitud(es) en revisión/corrección</span>'+
    '<span>'+done+' pago(s) marcado(s) como realizados</span>';
  $("j-pay-filter").value=payFilter;
  if(!logsLoaded){
    $("j-payment-list").innerHTML='<div class="staff-empty">Sincronizando tus registros de horas y pagos con Firebase…</div>';
    return;
  }
  const unreportedHtml=(payFilter==="todos"||payFilter==="pendientes")?
    unreported.map(e=>{
      const clock=records.get(key(user.uid,e.id));
      const total=elapsedMinutes(clock?.startedAt,clock?.endedAt)/60;
      const planned=timeStatement({clock,event:e,personId}).plannedMinutes;
      return '<article class="staff-payment"><div class="pay-row"><div><h4>'+esc(e.title||"Actividad")+'</h4>'+
        '<span class="staff-status-tag">Sin reporte de horas</span></div></div>'+
        '<p>'+esc(dateLabel(eventStart(e,personId)))+' · '+esc(placeLabel(e))+'</p>'+
        '<p>Entrada y salida confirmadas · '+esc(total.toFixed(2))+' h transcurridas · '+esc(hours(planned))+' programadas</p>'+
        '<label class="staff-break-declaration">Descanso realizado (minutos, declaración del integrante)<input type="number" data-break-for="'+esc(e.id)+'" min="0" max="'+Math.max(0,Math.floor(total*60))+'" step="1" value="0"></label>'+
        '<div class="pay-row"><button type="button" class="primary" data-create-report="'+esc(e.id)+'" '+(busy?"disabled":"")+'>Crear comprobante de horas</button></div>'+
        '<p>La entrada y salida provienen de Firebase. El descanso se declara aquí y queda sujeto a revisión. Las horas extras no se aprueban automáticamente.</p></article>';
    }).join(""):"";
  const existingHtml=own.filter(l=>paymentFilter(l.paymentStatus||"capturado",payFilter)).map(l=>{
    const state=l.paymentStatus||"capturado";
    const action=["capturado","revision"].includes(state);
    const hasPriorApproved="approvedAmount" in l||"approvedHours" in l;
    const canRequest=action&&events.some(e=>e.id===l.eventId)&&String(l.activity||"").trim().length>=4&&
      !hasPriorApproved;
    const approved=["validado","programado","pagado"].includes(state)&&
      typeof l.approvedAmount==="number"&&Number.isFinite(l.approvedAmount);
    const e=events.find(x=>x.id===l.eventId);
    const clock=e?records.get(key(user.uid,e.id)):null;
    const summary=(e&&clock?.status==="finalizada")?
      timeStatement({clock,event:e,personId,breakMins:l.breakMins||0}):null;
    const money=approved?" · Importe validado: "+new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(l.approvedAmount):
      " · Importe pendiente de validación";
    const tagClass=state==="pagado"?"done":["solicitado","validado","programado"].includes(state)?"review":"";
    return '<article class="staff-payment"><div class="pay-row"><div><h4>'+esc(events.find(e=>e.id===l.eventId)?.title||"Registro de jornada")+'</h4>'+
      '<span class="staff-status-tag '+tagClass+'">'+esc(payLabel[state]||"Pendiente")+'</span></div></div>'+
      '<p>'+esc(dateLabel(l.start))+' · '+esc(logHoursText(l))+' h netas'+esc(money)+'</p>'+
      (summary?'<p><b>'+esc(summary.mode)+'</b> · Programadas '+esc(hours(summary.plannedMinutes))+
        ' · Descanso '+esc(summary.breakMinutes)+' min · '+esc(overtimeText(summary))+'</p>':'')+
      '<p>'+esc(l.activity||l.notes||"Actividad sin descripción")+'</p>'+
      (l.returnNote?'<p><b>Comentario de coordinación:</b> '+esc(l.returnNote)+'</p>':"")+
      (state==="pagado"?'<p>Coordinación registró el pago como realizado. Este estado no es un comprobante bancario.</p>':"")+
      (summary?'<button type="button" data-print-report="'+esc(l.id)+'">Ver comprobante / Guardar PDF</button>':'')+
      (action?(hasPriorApproved?
        '<p>Este registro contiene una validación anterior y requiere revisión de coordinación para reenviarse.</p>':
        '<button type="button" class="primary" data-request-payment="'+esc(l.id)+'" '+(busy||!canRequest?"disabled":"")+'>Enviar solicitud de pago</button>'):"")+
      '</article>';
  }).join("");
  $("j-payment-list").innerHTML=unreportedHtml+existingHtml||
    '<div class="staff-empty">'+(payFilter==="todos"?
      "Aún no tienes reportes. Al terminar una jornada, podrás crear el reporte con tus horas oficiales y solicitar su revisión.":
      "No hay registros en este filtro. Prueba «Todos los registros».")+'</div>';
}
function render(){
  if(!staff||!user)return;
  const events=myEvents(staff.events,personId);
  if(!selected||!events.some(e=>e.id===selected)){
    const active=events.find(e=>records.get(key(user.uid,e.id))?.status==="en_curso");
    selected=(active||events.find(e=>instant(eventEnd(e,personId))>=Date.now())||events.at(-1))?.id||"";
  }
  const displayName=staff.person?.name||user.displayName||user.email||"equipo";
  $("j-name").textContent="¡Hola, "+displayName+"!";
  const current=events.find(e=>records.get(key(user.uid,e.id))?.status==="en_curso");
  const next=events.find(e=>instant(eventEnd(e,personId))>=Date.now());
  const stateEl=$("j-operational-status");
  if(current){
    stateEl.textContent="En jornada · "+(current.title||"Actividad")+" · "+placeLabel(current);
    stateEl.className="staff-current-state active";
  }else if(next&&access.get(key(user.uid,next.id))?.enabled===true){
    stateEl.textContent="Fuera de jornada · Próxima actividad: "+(next.title||"Actividad")+" · "+dateLabel(eventStart(next,personId));
    stateEl.className="staff-current-state";
  }else if(next){
    stateEl.textContent="Fuera de jornada · Coordinación aún no ha habilitado la próxima actividad";
    stateEl.className="staff-current-state blocked";
  }else{
    stateEl.textContent="Fuera de jornada · No tienes actividades próximas";
    stateEl.className="staff-current-state";
  }
  renderSummary(events);
  renderHome(events);
  renderChronogram(events);
  renderSelectors(events);
  renderAttendance();
  renderTrips();
  renderPayments(events);
  setTab(staffTab);
}
async function createReport(eventId,declaredBreakMins=0){
  if(!user||!personId||!staff||!logsLoaded)return;
  const event=(staff.events||[]).find(e=>e.id===eventId);
  const clock=records.get(key(user.uid,eventId));
  if(!event||!clock||clock.status!=="finalizada"){
    status("Termina y confirma tu jornada antes de crear el reporte.","error");return;
  }
  if([...logs.values()].some(l=>l.ownerUid===user.uid&&l.eventId===eventId)){
    status("Ya existe un reporte para esta jornada. Revísalo en Mis pagos.","error");return;
  }
  const id="j_"+user.uid+"_"+eventId;
  await action(async()=>{
    const docValue=reportFromFinishedClock({clock,event,uid:user.uid,personId,id,breakMins:declaredBreakMins});
    await setDoc(doc(fs,"agora_ops_logs",id),{...docValue,updatedAt:serverTimestamp()});
    setTab("pagos");
  },"Creando un reporte de horas basado en tu marcaje oficial…");
}
function printWorkReceipt(id){
  const record=logs.get(id);
  if(!record||!user||record.ownerUid!==user.uid||record.personId!==personId)return;
  const event=(staff?.events||[]).find(e=>e.id===record.eventId);
  const clock=event?records.get(key(user.uid,event.id)):null;
  try{
    const content=receiptHtml(receiptData({log:record,event,clock,person:staff.person,personId}));
    // Sin URL pública ni datos enviados a terceros: el propio navegador abre
    // una copia imprimible. «Guardar como PDF» utiliza su diálogo de impresión.
    const url=URL.createObjectURL(new Blob([content],{type:"text/html;charset=utf-8"}));
    const a=document.createElement("a");
    a.href=url;a.target="_blank";a.rel="noopener noreferrer";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status("Comprobante abierto. Selecciona «Imprimir / Guardar como PDF» en la nueva pestaña.","ok");
  }catch(error){status("No se pudo abrir el comprobante: "+errorMessage(error),"error")}
}
async function requestPayment(id){
  if(!user||!personId)return;
  const log=logs.get(id);
  if(!log||log.ownerUid!==user.uid||log.personId!==personId)return;
  if(!["capturado","revision"].includes(log.paymentStatus||"capturado")){
    status("La solicitud ya está siendo revisada o fue validada.","error");return;
  }
  const activity=(staff?.events||[]).find(e=>e.id===log.eventId);
  if(!activity||!String(log.activity||"").trim()){
    status("El reporte debe corresponder a tu jornada e incluir la actividad realizada.","error");return;
  }
  if("approvedHours" in log||"approvedAmount" in log){
    status("Este registro ya tuvo una validación. Solicita su corrección a coordinación.","error");return;
  }
  const hours=netHours(log);
  if(!(hours>0)){status("El reporte todavía no tiene horas válidas.","error");return}
  await action(async()=>{
    await updateDoc(doc(fs,"agora_ops_logs",id),{
      paymentStatus:"solicitado",
      requestedHours:Number(hours.toFixed(2)),
      requestedRate:null,requestedAmount:null,
      revision:Number(log.revision||1)+1,updatedAt:serverTimestamp()
    });
    setTab("pagos");
  },"Enviando tu reporte a revisión de pagos…");
}
function locSnapshot(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(Error("Este dispositivo o navegador no permite obtener ubicación."));return}
    navigator.geolocation.getCurrentPosition(position=>{
      const c=position.coords;
      if(!gpsValid(c)){reject(Error("La precisión o coordenadas recibidas no son válidas."));return}
      resolve({lat:c.latitude,lng:c.longitude,accuracy:c.accuracy});
    },e=>reject(Error("No fue posible confirmar la ubicación: "+e.message)),
    {enableHighAccuracy:true,maximumAge:0,timeout:20000});
  });
}
async function action(fn,label){
  if(busy)return;
  busy=true;render();
  status(label,"");
  try{await fn();status("Registro enviado al servidor de Firebase.","ok")}
  catch(e){status(errorMessage(e),"error")}
  finally{busy=false;render()}
}
async function markStart(){
  const e=currentEvent();if(!e||!user)return;
  const p=currentPolicy();
  if(!allowedByPolicy(p).ok){status("La jornada no está habilitada por coordinación.","error");return}
  if(!$("live-location").checked){status("Acepta compartir ubicación durante esta jornada antes de marcar entrada.","error");return}
  const activity=String((e.type||"Actividad")+" · "+(e.title||"Operación programada")).slice(0,240);
  await action(async()=>{
    const geo=await locSnapshot();
    await setDoc(clockRef(e.id),{
      ownerUid:user.uid,personId,eventId:e.id,
      activity:activity.slice(0,240),status:"en_curso",startGeo:geo,
      startedAt:serverTimestamp(),lastGeo:geo,lastGeoAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
  },"Confirmando ubicación y hora oficial de entrada…");
}
async function markEnd(){
  const r=currentClock();if(!r||r.status!=="en_curso")return;
  const note=$("end-note")?.value.trim()||"Actividad terminada según la programación.";
  await action(async()=>{
    const geo=await locSnapshot();
    await updateDoc(clockRef(selected),{
      status:"finalizada",endGeo:geo,endNote:note.slice(0,240),
      endedAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    stopTracking();
  },"Registrando término y ubicación de salida…");
}
async function startTrip(){
  const e=currentEvent(),p=currentPolicy();
  if(!e||!allowedByPolicy(p).ok)return;
  const origin=$("trip-origin").value.trim(),travelMin=clampMinutes($("trip-minutes").value),
    bufferMin=clampMinutes($("trip-buffer").value,180);
  const destination=e.venueAddress||e.venueName||e.location||"";
  if(!origin||!destination){status("Indica el origen y comprueba que tu actividad tenga sede.","error");return}
  await action(async()=>{
    await setDoc(tripRef(e.id),{
      ownerUid:user.uid,personId,eventId:e.id,origin:origin.slice(0,180),
      destination:String(destination).slice(0,300),
      travelMin,bufferMin,status:"en_ruta",
      startedAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
  },"Marcando salida de traslado…");
}
async function arriveTrip(){
  const t=currentTrip();if(!t||t.status!=="en_ruta")return;
  await action(async()=>{
    const geo=await locSnapshot();
    await updateDoc(tripRef(selected),{
      status:"llegue",arrivalGeo:geo,arrivedAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
  },"Confirmando ubicación de llegada…");
}
function startTracking(){
  const r=currentClock();
  if(r?.status!=="en_curso"){stopTracking();return}
  if(!navigator.geolocation){status("Tu navegador no puede compartir ubicación.","error");stopTracking();return}
  $("location-state").textContent="Ubicación compartida con coordinación mientras esta página permanezca abierta.";
  geoWatch=navigator.geolocation.watchPosition(async position=>{
    if(!user||!selected||!$("live-location").checked)return;
    const c=position.coords;
    if(!gpsValid(c)||Date.now()-lastLiveUpdate<120000)return;
    const p=currentPolicy();
    if(timeLeft(p,r.startedAt)<=0){stopTracking();return}
    lastLiveUpdate=Date.now();
    try{
      await updateDoc(clockRef(selected),{
        lastGeo:{lat:c.latitude,lng:c.longitude,accuracy:c.accuracy},
        lastGeoAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
    }catch(e){$("location-state").textContent="No se pudo actualizar la ubicación: "+errorMessage(e);stopTracking()}
  },e=>{$("location-state").textContent="Seguimiento detenido: "+e.message;stopTracking()},
    {enableHighAccuracy:true,maximumAge:0,timeout:25000});
}
function watch(queryOrDoc,cb){
  const off=onSnapshot(queryOrDoc,{includeMetadataChanges:true},s=>{
    if(s.metadata.fromCache)return;
    cb(s);
    render();
  },e=>status("Error de sincronización: "+errorMessage(e),"error"));
  unsubs.push(off);
}
async function session(u){
  const version=++authEpoch;clearSubscriptions();user=u;
  $("login").hidden=!!u;$("staff-board").hidden=true;$("admin-message").hidden=true;
  $("verify").hidden=true;
  if(!u){status("Acceso protegido. Inicia sesión para ver tus jornadas.");return}
  status("Comprobando identidad y permisos…");
  if(!u.emailVerified){
    $("login").hidden=false;
    $("verify").hidden=false;
    status("Verifica tu correo electrónico para usar la cuenta. Puedes solicitar el mensaje de verificación.","error");
    return;
  }
  try{
    const [a,b]=await Promise.all([
      getDocFromServer(doc(fs,"agora_users",u.uid)),
      getDocFromServer(doc(fs,"agora_ops_members",u.uid))
    ]);
    if(version!==authEpoch)return;
    if(a.exists()&&a.data()?.active===true&&["admin","coordinador"].includes(a.data().role)){
      $("admin-message").hidden=false;
      status("Acceso de coordinación autorizado.","ok");return;
    }
    if(!b.exists()||b.data()?.active!==true||b.data()?.role!=="staff"||!b.data()?.personId){
      $("login").hidden=false;
      status("Cuenta sin asignación activa. Solicita a coordinación que vincule tu UID con el personal de ÁGORA.","error");
      return;
    }
    personId=b.data().personId;
    $("staff-board").hidden=false;
    status("Acceso individual autorizado. Sincronizando jornadas…","ok");
    watch(doc(fs,"agora_ops_staff",u.uid),snap=>{
      if(!snap.exists()||snap.data()?.personId!==personId){
        staff=null;status("No se encontró tu ficha individual de jornadas.","error");return;
      }
      staff=snap.data();
    });
    watch(query(collection(fs,"agora_ops_shift_access"),where("ownerUid","==",u.uid)),snap=>{
      access=new Map(snap.docs.map(d=>[d.id,d.data()]));
    });
    watch(query(collection(fs,"agora_ops_clock"),where("ownerUid","==",u.uid)),snap=>{
      records=new Map(snap.docs.map(d=>[d.id,d.data()]));
      if(currentClock()?.status==="en_curso"&&$("live-location").checked&&geoWatch===null)startTracking();
    });
    watch(query(collection(fs,"agora_ops_trips"),where("ownerUid","==",u.uid)),snap=>{
      trips=new Map(snap.docs.map(d=>[d.id,d.data()]));
    });
    watch(query(collection(fs,"agora_ops_logs"),where("ownerUid","==",u.uid)),snap=>{
      logs=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
      logsLoaded=true;
    });
  }catch(e){if(version===authEpoch)status("No se pudo comprobar el acceso: "+errorMessage(e),"error")}
}
async function googleLogin(){
  try{await signInWithPopup(auth,new GoogleAuthProvider())}
  catch(e){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e.code))
      await signInWithRedirect(auth,new GoogleAuthProvider());
    else status(errorMessage(e),"error");
  }
}
$("google").onclick=googleLogin;
$("credentials").onsubmit=async e=>{
  e.preventDefault();
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||!password)return;
  try{await signInWithEmailAndPassword(auth,email,password)}
  catch(err){status("No fue posible ingresar. Comprueba tus credenciales o que el acceso por contraseña esté habilitado.","error")}
  finally{$("password").value=""}
};
$("login-switch").onclick=()=>signOut(auth);
$("recover").onclick=async()=>{
  const email=$("email").value.trim();
  if(!email){status("Introduce primero tu correo de acceso.","error");return}
  try{await sendPasswordResetEmail(auth,email);status("Si esa cuenta existe, recibirás instrucciones para recuperar la contraseña.","ok")}
  catch(e){status(errorMessage(e),"error")}
};
$("verify").onclick=async()=>{
  if(!auth.currentUser)return;
  try{await sendEmailVerification(auth.currentUser);status("Enviamos un mensaje de verificación a tu correo.","ok")}
  catch(e){status(errorMessage(e),"error")}
};
$("logout").onclick=()=>signOut(auth);
$("staff-board").addEventListener("click",event=>{
  const tab=event.target.closest("[data-staff-tab]");
  if(tab){setTab(tab.dataset.staffTab);return}
  const opened=event.target.closest("[data-open-event]");
  if(opened){chooseEvent(opened.dataset.openEvent,opened.dataset.openTab||"asistencia");return}
  const mode=event.target.closest("[data-calendar-mode]");
  if(mode){calendarMode=mode.dataset.calendarMode;render();return}
  const report=event.target.closest("[data-create-report]");
  if(report){
    const field=report.closest(".staff-payment")?.querySelector("[data-break-for]");
    const n=Number(field?.value||0);
    if(!Number.isInteger(n)||n<0){status("El descanso debe indicarse en minutos completos.","error");return}
    createReport(report.dataset.createReport,n);return
  }
  const receipt=event.target.closest("[data-print-report]");
  if(receipt){printWorkReceipt(receipt.dataset.printReport);return}
  const request=event.target.closest("[data-request-payment]");
  if(request){requestPayment(request.dataset.requestPayment);return}
});
document.querySelectorAll("#viewer-staff [data-choose-event]").forEach(select=>{
  select.addEventListener("change",()=>chooseEvent(select.value));
});
$("j-date").addEventListener("change",()=>{
  if(Number.isFinite(atLocalDay($("j-date").value))){
    calendarDay=$("j-date").value;render();
  }
});
$("j-period").addEventListener("change",()=>{
  calendarDays=[7,14,30].includes(Number($("j-period").value))?Number($("j-period").value):7;
  render();
});
$("j-pay-filter").addEventListener("change",()=>{payFilter=$("j-pay-filter").value;render()});
function changeCalendar(direction){
  const base=new Date(atLocalDay(calendarDay));
  if(!Number.isFinite(base.getTime()))return;
  base.setDate(base.getDate()+direction*(calendarMode==="dia"?1:calendarDays));
  calendarDay=localDay(base);render();
}
$("j-prev").onclick=()=>changeCalendar(-1);
$("j-next").onclick=()=>changeCalendar(1);
$("j-now").onclick=()=>{calendarDay=localDay(Date.now());render()};
$("j-download-calendar").onclick=()=>{
  if(!user||!staff)return;
  const stamp=value=>{
    const n=instant(value);
    return Number.isFinite(n)?new Date(n).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""):"";
  };
  const clean=value=>String(value||"").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/[;,]/g," ");
  const rows=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Dejavu Marketing//Agora Operaciones//ES","CALSCALE:GREGORIAN"];
  for(const activity of myEvents(staff.events,personId)){
    const start=stamp(eventStart(activity,personId)),end=stamp(eventEnd(activity,personId));
    if(!start||!end)continue;
    rows.push("BEGIN:VEVENT","UID:"+clean(activity.id)+"-"+clean(user.uid)+"@agora-dejavu",
      "DTSTAMP:"+stamp(Date.now()),"DTSTART:"+start,"DTEND:"+end,
      "SUMMARY:"+clean(activity.title||activity.type||"Jornada"),
      "LOCATION:"+clean(destination(activity)||placeLabel(activity)),
      "DESCRIPTION:"+clean([activity.type,activity.campaign,activity.notes].filter(Boolean).join(" · ")),
      "BEGIN:VALARM","TRIGGER:-PT60M","ACTION:DISPLAY",
      "DESCRIPTION:Próxima jornada ÁGORA","END:VALARM","END:VEVENT");
  }
  rows.push("END:VCALENDAR");
  const link=document.createElement("a");
  const uri=URL.createObjectURL(new Blob([rows.join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"}));
  link.href=uri;link.download="AGORA_Mis_Jornadas.ics";document.body.appendChild(link);
  link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(uri),2500);
  status("Calendario descargado. Ábrelo en tu app de calendario para agregar tus jornadas.","ok");
};
$("trip-origin").addEventListener("input",()=>{
  const e=currentEvent(),origin=$("trip-origin").value.trim(),url=e?mapsUrl(origin,destination(e)):"";
  const link=$("j-route");link.hidden=!url;if(url)link.href=url;
});

$("j-active").addEventListener("click",e=>{
  if(e.target.id==="start-shift")markStart();
  if(e.target.id==="end-shift")markEnd();
});
$("trip-start").onclick=startTrip;$("trip-arrive").onclick=arriveTrip;
$("live-location").onchange=function(){
  if(!this.checked){
    stopTracking();
    if(currentClock()?.status==="en_curso")
      status("Retiraste el permiso de ubicación continua. Puedes reactivarlo para volver a compartir tu ubicación.","error");
  }else if(currentClock()?.status==="en_curso")startTracking();
  else $("location-state").textContent="Permiso confirmado. La ubicación continua comenzará cuando marques entrada.";
};
window.addEventListener("pagehide",stopTracking);
if(auth&&fs)onAuthStateChanged(auth,session,e=>status(errorMessage(e),"error"));
else status("Firebase no se inició. Contacta a coordinación.","error");
