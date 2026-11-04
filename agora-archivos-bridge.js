/* Vincula Envío de Archivos con la navegación existente de ÁGORA,
 * sin modificar la lógica ni los enlaces actuales de Pedidos. */
(()=>{
  function install(){
    document.querySelectorAll('.side nav.nav').forEach(nav=>{
      if(nav.querySelector('.agora-archivos-nav'))return;
      const link=document.createElement('button');link.type='button';link.className='agora-archivos-nav';
      link.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>Envío de archivos';
      link.title='Abrir centro de envío, recepción y cambios de archivos';
      link.addEventListener('click',()=>{location.href='./archivos.html';});
      const final=nav.querySelector('[data-nav="respaldo"]');if(final)nav.insertBefore(link,final);else nav.append(link);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  function start(){install();const app=document.getElementById('app');if(app)new MutationObserver(install).observe(app,{childList:true,subtree:true});}
})();
