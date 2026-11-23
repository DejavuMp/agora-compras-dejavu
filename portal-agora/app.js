import {auth,db} from "./firebase.js";
import {
  onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithRedirect,signOut,
  sendSignInLinkToEmail,isSignInWithEmailLink,signInWithEmailLink,
  RecaptchaVerifier,signInWithPhoneNumber,PhoneAuthProvider,
  EmailAuthProvider,linkWithCredential
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  doc,getDoc,setDoc,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const ADMIN_EMAIL="admi.agora@gmail.com";
const JOBS=["Coordinador","Subcoordinador de cuenta","Supervisor","Staff","Staff de montaje","Staff de desmontaje","Volanteero","Runner"];
const app=document.getElementById("app");
const status=document.getElementById("system-status");
const sessionLabel=document.getElementById("session-label");
const logoutButton=document.getElementById("logout");
const state={user:null,identity:null,method:"phone",page:"login",space:"",sms:null,captcha:null,loading:false,finishingEmail:false};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const value=v=>String(v??"").trim();
const safePhone=v=>value(v).replace(/[\s\-().]/g,"");
const mainAdmin=u=>u?.email?.toLowerCase()===ADMIN_EMAIL&&u?.emailVerified===true;
const userRole=()=>state.identity?.account?.active===true?state.identity.account.role:"";
const verifiedId=()=>state.identity?.link?.active===true&&
  state.identity?.registry?.rhStatus==="verified"&&
  state.identity?.registry?.credentialActive===true;
const canAdmin=()=>verifiedId()&&userRole()==="admin"&&mainAdmin(state.user);
const canAgency=()=>verifiedId()&&["admin","coordinador","consulta"].includes(userRole());
const canStaff=()=>verifiedId();
const message=(m,t="")=>{status.textContent=m;if(t)status.dataset.tone=t;else delete status.dataset.tone};
const err=e=>{
  const code=String(e?.code||"");
  if(code.includes("operation-not-allowed"))return "Este método de acceso debe activarse en Firebase Authentication.";
  if(code.includes("unauthorized-domain"))return "El dominio debe agregarse a los dominios autorizados de Firebase.";
  if(code.includes("permission-denied"))return "Las reglas de Firestore todavía no permiten este acceso. Administración debe revisar las reglas de Identidad, sin modificar tu ID.";
  if(code.includes("invalid-verification-code"))return "Código de SMS incorrecto.";
  if(code.includes("invalid-phone-number"))return "Escribe un teléfono con clave de país, por ejemplo +525512345678.";
  if(code.includes("too-many-requests"))return "Se agotaron los intentos. Inténtalo más tarde.";
  if(code.includes("credential-already-in-use")||code.includes("email-already-in-use"))return "El contacto ya pertenece a otra cuenta. Administración debe vincularlo de forma segura; no crees un ID nuevo.";
  return String(e?.message||"Ocurrió un problema con el acceso.");
};
async function action(fn,success){
  if(state.loading)return;
  state.loading=true;document.querySelectorAll("button").forEach(x=>x.disabled=true);
  message("Validando…");
  try{await fn();if(success)message(success,"ok")}
  catch(e){console.error(e);message(err(e),"error")}
  finally{state.loading=false;document.querySelectorAll("button").forEach(x=>x.disabled=false)}
}
function resetCaptcha(){
  if(state.captcha){try{state.captcha.clear()}catch(e){console.warn("captcha",e)}state.captcha=null}
}
function login(){
  document.body.classList.add("login-mode");
  resetCaptcha();
  const request=state.page==="request";
  const inputs=state.method==="google"?
    '<button class="btn gold full" data-action="google" type="button">Continuar con Google <span aria-hidden="true">→</span></button>':
    state.method==="email"?
      '<form id="email-send"><div class="field"><label for="email">Correo electrónico</label>'+
        '<input type="email" id="email" name="email" autocomplete="email" required placeholder="tu@correo.com"></div>'+
        '<button class="btn gold full" type="submit">Enviarme un enlace <span aria-hidden="true">→</span></button></form>':
      '<form id="phone-send"><div class="field"><label for="phone">Número de celular</label>'+
        '<div class="phone-entry"><span class="phone-country" aria-label="Clave de México">+52</span>'+
        '<input type="tel" id="phone" name="phone" autocomplete="tel-national" required inputmode="tel" placeholder="Número de celular"></div></div>'+
        '<div id="recaptcha"></div><button class="btn gold full" type="submit">Ingresar <span aria-hidden="true">→</span></button></form>'+
      '<form id="phone-confirm" hidden><div class="field"><label for="sms">Código de verificación SMS</label>'+
        '<input type="text" id="sms" name="sms" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Los 6 dígitos"></div>'+
        '<button class="btn gold full" type="submit">Verificar e ingresar <span aria-hidden="true">→</span></button></form>';
  app.innerHTML='<div class="cinema-login">'+
    '<div class="cinema-backdrop" aria-hidden="true"></div>'+
    '<div class="cinema-stars" aria-hidden="true"></div>'+
    '<div class="cinema-content">'+
      '<div class="cinema-brand">'+
        '<img src="./assets/pdf-agora-wordmark.webp" alt="ÁGORA por Dejavú Marketing" width="440" height="165">'+
        '<div class="cinema-subtitle"><span aria-hidden="true"></span>IDENTIDAD ÚNICA · DEJAVÚ MARKETING<span aria-hidden="true"></span></div>'+
      '</div>'+
      '<section class="cinema-card" aria-label="Acceso ÁGORA">'+
        '<div class="cinema-inner">'+
          '<h1 class="sr-only">'+(request?"Solicitar ID Dejavú":"Iniciar sesión en ÁGORA")+'</h1>'+
          '<div class="methods" role="tablist" aria-label="Método de acceso">'+
          [["phone","Celular","▯"],["email","Correo","✉"],["google","Google","G"]].map(([m,label,ico])=>
            '<button type="button" role="tab" data-method="'+m+'" aria-selected="'+String(state.method===m)+'"><span aria-hidden="true" class="method-icon">'+ico+'</span>'+label+'</button>').join("")+
          '</div>'+
          (request?'<p class="cinema-info">Verifica tu contacto para solicitar un ID Dejavú.</p>':'')+
          inputs+
          '<div class="cinema-secondary"><button class="text-btn" type="button" data-action="'+(request?"login":"request")+'">'+
            (request?"Volver al acceso":"<span aria-hidden='true'>▤</span> Solicitar mi ID Dejavú")+
          '</button></div>'+
          '<div class="cinema-card-footer"><span>Agencia · Staff · Administrador</span>'+
            '<small>Tu acceso depende de tu acreditación y permisos.</small></div>'+
        '</div>'+
      '</section>'+
    '</div>'+
  '</div>';
}
function loading(){
  document.body.classList.remove("login-mode");
  app.innerHTML='<p class="loading">Comprobando tu ID y permisos en Firebase…</p>';
}
async function readOwnIdentity(user){
  const [accountSnap,requestSnap,linkSnap]=await Promise.all([
    getDoc(doc(db,"agora_users",user.uid)),
    getDoc(doc(db,"agora_identity_registrations",user.uid)),
    getDoc(doc(db,"agora_identity_links",user.uid))
  ]);
  const link=linkSnap.exists()?linkSnap.data():null;
  let registry=null;
  if(link?.agoraId){
    const registrySnap=await getDoc(doc(db,"agora_identity_registry",link.agoraId));
    registry=registrySnap.exists()?registrySnap.data():null;
    if(registry&&registry.uid!==user.uid)throw Error("El ID registrado no corresponde a tu usuario. Consulta a administración.");
  }
  return {
    account:accountSnap.exists()?accountSnap.data():null,
    registration:requestSnap.exists()?requestSnap.data():null,
    link,registry
  };
}
async function refresh(){
  sessionLabel.textContent=state.user?.email||state.user?.phoneNumber||"Acceso protegido";
  logoutButton.hidden=!state.user;
  if(!state.user){state.identity=null;login();message("Selecciona cómo quieres ingresar.");return}
  loading();
  try{
    state.identity=await readOwnIdentity(state.user);
    state.page="login";render();
    message("Identidad consultada. Sesión segura activa.","ok");
  }catch(e){
    state.identity=null;
    app.innerHTML='<section class="panel form-panel"><div class="eyebrow">Identidad Dejavú</div><h2>Acceso pendiente de verificación</h2>'+
      '<p>'+esc(err(e))+'</p><div class="note">No se ha generado un ID nuevo ni se ha cambiado tu expediente.</div>'+
      '<div class="actions"><button type="button" class="btn" data-action="retry">Reintentar</button></div></section>';
    message(err(e),"error");
  }
}
function invitationToRequest(){
  return "Para acreditar a una persona se envía una solicitud de ID. Solo administración la revisa y emite una credencial vinculada con su UID.";
}
function requestId(){
  resetCaptcha();
  const existing=state.identity?.registration;
  const reg=state.identity?.registry;
  const title=reg?"Credencial en revisión":existing?"Solicitud registrada":"Solicitar ID Dejavú";
  let content="";
  if(reg)content='<div class="note error">Tu cuenta ya tiene el ID '+esc(reg.agoraId)+'. Si está suspendido o pendiente, administración debe revisarlo. No solicites otro.</div>';
  else if(existing){
    content='<div class="note">Tu solicitud se registró con estado: <b>'+esc(existing.status||"pendiente")+'</b>. Se conservará esta solicitud hasta que administración la revise.</div>';
  }else{
    content='<form id="request-id">'+
      '<div class="field"><label for="name">Nombre completo</label><input id="name" name="name" maxlength="140" minlength="3" required autocomplete="name" value="'+esc(state.user?.displayName||"")+'"></div>'+
      '<div class="field"><label for="contact">Celular de contacto</label><input id="contact" name="phone" type="tel" maxlength="30" autocomplete="tel" value="'+esc(state.user?.phoneNumber||"")+'"></div>'+
      '<div class="field"><label for="job">Actividad o cargo</label><select id="job" name="job">'+JOBS.map(j=>'<option'+(j==="Staff"?" selected":"")+'>'+esc(j)+'</option>').join("")+'</select></div>'+
      '<div class="field inline-checkbox"><label><input name="privacy" type="checkbox" required> Acepto el aviso de privacidad provisional de Identidad Dejavú.</label></div>'+
      '<button type="submit" class="btn gold full">Enviar solicitud de ID</button></form>';
  }
  app.innerHTML='<section class="panel form-panel"><div class="eyebrow">Alta · Identidad Dejavú</div><h2>'+title+'</h2>'+
    '<p>'+invitationToRequest()+'</p>'+content+
    '<hr><div class="note">Si tienes una credencial bajo otro método de acceso, no vuelvas a solicitarla. Inicia sesión con tu contacto original para vincular el segundo método.</div>'+
    '<div class="actions"><a class="btn outline" href="mailto:'+ADMIN_EMAIL+'?subject='+encodeURIComponent("ÁGORA · consulta sobre mi ID")+'">Consultar por correo</a>'+
    '<button class="btn outline" data-action="retry">Actualizar estado</button></div></section>';
}
function spaces(){
  const allowed=[];
  if(canStaff())allowed.push(["staff","Staff"]);
  if(canAgency())allowed.push(["agency","Agencia"]);
  if(canAdmin())allowed.push(["admin","Administrador"]);
  return allowed;
}
function selectSpace(){
  const available=spaces().map(v=>v[0]);
  if(!available.includes(state.space))state.space=canAdmin()?"admin":canAgency()?"agency":"staff";
}
function credential(){
  const reg=state.identity.registry;
  const href=new URL("./verificar.html",location.href);
  href.searchParams.set("id",reg.credentialId);
  return '<section class="credential" aria-label="Credencial digital de Dejavú">'+
    '<div class="credential-art" aria-hidden="true"></div>'+
    '<div class="credential-top"><img class="credential-mark" src="./assets/pdf-agora-wordmark.webp" alt="ÁGORA" width="176" height="66">'+
    '<span class="credential-status">IDENTIDAD VIGENTE</span></div>'+
    '<div class="eyebrow">CREDENCIAL DIGITAL · DEJAVÚ MARKETING</div>'+
    '<h2>'+esc(reg.displayName||state.user?.displayName||"Colaborador")+'</h2>'+
    '<p class="job">'+esc(reg.jobTitle||"Colaborador")+'</p>'+
    '<div class="credential-bottom"><div><div class="id">'+esc(reg.agoraId)+'</div>'+
    '<small>'+ (reg.credentialActive?"ACTIVA · VERIFICABLE":"NO VIGENTE")+'</small>'+
    '<p><a class="credential-verify" href="'+esc(href.href)+'" target="_blank" rel="noopener">Verificar credencial <span aria-hidden="true">↗</span></a></p></div>'+
    '<div id="credential-qr" class="qr"><a href="'+esc(href.href)+'">Verificar</a></div></div></section>';
}
function drawQr(){
  const qr=document.getElementById("credential-qr");
  const reg=state.identity?.registry;
  if(!qr||!reg?.credentialId||!window.QRCode)return;
  const href=new URL("./verificar.html",location.href);
  href.searchParams.set("id",reg.credentialId);
  qr.replaceChildren();
  new window.QRCode(qr,{text:href.href,width:78,height:78,colorDark:"#171512",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M});
}
function spaceContent(){
  const name=state.space==="admin"?"Administrador":state.space==="agency"?"Agencia":"Staff";
  const asset=state.space==="agency"?"pdf-agency-icon.webp":
    state.space==="staff"?"pdf-staff-icon.webp":"pdf-agora-icon.webp";
  const copy=state.space==="admin"?
    "Tu identidad de Administrador está reconocida. Por ahora, aquí se muestra únicamente tu ID Dejavú y tu credencial digital.":
    state.space==="agency"?
    "Tu identidad Dejavú está acreditada. Este espacio inicial presenta únicamente tu ID personal y tu credencial.":
    "Bienvenido a tu espacio de Staff. Aquí puedes consultar únicamente tu ID Dejavú y la vigencia de tu credencial.";
  const otherOptions=[];
  if(state.user?.email)otherOptions.push("Correo: "+state.user.email);
  if(state.user?.phoneNumber)otherOptions.push("Celular: "+state.user.phoneNumber);
  return '<section class="space-card"><div class="space-card-head">'+
    '<img src="./assets/'+asset+'" alt="" class="space-card-icon" loading="lazy">'+
    '<div><div class="eyebrow">ESPACIO / IDENTIDAD</div>'+
    '<h2>'+esc(name)+'</h2></div></div>'+
    '<p>'+esc(copy)+'</p>'+
    '<div class="meta"><div><small>ID DEJAVÚ</small><b>'+esc(state.identity.registry.agoraId)+'</b></div>'+
    '<div><small>ESTADO</small><b>Vigente</b></div></div>'+
    '<div class="note success">La información de este espacio está asociada a tu credencial. Todavía no incluye actividades, pagos ni otros módulos.</div>'+
    '<hr><p class="help">'+esc(otherOptions.join(" · "))+'</p>'+
    '<div class="actions">'+(state.user?.phoneNumber?"":'<button type="button" class="btn outline small" data-action="link-phone">Vincular celular</button>')+
    (state.user?.email?"":'<button type="button" class="btn outline small" data-action="link-email">Vincular correo</button>')+'</div></section>';
}
function dashboard(){
  resetCaptcha();selectSpace();
  const name=state.identity?.registry?.displayName||state.user?.displayName||"tu espacio";
  app.innerHTML='<div class="workspace-header"><div><div class="eyebrow">TU IDENTIDAD · DEJAVÚ MARKETING</div>'+
    '<h1>Hola, '+esc(name)+'.</h1>'+
    '<p>Tu credencial está activa. Este es tu espacio personal dentro de ÁGORA.</p></div>'+
    '<span class="id-pill">'+esc(state.identity.registry.agoraId)+'</span></div>'+
    '<nav class="space-nav" aria-label="Cambiar espacio">'+spaces().map(([id,label])=>
      '<button type="button" data-space="'+id+'" aria-pressed="'+String(state.space===id)+'">'+label+'</button>').join("")+'</nav>'+
    '<div class="workspace">'+credential()+spaceContent()+'</div>';
  drawQr();
}
function contactLink(){
  resetCaptcha();
  const phone=state.page==="link-phone";
  app.innerHTML='<section class="panel form-panel"><div class="eyebrow">Mismo ID · Nuevo método de acceso</div>'+
    '<h2>'+(phone?"Vincular celular":"Vincular correo")+'</h2>'+
    '<p>Esta verificación añadirá otro contacto al mismo UID de Firebase y conservará tu ID Dejavú.</p>'+
    (phone?
      '<form id="phone-send"><div class="field"><label for="phone">Número celular (+52...)</label><input name="phone" id="phone" autocomplete="tel" type="tel" required></div><div id="recaptcha"></div>'+
      '<button class="btn gold" type="submit">Enviar código SMS</button></form>'+
      '<form id="phone-confirm" hidden><div class="field"><label for="sms">Código SMS</label><input id="sms" name="sms" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" required></div>'+
      '<button class="btn gold" type="submit">Vincular número verificado</button></form>':
      '<form id="email-send"><div class="field"><label for="email">Correo a vincular</label><input id="email" name="email" type="email" required></div><button class="btn gold" type="submit">Enviar enlace de verificación</button></form>')+
    '<div class="actions"><button type="button" class="btn outline" data-action="dashboard">Volver a mi ID</button></div></section>';
}
function emailPrompt(){
  resetCaptcha();
  app.innerHTML='<section class="panel form-panel"><div class="eyebrow">Verificación de correo</div><h2>Confirma tu correo</h2>'+
    '<p>Escribe la misma dirección a la que enviamos el enlace de verificación.</p>'+
    '<form id="email-confirm"><div class="field"><label for="email-finish">Correo</label><input id="email-finish" type="email" name="email" required autocomplete="email"></div>'+
    '<button type="submit" class="btn gold full">Terminar verificación</button></form></section>';
}
function render(){
  document.body.classList.toggle("login-mode",!state.user);
  if(state.page==="email-prompt"){emailPrompt();return}
  if(!state.user){login();return}
  if(!state.identity){loading();return}
  if(["link-phone","link-email"].includes(state.page)){contactLink();return}
  if(state.page==="id-request"||!verifiedId()){requestId();return}
  dashboard();
}
async function register(d){
  if(state.identity?.link||state.identity?.registration)throw Error("Ya existe una solicitud o un ID vinculado. No puedes crear otra solicitud.");
  const name=value(d.get("name")).replace(/\s+/g," ").slice(0,140);
  const phone=value(d.get("phone")).slice(0,30);
  const job=value(d.get("job"));
  if(name.length<3||!JOBS.includes(job)||d.get("privacy")!=="on")throw Error("Revisa nombre, actividad y aceptación del aviso de privacidad.");
  const ref=doc(db,"agora_identity_registrations",state.user.uid);
  const prior=await getDoc(ref);
  if(prior.exists())throw Error("Ya existe una solicitud. Administración debe revisarla.");
  await setDoc(ref,{
    uid:state.user.uid,email:value(state.user.email).toLowerCase(),displayName:name,
    telephone:phone,requestedJobTitle:job,status:"pending",
    privacyAccepted:true,privacyVersion:"provisional-2026-11-18",
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  await refresh();
}
async function google(){
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  try{await signInWithPopup(auth,provider)}
  catch(e){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e?.code))
      await signInWithRedirect(auth,provider);
    else throw e;
  }
}
async function sendEmail(raw){
  const email=value(raw).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("Escribe un correo válido.");
  const linking=state.page==="link-email"&&!!state.user;
  sessionStorage.setItem("agoraEmail",email);
  sessionStorage.setItem("agoraEmailIntent",linking?"link":"login");
  if(linking)sessionStorage.setItem("agoraEmailUid",state.user.uid);
  await sendSignInLinkToEmail(auth,email,{url:new URL("./",location.href).href,handleCodeInApp:true});
  const form=document.getElementById("email-send");
  if(form)form.innerHTML='<div class="note success">Enlace enviado. Abre el mensaje desde tu correo y termina la verificación.</div>';
}
async function phoneSend(raw){
  const input=safePhone(raw);
  const phone=input.startsWith("+")?input:"+52"+input;
  if(!/^\+[1-9]\d{9,14}$/.test(phone))throw Error("Escribe tu número con clave internacional, por ejemplo +525512345678.");
  if(!state.captcha)state.captcha=new RecaptchaVerifier(auth,"recaptcha",{size:"normal"});
  await state.captcha.render();
  if(state.page==="link-phone"&&state.user){
    const provider=new PhoneAuthProvider(auth);
    const verificationId=await provider.verifyPhoneNumber(phone,state.captcha);
    state.sms={kind:"link",verificationId};
  }else{
    const confirmation=await signInWithPhoneNumber(auth,phone,state.captcha);
    state.sms={kind:"login",confirmation};
  }
  document.getElementById("phone-send").hidden=true;
  document.getElementById("phone-confirm").hidden=false;
  message("Código enviado al celular. Revisa tu SMS.","ok");
}
async function phoneConfirm(code){
  const six=value(code);
  if(!/^\d{6}$/.test(six)||!state.sms)throw Error("Introduce los seis números del SMS.");
  const flow=state.sms;
  if(flow.kind==="link"){
    if(!state.user)throw Error("La sesión original terminó. Ingresa de nuevo para vincular tu teléfono.");
    await linkWithCredential(state.user,PhoneAuthProvider.credential(flow.verificationId,six));
  }else{
    await flow.confirmation.confirm(six);
  }
  state.sms=null;resetCaptcha();state.page="login";
  state.user=auth.currentUser;
  await refresh();
}
async function finishEmail(email){
  if(state.finishingEmail)return;
  state.finishingEmail=true;
  try{
    const intent=sessionStorage.getItem("agoraEmailIntent");
    const uid=sessionStorage.getItem("agoraEmailUid");
    if(intent==="link"){
      if(!auth.currentUser||auth.currentUser.uid!==uid)throw Error("Vuelve al navegador y sesión originales para vincular este correo sin cambiar tu ID.");
      await linkWithCredential(auth.currentUser,EmailAuthProvider.credentialWithLink(email,location.href));
    }else{
      await signInWithEmailLink(auth,email,location.href);
    }
    sessionStorage.removeItem("agoraEmail");
    sessionStorage.removeItem("agoraEmailIntent");
    sessionStorage.removeItem("agoraEmailUid");
    history.replaceState({},document.title,location.pathname);
    state.page="login";state.user=auth.currentUser;
    await refresh();
  }finally{state.finishingEmail=false}
}
async function emailLinkStartup(){
  if(!isSignInWithEmailLink(auth,location.href))return false;
  const email=sessionStorage.getItem("agoraEmail");
  if(!email){state.page="email-prompt";render();message("Confirma el correo que recibió el enlace.");return true}
  try{await finishEmail(email)}
  catch(e){console.error(e);state.page="email-prompt";render();message(err(e),"error")}
  return true;
}
app.addEventListener("click",event=>{
  const tab=event.target.closest("[data-method]");
  if(tab){state.method=tab.dataset.method;state.sms=null;render();return}
  const space=event.target.closest("[data-space]");
  if(space){
    const next=space.dataset.space;if(!spaces().some(([k])=>k===next))return;
    state.space=next;render();return;
  }
  const btn=event.target.closest("[data-action]");if(!btn)return;
  const task=btn.dataset.action;
  if(task==="google")return action(google,"Autenticación de Google solicitada.");
  if(task==="retry")return action(refresh);
  if(task==="request"||task==="login"){state.page=task;render();return}
  if(task==="link-phone"||task==="link-email"){state.page=task;render();return}
  if(task==="dashboard"){state.page="login";render();return}
});
app.addEventListener("submit",event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement))return;
  event.preventDefault();const data=new FormData(form);
  if(form.id==="request-id")return action(()=>register(data),"Solicitud de ID registrada.");
  if(form.id==="phone-send")return action(()=>phoneSend(data.get("phone")));
  if(form.id==="phone-confirm")return action(()=>phoneConfirm(data.get("sms")));
  if(form.id==="email-send")return action(()=>sendEmail(data.get("email")));
  if(form.id==="email-confirm")return action(()=>finishEmail(value(data.get("email"))));
});
logoutButton.addEventListener("click",()=>action(async()=>{
  resetCaptcha();state.identity=null;state.user=null;state.page="login";state.space="";
  await signOut(auth);
},"Sesión cerrada."));
onAuthStateChanged(auth,async user=>{
  if(state.finishingEmail)return;
  state.user=user;
  if(await emailLinkStartup())return;
  await refresh();
});
