import {auth,db} from "./firebase.js";
import {
  onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithRedirect,signInWithEmailAndPassword,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {doc,getDoc,getDocFromServer,getDocs,collection,query,orderBy,limit,setDoc,updateDoc,serverTimestamp,where,writeBatch}
  from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {saveProfile,saveFinancial} from "../identidad/firebase-identity.js";
import {projectTodayAssignments} from "../identidad/domain.mjs";
import {ownJornadas,coordinationJornadas,operationTotals,validateAssignmentDraft,assignmentDraftText,REQUEST_CHANNELS,assignmentEventOptions,filterCoordinatorAgenda} from "./roles-operacion.mjs?v=20261126-responsible-coordination";
import {showShiftQr} from "./staff-shift-qr.js";
import {renderStaffTasks,readStaffTasks} from "./staff-activities.js";
import {mountRoster} from "./attendance-roster.js?v=20261126-remote-attendance";
import {requestRemoteAttendance,loadOwnRemoteRequests} from "./remote-attendance.js?v=20261126-qa";

// Una sola identidad Firebase para todas las vistas. Sin módulos operativos.
const ROOT=new URL("./",import.meta.url);
const ADMIN_EMAIL="admi.agora@gmail.com";
const QA_LOGIN_USERS=new Set([
  "admi.agora+qa.staff@gmail.com",
  "admi.agora+qa.supervisor@gmail.com"
]);
const JOBS=[
  "Coordinador","Subcoordinador de cuenta","Supervisor","Staff",
  "Staff de montaje","Staff de desmontaje","Volanteero","Runner"
];
const PATH_SPACES=Object.freeze({
  staff:{title:"Staff",icon:"icono-staff-hq.webp"},
  agencia:{title:"Agencia",icon:"icono-agencia-hq.webp"},
  administrador:{title:"Administrador",icon:"icono-administrador-hq.webp"}
});
const routeMatch=location.pathname.match(/\/(staff|agencia|administrador|expediente|mi-operacion)\/(?:index\.html)?$/);
const routeSpace=routeMatch&&PATH_SPACES[routeMatch[1]]?routeMatch[1]:"";
const routePrivate=routeMatch&&!PATH_SPACES[routeMatch[1]]?routeMatch[1]:"";
const app=document.getElementById("app");
const status=document.getElementById("system-status");
const sessionLabel=document.getElementById("session-label");
const logoutButton=document.getElementById("logout");
const state={user:null,identity:null,privateData:null,privateError:null,roleData:null,roleError:null,page:"login",busy:false,epoch:0};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const clean=v=>String(v??"").trim();
const href=path=>new URL(path,ROOT).href;
const iconSrc=filename=>href("assets/"+filename);
const name=()=>clean(state.identity?.registry?.displayName)||
  clean(state.user?.displayName)||"No registrado";
const id=()=>clean(state.identity?.registry?.agoraId);
const job=()=>clean(state.identity?.registry?.jobTitle)||"No registrado";
const email=()=>clean(state.user?.email)||"No registrado";
const activeAccount=()=>state.identity?.account?.active===true;
const role=()=>activeAccount()?state.identity.account.role:"";
const verifiedId=()=>state.identity?.link?.active===true&&
  state.identity?.registry?.rhStatus==="verified"&&
  state.identity?.registry?.credentialActive===true;
const principalAdmin=()=>state.user?.email?.toLowerCase()===ADMIN_EMAIL&&
  state.user?.emailVerified===true;
const allowed=key=>{
  if(!verifiedId())return false;
  if(key==="staff")return true;
  if(key==="agencia")return state.user?.emailVerified===true&&["admin","coordinador","consulta"].includes(role());
  if(key==="administrador")return principalAdmin()&&role()==="admin";
  return false;
};
const spaces=()=>Object.entries(PATH_SPACES).filter(([key])=>allowed(key));
const notice=(msg,tone="")=>{
  status.textContent=msg;
  if(tone)status.dataset.tone=tone;else delete status.dataset.tone;
};
const errorText=e=>{
  const code=String(e?.code||"");
  if(code==="qa/email-not-verified")return "Antes de iniciar sesión, abre el enlace de verificación que llegó a tu buzón.";
  if(code.includes("invalid-credential")||code.includes("wrong-password")||code.includes("user-not-found"))return "No se pudo autenticar la cuenta QA.";
  if(code.includes("unauthorized-domain"))return "El dominio debe autorizarse en Firebase Authentication.";
  if(code.includes("popup-closed-by-user"))return "Se canceló el acceso con Google.";
  if(code.includes("permission-denied"))return "No fue posible leer tu identidad. Revisa los permisos de Firebase.";
  if(code.includes("network"))return "No hay conexión. Inténtalo de nuevo.";
  return String(e?.message||"No se pudo completar esta operación.");
};
async function run(fn,success=""){
  if(state.busy)return;
  state.busy=true;
  const buttons=[...document.querySelectorAll("button")];
  const wasDisabled=buttons.map(button=>button.disabled);
  buttons.forEach(button=>button.disabled=true);
  try{await fn();if(success)notice(success,"ok")}
  catch(e){console.error(e);notice(errorText(e),"error")}
  finally{
    state.busy=false;
    buttons.forEach((button,i)=>{button.disabled=wasDisabled[i]});
  }
}
function renderLogin(){
  document.body.classList.add("login-mode");
  const request=state.page==="request";
  app.innerHTML='<div class="cinema-login">'+
    '<div class="cinema-backdrop" aria-hidden="true"></div>'+
    '<div class="cinema-stars" aria-hidden="true"></div>'+
    '<div class="cinema-content">'+
      '<div class="cinema-brand">'+
        '<img src="'+esc(iconSrc("agora-wordmark-transparent.webp"))+'" alt="ÁGORA por Dejavú Marketing" width="886" height="330">'+
        '<div class="cinema-subtitle"><span aria-hidden="true"></span>IDENTIDAD ÚNICA · DEJAVÚ MARKETING<span aria-hidden="true"></span></div>'+
      '</div>'+
      '<section class="cinema-card" aria-label="Acceso ÁGORA">'+
        '<div class="cinema-inner"><h1 class="sr-only">'+
          (request?"Solicitar ID Dejavú":"Iniciar sesión en ÁGORA")+'</h1>'+
          (request?'<p class="cinema-info">Primero verifica tu identidad con Google. Después podrás solicitar tu ID Dejavú.</p>':
            '<form id="id-login" aria-describedby="id-login-note">'+
              '<div class="field"><label for="staff-id">Usuario · ID Dejavú</label>'+
                '<div class="id-entry"><span class="id-prefix" aria-hidden="true">DJV-</span>'+
                '<input id="staff-id" name="id" type="text" autocomplete="username" placeholder="2026-001" pattern="[0-9]{4}-[0-9]{3,6}" aria-label="ID después del prefijo DJV-" required></div></div>'+
              '<div class="field"><label for="staff-password">Contraseña</label>'+
                '<input id="staff-password" name="password" type="password" autocomplete="current-password" placeholder="Contraseña de ÁGORA" required></div>'+
              '<button class="btn gold full" type="submit" disabled>Ingresar con ID</button>'+
            '</form>'+
            '<p id="id-login-note" class="login-pending">El acceso mediante ID y contraseña aún necesita habilitación segura. Por ahora utiliza Google.</p>')+
          '<div class="login-separator"><span>o continúa con</span></div>'+
          '<button type="button" class="btn google-login full" data-action="google">Continuar con Google</button>'+
          (!request?'<details class="qa-access"><summary>Acceso de cuentas QA</summary>'+
            '<form id="qa-login" aria-describedby="qa-login-note">'+
              '<div class="field"><label for="qa-email">Cuenta QA</label>'+
                '<select id="qa-email" name="email" required><option value="">Selecciona cuenta</option>'+
                  '<option value="admi.agora+qa.staff@gmail.com">Staff QA</option>'+
                  '<option value="admi.agora+qa.supervisor@gmail.com">Supervisor QA</option></select></div>'+
              '<div class="field"><label for="qa-password">Contraseña</label>'+
                '<input id="qa-password" name="password" type="password" autocomplete="current-password" required></div>'+
              '<button class="btn full" type="submit">Ingresar con correo</button>'+
            '</form><p id="qa-login-note" class="login-pending">Solo para las dos cuentas de prueba autorizadas. Se requiere correo verificado.</p></details>':'')+
          '<div class="cinema-secondary"><button class="text-btn" data-action="'+
            (request?"login":"request")+'" type="button">'+
            (request?"Volver al acceso":"Solicitar mi ID Dejavú")+'</button></div>'+
          '<div class="cinema-card-footer"><span>Agencia · Staff · Administrador</span>'+
            '<small>Tu espacio depende de tu identidad y permisos.</small></div>'+
        '</div>'+
      '</section>'+
    '</div>'+
  '</div>';
}
function renderLoading(){
  document.body.classList.remove("login-mode");
  app.innerHTML='<section class="page-loading" aria-busy="true">Consultando tu perfil en ÁGORA…</section>';
}
async function readOwnIdentity(user){
  const [account,registration,link]=await Promise.all([
    getDoc(doc(db,"agora_users",user.uid)),
    getDoc(doc(db,"agora_identity_registrations",user.uid)),
    getDoc(doc(db,"agora_identity_links",user.uid))
  ]);
  const linked=link.exists()?link.data():null;
  let registry=null;
  if(linked?.agoraId){
    const record=await getDoc(doc(db,"agora_identity_registry",linked.agoraId));
    registry=record.exists()?record.data():null;
    if(registry&&registry.uid!==user.uid){
      throw Error("La credencial vinculada no coincide con tu usuario de Firebase.");
    }
  }
  return {
    account:account.exists()?account.data():null,
    registration:registration.exists()?registration.data():null,
    link:linked,registry
  };
}
async function readPrivateSection(uid,section){
  if(section==="expediente"){
    const [profileSnap,financialSnap]=await Promise.all([
      getDoc(doc(db,"agora_identity_profiles",uid)),
      getDoc(doc(db,"agora_identity_financial",uid))
    ]);
    return {
      profile:profileSnap.exists()?profileSnap.data():null,
      financial:financialSnap.exists()?financialSnap.data():null
    };
  }
  if(section==="mi-operacion"){
    const snap=await getDoc(doc(db,"agora_ops_staff",uid));
    return {operations:snap.exists()?snap.data():null};
  }
  return null;
}
async function readRoleOperations(uid,space){
  // Nunca solicitar el cronograma general para Staff o cuentas de consulta.
  if(space==="staff"){
    const snapshot=await getDoc(doc(db,"agora_ops_staff",uid));
    return {staff:snapshot.exists()?snapshot.data():null};
  }
  if(["admin","coordinador"].includes(role())&&
     (space==="agencia"||space==="administrador")){
    const snapshot=await getDoc(doc(db,"agora_ops_control","schedule"));
    return {schedule:snapshot.exists()?snapshot.data():null};
  }
  return {readOnly:true};
}

async function refresh(){
  const user=state.user;
  const epoch=++state.epoch;
  sessionLabel.textContent=user?.email||"Mi cuenta";
  logoutButton.hidden=!user;
  state.privateData=null;
  state.privateError=null;
  state.roleData=null;
  state.roleError=null;
  if(!user){
    state.identity=null;
    render();
    return;
  }
  renderLoading();
  try{
    const identity=await readOwnIdentity(user);
    if(epoch!==state.epoch||auth.currentUser?.uid!==user.uid)return;
    state.identity=identity;
    // Los datos médicos, bancarios y jornadas SOLO se consultan al abrir
    // su propia página y únicamente para el UID de la sesión.
    if(routePrivate&&verifiedId()){
      try{
        const result=await readPrivateSection(user.uid,routePrivate);
        if(epoch!==state.epoch||auth.currentUser?.uid!==user.uid)return;
        state.privateData=result;
      }catch(error){
        if(epoch!==state.epoch)return;
        state.privateError=error;
        console.warn("No se pudo leer la sección privada:",error?.code||"error");
      }
    }
    if(routeSpace&&allowed(routeSpace)){
      try{
        const result=await readRoleOperations(user.uid,routeSpace);
        if(epoch!==state.epoch||auth.currentUser?.uid!==user.uid)return;
        state.roleData=result;
      }catch(error){
        if(epoch!==state.epoch)return;
        state.roleError=error;
        console.warn("Consulta de operación no disponible:",error?.code||"error");
      }
    }
    render();
    notice("","ok");
  }catch(e){
    if(epoch!==state.epoch)return;
    console.error(e);
    state.identity=null;
    state.privateData=null;
    document.body.classList.remove("login-mode");
    app.innerHTML='<section class="profile-error"><h1>No se pudo cargar tu identidad</h1>'+
      '<p>'+esc(errorText(e))+'</p>'+
      '<button type="button" data-action="retry" class="profile-button">Volver a intentar</button></section>';
    notice(errorText(e),"error");
  }
}

function managementMarkup(){
  if(!activeAccount()||role()!=="admin")return "";
  return '<details id="altas" class="profile-calendar-inline management-inline">'+
    '<summary><strong>Altas y accesos</strong><span>Solicitudes, credenciales y coordinación</span></summary>'+
    '<iframe class="portal-management-frame" title="Gestión de identidad y RH" data-src="'+
      esc(href("../identidad/?embedded=management"))+'" loading="lazy"></iframe></details>';
}
function attachManagement(){
  const panel=document.getElementById("altas");
  if(!panel)return;
  const frame=panel.querySelector("iframe");
  const load=()=>{if(panel.open&&!frame.src)frame.src=frame.dataset.src};
  panel.addEventListener("toggle",load);
  load();
}
function renderRegistration(){
  const existing=state.identity?.registration;
  const reg=state.identity?.registry;
  let content="";
  if(reg){
    content='<p>Ya tienes un ID Dejavú registrado. Su revisión corresponde a administración.</p>';
  }else if(existing){
    content='<p>Tu solicitud ya está registrada. Estado: <strong>'+
      esc(existing.status||"Pendiente")+'</strong>.</p>';
  }else{
    content='<form id="request-id" class="identity-request">'+
      '<label>Nombre completo<input name="name" autocomplete="name" required minlength="3" maxlength="140" value="'+
        esc(state.user?.displayName||"")+'"></label>'+
      '<label>Celular de contacto<input name="phone" type="tel" autocomplete="tel" maxlength="30" value="'+
        esc(state.user?.phoneNumber||"")+'"></label>'+
      '<label>Actividad principal<select name="job">'+JOBS.map(j=>
        '<option'+(j==="Staff"?" selected":"")+'>'+esc(j)+'</option>').join("")+'</select></label>'+
      '<label class="request-consent"><input type="checkbox" name="privacy" required> Acepto la revisión de mi solicitud conforme al aviso de privacidad provisional.</label>'+
      '<button class="profile-button profile-button-primary" type="submit">Enviar solicitud de ID</button></form>';
  }
  app.innerHTML='<section class="profile-error"><div class="profile-kicker">Identidad Dejavú</div>'+
    '<h1>'+esc(reg?"Credencial en revisión":existing?"Solicitud registrada":"Solicita tu ID")+'</h1>'+
    content+'<p class="profile-muted">No se emitirá automáticamente un ID nuevo.</p></section>'+managementMarkup();
  attachManagement();
}
function credentialLink(){
  const token=state.identity?.registry?.credentialId||"";
  if(!/^[0-9a-f]{24,64}$/i.test(token))return "";
  const url=new URL("verificar.html",ROOT);
  url.searchParams.set("id",token);
  return url.href;
}
function credentialDialog(){
  const reg=state.identity?.registry,link=credentialLink();
  if(!reg)return "";
  return '<dialog class="credential-modal" id="credential-dialog" aria-labelledby="credential-dialog-title">'+
    '<div class="modal-heading"><strong>Credencial digital</strong>'+
      '<button type="button" data-action="close-credential" aria-label="Cerrar">×</button></div>'+
    '<div class="credential-face">'+
      '<img src="'+esc(iconSrc("logo-agora-hq.webp"))+'" alt="ÁGORA Dejavú Marketing" class="credential-logo">'+
      '<div class="credential-photo-wrap">'+photoMarkup("credential")+'</div>'+
      '<span class="profile-kicker">Identidad Dejavú</span>'+
      '<h2 id="credential-dialog-title">'+esc(name())+'</h2>'+
      '<p>'+esc(job())+'</p><strong class="credential-number">'+esc(id())+'</strong>'+
      (link?'<div class="credential-qr" id="credential-qr-modal">'+
        '<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Verificar credencial</a></div>':
        '<p>El código QR está pendiente de emisión.</p>')+
      '<span class="credential-valid">Vigente</span>'+
    '</div>'+
    '<p class="profile-muted">Este QR es exclusivamente de identificación y vigencia. Para asistencia utiliza el QR de una jornada en Staff.</p>'+
    '<div class="modal-actions">'+
      (link?'<button class="profile-button" type="button" data-action="share-credential">Compartir verificación</button>'+
        '<a class="profile-button profile-button-outline" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Comprobar vigencia</a>':"")+
      '<button class="profile-button profile-button-outline" type="button" data-action="close-credential">Cerrar</button>'+
    '</div>'+
  '</dialog>';
}
function drawQr(){
  const box=document.getElementById("credential-qr-modal"),link=credentialLink();
  if(!box||!link||!window.QRCode)return; // enlace visible si falla biblioteca externa
  box.replaceChildren();
  new window.QRCode(box,{
    text:link,width:160,height:160,colorDark:"#171614",colorLight:"#ffffff",
    correctLevel:window.QRCode.CorrectLevel.M
  });
}
// La fotografía es REAL y procede de Firebase Auth / proveedor Google.
// No se dibujan retratos ficticios ni se guardan imágenes en Firestore.
function profilePhotoUrl(){
  const user=state.user;
  const sources=[user?.photoURL,...(user?.providerData||[]).map(p=>p.photoURL)];
  for(const source of sources){
    try{
      if(!source)continue;
      const url=new URL(source);
      if(url.protocol==="https:")return url.href;
    }catch{ /* La foto no es una URL HTTPS válida. */ }
  }
  return "";
}
function profileInitials(){
  const words=name().split(/\s+/).filter(Boolean);
  return words.slice(0,2).map(w=>w.charAt(0)).join("").toLocaleUpperCase("es-MX")||"DV";
}
function photoMarkup(kind="profile"){
  const source=profilePhotoUrl();
  const label=esc(name());
  return '<div class="person-photo person-photo--'+kind+'">'+
    '<span class="person-photo-fallback" aria-hidden="true">'+esc(profileInitials())+'</span>'+
    (source?'<img class="person-photo-image" src="'+esc(source)+
      '" alt="Foto de perfil de '+label+'" referrerpolicy="no-referrer" decoding="async">':"")+
  '</div>';
}
function prepareProfilePhotos(){
  app.querySelectorAll(".person-photo-image").forEach(img=>{
    img.addEventListener("error",()=>img.remove(),{once:true});
    if(img.complete&&!img.naturalWidth)img.remove();
  });
}
function pageShell(){
  return '<div class="profile-identity">'+
    photoMarkup()+
    '<div class="profile-person">'+
      '<div class="profile-identity-label"><span class="identity-dot" aria-hidden="true"></span> IDENTIDAD ACREDITADA</div>'+
      '<h2>'+esc(name())+'</h2>'+
      '<p>'+esc(job())+'</p>'+
    '</div></div>';
}
function profileTool(path,label,detail,symbol){
  return '<a class="private-link" href="'+esc(href(path))+'">'+
    '<span class="private-link-symbol" aria-hidden="true">'+symbol+'</span>'+
    '<span><strong>'+label+'</strong><small>'+detail+'</small></span>'+
    '<span class="private-link-arrow" aria-hidden="true">↗</span></a>';
}

function profile(){
  const calendarOpen=new URLSearchParams(location.search).has("calendario");
  const fields=[
    ["ID Dejavú",id()||"No registrado"],
    ["Correo electrónico",email()],
    ["Estado","Vigente"]
  ];
  // Los nombres Staff y Agencia ya forman parte de los iconos oficiales.
  // Por accesibilidad, cada tarjeta conserva un nombre descriptivo accesible.
  const cards=spaces().map(([key,meta])=>
    '<a class="profile-space-link" href="'+esc(href(key+"/"))+
      '" aria-label="Abrir espacio '+esc(meta.title)+'">'+
      '<span class="profile-space-visual"><img src="'+esc(iconSrc(meta.icon))+
         '" alt="" width="92" height="92" loading="lazy"></span>'+
      (key==="administrador"?'<span class="profile-space-role">Administrador</span>':"")+
      '<span class="profile-space-action" aria-hidden="true">Entrar <span>↗</span></span>'+
    '</a>').join("");
  app.innerHTML='<section class="profile-page" aria-label="Mi perfil">'+
    '<header class="profile-heading">'+
      '<div><div class="profile-kicker">MI CUENTA DEJAVÚ</div>'+
        '<h1>Mi perfil</h1><p>Tu identidad y tus espacios, en un mismo lugar.</p></div>'+
      '<span class="profile-id-label">'+esc(id())+'</span>'+
    '</header>'+
    '<div class="profile-layout">'+
      '<section class="profile-main" aria-labelledby="profile-data-heading">'+
        '<h2 id="profile-data-heading" class="sr-only">Información de mi perfil</h2>'+
        pageShell()+
        '<dl class="profile-fields">'+fields.map(([label,val])=>
          '<div><dt>'+esc(label)+'</dt><dd>'+esc(val)+'</dd></div>').join("")+'</dl>'+
        '<div class="profile-actions"><button class="profile-button profile-button-primary" type="button" data-action="open-credential">'+
          'Ver mi credencial <span aria-hidden="true">↗</span></button>'+
          '<span class="profile-photo-hint">'+(profilePhotoUrl()?
            "Fotografía de tu cuenta Google":
            "Sin foto en Google; se muestran tus iniciales")+'</span>'+
        '</div>'+
      '</section>'+
      '<section class="profile-spaces" aria-labelledby="profile-spaces-heading">'+
        '<div class="profile-section-top"><h2 id="profile-spaces-heading">Mis espacios</h2>'+
        '<p>Selecciona el área que deseas abrir.</p></div>'+
        '<nav aria-label="Mis espacios autorizados" class="profile-space-list">'+cards+'</nav>'+
      '</section>'+
    '</div>'+
    managementMarkup()+
    (allowed("agencia")&&["admin","coordinador"].includes(role())?
      '<details id="calendario" class="profile-calendar-inline"'+(calendarOpen?' open':'')+'>'+
        '<summary><strong>Calendario de operaciones</strong><span>Ver cronograma y editar actividades aquí</span></summary>'+
        '<iframe class="portal-calendar-frame" title="Cronograma de actividades" data-src="'+
          esc(href("../operaciones/?embedded=calendar"))+'" loading="lazy"></iframe></details>':"")+
    '<section class="profile-private-links" aria-labelledby="own-sections-heading">'+
      '<div class="profile-section-top"><h2 id="own-sections-heading">Accesos rápidos</h2></div>'+
      '<div class="profile-private-grid">'+
        (allowed("staff")?profileTool("staff/","Mis jornadas","Asignaciones y QR de asistencia","◷"):"")+
        (allowed("agencia")&&["admin","coordinador"].includes(role())?
          profileTool("agencia/","Coordinación","Agenda y solicitudes de asignación","▤"):"")+
        (allowed("administrador")?
          profileTool("../recursos/?vista=obligaciones","Finanzas","Obligaciones, pagos y conciliación","▤"):"")+
        (allowed("staff")?profileTool("trabajos/","Mis trabajos y pagos","Formularios e historial personal","▤"):"")+
        (allowed("staff")?profileTool("campo/","ÁGORA Campo","Tareas de campo por folio y acuses provisionales","▤"):"")+
        '<a class="private-link" href="'+esc(href("mi-operacion/"))+'">'+
          '<span class="private-link-symbol" aria-hidden="true">◷</span>'+
          '<span><strong>Mi operación</strong><small>Mis actividades de hoy</small></span>'+
          '<span class="private-link-arrow" aria-hidden="true">↗</span></a>'+
        '<a class="private-link" href="'+esc(href("expediente/"))+'">'+
          '<span class="private-link-symbol" aria-hidden="true">▤</span>'+
          '<span><strong>Expediente privado</strong><small>Datos personales y fiscales</small></span>'+
          '<span class="private-link-arrow" aria-hidden="true">↗</span></a>'+
      '</div></section>'+
    credentialDialog()+
  '</section>';
  prepareProfilePhotos();
  attachManagement();
  const calendar=document.getElementById("calendario");
  if(calendar){
    const frame=calendar.querySelector("iframe");
    const loadCalendar=()=>{if(calendar.open&&!frame.src)frame.src=frame.dataset.src};
    calendar.addEventListener("toggle",loadCalendar);
    loadCalendar();
  }
}

// Los campos se conservan con los mismos nombres que Identidad Única y RH.
const dossierField=(key,label,value="",type="text",maxlength=140,disabled=false)=>
  '<label class="secure-field" for="pr-'+key+'"><span>'+esc(label)+'</span>'+
  '<input id="pr-'+key+'" name="'+esc(key)+'" type="'+esc(type)+
    '" maxlength="'+maxlength+'" value="'+esc(value||"")+'"'+
    (disabled?' disabled aria-disabled="true"':"")+'></label>';
function personalBack(){
  return '<a class="secure-back" href="'+esc(ROOT.href)+'">← Volver a Mi perfil</a>';
}
function sectionError(){
  app.innerHTML='<section class="secure-page">'+personalBack()+
    '<div class="secure-error" role="alert"><h1>No pudimos consultar tus datos</h1>'+
    '<p>'+esc(errorText(state.privateError))+'</p>'+
    '<p>Esta lectura no modificó ni duplicó tu expediente.</p>'+
    '<button class="profile-button profile-button-outline" data-action="retry" type="button">Reintentar consulta</button>'+
    '</div></section>';
}
function renderDossier(){
  const p=state.privateData?.profile||{};
  const f=state.privateData?.financial||{};
  const locked=f.lockedByRH===true;
  app.innerHTML='<section class="secure-page" aria-label="Mi expediente privado">'+
    personalBack()+
    '<header class="secure-heading"><div class="profile-kicker">ÁGORA · IDENTIDAD Y RH</div>'+
      '<h1>Expediente privado</h1>'+
      '<p>Tu información personal, de contacto y fiscal, protegida con tu cuenta.</p></header>'+
    '<div class="secure-privacy">Acceso personal. Solo tu cuenta y RH con permisos pueden consultar estos registros.</div>'+
    '<div class="secure-accordion">'+
      '<details><summary>Datos personales, uniforme y emergencias <span aria-hidden="true">⌄</span></summary>'+
        '<div class="secure-details">'+
          '<form id="private-profile-form" class="secure-form" autocomplete="off">'+
            dossierField("telephone","Teléfono",p.telephone,"tel",30)+
            dossierField("address","Domicilio",p.address,"text",300)+
            dossierField("shirtSize","Talla de playera",p.shirtSize,"text",12)+
            dossierField("pantSize","Talla de pantalón",p.pantSize,"text",12)+
            dossierField("shoeSize","Calzado",p.shoeSize,"text",12)+
            dossierField("emergencyName","Contacto de emergencia",p.emergencyName,"text",140)+
            dossierField("emergencyRelation","Relación con contacto",p.emergencyRelation,"text",80)+
            dossierField("emergencyPhone","Teléfono de emergencia",p.emergencyPhone,"tel",30)+
            '<label class="secure-field secure-wide" for="pr-medicalNotes">'+
              '<span>Información médica estrictamente necesaria (solo titular y RH)</span>'+
              '<textarea id="pr-medicalNotes" name="medicalNotes" maxlength="300" rows="3">'+
                esc(p.medicalNotes||"")+'</textarea></label>'+
            '<div class="secure-form-actions"><button type="submit" class="profile-button profile-button-primary">Guardar datos privados</button></div>'+
          '</form></div></details>'+
      '<details><summary>Datos fiscales y bancarios'+(locked?" · Bloqueados por RH":"")+
        ' <span aria-hidden="true">⌄</span></summary>'+
        '<div class="secure-details">'+
          (locked?'<p class="secure-warning">RH bloqueó esta sección. Solicita la revisión correspondiente; no se sobrescribirán los datos.</p>':"")+
          '<form id="private-financial-form" class="secure-form" autocomplete="off">'+
            dossierField("rfc","RFC",f.rfc,"text",20,locked)+
            dossierField("curp","CURP",f.curp,"text",24,locked)+
            dossierField("nss","NSS",f.nss,"text",20,locked)+
            dossierField("bank","Institución bancaria",f.bank,"text",100,locked)+
            dossierField("clabe","CLABE",f.clabe,"text",24,locked)+
            dossierField("taxRegime","Régimen fiscal",f.taxRegime,"text",140,locked)+
            '<div class="secure-form-actions"><button type="submit" class="profile-button profile-button-primary"'+
              (locked?' disabled aria-disabled="true"':"")+
              '>Guardar datos fiscales</button></div>'+
          '</form></div></details>'+
      '<details><summary>Bóveda documental <span aria-hidden="true">⌄</span></summary>'+
        '<div class="secure-details"><p class="profile-muted">La carga de documentos permanece deshabilitada hasta contar con almacenamiento privado, permisos de descarga y pruebas satisfactorias.</p></div>'+
      '</details>'+
    '</div></section>';
}
const operationTime=date=>new Intl.DateTimeFormat("es-MX",{
  hour:"2-digit",minute:"2-digit"
}).format(date);
function renderMyOperation(){
  // Se reutiliza exactamente la proyección limitada del sitio Identidad y RH.
  // No incluye pagos, tarifas, GPS ni otras personas.
  const today=projectTodayAssignments(state.privateData?.operations,new Date());
  app.innerHTML='<section class="secure-page" aria-label="Mi operación">'+
    personalBack()+
    '<header class="secure-heading"><div class="profile-kicker">ÁGORA · OPERACIONES</div>'+
      '<h1>Mi operación</h1><p>Consulta las actividades asignadas para hoy.</p></header>'+
    '<section class="secure-assignments" aria-label="Mis actividades de hoy">'+
      '<div class="secure-section-title"><h2>¿A qué voy hoy?</h2>'+
        '<span>'+new Intl.DateTimeFormat("es-MX",{weekday:"long",day:"numeric",month:"long"}).format(new Date())+'</span></div>'+
      (today.length?today.map(item=>
        '<article class="secure-assignment"><div class="secure-assignment-head">'+
          '<span class="secure-time">'+operationTime(item.start)+' – '+operationTime(item.end)+'</span>'+
          '<h3>'+esc(item.project||"Actividad")+'</h3></div>'+
        '<dl class="secure-facts">'+
          '<div><dt>Sede</dt><dd>'+esc(item.site||"Por confirmar")+'</dd></div>'+
          '<div><dt>Cargo</dt><dd>'+esc(item.jobTitle||"Asignado en operación")+'</dd></div>'+
          '<div><dt>Actividad</dt><dd>'+esc(item.activity||"Por confirmar")+'</dd></div>'+
          '<div><dt>Responsable</dt><dd>'+esc(item.responsible||"Coordinación")+'</dd></div>'+
        '</dl>'+(item.instructions?'<p class="secure-instructions"><strong>Indicaciones: </strong>'+
            esc(item.instructions)+'</p>':"")+'</article>'
      ).join(""):'<p class="secure-no-work">No hay actividades programadas para hoy.</p>')+
    '</section></section>';
}
function renderPrivateSection(){
  if(state.privateError)return sectionError();
  if(routePrivate==="expediente")renderDossier();
  else if(routePrivate==="mi-operacion")renderMyOperation();
}

function routeDenied(unauthenticated=false){
  app.innerHTML='<section class="empty-space-page">'+
    '<img src="'+esc(iconSrc("logo-agora-hq.webp"))+'" alt="ÁGORA" class="empty-space-brand">'+
    '<h1>'+(unauthenticated?"Inicia sesión para continuar":"Acceso restringido")+'</h1>'+
    '<p>'+(unauthenticated?"Verifica tu identidad antes de abrir este espacio.":
      "Tu cuenta no tiene permiso para abrir esta página. No se han modificado tus datos.")+'</p>'+
    '<a class="profile-button profile-button-primary" href="'+esc(ROOT.href)+'">'+
      (unauthenticated?"Ir al inicio de sesión":"Volver a Mi perfil")+'</a></section>';
}
const roleDate=ms=>new Intl.DateTimeFormat("es-MX",{
  weekday:"short",day:"numeric",month:"short"
}).format(new Date(ms));
const roleTime=ms=>new Intl.DateTimeFormat("es-MX",{
  hour:"2-digit",minute:"2-digit"
}).format(new Date(ms));
function roleNotice(){
  if(!state.roleError)return "";
  return '<div class="role-notice" role="status">'+
    '<strong>Sin acceso a la operación todavía</strong>'+
    '<p>El ID Dejavú está acreditado, pero falta verificar tu vinculación con Operaciones o los permisos del módulo. No se ha modificado ningún registro.</p>'+
    '<button class="profile-button profile-button-outline" data-action="retry" type="button">Volver a consultar</button></div>';
}
function fieldShiftLink(item){
  if(!item.key||item.key.length>100)return "";
  return '<a class="profile-button profile-button-outline" href="'+esc(href("campo/"))+
    '" data-field-shift="'+esc(item.key)+'">Abrir en ÁGORA Campo</a>';
}
function staffJornadaCard(item){
  return '<article class="role-jornada">'+
    '<div class="role-jornada-head"><div><small>'+esc(roleDate(item.start))+'</small>'+
    '<h3>'+esc(item.title)+'</h3></div>'+
    '<span class="role-time">'+roleTime(item.start)+' – '+roleTime(item.end)+'</span></div>'+
    '<dl class="role-jornada-facts"><div><dt>Sede</dt><dd>'+esc(item.site)+'</dd></div>'+
    '<div><dt>Asignado por</dt><dd>'+esc(item.responsible)+'</dd></div></dl>'+
    '<div class="role-activities"><strong>Actividades de esta jornada</strong>'+
      (item.activities.length?'<ul>'+item.activities.map(a=>'<li>'+esc(a.name)+'</li>').join("")+'</ul>':
      '<p>Coordinación todavía no ha detallado las actividades.</p>')+
      (item.instructions?'<p class="role-instructions">'+esc(item.instructions)+'</p>':"")+
    '</div>'+
    '<button type="button" class="profile-button profile-button-primary" data-action="show-shift-qr" data-event-id="'+esc(item.key)+'">Mostrar QR para asistencia</button>'+
    '<div class="remote-request-buttons"><button type="button" class="profile-button profile-button-outline" data-action="remote-attendance-request" data-attendance-action="entrada" data-event-id="'+esc(item.key)+'">Pedir entrada remota</button>'+
    '<button type="button" class="profile-button profile-button-outline" data-action="remote-attendance-request" data-attendance-action="salida" data-event-id="'+esc(item.key)+'">Pedir salida remota</button></div>'+
    fieldShiftLink(item)+'</article>';
}
function staffOperationsSpace(){
  const staff=state.roleData?.staff;
  const assigned=ownJornadas(staff,new Date(),35);
  const now=Date.now();
  const quickQr=assigned.find(x=>x.start<=now&&x.end>=now)||assigned.find(x=>x.start>now)||assigned[0];
  return '<section class="role-module" aria-label="Mis jornadas y actividades">'+
    '<header class="role-module-heading"><div><h2>Mis jornadas</h2>'+
      '<p>Una jornada puede incluir varias actividades. Consulta tus asignaciones personales.</p></div>'+
      '<div class="role-space-actions">'+
        '<button type="button" class="profile-button profile-button-primary" data-action="new-work-claim">+ Registrar trabajo o asignación</button>'+
        (quickQr?'<button type="button" class="profile-button profile-button-outline" data-action="show-shift-qr" data-event-id="'+esc(quickQr.key)+'">Mostrar QR para asistencia</button>':"")+
        '<a class="profile-button profile-button-primary" href="'+esc(href("mi-operacion/"))+'">Mi operación</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("campo/"))+'">ÁGORA Campo</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("trabajos/"))+'">Mis trabajos y pagos</a>'+
        (["admin","coordinador","supervisor"].includes(role())?'<a class="profile-button profile-button-outline" href="'+esc(href("escanear/"))+'">Pasar lista</a>':"")+'</div></header>'+
    roleNotice()+
    (staff?assigned.length?'<div class="role-jornada-list">'+assigned.slice(0,3).map(staffJornadaCard).join("")+'</div>'+
      (assigned.length>3?'<details class="role-more-jornadas"><summary>Ver otras jornadas ('+(assigned.length-3)+')</summary><div class="role-jornada-list">'+assigned.slice(3).map(staffJornadaCard).join("")+'</div></details>':""):
      '<p class="role-empty">No hay jornadas vigentes o próximas en tu ficha personal.</p>':
      '<p class="role-empty">Todavía no encontramos una ficha de Operaciones vinculada a tu cuenta. Coordinación debe vincular tu UID al personal asignado.</p>')+
    '<section class="work-claims"><h3>Mis pases remotos</h3><p>La ubicación se comparte una sola vez al pedir el pase. El responsable puede validar aunque esté en otro lugar; hasta entonces queda pendiente.</p><div id="my-remote-attendance-requests" aria-live="polite">Cargando solicitudes…</div></section>'+
    '<section class="work-claims"><h3>Mis trabajos registrados</h3><p>Los trabajos que declares quedan pendientes de revisión. Las horas escritas manualmente no se muestran como asistencia verificada.</p><div id="my-work-claims" aria-live="polite">Cargando tus registros…</div></section>'+
    workClaimDialog(false)+
    '<dialog id="staff-shift-qr-dialog" class="role-dialog" aria-labelledby="staff-shift-qr-title">'+
      '<div class="role-dialog-head"><div><strong id="staff-shift-qr-title">QR para asistencia</strong>'+
      '<p>Preséntalo al coordinador o supervisor autorizado. Es distinto de tu identificación.</p></div>'+
      '<button type="button" data-action="close-shift-qr" aria-label="Cerrar QR de jornada">×</button></div>'+
      '<div id="staff-shift-qr-content"></div></dialog>'+
    '<p class="role-transition">Para asistencia, muestra el QR de la jornada a tu Supervisor o Coordinador. Ellos registran entrada y salida; tú solo agregas observaciones si hacen falta.</p>'+
  '</section>';
}
function scheduleCard(item){
  return '<article class="role-jornada role-schedule-item">'+
    '<div class="role-jornada-head"><div><small>'+esc(roleDate(item.start))+'</small>'+
      '<h3>'+esc(item.title)+'</h3></div>'+
      '<span class="role-time">'+roleTime(item.start)+' – '+roleTime(item.end)+'</span></div>'+
    '<dl class="role-jornada-facts"><div><dt>Sede</dt><dd>'+esc(item.site)+'</dd></div>'+
      '<div><dt>Personal asignado</dt><dd>'+item.staffCount+'</dd></div>'+
      '<div><dt>Coordinador responsable</dt><dd>'+esc(item.responsibleCoordinator||"Por asignar")+'</dd></div>'+
      (item.recordedBy?'<div><dt>Capturó</dt><dd>'+esc(item.recordedBy)+'</dd></div>':'')+
      '<div><dt>Actividades registradas</dt><dd>'+item.activitiesCount+'</dd></div>'+
      '<div><dt>Estado</dt><dd>'+esc(item.status)+'</dd></div></dl>'+fieldShiftLink(item)+'</article>';
}

async function compressAssignmentImage(file){
  if(!file)return "";
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))
    throw Error("Adjunta una captura en JPEG, PNG o WEBP. Audio y PDF no pueden guardarse aquí.");
  if(file.size>12*1024*1024)throw Error("La imagen supera 12 MB. Usa una más pequeña.");
  const source=URL.createObjectURL(file);
  const image=new Image();
  try{
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(Error("No se pudo leer la captura."));
      image.src=source;
    });
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
    if(!ctx)throw Error("El navegador no permite procesar la imagen.");
    for(const max of [1400,1100,900,700,500]){
      const ratio=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.8,.7,.55,.4]){
        const data=canvas.toDataURL("image/jpeg",quality);
        if(data.length<=170000)return data;
      }
    }
    throw Error("La captura sigue siendo muy grande. Recórtala antes de agregarla.");
  }finally{URL.revokeObjectURL(source)}
}
async function showAssignmentHistory(){
  if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))
    throw Error("No tienes permiso para consultar solicitudes.");
  const box=document.getElementById("assignment-history");
  if(!box)return;
  box.textContent="Consultando solicitudes privadas…";
  const requests=collection(db,"agora_ops_assignment_requests");
  const [pending,recent,schedule]=await Promise.all([
    getDocs(query(requests,where("status","==","pendiente"),limit(30))),
    getDocs(query(requests,orderBy("createdAt","desc"),limit(12))),
    getDocFromServer(doc(db,"agora_ops_control","schedule"))
  ]);
  state.roleData={...state.roleData,schedule:schedule.data()};
  const rows=[...new Map([...pending.docs,...recent.docs].map(d=>[d.id,d])).values()];
  rows.sort((a,b)=>Number(b.data().status==="pendiente")-Number(a.data().status==="pendiente")||
    (b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));
  if(!rows.length){box.textContent="Aún no hay solicitudes guardadas.";return}
  box.innerHTML=rows.map(d=>{
    const a=d.data(),image=typeof a.evidenceImage==="string"&&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(a.evidenceImage)?
        '<img class="assignment-history-image" src="'+esc(a.evidenceImage)+
          '" alt="Captura asociada al folio '+esc(a.id)+'">':"";
    const when=a.createdAt?.toDate?.();
    const date=when?new Intl.DateTimeFormat("es-MX",{
      day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"
    }).format(when):"Fecha por confirmar";
    return '<details class="assignment-history-item"><summary><span><strong>'+
      esc(a.project||"Solicitud")+'</strong><small>'+esc(a.requester||"Solicitante")+
      ' · '+esc(a.channel||"Medio")+' · '+esc(a.status||"pendiente")+
      '</small></span><small>'+esc(date)+'</small></summary>'+
      '<div class="assignment-history-body">'+
        '<p><b>Folio:</b> '+esc(a.id)+'</p>'+
        '<p><b>Registrado por UID:</b> '+esc(a.capturedBy)+'</p>'+
        '<p><b>Jornada:</b> '+esc(a.date)+' · '+esc(a.start)+' – '+esc(a.end)+
        ' · '+esc(a.site)+'</p>'+
        '<p><b>Detalle:</b> '+esc(a.description||"Sin observaciones")+'</p>'+
        '<p><b>Origen:</b> '+esc(a.evidenceNote||"No proporcionado")+'</p>'+
        '<p><b>Actividades:</b> '+esc((a.activities||[]).join(" · ")||"Por definir")+'</p>'+
        (a.linkedEventId?'<p><b>Jornada vinculada:</b> '+esc(a.linkedEventId)+'</p>':"")+
        image+
        (a.status==="pendiente"?'<div class="assignment-history-actions">'+
          '<a class="profile-button profile-button-outline" href="'+
            esc(href("../operaciones/?solicitud="+encodeURIComponent(a.id)))+'">Preparar jornada en Operaciones</a>'+
          assignmentEventPicker(a)+
          '<button type="button" class="profile-button profile-button-outline" data-action="confirm-assignment" data-request-id="'+esc(a.id)+'">Vincular jornada publicada</button>'+
          '<button type="button" class="profile-button profile-button-outline" data-action="cancel-assignment" data-request-id="'+esc(a.id)+'">Cancelar solicitud</button>'+
          '</div>':"")+'</div></details>';
  }).join("");
}
function assignmentEventPicker(request){
  const options=assignmentEventOptions(state.roleData?.schedule,request.date);
  const clock=new Intl.DateTimeFormat("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"});
  return '<label>Jornada del cronograma<select data-assignment-event><option value="">Selecciona una jornada…</option>'+
    options.map(event=>'<option value="'+esc(event.id)+'"'+(event.conflictCount?' disabled':'')+'>'+
      esc(clock.format(event.start)+' · '+event.title+' · '+event.staffCount+' asignados'+
       (event.conflictCount?' · '+event.conflictCount+' con empalme':''))+'</option>').join("")+
    '</select></label>'+(options.length?'':'<small>Publica una jornada en Operaciones para esa fecha.</small>');
}
function requestStatusChange(requestId,nextStatus,eventId){
  if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))return;
  if(nextStatus==="confirmada"&&!eventId)return notice("Selecciona una jornada publicada.","error");
  if(nextStatus==="cancelada"&&!confirm("¿Cancelar esta solicitud? Quedará en el historial."))return;
  return run(async()=>{
    const ref=doc(db,"agora_ops_assignment_requests",requestId);
    if(nextStatus==="confirmada"){
      const [request,schedule]=await Promise.all([
        getDocFromServer(ref),getDocFromServer(doc(db,"agora_ops_control","schedule"))
      ]);
      if(request.data()?.status!=="pendiente")throw Error("La solicitud ya fue revisada. Actualiza la lista.");
      const selected=assignmentEventOptions(schedule.data(),request.data().date).find(event=>event.id===eventId);
      if(!selected)throw Error("La jornada ya no está publicada para esa fecha.");
      if(selected.conflictCount)throw Error("Resuelve los empalmes de personal en Operaciones antes de vincular la jornada.");
    }
    await updateDoc(ref,{status:nextStatus,linkedEventId:eventId,
      updatedBy:state.user.uid,updatedAt:serverTimestamp()});
    await showAssignmentHistory();
  },"Solicitud actualizada; se conserva el historial.");
}

function assignmentDialog(){
  const now=new Date();
  const localDate=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  return '<dialog class="role-dialog" id="assignment-dialog" aria-label="Asignaciones de jornada">'+
    '<div class="role-dialog-head"><div><strong>Asignaciones de jornada</strong>'+
      '<p>Guarda el origen de la solicitud y vincúlala después a una jornada publicada.</p></div>'+
      '<button type="button" data-action="close-assignment" aria-label="Cerrar formulario">×</button></div>'+
    '<div class="role-draft-warning" role="note">La solicitud sí se guarda en Firebase de forma privada. No publica ni autoriza automáticamente una jornada.</div>'+
    '<form id="assignment-form" class="role-assignment-form">'+
      '<label>Quién solicita<input name="requester" required maxlength="140" placeholder="Nombre de la persona o cliente"></label>'+
      '<label>Medio de solicitud<select name="channel" required>'+
        REQUEST_CHANNELS.map(ch=>'<option value="'+esc(ch)+'">'+esc(ch)+'</option>').join("")+'</select></label>'+
      '<label>Contacto (opcional)<input name="contact" maxlength="120" placeholder="Correo o teléfono"></label>'+
      '<label>Fecha de recepción<input name="requestedAt" type="datetime-local"></label>'+
      '<label>Proyecto<input name="project" required maxlength="150" placeholder="Proyecto o motivo"></label>'+
      '<label>Sede<input name="site" required maxlength="150" placeholder="Oficina, sucursal o lugar"></label>'+
      '<label>Fecha de jornada<input name="date" type="date" required value="'+localDate+'"></label>'+
      '<label>Inicio<input name="start" type="time" required></label>'+
      '<label>Fin<input name="end" type="time" required></label>'+
      '<label>Personas requeridas<input name="headcount" min="1" max="999" type="number" value="1"></label>'+
      '<label class="role-wide">Descripción<textarea name="description" rows="3" maxlength="600"></textarea></label>'+
      '<div class="role-wide"><div class="role-dialog-subhead"><strong>Actividades de la misma jornada</strong>'+
        '<button type="button" data-action="add-assignment-activity" class="profile-button profile-button-outline">+ Añadir actividad</button></div>'+
        '<div id="assignment-activities" class="role-activity-inputs"></div>'+
        '<p class="role-help">Puedes agregar tantas actividades como necesites, incluso cuando el trabajo ya haya comenzado. Este formulario no registra todavía su ejecución.</p></div>'+
      '<label class="role-wide">Descripción de evidencia recibida<textarea name="evidenceNote" rows="2" maxlength="400" placeholder="Ej.: solicitud por llamada el día… o captura de WhatsApp disponible"></textarea></label>'+
      '<div class="role-wide"><label>Adjuntar captura de solicitud (opcional)<input id="assignment-evidence" name="attachment" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
        '<small class="role-help">La captura se comprime a JPEG y se almacena privada en la solicitud (máximo 170 KB). Audio/PDF siguen sin carga en este formulario; registra la información por escrito.</small></div>'+
      '<div class="role-wide role-dialog-actions"><button type="submit" class="profile-button profile-button-primary">Guardar solicitud</button></div>'+
    '</form>'+
    '<div id="assignment-result" hidden><h3>Solicitud guardada · Pendiente de asignación</h3>'+
      '<textarea id="assignment-preview" rows="12" readonly aria-label="Texto del borrador"></textarea>'+
      '<button type="button" data-action="copy-assignment" class="profile-button profile-button-outline">Copiar texto</button></div>'+
  '</dialog>';
}
function workClaimDialog(review=false){
  if(review)return '<section class="work-claims"><h3>Trabajos pendientes de validación</h3><p>Revisa autorregistros, solicita aclaraciones o valida horas e importe. La persona que declara no puede aprobarse a sí misma.</p><div id="work-claims-review">Cargando registros pendientes…</div></section>';
  const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  return '<dialog class="role-dialog" id="work-claim-dialog" aria-labelledby="work-claim-title"><div class="role-dialog-head"><div><strong id="work-claim-title">Registrar trabajo o asignación</strong><p>Se guardará a tu nombre y quedará pendiente de validación.</p></div><button type="button" data-action="close-work-claim" aria-label="Cerrar">×</button></div><form id="work-claim-form" class="role-assignment-form">'+
    '<label>Situación<select name="recordType" required><option value="proximo">Trabajo próximo</option><option value="en_curso">Trabajo en curso</option><option value="realizado">Trabajo realizado en fecha anterior</option></select></label>'+
    '<label>Proyecto o evento<input name="project" maxlength="150" required></label><label>Cliente (opcional)<input name="client" maxlength="120"></label><label>Sucursal o lugar<input name="site" maxlength="150" required></label><label>Fecha de trabajo<input name="date" type="date" value="'+date+'" required></label>'+
    '<label>Horario previsto · inicio<input name="plannedStart" type="time"></label><label>Horario previsto · fin<input name="plannedEnd" type="time"></label><label>Hora real declarada · entrada<input name="actualStart" type="time"></label><label>Hora real declarada · salida<input name="actualEnd" type="time"></label>'+
    '<label>Quién solicitó el trabajo<input name="requester" maxlength="140" required placeholder="Nombre del coordinador o persona"></label><label>Quién supervisó (opcional)<input name="supervisor" maxlength="140"></label><label>Medio de solicitud<select name="channel" required>'+["WhatsApp","Llamada","Verbal","Correo","Asignación interna","Otro"].map(x=>'<option>'+esc(x)+'</option>').join("")+'</select></label>'+
    '<label>Tarifa acordada (si la conoces)<input name="declaredRate" type="number" min="0.01" step="0.01" placeholder="Si no la sabes, déjala vacía"></label><label>Horas extra declaradas<input name="overtimeHours" type="number" min="0" max="24" step="0.25" value="0"></label><label>Gastos adicionales declarados (MXN)<input name="expenses" type="number" min="0" max="50000" step="0.01" value="0"></label><label class="role-wide">Observaciones (opcional)<textarea name="notes" rows="2" maxlength="500" placeholder="Agrega solo un dato que coordinación deba saber"></textarea></label><label class="role-wide">Evidencia de solicitud (imagen opcional)<input id="work-claim-evidence" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="role-wide role-draft-warning">El registro no crea una asistencia verificada ni aprueba un pago.</div><div class="role-wide role-dialog-actions"><button type="submit" class="profile-button profile-button-primary">Guardar registro</button></div></form></dialog>';
}
async function loadWorkClaims(){
  if(!state.user)return;
  const isStaff=routeSpace==="staff";
  if(!isStaff&&!(["admin","coordinador"].includes(role())&&allowed(routeSpace)))return;
  const target=document.getElementById(isStaff?"my-work-claims":"work-claims-review");
  if(!target)return;
  const q=isStaff?query(collection(db,"agora_ops_work_claims"),where("ownerUid","==",state.user.uid)):query(collection(db,"agora_ops_work_claims"));
  const snap=await getDocs(q);
  const rows=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  if(!rows.length){target.textContent=isStaff?"Aún no has registrado trabajos.":"No hay autorregistros.";return}
  target.innerHTML=rows.slice(0,isStaff?20:60).map(x=>{
    const types={proximo:"Próximo",en_curso:"En curso · provisional declarado",realizado:"Realizado · retrospectivo"};
    const states={pendiente:"Pendiente de validación",aclaracion:"Requiere aclaración",validado:"Validado",rechazado:"Rechazado",cancelado:"Cancelado"};
    const type=types[x.recordType]||"Trabajo",status=states[x.status]||x.status;
    const hours=x.approvedHours??x.declaredHours,rate=x.approvedRate??x.declaredRate;
    const amount=hours!=null?" · Horas "+Number(hours).toFixed(2)+(x.declaredHours!=null&&x.approvedHours==null?" declaradas":" aprobadas")+(rate!=null?" · Importe "+(x.approvedAmount==null?"estimado ":"aprobado ")+Number(x.approvedAmount??(Number(rate)*Number(hours))).toFixed(2)+" MXN":" · Tarifa pendiente de confirmar"):" · Horas pendientes de confirmar";
    let review="";
    if(!isStaff&&["pendiente","aclaracion"].includes(x.status))review='<form class="work-claim-review" data-claim-id="'+esc(x.id)+'"><label>Decisión<select name="status"><option value="validado">Validar</option><option value="aclaracion">Requiere aclaración</option><option value="rechazado">Rechazar</option></select></label><label>Horas aprobadas<input name="approvedHours" type="number" min="0" max="36" step="0.25" value="'+(Number(hours)||"")+'"></label><label>Tarifa aprobada MXN/h<input name="approvedRate" type="number" min="0.01" step="0.01" value="'+(Number(rate)||"")+'"></label><label>Comentario<input name="validationNote" maxlength="400"></label><button class="profile-button profile-button-primary" type="submit">Guardar revisión</button></form>';
    const finish=isStaff&&x.recordType==="en_curso"&&!x.actualEnd?'<form class="work-claim-finish" data-claim-id="'+esc(x.id)+'"><label>Hora final declarada del trabajo<input name="actualEnd" type="time" required></label><button class="profile-button profile-button-outline" type="submit">Completar declaración</button><small>Esto no registra ni verifica tu asistencia.</small></form>':"";
    return '<article class="work-claim-card"><div><strong>'+esc(x.project||"Trabajo")+'</strong><span class="role-time">'+esc(status)+'</span></div><p>'+esc(x.date||"")+' · '+esc(type)+' · '+esc(x.site||"")+'</p><p>Solicitó: '+esc(x.requester||"No indicado")+' · '+esc(x.channel||"")+'</p>'+(x.notes?'<p>Observaciones: '+esc(x.notes)+'</p>':"")+esc(amount)+(Number(x.overtimeHours)>0?'<p>Horas extra declaradas: '+Number(x.overtimeHours).toFixed(2)+'</p>':"")+(Number(x.expenses)>0?'<p>Gastos declarados: $'+Number(x.expenses).toFixed(2)+' MXN (pendientes de revisión)</p>':"")+(x.validationNote?'<p>Revisión: '+esc(x.validationNote)+'</p>':"")+(x.evidenceImage?'<img class="assignment-history-image" src="'+esc(x.evidenceImage)+'" alt="Evidencia privada del trabajo '+esc(x.id)+'">':"")+finish+review+'</article>';
  }).join("");
}
async function workClaimStableId(uid,v){
  const tuple=[uid,clean(v.date),clean(v.project).toLowerCase(),clean(v.site).toLowerCase(),
    clean(v.actualStart)||clean(v.plannedStart),clean(v.actualEnd)||clean(v.plannedEnd)]
    .join("|");
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(tuple));
  return "claim_"+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,48);
}
function scheduleList(list,expand=false){
  if(!list.length)return '<p class="role-empty">No hay jornadas que coincidan en el cronograma.</p>';
  const first=expand?list:list.slice(0,6);
  return '<div class="role-jornada-list">'+first.map(scheduleCard).join("")+'</div>'+
    (!expand&&list.length>6?'<details class="role-more-jornadas"><summary>Ver otras jornadas ('+
      (list.length-6)+')</summary><div class="role-jornada-list">'+list.slice(6).map(scheduleCard).join("")+'</div></details>':"");
}
function coordinationOperationsSpace(admin=false){
  const edit=["admin","coordinador"].includes(role());
  const list=edit?coordinationJornadas(state.roleData?.schedule,new Date(),60):[];
  const totals=operationTotals(list,new Date());
  return '<section class="role-module" aria-label="Operaciones de '+(admin?"Administración":"Agencia")+'">'+
    '<header class="role-module-heading"><div><h2>'+(admin?"Supervisión de jornadas":"Coordinación de jornadas")+'</h2>'+
      '<p>'+(admin?"Vista administrativa de jornadas y asignaciones registradas.":
        "Solicitudes, asignaciones y actividades de la operación.")+'</p></div>'+
      (edit?'<button type="button" data-action="new-assignment" class="profile-button profile-button-primary">+ Asignaciones de jornada</button>':"")+
    '</header>'+
    roleNotice()+
    (edit?'<div class="role-metrics"><div><small>Jornadas hoy</small><strong>'+totals.today+'</strong></div>'+
      '<div><small>Próximas jornadas</small><strong>'+totals.upcoming+'</strong></div>'+
      '<div><small>Personal asignado (turnos)</small><strong>'+totals.assignments+'</strong></div></div>'+
      '<label>Buscar por coordinador o proyecto <input id="coordination-search" type="search" maxlength="140"></label>'+
      '<div id="coordination-schedule" aria-live="polite">'+scheduleList(list)+'</div>'+
      '<div class="role-legacy-links"><a class="profile-button profile-button-primary" href="'+esc(href("escanear/"))+'">Pasar lista · QR o manual</a>'+
      '<button type="button" data-action="view-attendance" class="profile-button profile-button-outline">Pase de lista</button>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("?calendario=1#calendario"))+'">Abrir calendario de operaciones</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("../operaciones/control-jornadas.html"))+'">Control de asistencia</a></div>'+
      '<p class="role-transition">El cronograma original continúa como fuente oficial. Los trabajos autorregistrados se revisan aparte y no alteran marcajes existentes.</p>'+
      '<section class="work-claims"><div class="assignment-history-header"><h3>Solicitudes de jornada</h3>'+
        '<button type="button" class="profile-button profile-button-outline" data-action="load-assignment-requests">Actualizar solicitudes</button></div>'+
        '<div id="assignment-history" class="assignment-history" aria-live="polite"></div></section>'+
      '<nav class="role-legacy-links" aria-label="Herramientas de la agencia">'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("campo/"))+'">Protocolos y Campo</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("../"))+'">Compras y producción</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("../archivos/"))+'">Archivos y evidencias</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("../recursos/"))+'">'+
          (admin?"Recursos y Finanzas":"Solicitudes de recursos")+'</a>'+
        (admin?'<a class="profile-button profile-button-outline" href="'+esc(href("../recursos/?vista=obligaciones"))+'">Historial de obligaciones</a>':'')+
        '</nav>'+
      workClaimDialog(true)+
      assignmentDialog()+
      '<dialog id="attendance-roster-dialog" class="role-dialog" aria-labelledby="attendance-roster-title">'+
        '<div class="role-dialog-head"><div><strong id="attendance-roster-title">Pase de lista</strong>'+
          '<p>Entradas y salidas oficiales por jornada, actualizadas desde Firebase.</p></div>'+
          '<button type="button" data-action="close-attendance-roster" aria-label="Cerrar pase de lista">×</button></div>'+
        '<div id="attendance-roster-content"></div></dialog>':
      '<p class="role-empty">Esta cuenta tiene permisos de consulta, no de coordinación. No puede crear ni modificar asignaciones.</p>')+
  '</section>';
}
function emptySpace(){
  const meta=PATH_SPACES[routeSpace];
  const body=routeSpace==="staff"?staffOperationsSpace():
    coordinationOperationsSpace(routeSpace==="administrador");
  app.innerHTML='<section class="role-space-page">'+
    '<a class="secure-back" href="'+esc(ROOT.href)+'">← Volver a Mi perfil</a>'+
    '<div class="role-space-heading">'+
      '<img src="'+esc(iconSrc(meta.icon))+'" alt="" width="90" height="90">'+
      '<div><div class="profile-kicker">ÁGORA · Operaciones</div><h1>'+esc(meta.title)+'</h1></div></div>'+
    body+'</section>';
  const search=document.getElementById("coordination-search");
  if(search)search.addEventListener("input",()=>{
    const list=coordinationJornadas(state.roleData?.schedule,new Date(),60);
    document.getElementById("coordination-schedule").innerHTML=scheduleList(
      filterCoordinatorAgenda(list,search.value),Boolean(clean(search.value)));
  });
  const history=document.getElementById("assignment-history");
  if(history)showAssignmentHistory().catch(e=>{history.textContent=errorText(e)});
  loadWorkClaims().catch(e=>{console.error(e);notice(errorText(e),"error")});
  if(routeSpace==="staff"&&state.user)loadOwnRemoteRequests(db,state.user.uid,document.getElementById("my-remote-attendance-requests"));
}

function render(){
  document.body.classList.toggle("login-mode",!state.user&&!routeSpace&&!routePrivate);
  if(!state.user){
    if(routeSpace||routePrivate)routeDenied(true);
    else renderLogin();
    return;
  }
  if(!state.identity){renderLoading();return}
  if(routeSpace){
    if(allowed(routeSpace))emptySpace();
    else routeDenied();
    return;
  }
  if(routePrivate){
    if(verifiedId())renderPrivateSection();
    else routeDenied();
    return;
  }
  if(!verifiedId()){renderRegistration();return}
  profile();
}
async function register(d){
  if(state.identity?.link||state.identity?.registration)
    throw Error("La cuenta ya tiene un ID o una solicitud. No dupliques tu identidad.");
  const fullName=clean(d.get("name")).replace(/\s+/g," ").slice(0,140);
  const phone=clean(d.get("phone")).slice(0,30);
  const position=clean(d.get("job"));
  if(fullName.length<3||!JOBS.includes(position)||d.get("privacy")!=="on")
    throw Error("Revisa tu nombre, puesto y aceptación del aviso de privacidad.");
  const ref=doc(db,"agora_identity_registrations",state.user.uid);
  const prior=await getDoc(ref);
  if(prior.exists())throw Error("Ya existe una solicitud de ID.");
  await setDoc(ref,{
    uid:state.user.uid,email:clean(state.user.email).toLowerCase(),
    displayName:fullName,telephone:phone,requestedJobTitle:position,status:"pending",
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
app.addEventListener("click",event=>{
  const fieldLink=event.target.closest("[data-field-shift]");
  if(fieldLink&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
    try{sessionStorage.setItem("agora-campo-jornada",fieldLink.dataset.fieldShift)}
    catch{ /* Campo puede recibir la referencia manualmente. */ }
  }
  const target=event.target.closest("[data-action]");
  if(!target)return;
  const task=target.dataset.action;
  if(task==="new-work-claim"){
    if(!allowed("staff")||!state.user||!state.roleData?.staff?.personId)return notice("Tu cuenta necesita una ficha de Operaciones vinculada antes de registrar trabajo.","error");
    const dlg=document.getElementById("work-claim-dialog");
    if(dlg?.showModal)dlg.showModal();else dlg?.setAttribute("open","");
    return;
  }
  if(task==="remote-attendance-request"){
    if(!allowed("staff")||!state.user||!state.roleData?.staff?.personId)return notice("Esta acción requiere una ficha Staff vinculada.","error");
    const eventId=clean(target.dataset.eventId),shift=ownJornadas(state.roleData.staff,new Date(),100).find(x=>x.key===eventId);
    if(!shift)return notice("No se encontró tu jornada asignada.","error");
    const action=target.dataset.attendanceAction;
    if(!["entrada","salida"].includes(action))return notice("Selecciona entrada o salida.","error");
    const event=state.roleData.staff.events?.find(item=>item.id===eventId);
    const shiftTime=action==="entrada"?event?.start:event?.end;
    if(!confirm("Se compartirá tu ubicación GPS una sola vez con el supervisor y coordinación de esta jornada para solicitar la "+action+". La ubicación no valida automáticamente tu asistencia. ¿Continuar?"))return;
    return run(async()=>{
      const result=await requestRemoteAttendance({db,uid:state.user.uid,personId:state.roleData.staff.personId,
        personName:name(),eventId,eventTitle:shift.title,site:shift.site,action,shiftTime});
      if(result)await loadOwnRemoteRequests(db,state.user.uid,document.getElementById("my-remote-attendance-requests"));
      return result;
    },result=>result?"Solicitud enviada; espera la validación del responsable.":"");
  }
  if(task==="close-work-claim"){
    const dlg=document.getElementById("work-claim-dialog");
    if(dlg?.close)dlg.close();else dlg?.removeAttribute("open");
    return;
  }
  if(task==="open-tasks"){
    if(!allowed("staff")||!state.user||!state.roleData?.staff)return;
    const eventId=clean(target.dataset.eventId);
    const section=app.querySelector('[data-task-for="'+CSS.escape(eventId)+'"]');
    if(!section)return;
    section.hidden=!section.hidden;
    if(section.hidden)return;
    renderStaffTasks({
      target:section,eventId,personId:state.roleData.staff.personId,
      uid:state.user.uid
    });
    return;
  }
  if(task==="show-shift-qr"){
    if(!allowed("staff")||!state.user||!state.roleData?.staff)return;
    const eventId=clean(target.dataset.eventId);
    const shifts=ownJornadas(state.roleData.staff,new Date(),100);
    const shift=shifts.find(x=>x.key===eventId);
    const dialog=document.getElementById("staff-shift-qr-dialog");
    const container=document.getElementById("staff-shift-qr-content");
    if(!shift||!dialog||!container)return notice("Jornada no disponible.","error");
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute("open","");
    container.innerHTML='<p class="profile-muted">Generando QR de jornada…</p>';
    readStaffTasks(eventId,state.user.uid).catch(()=>[]).then(tasks=>{
      if(!dialog.open||state.user?.uid!==auth.currentUser?.uid)return;
      const activities=[...shift.activities,...tasks.map(a=>({
        key:a.id,name:a.name,status:a.status
      }))];
      showShiftQr({target:container,uid:state.user.uid,
        personId:state.roleData.staff.personId,shift:{...shift,activities}});
    });
    return;
  }
  if(task==="close-shift-qr"){
    const dialog=document.getElementById("staff-shift-qr-dialog");
    if(dialog?.close)dialog.close();else dialog?.removeAttribute("open");
    return;
  }
  if(task==="view-attendance"){
    if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))return;
    const dialog=document.getElementById("attendance-roster-dialog");
    const target=document.getElementById("attendance-roster-content");
    if(!dialog||!target)return;
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute("open","");
    mountRoster({db,target,schedule:state.roleData?.schedule});
    return;
  }
  if(task==="close-attendance-roster"){
    const dialog=document.getElementById("attendance-roster-dialog");
    if(dialog?.close)dialog.close();else dialog?.removeAttribute("open");
    return;
  }
  if(task==="load-assignment-requests"){
    if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))return;
    return run(showAssignmentHistory);
  }
  if(task==="confirm-assignment"||task==="cancel-assignment"){
    const eventId=target.closest(".assignment-history-actions")?.querySelector("[data-assignment-event]")?.value||"";
    return requestStatusChange(clean(target.dataset.requestId),
      task==="confirm-assignment"?"confirmada":"cancelada",task==="confirm-assignment"?eventId:"");
  }
  if(task==="new-assignment"){
    if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))return;
    const dlg=document.getElementById("assignment-dialog");
    if(dlg?.showModal)dlg.showModal();else dlg?.setAttribute("open","");
    return;
  }
  if(task==="close-assignment"){
    const dlg=document.getElementById("assignment-dialog");
    if(dlg?.close)dlg.close();else dlg?.removeAttribute("open");
    return;
  }
  if(task==="add-assignment-activity"){
    const list=document.getElementById("assignment-activities");
    if(!list)return;
    const row=document.createElement("div");
    row.className="role-activity-row";
    row.innerHTML='<label>Actividad<input type="text" name="activity[]" maxlength="200" placeholder="Otra actividad dentro de esta jornada"></label>'+
      '<button type="button" data-action="remove-assignment-activity" aria-label="Quitar actividad">×</button>';
    list.append(row);row.querySelector("input")?.focus();
    return;
  }
  if(task==="remove-assignment-activity"){
    target.closest(".role-activity-row")?.remove();return;
  }
  if(task==="copy-assignment"){
    const value=document.getElementById("assignment-preview")?.value;
    if(value)return run(async()=>{await navigator.clipboard.writeText(value)},"Borrador copiado. Aún no está guardado en ÁGORA.");
    return;
  }
  if(task==="copy-activity-draft"){
    const value=target.closest(".role-proposal-form")?.querySelector(".role-draft-preview")?.value;
    if(value)return run(async()=>{await navigator.clipboard.writeText(value)},"Propuesta copiada. Coordinación debe registrarla formalmente.");
    return;
  }
  if(task==="google")return run(google);
  if(task==="login"||task==="request"){
    state.page=task;render();return;
  }
  if(task==="retry")return run(refresh);
  if(task==="open-credential"){
    const modal=document.getElementById("credential-dialog");
    if(!modal)return;
    if(modal.showModal)modal.showModal();else modal.setAttribute("open","");
    drawQr();prepareProfilePhotos();return;
  }
  if(task==="close-credential"){
    const modal=document.getElementById("credential-dialog");
    if(modal?.close)modal.close();else modal?.removeAttribute("open");
    return;
  }
  if(task==="share-credential"){
    const url=credentialLink();
    if(!url)return notice("Esta credencial todavía no tiene código QR.","error");
    return run(async()=>{
      if(navigator.share){
        try{await navigator.share({title:"Credencial digital ÁGORA",url});return}
        catch(e){if(e.name==="AbortError")return}
      }
      await navigator.clipboard.writeText(url);
    },"Enlace de verificación listo para compartir.");
  }
});
app.addEventListener("submit",event=>{
  const form=event.target;
  if(!(form instanceof HTMLFormElement))return;
  event.preventDefault();
  if(form.id==="qa-login"){
    const values=new FormData(form);
    const qaEmail=clean(values.get("email")).toLowerCase();
    const password=String(values.get("password")||"");
    if(!QA_LOGIN_USERS.has(qaEmail)||!password)return notice("Selecciona una cuenta QA y escribe su contraseña.","error");
    return run(async()=>{
      try{
        const credential=await signInWithEmailAndPassword(auth,qaEmail,password);
        if(credential.user.email?.toLowerCase()!==qaEmail){await signOut(auth);throw Error("Cuenta QA no válida.");}
        if(!credential.user.emailVerified){await signOut(auth);throw Object.assign(Error("Correo no verificado."),{code:"qa/email-not-verified"});}
      }finally{form.querySelector('[name="password"]').value="";}
    },"Acceso autorizado.");
  }
  if(form.id==="request-id")return run(()=>register(new FormData(form)));
  if(form.id==="assignment-form"){
    if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))
      return notice("No tienes permiso de coordinación.","error");
    return run(async()=>{
      const data=Object.fromEntries(new FormData(form));
      data.activities=[...form.querySelectorAll('input[name="activity[]"]')].map(x=>x.value);
      data.capturedBy=name()+" · "+state.user.uid;
      const draft=validateAssignmentDraft(data);
      const file=form.querySelector("#assignment-evidence")?.files?.[0];
      const evidenceImage=await compressAssignmentImage(file);
      const requestId=crypto.randomUUID();
      await setDoc(doc(db,"agora_ops_assignment_requests",requestId),{
        ...draft,id:requestId,capturedBy:state.user.uid,
        evidenceImage,status:"pendiente",linkedEventId:"",
        createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
        updatedBy:state.user.uid
      });
      const preview=document.getElementById("assignment-preview");
      if(preview)preview.value=assignmentDraftText(draft)
        .replace("BORRADOR DE SOLICITUD (NO REGISTRADO)",
          "SOLICITUD REGISTRADA · Folio "+requestId)
        .replace("Estado: BORRADOR. No hay autorización, asignación ni archivo guardado en Firebase.",
          "Estado: REGISTRADA EN FIREBASE. PENDIENTE DE ASIGNACIÓN.");
      const panel=document.getElementById("assignment-result");
      if(panel)panel.hidden=false;
      form.reset();
      form.querySelector("#assignment-activities")?.replaceChildren();
      await showAssignmentHistory();
    },"Solicitud guardada con folio; pendiente de asignación.");
  }
  if(form.id==="work-claim-form"){
    if(!allowed("staff")||!state.user||!state.roleData?.staff?.personId)
      return notice("La cuenta no tiene una ficha de Operaciones vinculada.","error");
    return run(async()=>{
      const v=Object.fromEntries(new FormData(form)),recordType=clean(v.recordType);
      if(!["proximo","en_curso","realizado"].includes(recordType))throw Error("Selecciona el tipo de trabajo.");
      if(recordType==="proximo"&&(!v.plannedStart||!v.plannedEnd))throw Error("Indica el horario previsto para el trabajo próximo.");
      if(recordType==="realizado"&&(!v.actualStart||!v.actualEnd))throw Error("Indica el horario real declarado del trabajo realizado.");
      const rate=String(v.declaredRate||"").trim()?Number(v.declaredRate):null;
      const expenses=Number(v.expenses||0),overtimeHours=Number(v.overtimeHours||0);
      if(rate!==null&&(!Number.isFinite(rate)||rate<=0||rate>100000))throw Error("La tarifa debe ser mayor a cero o quedar pendiente de confirmar.");
      if(!Number.isFinite(expenses)||expenses<0||expenses>50000||!Number.isFinite(overtimeHours)||overtimeHours<0||overtimeHours>24)throw Error("Revisa gastos adicionales y horas extra.");
      if(recordType==="en_curso"&&!v.actualStart){const now=new Date();v.actualStart=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");}
      const evidenceImage=await compressAssignmentImage(form.querySelector("#work-claim-evidence")?.files?.[0]);
      const ownerUid=state.user.uid,actorName=name(),claimId=await workClaimStableId(ownerUid,v);
      const priorClaims=await getDocs(query(collection(db,"agora_ops_work_claims"),where("ownerUid","==",ownerUid)));
      if(priorClaims.docs.some(item=>item.id===claimId))
        throw Error("Ya existe un registro equivalente de ese turno. Revísalo en Mis trabajos para evitar duplicar horas.");
      const payload={id:claimId,ownerUid,personId:state.roleData.staff.personId,personName:actorName,recordType,
        project:clean(v.project).slice(0,150),client:clean(v.client).slice(0,120),site:clean(v.site).slice(0,150),date:clean(v.date),activityType:"",
        plannedStart:clean(v.plannedStart),plannedEnd:clean(v.plannedEnd),actualStart:clean(v.actualStart),actualEnd:clean(v.actualEnd),
        description:"",requester:clean(v.requester).slice(0,140),supervisor:clean(v.supervisor).slice(0,140),channel:clean(v.channel),
        declaredRate:rate,overtimeHours,expenses,notes:clean(v.notes).slice(0,500),evidenceImage,status:"pendiente",validationNote:"",declaredHours:null,approvedHours:null,approvedRate:null,approvedAmount:null,
        createdBy:ownerUid,createdAt:serverTimestamp(),updatedBy:ownerUid,updatedAt:serverTimestamp(),lastHistoryId:"created"};
      if(payload.actualStart&&payload.actualEnd){
        const [sh,sm]=payload.actualStart.split(":").map(Number),[eh,em]=payload.actualEnd.split(":").map(Number);
        let mins=(eh*60+em)-(sh*60+sm);if(mins<0)mins+=1440;
        if(mins<=0||mins>36*60)throw Error("Revisa las horas reales declaradas.");
        payload.declaredHours=Math.round(mins/60*100)/100;
      }
      const batch=writeBatch(db);
      batch.set(doc(db,"agora_ops_work_claims",claimId),payload);
      batch.set(doc(db,"agora_ops_work_claims",claimId,"history","created"),{claimId,action:"creado",actorUid:ownerUid,actorName,at:serverTimestamp(),note:"Registro declarado por la persona trabajadora.",ownerUid});
      await batch.commit();
      form.reset();
      const dialog=document.getElementById("work-claim-dialog");if(dialog?.close)dialog.close();else dialog?.removeAttribute("open");
      await loadWorkClaims();
    },"Trabajo guardado con folio y pendiente de validación.");
  }
  if(form.matches(".work-claim-finish")){
    if(!allowed("staff")||!state.user)return notice("No tienes permiso para terminar este registro.","error");
    return run(async()=>{
      const claimId=clean(form.dataset.claimId),end=clean(new FormData(form).get("actualEnd"));
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(end))throw Error("Indica una hora de salida válida.");
      const ref=doc(db,"agora_ops_work_claims",claimId),current=await getDoc(ref);
      if(!current.exists()||current.data().ownerUid!==state.user.uid||current.data().recordType!=="en_curso"||current.data().actualEnd)throw Error("Este trabajo ya no está en curso.");
      const start=current.data().actualStart,[sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number);
      let minutes=eh*60+em-(sh*60+sm);if(minutes<=0)minutes+=1440;
      const hours=Math.round(minutes/60*100)/100;if(hours<=0||hours>24)throw Error("El horario declarado supera 24 horas.");
      const historyId=crypto.randomUUID(),batch=writeBatch(db);
      batch.update(ref,{actualEnd:end,declaredHours:hours,updatedBy:state.user.uid,updatedAt:serverTimestamp(),lastHistoryId:historyId});
      batch.set(doc(db,"agora_ops_work_claims",claimId,"history",historyId),{claimId,action:"finalizada",actorUid:state.user.uid,actorName:name(),at:serverTimestamp(),note:"La persona declaró la hora de salida.",eventTime:end,ownerUid:state.user.uid});
      await batch.commit();await loadWorkClaims();
    },"Salida declarada guardada; sigue pendiente de validación.");
  }
  if(form.matches(".work-claim-review")){
    if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))return notice("No tienes permiso para revisar trabajos.","error");
    return run(async()=>{
      const claimId=clean(form.dataset.claimId),values=Object.fromEntries(new FormData(form));
      const next=clean(values.status),hours=Number(values.approvedHours||0),rate=String(values.approvedRate||"").trim()?Number(values.approvedRate):null,note=clean(values.validationNote).slice(0,400);
      if(!["validado","aclaracion","rechazado"].includes(next))throw Error("Selecciona una decisión válida.");
      if(next==="validado"&&(!Number.isFinite(hours)||hours<=0||hours>36))throw Error("Indica las horas aprobadas.");
      if(rate!==null&&(!Number.isFinite(rate)||rate<=0||rate>100000))throw Error("La tarifa aprobada debe ser mayor a cero.");
      const claimRef=doc(db,"agora_ops_work_claims",claimId),historyId=crypto.randomUUID(),batch=writeBatch(db);
      const current=await getDoc(claimRef);if(!current.exists())throw Error("El trabajo ya no está disponible.");
      batch.update(claimRef,{status:next,validationNote:note,approvedHours:next==="validado"?hours:null,approvedRate:next==="validado"?rate:null,approvedAmount:next==="validado"&&rate!==null?Math.round(hours*rate*100)/100:null,updatedBy:state.user.uid,updatedAt:serverTimestamp(),lastHistoryId:historyId});
      batch.set(doc(db,"agora_ops_work_claims",claimId,"history",historyId),{claimId,action:next,actorUid:state.user.uid,actorName:name(),at:serverTimestamp(),note,ownerUid:current.data().ownerUid});
      await batch.commit();await loadWorkClaims();
    },"Revisión guardada. Aprobación laboral y pago conservan estados separados.");
  }
  if(form.hasAttribute("data-draft-activity")){
    const formData=new FormData(form);
    const title=clean(formData.get("activity")).slice(0,200);
    if(!title)return notice("Escribe la actividad adicional.","error");
    const eventId=clean(form.dataset.draftActivity);
    const items=ownJornadas(state.roleData?.staff,new Date(),100);
    const own=items.find(x=>x.key===eventId);
    if(!own)return notice("La jornada ya no está en tus asignaciones.","error");
    const summary=[
      "PROPUESTA DE ACTIVIDAD ADICIONAL · AÚN NO REGISTRADA",
      "ID Dejavú: "+id(),"Colaborador: "+name(),
      "Jornada: "+own.title,"Fecha: "+roleDate(own.start),
      "Actividad: "+title,
      "Observaciones: "+clean(formData.get("note")).slice(0,400),
      "Solicito que coordinación incorpore esta actividad a mi jornada."
    ].join("\n");
    const output=form.querySelector(".role-draft-preview");
    const copy=form.querySelector('[data-action="copy-activity-draft"]');
    if(output){output.value=summary;output.hidden=false}
    if(copy)copy.hidden=false;
    notice("Propuesta lista para copiar. No está guardada en Firebase.","ok");
    return;
  }

  if(form.id==="private-profile-form"){
    const values=Object.fromEntries(new FormData(form));
    return run(async()=>{
      if(!verifiedId()||!state.user)throw Error("Se requiere una sesión acreditada.");
      await saveProfile(state.user,values);
      await refresh();
    },"Datos privados guardados en tu expediente.");
  }
  if(form.id==="private-financial-form"){
    if(state.privateData?.financial?.lockedByRH===true)
      return notice("Los datos fiscales están bloqueados por RH.","error");
    const values=Object.fromEntries(new FormData(form));
    return run(async()=>{
      if(!verifiedId()||!state.user)throw Error("Se requiere una sesión acreditada.");
      await saveFinancial(state.user,values);
      await refresh();
    },"Datos fiscales guardados en tu expediente.");
  }
});
logoutButton.addEventListener("click",()=>run(async()=>{
  state.identity=null;state.user=null;state.page="login";state.epoch++;
  await signOut(auth);
},"Sesión cerrada."));
onAuthStateChanged(auth,async user=>{
  state.user=user;
  await refresh();
});
