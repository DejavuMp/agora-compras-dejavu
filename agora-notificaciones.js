(function notificationsRuntime(){
  const KEY="AGORA_ALERTAS_PROVEEDORES_V1";
  let feed=[],seen=new Set(),authorized=false,openBtn=null,box=null,toast=null,toastTimer=0;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  try{const saved=JSON.parse(localStorage.getItem(KEY)||"{}");feed=Array.isArray(saved.feed)?saved.feed.slice(0,70):[];seen=new Set(Array.isArray(saved.seen)?saved.seen.slice(0,400):[]);}catch{}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify({feed:feed.slice(0,70),seen:[...seen].slice(-400)}));}catch{}}
  const label=kind=>kind==="acuse"?"Acuse de recibido":"Cotización recibida";
  function render(){
    if(!openBtn||!box)return;
    const unread=feed.filter(x=>!x.read).length;
    openBtn.textContent="🔔 Notificaciones"+(unread?" · "+unread:"");
    openBtn.setAttribute("aria-label",unread+" notificaciones nuevas de proveedores");
    box.innerHTML='<div class="agora-alert-head"><strong>Notificaciones de proveedores</strong><button data-note="close" aria-label="Cerrar">✕ Cerrar</button></div>'+
      '<p class="agora-alert-muted">Avisos cuando un proveedor confirma o envía su cotización. Las respuestas se guardan en Firebase.</p>'+
      '<div class="agora-alert-list">'+(feed.length?feed.slice(0,30).map(x=>'<div class="agora-alert-entry"><b>'+esc(label(x.kind))+' · '+esc(x.folio)+'</b><div>'+esc(x.supplier)+'</div><small>'+esc(new Date(x.at).toLocaleString("es-MX"))+'</small></div>').join(""):'<p class="agora-alert-muted">Aún no hay confirmaciones o cotizaciones.</p>')+'</div>'+
      '<div class="agora-alert-actions"><button data-note="read">Marcar como leído</button><button data-note="permission">'+("Notification" in window&&Notification.permission==="granted"?"Avisos del navegador activos":"Activar avisos del navegador")+'</button></div>'+
      '<small>Los avisos del navegador funcionan cuando Ágora está abierta. Para recibir correos automáticos se necesita un servicio de envío.</small>';
  }
  function flash(title,details){
    if(!toast)return;
    toast.innerHTML='<b>'+esc(title)+'</b><div>'+esc(details)+'</div>';toast.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},6500);
    if("Notification" in window&&Notification.permission==="granted"){
      try{new Notification("ÁGORA · "+title,{body:details,tag:"agora-proveedor-"+Date.now()});}catch{}
    }
  }
  function ingest(records){
    if(!authorized||!Array.isArray(records))return;
    const events=[];
    for(const record of records){
      const p=record.request||{};
      const supplier=p.supplier?.name||"Proveedor";
      const folio=p.folio||p.id||"Solicitud";
      for(const [kind,at] of [["acuse",record.receivedAt],["cotizacion",record.submittedAt]]){
        if(!at?.seconds)continue;
        const id=record.token+":"+kind;
        if(seen.has(id))continue;
        seen.add(id);
        events.push({id,kind,folio,supplier,at:at.seconds*1000,read:false});
      }
    }
    if(!events.length)return;
    events.sort((a,b)=>a.at-b.at);
    for(const item of events){
      feed.unshift(item);
      // Solo avisar con un mensaje emergente sobre eventos recientes.
      if(Date.now()-item.at<20*60*1000)flash(label(item.kind),item.folio+" · "+item.supplier);
    }
    feed=feed.slice(0,70);
    persist();render();
  }
  function start(){
    const css=document.createElement("style");
    css.textContent='#agora-alert-bell{display:none!important;position:fixed;right:214px;bottom:18px;z-index:10030;background:#191714;color:#f3dbaa;border:1px solid #ac8648;border-radius:9px;padding:9px 12px;font:600 12px Arial;cursor:pointer}#agora-alert-box{position:fixed;right:20px;top:83px;bottom:auto;z-index:10031;width:min(380px,calc(100vw - 28px));max-height:62vh;overflow:auto;background:#1a1815;color:#f1e9da;border:1px solid #ac8648;border-radius:12px;padding:15px;box-shadow:0 8px 28px #0009;font:12px/1.45 Arial}#agora-alert-box[hidden],#agora-alert-toast[hidden],#agora-alert-bell[hidden]{display:none!important}.agora-alert-head{display:flex;justify-content:space-between;gap:6px;align-items:center}.agora-alert-head strong{color:#e5c58b;font-size:14px}.agora-alert-head button,.agora-alert-actions button{color:#f1d4a4;background:#4b3822;border:1px solid #ac8648;border-radius:6px;padding:7px 9px;cursor:pointer}.agora-alert-muted{color:#d5c9b9}.agora-alert-list{max-height:240px;overflow:auto}.agora-alert-entry{padding:9px 0;border-top:1px solid #4d402f}.agora-alert-entry small{display:block;color:#c9bba5;margin-top:2px}.agora-alert-actions{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}#agora-alert-toast{position:fixed;top:16px;right:16px;z-index:10035;width:min(360px,calc(100vw - 32px));padding:13px 16px;border-radius:10px;color:#2f281c;background:#f9efdc;border:1px solid #b68d49;box-shadow:0 5px 20px #0005;font:13px/1.5 Arial}body:has(#agora-invite-panel:not([hidden])) #agora-alert-bell{display:none!important}@media(max-width:650px){#agora-alert-bell{bottom:74px;right:8px}#agora-alert-box{right:8px;bottom:124px}}';
    document.head.append(css);
    openBtn=document.createElement("button");openBtn.id="agora-alert-bell";openBtn.hidden=true;openBtn.type="button";document.body.append(openBtn);
    box=document.createElement("section");box.id="agora-alert-box";box.hidden=true;box.setAttribute("aria-label","Notificaciones de proveedores");document.body.append(box);
    toast=document.createElement("div");toast.id="agora-alert-toast";toast.hidden=true;toast.setAttribute("role","status");document.body.append(toast);
    function toggleAlerts(){box.hidden=!box.hidden;if(!box.hidden){feed.forEach(x=>x.read=true);persist();render();}}
    openBtn.addEventListener("click",toggleAlerts);
    window.AGORA_NOTIFICATIONS=Object.freeze({open:()=>{if(!authorized){alert('Inicia sesión en ÁGORA · Nube para ver notificaciones.');return;}box.hidden=false;feed.forEach(x=>x.read=true);persist();render();}});
    box.addEventListener("click",async e=>{
      const action=e.target.closest("button[data-note]")?.dataset.note;
      if(action==="close")box.hidden=true;
      if(action==="read"){feed.forEach(x=>x.read=true);persist();render();}
      if(action==="permission"&&"Notification" in window){
        try{const result=await Notification.requestPermission();if(result==="granted")flash("Avisos activados","Recibirás avisos mientras Ágora esté abierta.");render();}
        catch{}
      }
    });
    document.addEventListener("keydown",e=>{if(e.key==="Escape")box.hidden=true;});
    render();
  }
  window.addEventListener("agora:provider-events",e=>ingest(e.detail));
  window.addEventListener("agora:staff-ready",()=>{authorized=true;if(openBtn)openBtn.hidden=false;render();if(Array.isArray(window.AGORA_PROVIDER_EVENTS))ingest(window.AGORA_PROVIDER_EVENTS);});
  window.addEventListener("agora:staff-offline",()=>{authorized=false;if(openBtn)openBtn.hidden=true;if(box)box.hidden=true;});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
  if(window.AGORA_STAFF_SESSION){authorized=true;queueMicrotask(()=>{if(openBtn)openBtn.hidden=false;if(Array.isArray(window.AGORA_PROVIDER_EVENTS))ingest(window.AGORA_PROVIDER_EVENTS);});}
})();
