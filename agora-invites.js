import * as db from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
(function invitesRuntime(db){
  let fb=null,session=null,unsubscribe=null,panel=null,last=null,lastSeen=new Map(),cached=[];
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const msg=s=>{const e=document.getElementById("agora-invite-msg");if(e)e.textContent=s};
  function getUrls(token){
    const base=location.origin+location.pathname.replace(/\/[^/]*$/,"/")+"proveedor-online.html";
    return {
      acuse:base+"#t="+encodeURIComponent(token)+"&view=acuse",
      cotizar:base+"#t="+encodeURIComponent(token)+"&view=cotizar"
    };
  }
  const token=()=>{
    const raw=crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...raw)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  };
  function cleanData(input){
    const result=structuredClone(input);
    const bytes=obj=>new Blob([JSON.stringify(obj)]).size;
    let omitted=false;
    if(bytes(result)>770000){
      for(const item of result.items||[])if(item.image){item.image="";omitted=true;}
    }
    if(bytes(result)>770000)throw Error("La solicitud es demasiado pesada. Reduce las imágenes de los productos.");
    return {result,omitted};
  }
  function paint(){
    if(!panel)return;
    if(!session){panel.hidden=true;return;}
    panel.innerHTML='<div class="agora-invite-title"><button data-invite="close" class="agora-invite-close" aria-label="Cerrar el panel">✕ Cerrar</button><strong>✉ Formulario directo para proveedor</strong></div>'+
      '<p>Envía dos enlaces por correo. El proveedor confirma y cotiza sin descargar archivos.</p>'+
      '<div class="agora-invite-actions"><button data-invite="create">Generar enlace de la solicitud abierta</button></div>'+
      (last?'<div class="agora-invite-created"><strong>Enlace creado · '+esc(last.folio)+'</strong><p>Válido hasta '+esc(last.expiry)+'. Cualquiera que tenga el enlace podrá responder.</p>'+
      '<div class="agora-invite-actions"><button data-invite="gmail">Abrir correo en Gmail</button><button data-invite="copyrich">Copiar correo con botones</button><button data-invite="copyurl">Copiar enlace</button><button data-invite="preview">Ver formulario</button></div></div>':"")+
      '<p id="agora-invite-msg" role="status" aria-live="polite"></p><div class="agora-invite-actions"><button data-invite="close">Cerrar panel</button></div>';
  }
  function show(){
    if(!panel)return;
    panel.hidden=false;paint();
  }
  function openGmail(){
    if(!last)return;
    const subject="ÁGORA · Solicitud "+last.folio+" · Dejavú Marketing";
    const body="Buen día, "+(last.contact||last.supplierName||"")+
      "\n\nDejavú Marketing te envía la solicitud "+last.folio+
      ". Puedes confirmar su recepción y capturar tu cotización directamente en línea; no necesitas descargar ni reenviar archivos.\n\n"+
      "1. CONFIRMAR DE RECIBIDO:\n"+last.urls.acuse+
      "\n\n2. LLENAR COTIZACIÓN / RESPONDER:\n"+last.urls.cotizar+
      "\n\nEstos enlaces son personales para esta solicitud. No los compartas. Saludos, Dejavú Marketing.";
    const url="https://mail.google.com/mail/?view=cm&fs=1&to="+encodeURIComponent(last.email||"")+
      "&su="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
    window.open(url,"_blank","noopener,noreferrer");
    msg("Se abrió el borrador en Gmail; revisa y pulsa Enviar. Ágora no ha enviado el correo automáticamente.");
  }
  async function copyRich(){
    if(!last)return;
    const text="Solicitud "+last.folio+"\nConfirmar recibido: "+last.urls.acuse+"\nLlenar cotización: "+last.urls.cotizar;
    const html=`<div style="font:14px Arial,sans-serif;color:#23211c;max-width:620px">
      <h2 style="background:#171411;color:#d9b06f;padding:18px">ÁGORA · DEJAVÚ MARKETING</h2>
      <p>Buen día, ${esc(last.contact||last.supplierName)}.</p><p>Te compartimos la solicitud <strong>${esc(last.folio)}</strong>. Confirma la recepción y registra tu respuesta directamente en nuestra página.</p>
      <p><a href="${esc(last.urls.acuse)}" style="display:inline-block;background:#24211c;color:white;text-decoration:none;padding:12px 18px;border-radius:6px">Confirmar de recibido</a></p>
      <p><a href="${esc(last.urls.cotizar)}" style="display:inline-block;background:#b68d49;color:white;text-decoration:none;padding:12px 18px;border-radius:6px">Llenar cotización</a></p>
      <p>Los enlaces son exclusivos de esta solicitud. No necesitas adjuntar archivos.</p><p>Dejavú Marketing</p></div>`;
    if(navigator.clipboard?.write && typeof ClipboardItem!=="undefined"){
      await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([text],{type:"text/plain"})})]);
      msg("Correo con botones copiado. Pégalo en el cuerpo del mensaje de Gmail y envía.");
    }else{await navigator.clipboard.writeText(text);msg("Enlaces copiados. Pégalos en Gmail y envía.");}
  }
  async function create(){
    if(!session||!["admin","coordinador"].includes(session.role))throw Error("Necesitas una cuenta autorizada para enviar.");
    const provider=window.AGORA_LOCAL?.currentSupplierRequest?.();
    if(!provider)throw Error("Primero abre un presupuesto, solicitud de muestras o pedido.");
    if(!provider.supplier?.email)throw Error("Primero registra el correo del proveedor.");
    const {result,omitted}=cleanData(provider);
    const inviteId=token(),expiry=new Date(Date.now()+14*864e5);
    await db.setDoc(db.doc(fb.firestore,"provider_invites",inviteId),{
      version:1,createdBy:session.uid,createdAt:db.serverTimestamp(),updatedAt:db.serverTimestamp(),
      expiresAt:db.Timestamp.fromDate(expiry),request:result,status:"pendiente",
      receivedAt:null,receiver:"",submittedAt:null,response:null
    });
    last={
      folio:provider.folio,email:provider.supplier.email,supplierName:provider.supplier.name||"",
      contact:provider.supplier.contact||"",expiry:expiry.toLocaleDateString("es-MX"),urls:getUrls(inviteId)
    };
    show();
    msg(omitted?"Enlace creado. Se omitieron imágenes pesadas para que el formulario funcione; revisa el contenido antes de enviar.":"Enlace creado. Ahora abre Gmail o copia el correo con botones.");
  }
  function applyInvites(){
    if(!window.AGORA_LOCAL?.applyProviderInvitation)return;
    for(const obj of cached){
      if(!obj.receivedAt||!obj.request)continue;
      const stamp=[obj.status,obj.receivedAt?.seconds,obj.submittedAt?.seconds].join("/");
      if(lastSeen.get(obj.token)===stamp)continue;
      const applied=window.AGORA_LOCAL.applyProviderInvitation(obj);
      if(applied)lastSeen.set(obj.token,stamp);
    }
  }
  function begin(){
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    if(!session)return;
    unsubscribe=db.onSnapshot(db.collection(fb.firestore,"provider_invites"),snapshot=>{
      cached=snapshot.docs.map(x=>({token:x.id,...x.data()}));
      applyInvites();
      window.AGORA_PROVIDER_EVENTS=cached;
      window.dispatchEvent(new CustomEvent("agora:provider-events",{detail:cached}));
    },err=>msg("No se pudieron revisar respuestas: "+err.message));
  }
  function initPanel(){
    if(panel)return;
    const css=document.createElement("style");
    css.textContent="#agora-invite-open{position:fixed;right:14px;bottom:18px;z-index:10020;background:#ac8648;color:white;border:0;padding:10px 14px;border-radius:9px;cursor:pointer;font:600 12px Arial}#agora-invite-panel{position:fixed;right:14px;bottom:64px;z-index:10021;background:#171512;color:#eee5d9;border:1px solid #a78042;border-radius:12px;padding:15px;width:min(430px,calc(100vw - 28px));max-height:70vh;overflow:auto;box-shadow:0 10px 30px #0009;font:13px/1.5 Arial}#agora-invite-panel[hidden]{display:none}.agora-invite-title{font-weight:700;display:flex;justify-content:space-between;align-items:center;color:#e6bc79}.agora-invite-title{gap:10px;flex-wrap:wrap}.agora-invite-title button{background:#3a2e20;color:#f4d6a0;border:1px solid #a78042;border-radius:6px;padding:6px 9px;font:600 12px Arial;cursor:pointer}.agora-invite-actions{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.agora-invite-actions button{background:#a77e42;color:#fff;border:0;border-radius:6px;padding:9px;cursor:pointer;font:12px Arial}.agora-invite-created{border-top:1px solid #755c38;padding-top:8px}#agora-invite-msg{color:#e5c991;font-size:12px}";
    document.head.appendChild(css);
    const open=document.createElement("button");open.id="agora-invite-open";open.textContent="✉ Enviar formulario online";open.hidden=true;document.body.appendChild(open);
    panel=document.createElement("section");panel.id="agora-invite-panel";panel.hidden=true;document.body.appendChild(panel);
    open.addEventListener("click",show);
    document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&panel&&!panel.hidden)panel.hidden=true;});
    document.addEventListener("pointerdown",ev=>{if(panel&&!panel.hidden&&!panel.contains(ev.target)&&ev.target!==open)panel.hidden=true;});
    panel.addEventListener("click",async e=>{
      const action=e.target.closest("button[data-invite]")?.dataset.invite;if(!action)return;
      try{
        if(action==="close"){panel.hidden=true;return;}
        if(action==="create")await create();
        if(action==="gmail")openGmail();
        if(action==="copyrich")await copyRich();
        if(action==="copyurl"){await navigator.clipboard.writeText(last.urls.cotizar);msg("Enlace copiado.");}
        if(action==="preview")window.open(last.urls.cotizar,"_blank","noopener,noreferrer");
      }catch(err){msg("No se pudo completar: "+err.message);}
    });
  }
  function onSession(event){
    session=event.detail||null;
    const open=document.getElementById("agora-invite-open");
    if(open)open.hidden=!session||!["admin","coordinador"].includes(session.role);
    if(!session){last=null;cached=[];lastSeen.clear();if(panel)panel.hidden=true;}
    begin();
  }
  window.AGORA_INVITES=Object.freeze({open:()=>{init();if(!session){alert('Para enviar formularios online, primero entra con Google y autoriza tu cuenta como admin o coordinador.');return;}show();}});
  function init(){
    if(fb||!window.AGORA_FIREBASE?.initialized)return;
    fb=window.AGORA_FIREBASE;
    initPanel();
    if(window.AGORA_STAFF_SESSION)onSession({detail:window.AGORA_STAFF_SESSION});
  }
  window.addEventListener("agora:firebase-ready",init);
  window.addEventListener("agora:staff-ready",onSession);
  window.addEventListener("agora:staff-offline",()=>onSession({detail:null}));
  window.addEventListener("agora:local-ready",applyInvites);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})(db);
