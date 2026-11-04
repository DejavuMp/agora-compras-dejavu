import * as authSdk from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import * as dbSdk from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
(()=>{
  const ROLES=['admin','coordinador','consulta'],TYPES=['rfqs','orders','samples','suppliers'],COL='agora_records',META='AGORA_SYNC_V2';
  let fb,account=null,role=null,appReady=false,initialized=false,panel=null;
  let mode='starting',message='Preparando conexión con Firebase...',inFlight=false,pending=false,applying=false;
  let baseline=new Map(),hasBase=false,epoch=0,authSerial=0,dbPromise=null,syncTimer=null;
  const local=()=>window.AGORA_LOCAL,editable=()=>['admin','coordinador'].includes(role);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=(kind,id)=>kind+'__'+encodeURIComponent(String(id));
  const json=x=>x==null?null:JSON.stringify(x);
  function status(next,text){
    mode=next;message=text;
    const dictionary={cloud:['Firebase · sincronizado','cloud'],saving:['Firebase · guardando','pending'],offline:['Sin internet · copia local','offline'],starting:['Conectando con Firebase','pending'],setup:['Primera conexión · revisar','pending'],conflict:['Conflicto · revisar','error'],error:['Error de nube · copia local','error'],signedout:['Sin sesión · copia local','offline'],consulta:['Firebase · consulta','cloud'],local:['Copia local · sin sincronizar','offline']};
    const [label,state]=dictionary[next]||dictionary.local;
    window.AGORA_CLOUD_STATUS=Object.freeze({mode:next,label,status:state,description:text});
    window.dispatchEvent(new CustomEvent('agora:cloud-status',{detail:window.AGORA_CLOUD_STATUS}));
    render();
  }
  function openDB(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((res,rej)=>{
      if(!window.indexedDB)return rej(Error('El navegador bloquea el almacenamiento local.'));
      const req=indexedDB.open(META,1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('sync'))req.result.createObjectStore('sync');
        if(!req.result.objectStoreNames.contains('safety'))req.result.createObjectStore('safety');
      };
      req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error||Error('No se pudo abrir IndexedDB'));
    });
    return dbPromise;
  }
  async function readStore(store,id){
    const db=await openDB();
    return new Promise((res,rej)=>{
      const tx=db.transaction(store,'readonly'),rq=tx.objectStore(store).get(id);
      rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error||Error('Lectura local fallida'));
    });
  }
  async function writeStore(store,id,value){
    const db=await openDB();
    return new Promise((res,rej)=>{
      const tx=db.transaction(store,'readwrite');
      tx.objectStore(store).put(value,id);
      tx.oncomplete=()=>res();tx.onabort=()=>rej(tx.error||Error('Error de respaldo local'));
      tx.onerror=()=>rej(tx.error||Error('No se pudo guardar la copia local'));
    });
  }
  async function safety(uid,why){
    await writeStore('safety',uid+'-'+Date.now(),{why,date:new Date().toISOString(),payload:local().snapshot()});
  }
  async function loadBase(uid){
    const saved=await readStore('sync',uid);
    if(!saved?.ready)return false;
    baseline=new Map(saved.records||[]);
    return true;
  }
  async function saveBase(uid){
    await writeStore('sync',uid,{ready:true,records:[...baseline],at:Date.now()});
  }
  function mapLocal(data){
    if(data?.app!=='agora-compras-v1')throw Error('Formato local desconocido.');
    const root={...data};for(const t of TYPES)delete root[t];
    const values=[{kind:'settings',recordId:'main',payload:root}];
    for(const type of TYPES){
      if(!Array.isArray(data[type]))throw Error('Falta la colección local '+type);
      for(const row of data[type]){
        if(!row?.id)throw Error('Un expediente '+type+' carece de ID.');
        values.push({kind:type,recordId:String(row.id),payload:row});
      }
    }
    const result=new Map();
    for(const value of values){
      const id=key(value.kind,value.recordId);
      if(result.has(id))throw Error('Registro duplicado '+id);
      if(new Blob([JSON.stringify(value.payload)]).size>850000)throw Error('El registro '+value.recordId+' tiene imágenes o datos de más de 850 KB. Está protegido localmente, pero no puede subirse a Firestore sin reducir adjuntos.');
      result.set(id,value);
    }
    return result;
  }
  function mapRemote(snapshot){
    return new Map(snapshot.docs.map(doc=>{
      const row=doc.data();
      return [doc.id,{revision:Number(row.revision||0),value:{kind:row.kind,recordId:row.recordId,payload:row.payload}}];
    }));
  }
  function hydrate(remote){
    const items=[...remote.values()].map(row=>row.value);
    const main=items.find(x=>x.kind==='settings'&&x.recordId==='main');
    if(!main||main.payload?.app!=='agora-compras-v1')throw Error('La nube no contiene una configuración de ÁGORA válida.');
    const data={...main.payload};
    for(const type of TYPES)data[type]=items.filter(x=>x.kind===type).map(x=>x.payload);
    return data;
  }
  function download(){
    const snapshot=local()?.snapshot();
    if(!snapshot)throw Error('ÁGORA aún está cargando.');
    const href=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=href;a.download='AGORA_RESPALDO_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
  }
  function closeAfterSuccess(){if(panel)panel.hidden=true;}
  function applyRemote(remote){
    applying=true;
    try{local().applyCloud(hydrate(remote));}
    finally{applying=false;}
    window.dispatchEvent(new CustomEvent('agora:cloud-applied'));
  }
  async function writeRevision(uid,id,value,expected){
    const ref=dbSdk.doc(fb.firestore,COL,id);
    await dbSdk.runTransaction(fb.firestore,async tx=>{
      const got=await tx.get(ref);
      const actual=got.exists()?Number(got.data().revision||0):0;
      if(actual!==expected)throw Error('Otro equipo actualizó '+id+'. No se sobrescribió. Revisa antes de reintentar.');
      if(value)tx.set(ref,{...value,revision:actual+1,updatedBy:uid,updatedAt:dbSdk.serverTimestamp()});
      else if(got.exists())tx.delete(ref);
    });
    if(value)baseline.set(id,{revision:expected+1,text:json(value)});
    else baseline.delete(id);
    await saveBase(uid);
  }
  function schedule(fast=false){
    if(!account||!role||applying)return;
    pending=true;clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>sync(false),fast?100:1200);
  }
  async function sync(adopt=false){
    if(inFlight){pending=true;return;}
    if(!account||!role||!appReady)return;
    if(!navigator.onLine){status('offline','No hay internet. Los cambios se guardan en este navegador y se enviarán automáticamente al reconectar.');return;}
    const uid=account.uid,stamp=authSerial,startEpoch=epoch;
    inFlight=true;pending=false;status('saving','Verificando los expedientes de Firebase...');
    try{
      let remote=mapRemote(await dbSdk.getDocsFromServer(dbSdk.collection(fb.firestore,COL)));
      if(stamp!==authSerial)return;
      if(!hasBase){
        const found=await loadBase(uid);hasBase=true;
        if(!found){
          const current=local().snapshot();
          const localRecords=TYPES.some(t=>current[t]?.length);
          if(remote.size){
            if(localRecords&&!adopt){
              status('setup','Firebase contiene información y este navegador tiene expedientes locales. Debes elegir una sola vez cómo continuar para evitar pérdidas.');
              return;
            }
            // Nunca subir automáticamente la copia local sobre los documentos existentes.
            await safety(uid,'Antes de adoptar Firebase');
            baseline=new Map([...remote].map(([id,row])=>[id,{revision:row.revision,text:json(row.value)}]));
            await saveBase(uid);
            if(stamp!==authSerial)return;
            if(epoch!==startEpoch){pending=true;return;}
            applyRemote(remote);
            status(editable()?'cloud':'consulta','Firebase es la fuente principal. Se guardó una copia local de seguridad.');
            closeAfterSuccess();
            return;
          }
          // La nube está vacía: conservar copia local y subir expedientes existentes.
          await safety(uid,'Primera carga en Firebase');
          baseline=new Map();await saveBase(uid);
        }
      }
      const current=mapLocal(local().snapshot());
      const ids=new Set([...current.keys(),...baseline.keys()]);
      const dirty=[...ids].filter(id=>json(current.get(id)||null)!==(baseline.get(id)?.text||null));
      const conflicts=dirty.filter(id=>{
        const mine=current.get(id)||null,there=remote.get(id)||null;
        return (baseline.get(id)?.revision||0)!==(there?.revision||0) && json(mine)!==json(there?.value||null);
      });
      if(conflicts.length){
        status('conflict','Se detectaron modificaciones simultáneas en '+conflicts.length+' expediente(s). Ningún dato fue sobrescrito. Conservamos ambas copias.');
        return;
      }
      if(dirty.length&&!editable()){
        status('consulta','Tu cuenta es de consulta. Los cambios locales se conservaron sin subirlos.');
        return;
      }
      for(const id of dirty){
        if(stamp!==authSerial)return;
        const value=current.get(id)||null,there=remote.get(id)||null;
        if(json(value)===json(there?.value||null)){
          if(value)baseline.set(id,{revision:there.revision,text:json(value)});
          else baseline.delete(id);
          await saveBase(uid);continue;
        }
        await writeRevision(uid,id,value,baseline.get(id)?.revision||0);
      }
      remote=mapRemote(await dbSdk.getDocsFromServer(dbSdk.collection(fb.firestore,COL)));
      if(stamp!==authSerial)return;
      if(epoch!==startEpoch){pending=true;return;}
      const snapshot=local().snapshot(),newData=hydrate(remote);
      if(json(snapshot)!==json(newData)){
        await safety(uid,'Actualización automática desde Firebase');
        if(epoch!==startEpoch){pending=true;return;}
        applyRemote(remote);
      }
      baseline=new Map([...remote].map(([id,row])=>[id,{revision:row.revision,text:json(row.value)}]));
      await saveBase(uid);
      status(editable()?'cloud':'consulta',editable()?'Firebase sincronizado. Los cambios posteriores se guardarán automáticamente en la nube y en este navegador.':'Datos recibidos de Firebase. Cuenta de consulta.');
      closeAfterSuccess();
    }catch(error){
      const problem=String(error?.message||error);
      if(!navigator.onLine||/offline|network|unavailable|failed to fetch/i.test(problem)){
        status('offline','Sin conexión con Firebase. Los cambios siguen a salvo localmente y se reintentarán al recuperar internet.');
      }else{
        status('error','No se pudo sincronizar: '+problem+' Se conservaron los cambios locales.');
        console.warn('ÁGORA nube',error);
      }
    }finally{
      inFlight=false;
      if(pending&&account&&role&&navigator.onLine&&!['setup','conflict'].includes(mode))schedule(true);
    }
  }
  async function allowUser(){
    if(role!=='admin')return;
    const uid=prompt('UID del colaborador:');
    if(!uid||!/^[A-Za-z0-9_-]{8,128}$/.test(uid))return;
    const email=prompt('Correo del colaborador:');if(!email?.includes('@'))return;
    const assigned=prompt('Rol: admin / coordinador / consulta','consulta');
    if(!ROLES.includes(assigned))return;
    await dbSdk.setDoc(dbSdk.doc(fb.firestore,'agora_users',uid),{email:email.toLowerCase().trim(),role:assigned,active:true,updatedAt:dbSdk.serverTimestamp()},{merge:true});
    status(mode,'Colaborador autorizado.');
  }
  function render(){
    if(!panel)return;
    const state=mode==='cloud'?'🟢 Conectado':mode==='offline'?'🟡 Sin internet':mode==='saving'?'◌ Sincronizando':mode==='setup'?'⚠ Primera conexión':mode==='conflict'?'⚠ Conflicto':mode==='consulta'?'🔵 Consulta':'◌ Copia local';
    panel.innerHTML='<div class="agora-cloud-head"><strong>☁ ÁGORA · Nube</strong><button data-cloud="close">✕ Cerrar</button></div>'+
      '<p><b>'+esc(state)+'</b></p><p>'+esc(message)+'</p>'+
      '<p class="agora-cloud-user">'+(account?esc(account.email)+' · '+esc(role||'Sin autorización'):'Sin sesión')+'</p>'+
      (account&&!role?'<p>Verifica tu UID y permisos en Firestore: '+esc(account.uid)+'</p>':'')+
      '<div class="agora-cloud-buttons">'+(account?'<button data-cloud="logout">Salir</button>':'<button data-cloud="login">Entrar con Google</button>')+
      (account?'<button data-cloud="uid">Copiar UID</button>':'')+
      (role?'<button data-cloud="backup">Descargar respaldo</button>':'')+
      (role&&mode!=='cloud'&&mode!=='consulta'?'<button data-cloud="sync">'+(mode==='setup'?'Revisar primera conexión':'Reintentar sincronización')+'</button>':'')+
      (role==='admin'?'<button data-cloud="users">Autorizar usuario</button>':'')+'</div>'+
      '<small>Los expedientes se respaldan automáticamente en este dispositivo. Firebase es el guardado principal al estar conectado.</small>';
  }
  function mount(){
    if(panel)return;
    const style=document.createElement('style');style.textContent='#agora-cloud-panel[hidden]{display:none!important}#agora-cloud-panel{position:fixed;top:84px;right:20px;width:min(380px,calc(100vw - 30px));max-height:calc(100dvh - 105px);overflow:auto;z-index:10000;background:#191713;color:#f1e9db;border:1px solid #ab8550;border-radius:12px;box-shadow:0 9px 25px #0008;padding:15px;font:12px/1.5 Arial,sans-serif}.agora-cloud-head{display:flex;justify-content:space-between;gap:9px;align-items:center}.agora-cloud-head strong{color:#ebc789;font-size:14px}.agora-cloud-head button,.agora-cloud-buttons button{background:#987542;color:#fff;border:1px solid #b68a4c;border-radius:7px;padding:8px 10px;cursor:pointer;font:inherit}.agora-cloud-buttons{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.agora-cloud-user{color:#d8c9af;overflow-wrap:anywhere}#agora-cloud-panel small{color:#d2c3a8}';
    document.head.append(style);panel=document.createElement('aside');panel.id='agora-cloud-panel';panel.hidden=true;document.body.append(panel);
    panel.addEventListener('click',async e=>{
      const action=e.target.closest('[data-cloud]')?.dataset.cloud;if(!action)return;
      try{
        if(action==='close'){panel.hidden=true;return;}
        if(action==='login')await authSdk.signInWithPopup(fb.auth,new authSdk.GoogleAuthProvider());
        if(action==='logout'){await authSdk.signOut(fb.auth);panel.hidden=true;}
        if(action==='uid'&&account)await navigator.clipboard.writeText(account.uid);
        if(action==='backup')download();
        if(action==='users')await allowUser();
        if(action==='sync'){
          if(mode==='setup'){
            if(!confirm('Firebase ya tiene expedientes y este equipo guarda información local. ¿Cargar la versión de Firebase? Se conservará una copia local automática antes de cambiarla.'))return;
            hasBase=false;await sync(true);
          }else await sync();
        }
      }catch(error){status('error',String(error?.message||error));}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')panel.hidden=true;});render();
  }
  async function checkUser(){
    if(!account)return false;
    const uid=account.uid;
    const ref=await dbSdk.getDoc(dbSdk.doc(fb.firestore,'agora_users',uid));
    if(!account||account.uid!==uid)return false;
    const item=ref.exists()?ref.data():null;
    role=item?.active===true&&ROLES.includes(item.role)?item.role:null;
    window.AGORA_STAFF_SESSION=role?Object.freeze({uid,role}):null;
    window.dispatchEvent(new CustomEvent(role?'agora:staff-ready':'agora:staff-offline',{detail:role?{uid,role}:{}}));
    return !!role;
  }
  async function afterAuth(user,stamp){
    if(!user){role=null;hasBase=false;baseline.clear();status('signedout','Inicia sesión para activar la nube. La copia local sigue disponible.');return;}
    if(!navigator.onLine){status('offline','Sin internet. Utiliza la copia local y sincronizaremos al reconectar.');return;}
    try{
      const ok=await checkUser();if(stamp!==authSerial)return;
      if(!ok){status('local','La cuenta todavía no tiene permisos en Firebase. La copia local permanece disponible.');return;}
      if(appReady)sync();
    }catch(error){status('offline','No pudimos comprobar tus permisos. Los datos permanecen guardados localmente.');}
  }
  function boot(){
    if(initialized||!window.AGORA_FIREBASE?.initialized)return;
    fb=window.AGORA_FIREBASE;initialized=true;mount();
    authSdk.onAuthStateChanged(fb.auth,user=>{
      account=user;const stamp=++authSerial;
      role=null;baseline.clear();hasBase=false;
      afterAuth(user,stamp);
    });
  }
  window.AGORA_CLOUD=Object.freeze({open:()=>{boot();if(panel){panel.hidden=false;render();}},sync:()=>sync()});
  window.addEventListener('agora:firebase-ready',boot);
  window.addEventListener('agora:local-ready',()=>{appReady=true;if(role)sync();});
  window.addEventListener('agora:local-saved',()=>{
    if(applying)return;
    epoch++;
    if(account&&role){
      if(!navigator.onLine){status('offline','Sin internet. Los cambios se guardaron aquí y están pendientes de sincronización.');return;}
      schedule();
    }
  });
  window.addEventListener('online',async()=>{
    if(!account)return;
    try{if(!role)await checkUser();if(role)schedule(true);}
    catch{status('offline','Reconectando con Firebase; datos locales conservados.');}
  });
  window.addEventListener('offline',()=>{if(account&&role)status('offline','Sin internet. Tus cambios se guardan localmente y se enviarán al reconectar.');});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&role&&account)schedule(true);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
