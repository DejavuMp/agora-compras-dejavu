/*
 * ÁGORA · Centro de Operaciones — conexión segura Firebase V4.
 * El front-end nunca confía en el selector de rol: el permiso se consulta
 * en Firestore y las reglas del servidor deciden las operaciones permitidas.
 * Sin reglas desplegadas, la app permanece cerrada.
 */
import "../firebase-init.js";
import {projectStaffView} from "./ops-safe-view.mjs";
import {availablePeople,personForLink} from "./access-link-model.mjs";
import {createEventControl} from "./editor-jornadas-control.mjs";
import {
  GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocFromServer, onSnapshot, query, where,
  runTransaction, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const fb = window.AGORA_FIREBASE;
const auth = fb?.auth;
const fs = fb?.firestore;
const base = "../";
const SCHEDULE = doc(fs, "agora_ops_control", "schedule");
const LOGLIST = collection(fs, "agora_ops_logs");
const INCIDENTLIST = collection(fs, "agora_ops_incidents");
const REQUESTS = collection(fs, "agora_ops_access_requests");
const keys = ["people","vehicles","events","blocks","sites","campaigns","settings","audit"];
const blank = () => ({people:[],vehicles:[],events:[],blocks:[],sites:[],campaigns:[],settings:{
  dailyLimit:8,weeklyLimit:48,prepDefault:30,afterDefault:30,notificationMinutes:60,lateGraceMinutes:10,earlyGraceMinutes:10
},audit:[],logs:[],incidents:[]});
let account=null,role=null,personId="",baseBoard=null,saving=false,ready=false;
let logs = new Map(),incidents = new Map(),requests = new Map();
let linkingUid=null;
let unwatches=[],dirtyWaiting=false,authVersion=0,view=null;
const root=document.getElementById("ops-gate");
const app=window.AGORA_OPS_APP;
const opsJornadas=createEventControl({getBoard:()=>baseBoard?.payload,getUser:()=>account,
  isCoordinator:()=>ready&&role==="coordinador",fs,doc,collection,onSnapshot,runTransaction,serverTimestamp});
const clone=x=>JSON.parse(JSON.stringify(x));
const canon=x=>JSON.stringify(x);
const h=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const err=e=>/permission-denied/i.test(e?.code||"")?
  "Acceso denegado por Firestore. Es necesario activar las reglas seguras de Operaciones en Firebase.":
  /failed-precondition/i.test(e?.code||"")?
  "Hace falta un índice o configuración de Firestore; revisa la consola.":
  String(e?.message||e||"Error de conexión");
const notice=(txt,kind="")=>{
  const bar=document.getElementById("ops-connection");
  if(bar){bar.textContent=txt;bar.dataset.kind=kind;}
};
function loading(title,body="",actions=""){
  document.getElementById("app").style.display="none";ready=false;
  root.style.display="grid";
  root.innerHTML='<div class="ops-lock"><div class="ops-symbol"><img src="./assets/dejavu-monograma.png" alt="Dejavú Marketing"></div><div class="ops-eyebrow">DEJAVÚ MARKETING · ÁGORA</div><h1>'+h(title)+'</h1><p>'+h(body)+'</p>'+actions+'<div id="ops-lock-note"></div></div>';
}
function show(){
  document.getElementById("app").style.display="";
  root.style.display="none";ready=true;
}
function fail(msg){notice("No sincronizado · "+msg,"error");loading("Conexión no disponible",msg,
  '<button class="ops-login" id="ops-retry">Reintentar</button> <button class="ops-plain" id="ops-logout">Salir</button>');}
function stop(){
  opsJornadas.stop();
  for(const off of unwatches.splice(0))try{off()}catch(_){}
  role=null;personId="";baseBoard=null;logs.clear();incidents.clear();requests.clear();
  saving=false;ready=false;dirtyWaiting=false;
  app?.reset?.();
}
function boardOnly(state){
  const output={};
  for(const k of keys)output[k]=clone(state[k]??blank()[k]);
  output.audit=output.audit.slice(-300);
  return output;
}
function viewFor(person, board){
  return projectStaffView(person, board);
}
function boardMismatch(b,c){
  return keys.some(k=>canon(b?.[k]??blank()[k])!==canon(c?.[k]??blank()[k]));
}
function emit(){
  if(!ready || saving)return;
  const data=role==="coordinador"?
    {...blank(),...(baseBoard?.payload||{}),logs:[...logs.values()].map(x=>clone(x)),incidents:[...incidents.values()].map(x=>clone(x))}:
    {...blank(),...view,people:view?.person?[view.person]:[],logs:[...logs.values()].map(x=>clone(x)),incidents:[...incidents.values()].map(x=>clone(x))};
  app?.apply?.({db:data,role:role==="coordinador"?"coordinador":"personal",personId});
  opsJornadas.render();
}
function listen(s,ok){
  const off=onSnapshot(s,{includeMetadataChanges:true},ok,error=>fail(err(error)));
  unwatches.push(off);
}
function loadCoordinator(){
  role="coordinador";
  notice("Firebase · preparando datos","pending");
  loading("Abriendo centro de operaciones","Verificando agenda y permisos del equipo.");
  let initialized=false;
  listen(SCHEDULE,snap=>{
    const d=snap.data()||{};
    baseBoard={revision:snap.exists()?Number(d.revision||0):0,payload:snap.exists()?d.payload:boardOnly(blank())};
    initialized=true;
    if(snap.metadata.fromCache){notice("Firebase · esperando confirmación del servidor","pending");return;}
    if(!ready){show();notice("Firebase · sincronizado","ok");}
    emit();
  });
  listen(LOGLIST,snap=>{
    logs=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
    if(initialized)emit();
  });
  listen(INCIDENTLIST,snap=>{
    incidents=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
    if(initialized)emit();
  });
  listen(REQUESTS,snap=>{requests=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));renderRequests()});
}
function loadStaff(uid,id){
  role="personal";personId=id;
  loading("Cargando mis asignaciones","Tus datos y solicitudes se consultan únicamente con tu cuenta.");
  notice("Firebase · cargando Mi espacio","pending");
  listen(doc(fs,"agora_ops_staff",uid),snap=>{
    if(!snap.exists()){loading("Falta publicar tu ficha","Tu cuenta está autorizada, pero coordinación aún debe asignarte al cronograma.");return}
    view=snap.data();
    if(view.personId!==personId){fail("Vinculación de personal incorrecta");return}
    if(snap.metadata.fromCache){notice("Firebase · esperando confirmación del servidor","pending");return;}
    if(!ready){show();notice("Firebase · sincronizado","ok")}
    emit();
  });
  listen(query(LOGLIST,where("ownerUid","==",uid)),snap=>{
    logs=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
    emit();
  });
  listen(query(INCIDENTLIST,where("ownerUid","==",uid)),snap=>{
    incidents=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
    emit();
  });
}
async function pendingAccess(){
  loading("Acceso pendiente","Solicita acceso a coordinación desde tu cuenta de Google. Hasta que te vinculen, no se muestran datos de la agencia.",
  '<button class="ops-login" id="ops-request">Solicitar acceso</button> <button class="ops-plain" id="ops-logout">Cambiar cuenta</button>');
  try{
    const docSnap=await getDoc(doc(fs,"agora_ops_access_requests",account.uid));
    if(docSnap.exists()){
      const note=document.getElementById("ops-lock-note");
      if(note)note.textContent="Solicitud existente: "+(docSnap.data().status||"pendiente");
    }
  }catch(e){document.getElementById("ops-lock-note").textContent=err(e)}
}
async function session(u){
  const epoch=++authVersion;stop();account=u;
  if(!u){loading("Inicia sesión","Usa tu cuenta autorizada para consultar actividades, asistencia y pagos.",
    '<button class="ops-login" id="ops-login">Continuar con Google</button>');return;}
  loading("Verificando identidad","Consultando permisos individuales en ÁGORA.");
  if(!u.emailVerified){loading("Verifica tu correo","La cuenta debe tener su correo verificado.",'<button class="ops-plain" id="ops-logout">Cerrar sesión</button>');return;}
  try{
    const [user,member]=await Promise.all([
      getDocFromServer(doc(fs,"agora_users",u.uid)),
      getDocFromServer(doc(fs,"agora_ops_members",u.uid))
    ]);
    if(epoch!==authVersion)return;
    const info=user.exists()?user.data():{};
    const m=member.exists()?member.data():{};
    if(info.active===true&&["admin","coordinador"].includes(info.role))loadCoordinator();
    else if(m.active===true&&m.role==="staff"&&m.personId)loadStaff(u.uid,m.personId);
    else pendingAccess();
  }catch(e){if(epoch===authVersion)fail(err(e))}
}
onAuthStateChanged(auth,session, e=>fail(err(e)));
async function login(){
  notice("Abriendo Google…","pending");
  try{await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(e){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e?.code)){
      await signInWithRedirect(auth,new GoogleAuthProvider());return;
    }
    notice("Inicio de sesión: "+err(e),"error");
    const note=document.getElementById("ops-lock-note");if(note)note.textContent=err(e);
  }
}
root.addEventListener("click",async e=>{
  const id=e.target?.id;
  if(id==="ops-login")login();
  if(id==="ops-logout"){await signOut(auth);stop();}
  if(id==="ops-retry"){await session(auth.currentUser);}
  if(id==="ops-request"&&account){
    try{
      await setDoc(doc(fs,"agora_ops_access_requests",account.uid),
        {uid:account.uid,email:account.email||"",name:account.displayName||"",
         status:"pendiente",createdAt:serverTimestamp()});
      const n=document.getElementById("ops-lock-note");if(n)n.textContent="Solicitud registrada. Coordinación deberá vincularte con tu ficha de personal.";
    }catch(e){const n=document.getElementById("ops-lock-note");if(n)n.textContent=err(e);}
  }
});
const setup=document.createElement("div");setup.className="ops-headbar";setup.innerHTML=
  '<span id="ops-connection">Firebase · iniciando</span><span id="ops-ident"></span> <button id="ops-access" hidden>Accesos</button> <button id="ops-signout">Salir</button>';
document.body.insertBefore(setup,document.getElementById("app"));
document.getElementById("ops-signout").addEventListener("click",()=>signOut(auth));
document.getElementById("ops-access").addEventListener("click",()=>renderRequests(true));
function linkingForm(uid) {
  const request=requests.get(uid),board=baseBoard?.payload;
  if(!request)return "";
  const people=availablePeople(board?.people,uid);
  return '<form id="ops-link-form" class="ops-link-form" data-link-uid="'+h(uid)+'">'+
    '<h3>Vincular cuenta con personal</h3>'+
    '<p>Cuenta solicitante: <b>'+h(request.name||request.email)+'</b><br><small>'+h(request.email)+'</small></p>'+
    '<label for="ops-link-person">Ficha de personal</label>'+
    '<select id="ops-link-person" required>'+
      '<option value="">Selecciona una ficha</option>'+
      people.map(p=>'<option value="'+h(p.id)+'">'+h(p.name)+(p.email?' · '+h(p.email):'')+'</option>').join("")+
      '<option value="__new__">+ Registrar nueva ficha de personal</option>'+
    '</select>'+
    '<div id="ops-link-new" hidden><label for="ops-link-name">Nombre completo de la nueva ficha</label>'+
      '<input id="ops-link-name" type="text" maxlength="120" autocomplete="off" placeholder="Nombre del integrante">'+
      '<p class="ops-link-note">Se creará una ficha con este nombre y el correo de la solicitud. Sin tarifas ni información de pago.</p></div>'+
    '<label class="ops-link-verify"><input type="checkbox" id="ops-link-confirm" required> Confirmo que revisé la identidad y que la ficha elegida corresponde a esta cuenta.</label>'+
    '<div class="ops-link-actions"><button type="submit" id="ops-link-save">Confirmar y vincular</button>'+
      '<button type="button" id="ops-link-cancel" class="ops-link-secondary">Cancelar</button></div>'+
    '<p id="ops-link-error" class="ops-link-error" role="alert" aria-live="polite"></p>'+
  '</form>';
}
function renderRequests(open=false){
  const access=document.getElementById("ops-access");
  if(access)access.hidden=role!=="coordinador";
  const ident=document.getElementById("ops-ident");
  if(ident)ident.textContent=account?.email||"";
  let el=document.getElementById("ops-requests");
  if(role!=="coordinador"){if(el)el.remove();linkingUid=null;return;}
  if(!el){el=document.createElement("div");el.id="ops-requests";el.className="ops-requests";el.hidden=true;document.body.appendChild(el);}
  if(open)el.hidden=!el.hidden;
  const pending=[...requests.values()].filter(r=>r.status==="pendiente");
  if(linkingUid&&!pending.some(r=>r.uid===linkingUid))linkingUid=null;
  el.innerHTML='<div class="ops-requests-inner"><div class="ops-request-head"><b>Solicitudes de acceso ('+pending.length+')</b><button id="ops-requests-close">Cerrar</button></div>'+
    (pending.length?pending.map(r=>'<div class="ops-request-item"><div><b>'+h(r.name||r.email)+'</b><small>'+h(r.email)+' · UID: '+h(r.uid)+'</small></div>'+
      '<button type="button" data-approve="'+h(r.uid)+'">Vincular con personal</button></div>').join(""):'<p>No hay solicitudes pendientes.</p>')+
    (linkingUid?linkingForm(linkingUid):"")+'</div>';
  el.querySelector("#ops-requests-close").onclick=()=>{el.hidden=true;linkingUid=null;};
  el.querySelectorAll("[data-approve]").forEach(btn=>btn.addEventListener("click",()=>{
    linkingUid=btn.dataset.approve;
    renderRequests();
    el.querySelector("#ops-link-person")?.focus();
  }));
  const form=el.querySelector("#ops-link-form");
  if(!form)return;
  const select=form.querySelector("#ops-link-person");
  const nameBox=form.querySelector("#ops-link-new");
  const nameInput=form.querySelector("#ops-link-name");
  select.onchange=()=>{
    const isNew=select.value==="__new__";
    nameBox.hidden=!isNew;
    nameInput.required=isNew;
    if(isNew)nameInput.focus();
  };
  form.querySelector("#ops-link-cancel").onclick=()=>{linkingUid=null;renderRequests();};
  form.onsubmit=event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    approve(form.dataset.linkUid,select.value,nameInput.value);
  };
}
async function approve(uid,selection,newName){
  const request=requests.get(uid);
  const form=document.getElementById("ops-link-form");
  const status=document.getElementById("ops-link-error");
  if(!form||!request||!baseBoard?.payload||saving)return;
  const button=form.querySelector("#ops-link-save");
  const errorText=text=>{if(status)status.textContent=text};
  const newid=selection==="__new__"?"personal-"+crypto.randomUUID():"";
  try{
    // Validar antes de escribir: ningún usuario autoriza a otra ficha por coincidencia de nombre.
    personForLink(baseBoard.payload,{uid,email:request.email,selection,newName,newId:newid});
    saving=true;button.disabled=true;errorText("Comprobando solicitud y ficha con Firebase…");
    notice("Firebase · vinculando personal","pending");
    await runTransaction(fs,async tx=>{
      const memberRef=doc(fs,"agora_ops_members",uid);
      const reqRef=doc(fs,"agora_ops_access_requests",uid);
      const [scheduleSnap,reqSnap,memberSnap]=await Promise.all([
        tx.get(SCHEDULE),tx.get(reqRef),tx.get(memberRef)
      ]);
      if(!scheduleSnap.exists())throw Error("La agenda compartida todavía no está disponible.");
      if(!reqSnap.exists()||reqSnap.data().status!=="pendiente")
        throw Error("La solicitud ya fue atendida. Actualiza Accesos.");
      const current=reqSnap.data();
      if(current.uid!==uid||current.email!==request.email)
        throw Error("La solicitud cambió de identidad. Actualiza Accesos.");
      if(memberSnap.exists()&&memberSnap.data().active===true)
        throw Error("Esta cuenta ya tiene un vínculo activo.");
      const old=scheduleSnap.data(),newBoard=clone(old.payload);
      const {person,created,id}=personForLink(newBoard,{
        uid,email:current.email,selection,newName,newId:newid
      });
      if(created)newBoard.people.push(person);
      else{
        const i=newBoard.people.findIndex(p=>p.id===id);
        newBoard.people[i]=person;
      }
      tx.set(SCHEDULE,{revision:old.revision+1,payload:newBoard,updatedAt:serverTimestamp(),updatedBy:account.uid});
      tx.set(memberRef,{uid,email:current.email,role:"staff",personId:id,active:true,updatedAt:serverTimestamp()});
      tx.set(doc(fs,"agora_ops_staff",uid),{...viewFor(person,newBoard),uid,updatedAt:serverTimestamp()});
      tx.update(reqRef,{status:"aprobada",approvedAt:serverTimestamp(),approvedBy:account.uid});
    });
    linkingUid=null;
    notice("Firebase · personal vinculado","ok");
    renderRequests();
  }catch(e){
    const msg=err(e);
    errorText("No se vinculó: "+msg);
    notice("Firebase · "+msg,"error");
  }finally{
    saving=false;
    if(button.isConnected)button.disabled=false;
    await refreshFromServer();
  }
}
function hasClash(board){
 const active=(board.events||[]).filter(e=>!["borrador","cancelado"].includes(e.status));
 const time=x=>new Date(x).getTime();
 const overlap=(a,b,c,d)=>time(a)<time(d)&&time(c)<time(b);
 const span=(e)=>{
   const staff=e.staff||[];
   const first=Math.min(time(e.start)-Number(e.before||0)*60000,...staff.map(a=>time(a.start)).filter(Number.isFinite));
   const last=Math.max(time(e.end)+Number(e.after||0)*60000,...staff.map(a=>time(a.end)).filter(Number.isFinite));
   return [
     new Date(first-(Number(e.travelMin||0)+Number(e.routeBufferMin||0))*60000),
     new Date(last+Number(e.travelMin||0)*60000)
   ];
 };
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
   const a=active[i],b=active[j];
   for(const p of a.staff||[])for(const q of b.staff||[]){
     if(p.personId!==q.personId)continue;
     if(overlap(p.start,p.end,q.start,q.end))
       return "Empalme de personal: "+a.title+" y "+b.title;
     if(!a.siteId||a.siteId!==b.siteId){
       let gap=time(q.start)-time(p.end),need=Number(b.travelMin||0)+Number(b.routeBufferMin||0);
       if(gap<0){gap=time(p.start)-time(q.end);need=Number(a.travelMin||0)+Number(a.routeBufferMin||0);}
       if(gap>=0&&need>0&&gap/60000<need)
         return "Traslado insuficiente de personal entre "+a.title+" y "+b.title;
     }
   }
   if((a.vehicles||[]).some(id=>(b.vehicles||[]).includes(id))){
     const [startA,endA]=span(a),[startB,endB]=span(b);
     if(overlap(startA,endA,startB,endB))
       return "Camioneta reservada en jornadas incompatibles, incluyendo salida y regreso: "+a.title+" y "+b.title;
   }
 }
 for(const e of active)for(const block of board.blocks||[]){
   if(block.resourceType==="personal"&&(e.staff||[]).some(a=>a.personId===block.resourceId&&overlap(a.start,a.end,block.start,block.end)))
     return "Personal bloqueado en "+e.title;
   if(block.resourceType==="vehiculo"&&(e.vehicles||[]).includes(block.resourceId)){
     const [s,t]=span(e);
     if(overlap(s,t,block.start,block.end))return "Vehículo bloqueado en "+e.title;
   }
 }
 return "";
}
async function writeRecord(col,id,desired,existing){
  const ref=doc(fs,col,id);
  const expected=Number(existing?.revision||0);
  await runTransaction(fs,async tx=>{
    const snap=await tx.get(ref);
    const actual=snap.exists()?Number(snap.data().revision||0):0;
    if(actual!==expected)throw Error("Otro usuario modificó este registro. Actualiza antes de reintentar.");
    if(desired){
      const obj=clone(desired);
      delete obj.updatedAt;delete obj.revision;
      if(col==="agora_ops_logs"||col==="agora_ops_incidents"){
        obj.ownerUid=obj.ownerUid|| (role==="personal"?account.uid:
          (baseBoard?.payload?.people||[]).find(p=>p.id===obj.personId)?.authUid||"");
      }
      tx.set(ref,{...obj,revision:actual+1,updatedAt:serverTimestamp()});
    }else if(snap.exists())tx.delete(ref);
  });
}
async function store(next){
  if(!navigator.onLine){notice("Sin conexión. No se envió ningún cambio.","error");emit();return;}
  if(!ready||saving){notice("Cambios no aceptados: sesión no lista o guardado en proceso.","error");emit();return;}
  saving=true;document.body.classList.add("ops-saving");
  notice("Firebase · guardando cambios","pending");
  try{
    if(role==="personal"){
      // El staff solo puede modificar sus propios reportes. El servidor
      // verifica ownerUid, personId, estados y los campos permitidos.
      const illegal=keys.some(k=>k!=="audit"&&canon(next[k]??blank()[k])!==canon(({
        people:view?.person?[view.person]:[],events:view?.events||[],vehicles:view?.vehicles||[],
        sites:view?.sites||[],campaigns:view?.campaigns||[],blocks:[],settings:view?.settings||blank().settings,audit:[]
      })[k]));
      if(illegal)throw Error("Solo coordinación puede modificar la agenda, personal y camionetas.");
    }else{
      const nextBoard=boardOnly(next);
      if(boardMismatch(nextBoard,baseBoard?.payload)){
        const collision=hasClash(nextBoard);
        if(collision)throw Error(collision);
        const size=new Blob([JSON.stringify(nextBoard)]).size;
        if(size>850000)throw Error("Agenda demasiado grande para esta versión; hay que separar periodos antes de guardar.");
        const previous=baseBoard;
        await runTransaction(fs,async tx=>{
          const oldSnap=await tx.get(SCHEDULE);
          const current=oldSnap.exists()?oldSnap.data():null;
          const actual=current?Number(current.revision||0):0;
          if(actual!==(previous?.revision||0))throw Error("La agenda fue cambiada por otro coordinador. No se sobrescribió.");
          tx.set(SCHEDULE,{revision:actual+1,payload:nextBoard,updatedAt:serverTimestamp(),updatedBy:account.uid});
          const oldByUid=new Map((previous?.payload?.people||[]).filter(p=>p.authUid).map(p=>[p.authUid,p]));
          const newByUid=new Map(nextBoard.people.filter(p=>p.authUid).map(p=>[p.authUid,p]));
          const uids=new Set([...oldByUid.keys(),...newByUid.keys()]);
          if(uids.size>200)throw Error("Demasiados perfiles para una sola actualización.");
          for(const uid of uids){
            const person=newByUid.get(uid),ref=doc(fs,"agora_ops_staff",uid);
            if(!person){tx.delete(ref);continue}
            const newView=viewFor(person,nextBoard);
            // Reescribir también fichas aparentemente iguales: versiones anteriores
            // podían conservar campos privados que la proyección nueva elimina.
            tx.set(ref,{...newView,uid,updatedAt:serverTimestamp()});
          }
        });
      }
    }
    // Los registros de personal son documentos separados para que cada
    // integrante solo consulte los suyos mediante reglas de Firestore.
    for(const [kind,col,oldMap] of [
      ["logs","agora_ops_logs",logs],["incidents","agora_ops_incidents",incidents]
    ]){
      const target=new Map((next[kind]||[]).map(o=>[o.id,o]));
      for(const id of new Set([...oldMap.keys(),...target.keys()])){
        const prior=oldMap.get(id),desired=target.get(id);
        const clean=x=>{if(!x)return null;const o=clone(x);delete o.updatedAt;delete o.revision;return o};
        if(canon(clean(prior))!==canon(clean(desired)))
          await writeRecord(col,id,desired||null,prior);
      }
    }
    notice("Firebase · cambios enviados","ok");
  }catch(e){notice("No se guardó · "+err(e),"error");alert("No se guardaron todos los cambios.\n"+err(e)+"\nSe recuperará el estado autorizado de Firebase.");}
  finally{
    saving=false;document.body.classList.remove("ops-saving");
    // Tras cualquier escritura o error, el estado visible proviene de los
    // snapshots del servidor, nunca de la copia sin comprobar.
    await refreshFromServer();
  }
}
async function refreshFromServer(){
  // Los listeners sincronizan la copia; este método también restaura el
  // estado ante conflictos o errores de permisos.
  try{
    if(role==="coordinador"){
      const snap=await getDocFromServer(SCHEDULE);const d=snap.data();
      baseBoard={revision:d?.revision||0,payload:d?.payload||boardOnly(blank())};
    }else if(role==="personal"){
      const snap=await getDocFromServer(doc(fs,"agora_ops_staff",account.uid));
      if(snap.exists())view=snap.data();
    }
  }catch(e){notice("Error leyendo versión confirmada · "+err(e),"error")}
  emit();
}
window.AGORA_OPS_BRIDGE={
  get ready(){return ready},get role(){return role},
  get personId(){return personId},
  save:store,
  openJornadasControl:()=>{if(role==="coordinador"&&ready)opsJornadas.open()},
  guardAction(action){
    if(!ready||saving){notice("La sincronización está ocupada.","pending");return false;}
    if(["import-json","clear-data","load-demo"].includes(action)){
      alert("Esta acción solo existe en la demostración local. La información compartida no se borra ni se importa masivamente desde la interfaz.");return false;
    }
    if(role==="personal"){
      const allowed=new Set(["new-log","edit-log","request-pay","new-incident","edit-incident",
      "close-modal","event-ics","export-ics","notify-setup","stamp-entry","stamp-exit",
      "cal-prev","cal-next","cal-today","go-attendance",
      "export-attendance","edit-event","print","export-json"]);
      if(!allowed.has(action))return false;
    }
    return true;
  }
};
loading("Inicia sesión","Usa tu cuenta autorizada para entrar al calendario y tus asignaciones.",
  '<button class="ops-login" id="ops-login">Continuar con Google</button>');
