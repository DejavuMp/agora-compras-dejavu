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
const state={user:null,identity:null,method:"id",page:"login",space:"",sms:null,captcha:null,loading:false,finishingEmail:false};
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
const SITE_URLS={
 operaciones:"https://dejavump.github.io/agora-operaciones-dejavu/operaciones/",
 visor:"https://dejavump.github.io/agora-operaciones-dejavu/operaciones/visor.html",
 compras:"https://dejavump.github.io/agora-compras-dejavu/",
 archivos:"https://dejavump.github.io/agora-compras-dejavu/archivos/",
 recursos:"https://dejavump.github.io/agora-compras-dejavu/recursos/",
 fichas:"https://dejavump.github.io/agora-compras-dejavu/fichas/",
 identidad:"https://dejavump.github.io/agora-compras-dejavu/identidad/"
};

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
  app.innerHTML='<div class="cinema-login">'+
    '<div class="cinema-backdrop" aria-hidden="true"></div>'+
    '<div class="cinema-stars" aria-hidden="true"></div>'+
    '<div class="cinema-content">'+
      '<div class="cinema-brand">'+
        '<img src="./assets/agora-wordmark-transparent.webp" alt="ÁGORA por Dejavú Marketing" width="886" height="330">'+
        '<div class="cinema-subtitle"><span aria-hidden="true"></span>IDENTIDAD ÚNICA · DEJAVÚ MARKETING<span aria-hidden="true"></span></div>'+
      '</div>'+
      '<section class="cinema-card" aria-label="Acceso ÁGORA">'+
        '<div class="cinema-inner">'+
          '<h1 class="sr-only">'+(request?"Solicitar ID Dejavú":"Iniciar sesión en ÁGORA")+'</h1>'+
          (request?'<p class="cinema-info">Para solicitar tu ID, ingresa primero con Google. Tu solicitud quedará asociada a esa misma cuenta.</p>':
            '<form id="id-login" aria-describedby="id-login-note">'+
              '<div class="field"><label for="staff-id">Usuario · ID Dejavú</label>'+
                '<div class="id-entry"><span class="id-prefix" aria-hidden="true">DJV-</span>'+
                  '<input id="staff-id" name="id" type="text" inputmode="text" autocapitalize="characters" autocomplete="username" spellcheck="false" placeholder="2026-001" pattern="[0-9]{4}-[0-9]{3,6}" aria-label="ID Dejavú, después de DJV-" required></div></div>'+
              '<div class="field"><label for="staff-password">Contraseña</label>'+
                '<input id="staff-password" name="password" type="password" autocomplete="current-password" placeholder="Tu contraseña de ÁGORA" required></div>'+
              '<button class="btn gold full" type="submit" disabled aria-disabled="true" title="Pendiente de activación segura en el servidor">Ingresar con ID <span aria-hidden="true">→</span></button>'+
            '</form>'+
            '<p id="id-login-note" class="login-pending" role="status">El ingreso con ID y contraseña está pendiente de habilitarse de forma segura. Por ahora, entra con Google para conservar tu cuenta actual.</p>')+
          '<div class="login-separator"><span>o continúa con</span></div>'+
          '<button type="button" class="btn google-login full" data-action="google"><span aria-hidden="true" class="google-g">G</span> Continuar con Google <span aria-hidden="true">→</span></button>'+
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
function credentialVerificationLink(){
  const token=state.identity?.registry?.credentialId||"";
  if(!/^[0-9a-f]{32}$/i.test(token))return "";
  const url=new URL("./verificar.html",location.href);
  url.searchParams.set("id",token);
  return url.href;
}
function credential(){
  const reg=state.identity.registry,link=credentialVerificationLink();
  return '<section class="credential live-credential" aria-label="Credencial digital verificable">'+
    '<div class="credential-top"><img class="credential-mark" src="./assets/logo-agora-hq.webp" alt="ÁGORA Dejavú Marketing">'+
    '<span class="credential-status">ID VIGENTE</span></div>'+
    '<div class="eyebrow">IDENTIDAD DIGITAL · REGISTRO FIREBASE</div>'+
    '<h2>'+esc(reg.displayName||"Colaborador")+'</h2>'+
    '<p class="job">'+esc(reg.jobTitle||"Colaborador")+'</p>'+
    '<div class="credential-bottom"><div><div class="id">'+esc(reg.agoraId)+'</div>'+
    '<small>QR INDIVIDUAL · CONSULTA DE VIGENCIA</small></div>'+
    (link?'<div id="credential-qr" class="qr"><a href="'+esc(link)+'" target="_blank" rel="noopener">Verificar QR</a></div>':
    '<p class="note error">Credencial sin token de verificación válido</p>')+
    '</div><div class="credential-actions"><button class="btn gold" type="button" data-action="open-credential">Abrir credencial digital</button>'+
    (link?'<a class="btn outline" href="'+esc(link)+'" target="_blank" rel="noopener">Comprobar vigencia</a>':"")+
    '</div></section>';
}
function credentialDialog(){
  const reg=state.identity?.registry,link=credentialVerificationLink();
  if(!reg)return "";
  return '<dialog id="credential-dialog" class="digital-dialog" aria-label="Mi credencial digital">'+
    '<div class="digital-dialog-top"><b>ÁGORA · Credencial digital</b>'+
    '<button type="button" data-action="close-credential" aria-label="Cerrar credencial">×</button></div>'+
    '<div class="digital-face"><img src="./assets/logo-agora-hq.webp" alt="ÁGORA" class="digital-logo">'+
    '<h2>'+esc(reg.displayName||"Colaborador")+'</h2><p>'+esc(reg.jobTitle||"Colaborador")+'</p>'+
    '<b class="digital-id">'+esc(reg.agoraId)+'</b>'+
    (link?'<div class="digital-qr" id="credential-qr-modal"><a href="'+esc(link)+'" target="_blank" rel="noopener">Abrir verificación</a></div>':"")+
    '<span class="digital-state">VIGENTE · CONSULTA EN LÍNEA</span></div>'+
    '<p class="digital-hint">El QR muestra únicamente los datos públicos de acreditación y su vigencia.</p>'+
    '<div class="actions">'+(link?'<button class="btn gold" type="button" data-action="share-credential">Compartir verificación</button>':"")+
    '<button class="btn outline" type="button" data-action="close-credential">Cerrar</button></div></dialog>';
}
function drawQr(){
  const link=credentialVerificationLink();
  if(!link||!window.QRCode)return;
  for(const id of ["credential-qr","credential-qr-modal"]){
    const qr=document.getElementById(id);
    if(!qr)continue;
    qr.replaceChildren();
    const size=id==="credential-qr"?84:154;
    new window.QRCode(qr,{text:link,width:size,height:size,colorDark:"#16120e",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M});
  }
}

function siteTile(title,summary,href,symbol){
  return '<a class="site-tile" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+
    '<span class="site-symbol" aria-hidden="true">'+esc(symbol)+'</span>'+
    '<span class="site-copy"><b>'+esc(title)+'</b><small>'+esc(summary)+'</small></span>'+
    '<span class="site-arrow" aria-hidden="true">↗</span></a>';
}
function sites(){
  if(!verifiedId())return "";
  let entries=[];
  if(state.space==="staff"){
    entries=[
      ["Mis jornadas / Visor","Actividades y seguimiento personal",SITE_URLS.visor,"◷"],
      ["Mi expediente","Identidad y credencial Dejavú",SITE_URLS.identidad,"ID"]
    ];
  }else{
    entries=[
      ["Operaciones Agencia","Eventos, coordinación y personal",SITE_URLS.operaciones,"◷"],
      ["Compras y producción","Pedidos y órdenes",SITE_URLS.compras,"▤"],
      ["Archivos","Evidencias, entregas y revisión",SITE_URLS.archivos,"▣"],
      ["Fichas de evento","Formatos y datos del evento",SITE_URLS.fichas,"◈"],
      ["Identidad y RH","Acreditaciones y credenciales",SITE_URLS.identidad,"ID"]
    ];
    if(state.space==="admin"||userRole()==="coordinador"){
      entries.splice(3,0,["Recursos y pagos","Solicitudes y autorizaciones",SITE_URLS.recursos,"$"]);
    }
  }
  return '<section class="sites-panel"><div class="eyebrow">ACCESOS EXISTENTES · ÁGORA</div>'+
    '<h2>Mis herramientas</h2>'+
    '<p>Abre cada sitio con tu cuenta acreditada. Sus permisos se verifican en la aplicación de destino.</p>'+
    '<div class="sites-grid">'+entries.map(x=>siteTile(...x)).join("")+'</div></section>';
}
function quickAccess(){
  if(!verifiedId())return "";
  const staff=state.space==="staff";
  const all=staff?[
    ["Mis jornadas",SITE_URLS.visor],
    ["Mi expediente",SITE_URLS.identidad]
  ]:[
    ["Operaciones",SITE_URLS.operaciones],
    ["Compras",SITE_URLS.compras],
    ["Archivos",SITE_URLS.archivos],
    ["Fichas",SITE_URLS.fichas],
    ["Identidad",SITE_URLS.identidad]
  ];
  if(!staff&&(state.space==="admin"||userRole()==="coordinador"))
    all.splice(3,0,["Recursos",SITE_URLS.recursos]);
  return '<nav class="quick-access" aria-label="Accesos rápidos a ÁGORA">'+
    '<span>ACCESOS RÁPIDOS</span>'+
    all.map(([name,url])=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+
      esc(name)+' <span aria-hidden="true">↗</span></a>').join("")+'</nav>';
}

function adminRoleNotice(){
  if(!mainAdmin(state.user)||canAdmin())return "";
  const uid=state.user?.uid||"";
  return '<section class="admin-pending" role="status">'+
    '<div class="eyebrow">ACCESO DE ADMINISTRACIÓN PENDIENTE</div>'+
    '<h2>Tu correo está reconocido, pero aún no está acreditado el rol Administrador.</h2>'+
    '<p>ÁGORA no concede privilegios únicamente por la dirección de correo. En Firebase, verifica el documento '+
    '<code>agora_users/'+esc(uid)+'</code> con <code>active: true</code> y <code>role: "admin"</code>. '+
    'El rol actual es <b>'+esc(userRole()||"sin rol activo")+'</b>. No cambies tu UID ni tu ID Dejavú.</p>'+
    '<button type="button" class="btn outline" data-action="copy-uid">Copiar UID para revisión</button></section>';
}
function spaceContent(){
  const name=state.space==="admin"?"Administrador":state.space==="agency"?"Agencia":"Staff";
  const asset=state.space==="agency"?"icono-agencia-hq.webp":
    state.space==="staff"?"icono-staff-hq.webp":"icono-administrador-hq.webp";
  const msg=state.space==="admin"?"Identidad administrativa acreditada. Las herramientas estarán disponibles según tus permisos.":
    state.space==="agency"?"Tu identidad de Agencia está acreditada. Consulta las herramientas existentes.":
    "Tu credencial es personal y única. Desde aquí puedes ver tu ID y acceder a tus herramientas.";
  return '<section class="space-card">'+
    '<div class="space-card-head"><img src="./assets/'+asset+'" alt="" class="space-card-icon" width="106" height="106">'+
    '<div><div class="eyebrow">ESPACIO / IDENTIDAD</div><h2>'+esc(name)+'</h2></div></div>'+
    '<p>'+esc(msg)+'</p>'+
    '<div class="meta"><div><small>ID DEJAVÚ</small><b>'+esc(state.identity.registry.agoraId)+'</b></div>'+
    '<div><small>ESTADO</small><b>Vigente</b></div></div>'+
    '<div class="note success">Credencial vinculada con Firebase. No es una imagen de demostración.</div>'+
    '</section>';
}
function dashboard(){
  resetCaptcha();selectSpace();
  const name=state.identity?.registry?.displayName||state.user?.displayName||"Colaborador";
  app.innerHTML='<div class="workspace-header"><div><div class="eyebrow">IDENTIDAD ÚNICA · DEJAVÚ MARKETING</div>'+
    '<h1>Bienvenido a ÁGORA</h1>'+
    '<p>'+esc(name)+' · Credencial digital activa</p></div>'+
    '<span class="id-pill">'+esc(state.identity.registry.agoraId)+'</span></div>'+
    '<nav class="space-nav" aria-label="Cambiar espacio">'+spaces().map(([id,label])=>
      '<button type="button" data-space="'+id+'" aria-pressed="'+String(state.space===id)+'">'+label+'</button>').join("")+'</nav>'+
    adminRoleNotice()+quickAccess()+
    '<div class="workspace">'+credential()+spaceContent()+'</div>'+
    sites()+credentialDialog();
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
  if(task==="open-credential"){
    const dialog=document.getElementById("credential-dialog");
    if(!dialog)return;
    if(typeof dialog.showModal==="function")dialog.showModal();
    else dialog.setAttribute("open","");
    drawQr();return;
  }
  if(task==="close-credential"){
    const dialog=document.getElementById("credential-dialog");
    if(dialog?.close)dialog.close();else dialog?.removeAttribute("open");
    return;
  }
  if(task==="copy-uid"){
    if(!state.user?.uid)return;
    return action(async()=>{await navigator.clipboard.writeText(state.user.uid)},
      "UID copiado. Puedes consultarlo en Firebase.");
  }
  if(task==="share-credential"){
    const url=credentialVerificationLink();
    if(!url)return message("La credencial no dispone de un token válido.","error");
    return action(async()=>{
      const data={title:"ÁGORA · Verificación de credencial",url};
      if(navigator.share){try{await navigator.share(data);return}catch(e){if(e.name==="AbortError")return}}
      await navigator.clipboard.writeText(url);
    },"Enlace individual de verificación listo para compartir.");
  }
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
