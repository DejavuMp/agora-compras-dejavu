/* Control restringido a cuentas admin/coordinador verificadas por Firestore. */
import "../firebase-init.js";
import {GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect,signOut}
  from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {doc,collection,getDocFromServer,onSnapshot,setDoc,Timestamp,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {when,estimatedArrival,elapsedMinutes,mapsUrl,instant,clampMinutes} from "./jornadas-logic.mjs";
const {auth,firestore:fs}=window.AGORA_FIREBASE||{};
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clockKey=(uid,eventId)=>uid+"_"+eventId;
const geoLink=(geo,text)=>{
  if(!geo||!Number.isFinite(Number(geo.lat))||!Number.isFinite(Number(geo.lng)))return "";
  const url="https://www.google.com/maps?q="+geo.lat+","+geo.lng;
  return '<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(text)+' (±'+Math.round(geo.accuracy||0)+' m)</a>';
};
let user=null,board=null,policies=new Map(),punches=new Map(),trips=new Map(),unsubs=[],epoch=0,busy=false;
function status(text,kind=""){$("status").textContent=text;$("status").className=kind}
function stop(){for(const off of unsubs.splice(0))try{off()}catch(_){}
  board=null;policies.clear();punches.clear();trips.clear()}
function listen(ref,fn){
  unsubs.push(onSnapshot(ref,{includeMetadataChanges:true},snap=>{
    if(snap.metadata.fromCache)return;
    fn(snap);render();
  },e=>status("Error de Firestore: "+String(e?.message||e),"error")));
}
function localInput(time){
  const ms=instant(time);
  if(!Number.isFinite(ms))return "";
  const d=new Date(ms);
  const offset=d.getTimezoneOffset()*60000;
  return new Date(ms-offset).toISOString().slice(0,16);
}
const dateTS=v=>{
  const d=new Date(v);
  if(!Number.isFinite(d.getTime()))throw Error("Fecha u hora incorrecta");
  return Timestamp.fromDate(d);
};
function rosterList(){
  if(!board)return [];
  const persons=new Map((board.people||[]).filter(p=>p.authUid).map(p=>[p.id,p]));
  const out=[];
  for(const event of board.events||[]){
    if(event.status==="cancelado")continue;
    for(const slot of event.staff||[]){
      const p=persons.get(slot.personId);
      if(!p||!p.authUid)continue;
      out.push({event,p,slot,key:clockKey(p.authUid,event.id)});
    }
  }
  return out.sort((a,b)=>instant(a.slot.start||a.event.start)-instant(b.slot.start||b.event.start));
}
function renderRoster(){
  const filter=$("search").value.trim().toLowerCase(),list=rosterList().filter(o=>{
    const text=[o.p.name,o.event.title,o.event.venueName,o.event.campaign,o.event.start].join(" ").toLowerCase();
    return !filter||text.includes(filter);
  });
  const recent=Date.now()-14*86400000;
  const upcoming=list.filter(o=>instant(o.slot.end||o.event.end)>=recent).slice(0,100);
  $("roster").innerHTML=upcoming.map(o=>{
    const d=policies.get(o.key);
    const rawStart=instant(o.slot.start||o.event.start);
    const rawEnd=instant(o.slot.end||o.event.end);
    const start=d?.startsAt||new Date(rawStart);
    const end=d?.endsAt||new Date(rawEnd);
    const state=d?.enabled===true?"1":"0";
    return '<article class="shift" data-key="'+esc(o.key)+'">'+
      '<h3>'+esc(o.p.name)+' · '+esc(o.event.title||o.event.type||"Actividad")+'</h3>'+
      '<small>'+esc(when(o.event.start))+' · '+esc(o.event.venueName||o.event.location||"Sin sede")+' · UID '+esc(o.p.authUid)+'</small>'+
      '<div class="fields"><label>Acceso<select data-field="enabled"><option value="1"'+(state==="1"?" selected":"")+'>Habilitado</option>'+
        '<option value="0"'+(state==="0"?" selected":"")+'>Bloqueado</option></select></label>'+
      '<label>Modalidad<select data-field="mode"><option value="horario"'+(d?.mode!=="horas"?" selected":"")+'>Horario fijo</option>'+
        '<option value="horas"'+(d?.mode==="horas"?" selected":"")+'>Número de horas</option></select></label>'+
      '<label>Inicio autorizado<input type="datetime-local" data-field="startsAt" value="'+esc(localInput(start))+'"></label>'+
      '<label>Fin autorizado<input type="datetime-local" data-field="endsAt" value="'+esc(localInput(end))+'"></label>'+
      '<label>Cupo horas<input type="number" min="0.5" max="24" step="0.5" data-field="hours" value="'+esc((d?.maxMinutes||480)/60)+'"></label>'+
      '<button data-save="'+esc(o.key)+'">Guardar</button></div>'+
      '<p class="summary">'+(d?"Política actualizada: "+esc(when(d.updatedAt)):"Sin política: esta jornada todavía no permite marcajes")+
      '</p></article>';
  }).join("")||'<p>No hay personal vinculado a una jornada reciente. Primero asigna un UID de Firebase a su ficha desde el editor.</p>';
}
function renderPunches(){
  const roster=new Map((board?.people||[]).filter(p=>p.authUid).map(p=>[p.authUid,p.name]));
  const list=[...punches.values()].sort((a,b)=>instant(b.startedAt)-instant(a.startedAt)).slice(0,80);
  $("punches").innerHTML=list.map(r=>'<div class="shift"><strong>'+esc(roster.get(r.ownerUid)||"Personal autorizado")+'</strong>'+
    '<span class="stamp">'+(r.status==="finalizada"?"Finalizada":"En curso")+'</span>'+
    '<p>Actividad: '+esc(r.activity)+' · Entrada: '+esc(when(r.startedAt))+
    (r.endedAt?' · Salida: '+esc(when(r.endedAt))+' · '+elapsedMinutes(r.startedAt,r.endedAt)+' min reales':"")+'</p>'+
    '<div class="controls">'+geoLink(r.startGeo,"Entrada")+geoLink(r.lastGeo,"Última ubicación")+geoLink(r.endGeo,"Salida")+'</div>'+
    '<small>'+esc(r.endNote||"")+'</small></div>').join("")||'<p>Sin marcajes registrados.</p>';
}
function renderTrips(){
  const roster=new Map((board?.people||[]).filter(p=>p.authUid).map(p=>[p.authUid,p.name]));
  const list=[...trips.values()].sort((a,b)=>instant(b.startedAt)-instant(a.startedAt)).slice(0,80);
  $("trips").innerHTML=list.map(t=>{
    const eta=estimatedArrival(t.startedAt,t.travelMin,t.bufferMin);
    const route=mapsUrl(t.origin,t.destination);
    return '<div class="shift"><strong>'+esc(roster.get(t.ownerUid)||"Personal autorizado")+'</strong>'+
      '<span class="stamp">'+(t.status==="llegue"?"Llegó":"En ruta")+'</span>'+
      '<p>'+esc(t.origin)+' → '+esc(t.destination)+'</p>'+
      '<p>Salida: '+esc(when(t.startedAt))+' · ETA: '+esc(when(eta))+
      (t.arrivedAt?" · Llegada real: "+esc(when(t.arrivedAt)):"")+'</p>'+
      '<div class="controls">'+(route?'<a href="'+esc(route)+'" target="_blank" rel="noopener noreferrer">Ruta Google Maps</a>':"")+
      geoLink(t.arrivalGeo,"Ubicación de llegada")+'</div></div>';
  }).join("")||'<p>Sin traslados registrados.</p>';
}
function render(){
  if(!user||!board)return;
  renderRoster();renderPunches();renderTrips();
}
async function savePolicy(node){
  const id=node.dataset.key;
  const record=rosterList().find(x=>x.key===id);
  if(!record)throw Error("La asignación ya no existe. Actualiza el cronograma.");
  const f=name=>node.querySelector('[data-field="'+name+'"]').value;
  const enabled=f("enabled")==="1",mode=f("mode"),startsAt=dateTS(f("startsAt")),endsAt=dateTS(f("endsAt"));
  const maxMinutes=clampMinutes(Number(f("hours"))*60);
  if(startsAt.toMillis()>=endsAt.toMillis())throw Error("El fin debe ser posterior al inicio.");
  if(!["horario","horas"].includes(mode)||maxMinutes<30)throw Error("Modalidad o cupo inválido.");
  await setDoc(doc(fs,"agora_ops_shift_access",id),{
    ownerUid:record.p.authUid,personId:record.p.id,eventId:record.event.id,
    enabled,mode,startsAt,endsAt,maxMinutes,updatedAt:serverTimestamp(),updatedBy:user.uid
  });
}
$("roster").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-save]");if(!btn||busy)return;
  const node=btn.closest(".shift");
  busy=true;btn.disabled=true;status("Guardando política de acceso…");
  try{await savePolicy(node);status("Horario y acceso guardados en Firestore.","ok")}
  catch(error){status(error.message||String(error),"error")}
  finally{busy=false;btn.disabled=false}
});
$("search").oninput=renderRoster;
$("logout").onclick=()=>signOut(auth);
$("login-switch").onclick=()=>signOut(auth);
$("login-google").onclick=async()=>{
  try{await signInWithPopup(auth,new GoogleAuthProvider())}
  catch(e){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e.code))
      await signInWithRedirect(auth,new GoogleAuthProvider());
    else status(String(e.message||e),"error");
  }
};
async function session(u){
  const version=++epoch;stop();user=u;
  $("login").hidden=!!u;$("control").hidden=true;
  if(!u){status("Inicia sesión como administrador o coordinador.");return}
  if(!u.emailVerified){$("login").hidden=false;status("Se requiere correo verificado.","error");return}
  try{
    const snap=await getDocFromServer(doc(fs,"agora_users",u.uid));
    if(version!==epoch)return;
    if(!snap.exists()||snap.data()?.active!==true||!["admin","coordinador"].includes(snap.data().role)){
      $("login").hidden=false;status("No tienes permisos administrativos para controlar jornadas.","error");return}
    $("control").hidden=false;status("Coordinación autorizada · sincronización en tiempo real","ok");
    listen(doc(fs,"agora_ops_control","schedule"),snap=>{board=snap.data()?.payload||null});
    listen(collection(fs,"agora_ops_shift_access"),snap=>{
      policies=new Map(snap.docs.map(d=>[d.id,d.data()]));
    });
    listen(collection(fs,"agora_ops_clock"),snap=>{
      punches=new Map(snap.docs.map(d=>[d.id,d.data()]));
    });
    listen(collection(fs,"agora_ops_trips"),snap=>{
      trips=new Map(snap.docs.map(d=>[d.id,d.data()]));
    });
  }catch(e){status("Error de autorización: "+String(e.message||e),"error")}
}
if(auth&&fs)onAuthStateChanged(auth,session,e=>status(String(e.message||e),"error"));
else status("Firebase no se inició.","error");
