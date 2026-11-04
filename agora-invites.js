import * as db from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
(function invitesRuntime(db){
  let fb=null,session=null,unsubscribe=null,panel=null,last=null,lastSeen=new Map(),cached=[],selectedToken='',historyLoaded=false;
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
    if(bytes(result)>770000)throw Error("Las fotografías exceden el tamaño máximo de Firebase. Reduce su peso; ÁGORA no enviará solicitudes sin sus imágenes.");
    return {result,omitted:false};
  }

  const dateText=ts=>ts?.toDate?.().toLocaleString('es-MX')||'—';
  const statusName=r=>r.status==='cotizada'?(r.request?.kind==='sample'?'Muestras confirmadas':'Cotización recibida'):r.status==='recibida'?'Acuse recibido':r.status==='pendiente'?'Pendiente de acuse':r.status==='revocada'?'Cancelado':r.status||'—';
  function useExisting(record){
    if(!record?.token)throw Error('No se encontró el enlace original.');
    const p=record.request||{},supplier=p.supplier||{};
    last={folio:p.folio||p.id,kind:p.kind||'quote',email:supplier.email||'',supplierName:supplier.name||'',contact:supplier.contact||'',
      expiry:record.expiresAt?.toDate?.().toLocaleDateString('es-MX')||'—',urls:getUrls(record.token)};
    selectedToken=record.token;
  }
  function historyHtml(){
    const sorted=[...cached].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    const selected=cached.find(v=>v.token===selectedToken);
    let detail='';
    if(selected){
      const info=selected.response||{},general=info.general||{};
      const responses=(info.items||[]).slice(0,60).map(item=>{
        const origin=(selected.request?.items||[]).find(x=>String(x.id)===String(item.id))||{};
        const pairs=[['minRetail','Mínimo menudeo'],['retailCost','Precio menudeo'],['minWholesale','Mínimo mayoreo'],['wholesaleCost','Precio mayoreo'],['sampleCost','Costo de muestra'],['availability','Disponibilidad'],['comment','Comentarios']].filter(([key])=>item[key]!==undefined&&item[key]!==null&&String(item[key]).trim()).map(([key,label])=>'<span><b>'+esc(label)+':</b> '+esc(item[key])+'</span>').join(' · ');
        return '<div class="agora-history-product"><b>'+esc(origin.name||origin.product||item.id||'Concepto')+'</b><p>'+pairs+'</p></div>';
      }).join('');
      detail='<div class="agora-history-detail"><h4>Detalle del enlace seleccionado</h4>'+
        '<p><b>Solicitud:</b> '+esc(selected.request?.folio||'—')+' · <b>Estado:</b> '+esc(statusName(selected))+'</p>'+
        '<p><b>Registrado:</b> '+esc(dateText(selected.createdAt))+'<br><b>Acuse:</b> '+esc(dateText(selected.receivedAt))+
        '<br><b>Recibido por:</b> '+esc(selected.receiver||'—')+'<br><b>Cotización:</b> '+esc(dateText(selected.submittedAt))+'</p>'+
        (selected.status==='cotizada'?'<p><b>Empresa:</b> '+esc(info.company||'—')+' · <b>Contacto:</b> '+esc(info.email||'—')+'</p>'+responses+
          '<p><b>Plazo:</b> '+esc(general.deliveryDays||'—')+' · <b>Pago:</b> '+esc(general.paymentTerms||'—')+'</p>'+
          '<p><b>Comentarios:</b> '+esc(general.notes||'Sin comentarios')+'</p>':'<p>La respuesta completa aparecerá aquí cuando el proveedor termine de enviarla.</p>')+
        '<div class="agora-invite-actions"><button data-invite="reuse" data-token="'+esc(selected.token)+'">Usar este mismo enlace</button></div></div>';
    }
    return '<section class="agora-history"><div class="agora-history-head"><h3>Historial de enlaces y respuestas</h3><span>'+sorted.length+' enlace(s)</span></div>'+
      '<p class="agora-muted">Consultas de Firebase en tiempo real. Un enlace generado no confirma que el correo haya sido enviado.</p>'+
      (!historyLoaded?'<p>Consultando Firebase…</p>':sorted.length?'<div class="agora-history-list">'+sorted.slice(0,60).map(r=>
        '<div class="agora-history-row"><div><b>'+esc(r.request?.folio||r.request?.id||'Solicitud')+'</b><span>'+esc(r.request?.supplier?.name||'Proveedor')+'</span></div>'+
        '<div><strong>'+esc(statusName(r))+'</strong><small>'+esc(dateText(r.submittedAt||r.receivedAt||r.createdAt))+'</small></div>'+
        '<button data-invite="details" data-token="'+esc(r.token)+'">Ver respuesta</button></div>'
      ).join('')+'</div>':'<p>Sin enlaces registrados todavía.</p>')+detail+'</section>';
  }
  function paint(){
    if(!panel)return;
    if(!session){panel.hidden=true;return;}
    panel.innerHTML='<div class="agora-invite-title"><button data-invite="close" class="agora-invite-close" aria-label="Cerrar el panel">✕ Cerrar</button><strong>✉ Formulario directo para proveedor</strong></div>'+
      '<p>El proveedor recibe las fotos, confirma de recibido y responde en línea. Las muestras reutilizan los costos de la cotización original.</p>'+
      '<div class="agora-invite-actions"><button data-invite="create">Generar enlace de la solicitud abierta</button></div>'+
      (last?'<div class="agora-invite-created"><strong>Enlace creado · '+esc(last.folio)+'</strong><p>Válido hasta '+esc(last.expiry)+'. Cualquiera que tenga el enlace podrá responder.</p>'+
      '<div class="agora-invite-actions"><button data-invite="gmailphotos">Crear borrador Gmail con fotos y botones</button><button data-invite="gmail">Abrir Gmail (solo texto)</button><button data-invite="copyrich">Copiar correo con botones</button><button data-invite="copyurl">Copiar enlace</button><button data-invite="preview">Ver formulario</button></div></div>':"")+
      historyHtml()+
      '<p id="agora-invite-msg" role="status" aria-live="polite"></p><div class="agora-invite-actions"><button data-invite="close">Cerrar panel</button></div>';
  }
  function show(){
    if(!panel)return;
    panel.hidden=false;paint();
  }
  function openGmail(){
    if(!last)return;
    const subject="ÁGORA · "+(last.kind==='sample'?'Solicitud de muestras ':'Solicitud ')+last.folio+" · Dejavú Marketing";
    const body="Buen día, "+(last.contact||last.supplierName||"")+
      "\n\nDejavú Marketing te envía la solicitud "+last.folio+
      ". Puedes confirmar su recepción y "+(last.kind==='sample'?'responder la solicitud de muestras':'llenar tu cotización')+" directamente en línea.\n\n"+
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
    const text="Solicitud "+last.folio+"\nConfirmar recibido: "+last.urls.acuse+"\n"+(last.kind==='sample'?'Responder solicitud de muestras: ':'Llenar cotización: ')+last.urls.cotizar;
    const html=`<div style="font:14px Arial,sans-serif;color:#23211c;max-width:620px">
      <h2 style="background:#171411;color:#d9b06f;padding:18px">ÁGORA · DEJAVÚ MARKETING</h2>
      <p>Buen día, ${esc(last.contact||last.supplierName)}.</p><p>Te compartimos la solicitud <strong>${esc(last.folio)}</strong>. Confirma la recepción y registra tu respuesta directamente en nuestra página.</p>
      <p><a href="${esc(last.urls.acuse)}" style="display:inline-block;background:#24211c;color:white;text-decoration:none;padding:12px 18px;border-radius:6px">Confirmar de recibido</a></p>
      <p><a href="${esc(last.urls.cotizar)}" style="display:inline-block;background:#b68d49;color:white;text-decoration:none;padding:12px 18px;border-radius:6px">${last.kind==='sample'?'Responder solicitud de muestras':'Llenar cotización'}</a></p>
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
    if(!historyLoaded)throw Error('Estamos revisando los enlaces existentes. Intenta nuevamente cuando cargue el historial.');
    const old=cached.find(v=>v.request?.id===provider.id && v.request?.kind===provider.kind &&
      String(v.request?.supplier?.email||'').toLowerCase()===provider.supplier.email.toLowerCase() &&
      v.status!=='revocada' && (!v.expiresAt?.toDate || v.expiresAt.toDate()>new Date()));
    if(old){
      const {result:latest}=cleanData(provider);
      if(JSON.stringify(old.request)===JSON.stringify(latest)){
        useExisting(old);show();msg('Ya existía un enlace para esta solicitud. Se recuperó el mismo enlace.');return;
      }
      if(old.status!=='pendiente')throw Error('Este enlace ya tiene acuse o respuesta. Para cambiar las referencias, genera una nueva solicitud de muestras sin alterar la que ya respondió el proveedor.');
      if(!confirm('Cambiaste fotos, Drive o indicaciones después de crear el enlace. ¿Cancelar el enlace anterior y crear uno nuevo? Si ya enviaste el correo, el enlace anterior dejará de funcionar.'))return;
      await db.updateDoc(db.doc(fb.firestore,'provider_invites',old.token),{status:'revocada',updatedAt:db.serverTimestamp()});
    }

    const {result,omitted}=cleanData(provider);
    const inviteId=token(),expiry=new Date(Date.now()+14*864e5);
    await db.setDoc(db.doc(fb.firestore,"provider_invites",inviteId),{
      version:1,createdBy:session.uid,createdAt:db.serverTimestamp(),updatedAt:db.serverTimestamp(),
      expiresAt:db.Timestamp.fromDate(expiry),request:result,status:"pendiente",
      receivedAt:null,receiver:"",submittedAt:null,response:null
    });
    last={
      folio:provider.folio,kind:provider.kind,email:provider.supplier.email,supplierName:provider.supplier.name||"",
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
      cached=snapshot.docs.map(x=>({token:x.id,...x.data()}));historyLoaded=true;
      applyInvites();
      window.AGORA_PROVIDER_EVENTS=cached;
      window.dispatchEvent(new CustomEvent("agora:provider-events",{detail:cached}));
      if(panel&&!panel.hidden)paint();
    },err=>msg("No se pudieron revisar respuestas: "+err.message));
  }
  function initPanel(){
    if(panel)return;
    const css=document.createElement("style");
    css.textContent="#agora-invite-open{display:none!important;position:fixed;right:14px;bottom:18px;z-index:10020;background:#ac8648;color:white;border:0;padding:10px 14px;border-radius:9px;cursor:pointer;font:600 12px Arial}#agora-invite-panel{position:fixed;right:20px;top:83px;bottom:auto;z-index:10021;background:#171512;color:#eee5d9;border:1px solid #a78042;border-radius:12px;padding:15px;width:min(570px,calc(100vw - 28px));max-height:calc(100dvh - 105px);overflow:auto;box-shadow:0 10px 30px #0009;font:13px/1.5 Arial}#agora-invite-panel[hidden]{display:none}.agora-invite-title{font-weight:700;display:flex;justify-content:space-between;align-items:center;color:#e6bc79}.agora-invite-title{gap:10px;flex-wrap:wrap}.agora-invite-title button{background:#3a2e20;color:#f4d6a0;border:1px solid #a78042;border-radius:6px;padding:6px 9px;font:600 12px Arial;cursor:pointer}.agora-invite-actions{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.agora-invite-actions button{background:#a77e42;color:#fff;border:0;border-radius:6px;padding:9px;cursor:pointer;font:12px Arial}.agora-invite-created{border-top:1px solid #755c38;padding-top:8px}#agora-invite-msg{color:#e5c991;font-size:12px}";
    css.textContent+='#agora-history-panel{background:#191612}.agora-history{border-top:1px solid #806437;margin-top:15px;padding-top:11px}.agora-history-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.agora-history-head h3{font-size:14px;margin:0;color:#e3c389}.agora-history-head span,.agora-muted{color:#c0b39c;font-size:11px}.agora-history-list{display:grid;gap:7px;max-height:260px;overflow:auto;margin-top:10px}.agora-history-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;align-items:center;gap:7px;background:#28231c;border:1px solid #493927;border-radius:8px;padding:9px}.agora-history-row span,.agora-history-row small{display:block;color:#c5b8a3;font-size:10px}.agora-history-row strong{color:#e6c58f;font-size:11px}.agora-history-row button{padding:7px;background:#47341d;border:1px solid #9e7843;border-radius:5px;color:#efd9b6;cursor:pointer}.agora-history-detail{border:1px solid #947244;border-radius:9px;padding:11px;margin-top:13px;background:#252019}.agora-history-detail h4{font-size:13px;margin:0 0 10px;color:#e5be7b}.agora-history-product{border-top:1px solid #604c30;padding:8px 0}.agora-history-product p{color:#e6ddc9;line-height:1.6;overflow-wrap:anywhere}@media(max-width:650px){#agora-invite-panel{top:66px;right:8px;max-height:calc(100dvh - 80px)}.agora-history-row{grid-template-columns:1fr 1fr}.agora-history-row button{grid-column:span 2}}';
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
        if(action==="details"){selectedToken=e.target.closest('[data-token]')?.dataset.token||'';paint();return;}
        if(action==="reuse"){const selected=cached.find(x=>x.token===e.target.closest('[data-token]')?.dataset.token);useExisting(selected);paint();msg('Se recuperó el enlace original. No se generó uno nuevo.');return;}
        if(action==="gmailphotos"){
          if(!last)throw Error('Primero genera o recupera el enlace.');
          msg('Preparando borrador Gmail con las fotografías...');
          const result=await window.AGORA_LOCAL?.createOnlineInviteGmailDraft?.(last.urls,last.folio);
          if(!result)throw Error('Actualiza ÁGORA para habilitar el correo con fotos.');
          msg(result.imageState==='missing'?'El borrador se creó, pero faltan imágenes. No lo envíes.':'Borrador creado. Imágenes verificadas: '+result.foundImages+'/'+result.expectedImages+'. Revisa y envía desde Gmail.');
          window.open('https://mail.google.com/mail/u/0/#drafts','_blank','noopener,noreferrer');
        }
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
    if(!session){last=null;cached=[];selectedToken='';historyLoaded=false;lastSeen.clear();if(panel)panel.hidden=true;}
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
  window.addEventListener('agora:cloud-applied',applyInvites);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})(db);
