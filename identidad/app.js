import {JOBS,JOB_NAMES,csvCell,projectTodayAssignments} from "./domain.mjs";
import {
  approveRegistration,assignCoordinator,auth,listActiveCoordinators,listDirectory,listPendingRegistrations,loadOwnIdentity,login,logout,
  requestRegistration,saveFinancial,saveProfile,updateCredential,watchSession
} from "./firebase-identity.js";

const app=document.querySelector("#app");
const statusBox=document.querySelector("#system-status");
const loginButton=document.querySelector("#login-button");
const logoutButton=document.querySelector("#logout-button");
const sessionLabel=document.querySelector("#session-label");
const state={user:null,workspace:null,pending:[],directory:[],coordinators:[],busy:false};
const tools=[
  ["Compras y Producción","https://dejavump.github.io/agora-compras-dejavu/"],
  ["Archivos","https://dejavump.github.io/agora-compras-dejavu/archivos/"],
  ["Centro de Operaciones","https://dejavump.github.io/agora-operaciones-dejavu/operaciones/"],
  ["Mis jornadas","https://dejavump.github.io/agora-operaciones-dejavu/operaciones/jornadas.html"]
];

const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const initials=name=>String(name||"ÁGORA").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase();
const time=value=>new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(value);
const field=(name,label,value="",type="text",extra="")=>`<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const jobs=(selected="")=>JOB_NAMES.map(job=>`<option ${job===selected?"selected":""}>${esc(job)}</option>`).join("");

function setStatus(message,tone=""){
  statusBox.textContent=message;
  if(tone)statusBox.dataset.tone=tone;else delete statusBox.dataset.tone;
}
function errorMessage(error){
  const code=String(error?.code||"");
  if(code.includes("permission-denied"))return "Firebase rechazó la operación por permisos. Comprueba que las reglas de Identidad estén activas y que tu cuenta esté autorizada.";
  if(code.includes("network"))return "No hay conexión. No se guardó ningún cambio.";
  return String(error?.message||error||"Ocurrió un error.");
}
function setBusy(value){
  state.busy=value;
  document.querySelectorAll("button").forEach(button=>{if(button.id!=="logout-button")button.disabled=value});
}
async function run(action,success){
  setBusy(true);setStatus("Procesando…");
  try{await action();if(success)setStatus(success,"ok")}
  catch(error){console.error(error);setStatus(errorMessage(error),"error")}
  finally{setBusy(false)}
}

function publicUrl(registry){
  const url=new URL("./verificar.html",location.href);
  url.searchParams.set("id",registry.credentialId);
  return url.href;
}
function drawQr(registry){
  const target=document.querySelector("#credential-qr");
  if(!target||!registry?.credentialId)return;
  const url=publicUrl(registry);target.replaceChildren();
  if(window.QRCode){
    new window.QRCode(target,{text:url,width:100,height:100,colorDark:"#11100e",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M});
  }else{
    const link=document.createElement("a");link.href=url;link.textContent="Abrir verificación";target.append(link);
  }
}

function hero(){
  app.innerHTML=`<section class="hero">
    <div><p class="eyebrow">Dejavú Marketing · identidad persistente</p>
      <h1>Una persona, un ID ÁGORA.</h1>
      <p>La identidad no cambia con el cargo o el proyecto. El acceso administrativo depende de permisos internos, no del nombre del puesto.</p>
      <div class="actions"><button class="button primary" id="hero-login" type="button">Entrar con Google</button></div>
    </div>
    <aside class="security-note"><b>Protección activa</b><ul>
      <li>Datos médicos y financieros separados.</li><li>Credencial revocable en tiempo real.</li>
      <li>Sin documentos ni fotografías en el repositorio público.</li></ul></aside>
  </section>`;
  document.querySelector("#hero-login").addEventListener("click",()=>run(login));
}

function registrationFormMarkup(){
  return `<form id="registration-form" class="form-grid">
      ${field("name","Nombre completo",state.user.displayName||"")}
      ${field("email","Correo",state.user.email||"","email","readonly")}
      ${field("phone","Teléfono","","tel")}
      <div class="field"><label for="jobTitle">Cargo operativo solicitado</label><select id="jobTitle" name="jobTitle">${jobs("Staff")}</select></div>
      <label class="field full notice"><span><input name="privacy" type="checkbox"> Acepto el aviso de privacidad provisional para solicitar mi alta. Entiendo que requiere validación jurídica definitiva.</span></label>
      <div class="actions field full"><button class="button primary" type="submit">Enviar solicitud</button></div>
    </form>`;
}
function bindRegistrationForm(){
  document.querySelector("#registration-form")?.addEventListener("submit",event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    run(async()=>{await requestRegistration(state.user,{name:form.get("name"),phone:form.get("phone"),jobTitle:form.get("jobTitle"),privacyAccepted:form.get("privacy")==="on"});await refresh()},"Solicitud enviada sin duplicar tu identidad.");
  });
}

function registration(workspace){
  const existing=workspace.registration;
  if(existing){
    app.innerHTML=`<section class="panel"><p class="eyebrow">Solicitud de identidad</p>
      <h1>${existing.status==="approved"?"Identidad aprobada":"Revisión pendiente"}</h1>
      <p>Solicitud de <b>${esc(existing.displayName)}</b>. Estado: <b>${esc(existing.status)}</b>.</p>
      <p class="notice">RH debe validar el expediente antes de emitir un ID. Los reintentos no generan registros duplicados.</p></section>`;
    return;
  }
  app.innerHTML=`<section class="panel"><p class="eyebrow">Alta de colaborador</p><h1>Solicita tu ID ÁGORA</h1>
    <p class="muted">Tu cuenta Google está verificada, pero todavía no tiene identidad. RH revisará la solicitud.</p>
    ${registrationFormMarkup()}</section>`;
  bindRegistrationForm();
}

function credential(registry){
  const active=registry.credentialActive===true;
  return `<section class="credential ${active?"":"blocked"}" aria-label="Credencial digital">
    <div class="credential-head"><span>DEJAVÚ MARKETING · ÁGORA</span><span class="tag ${active?"ok":"bad"}">${active?"VIGENTE":"BLOQUEADA"}</span></div>
    <div class="credential-body"><div class="row"><div class="initials" aria-hidden="true">${esc(initials(registry.displayName))}</div>
      <div><small>IDENTIDAD ÚNICA</small><h2>${esc(registry.displayName)}</h2><div>${esc(registry.agoraId)}</div><b>${esc(registry.jobTitle)}</b></div></div>
      <div id="credential-qr" class="qr" aria-label="QR de verificación">Generando QR…</div></div>
    ${active?"":`<p>Motivo: ${esc(registry.blockReason||"Credencial suspendida")}</p>`}
  </section>`;
}

function assignments(workspace){
  const list=projectTodayAssignments(workspace.operations,new Date());
  if(!list.length)return `<div class="empty">No hay actividades programadas para hoy.</div>`;
  return `<div class="assignments">${list.map(item=>`<article class="assignment">
    <time>${time(item.start)}–${time(item.end)}</time><h3>${esc(item.project||"Actividad")}</h3>
    <div class="facts"><div class="fact"><small>Sede</small>${esc(item.site||"Por confirmar")}</div>
      <div class="fact"><small>Cargo</small>${esc(item.jobTitle||"Asignado en operación")}</div>
      <div class="fact"><small>Actividad</small>${esc(item.activity||"Por confirmar")}</div>
      <div class="fact"><small>Responsable</small>${esc(item.responsible||"Coordinación")}</div></div>
    ${item.instructions?`<p><b>Indicaciones:</b> ${esc(item.instructions)}</p>`:""}
  </article>`).join("")}</div>`;
}

function privateModules(workspace){
  const p=workspace.profile||{},f=workspace.financial||{},locked=f.lockedByRH===true;
  return `<section class="panel"><h2>Expediente privado</h2><p class="muted">Los módulos permanecen cerrados hasta que los abras.</p>
    <details><summary>01 · Identidad y contacto / 02 · Operación, uniforme y emergencias</summary>
      <form id="profile-form" class="form-grid">
        ${field("telephone","Teléfono",p.telephone||"","tel")}${field("address","Domicilio",p.address||"")}
        ${field("shirtSize","Talla de playera",p.shirtSize||"")}${field("pantSize","Talla de pantalón",p.pantSize||"")}
        ${field("shoeSize","Calzado",p.shoeSize||"")}${field("emergencyName","Contacto de emergencia",p.emergencyName||"")}
        ${field("emergencyRelation","Relación",p.emergencyRelation||"")}${field("emergencyPhone","Teléfono de emergencia",p.emergencyPhone||"","tel")}
        <div class="field full"><label for="medicalNotes">Información médica estrictamente necesaria (solo titular y RH)</label><textarea id="medicalNotes" name="medicalNotes">${esc(p.medicalNotes||"")}</textarea></div>
        <div class="actions field full"><button class="button secondary" type="submit">Guardar datos privados</button></div>
      </form>
    </details>
    <details><summary>03 · Financieros y fiscales ${locked?"· bloqueado por RH":""}</summary>
      <form id="financial-form" class="form-grid">
        ${field("rfc","RFC",f.rfc||"","text",locked?"disabled":"")}${field("curp","CURP",f.curp||"","text",locked?"disabled":"")}
        ${field("nss","NSS",f.nss||"","text",locked?"disabled":"")}${field("bank","Institución bancaria",f.bank||"","text",locked?"disabled":"")}
        ${field("clabe","CLABE",f.clabe||"","text",locked?"disabled":"")}${field("taxRegime","Régimen fiscal",f.taxRegime||"","text",locked?"disabled":"")}
        <div class="actions field full"><button class="button secondary" type="submit" ${locked?"disabled":""}>Guardar datos fiscales</button></div>
      </form>
    </details>
    <details><summary>04 · Bóveda documental</summary><p class="notice">Carga deshabilitada: no se habilitará hasta contar con almacenamiento privado, reglas de descarga, retención y pruebas satisfactorias. No se simula un guardado seguro.</p></details>
    <details><summary>05 · Ecosistema ÁGORA</summary><div class="tools">${tools.map(([name,url])=>`<div class="tool"><b>${esc(name)}</b><a href="${url}" rel="noopener">Abrir herramienta verificada</a></div>`).join("")}</div></details>
  </section>`;
}

function coordinatorOptions(){
  return '<option value="">Sin coordinador por ahora</option>'+state.coordinators.map(item=>
    `<option value="${esc(item.uid)}">${esc(item.name)} · ${esc(item.email)}</option>`).join("");
}

function management(workspace){
  const account=workspace.account;
  if(!["admin","coordinador"].includes(account?.role))return "";
  const pending=account.role==="admin"?`<section class="panel span-12"><h2>Solicitudes pendientes</h2>${state.pending.length?state.pending.map(item=>`
    <article class="pending-card"><h3>${esc(item.displayName)}</h3><p>${esc(item.email)} · solicita ${esc(item.requestedJobTitle)}</p>
      <div class="row"><select aria-label="Cargo a aprobar" data-job-for="${esc(item.uid)}">${jobs(item.requestedJobTitle)}</select>
      ${state.coordinators.length?`<select aria-label="Coordinador para ${esc(item.displayName)}" data-coord-for="${esc(item.uid)}">${coordinatorOptions()}</select>`:""}
      <button class="button primary" data-approve="${esc(item.uid)}" type="button">Emitir ID</button></div></article>`).join(""):'<p class="muted">No hay solicitudes pendientes.</p>'}</section>`:"";
  const rows=state.directory.map(item=>`<tr><td><b>${esc(item.agoraId)}</b><br><small>${esc(item.displayName)}</small></td>
    <td><select aria-label="Cargo de ${esc(item.displayName)}" data-directory-job="${esc(item.agoraId)}">${jobs(item.jobTitle)}</select></td>
    <td>${item.credentialActive?"Vigente":"Bloqueada"}</td><td>
      <button class="button ${item.credentialActive?"danger":"secondary"}" data-toggle="${esc(item.agoraId)}" type="button">${item.credentialActive?"Bloquear":"Activar"}</button>
    </td>${account.role==="admin"?`<td>
      <small>${Array.isArray(item.coordinatorUids)&&item.coordinatorUids.length?"Asignados: "+esc(item.coordinatorUids.map(uid=>state.coordinators.find(c=>c.uid===uid)?.name||uid).join(", ")):"Sin coordinación asignada"}</small>
      ${state.coordinators.length?`<div class="row"><select aria-label="Asignar coordinación a ${esc(item.displayName)}" data-coordinator-for="${esc(item.agoraId)}">${coordinatorOptions()}</select>
      <button type="button" class="button secondary" data-assign-coordinator="${esc(item.agoraId)}">Asignar</button></div>`:""}
    </td>`:""}</tr>`).join("");
  return `${pending}<section class="panel span-12"><div class="row"><div><h2>Directorio operativo</h2><p class="muted">${account.role==="admin"?"Vista RH":"Solo colaboradores asignados"}</p></div>
    <button id="export-directory" class="button secondary" type="button">Exportar CSV operativo</button></div>
    <div class="table-wrap"><table><thead><tr><th>Identidad</th><th>Cargo</th><th>Credencial</th><th>Acción</th>${account.role==="admin"?"<th>Coordinación</th>":""}</tr></thead><tbody>${rows||`<tr><td colspan="${account.role==="admin"?5:4}">Sin registros disponibles.</td></tr>`}</tbody></table></div></section>`;
}

function bindManagementActions(){
  document.querySelectorAll("[data-approve]").forEach(button=>button.addEventListener("click",()=>{
    const item=state.pending.find(row=>row.uid===button.dataset.approve);
    const select=document.querySelector(`[data-job-for="${CSS.escape(item.uid)}"]`);
    const coordinator=document.querySelector(`[data-coord-for="${CSS.escape(item.uid)}"]`);
    run(async()=>{await approveRegistration(state.user,item,{jobTitle:select.value,coordinatorUid:coordinator?.value||""});await refresh()},"ID emitido con transacción y auditoría.");
  }));
  document.querySelectorAll("[data-toggle]").forEach(button=>button.addEventListener("click",()=>{
    const item=state.directory.find(row=>row.agoraId===button.dataset.toggle);
    const select=document.querySelector(`[data-directory-job="${CSS.escape(item.agoraId)}"]`);
    let reason="";if(item.credentialActive)reason=prompt("Motivo del bloqueo (mínimo 5 caracteres):","Fin de turno / acceso suspendido")||"";
    run(async()=>{await updateCredential(state.user,item,{active:!item.credentialActive,reason,jobTitle:select.value});await refresh()},"Credencial actualizada y auditada.");
  }));
  document.querySelectorAll("[data-assign-coordinator]").forEach(button=>button.addEventListener("click",()=>{
    const item=state.directory.find(row=>row.agoraId===button.dataset.assignCoordinator);
    const select=document.querySelector(`[data-coordinator-for="${CSS.escape(item.agoraId)}"]`);
    run(async()=>{
      if(!select?.value)throw Error("Selecciona una persona de coordinación activa.");
      await assignCoordinator(state.user,item,select.value);
      await refresh();
    },"Coordinación asignada con auditoría.");
  }));
  document.querySelector("#export-directory")?.addEventListener("click",exportDirectory);
}

function managementDashboard(workspace){
  const request=workspace.registration
    ? `<p>Tu solicitud personal está en estado <b>${esc(workspace.registration.status)}</b>. Esto no impide administrar RH con tu permiso técnico actual.</p>`
    : `<p>Tu cuenta administrativa todavía no tiene un ID personal. Puedes administrar RH y solicitar tu alta por el flujo normal.</p>`;
  const signup=workspace.registration?"":`<section class="panel span-12"><h2>Solicita tu propio ID</h2>${registrationFormMarkup()}</section>`;
  app.innerHTML=`<div class="grid"><section class="panel span-12"><p class="eyebrow">Acceso administrativo</p><h1>Identidad Única y RH</h1>${request}</section>${management(workspace)}${signup}</div>`;
  bindRegistrationForm();
  bindManagementActions();
}

function dashboard(workspace){
  const registry=workspace.registry;
  app.innerHTML=`<div class="grid"><div class="span-5">${credential(registry)}</div>
    <section class="panel span-7"><p class="eyebrow">Operaciones · información real</p><h2>¿A qué voy hoy?</h2>${assignments(workspace)}</section>
    <div class="span-12">${privateModules(workspace)}</div>${management(workspace)}</div>`;
  drawQr(registry);
  document.querySelector("#profile-form")?.addEventListener("submit",event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));run(async()=>{await saveProfile(state.user,values);await refresh()},"Datos privados guardados.")});
  document.querySelector("#financial-form")?.addEventListener("submit",event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));run(async()=>{await saveFinancial(state.user,values);await refresh()},"Datos fiscales guardados.")});
  bindManagementActions();
}

function exportDirectory(){
  const headers=["ID ÁGORA","Nombre","Cargo","Estatus RH","Credencial"];
  const lines=[headers.map(csvCell).join(","),...state.directory.map(item=>[
    item.agoraId,item.displayName,item.jobTitle,item.rhStatus,item.credentialActive?"Vigente":"Bloqueada"
  ].map(csvCell).join(","))];
  const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="AGORA_Directorio_Operativo.csv";link.click();URL.revokeObjectURL(url);
  setStatus("CSV operativo exportado sin datos médicos, fiscales ni bancarios.","ok");
}

async function refresh(){
  if(!state.user){state.workspace=null;hero();return}
  setStatus("Consultando permisos y expediente…");
  state.workspace=await loadOwnIdentity(state.user);
  if(["admin","coordinador"].includes(state.workspace.account?.role)){
    const tasks=[listDirectory(state.workspace.account,state.user.uid)];
    if(state.workspace.account.role==="admin")tasks.push(listPendingRegistrations(),listActiveCoordinators());
    else tasks.push(Promise.resolve([]),Promise.resolve([]));
    [state.directory,state.pending,state.coordinators]=await Promise.all(tasks);
  }else{state.directory=[];state.pending=[];state.coordinators=[]}
  if(state.workspace.registry)dashboard(state.workspace);
  else if(["admin","coordinador"].includes(state.workspace.account?.role))managementDashboard(state.workspace);
  else registration(state.workspace);
  setStatus("Sesión protegida activa.","ok");
}

function renderAccessFailure(error){
  const denied=String(error?.code||"").includes("permission-denied");
  const detail=denied
    ? "La sesión de Google está abierta, pero Firestore no autorizó la lectura del expediente. Puede faltar la activación de las reglas de Identidad o el permiso de esta cuenta."
    : "No se pudo consultar el expediente. Comprueba tu conexión e intenta nuevamente.";
  const collection=denied&&error?.collection
    ? `<p class="muted">Consulta rechazada: <code>${esc(error.collection)}</code>.</p>` : "";
  app.innerHTML=`<section class="panel access-error" role="alert">
    <p class="eyebrow">ÁGORA · Identidad Única</p>
    <h1>${denied?"Acceso a datos pendiente de activación":"No fue posible cargar tu identidad"}</h1>
    <p>${detail}</p>
    ${collection}
    <p class="notice">No se generó ningún ID ni se modificó tu expediente. No es necesario crear otra cuenta. Administración debe comprobar las reglas de Firestore del proyecto <b>agora-dejavu-38b8c</b> antes de registrar información personal.</p>
    <div class="actions"><button class="button primary" id="retry-identity" type="button">Reintentar conexión</button>
    <a class="button secondary" href="./">Recargar portal</a></div>
  </section>`;
  document.querySelector("#retry-identity")?.addEventListener("click",()=>run(safeRefresh));
  setStatus(denied?"Firebase denegó una lectura. No se cambió ningún dato.":errorMessage(error),"error");
}

async function safeRefresh(){
  try{await refresh()}catch(error){console.error(error);renderAccessFailure(error)}
}

loginButton.addEventListener("click",()=>run(login));
logoutButton.addEventListener("click",()=>run(logout));
watchSession(user=>{
  state.user=user;sessionLabel.textContent=user?.email||"Sin sesión";
  loginButton.hidden=!!user;logoutButton.hidden=!user;
  run(safeRefresh);
});
