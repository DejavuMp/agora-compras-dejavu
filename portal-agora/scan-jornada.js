/**
 * ÁGORA · Pase de lista único: QR, manual y alta provisional.
 * Supervisores delegados solo acceden a sus jornadas.
 * Coordinación habilita listas, valida registros y horas para revisión de pago.
 */
import {auth,db} from "./firebase.js";
import {
 GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
 doc,collection,query,where,Timestamp,
 getDocFromServer,getDocsFromServer,setDoc,updateDoc,writeBatch,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {
 shiftCandidates,shiftPreview,entryDraft,entryDocId,
 freshProvisionalId,calculateNetMinutes,approvalDraft,payrollSummary,validatedHoursReceipt,isLocalAttendanceTime
} from "./asistencia-policy.mjs?v=20261126-local-window";
import {parseShiftQr} from "./qr-jornada.mjs";

const root=new URL("./",import.meta.url);
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const clean=v=>String(v??"").trim();
const fmt=v=>{
 const d=v?.toDate?v.toDate():v instanceof Date?v:new Date(v);
 return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d):"—";
};
const dateInput=v=>{
 const d=v?.toDate?v.toDate():new Date(v);
 const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return Number.isFinite(d.getTime())?local.toISOString().slice(0,16):"";
};
const state={
 user:null,isCoordinator:false,allowed:false,working:false,
 schedule:null,sheets:[],sheet:null,roster:[],entries:[],approvals:[],clocks:[],
 remoteRequests:[],
 qr:null,camera:null,epoch:0
};
function notice(msg,kind=""){
 const target=$("scan-status");
 target.textContent=msg;target.dataset.tone=kind;
}
function busy(value){
 state.working=value;
 document.querySelectorAll("[data-write],#scan-verify").forEach(b=>b.disabled=value);
}
function errMessage(error){
 const code=String(error?.code||"");
 if(code.includes("permission-denied"))return "Firebase no autorizó la operación. No se guardó. Revisa los permisos de esta jornada.";
 if(code.includes("unavailable")||code.includes("network"))return "No se pudo confirmar con Firebase. Revisa la conexión y vuelve a consultar.";
 return clean(error?.message)||"No se pudo completar.";
}
const sheetRef=id=>doc(db,"agora_ops_attendance_sheets",id);
const rosterRef=(eventId,personId)=>doc(db,"agora_ops_attendance_sheets",eventId,"roster",personId);
const entryRef=(eventId,id)=>doc(db,"agora_ops_attendance_sheets",eventId,"entries",id);
const approvalRef=(eventId,personId)=>doc(db,"agora_ops_attendance_sheets",eventId,"approvals",personId);
function liveAccount(){
 return auth.currentUser&&state.user?.uid===auth.currentUser.uid;
}
async function roleInfo(user){
 const snap=await getDocFromServer(doc(db,"agora_users",user.uid));
 return user.emailVerified===true&&snap.exists()&&snap.data().active===true&&
  ["admin","coordinador"].includes(snap.data().role);
}
async function openGoogle(){
 try{
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  await signInWithPopup(auth,provider);
 }catch(e){notice(errMessage(e),"error")}
}
function hideCamera(){
 const camera=state.camera;
 if(camera?.stream)camera.stream.getTracks().forEach(t=>t.stop());
 state.camera=null;
 $("scan-camera").hidden=true;
 $("scan-open-camera").disabled=false;
}
async function cameraStart(){
 if(!state.allowed||state.camera)return;
 if(!navigator.mediaDevices?.getUserMedia||
      (!window.BarcodeDetector&&!window.jsQR))
  return notice("Este navegador no ofrece lector QR compatible. Puedes pegar el enlace del QR.","warning");
 try{
  const stream=await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:"environment"}},audio:false
  });
  const video=$("scan-video");
  video.srcObject=stream;await video.play();
  const detector=window.BarcodeDetector?
    new window.BarcodeDetector({formats:["qr_code"]}):null;
  const canvas=document.createElement("canvas");
  const context=canvas.getContext("2d",{willReadFrequently:true});
  state.camera={stream,detector,canvas,context};
  $("scan-camera").hidden=false;$("scan-open-camera").disabled=true;
  const loop=async()=>{
   if(!state.camera||document.hidden)return;
   try{
    let code="";
    if(detector){
      const results=await detector.detect(video);
      code=results[0]?.rawValue||"";
    }else if(window.jsQR&&context&&video.videoWidth&&video.videoHeight){
      const factor=Math.min(1,720/video.videoWidth);
      const width=Math.max(1,Math.round(video.videoWidth*factor));
      const height=Math.max(1,Math.round(video.videoHeight*factor));
      canvas.width=width;canvas.height=height;
      context.drawImage(video,0,0,width,height);
      const frame=context.getImageData(0,0,width,height);
      const result=window.jsQR(frame.data,width,height,{inversionAttempts:"attemptBoth"});
      code=result?.data||"";
    }
    if(code){
      $("scan-input").value=code;hideCamera();await handleQR(code);return;
    }
   }catch(error){console.warn("Lector QR:",error?.message||error)}
   if(state.camera)requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
 }catch(e){hideCamera();notice("No se pudo abrir cámara. Puedes pegar el enlace.","error")}
}
async function readSheets(){
 if(!liveAccount())return;
 if(state.isCoordinator){
  const [schedule,sheets]=await Promise.all([
    getDocFromServer(doc(db,"agora_ops_control","schedule")),
    getDocsFromServer(collection(db,"agora_ops_attendance_sheets"))
  ]);
  state.schedule=schedule.exists()?schedule.data():null;
  state.sheets=sheets.docs.map(d=>({id:d.id,...d.data()}));
 }else{
  const q=query(collection(db,"agora_ops_attendance_sheets"),
    where("supervisorUids","array-contains",state.user.uid));
  const docs=await getDocsFromServer(q);
  state.sheets=docs.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active===true);
  state.schedule=null;
 }
}
function showUI(){
 $("scan-session").textContent=state.user?.email||"Sin sesión";
 $("scan-logout").hidden=!state.user;
 $("scan-login").hidden=!!state.user;
 $("scan-restricted").hidden=!state.user||state.allowed;
 $("scan-workspace").hidden=!state.allowed;
 if(!state.allowed)return;
 $("scan-role").textContent=state.isCoordinator?"Coordinación · Validación de horas":"Supervisor · Solo pase de lista";
 $("scan-coordinator").hidden=!state.isCoordinator;
 $("scan-payment-panel").hidden=!state.isCoordinator;
 renderSheets();
}
function renderSheets(){
 const select=$("scan-sheets");
 const prev=state.sheet?.eventId||"";
 let options=state.sheets.filter(s=>state.isCoordinator||s.active);
 options=options.sort((a,b)=>new Date(a.startsAt?.toDate?.()||a.startsAt)-
   new Date(b.startsAt?.toDate?.()||b.startsAt));
 select.innerHTML='<option value="">Selecciona una jornada…</option>'+
  options.map(x=>'<option value="'+esc(x.eventId)+'">'+
   esc(fmt(x.startsAt))+' · '+esc(x.title)+'</option>').join("");
 if(options.some(x=>x.eventId===prev))select.value=prev;
 else{
  state.sheet=null;$("scan-event-content").hidden=true;
  const now=Date.now();
  const next=options.find(x=>{
   const start=new Date(x.startsAt?.toDate?.()||x.startsAt).getTime();
   const end=new Date(x.endsAt?.toDate?.()||x.endsAt).getTime();
   return start<=now&&end>=now;
  })||options.find(x=>new Date(x.startsAt?.toDate?.()||x.startsAt).getTime()>=now);
  if(next)select.value=next.eventId;
 }
 if(state.isCoordinator){
  const all=shiftCandidates(state.schedule);
  const enabled=new Set(state.sheets.map(s=>s.eventId));
  $("scan-new-event").innerHTML='<option value="">Elige jornada del cronograma…</option>'+
   all.filter(e=>!enabled.has(String(e.id))).map(e=>
    '<option value="'+esc(e.id)+'">'+esc(fmt(e.start))+' · '+
    esc(e.title||e.project||"Jornada")+'</option>').join("");
 }
}
async function selectSheet(eventId){
 state.sheet=null;state.roster=[];state.entries=[];state.approvals=[];state.clocks=[];state.remoteRequests=[];
 state.qr=null;$("scan-qr-result").hidden=true;
 if(!eventId){$("scan-event-content").hidden=true;return}
 const sheet=state.sheets.find(x=>x.eventId===eventId);
 if(!sheet||(!state.isCoordinator&&!sheet.active))throw Error("No tienes acceso a esta jornada.");
 state.sheet=sheet;
 await refreshSheet();
 $("scan-event-content").hidden=false;
 renderSheet();
}
async function refreshSheet(){
 if(!state.sheet)return;
 const id=state.sheet.eventId;
 const collections=[
  getDocsFromServer(collection(db,"agora_ops_attendance_sheets",id,"roster")),
  getDocsFromServer(collection(db,"agora_ops_attendance_sheets",id,"entries")),
  getDocsFromServer(collection(db,"agora_ops_attendance_sheets",id,"remote_requests"))
 ];
 if(state.isCoordinator){
  collections.push(getDocsFromServer(collection(db,"agora_ops_attendance_sheets",id,"approvals")));
  collections.push(getDocsFromServer(query(collection(db,"agora_ops_clock"),where("eventId","==",id))));
 }
 const [roster,entries,remoteRequests,approvals,clocks]=await Promise.all(collections);
 state.roster=roster.docs.map(d=>d.data());
 state.entries=entries.docs.map(d=>d.data());
 state.remoteRequests=remoteRequests.docs.map(d=>({id:d.id,...d.data()}));
 state.approvals=approvals?approvals.docs.map(d=>d.data()):[];
 state.clocks=clocks?clocks.docs.map(d=>d.data()):[];
}
function rosterPeople(){
 const out=new Map(state.roster.map(x=>[x.personId,{
   personId:x.personId,uid:x.uid,name:x.name,
   activityKeys:x.activityKeys||[],source:"manual"
 }]));
 for(const e of state.entries){
  if(e.source==="provisional"&&!out.has(e.personId))
   out.set(e.personId,{
    personId:e.personId,uid:"",name:e.personName,
    activityKeys:[],source:"provisional"
   });
 }
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name,"es"));
}
function renderSheet(){
 const sheet=state.sheet;
 if(!sheet)return;
 $("scan-event-title").textContent=sheet.title;
 $("scan-event-meta").textContent=fmt(sheet.startsAt)+" – "+fmt(sheet.endsAt)+" · "+sheet.site;
 $("scan-active-status").textContent=!sheet.active?"Lista cerrada":
  sheet.validationMode!=="remoto"&&!isLocalAttendanceTime(sheet)?"Fuera del horario de asistencia":"Lista habilitada";
 $("scan-create-entry").disabled=!sheet.active||sheet.validationMode==="remoto";
 $("scan-manual-method").hidden=sheet.validationMode==="remoto";
 $("scan-register-provisional").disabled=!sheet.active||sheet.validationMode==="remoto";
 document.querySelector(".attendance-methods").hidden=sheet.validationMode==="remoto";
 $("scan-supervisors").hidden=!state.isCoordinator;
 $("scan-remote-requests").hidden=sheet.validationMode!=="remoto";
 $("scan-qr-guidance").textContent=sheet.validationMode==="remoto"?
  "Modo remoto activo: el Staff solicita su pase desde Mi espacio. Revisa aquí las solicitudes con ubicación y hora; el GPS no las aprueba automáticamente.":
  "Confirma la presencia del colaborador. El QR de identificación personal no funciona aquí.";
 const names=rosterPeople();
 $("scan-person").innerHTML='<option value="">Elige colaborador…</option>'+
  names.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+
   (p.source==="provisional"?" · Provisional":"")+'</option>').join("");
 const entryNames=new Set(state.entries.map(x=>x.personId));
 $("scan-count").textContent=names.length+" personas · "+entryNames.size+" con registro";
 renderEntries();renderApprovals();
 renderRemoteRequests();
 if(state.isCoordinator)renderSupervisorControl();
}
const displayTime=value=>{
 const date=value?.toDate?value.toDate():new Date(value);
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("es-MX",{
  weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"
 }).format(date):"—";
};
function renderRemoteRequests(){
 const target=$("scan-remote-entries");
 if(!target)return;
 const rows=[...state.remoteRequests].sort((a,b)=>(
  (b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)
  )).slice(0,30);
 target.innerHTML=rows.length?rows.map(item=>{
  const statusLabel={pendiente:"Pendiente de revisión",validado:"Pase confirmado",rechazado:"Rechazado"}[item.status]||item.status;
  const geo=item.location||{};
  const detail=Number.isFinite(geo.lat)&&Number.isFinite(geo.lng)?
   "GPS "+Number(geo.lat).toFixed(5)+", "+Number(geo.lng).toFixed(5)+
   " · precisión ±"+Math.round(Number(geo.accuracy)||0)+" m":"GPS no disponible";
  const mapUrl=Number.isFinite(geo.lat)&&Number.isFinite(geo.lng)?
   "https://maps.google.com/?q="+encodeURIComponent(geo.lat+","+geo.lng):"";
  const receipt="Pase de lista "+(item.status==="validado"?"confirmado":"solicitado")+
   " · "+item.action+" · "+displayTime(item.capturedAt)+" · "+detail+
   (item.reviewerName?" · Hecho por "+item.reviewerName:" · Responsable pendiente");
  const actions=state.sheet.active&&item.status==="pendiente"&&item.ownerUid!==state.user.uid?
   '<div class="attendance-row-actions"><button type="button" data-remote-review="validado" data-remote-id="'+esc(item.id)+'" class="profile-button profile-button-primary">Confirmar pase</button><button type="button" data-remote-review="rechazado" data-remote-id="'+esc(item.id)+'" class="profile-button profile-button-outline">Rechazar</button></div>':"";
  return '<article class="attendance-row"><div><strong>'+esc(item.personName)+" · "+esc(item.action)+
   '</strong><small>'+esc(statusLabel)+" · solicitado "+esc(displayTime(item.capturedAt))+" · "+esc(detail)+
   '</small>'+(mapUrl?'<small><a href="'+esc(mapUrl)+'" target="_blank" rel="noopener noreferrer">Abrir ubicación en mapa</a></small>':"")+
   (item.reviewerName?'<small>Responsable: '+esc(item.reviewerName)+" · revisó "+esc(displayTime(item.reviewedAt))+"</small>":"")+
   (item.validationNote?'<small>Observación: '+esc(item.validationNote)+"</small>":"")+
   '<small>'+esc(receipt)+'</small></div>'+actions+'</article>';
 }).join(""):'<p class="role-empty">No hay solicitudes remotas en esta jornada.</p>';
}
function renderSupervisorControl(){
 const people=shiftPreview(state.schedule,state.sheet.eventId).people
  .filter(p=>p.uid&&p.uid!==state.user.uid);
 const current=state.sheet.supervisorUids||[];
 $("scan-toggle-active").textContent=state.sheet.active?"Cerrar pase de lista":"Reabrir pase de lista";
 $("scan-supervisor-options").innerHTML=people.map(p=>
   '<label class="attendance-person-option"><input type="checkbox" name="supervisor" value="'+
   esc(p.uid)+'" '+(current.includes(p.uid)?"checked":"")+'>'+
   esc(p.name)+'</label>').join("")||
   '<p>No hay personas con UID asignado en el cronograma.</p>';
}
function renderEntries(){
 const box=$("scan-entries");
 const data=[...state.entries].sort((a,b)=>
  (b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
 box.innerHTML=data.length?data.map(e=>
  '<article class="attendance-row"><div><strong>'+esc(e.personName)+'</strong>'+
   '<small>'+esc(e.action)+' · '+esc(e.source)+' · '+esc(fmt(e.createdAt))+'</small>'+
   '<small>'+esc(e.status)+
     (e.validationNote?" · "+esc(e.validationNote):"")+'</small></div>'+
   (state.isCoordinator&&e.status==="pendiente"?
    '<div class="attendance-row-actions">'+
      '<button type="button" class="profile-button profile-button-outline" data-review="validado" data-id="'+esc(e.id)+'">Validar</button>'+
      '<button type="button" class="profile-button profile-button-outline" data-review="rechazado" data-id="'+esc(e.id)+'">Rechazar</button></div>':
     '<span class="attendance-status">'+esc(e.status)+'</span>')+
   '</article>').join(""):
   '<p class="role-empty">Todavía no hay asistencias registradas para esta jornada.</p>';
}
function recordFor(personId,action){
 return state.entries.find(e=>e.personId===personId&&e.action===action&&
  e.activityKey==="jornada"&&e.status==="validado");
}
function clockFor(person){
 return state.clocks.find(c=>c.eventId===state.sheet.eventId&&
   c.personId===person.personId&&c.status==="finalizada");
}
function renderApprovals(){
 if(!state.isCoordinator)return;
 const results=$("scan-review-person");
 const known=new Set(state.approvals.map(x=>x.personId));
 const ready=rosterPeople().filter(p=>
  !known.has(p.personId)&&(
   (recordFor(p.personId,"entrada")&&recordFor(p.personId,"salida"))||
   clockFor(p)));
 results.innerHTML='<option value="">Selecciona un registro completo…</option>'+
  ready.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+'</option>').join("");
 const approvals=state.approvals;
 $("scan-approvals").innerHTML=approvals.length?approvals.map(a=>
  '<div class="attendance-row"><div><strong>'+esc(a.personName)+'</strong>'+
   '<small>'+a.approvedMinutes+' min validados · '+esc(a.source)+'</small></div>'+
   '<button type="button" class="profile-button profile-button-outline" data-hours-receipt="'+
   esc(a.personId)+'">Recibo de horas</button>'+
   '<a class="profile-button profile-button-outline" href="'+esc(hoursFinanceLink(a))+'">Abrir en Finanzas</a></div>').join(""):
  '<p class="role-empty">Aún no hay horas validadas para pago.</p>';
}
function hoursFinanceLink(approval){
 const url=new URL("../recursos/",root);
 url.searchParams.set("jornada",approval.eventId);
 url.searchParams.set("asignacion",approval.personId);
 return url.href;
}
function fillApproval(){
 const person=rosterPeople().find(p=>p.personId===$("scan-review-person").value);
 if(!person)return;
 const clock=clockFor(person);
 const entry=recordFor(person.personId,"entrada");
 const exit=recordFor(person.personId,"salida");
 $("scan-review-start").value=dateInput(clock?.startedAt||entry?.capturedAt||entry?.createdAt);
 $("scan-review-end").value=dateInput(clock?.endedAt||exit?.capturedAt||exit?.createdAt);
 $("scan-review-break").value="0";
 $("scan-review-notes").value="";
}
async function configureSheet(){
 if(!state.isCoordinator||!liveAccount())throw Error("Solo coordinación puede habilitar jornadas.");
 const id=$("scan-new-event").value;
 if(!id)throw Error("Selecciona una jornada del cronograma.");
 const preview=shiftPreview(state.schedule,id);
 if(preview.roster.length>100)throw Error("Esta jornada supera 100 integrantes: dividir la lista antes de habilitar.");
 const assigned=[...document.querySelectorAll('#scan-new-supervisors input:checked')].map(x=>x.value);
 const validationMode=$("scan-validation-mode").value;
 const remoteWindowMinutes=Number($("scan-remote-window").value);
 if(!["presencial","remoto"].includes(validationMode)||![5,10,15,30].includes(remoteWindowMinutes))
  throw Error("Elige un modo y una ventana de validación válidos.");
 const batch=writeBatch(db),stamp=serverTimestamp(),base=sheetRef(id);
 batch.set(base,{
  eventId:id,title:preview.title,site:preview.site,
  startsAt:Timestamp.fromDate(preview.startsAt),endsAt:Timestamp.fromDate(preview.endsAt),
  active:true,supervisorUids:assigned,
  validationMode,remoteWindowMinutes,
  createdBy:state.user.uid,createdAt:stamp,
  updatedBy:state.user.uid,updatedAt:stamp,revision:1
 });
 for(const p of preview.roster){
  batch.set(rosterRef(id,p.personId),{
   eventId:id,personId:p.personId,uid:p.uid,name:p.name,
   activityKeys:p.activityKeys,
   createdBy:state.user.uid,createdAt:stamp
  });
 }
 await batch.commit();
 notice("Jornada habilitada. Los supervisores asignados ya pueden pasar lista.","success");
 await readSheets();renderSheets();$("scan-sheets").value=id;await selectSheet(id);
}
function previewNewSupervisors(){
 if(!state.isCoordinator||!$("scan-new-event").value){
  $("scan-new-supervisors").replaceChildren();return;
 }
 try{
  const people=shiftPreview(state.schedule,$("scan-new-event").value).people;
  $("scan-new-supervisors").innerHTML=people.filter(p=>p.uid&&p.uid!==state.user.uid)
   .map(p=>'<label class="attendance-person-option"><input type="checkbox" value="'+esc(p.uid)+'" name="newSupervisor">'+
      esc(p.name)+'</label>').join("")+
   '<p class="role-help">Solo personas con ID Dejavú vigente podrán actuar como supervisores de esta jornada.</p>';
 }catch(e){$("scan-new-supervisors").textContent=errMessage(e)}
}
async function updateSupervisors(){
 if(!state.isCoordinator||!state.sheet)return;
 const uids=[...$("scan-supervisor-options").querySelectorAll('input:checked')].map(x=>x.value);
 await updateDoc(sheetRef(state.sheet.eventId),{
  supervisorUids:uids,updatedBy:state.user.uid,
  updatedAt:serverTimestamp(),revision:state.sheet.revision+1
 });
 notice("Permisos de supervisión actualizados.","success");
 await readSheets();await selectSheet(state.sheet.eventId);
}
function preciseLocation(){
 if(!navigator.geolocation)throw Error("El dispositivo no ofrece ubicación GPS.");
 return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>{
  const {latitude:lat,longitude:lng,accuracy}=position.coords;
  if(![lat,lng,accuracy].every(Number.isFinite)||accuracy>150){
   reject(Error("La ubicación no fue lo bastante precisa. Activa GPS y vuelve a intentar."));return;
  }
  resolve({lat,lng,accuracy});
 },error=>reject(Error(error.code===1?"Permite ubicación para registrar el pase.":
  error.code===3?"La ubicación tardó demasiado; inténtalo otra vez.":"No se pudo obtener la ubicación.")),
 {enableHighAccuracy:true,maximumAge:0,timeout:20000}));
}
async function toggleSheet(){
 if(!state.isCoordinator||!state.sheet)throw Error("Solo Coordinación administra la lista.");
 const eventId=state.sheet.eventId,active=!state.sheet.active;
 if(!confirm(active?"¿Reabrir el pase de lista?":"¿Cerrar el pase de lista? Los supervisores no podrán registrar nuevas asistencias."))return;
 await updateDoc(sheetRef(eventId),{
   active,updatedBy:state.user.uid,
   updatedAt:serverTimestamp(),revision:state.sheet.revision+1
 });
 await readSheets();renderSheets();$("scan-sheets").value=eventId;await selectSheet(eventId);
 notice(active?"Pase de lista reabierto.":"Pase de lista cerrado. Los registros previos permanecen.","success");
}
function randomProvisional(){
 const bytes=new Uint8Array(10);
 crypto.getRandomValues(bytes);
 return freshProvisionalId([...bytes].map(x=>x.toString(16).padStart(2,"0")).join(""));
}
async function registerEntry({person,source,action,activityKey="jornada",reason,notes}){
 if(!state.sheet||!state.allowed||!liveAccount())throw Error("Inicia sesión en una jornada autorizada.");
 if(!state.sheet.active)throw Error("Esta lista está cerrada.");
 if(!isLocalAttendanceTime(state.sheet))throw Error("El pase presencial está fuera del horario de esta jornada.");
 const stamp=serverTimestamp();
 const location=await preciseLocation();
 const capturedAt=serverTimestamp();
 const shownAt=Timestamp.fromDate(new Date());
 const actorName=clean(state.user.displayName||state.user.email||"Responsable").slice(0,140);
 const draft={...entryDraft({
  eventId:state.sheet.eventId,person,source,action,activityKey,
  reason,notes,actorUid:state.user.uid,stamp
 }),actorName,location,capturedAt};
 const ref=entryRef(state.sheet.eventId,draft.id);
 if((await getDocFromServer(ref)).exists())
  throw Error("Esta entrada, salida o actividad ya fue registrada. No se duplicó.");
 await setDoc(ref,draft);
 notice("Pase de lista "+action+" registrado a las "+displayTime(shownAt)+
  " · GPS "+location.lat.toFixed(5)+", "+location.lng.toFixed(5)+
  " (±"+Math.round(location.accuracy)+" m) · hecho por "+actorName+
  ". Pendiente de validación de Coordinación.","success");
 await refreshSheet();renderSheet();
}
async function manualEntry(){
 const person=rosterPeople().find(x=>x.personId===$("scan-person").value);
 if(!person)throw Error("Selecciona a la persona.");
 const action=$("scan-manual-action").value;
 const source=person.source==="provisional"?"provisional":"manual";
 const notes=clean($("scan-manual-notes").value);
 if(!confirm("¿Confirmas que verificaste presencialmente a "+person.name+"?"))return;
 await registerEntry({person,source,action,notes});
}
async function provisionalEntry(){
 const name=clean($("scan-provisional-name").value);
 const reason=clean($("scan-provisional-reason").value);
 if(name.length<2||reason.length<10)
  throw Error("Indica el nombre y explica por qué no está en la lista (mínimo 10 caracteres).");
 if(!confirm("¿Confirmas que esta persona está presente y que su asignación necesita revisión?"))return;
 const person={personId:randomProvisional(),uid:"",name};
 await registerEntry({
  person,source:"provisional",action:"entrada",reason,
  notes:("Solicitado por: "+clean($("scan-provisional-requester").value)+
    " | Medio: "+$("scan-provisional-channel").value+
    " | Alta provisional por supervisión").slice(0,400)
 });
 $("scan-provisional-name").value="";$("scan-provisional-reason").value="";
 $("scan-provisional-requester").value="";
}
async function reviewEntry(id,status){
 if(!state.isCoordinator||!state.sheet)throw Error("Solo Coordinación valida la asistencia.");
 const item=state.entries.find(e=>e.id===id&&e.status==="pendiente");
 if(!item)throw Error("Este registro ya fue revisado.");
 const note=prompt(status==="rechazado"?
  "Motivo del rechazo (obligatorio):":"Observación de validación (opcional):","") ;
 if(note===null)return;
 if(status==="rechazado"&&clean(note).length<8)
  throw Error("Explica el rechazo con al menos 8 caracteres.");
 await updateDoc(entryRef(state.sheet.eventId,id),{
   status,validatedBy:state.user.uid,
   validatedAt:serverTimestamp(),validationNote:clean(note).slice(0,600)
 });
 notice("Registro "+(status==="validado"?"validado":"rechazado")+
  " por Coordinación. Sin aprobación de pago automática.","success");
 await refreshSheet();renderSheet();
}
async function reviewRemoteRequest(id,status){
 if(!state.sheet||!state.sheet.active||!state.allowed)throw Error("Jornada no disponible.");
 const item=state.remoteRequests.find(x=>x.id===id&&x.status==="pendiente");
 if(!item||item.ownerUid===state.user.uid)throw Error("No puedes validar tu propia solicitud.");
 const reviewerName=clean(state.user.displayName||state.user.email||"Responsable").slice(0,140);
 let note="";
 if(status==="rechazado"){
  note=prompt("Motivo del rechazo (obligatorio):","");
  if(note===null)return;
  note=clean(note).slice(0,600);
  if(note.length<8)throw Error("Explica el rechazo con al menos 8 caracteres.");
 }else{
  if(!confirm("¿Confirmas este pase remoto con la ubicación GPS y hora reportada?"))return;
  note=clean(prompt("Observación de validación (opcional):","")||"").slice(0,600);
 }
 const stamp=serverTimestamp(),batch=writeBatch(db);
 batch.update(doc(db,"agora_ops_attendance_sheets",state.sheet.eventId,"remote_requests",id),{
  status,reviewedBy:state.user.uid,reviewerName,reviewedAt:stamp,validationNote:note
 });
 if(status==="validado"){
  const entryId=item.personId+"__"+item.action+"__jornada";
  const entry={id:entryId,eventId:item.eventId,personId:item.personId,
   ownerUid:item.ownerUid,personName:item.personName,source:"remoto",action:item.action,
   activityKey:"jornada",reason:"",notes:item.notes||"",actorUid:state.user.uid,
   actorName:reviewerName,createdAt:stamp,status:"validado",location:item.location,
   capturedAt:item.capturedAt,validatedBy:state.user.uid,validatedAt:stamp,remoteRequestId:id};
  batch.set(entryRef(state.sheet.eventId,entryId),entry);
 }
 await batch.commit();
 const statusText=status==="validado"?"Pase de lista confirmado":"Solicitud remota rechazada";
 notice(statusText+" · "+item.personName+" · "+item.action+" · "+
  displayTime(item.capturedAt)+" · GPS "+Number(item.location.lat).toFixed(5)+", "+
  Number(item.location.lng).toFixed(5)+" (±"+Math.round(Number(item.location.accuracy))+" m) · Hecho por "+reviewerName+".",
  status==="validado"?"success":"warning");
 await refreshSheet();renderSheet();
}
async function approveHours(){
 if(!state.isCoordinator||!state.sheet)return;
 const person=rosterPeople().find(p=>p.personId===$("scan-review-person").value);
 if(!person)throw Error("Selecciona al colaborador con entrada y salida verificadas.");
 const start=new Date($("scan-review-start").value),end=new Date($("scan-review-end").value);
 const breaks=Number($("scan-review-break").value);
 const minutes=calculateNetMinutes(start,end,breaks);
 if(!confirm("¿Validar "+(minutes/60).toFixed(2)+" horas de "+person.name+
  " para revisión de pago? Esto NO realiza ninguna transferencia."))return;
 const clock=clockFor(person);
 const source=clock?"reloj":recordFor(person.personId,"entrada")?.source||"manual";
 const approved=approvalDraft({
   eventId:state.sheet.eventId,person:{...person,source},
   entry:Timestamp.fromDate(start),exit:Timestamp.fromDate(end),
   breakMinutes:breaks,notes:clean($("scan-review-notes").value),
   actorUid:state.user.uid,stamp:serverTimestamp()
 });
 const ref=approvalRef(state.sheet.eventId,person.personId);
 if((await getDocFromServer(ref)).exists())
  throw Error("Las horas ya fueron validadas. Para correcciones abre una incidencia.");
 await setDoc(ref,approved);
 notice("Horas validadas y vinculadas a la jornada. Listas para solicitar revisión de pago.","success");
 await refreshSheet();renderSheet();
}
async function copyPaySummary(){
 const text=payrollSummary(state.sheet,state.approvals);
 await navigator.clipboard.writeText(text);
 notice("Resumen de horas copiado. Envíalo al proceso de pagos separado.","success");
}
function printHoursSummary(){
 if(!state.isCoordinator||!state.sheet)throw Error("Solo Coordinación puede imprimir horas validadas.");
 printValidatedHours("Horas validadas",payrollSummary(state.sheet,state.approvals));
}
function printHoursReceipt(personId){
 if(!state.isCoordinator||!state.sheet)throw Error("Solo Coordinación puede imprimir horas validadas.");
 const approval=state.approvals.find(item=>item.personId===personId);
 printValidatedHours("Recibo de horas",validatedHoursReceipt(state.sheet,approval));
}
function printValidatedHours(title,content){
 const w=window.open("","_blank");
 if(!w)throw Error("El navegador bloqueó la ventana de impresión. Activa ventanas emergentes para ÁGORA.");
 w.document.open();
 w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<title>ÁGORA · '+esc(title)+'</title>'+
  '<style>body{font-family:Arial,sans-serif;color:#171819;margin:36px;'+
  'font-size:13px}h1{font-size:23px;margin-bottom:19px}pre{font:13px/1.8 Arial,'+
  'sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}'+
  'footer{border-top:1px solid #ccc;padding-top:12px;color:#555;font-size:11px}</style></head>'+
  '<body><h1>ÁGORA · Dejavú Marketing</h1><pre>'+esc(content)+'</pre>'+
  '<footer>Constancia de las horas validadas por Coordinación.</footer></body></html>');
 w.document.close();w.focus();w.print();
}
async function handleQR(raw){
 const scan=parseShiftQr(clean(raw),{origin:root.href,now:Date.now()});
 if(!state.sheet||state.sheet.eventId!==scan.eventId)
  throw Error("Selecciona primero la jornada indicada por el QR.");
 const person=state.roster.find(p=>p.personId===scan.personId&&p.uid===scan.uid);
 if(!person)throw Error("El QR no corresponde a un colaborador asignado a esta jornada.");
 if(scan.uid===state.user.uid)throw Error("No puedes registrar tu propia asistencia.");
 if(scan.activityKey&&!(person.activityKeys||[]).includes(scan.activityKey)){
  const task=await getDocFromServer(doc(db,"agora_ops_attendance_sheets",
    state.sheet.eventId,"activities",scan.activityKey));
  if(!task.exists()||task.data().uid!==person.uid||
     task.data().personId!==person.personId)
   throw Error("La actividad no está en la asignación actual.");
 }
 state.qr={scan,person};
 $("scan-qr-result").hidden=false;
 $("scan-qr-identity").textContent=person.name+" · "+state.sheet.title+
    (scan.activityKey?" · Actividad "+scan.activityKey:"");
 const remoteMode=state.sheet.validationMode==="remoto";
 $("scan-qr-entry").hidden=remoteMode||!!scan.activityKey;
 $("scan-qr-exit").hidden=remoteMode||!!scan.activityKey;
 $("scan-qr-activity").hidden=remoteMode||!scan.activityKey;
 notice(remoteMode?"QR vigente. El pase a distancia requiere solicitud GPS desde el dispositivo del Staff.":
  "QR vigente y asignación confirmada. Comprueba físicamente al colaborador.","success");
}
async function qrEntry(action){
 if(!state.qr)throw Error("Escanea primero un QR válido.");
 const {scan,person}=state.qr;
 const url=new URL("escanear/",root);
 for(const [key,value] of Object.entries({
  v:"1",u:scan.uid,p:scan.personId,e:scan.eventId,
  ...(scan.activityKey?{a:scan.activityKey}:{}),
  t:String(scan.issuedAt)
 }))url.searchParams.set(key,value);
 parseShiftQr(url.href,{origin:root.href,now:Date.now()});
 if(state.sheet.validationMode==="remoto")throw Error("Esta jornada requiere solicitud remota desde el dispositivo del Staff.");
 if(!confirm("¿Confirmas que "+person.name+" está físicamente presente y autorizas capturar la ubicación de este dispositivo?"))return;
 await registerEntry({
  person,source:"qr",action,
  activityKey:action==="actividad"?scan.activityKey:"jornada",
  reason:"",notes:"Presencia física confirmada con QR de jornada"
 });
 state.qr=null;$("scan-qr-result").hidden=true;
}
async function loadView(user){
 state.user=user;state.allowed=false;state.isCoordinator=false;
 state.schedule=null;state.sheets=[];state.sheet=null;
 hideCamera();
 $("scan-event-content").hidden=true;
 if(!user){showUI();return notice("Inicia sesión para pasar lista.","")}
 try{
  state.isCoordinator=await roleInfo(user);
  await readSheets();
  if(auth.currentUser?.uid!==user.uid)return;
  state.allowed=state.isCoordinator||state.sheets.length>0;
  showUI();
  if(!state.allowed)return notice(
   "No tienes ninguna jornada delegada. Coordinación debe asignarte como supervisor.","warning");
  notice(state.isCoordinator?
   "Coordinación: habilita listas y valida horas antes de enviarlas a pagos.":
   "Supervisor: registra únicamente la asistencia de las jornadas asignadas.","success");
  if(location.search){
   try{
    const scan=parseShiftQr(location.href,{origin:root.href,now:Date.now()});
    $("scan-sheets").value=scan.eventId;
    await selectSheet(scan.eventId);
    await handleQR(location.href);
   }catch(e){console.warn("QR no disponible",errMessage(e))}
  }else if($("scan-sheets").value){
   await selectSheet($("scan-sheets").value);
  }
 }catch(e){
  state.allowed=false;showUI();notice(errMessage(e),"error");
 }
}
async function act(fn){
 if(state.working)return;
 busy(true);
 try{await fn()}catch(e){notice(errMessage(e),"error")}
 finally{busy(false)}
}
$("scan-google").addEventListener("click",openGoogle);
$("scan-logout").addEventListener("click",()=>act(async()=>{
 hideCamera();await signOut(auth);
}));
$("scan-sheets").addEventListener("change",e=>act(()=>selectSheet(e.target.value)));
$("scan-new-event").addEventListener("change",previewNewSupervisors);
$("scan-validation-mode").addEventListener("change",()=>{
 const remote=$("scan-validation-mode").value==="remoto";
 $("scan-remote-window").hidden=!remote;
 $("scan-validation-help").textContent=remote?
  "El Staff comparte una ubicación GPS puntual dentro de esta ventana. Si el responsable no responde enseguida, la solicitud permanece pendiente. La ubicación sola no valida asistencia.":
  "El Supervisor o Coordinador escanea el QR o pasa lista en el lugar de la jornada.";
});
$("scan-remote-window").hidden=true;
$("scan-configure").addEventListener("click",()=>act(configureSheet));
$("scan-update-supervisors").addEventListener("click",()=>act(updateSupervisors));
$("scan-toggle-active").addEventListener("click",()=>act(toggleSheet));
$("scan-create-entry").addEventListener("click",()=>act(manualEntry));
$("scan-register-provisional").addEventListener("click",()=>act(provisionalEntry));
$("scan-open-camera").addEventListener("click",cameraStart);
$("scan-close-camera").addEventListener("click",hideCamera);
$("scan-verify").addEventListener("click",()=>act(()=>handleQR($("scan-input").value)));
$("scan-qr-entry").addEventListener("click",()=>act(()=>qrEntry("entrada")));
$("scan-qr-exit").addEventListener("click",()=>act(()=>qrEntry("salida")));
$("scan-qr-activity").addEventListener("click",()=>act(()=>qrEntry("actividad")));
$("scan-refresh").addEventListener("click",()=>act(async()=>{
 await readSheets();renderSheets();
 if(state.sheet)await selectSheet(state.sheet.eventId);
 notice("Lista actualizada desde Firebase.","success");
}));
$("scan-entries").addEventListener("click",e=>{
 const b=e.target.closest("[data-review]");
 if(!b)return;act(()=>reviewEntry(b.dataset.id,b.dataset.review));
});
$("scan-remote-entries").addEventListener("click",e=>{
 const button=e.target.closest("[data-remote-review]");
 if(!button)return;
 act(()=>reviewRemoteRequest(button.dataset.remoteId,button.dataset.remoteReview));
});
$("scan-review-person").addEventListener("change",fillApproval);
$("scan-approve-hours").addEventListener("click",()=>act(approveHours));
$("scan-copy-payroll").addEventListener("click",()=>act(copyPaySummary));
$("scan-print-payroll").addEventListener("click",()=>act(printHoursSummary));
$("scan-approvals").addEventListener("click",event=>{
 const button=event.target.closest("[data-hours-receipt]");
 if(button)act(()=>printHoursReceipt(button.dataset.hoursReceipt));
});
document.addEventListener("visibilitychange",()=>{if(document.hidden)hideCamera()});
onAuthStateChanged(auth,user=>{loadView(user)});
