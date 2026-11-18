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
const {auth,firestore:fs}=window.AGORA_FIREBASE||{};
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const locUrl=g=>g&&gpsValid({latitude:g.lat,longitude:g.lng,accuracy:g.accuracy})?
  "https://www.google.com/maps?q="+g.lat+","+g.lng:"";
const errorMessage=e=>e?.code==="permission-denied"?"El servidor rechazó la operación. Verifica tu autorización y el horario.":
  String(e?.message||e||"No fue posible completar la operación");
let user=null,personId="",access=new Map(),records=new Map(),trips=new Map(),
  staff=null,selected="",authEpoch=0,unsubs=[],geoWatch=null,lastLiveUpdate=0,busy=false;
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
  access.clear();records.clear();trips.clear();staff=null;selected="";personId="";
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
function render(){
  if(!staff||!user)return;
  const events=(staff.events||[]).filter(e=>e.status!=="cancelado").sort((a,b)=>instant(a.start)-instant(b.start));
  if(!selected||!events.some(e=>e.id===selected))selected=events[0]?.id||"";
  $("j-name").textContent=staff.person?.name||user.email||"Personal autorizado";
  $("j-events").innerHTML=events.length?events.map(e=>{
    const p=access.get(key(user.uid,e.id)),r=records.get(key(user.uid,e.id));
    const allowed=allowedByPolicy(p);
    return '<article class="card '+(e.id===selected?"active":"")+'">'+
      '<b>'+esc(e.title||e.type||"Actividad")+'</b>'+
      '<small>'+esc(when(e.start))+' – '+esc(when(e.end))+
      (e.dayCount>1?" · Jornada "+e.dayIndex+" de "+e.dayCount:"")+'</small>'+
      '<p>'+esc(e.venueName||e.location||"Sede no especificada")+'</p>'+
      '<p class="muted">'+esc(r?.status==="finalizada"?"Terminada":r?.status==="en_curso"?"En curso":allowed.ok?"Habilitada":"Bloqueada")+'</p>'+
      '<button type="button" data-select="'+esc(e.id)+'">'+(e.id===selected?"Seleccionada":"Ver jornada")+'</button></article>';
  }).join(""):'<p class="muted">No tienes jornadas asignadas. Solicita a coordinación que te vincule con una actividad.</p>';
  const e=currentEvent(),p=currentPolicy(),r=currentClock(),t=currentTrip(),check=allowedByPolicy(p);
  $("policy-state").textContent=p?
    (p.enabled?"Acceso "+(check.ok?"habilitado":"fuera de horario")+" · "+(p.mode==="horas"?"Cupo de "+(p.maxMinutes/60).toFixed(1)+" horas":"Horario fijo")+
      " · "+when(p.startsAt)+" a "+when(p.endsAt):"Jornada bloqueada por coordinación"):
    "Aún no se ha habilitado esta jornada. Coordinación debe asignar su horario o cupo de horas.";
  if(!e){$("j-active").innerHTML='<p class="muted">Selecciona una actividad para comenzar.</p>'; $("j-trips").innerHTML="";return;}
  const remaining=r?.status==="en_curso"?timeLeft(p,r.startedAt):null;
  const canStart=check.ok&&!r&&!busy;
  const ended=r?.status==="finalizada";
  const existingNote=$("end-note")?.value||"";
  const existingActivity=$("start-activity")?.value||"";
  $("j-active").innerHTML='<div class="card"><b>'+esc(e.title||"Jornada")+'</b>'+
    '<p>Horario asignado: '+esc(when(e.staff?.[0]?.start||e.start))+' a '+esc(when(e.staff?.[0]?.end||e.end))+'</p>'+
    '<p>Sede: '+esc(e.venueName||e.location||"Por confirmar")+'</p>'+
    (r?'<p><b>Entrada oficial:</b> '+esc(nowText(r.startedAt))+'<br>'+linkGeo(r.startGeo,"Ver punto de entrada")+'</p>':"")+
    (ended?'<p><b>Salida oficial:</b> '+esc(nowText(r.endedAt))+'<br>'+linkGeo(r.endGeo,"Ver punto de salida")+
      '</p><p>Actividad realizada: '+esc(r.endNote||"Sin descripción")+'</p>':"")+
    (r?.status==="en_curso"?'<p><b>En curso.</b> '+(remaining!==null?(remaining>0?remaining+" min autorizados restantes.":"Límite autorizado alcanzado; finaliza tu jornada."):"")+'</p>':"")+
    (!r?'<label>Breve descripción de tu actividad<textarea id="start-activity" maxlength="240" placeholder="Ej. Volanteo de apertura en acceso principal"></textarea></label>'+
      '<button class="primary" id="start-shift" '+(!canStart?"disabled":"")+'>Confirmar lugar y marcar entrada</button>':"")+
    (r?.status==="en_curso"?'<label>Descripción al terminar<textarea id="end-note" maxlength="240" placeholder="Resultado breve e incidencias"></textarea></label>'+
      '<button class="primary" id="end-shift" '+(busy?"disabled":"")+'>Marcar terminado y salida</button>':"")+
    (!check.ok&&!r?'<p class="notice">'+esc(check.reason)+'</p>':"")+
    '</div>';
  if($("end-note")&&existingNote)$("end-note").value=existingNote;
  if($("start-activity")&&existingActivity)$("start-activity").value=existingActivity;
  $("j-punches").innerHTML="";
  if(t){
    const eta=estimatedArrival(t.startedAt,t.travelMin,t.bufferMin);
    $("j-trips").innerHTML='<div class="card"><b>'+(t.status==="llegue"?"Llegada registrada":"Traslado en curso")+'</b>'+
      '<p>Salida oficial: '+esc(nowText(t.startedAt))+'<br>ETA estimada: '+esc(nowText(eta))+
      (t.status==="llegue"?'<br>Arribo real: '+esc(nowText(t.arrivedAt)):"")+'</p>'+
      '<p>'+esc(t.origin)+' → '+esc(t.destination)+'</p>'+
      (t.arrivalGeo?linkGeo(t.arrivalGeo,"Ubicación de llegada"):"")+'</div>';
  } else $("j-trips").innerHTML='<p class="muted">No hay traslado registrado para esta jornada.</p>';
  $("trip-start").disabled=busy||!check.ok||!!t;
  $("trip-arrive").disabled=busy||!t||t.status!=="en_ruta";
  $("live-location").disabled=busy||r?.status!=="en_curso"||(remaining!==null&&remaining===0);
  if($("live-location").disabled&&geoWatch!==null)stopTracking();
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
$("j-events").addEventListener("click",e=>{
  const el=e.target.closest("[data-select]");if(!el)return;
  selected=el.dataset.select;stopTracking();render();
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
