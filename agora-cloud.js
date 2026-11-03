import * as authSdk from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import * as dbSdk from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
(function cloudRuntime({authSdk,dbSdk}) {
  const roles=["admin","coordinador","consulta"];
  const groups=["rfqs","orders","samples","suppliers"];
  const authCol="agora_users",recordsCol="agora_records";
  const escape=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let fb=null,account=null,role=null,mode="local",busy=false,backupOk=false,panel=null,initialized=false;
  let note="El guardado local continúa funcionando. Activa la nube para sincronizar.";
  let revisions=new Map(),baseline=new Map(),timer=0,activeSync=false,pending=false;
  const canEdit=()=>role==="admin"||role==="coordinador";
  const key=(type,id)=>type+"__"+encodeURIComponent(String(id));
  const local=()=>window.AGORA_LOCAL;
  function tell(message){note=message;render();}
  function toMap(data){
    if(data?.app!=="agora-compras-v1")throw Error("Formato local incompatible.");
    const fields={...data};groups.forEach(t=>delete fields[t]);
    const items=[{kind:"settings",recordId:"main",payload:fields}];
    for(const type of groups)for(const value of data[type]||[]) {
      if(!value.id)throw Error("Registro sin ID en "+type);
      items.push({kind:type,recordId:String(value.id),payload:value});
    }
    const result=new Map();
    for(const item of items){
      const id=key(item.kind,item.recordId);
      if(result.has(id))throw Error("ID duplicado: "+id);
      if(new Blob([JSON.stringify(item.payload)]).size>850000)throw Error("Expediente "+id+" demasiado grande para Firestore (imágenes incluidas). No se sincronizó; el original permanece local.");
      result.set(id,item);
    }
    return result;
  }
  function fromDocs(records){
    const settings=records.find(x=>x.kind==="settings"&&x.recordId==="main");
    if(!settings)throw Error("No hay configuración completa en la nube.");
    const data={...settings.payload};
    for(const type of groups)data[type]=records.filter(x=>x.kind===type).map(x=>x.payload);
    if(data.app!=="agora-compras-v1")throw Error("Versión de nube incompatible.");
    return data;
  }
  function backup(){
    const data=local()?.snapshot();
    if(!data)throw Error("Ágora todavía no está lista.");
    const href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=href;a.download="AGORA_RESPALDO_"+new Date().toISOString().slice(0,10)+".json";
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
    backupOk=true;tell("Respaldo descargado. Guárdalo fuera del navegador.");
  }
  async function writeRecord(id,item){
    const ref=dbSdk.doc(fb.firestore,recordsCol,id),expected=revisions.get(id)||0;
    await dbSdk.runTransaction(fb.firestore,async tx=>{
      const got=await tx.get(ref);
      const rev=got.exists()?Number(got.data().revision||0):0;
      if(rev!==expected)throw Error("Conflicto de versión en "+id+"; no se sobrescribió.");
      if(item)tx.set(ref,{...item,revision:rev+1,updatedBy:account.uid,updatedAt:dbSdk.serverTimestamp()});
      else if(got.exists())tx.delete(ref);
    });
    if(item){revisions.set(id,expected+1);baseline.set(id,JSON.stringify(item));}
    else{revisions.delete(id);baseline.delete(id);}
  }
  async function pushChanges(){
    if(mode!=="cloud"||!canEdit())return;
    if(activeSync){pending=true;return;}
    activeSync=true;
    try{
      do{
        pending=false;
        const next=toMap(local().snapshot());
        const ids=new Set([...next.keys(),...baseline.keys()]);
        let changed=0;
        for(const id of ids){
          const item=next.get(id)||null;
          if((item?JSON.stringify(item):null)===(baseline.get(id)||null))continue;
          await writeRecord(id,item);changed++;
        }
        if(changed)tell("Guardado en Firestore: "+changed+" cambios.");
      }while(pending&&mode==="cloud");
    }catch(e){mode="error";tell("Sincronización detenida: "+e.message+". Haz respaldo antes de volver a cargar.");}
    finally{activeSync=false;render();}
  }
  async function connect(){
    if(busy||!role||!account)return;
    if(!backupOk)return tell("Primero descarga un respaldo local.");
    busy=true;render();
    try{
      const results=await dbSdk.getDocs(dbSdk.collection(fb.firestore,recordsCol));
      const records=results.docs.map(d=>({key:d.id,...d.data()}));
      if(!records.length){
        if(!canEdit())throw Error("No tienes permiso para crear registros.");
        if(!confirm("La nube está vacía. ¿Copiar ahora los registros locales a Firestore?"))return;
        const next=toMap(local().snapshot());
        revisions.clear();baseline.clear();
        for(const [id,item] of next)await writeRecord(id,item);
        mode="cloud";tell("Nube activada. Los cambios posteriores se guardan automáticamente.");
      }else{
        if(!confirm("Se abrirán los datos de Firebase en este navegador. ¿Confirmas que ya guardaste tu respaldo?"))return;
        const next=fromDocs(records);
        revisions=new Map(records.map(x=>[x.key,Number(x.revision||0)]));
        baseline=new Map(records.map(x=>[x.key,JSON.stringify({kind:x.kind,recordId:x.recordId,payload:x.payload})]));
        mode="local";local().applyCloud(next);
        mode=canEdit()?"cloud":"consulta";
        tell(mode==="cloud"?"Datos de Firebase cargados. Guardado automático activo.":"Datos abiertos en modo consulta.");
      }
    }catch(e){mode="error";tell("Error al conectar: "+e.message);}
    finally{busy=false;render();}
  }
  async function authorizeUser(){
    if(role!=="admin")return;
    const uid=prompt("UID de Authentication del colaborador:");if(!uid)return;
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(uid))return tell("UID inválido.");
    const email=prompt("Correo Google del colaborador:");if(!email||!email.includes("@"))return;
    const assigned=prompt("Rol (admin / coordinador / consulta):","consulta");
    if(!roles.includes(assigned))return tell("El rol indicado no es válido.");
    await dbSdk.setDoc(dbSdk.doc(fb.firestore,authCol,uid),{email:email.trim().toLowerCase(),role:assigned,active:true,updatedAt:dbSdk.serverTimestamp()},{merge:true});
    tell("Usuario autorizado por UID. Se aplicaron los permisos.");
  }
  function render(){
    if(!panel)return;
    panel.innerHTML=`
      <div style="display:flex;justify-content:space-between;gap:8px"><strong style="color:#eac58b">☁ ÁGORA · Nube</strong><span>${escape(mode)}</span></div>
      <div style="margin:8px 0">${escape(note)}</div>
      <div style="opacity:.8">${account?escape(account.email)+" · "+escape(role||"Sin autorización"):"Sin sesión"}</div>
      ${account&&!role?`<div style="margin:8px 0">Para autorizar tu cuenta, crea en Firestore la colección <b>agora_users</b> con un documento cuyo ID sea tu UID, y los campos <b>role = admin</b> (texto) y <b>active = true</b> (booleano).<p style="overflow-wrap:anywhere">UID: <code>${escape(account.uid)}</code></p></div>`:""}
      <div class="agora-cloud-actions">
      ${account?'<button data-cloud="logout">Salir</button><button data-cloud="copy">Copiar UID</button>':'<button data-cloud="login">Iniciar con Google</button>'}
      ${role?'<button data-cloud="backup">Descargar respaldo</button><button data-cloud="connect">Activar / cargar nube</button>':""}
      ${role==="admin"?'<button data-cloud="users">Autorizar usuario</button>':""}
      </div>
      <small style="opacity:.7">El acuse y la cotización externa de proveedores todavía utilizan JSON. El acceso de proveedores se conectará por un servicio seguro independiente.</small>`;
  }
  function mount(){
    const style=document.createElement("style");
    style.textContent="#agora-cloud-panel{position:fixed;left:12px;bottom:12px;width:min(355px,calc(100vw - 24px));max-height:45vh;overflow:auto;background:#171613;color:#f1e8d5;border:1px solid #a1804b;border-radius:11px;padding:12px;box-shadow:0 8px 26px #0008;z-index:10000;font:12px/1.4 Arial,sans-serif}.agora-cloud-actions{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.agora-cloud-actions button{background:#9e7843;color:#fff;border:0;padding:7px 10px;border-radius:5px;cursor:pointer;font:inherit}@media(max-width:650px){#agora-cloud-panel{bottom:140px;max-height:38vh}}";
    document.head.appendChild(style);panel=document.createElement("aside");panel.id="agora-cloud-panel";document.body.append(panel);
    panel.addEventListener("click",async e=>{
      const action=e.target.closest("[data-cloud]")?.dataset.cloud;if(!action)return;
      try{
        if(action==="login")await authSdk.signInWithPopup(fb.auth,new authSdk.GoogleAuthProvider());
        if(action==="logout"){mode="local";await authSdk.signOut(fb.auth);}
        if(action==="copy"&&account){await navigator.clipboard.writeText(account.uid);tell("UID copiado.");}
        if(action==="backup")backup();
        if(action==="connect")await connect();
        if(action==="users")await authorizeUser();
      }catch(error){tell("Error: "+error.message);}
    });
    render();
  }
  function initialize(){
    if(initialized||!window.AGORA_FIREBASE?.initialized)return;
    fb=window.AGORA_FIREBASE;initialized=true;mount();
    authSdk.onAuthStateChanged(fb.auth,async next=>{
      account=next;role=null;mode="local";revisions.clear();baseline.clear();backupOk=false;
      if(next){
        try{
          const info=await dbSdk.getDoc(dbSdk.doc(fb.firestore,authCol,next.uid));
          role=info.exists()&&info.data().active===true&&roles.includes(info.data().role)?info.data().role:null;
          tell(role?"Cuenta autorizada. Descarga respaldo para activar la nube.":"Cuenta sin permiso aún. Copia tu UID para autorizarla en Firestore.");
        }catch(e){tell("No se pudo consultar tu permiso: "+e.message);}
      }else tell("Inicia sesión para acceder a la nube.");
    });
  }
  window.addEventListener("agora:firebase-ready",initialize);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);
  else initialize();
  window.addEventListener("agora:local-saved",()=>{
    if(mode!=="cloud"||!canEdit())return;
    pending=true;clearTimeout(timer);timer=setTimeout(pushChanges,1100);
  });
})({authSdk,dbSdk});
