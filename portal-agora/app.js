import {auth,db} from "./firebase.js";
import {
  onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithRedirect,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {doc,getDoc,getDocs,collection,query,orderBy,limit,setDoc,updateDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {saveProfile,saveFinancial} from "../identidad/firebase-identity.js";
import {projectTodayAssignments} from "../identidad/domain.mjs";
import {ownJornadas,coordinationJornadas,operationTotals,validateAssignmentDraft,assignmentDraftText,REQUEST_CHANNELS} from "./roles-operacion.mjs";
import {showShiftQr} from "./staff-shift-qr.js";
import {renderStaffTasks,readStaffTasks} from "./staff-activities.js";
import {mountRoster} from "./attendance-roster.js";

// Una sola identidad Firebase para todas las vistas. Sin módulos operativos.
const ROOT=new URL("./",import.meta.url);
const ADMIN_EMAIL="admi.agora@gmail.com";
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
    content+'<p class="profile-muted">No se emitirá automáticamente un ID nuevo.</p></section>';
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
function profile(){
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
    '<section class="profile-private-links" aria-labelledby="own-sections-heading">'+
      '<div class="profile-section-top"><h2 id="own-sections-heading">Mi información</h2>'+
        '<p>Consulta tus actividades y expediente sin salir de ÁGORA.</p></div>'+
      '<div class="profile-private-grid">'+
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
    '<button type="button" class="profile-button profile-button-primary" data-action="show-shift-qr" data-event-id="'+esc(item.key)+'">Mostrar QR de jornada / actividad</button>'+
    '<div class="attendance-task-container">'+
      '<button type="button" class="profile-button profile-button-outline" data-action="open-tasks" data-event-id="'+esc(item.key)+'">Mis actividades · Agregar o marcar</button>'+
      '<div class="attendance-task-content" data-task-for="'+esc(item.key)+'" hidden></div>'+
    '</div>'+
    '<details class="role-add-activity"><summary>+ Proponer otra actividad en esta jornada</summary>'+
      '<form data-draft-activity="'+esc(item.key)+'" class="role-proposal-form">'+
        '<label>Actividad adicional<input name="activity" required maxlength="200" placeholder="¿Qué otra actividad realizarás?"></label>'+
        '<label>Observación (opcional)<textarea name="note" rows="2" maxlength="400"></textarea></label>'+
        '<button class="profile-button profile-button-outline" type="submit">Preparar mensaje</button>'+
        '<p class="role-draft-warning">Este mensaje aún no queda guardado en Firebase. Puedes copiarlo para enviarlo a coordinación.</p>'+
        '<textarea class="role-draft-preview" aria-label="Propuesta para coordinación" rows="5" readonly hidden></textarea>'+
        '<button type="button" data-action="copy-activity-draft" class="profile-button profile-button-outline" hidden>Copiar propuesta</button>'+
      '</form></details>'+
    '</article>';
}
function staffOperationsSpace(){
  const staff=state.roleData?.staff;
  const assigned=ownJornadas(staff,new Date(),35);
  return '<section class="role-module" aria-label="Mis jornadas y actividades">'+
    '<header class="role-module-heading"><div><h2>Mis jornadas</h2>'+
      '<p>Una jornada puede incluir varias actividades. Consulta tus asignaciones personales.</p></div>'+
      '<div class="role-space-actions">'+
        '<a class="profile-button profile-button-primary" href="'+esc(href("mi-operacion/"))+'">Mi operación</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("escanear/"))+'">Pasar lista (supervisores)</a></div></header>'+
    roleNotice()+
    (staff?assigned.length?'<div class="role-jornada-list">'+assigned.slice(0,3).map(staffJornadaCard).join("")+'</div>'+
      (assigned.length>3?'<details class="role-more-jornadas"><summary>Ver otras jornadas ('+(assigned.length-3)+')</summary><div class="role-jornada-list">'+assigned.slice(3).map(staffJornadaCard).join("")+'</div></details>':""):
      '<p class="role-empty">No hay jornadas vigentes o próximas en tu ficha personal.</p>':
      '<p class="role-empty">Todavía no encontramos una ficha de Operaciones vinculada a tu cuenta. Coordinación debe vincular tu UID al personal asignado.</p>')+
    '<dialog id="staff-shift-qr-dialog" class="role-dialog" aria-labelledby="staff-shift-qr-title">'+
      '<div class="role-dialog-head"><div><strong id="staff-shift-qr-title">QR de jornada / actividad</strong>'+
      '<p>Preséntalo al coordinador o supervisor autorizado. Es distinto de tu identificación.</p></div>'+
      '<button type="button" data-action="close-shift-qr" aria-label="Cerrar QR de jornada">×</button></div>'+
      '<div id="staff-shift-qr-content"></div></dialog>'+
    '<div class="role-legacy-links"><a class="profile-button profile-button-outline" href="'+esc(href("../operaciones/visor.html"))+'" target="_blank" rel="noopener noreferrer">Registrar entrada / salida · sistema actual ↗</a></div>'+
    '<p class="role-transition">El marcaje oficial sigue en Jornadas mientras se integra en esta pantalla. Se conserva tu historial.</p>'+
  '</section>';
}
function scheduleCard(item){
  return '<article class="role-jornada role-schedule-item">'+
    '<div class="role-jornada-head"><div><small>'+esc(roleDate(item.start))+'</small>'+
      '<h3>'+esc(item.title)+'</h3></div>'+
      '<span class="role-time">'+roleTime(item.start)+' – '+roleTime(item.end)+'</span></div>'+
    '<dl class="role-jornada-facts"><div><dt>Sede</dt><dd>'+esc(item.site)+'</dd></div>'+
      '<div><dt>Personal asignado</dt><dd>'+item.staffCount+'</dd></div>'+
      '<div><dt>Actividades registradas</dt><dd>'+item.activitiesCount+'</dd></div>'+
      '<div><dt>Estado</dt><dd>'+esc(item.status)+'</dd></div></dl></article>';
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
  const snaps=await getDocs(query(
    collection(db,"agora_ops_assignment_requests"),orderBy("createdAt","desc"),limit(12)
  ));
  if(!snaps.size){box.textContent="Aún no hay solicitudes guardadas.";return}
  box.innerHTML=snaps.docs.map(d=>{
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
          '<button type="button" class="profile-button profile-button-outline" data-action="confirm-assignment" data-request-id="'+esc(a.id)+'">Vincular jornada publicada</button>'+
          '<button type="button" class="profile-button profile-button-outline" data-action="cancel-assignment" data-request-id="'+esc(a.id)+'">Cancelar solicitud</button>'+
          '</div>':"")+'</div></details>';
  }).join("");
}
function requestStatusChange(requestId,nextStatus){
  if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))return;
  const schedule=state.roleData?.schedule?.payload?.events||[];
  let eventId="";
  if(nextStatus==="confirmada"){
    eventId=clean(prompt("Escribe el ID de la jornada publicada en Operaciones:",""));
    if(!eventId)return;
    if(!schedule.some(e=>String(e.id)===eventId&&e.status!=="cancelado"&&e.status!=="borrador"))
      return notice("La jornada no existe o no está publicada. Primero regístrala en Operaciones.","error");
  }else if(!confirm("¿Cancelar esta solicitud? Quedará en el historial."))return;
  return run(async()=>{
    await updateDoc(doc(db,"agora_ops_assignment_requests",requestId),{
      status:nextStatus,linkedEventId:eventId,
      updatedBy:state.user.uid,updatedAt:serverTimestamp()
    });
    await showAssignmentHistory();
  },"Solicitud actualizada; se conserva el historial.");
}

function assignmentDialog(){
  const now=new Date();
  const localDate=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  return '<dialog class="role-dialog" id="assignment-dialog" aria-label="Asignaciones de jornada">'+
    '<div class="role-dialog-head"><div><strong>Asignaciones de jornada</strong>'+
      '<p>Registra la solicitud como borrador previo a la autorización.</p></div>'+
      '<button type="button" data-action="close-assignment" aria-label="Cerrar formulario">×</button></div>'+
    '<div class="role-draft-warning" role="note">Todavía no se guardan solicitudes ni evidencias en Firebase. Este borrador puede copiarse, pero no publica jornadas ni asigna personal.</div>'+
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
      '<div class="role-wide"><label>Adjuntar captura, correo o audio <input type="file" disabled aria-disabled="true"></label>'+
        '<small class="role-help">La carga privada de archivos se habilitará cuando existan permisos de Storage validados. No se publicarán archivos en enlaces abiertos.</small></div>'+
      '<div class="role-wide role-dialog-actions"><button type="submit" class="profile-button profile-button-primary">Preparar borrador</button></div>'+
    '</form>'+
    '<div id="assignment-result" hidden><h3>Solicitud preparada · No guardada</h3>'+
      '<textarea id="assignment-preview" rows="12" readonly aria-label="Texto del borrador"></textarea>'+
      '<button type="button" data-action="copy-assignment" class="profile-button profile-button-outline">Copiar texto</button></div>'+
  '</dialog>';
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
      (list.length?'<div class="role-jornada-list">'+list.slice(0,6).map(scheduleCard).join("")+'</div>'+
        (list.length>6?'<details class="role-more-jornadas"><summary>Ver otras jornadas ('+(list.length-6)+')</summary><div class="role-jornada-list">'+list.slice(6).map(scheduleCard).join("")+'</div></details>':""):
       '<p class="role-empty">No hay jornadas próximas en el cronograma operativo.</p>')+
      '<div class="role-legacy-links"><a class="profile-button profile-button-primary" href="'+esc(href("escanear/"))+'">Pasar lista · QR o manual</a>'+
      '<button type="button" data-action="view-attendance" class="profile-button profile-button-outline">Pase de lista</button>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("../operaciones/"))+'" target="_blank" rel="noopener noreferrer">Editar agenda vigente ↗</a>'+
        '<a class="profile-button profile-button-outline" href="'+esc(href("../operaciones/control-jornadas.html"))+'" target="_blank" rel="noopener noreferrer">Control de asistencia ↗</a></div>'+
      '<p class="role-transition">El cronograma original continúa como fuente oficial de asignaciones. Las solicitudes nuevas permanecen en borrador hasta habilitar su registro y aprobación seguros.</p>'+
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
  const target=event.target.closest("[data-action]");
  if(!target)return;
  const task=target.dataset.action;
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
  if(form.id==="request-id")return run(()=>register(new FormData(form)));
  if(form.id==="assignment-form"){
    if(!["admin","coordinador"].includes(role())||!allowed(routeSpace))
      return notice("No tienes permiso de coordinación.","error");
    try{
      const data=Object.fromEntries(new FormData(form));
      data.activities=[...form.querySelectorAll('input[name="activity[]"]')].map(x=>x.value);
      data.capturedBy=name()+" · "+state.user.uid;
      const draft=validateAssignmentDraft(data);
      const output=document.getElementById("assignment-preview");
      if(!output)return;
      output.value=assignmentDraftText(draft);
      document.getElementById("assignment-result").hidden=false;
      notice("Borrador preparado. No se ha guardado en Firebase.","ok");
    }catch(error){notice(errorText(error),"error")}
    return;
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
