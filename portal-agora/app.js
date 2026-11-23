import {auth,db} from "./firebase.js";
import {
  onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithRedirect,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {doc,getDoc,setDoc,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {saveProfile,saveFinancial} from "../identidad/firebase-identity.js";
import {projectTodayAssignments} from "../identidad/domain.mjs";

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
const state={user:null,identity:null,privateData:null,privateError:null,page:"login",busy:false,epoch:0};
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
async function refresh(){
  const user=state.user;
  const epoch=++state.epoch;
  sessionLabel.textContent=user?.email||"Mi cuenta";
  logoutButton.hidden=!user;
  state.privateData=null;
  state.privateError=null;
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
    '<p class="profile-muted">El QR permite comprobar la vigencia. No comparte información privada del expediente.</p>'+
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
function emptySpace(){
  const meta=PATH_SPACES[routeSpace];
  app.innerHTML='<section class="empty-space-page">'+
    '<a class="empty-back" href="'+esc(ROOT.href)+'">← Volver a Mi perfil</a>'+
    '<img class="empty-space-icon" src="'+esc(iconSrc(meta.icon))+'" width="96" height="96" alt="">'+
    '<div class="profile-kicker">ÁGORA · Espacio personal</div>'+
    '<h1>'+meta.title+'</h1><p>Espacio en preparación</p>'+
    '<a class="profile-button profile-button-outline" href="'+esc(ROOT.href)+'">Volver a Mi perfil</a></section>';
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
