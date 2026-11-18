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
const {auth,firestore:fs}=window.AGORA_FIREBASE||{};
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const locUrl=g=>g&&gpsValid({latitude:g.lat,longitude:g.lng,accuracy:g.accuracy})?
  "https://www.google.com/maps?q="+g.lat+","+g.lng:"";
const errorMessage=e=>e?.code==="permission-denied"?"El servidor rechazó la operación. Verifica tu autorización y el horario.":
  String(e?.message||e||"No fue posible completar la operación");
let user=null,personId="",access=new Map(),records=new Map(),trips=new Map(),
  staff=null,selected="",authEpoch=0,unsubs=[],geoWatch=null,lastLiveUpdate=0,busy=false,
  logs=new Map(),logsLoaded=false,staffTab="inicio",calendarMode="timeline",
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
  access.clear();records.clear();trips.clear();logs.clear();logsLoaded=false;staff=null;selected="";personId="";
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
    (!r?'<label>Breve descripción de tu actividad<textarea id="start-activity" maxlength="240" placeholder="Ej. Volanteo de apertura en acceso principal"></textarea></label>'+
      '<button class="primary" id="start-shift" '+(!canStart?"disabled":"")+'>Confirmar lugar y marcar entrada</button>':"")+
    (r?.status==="en_curso"?'<label>Descripción al terminar<textarea id="end-note" maxlength="240" placeholder="Resultado breve e incidencias"></textarea></label>'+
      '<button class="primary" id="end-shift" '+(busy?"disabled":"")+'>Marcar terminado y salida</button>':"")+
    (!check.ok&&!r?'<p class="notice">'+esc(check.reason)+'</p>':"")+
    (ended?'<p><button type="button" class="staff-subtle" data-staff-tab="pagos">Ir a mis pagos y reportes</button></p>':"")+
    '</div>';
  if($("end-note")&&existingNote)$("end-note").value=existingNote;
  if($("start-activity")&&existingActivity)$("start-activity").value=existingActivity;
  $("j-punches").innerHTML="";
  $("live-location").disabled=busy||r?.status!=="en_curso"||(remaining!==null&&remaining===0);
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
      return '<article class="staff-payment"><div class="pay-row"><div><h4>'+esc(e.title||"Actividad")+'</h4>'+
        '<span class="staff-status-tag">Sin reporte de horas</span></div></div>'+
        '<p>'+esc(dateLabel(eventStart(e,personId)))+' · '+esc(placeLabel(e))+'</p>'+
        '<p>Entrada y salida confirmadas · '+esc(total.toFixed(2))+' h registradas</p>'+
        '<div class="pay-row"><button type="button" class="primary" data-create-report="'+esc(e.id)+'" '+(busy?"disabled":"")+'>Crear reporte con mis horas</button></div>'+
        '<p>Se copiarán las horas oficiales de tu marcaje. Podrás solicitar su revisión después.</p></article>';
    }).join(""):"";
  const existingHtml=own.filter(l=>paymentFilter(l.paymentStatus||"capturado",payFilter)).map(l=>{
    const state=l.paymentStatus||"capturado";
    const action=["capturado","revision"].includes(state);
    const hasPriorApproved="approvedAmount" in l||"approvedHours" in l;
    const canRequest=action&&events.some(e=>e.id===l.eventId)&&String(l.activity||"").trim().length>=4&&
      !hasPriorApproved;
    const approved=["validado","programado","pagado"].includes(state)&&
      typeof l.approvedAmount==="number"&&Number.isFinite(l.approvedAmount);
    const money=approved?" · Importe validado: "+new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(l.approvedAmount):
      " · Importe pendiente de validación";
    const tagClass=state==="pagado"?"done":["solicitado","validado","programado"].includes(state)?"review":"";
    return '<article class="staff-payment"><div class="pay-row"><div><h4>'+esc(events.find(e=>e.id===l.eventId)?.title||"Registro de jornada")+'</h4>'+
      '<span class="staff-status-tag '+tagClass+'">'+esc(payLabel[state]||"Pendiente")+'</span></div></div>'+
      '<p>'+esc(dateLabel(l.start))+' · '+esc(logHoursText(l))+' h netas'+esc(money)+'</p>'+
      '<p>'+esc(l.activity||l.notes||"Actividad sin descripción")+'</p>'+
      (l.returnNote?'<p><b>Comentario de coordinación:</b> '+esc(l.returnNote)+'</p>':"")+
      (state==="pagado"?'<p>Coordinación registró el pago como realizado. Este estado no es un comprobante bancario.</p>':"")+
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
  $("j-name").textContent=staff.person?.name||user.email||"Personal autorizado";
  renderSummary(events);
  renderHome(events);
  renderChronogram(events);
  renderSelectors(events);
  renderAttendance();
  renderTrips();
  renderPayments(events);
  setTab(staffTab);
}
async function createReport(eventId){
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
    const docValue=reportFromFinishedClock({clock,event,uid:user.uid,personId,id});
    await setDoc(doc(fs,"agora_ops_logs",id),{...docValue,updatedAt:serverTimestamp()});
    setTab("pagos");
  },"Creando un reporte de horas basado en tu marcaje oficial…");
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
  const activity=$("start-activity")?.value.trim()||"";
  if(activity.length<4){status("Describe brevemente la actividad antes de marcar entrada.","error");return}
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
  const note=$("end-note")?.value.trim()||"";
  if(note.length<4){status("Agrega una breve descripción de la actividad realizada.","error");return}
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
  if(report){createReport(report.dataset.createReport);return}
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
$("trip-origin").addEventListener("input",()=>{
  const e=currentEvent(),origin=$("trip-origin").value.trim(),url=e?mapsUrl(origin,destination(e)):"";
  const link=$("j-route");link.hidden=!url;if(url)link.href=url;
});

$("j-active").addEventListener("click",e=>{
  if(e.target.id==="start-shift")markStart();
  if(e.target.id==="end-shift")markEnd();
});
$("trip-start").onclick=startTrip;$("trip-arrive").onclick=arriveTrip;
$("live-location").onchange=function(){if(this.checked)startTracking();else stopTracking()};
window.addEventListener("pagehide",stopTracking);
if(auth&&fs)onAuthStateChanged(auth,session,e=>status(errorMessage(e),"error"));
else status("Firebase no se inició. Contacta a coordinación.","error");
