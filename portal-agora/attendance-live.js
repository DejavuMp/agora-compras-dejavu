/**
 * ÁGORA · Pase de lista desde la credencial del titular autenticado.
 * Reutiliza exactamente agora_ops_shift_access y agora_ops_clock.
 * El QR NO autoriza marcajes por otras personas.
 */
import {doc,getDocFromServer,setDoc,updateDoc,serverTimestamp}
 from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {clockKey,ownAttendanceShifts,attendanceState,entryPayload,exitPayload}
 from "./attendance-policy.mjs";

const sessions=new WeakMap();
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const stamp=value=>{
 if(value?.toDate)return value.toDate();
 if(value instanceof Date)return value;
 return new Date(value);
};
const dateLabel=value=>{
 try{return new Intl.DateTimeFormat("es-MX",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(stamp(value))}
 catch{return "Por confirmar"}
};
const humanError=e=>{
 const msg=String(e?.code||"");
 if(msg.includes("permission-denied"))return "Firebase no autorizó el marcaje. Verifica que coordinación habilitó esta jornada y que tu cuenta está vinculada.";
 if(msg.includes("unavailable")||msg.includes("network"))return "No hay conexión con Firebase. No se registró ninguna hora.";
 return String(e?.message||"No se pudo registrar la asistencia.");
};
const fallbackUrl=new URL("../operaciones/visor.html",import.meta.url).href;
async function preciseLocation(){
 if(!navigator.geolocation)throw Error("Tu dispositivo no permite acceder a la ubicación.");
 const position=await new Promise((resolve,reject)=>
   navigator.geolocation.getCurrentPosition(resolve,reject,
    {enableHighAccuracy:true,maximumAge:0,timeout:20000})
 );
 const {latitude:lat,longitude:lng,accuracy}=position.coords;
 if(![lat,lng,accuracy].every(Number.isFinite)||accuracy>10000)
  throw Error("No se obtuvo una ubicación GPS válida.");
 return {lat,lng,accuracy};
}
async function safeRead(ref){
 try{
  const snap=await getDocFromServer(ref);
  return snap.exists()?snap.data():null;
 }catch(e){
  // Firestore puede negar 'get' sobre un documento que todavía no existe
  // cuando la condición exige resource.data.ownerUid.
  if(String(e?.code||"").includes("permission-denied"))return null;
  throw e;
 }
}
function statusText(shift,status){
 if(status.status==="finalizada")return "Salida registrada";
 if(status.status==="en_curso")return "Jornada en curso";
 if(status.status==="habilitada")return "Entrada disponible";
 return "Pendiente de habilitación";
}
function draw(session){
 const {target,rows,member}=session;
 if(!target.isConnected)return;
 const items=rows.map((row,index)=>{
  const {shift,permit,clock}=row;
  const state=attendanceState(permit,clock,new Date());
  return '<article class="credential-attendance-shift">'+
   '<div class="credential-attendance-shift-head"><div><strong>'+escapeHtml(shift.title)+'</strong>'+
    '<small>'+escapeHtml(shift.site)+' · '+escapeHtml(dateLabel(shift.start))+'</small></div>'+
    '<span class="credential-attendance-pill '+escapeHtml(state.status)+'">'+
     escapeHtml(statusText(shift,state))+'</span></div>'+
   (state.status==="en_curso"?'<p class="credential-attendance-time">Entrada: '+
      escapeHtml(dateLabel(clock.startedAt))+'</p>':"")+
   (state.status==="finalizada"?'<p class="credential-attendance-time">Entrada: '+
      escapeHtml(dateLabel(clock.startedAt))+' · Salida: '+
      escapeHtml(dateLabel(clock.endedAt))+'</p>':"")+
   (state.action==="entry"?
     '<div class="credential-attendance-consent"><label><input type="checkbox" data-location-consent="'+index+
       '"> Autorizo usar mi ubicación puntual para registrar esta entrada.</label></div>'+
     '<button type="button" class="profile-button profile-button-primary" data-attendance-entry="'+index+'">Registrar mi entrada</button>':
    state.action==="exit"?
     '<label class="credential-attendance-note">Nota de salida (opcional)'+
      '<textarea maxlength="240" rows="2" data-attendance-exit-note="'+index+'" placeholder="Actividad concluida, observaciones…"></textarea></label>'+
     '<button type="button" class="profile-button profile-button-primary" data-attendance-exit="'+index+'">Registrar mi salida</button>':
     '<p class="credential-attendance-hint">'+
      (state.status==="pendiente"?"Coordinación debe habilitar la jornada o aún no inicia el horario autorizado.":
        "Esta jornada ya tiene salida oficial.")+'</p>')+
   '</article>';
 }).join("");
 target.innerHTML='<div class="credential-attendance-message" role="status" aria-live="polite">'+
   escapeHtml(session.message||"Tu asistencia se registra con hora del servidor de Firebase.")+'</div>'+
   (member&&rows.length?'<div class="credential-attendance-list">'+items+'</div>':
    '<p class="credential-attendance-empty">No hay una jornada personal autorizada para marcar desde esta cuenta. Si acabas de recibir una asignación, pide a coordinación que vincule tu UID y habilite el horario.</p>')+
   '<p class="credential-attendance-foot">La credencial identifica al titular; cada marcaje requiere su sesión autenticada y una jornada asignada. El QR por sí solo no marca asistencia.</p>'+
   '<a class="credential-attendance-legacy" href="'+escapeHtml(fallbackUrl)+'" target="_blank" rel="noopener noreferrer">Abrir Jornadas original si necesitas revisar descansos o tu historial</a>';
}
async function refresh(session){
 if(!session.target.isConnected)return;
 const {uid,auth,db,target}=session;
 target.innerHTML='<p class="credential-attendance-empty" role="status">Comprobando mis jornadas y permisos…</p>';
 const user=auth.currentUser;
 if(!user||user.uid!==uid||user.emailVerified!==true)throw Error("Necesitas iniciar sesión con tu cuenta verificada.");
 const member=await getDocFromServer(doc(db,"agora_ops_members",uid));
 if(!member.exists()||member.data().active!==true||member.data().role!=="staff"){
  session.rows=[];session.member=null;session.message="Sin vinculación de Staff en Operaciones.";
  draw(session);return;
 }
 const person=member.data();
 const staff=await getDocFromServer(doc(db,"agora_ops_staff",uid));
 if(!staff.exists()){
  session.rows=[];session.member=person;session.message="Coordinación todavía no ha publicado tus jornadas.";
  draw(session);return;
 }
 const shifts=ownAttendanceShifts(staff.data(),person,new Date());
 const rows=await Promise.all(shifts.map(async shift=>{
  const id=clockKey(uid,shift.eventId);
  const [permit,clock]=await Promise.all([
    safeRead(doc(db,"agora_ops_shift_access",id)),
    safeRead(doc(db,"agora_ops_clock",id))
  ]);
  // No confiar solo en la proyección del personal: validar los campos del permiso.
  return {
   shift,
   permit:permit?.ownerUid===uid&&permit.personId===person.personId&&
     permit.eventId===shift.eventId?permit:null,
   clock:clock?.ownerUid===uid&&clock.personId===person.personId&&
     clock.eventId===shift.eventId?clock:null
  };
 }));
 if(auth.currentUser?.uid!==uid)return;
 session.member=person;session.rows=rows;
 session.message="Identidad y asignación comprobadas. Horas oficiales registradas en Firebase.";
 draw(session);
}
async function mark(session,kind,index){
 if(session.busy)return;
 const row=session.rows[index];
 if(!row||session.auth.currentUser?.uid!==session.uid)
  throw Error("La sesión o jornada ya no está disponible.");
 const {shift}=row;
 if(session.member?.active!==true||session.member.personId===undefined)
  throw Error("Coordinación debe vincular tu identidad a Operaciones.");
 const ref=doc(session.db,"agora_ops_clock",clockKey(session.uid,shift.eventId));
 // Consultar de nuevo el reloj y la autorización justo antes del cambio.
 const [clock,permit]=await Promise.all([
  safeRead(ref),safeRead(doc(session.db,"agora_ops_shift_access",clockKey(session.uid,shift.eventId)))
 ]);
 if(permit?.ownerUid!==session.uid||permit?.personId!==session.member.personId||
    permit?.eventId!==shift.eventId)throw Error("Tu jornada todavía no está habilitada.");
 const real=attendanceState(permit,clock,new Date());
 if(kind==="entry"){
  if(real.action!=="entry")throw Error("Ya registraste entrada o estás fuera del horario habilitado.");
  const checkbox=session.target.querySelector('[data-location-consent="'+index+'"]');
  if(!checkbox?.checked)throw Error("Confirma el uso puntual de ubicación para registrar entrada.");
  const geo=await preciseLocation();
  const t=serverTimestamp();
  await setDoc(ref,entryPayload(session.uid,session.member.personId,shift.eventId,shift.activity,geo,t));
 }else{
  if(real.action!=="exit")throw Error("Primero debes registrar entrada o la jornada ya terminó.");
  const note=session.target.querySelector('[data-attendance-exit-note="'+index+'"]')?.value||"";
  // Salida permitida sin GPS (regla existente), para no bloquear cierre.
  // Si el dispositivo ofrece ubicación, se añade como verificación opcional.
  let geo=null;
  try{geo=await preciseLocation()}catch{
    if(!confirm("No pudimos confirmar tu ubicación. ¿Registrar salida con hora oficial pero sin ubicación verificada?"))return;
  }
  const t=serverTimestamp();
  await updateDoc(ref,exitPayload(note,geo,t));
 }
 session.message=kind==="entry"?
  "Entrada registrada en Firebase. Esta hora es oficial.":"Salida registrada en Firebase. Esta hora es oficial.";
 await refresh(session);
}
export function mountOwnAttendance({auth,db,target,identity}){
 if(!target)return;
 const uid=auth.currentUser?.uid;
 if(!uid||!identity?.registry||identity.registry.uid!==uid||
    identity.link?.active!==true||identity.registry.rhStatus!=="verified"||
    identity.registry.credentialActive!==true){
   target.textContent="Tu credencial debe estar vigente y vinculada a tu sesión para marcar asistencia.";
   return;
 }
 const current=sessions.get(target);
 if(current&&current.uid===uid){refresh(current).catch(e=>{
   current.message=humanError(e);current.rows=[];draw(current);
 });return}
 const session={auth,db,target,uid,member:null,rows:[],busy:false,message:""};
 sessions.set(target,session);
 target.addEventListener("click",async event=>{
  const button=event.target.closest("[data-attendance-entry],[data-attendance-exit]");
  if(!button||session.busy)return;
  const entry=button.hasAttribute("data-attendance-entry");
  const index=Number(button.getAttribute(entry?"data-attendance-entry":"data-attendance-exit"));
  if(!Number.isInteger(index)||index<0||index>=session.rows.length)return;
  session.busy=true;button.disabled=true;
  session.message="Guardando el marcaje oficial…";
  const msg=target.querySelector(".credential-attendance-message");
  if(msg)msg.textContent=session.message;
  try{await mark(session,entry?"entry":"exit",index)}
  catch(e){
    session.message="No registrado: "+humanError(e);
    const message=target.querySelector(".credential-attendance-message");
    if(message)message.textContent=session.message;
  }finally{
    session.busy=false;
    const active=target.querySelector("[data-attendance-entry],[data-attendance-exit]");
    if(active)active.disabled=false;
  }
 });
 refresh(session).catch(e=>{session.message=humanError(e);session.rows=[];draw(session)});
}
