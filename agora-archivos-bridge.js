/* ÁGORA · Archivos de producción para muestras. Acceso directo desde el menú principal. */
(()=>{
  function mount(){
    document.querySelectorAll('.side nav.nav').forEach(nav=>{
      if(nav.querySelector('.agora-archivos-nav'))return;
      const button=document.createElement('button');button.type='button';
      button.className='agora-archivos-nav';
      button.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8M8 13h8"/></svg>Archivos';
      button.title='Artes de producción, envío por Drive y acuse digital';
      button.addEventListener('click',()=>{location.href='./archivos.html';});
      const after=nav.querySelector('[data-nav="muestras"]');
      if(after)after.insertAdjacentElement('afterend',button);
      else{const backup=nav.querySelector('[data-nav="respaldo"]');if(backup)nav.insertBefore(button,backup);else nav.appendChild(button);}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  function start(){mount();const app=document.getElementById('app');if(app)new MutationObserver(mount).observe(app,{childList:true,subtree:true});}
})();
