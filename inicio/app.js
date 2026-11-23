import {JOB_NAMES,projectTodayAssignments} from "../identidad/domain.mjs";
import {
  auth,login,logout,watchSession,loadOwnIdentity,requestRegistration
} from "../identidad/firebase-identity.js";
import {
  EmailAuthProvider,PhoneAuthProvider,RecaptchaVerifier,signInWithPhoneNumber,
  sendSignInLinkToEmail,isSignInWithEmailLink,signInWithEmailLink,
  linkWithCredential
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

const APP=document.getElementById("app");
const STATUS=document.getElementById("status");
const SESSION_NAME=document.getElementById("session-name");
const SIGNOUT=document.getElementById("signout");
const ROOT=new URL("../",import.meta.url);
const MAIN_ADMIN="admi.agora@gmail.com";
const links={
  identidad:new URL("identidad/",ROOT).href,
  compras:ROOT.href,
  archivos:new URL("archivos/",ROOT).href,
  recursos:new URL("recursos/",ROOT).href,
  fichas:new URL("fichas/",ROOT).href,
  operaciones:"https://dejavump.github.io/agora-operaciones-dejavu/operaciones/",
  jornadas:"https://dejavump.github.io/agora-operaciones-dejavu/operaciones/jornadas.html"
};
let user=null,workspace=null,method="phone",page="login",space="",busy=false;
let smsFlow=null,recaptcha=null,emailLinkBusy=false,preferredSpace="";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const text=x=>String(x??"").trim();
const ownId=()=>workspace?.registry?.agoraId||"";
const activeId=()=>workspace?.registry?.rhStatus==="verified"&&workspace?.registry?.credentialActive===true&&workspace?.link?.active===true;
const agencyAccount=()=>workspace?.account?.active===true&&["admin","coordinador","consulta"].includes(workspace.account.role);
const adminAccount=()=>workspace?.account?.active===true&&workspace?.account?.role==="admin";
const message=(m,tone="")=>{STATUS.textContent=m;if(tone)STATUS.dataset.tone=tone;else delete STATUS.dataset.tone};
const errorMessage=e=>{
  const code=String(e?.code||"");
  if(code.includes("operation-not-allowed"))return "Este método de ingreso debe habilitarse primero en Firebase Authentication.";
  if(code.includes("unauthorized-domain"))return "El dominio del portal debe autorizarse en Firebase Authentication.";
  if(code.includes("invalid-phone-number"))return "Introduce un celular válido con clave internacional, por ejemplo +52…";
  if(code.includes("invalid-verification-code"))return "El código no es correcto. Revisa el SMS.";
  if(code.includes("too-many-requests"))return "Demasiados intentos. Inténtalo más tarde.";
  if(code.includes("credential-already-in-use")||code.includes("email-already-in-use"))return "Ese contacto ya está asociado a otra cuenta. Pide a administración que revise el vínculo; no solicites un ID nuevo.";
  if(code.includes("permission-denied"))return "Firestore no autorizó la lectura. Se requieren reglas de identidad para acceso mediante celular y los permisos de tu cuenta.";
  if(code.includes("network"))return "No hay conexión. Revisa internet e inténtalo nuevamente.";
  return String(e?.message||"Ocurrió un problema al conectar con ÁGORA.");
};
const withBusy=async (fn,done)=>{
  if(busy)return;
  busy=true;APP.querySelectorAll("button").forEach(b=>b.disabled=true);message("Validando de forma segura…");
  try{await fn();if(done)message(done,"ok")}
  catch(e){console.error(e);message(errorMessage(e),"error")}
  finally{busy=false;APP.querySelectorAll("button").forEach(b=>b.disabled=false)}
};
function clearCaptcha(){
  if(recaptcha){try{recaptcha.clear()}catch(e){console.warn("captcha",e)}recaptcha=null}
}
function titleBlock(label,title,summary){
  return '<div class="workspace-header"><div><div class="eyebrow">'+esc(label)+'</div><h1>'+esc(title)+'</h1><p>'+esc(summary)+'</p></div>'+
    (ownId()?'<span class="pill">'+esc(ownId())+'</span>':"")+'</div>';
}
function tile(label,title,summary,url,extra=""){
  return '<article class="tile '+extra+'"><div class="number">'+esc(label)+'</div><h2>'+esc(title)+'</h2><p>'+esc(summary)+'</p><a href="'+esc(url)+'" rel="noopener">Abrir herramienta</a></article>';
}
function topSpaces(){
  let allowed=[];
  if(activeId())allowed.push(["staff","Staff"]);
  if(activeId()&&agencyAccount())allowed.push(["agency","Agencia"]);
  if(adminAccount())allowed.push(["admin","Administrador"]);
  return '<nav class="space-selector" aria-label="Espacios de ÁGORA">'+allowed.map(([key,label])=>
    '<button type="button" data-space="'+key+'" aria-pressed="'+String(space===key)+'">'+label+'</button>').join("")+'</nav>';
}
function securityNote(){
  const hasPhone=!!user?.phoneNumber;
  const hasEmail=!!user?.email;
  let buttons=[];
  if(!hasPhone)buttons.push('<button class="btn outline" type="button" data-action="link-phone">Vincular mi celular</button>');
  if(!hasEmail)buttons.push('<button class="btn outline" type="button" data-action="link-email">Vincular mi correo</button>');
  return '<article class="tile wide"><div class="number">SEGURIDAD DE LA CUENTA</div><h2>Mis métodos de acceso</h2>'+
   '<p>'+(hasPhone?"Celular verificado: "+esc(user.phoneNumber)+". ":"Celular pendiente de vincular. ")+
   (hasEmail?"Correo: "+esc(user.email)+".":"Correo pendiente de vincular.")+
   ' Vincula tus contactos desde esta sesión para conservar el mismo ID y el mismo UID.</p>'+
   '<div class="actions">'+buttons.join("")+'</div></article>';
}
function credentialCard(){
  const record=workspace?.registry;
  if(!record)return '<article class="tile"><h2>Mi credencial</h2><p>Aún no tienes credencial emitida.</p><a href="'+esc(links.identidad)+'">Abrir Identidad</a></article>';
  const verify=new URL("identidad/verificar.html",ROOT);verify.searchParams.set("id",record.credentialId||"");
  return '<article class="identity-card" aria-label="Credencial digital">'+
    '<div class="eyebrow" style="color:#d8bd84">DEJAVÚ MARKETING · ÁGORA</div>'+
    '<h2>'+esc(record.displayName||user.displayName||"Colaborador")+'</h2>'+
    '<p>'+esc(record.jobTitle||"Colaborador")+'</p><div class="credential-bottom"><div><div class="id">'+esc(record.agoraId)+'</div>'+
    '<p style="font-size:.8rem">'+(record.credentialActive?"Credencial vigente":"Credencial no vigente")+'</p>'+
    '<a style="color:#efdaac" href="'+esc(links.identidad)+'">Ver mi expediente y credencial</a></div>'+
    '<div class="qr" id="credential-qr"><a href="'+esc(verify.href)+'">Verificar</a></div></div></article>';
}
function drawQr(){
  const record=workspace?.registry;const box=document.getElementById("credential-qr");
  if(!record?.credentialId||!box||!window.QRCode)return;
  const verify=new URL("identidad/verificar.html",ROOT);
  verify.searchParams.set("id",record.credentialId);
  box.replaceChildren();
  new window.QRCode(box,{text:verify.href,width:76,height:76,colorDark:"#15130f",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M});
}
function staffScreen(){
  const assignments=projectTodayAssignments(workspace?.operations||null);
  let agenda=assignments.length?assignments.map(item=>'<div class="shift"><div class="number">'+
    esc(new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(item.start))+' – '+
    esc(new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(item.end))+
    '</div><h3>'+esc(item.project||"Actividad")+'</h3><p>'+esc(item.site||"Sede por confirmar")+'</p>'+
    '<p>'+esc(item.activity||"")+'</p><small>Asignó: '+esc(item.responsible||"Por confirmar")+'</small></div>').join(""):
    '<p class="status-line">No aparecen actividades para hoy en tu ficha sincronizada. Consulta Mis jornadas o solicita a coordinación revisar tu vinculación.</p>';
  return '<div class="dashboard-grid">'+credentialCard()+
    '<article class="tile featured"><div class="number">MIS ACTIVIDADES</div><h2>Mi día</h2>'+agenda+
    '<div class="actions"><a class="btn primary" href="'+esc(links.jornadas)+'">Abrir Mis jornadas</a></div></article>'+
    tile("01","Mis jornadas","Actividades, asistencia y comprobantes de mi trabajo.",links.jornadas)+
    tile("02","Mis pagos","Seguimiento de importes y estados dentro de Operaciones; nunca se muestran pagos de otras personas.",links.jornadas)+
    tile("03","Mi expediente","Datos personales, credencial y verificación del QR.",links.identidad)+
    securityNote()+'</div>';
}
function agencyScreen(){
  return '<div class="dashboard-grid">'+
    tile("01","Centro de operaciones","Eventos, calendario, personal, vehículos y asignaciones.",links.operaciones,"featured")+
    tile("02","Compras y producción","Pedidos, proveedores, cotizaciones y seguimiento.",links.compras)+
    tile("03","Archivos","Entregas, versiones, evidencias, recepción y comentarios.",links.archivos)+
    tile("04","Recursos y pagos","Solicitudes, autorizaciones y seguimiento financiero.",links.recursos)+
    tile("05","Fichas de evento","Formatos, información de eventos y herramientas del equipo.",links.fichas)+
    tile("06","Identidad y RH","Mi credencial y expediente; directorio según mis permisos.",links.identidad)+
    securityNote()+'</div>';
}
function adminScreen(){
  const principal=user?.email?.toLowerCase()===MAIN_ADMIN&&user?.emailVerified===true;
  return '<div class="dashboard-grid">'+
    '<article class="tile wide"><div class="number">CUENTA ADMINISTRADORA</div><h2>'+
    (principal?"Administrador principal verificado":"Administración ÁGORA")+
    '</h2><p>Los permisos provienen de agora_users en Firebase, no de este encabezado. Las personas y los expedientes históricos permanecen en las colecciones existentes.</p>'+
    (!activeId()?'<div class="notice">Esta cuenta tiene rol administrador, pero aún no tiene ID aprobado. Puedes administrar RH y solicitar tu credencial sin crear otra cuenta.</div>':"")+'</article>'+
    tile("01","Identidades y credenciales","Revisar solicitudes de ID, emitir credenciales, bloquear y consultar auditoría.",links.identidad,"featured")+
    tile("02","Agencia y operación","Acceder al centro operativo, su agenda y la asignación de personal.",links.operaciones)+
    tile("03","Compras y producción","Revisión operativa de órdenes, proveedores y solicitudes.",links.compras)+
    tile("04","Recursos y pagos","Supervisión de fondos y movimientos autorizados.",links.recursos)+
    tile("05","Archivos y entregas","Control de versiones, evidencias y confirmaciones.",links.archivos)+
    tile("06","Fichas de evento","Plantillas, registros y documentos del equipo.",links.fichas)+
    (!activeId()?'<article class="tile wide"><button type="button" class="btn outline" data-action="registration">Solicitar mi propio ID</button></article>':securityNote())+'</div>';
}
function renderDashboard(){
  clearCaptcha();
  const allowed=space==="admin"?adminAccount():space==="agency"?activeId()&&agencyAccount():activeId();
  if(!allowed){space=adminAccount()?"admin":activeId()&&agencyAccount()?"agency":"staff";}
  const name=workspace?.registry?.displayName||workspace?.account?.name||user?.displayName||"tu espacio";
  APP.innerHTML=titleBlock("Portal interno · Identidad validada","Bienvenido a "+name,
    "Accede únicamente a las herramientas vinculadas con tu perfil.")+
    topSpaces()+
    (space==="admin"?adminScreen():space==="agency"?agencyScreen():staffScreen());
  drawQr();
}
function renderRegistration(){
  clearCaptcha();
  const existing=workspace?.registration;
  const registered=!!workspace?.registry;
  const title=registered?"Tu identidad requiere revisión":existing?"Solicitud de ID registrada":"Solicita tu ID Dejavú";
  const status=registered?(workspace.registry.credentialActive?"Acreditación en revisión":"Credencial suspendida"):
    existing?"Estado: "+(existing.status==="pending"?"pendiente de validación":existing.status):"Sin ID asignado todavía";
  let content='<div class="notice">'+esc(status)+'. Solo administración puede validar y emitir la credencial. No solicites otra identidad si ya tienes un ID.</div>';
  if(!existing&&!registered){
    const currentPhone=user?.phoneNumber||"";
    content+='<form id="registration-form">'+
      '<div class="field"><label for="reg-name">Nombre completo</label><input id="reg-name" name="name" required minlength="3" maxlength="140" autocomplete="name" value="'+esc(user?.displayName||"")+'"></div>'+
      '<div class="field"><label for="reg-phone">Celular de contacto</label><input id="reg-phone" name="phone" type="tel" maxlength="30" autocomplete="tel" value="'+esc(currentPhone)+'"></div>'+
      '<div class="field"><label for="reg-role">Actividad principal</label><select id="reg-role" name="role">'+JOB_NAMES.map(x=>'<option '+(x==="Staff"?"selected":"")+'>'+esc(x)+'</option>').join("")+'</select></div>'+
      '<div class="field"><label><input type="checkbox" name="privacy" required> Acepto el aviso de privacidad provisional y la revisión de mi solicitud.</label></div>'+
      '<button class="btn primary full" type="submit">Enviar solicitud a administración</button></form>';
  }
  const shareText='Hola, solicito apoyo con mi credencial de ÁGORA Dejavú. '+(ownId()?'Mi ID es '+ownId()+'. ':"")+'Ingresé con mi cuenta verificada y deseo consultar el estado de mi solicitud.';
  content+='<div class="divider"></div><div class="actions">'+
    '<a class="btn outline" href="mailto:'+MAIN_ADMIN+'?subject='+encodeURIComponent("ÁGORA · solicitud de ID")+'&body='+encodeURIComponent(shareText)+'">Preparar correo</a>'+
    '<a class="btn outline" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(shareText)+'">Compartir por WhatsApp</a>'+
    '<a class="btn outline" href="'+esc(links.identidad)+'">Abrir Identidad</a>'+
    (adminAccount()?'<button type="button" class="btn" data-action="dashboard">Ir a Administración</button>':"")+'</div>';
  APP.innerHTML='<div class="grid-two"><section class="panel"><div class="eyebrow">Alta · Credencial digital</div><h2>'+esc(title)+'</h2>'+
   '<p>Tu ingreso está verificado, pero el ID lo emite RH. La aprobación se vincula al mismo usuario de Firebase.</p>'+content+'</section>'+
   '<section class="panel"><h2>¿Ya tienes un ID?</h2><p>Si tienes una credencial emitida con otro acceso, no crees una segunda cuenta. Ingresa con el método original y vincula aquí tu celular o correo.</p><div class="notice">Administración debe revisar los casos de cuentas duplicadas antes de asociar un nuevo método de acceso.</div></section></div>';
}
function renderLogin(){
  clearCaptcha();
  const google=method==="google",phone=method==="phone",email=method==="email";
  const form=google?'<button class="btn primary full" type="button" data-action="google">Continuar con Google</button>':
    phone?'<form id="sms-send"><div class="field"><label for="phone">Número celular con clave de país</label><input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+52 55 1234 5678" required></div>'+
      '<div id="recaptcha-box"></div><button class="btn primary full" type="submit">Enviar código SMS</button></form>'+
      '<form id="sms-code" hidden><div class="field"><label for="code">Código que recibiste por SMS</label><input id="code" name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></div><button class="btn primary full" type="submit">Verificar e ingresar</button></form>':
      '<form id="email-send"><div class="field"><label for="email">Correo electrónico</label><input id="email" type="email" name="email" required autocomplete="email" placeholder="tu@correo.com"></div>'+
      '<button class="btn primary full" type="submit">Enviarme un enlace seguro</button></form>';
  const isRequest=page==="request";
  APP.innerHTML='<div class="landing"><section class="intro"><div class="eyebrow">ÁGORA · Dejavú Marketing</div>'+
    '<h1>Un solo ID.<br>Tres espacios.<br>Todo conectado.</h1>'+
    '<p>Tu credencial digital es única. Proyectos, actividades y herramientas se muestran según los permisos de tu cuenta.</p>'+
    '<div class="spaces-preview"><div class="preview"><span class="preview-icon">A</span><div><b>Agencia</b><small>Coordinación y trabajo diario</small></div></div>'+
    '<div class="preview"><span class="preview-icon">S</span><div><b>Staff</b><small>Mi día, credencial y pagos</small></div></div>'+
    '<div class="preview"><span class="preview-icon">✓</span><div><b>Administrador</b><small>Usuarios, permisos y supervisión</small></div></div></div></section>'+
    '<section class="panel"><div class="eyebrow">Acceso seguro</div><h2>'+(isRequest?"Solicitar mi ID Dejavú":"Bienvenido a ÁGORA")+'</h2>'+
    '<p>'+(isRequest?"Primero verifica tu celular o correo. Después podrás llenar tu solicitud de ID.":"Ingresa con un contacto verificado y ÁGORA buscará tu ID y tu espacio autorizado.")+'</p>'+
    '<div class="tabs" role="tablist" aria-label="Método de acceso">'+
    [['phone','Celular'],['email','Correo'],['google','Google']].map(([id,label])=>
      '<button type="button" role="tab" aria-selected="'+String(method===id)+'" data-method="'+id+'">'+label+'</button>').join("")+'</div>'+
    form+'<p class="hint">El ID Dejavú identifica tu credencial; no sustituye la verificación segura de tu cuenta.</p>'+
    '<div class="switch"><span>'+(isRequest?"¿Ya tienes ID?":"¿Aún no tienes ID?")+'</span>'+
    '<button type="button" data-action="'+(isRequest?"login":"request")+'">'+(isRequest?"Ingresar":"Solicitar mi ID")+'</button></div>'+
    '<p class="hint">Si ya tienes un ID con otro correo o celular, ingresa con el original y vincula el segundo método para evitar duplicados.</p></section></div>';
}
function renderContactLink(){
  clearCaptcha();
  const isPhone=page==="link-phone";
  APP.innerHTML='<section class="panel" style="max-width:650px;margin:auto"><div class="eyebrow">Seguridad · Mantener mi ID</div>'+
    '<h2>'+(isPhone?"Vincular mi celular":"Vincular mi correo")+'</h2>'+
    '<p>La verificación asociará este contacto a tu usuario actual. Conservarás el mismo UID, ID y credencial.</p>'+
    (isPhone?'<form id="sms-send"><div class="field"><label for="phone">Celular (+52…)</label><input type="tel" id="phone" name="phone" autocomplete="tel" required></div><div id="recaptcha-box"></div><button class="btn primary" type="submit">Enviar código</button></form>'+
      '<form id="sms-code" hidden><div class="field"><label for="code">Código SMS</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="6" pattern="[0-9]{6}"></div><button class="btn primary" type="submit">Vincular celular verificado</button></form>':
      '<form id="email-send"><div class="field"><label for="email">Correo a vincular</label><input id="email" name="email" type="email" required autocomplete="email"></div><button class="btn primary" type="submit">Enviar enlace de vinculación</button></form>')+
    '<div class="actions"><button class="btn outline" type="button" data-action="dashboard">Volver a mi espacio</button></div></section>';
}
function renderEmailLinkPrompt(){
  clearCaptcha();
  APP.innerHTML='<section class="panel" style="max-width:600px;margin:auto"><div class="eyebrow">Verificación de correo</div><h2>Confirma tu dirección</h2>'+
   '<p>Abriendo el enlace desde otro navegador necesitamos que escribas el correo al que fue enviado. Debe ser exactamente el mismo.</p>'+
   '<form id="email-finish"><div class="field"><label for="confirm-email">Correo que recibió el enlace</label><input id="confirm-email" name="email" type="email" autocomplete="email" required></div>'+
   '<button type="submit" class="btn primary full">Terminar verificación</button></form></section>';
}
function render(){
  SESSION_NAME.textContent=user?.email||user?.phoneNumber||"Acceso protegido";
  SIGNOUT.hidden=!user;
  if(page==="finish-email"){renderEmailLinkPrompt();return}
  if(!user){renderLogin();return}
  if(!workspace){APP.innerHTML='<section class="loading">Leyendo permisos y credencial…</section>';return}
  if(page==="link-phone"||page==="link-email"){renderContactLink();return}
  if(page==="registration"||!activeId()&&!adminAccount()){renderRegistration();return}
  if(!space||space==="staff"&&!activeId()||space==="agency"&&!activeId()||space==="agency"&&!agencyAccount()||space==="admin"&&!adminAccount()){
    space=adminAccount()?"admin":agencyAccount()?"agency":"staff";
  }
  renderDashboard();
}
async function refresh(){
  if(!user){workspace=null;render();message("Elige cómo quieres ingresar.");return}
  workspace=null;render();
  try{workspace=await loadOwnIdentity(user);render();message("Sesión verificada. Consulta tu espacio personal.","ok")}
  catch(e){workspace=null;console.error(e);
    APP.innerHTML='<section class="panel"><div class="eyebrow">Acceso seguro</div><h2>No fue posible comprobar tus permisos</h2>'+
      '<p>'+esc(errorMessage(e))+'</p><p>Tu ID y tus datos no han sido modificados.</p>'+
      '<button class="btn primary" data-action="retry">Volver a comprobar</button></section>';
    message(errorMessage(e),"error")
  }
}
async function emailFinish(email){
  if(emailLinkBusy)return;
  emailLinkBusy=true;
  try{
    const intent=sessionStorage.getItem("agora_login_intent");
    const intendedUid=sessionStorage.getItem("agora_link_uid");
    if(intent==="link"&&user&&intendedUid===user.uid){
      const credential=EmailAuthProvider.credentialWithLink(email,location.href);
      await linkWithCredential(user,credential);
    }else if(intent==="link"){
      throw Error("Para vincular este correo debes abrir el enlace en el navegador donde estabas conectada o conectado con tu celular.");
    }else{
      await signInWithEmailLink(auth,email,location.href);
    }
    sessionStorage.removeItem("agora_login_email");
    sessionStorage.removeItem("agora_login_intent");
    sessionStorage.removeItem("agora_link_uid");
    history.replaceState({},document.title,location.pathname);
    page="login";message("Correo verificado correctamente.","ok");
    user=auth.currentUser;await refresh();
  }finally{emailLinkBusy=false}
}
async function maybeFinishEmail(){
  if(!isSignInWithEmailLink(auth,location.href))return false;
  const email=sessionStorage.getItem("agora_login_email");
  if(email){try{await emailFinish(email)}catch(e){message(errorMessage(e),"error");page="finish-email";render()} }
  else{page="finish-email";render();message("Confirma el correo para terminar el ingreso.")}
  return true;
}
async function sendMail(email){
  const address=text(email).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error("Escribe un correo válido.");
  const linking=page==="link-email"&&!!user;
  sessionStorage.setItem("agora_login_email",address);
  sessionStorage.setItem("agora_login_intent",linking?"link":"login");
  if(linking)sessionStorage.setItem("agora_link_uid",user.uid);
  const callback=new URL("./",location.href);
  await sendSignInLinkToEmail(auth,address,{url:callback.href,handleCodeInApp:true});
  APP.querySelector("#email-send").innerHTML='<div class="notice good">Enlace enviado. Abre tu correo y pulsa el botón de acceso. Revisa también spam.</div>';
}
async function sendSms(raw){
  const number=text(raw).replace(/[^\d+]/g,"");
  if(!/^\+[1-9]\d{9,14}$/.test(number))throw Error("Escribe un número internacional completo, por ejemplo +525512345678.");
  if(!recaptcha)recaptcha=new RecaptchaVerifier(auth,"recaptcha-box",{size:"normal"});
  await recaptcha.render();
  const linking=page==="link-phone"&&!!user;
  if(linking){
    const provider=new PhoneAuthProvider(auth);
    const verificationId=await provider.verifyPhoneNumber(number,recaptcha);
    smsFlow={kind:"link",verificationId,number};
  }else{
    const confirmation=await signInWithPhoneNumber(auth,number,recaptcha);
    smsFlow={kind:"login",confirmation,number};
  }
  APP.querySelector("#sms-send").hidden=true;
  APP.querySelector("#sms-code").hidden=false;
  message("Código enviado. Revísalo en tu celular.","ok");
}
async function confirmSms(code){
  if(!smsFlow)throw Error("Solicita primero tu código.");
  if(!/^\d{6}$/.test(text(code)))throw Error("Introduce los seis dígitos del SMS.");
  if(smsFlow.kind==="link"){
    if(!user)throw Error("Debes mantener abierta tu sesión original para asociar el celular.");
    const credential=PhoneAuthProvider.credential(smsFlow.verificationId,text(code));
    await linkWithCredential(user,credential);
  }else await smsFlow.confirmation.confirm(text(code));
  smsFlow=null;clearCaptcha();page="login";
  user=auth.currentUser;
  await refresh();
}
APP.addEventListener("click",async event=>{
  const tab=event.target.closest("[data-method]");
  if(tab){method=tab.dataset.method;smsFlow=null;render();return}
  const switchSpace=event.target.closest("[data-space]");
  if(switchSpace){space=switchSpace.dataset.space;page="login";render();return}
  const action=event.target.closest("[data-action]")?.dataset.action;
  if(!action)return;
  if(action==="google")return withBusy(async()=>{await login()},"Confirma el acceso con tu cuenta Google.");
  if(action==="retry")return withBusy(refresh);
  if(action==="login"||action==="request"){page=action==="request"?"request":"login";render();return}
  if(action==="registration"){page="registration";render();return}
  if(action==="dashboard"){page="login";render();return}
  if(action==="link-phone"||action==="link-email"){page=action;render();return}
});
APP.addEventListener("submit",event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  event.preventDefault();
  const d=new FormData(form);
  if(form.id==="email-send")return withBusy(()=>sendMail(d.get("email")),"Revisa el correo para continuar.");
  if(form.id==="email-finish")return withBusy(()=>emailFinish(text(d.get("email"))));
  if(form.id==="sms-send")return withBusy(()=>sendSms(d.get("phone")));
  if(form.id==="sms-code")return withBusy(()=>confirmSms(d.get("code")));
  if(form.id==="registration-form")return withBusy(async()=>{
    await requestRegistration(user,{name:d.get("name"),phone:d.get("phone"),jobTitle:d.get("role"),privacyAccepted:d.get("privacy")==="on"});
    await refresh();
  },"Solicitud registrada correctamente. Administración revisará tu ID.");
});
SIGNOUT.addEventListener("click",()=>withBusy(async()=>{
  clearCaptcha();smsFlow=null;workspace=null;page="login";space="";await logout();
},"Sesión cerrada."));
watchSession(async nextUser=>{
  user=nextUser;
  if(await maybeFinishEmail())return;
  await refresh();
});
