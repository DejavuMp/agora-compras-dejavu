/* ÁGORA visor colaborativo: acceso único a agenda administrativa o Mis jornadas.
 * Los permisos se confirman en Firestore; los marcajes del staff son por UID.
 * Nadie sin aprobación puede consultar agenda, jornadas, finanzas o nómina.
 */
import "../firebase-init.js";
import {GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect,signInWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,signOut}
  from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {doc,getDocFromServer,onSnapshot,setDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {projectViewerView} from "./ops-safe-view.mjs";

const {auth,firestore:db} = window.AGORA_FIREBASE || {};
const $ = id => document.getElementById(id);
const safe = x => String(x ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const day = d => new Date(d.getFullYear(),d.getMonth(),d.getDate());
const plus = (d,n) => new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const ymd = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const instant = s => new Date(s).getTime();
const time = s => Number.isFinite(instant(s)) ? new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(s)):"--:--";
const dateLabel = d => new Intl.DateTimeFormat("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);
const shortDate = d => new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"short"}).format(d);
const validDate = d => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(d||"")) && Number.isFinite(instant(d));
const overlaps=(e,start,end)=>instant(e.start)<end && instant(e.end)>start;
const dateTime = d => ymd(d)+"T00:00";
let authEpoch=0,unwatch=null,permission=false,connected=false,focus=day(new Date()),view="dia",range=7,filter="todos",events=[];
let signedIn=null,requestWatch=null,staffModuleLoaded=false;
function stopRequestWatch(){
  if(requestWatch){requestWatch();requestWatch=null}
}
function viewerMode(mode){
  $("viewer-agenda").hidden=mode!=="agenda";
  $("viewer-staff").hidden=mode!=="staff";
  $("viewer-request").hidden=mode!=="request";
  $("viewer-verify").hidden=mode!=="verify";
  $("viewer-editor-link").hidden=mode!=="agenda";
  const title=document.querySelector(".hero h1"),description=document.querySelector(".hero .desc");
  if(title)title.textContent=mode==="staff"?"Mis jornadas":mode==="agenda"?"Operación de la agencia":"Acceso a ÁGORA";
  if(description)description.textContent=mode==="staff"?
    "Tu jornada, asistencia y traslados en una sola vista.":mode==="agenda"?
    "Consulta las jornadas de una fecha o todo el cronograma en orden de operación.":
    "Ingresa con Google o tu correo y contraseña. El primer acceso requiere autorización de coordinación.";
}
async function showAuthorization(user,version){
  viewerMode("request");
  message("No se muestran actividades hasta que coordinación autorice tu cuenta.","pending");
  const ref=doc(db,"agora_ops_access_requests",user.uid);
  const label=$("viewer-request-state"),button=$("viewer-request-submit");
  label.textContent="Comprobando el estado de tu solicitud…";
  button.disabled=true;
  const found=await getDocFromServer(ref);
  if(version!==authEpoch)return;
  if(found.exists()){
    const state=found.data().status||"pendiente";
    label.textContent=state==="aprobada"?
      "Solicitud aprobada. Esperando que se complete la vinculación de tu ficha.":
      "Solicitud "+state+". Coordinación debe validar tu identidad y asignarte a una ficha de personal.";
    button.disabled=true;
  }else{
    label.textContent="Tu cuenta todavía no tiene autorización. Puedes solicitarla ahora.";
    button.disabled=false;
  }
  stopRequestWatch();
  requestWatch=onSnapshot(doc(db,"agora_ops_members",user.uid),
    {includeMetadataChanges:true},snapshot=>{
      if(version!==authEpoch||snapshot.metadata.fromCache)return;
      const m=snapshot.data();
      if(m?.active===true&&m.role==="staff"&&m.personId){
        stopRequestWatch();
        session(auth.currentUser);
      }
    },error=>message("Error comprobando autorización: "+String(error.message||error),"error"));
}
async function showStaff(user,version){
  viewerMode("staff");
  message("Acceso aprobado · Mis jornadas personales, sin información de terceros.","ok");
  if(!staffModuleLoaded){
    try{
      await import("./jornadas-live.js");
      staffModuleLoaded=true;
    }catch(error){
      if(version===authEpoch)message("No se pudo abrir Mis jornadas: "+String(error.message||error),"error");
    }
  }
}

function message(text,kind=""){
  $("message").textContent=text;
  $("message").dataset.state=kind;
}
function clearSchedule(){
  permission=false;connected=false;events=[];
  if(unwatch){unwatch();unwatch=null}
  render();
}
function routes(e){
  if(!e.origin||!e.venueAddress)return "";
  const u=new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api","1");
  u.searchParams.set("origin",e.origin);
  u.searchParams.set("destination",e.venueAddress);
  u.searchParams.set("travelmode","driving");
  const stops=String(e.stops||"").split(";").map(s=>s.trim()).filter(Boolean).slice(0,8);
  if(stops.length)u.searchParams.set("waypoints",stops.join("|"));
  return u.toString();
}
function card(e){
  const trip=Number(e.travelMin||0)+Number(e.routeBufferMin||0);
  const departure=validDate(e.start)?time(new Date(instant(e.start)-(Number(e.before ?? 30)+trip)*60000).toISOString()):"--:--";
  const route=routes(e);
  const series=e.dayCount>1?'<span class="series">Día '+e.dayIndex+' de '+e.dayCount+'</span>':"";
  return '<article class="event'+(e.conflict?' conflict':'')+'">'+
    '<div class="time">'+safe(time(e.start))+' – '+safe(time(e.end))+'</div>'+series+
    '<span class="type">'+safe(e.type||"Actividad")+'</span>'+
    '<b>'+safe(e.title||"Actividad sin nombre")+'</b>'+
    '<p><strong>Sede:</strong> '+safe(e.venueName||"Sin definir")+'</p>'+
    (e.campaign||e.project?'<p>'+safe(e.campaign||e.project)+'</p>':"")+
    '<p><strong>Recursos:</strong> '+e.staffCount+' personas asignadas · '+e.vehicleCount+' camionetas</p>'+
    '<p>Salida propuesta de unidad: '+safe(departure)+' · '+Number(e.travelMin||0)+' min de ruta + '+Number(e.routeBufferMin||0)+' min de margen</p>'+
    (route?'<p><a href="'+safe(route)+'" target="_blank" rel="noopener noreferrer">Abrir ruta en Maps</a></p>':"")+
    '</article>';
}
function rows(list){
  const out=[];
  for(let n=0;n<range;n++){
    const d=plus(focus,n),start=instant(dateTime(d)),end=instant(dateTime(plus(d,1)));
    const group=list.filter(e=>overlaps(e,start,end));
    if(!group.length)continue;
    out.push('<section class="schedule-day"><div class="schedule-header"><b>'+safe(dateLabel(d))+'</b><small>'+group.length+' actividades</small></div>'+
      group.map(e=>'<div class="schedule-row'+(e.conflict?' conflict':'')+'"><span class="when">'+safe(time(e.start))+'–'+safe(time(e.end))+'</span>'+
        '<div><b>'+safe(e.title)+'</b><p>'+safe(e.type)+(e.dayCount>1?' · Día '+e.dayIndex+' de '+e.dayCount:'')+'</p></div>'+
        '<div><b>'+safe(e.venueName)+'</b><p>'+safe(e.campaign||e.project)+'</p></div>'+
        '<div class="long"><p>'+e.staffCount+' personas · '+e.vehicleCount+' camionetas</p></div>'+
        '<div class="links"><p>'+Number(e.travelMin||0)+' min de recorrido</p>'+
        (routes(e)?'<a href="'+safe(routes(e))+'" target="_blank" rel="noopener noreferrer">Abrir ruta</a>':"")+
        '</div></div>').join("")+'</section>');
  }
  return out.join("")||'<div class="empty-daily">Sin jornadas en este período.</div>';
}
function render(){
  const authorized=permission&&connected;
  $("local").hidden=!!signedIn;
  $("sample").hidden=!signedIn;
  $("refresh").hidden=!permission;
  $("refresh").disabled=!permission;
  $("print").hidden=!authorized;
  $("print").disabled=!authorized;
  $("days-control").hidden=view!=="cronograma";
  $("show-day").classList.toggle("active",view==="dia");
  $("show-schedule").classList.toggle("active",view==="cronograma");
  $("focusdate").value=ymd(focus);
  $("weektitle").textContent=view==="dia"?dateLabel(focus):shortDate(focus)+" – "+shortDate(plus(focus,range-1));
  $("view-heading").textContent=view==="dia"?"Actividades del día":"Cronograma operativo";
  $("view-subheading").textContent="Vista de consulta sin datos personales, tarifas ni pagos";
  $("week").classList.toggle("schedule-mode",view==="cronograma");
  if(!authorized){
    $("week").innerHTML='<div class="empty-daily">Inicia sesión con una cuenta autorizada de coordinación para ver la agenda sincronizada.</div>';
    $("metrics").innerHTML="";$("upcoming").innerHTML="";$("alerts").innerHTML="";
    return;
  }
  const start=instant(dateTime(focus)),end=instant(dateTime(plus(focus,view==="dia"?1:range)));
  const visible=events.filter(e=>e.status!=="cancelado"&&e.status!=="borrador"&&overlaps(e,start,end)&&
    (filter==="todos"||e.type===filter)).sort((a,b)=>instant(a.start)-instant(b.start));
  const campaigns=new Set(visible.filter(e=>e.dayCount>1).map(e=>e.seriesId||e.id));
  const flags=visible.filter(e=>e.conflict).length;
  const counts=[["Jornadas",visible.length],["Asignaciones de personal",visible.reduce((s,e)=>s+e.staffCount,0)],
    ["Asignaciones de camioneta",visible.reduce((s,e)=>s+e.vehicleCount,0)],["Campañas de varios días",campaigns.size],["Jornadas con alerta",flags]];
  $("metrics").innerHTML=counts.map(p=>'<div class="card"><small>'+safe(p[0])+'</small><strong>'+p[1]+'</strong></div>').join("");
  $("week").innerHTML=view==="dia"?(visible.map(card).join("")||'<div class="empty-daily">Sin jornadas para esta fecha.</div>'):rows(visible);
  const upcoming=events.filter(e=>e.status!=="cancelado"&&e.status!=="borrador"&&instant(e.end)>=Date.now()).sort((a,b)=>instant(a.start)-instant(b.start)).slice(0,7);
  $("upcoming").innerHTML=upcoming.map(e=>'<div class="upnext"><b>'+safe(e.title)+'</b><span>'+safe(dateLabel(new Date(e.start)))+' · '+safe(time(e.start))+' · '+safe(e.venueName)+'</span></div>').join("")||'<p class="muted">No hay próximas actividades.</p>';
  $("alerts").innerHTML=flags?'<div class="alert">'+flags+' jornadas presentan posibles empalmes de personal o unidades. Consulta el editor para identificar los recursos involucrados.</div>':'<p class="muted">Sin empalmes detectados entre los turnos y vehículos asignados.</p>';
}
async function session(user){
  const version=++authEpoch;
  stopRequestWatch();
  signedIn=user;
  clearSchedule();
  viewerMode("none");
  $("viewer-credentials").hidden=!!user;
  render();
  if(!user){
    message("Inicia sesión con Google o correo y contraseña. Para entrar por primera vez debes solicitar autorización.");
    return;
  }
  message("Verificando identidad y permisos con Firestore…","pending");
  if(!user.emailVerified){
    viewerMode("verify");
    message("Verifica tu correo antes de solicitar la autorización de acceso.","pending");
    return;
  }
  try{
    const [adminSnap,memberSnap]=await Promise.all([
      getDocFromServer(doc(db,"agora_users",user.uid)),
      getDocFromServer(doc(db,"agora_ops_members",user.uid))
    ]);
    if(version!==authEpoch)return;
    const profile=adminSnap.exists()?adminSnap.data():{};
    const member=memberSnap.exists()?memberSnap.data():{};
    if(profile.active===true&&["admin","coordinador"].includes(profile.role)){
      permission=true;
      viewerMode("agenda");
      message("Acceso autorizado. Comprobando la agenda en el servidor…");
      unwatch=onSnapshot(doc(db,"agora_ops_control","schedule"),{includeMetadataChanges:true},snap=>{
        if(version!==authEpoch)return;
        if(snap.metadata.fromCache){
          connected=false;
          message("Esperando confirmación de Firebase; no se muestran datos sin verificar.","pending");
          render();return;
        }
        const board=snap.data()?.payload || {events:[],sites:[]};
        events=projectViewerView(board).events;
        connected=true;
        message("Firebase sincronizado · "+(snap.data()?.revision||0)+" · actualización automática en tiempo real","ok");
        render();
      },e=>{
        connected=false;events=[];
        message("No se pudo consultar la agenda: "+String(e?.message||e),"error");render();
      });
    }else if(member.active===true&&member.role==="staff"&&member.personId){
      await showStaff(user,version);
    }else{
      await showAuthorization(user,version);
    }
    render();
  }catch(e){
    if(version===authEpoch){
      viewerMode("none");
      message("No se pudieron comprobar los permisos: "+String(e?.message||e),"error");
      render();
    }
  }
}
async function login(){
  try{await signInWithPopup(auth,new GoogleAuthProvider())}
  catch(e){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e?.code)){
      try{await signInWithRedirect(auth,new GoogleAuthProvider())}catch(err){message(String(err?.message||err),"error")}
    }else message(String(e?.message||e),"error")
  }
}
$("viewer-recover").addEventListener("click",async()=>{
  const email=$("viewer-email").value.trim();
  if(!email){message("Escribe tu correo para recuperar la contraseña.","error");return}
  try{
    await sendPasswordResetEmail(auth,email);
    message("Si tu correo tiene una cuenta habilitada, recibirás instrucciones para restablecer la contraseña.","ok");
  }catch(error){
    message("No fue posible procesar la recuperación. Comprueba el correo e inténtalo de nuevo.","error");
  }
});
$("viewer-request-submit").addEventListener("click",async()=>{
  const user=auth.currentUser;
  if(!user||!user.emailVerified)return;
  const button=$("viewer-request-submit");button.disabled=true;
  try{
    const ref=doc(db,"agora_ops_access_requests",user.uid);
    const existing=await getDocFromServer(ref);
    if(existing.exists()){
      $("viewer-request-state").textContent="Ya tienes una solicitud registrada. Espera la revisión de coordinación.";
      return;
    }
    await setDoc(ref,{
      uid:user.uid,email:(user.email||"").slice(0,240),
      name:(user.displayName||user.email||"Solicitante").slice(0,140),
      status:"pendiente",createdAt:serverTimestamp()
    });
    $("viewer-request-state").textContent="Solicitud enviada. Coordinación revisará tu acceso y te asignará una ficha. No puedes consultar jornadas mientras tanto.";
    message("Solicitud de autorización recibida en Firebase.","ok");
  }catch(error){
    button.disabled=false;
    message("No se pudo solicitar autorización: "+String(error.message||error),"error");
  }
});
$("viewer-request-refresh").onclick=()=>session(auth.currentUser);
$("viewer-request-out").onclick=()=>signOut(auth);
$("viewer-verify-out").onclick=()=>signOut(auth);
$("viewer-verified-refresh").onclick=async()=>{
  try{
    await auth.currentUser?.reload();
    await session(auth.currentUser);
  }catch(error){message(String(error.message||error),"error")}
};
$("viewer-send-verification").onclick=async()=>{
  if(!auth.currentUser)return;
  try{
    await sendEmailVerification(auth.currentUser);
    message("Se envió el correo de verificación. Después pulsa «Ya verifiqué mi correo».","ok");
  }catch(error){message("No se pudo enviar la verificación: "+String(error.message||error),"error")}
};
$("viewer-credentials").addEventListener("submit",async event=>{
  event.preventDefault();
  const email=$("viewer-email").value.trim(),password=$("viewer-password").value;
  if(!email||!password)return;
  try{await signInWithEmailAndPassword(auth,email,password)}
  catch(e){message("No fue posible iniciar con contraseña. Comprueba el correo, contraseña y proveedor habilitado.","error")}
  finally{$("viewer-password").value=""}
});
$("local").textContent="Entrar con Google";
$("sample").textContent="Cerrar sesión";
$("local").onclick=login;
$("sample").onclick=()=>signOut(auth);
$("refresh").onclick=async()=>{
  if(!permission)return;
  message("Verificando conexión con servidor…");
  try{await getDocFromServer(doc(db,"agora_ops_control","schedule"))}catch(e){message("No se pudo verificar la conexión: "+String(e?.message||e),"error")}
};
$("print").onclick=()=>window.print();
$("show-day").onclick=()=>{view="dia";render()};
$("show-schedule").onclick=()=>{view="cronograma";render()};
$("days-control").onchange=function(){range=[7,14,30].includes(Number(this.value))?Number(this.value):7;render()};
$("prev").onclick=()=>{focus=plus(focus,-(view==="dia"?1:range));render()};
$("next").onclick=()=>{focus=plus(focus,view==="dia"?1:range);render()};
$("today").onclick=()=>{focus=day(new Date());render()};
$("focusdate").onchange=function(){if(/^\d{4}-\d{2}-\d{2}$/.test(this.value)){focus=new Date(this.value+"T12:00:00");render()}};
$("typefilter").onchange=function(){filter=this.value;render()};
function clock(){
  $("clock").textContent=new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
}
clock();setInterval(clock,60000);
render();
if(auth&&db)onAuthStateChanged(auth,session,e=>message(String(e?.message||e),"error"));
else message("Firebase no se inicializó. Comprueba la configuración.","error");
