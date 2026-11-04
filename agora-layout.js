/* Ajustes visuales de ÁGORA - preserva los formularios y tokens existentes. */
(()=>{const css="/* ÁGORA · organización visual sin alterar el contenido ni los enlaces de proveedor */\n@media (min-width:721px) {\n  .shell.agora-side-hidden {grid-template-columns:minmax(0,1fr)!important}\n  .shell.agora-side-hidden > .side {display:none!important}\n  .topbar .hamburger {display:inline-flex!important}\n}\n.agora-top-actions {display:flex;align-items:center;gap:6px;flex-wrap:nowrap}\n.agora-top-action {\n  display:inline-flex;align-items:center;justify-content:center;gap:6px;\n  background:#fbfaf7;color:#5a4630;border:1px solid #e1d4bc;\n  border-radius:8px;padding:8px 10px;min-height:34px;cursor:pointer;\n  white-space:nowrap;font:600 12px Arial,Helvetica,sans-serif;\n}\n.agora-top-action:hover,.agora-top-action:focus-visible {background:#f3e7ce;outline-color:#b99353}\n.agora-status-control {display:inline-flex;align-items:center;gap:7px;color:#635740;font:700 11px Arial,Helvetica,sans-serif}\n.agora-status-control select {border:1px solid #d6c7a5;color:#362916;background:#fffaf1;border-radius:9px;padding:8px 12px;font:700 12px Arial,Helvetica,sans-serif;max-width:160px}\n.topbar .topright {gap:8px}\n#agora-cloud-panel {top:83px!important;right:20px!important;left:auto!important;bottom:auto!important;max-height:calc(100dvh - 105px)!important;width:min(380px,calc(100vw - 28px))!important}\n#agora-cloud-panel[hidden],#agora-web-bar[hidden] {display:none!important}\n@media (max-width:1180px) {\n  .agora-top-action span {display:none}\n  .topbar .agora-local-mark {display:none}\n}\n@media (max-width:720px) {\n  .topbar {padding:0 12px;gap:8px}\n  .topbar .topright {gap:6px}\n  .topbar .crumb .app-name,.topbar .crumb .sep {display:none}\n  .topbar .avatar {display:none}\n  .agora-top-action {min-width:31px;padding:6px 8px}\n  .agora-status-control {flex-wrap:wrap}\n  .agora-status-control select {max-width:100%}\n  #agora-cloud-panel {top:68px!important;right:8px!important;max-height:calc(100dvh - 82px)!important}\n}\n\n#agora-storage-badge{white-space:nowrap;font-weight:700}\n#agora-storage-badge[data-cloud-state=\"cloud\"]{background:#e7f7ed;color:#186b43}\n#agora-storage-badge[data-cloud-state=\"offline\"]{background:#fff1d9;color:#9b631b}\n#agora-storage-badge[data-cloud-state=\"pending\"]{background:#f2ebdc;color:#7d6338}\n#agora-storage-badge[data-cloud-state=\"error\"]{background:#fff0eb;color:#a24134}\n"; const style=document.createElement('style');style.id='agora-layout-20261103';style.textContent=css;document.head.appendChild(style);
  // Sólo un panel de trabajo abierto a la vez: evita que Nube, Envíos y Avisos se encimen.
  const panels={
    openinvites:'agora-invite-panel',
    opennotifications:'agora-alert-box',
    opencloud:'agora-cloud-panel'
  };
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-action="openinvites"],[data-action="opennotifications"],[data-action="opencloud"]');
    if(!trigger)return;
    const keep=panels[trigger.dataset.action];
    for(const id of Object.values(panels)){
      if(id===keep)continue;
      const element=document.getElementById(id);
      if(element)element.hidden=true;
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    for(const id of Object.values(panels)){
      const element=document.getElementById(id);
      if(element)element.hidden=true;
    }
  });
})();

/* Envío de archivos retirado de la navegación. Los expedientes históricos permanecen conservados. */
