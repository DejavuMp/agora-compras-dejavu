// Aviso discreto para aclarar que la app es en línea, pero los datos siguen en el equipo.
(()=>{
const css=document.createElement('style');css.textContent=`
#agora-web-bar{position:fixed;bottom:14px;right:14px;max-width:440px;z-index:9900;background:#171513;color:#eee5d4;border:1px solid #a58040;border-radius:12px;box-shadow:0 8px 32px #0007;padding:12px 14px;font:12px/1.4 Arial,sans-serif}
#agora-web-bar .agora-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#agora-web-bar .agora-desc{opacity:.9;font-size:11px;margin-top:5px}
#agora-web-bar button{font:inherit;cursor:pointer;background:transparent;color:#f3dcab;border:1px solid #94774e;padding:6px 9px;border-radius:7px}
#agora-web-bar button.agora-primary{background:#a78042;color:#fff;border-color:#a78042}
#agora-web-bar button.agora-close{border:0;padding:2px 5px;margin-left:auto}
@media(max-width:650px){#agora-web-bar{bottom:7px;left:8px;right:8px;max-width:none}}
`;document.head.append(css);
const el=document.createElement('aside');el.id='agora-web-bar';el.setAttribute('aria-label','Estado del guardado local');
el.innerHTML=`<div class="agora-row"><strong>✓ ÁGORA web · copia en este navegador</strong><button class="agora-close" aria-label="Ocultar aviso" title="Ocultar">×</button></div><div class="agora-desc">Los datos se conservan localmente; si activas Firebase en el panel de nube, comprueba que aparezca guardado en línea. Conserva respaldos.</div><div class="agora-row" style="margin-top:8px"><button class="agora-primary" id="agora-backup-shortcut">Descargar respaldo</button><button id="agora-protect">Proteger datos</button><span id="agora-net-status"></span></div>`;
document.body.append(el);
const net=el.querySelector('#agora-net-status');function refresh(){net.textContent=navigator.onLine?'En línea':'Sin conexión';net.style.color=navigator.onLine?'#c8e5b1':'#f1d08b'}refresh();addEventListener('online',refresh);addEventListener('offline',refresh);
el.querySelector('.agora-close').onclick=()=>{el.remove();};
el.querySelector('#agora-backup-shortcut').onclick=()=>{ const b=document.querySelector('[data-action="backup"]'); if(b){b.click()}else{ const nav=document.querySelector('[data-nav="respaldo"]');if(nav)nav.click();setTimeout(()=>document.querySelector('[data-action="backup"]')?.click(),250);} };
el.querySelector('#agora-protect').onclick=async e=>{if(!navigator.storage?.persist){e.target.textContent='No disponible en este navegador';return;}try{let granted=await navigator.storage.persist(); e.target.textContent=granted?'Protección solicitada ✓':'Usa respaldos frecuentes';}catch{e.target.textContent='Usa respaldos frecuentes';}};
})();

// Preparar el SDK modular de Firebase sin interferir con el funcionamiento local.
// Activar la sincronización requerirá Auth, reglas de acceso y migración revisada.
const agoraFirebaseScript = document.createElement('script');
agoraFirebaseScript.type = 'module';
agoraFirebaseScript.src = './firebase-init.js';
agoraFirebaseScript.onerror = () => console.warn('ÁGORA: No se pudo cargar el módulo Firebase. La app local sigue disponible.');
document.head.appendChild(agoraFirebaseScript);

// Herramientas de acceso de usuarios, backup y sincronización Firestore.
const agoraCloudScript=document.createElement('script');
agoraCloudScript.type='module';
agoraCloudScript.src='./agora-cloud.js';
agoraCloudScript.onerror=()=>console.warn('ÁGORA: No se pudo cargar la interfaz de nube. Sigue disponible el respaldo local.');
document.head.appendChild(agoraCloudScript);

// Formularios online para proveedores: enlace directo, sin adjuntos.
const agoraInvitesScript=document.createElement('script');
agoraInvitesScript.type='module';
agoraInvitesScript.src='./agora-invites.js';
agoraInvitesScript.onerror=()=>console.warn('ÁGORA: No se pudo cargar el envío online.');
document.head.appendChild(agoraInvitesScript);
