/**
 * ÁGORA · Escáner presencial de QR de jornada/actividad.
 * Necesita rol canEdit() (admin/coordinador) según las reglas vigentes.
 *
 * Guarda una VALIDACIÓN DE QR en agora_ops_incidents, que está separada
 * explícitamente del reloj oficial agora_ops_clock. No altera horas del Staff.
 */
import {auth,db} from "./firebase.js";
import {
  GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  doc,getDocFromServer,setDoc,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {
  parseShiftQr,verifyShiftAssignment,validateScanPermit,
  qrValidationDocId,qrValidationRecord
} from "./qr-jornada.mjs";
const root=new URL("./",import.meta.url);
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const state={user:null,allowed:false,busy:false,scan:null,assignment:null,camera:null};
const t=msg=>{$("scan-status").textContent=msg};
function renderAccess(){
 $("scan-login").hidden=!!state.user;
 $("scan-workspace").hidden=!state.user||!state.allowed;
 $("scan-restricted").hidden=!state.user||state.allowed;
 $("scan-session").textContent=state.user?.email||"Sin sesión";
 $("scan-logout").hidden=!state.user;
}
async function checkRole(user){
 const result=await getDocFromServer(doc(db,"agora_users",user.uid));
 return user.emailVerified===true&&result.exists()&&
  result.data().active===true&&
  ["admin","coordinador"].includes(result.data().role);
}
async function startAuth(){
 try{
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  await signInWithPopup(auth,provider);
 }catch(e){t("No se pudo abrir Google: "+String(e?.message||e))}
}
async function handleScan(input){
 if(!state.allowed||!state.user)return t("Inicia sesión como coordinador autorizado.");
 if(state.busy)return;
 state.busy=true;$("scan-verify").disabled=true;
 try{
  state.scan=null;state.assignment=null;
  $("scan-result").hidden=true;
  const scan=parseShiftQr(String(input).trim(),{origin:root.href,now:Date.now()});
  t("Verificando jornada y asignación con Firebase…");
  const sched=await getDocFromServer(doc(db,"agora_ops_control","schedule"));
  if(!sched.exists())throw Error("Aún no existe cronograma publicado.");
  const assignment=verifyShiftAssignment(sched.data(),scan);
  const permission=await getDocFromServer(doc(db,"agora_ops_shift_access",scan.uid+"_"+scan.eventId));
  validateScanPermit(permission.exists()?permission.data():null,assignment,Date.now());
  if(auth.currentUser?.uid!==state.user.uid)throw Error("La sesión del supervisor cambió.");
  state.scan=scan;state.assignment=assignment;
  const details=$("scan-identity");
  details.innerHTML='<strong>'+esc(assignment.fullName)+'</strong>'+
   '<span>Jornada: '+esc(assignment.eventTitle)+'</span>'+
   '<span>Actividad: '+esc(assignment.activity?.name||"Jornada general")+'</span>'+
   '<span>UID asignado verificado en el cronograma</span>';
  $("scan-entry").hidden=!!scan.activityKey;
  $("scan-exit").hidden=!!scan.activityKey;
  $("scan-activity").hidden=!scan.activityKey;
  $("scan-result").hidden=false;
  t("QR de jornada válido. Comprueba presencialmente a la persona antes de registrar.");
 }catch(e){
  $("scan-result").hidden=true;
  t(String(e?.message||"No se pudo validar el código."));
 }finally{state.busy=false;$("scan-verify").disabled=false}
}
async function confirmAttendance(action){
 if(state.busy||!state.scan||!state.assignment||!state.allowed)return;
 if(!confirm("¿Confirmas que verificaste físicamente la identidad del colaborador y su presencia?"))return;
 state.busy=true;
 const buttons=[$("scan-entry"),$("scan-exit"),$("scan-activity")];
 buttons.forEach(b=>b.disabled=true);
 try{
  const url=new URL("escanear/",root);
  for(const [k,v] of Object.entries({
   v:"1",u:state.scan.uid,e:state.scan.eventId,p:state.scan.personId,
   ...(state.scan.activityKey?{a:state.scan.activityKey}:{}),
   t:String(state.scan.issuedAt)
  }))url.searchParams.set(k,v);
  const scan=parseShiftQr(url.href,{origin:root.href,now:Date.now()});
  t("Comprobando permisos y duplicados antes de registrar…");
  const [userDoc,scheduleSnap,permitSnap]=await Promise.all([
   getDocFromServer(doc(db,"agora_users",state.user.uid)),
   getDocFromServer(doc(db,"agora_ops_control","schedule")),
   getDocFromServer(doc(db,"agora_ops_shift_access",scan.uid+"_"+scan.eventId))
  ]);
  if(auth.currentUser?.uid!==state.user.uid||
     !userDoc.exists()||userDoc.data().active!==true||
     !["admin","coordinador"].includes(userDoc.data().role))
   throw Error("Ya no tienes autorización de coordinación.");
  const assignment=verifyShiftAssignment(scheduleSnap.data(),scan);
  validateScanPermit(permitSnap.exists()?permitSnap.data():null,assignment,Date.now());
  const recordId=await qrValidationDocId(scan,action);
  if(action==="salida"){
   const entryId=await qrValidationDocId(scan,"entrada");
   const [entry,clock]=await Promise.all([
    getDocFromServer(doc(db,"agora_ops_incidents",entryId)),
    getDocFromServer(doc(db,"agora_ops_clock",scan.uid+"_"+scan.eventId))
   ]);
   if(!entry.exists()&&!clock.exists())
    throw Error("No existe entrada registrada ni en el pase de lista QR ni en el reloj original.");
  }
  const recordRef=doc(db,"agora_ops_incidents",recordId);
  const existing=await getDocFromServer(recordRef);
  if(existing.exists())throw Error("Esta validación ya fue registrada; no se duplicó.");
  const record=qrValidationRecord({
    scan,assignment,action,
    actorUid:state.user.uid,
    actorName:state.user.displayName||state.user.email||"Supervisor",
    stamp:serverTimestamp()
  });
  await setDoc(recordRef,{id:recordId,...record});
  t("Validación de "+(action==="actividad"?"actividad":action)+
    " guardada en Firebase. Es un registro QR independiente del reloj oficial de Jornadas.");
  $("scan-result").hidden=true;
  state.scan=null;state.assignment=null;
 }catch(e){
  const denied=String(e?.code||"").includes("permission-denied");
  t(denied?"Firebase rechazó esta validación por permisos. No se guardó ningún registro.":
    String(e?.message||"No se pudo guardar la validación."));
 }finally{
  state.busy=false;
  buttons.forEach(b=>b.disabled=false);
 }
}
function stopCamera(){
 if(state.camera?.stream){
  state.camera.stream.getTracks().forEach(track=>track.stop());
 }
 state.camera=null;
 $("scan-camera").hidden=true;
 $("scan-open-camera").disabled=false;
}
async function startCamera(){
 if(state.camera)return;
 if(!navigator.mediaDevices?.getUserMedia)
  return t("Este navegador no permite usar cámara. Puedes pegar el enlace QR.");
 if(!("BarcodeDetector" in window))
  return t("Este navegador no tiene lector QR integrado. Pega el enlace del QR en el campo.");
 try{
  const stream=await navigator.mediaDevices.getUserMedia({
   video:{facingMode:{ideal:"environment"}},audio:false
  });
  const video=$("scan-video");
  video.srcObject=stream;
  await video.play();
  $("scan-camera").hidden=false;
  $("scan-open-camera").disabled=true;
  const detector=new window.BarcodeDetector({formats:["qr_code"]});
  state.camera={stream,detector};
  const loop=async()=>{
   if(!state.camera||document.hidden)return;
   try{
    const codes=await detector.detect(video);
    if(codes.length&&codes[0].rawValue){
     const value=codes[0].rawValue;
     stopCamera();
     $("scan-input").value=value;
     await handleScan(value);
     return;
    }
   }catch(e){console.warn("Lectura QR:",e?.message||e)}
   if(state.camera)requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
 }catch(e){
  stopCamera();
  t("No fue posible abrir la cámara: "+String(e?.message||e)+". También puedes pegar el enlace del QR.");
 }
}
$("scan-google").addEventListener("click",startAuth);
$("scan-logout").addEventListener("click",async()=>{
 stopCamera();await signOut(auth);
 state.user=null;state.allowed=false;state.scan=null;renderAccess();
});
$("scan-open-camera").addEventListener("click",startCamera);
$("scan-close-camera").addEventListener("click",stopCamera);
$("scan-verify").addEventListener("click",()=>handleScan($("scan-input").value));
$("scan-entry").addEventListener("click",()=>confirmAttendance("entrada"));
$("scan-exit").addEventListener("click",()=>confirmAttendance("salida"));
$("scan-activity").addEventListener("click",()=>confirmAttendance("actividad"));
document.addEventListener("visibilitychange",()=>{
 if(document.hidden)stopCamera();
});
onAuthStateChanged(auth,async user=>{
 stopCamera();
 state.user=user;state.allowed=false;state.scan=null;state.assignment=null;
 renderAccess();
 if(!user)return t("Inicia sesión con Google para escanear una jornada.");
 try{
  state.allowed=await checkRole(user);
  renderAccess();
  if(!state.allowed)return t("Esta cuenta no tiene rol activo de coordinador o administrador. Supervisores necesitan autorización de coordinación.");
  t("Escanea el QR específico de jornada o actividad del colaborador.");
  if(location.search)await handleScan(location.href);
 }catch(e){t("No fue posible confirmar tus permisos. "+String(e?.message||e))}
});
