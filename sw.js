// Solo cachea la aplicación pública. No lee ni sube datos de IndexedDB.
const CACHE='agora-compras-web-v11-firebase-20261103';
const ASSETS=['./','./index.html','./agora-app.js','./supplier-template.js','./web-status.js','./firebase-init.js','./agora-cloud.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('agora-compras-web-')&&x!==CACHE).map(x=>caches.delete(x)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;let u=new URL(r.url);if(u.origin!==self.location.origin)return;
e.respondWith(fetch(r).then(resp=>{if(resp.ok){let clone=resp.clone();caches.open(CACHE).then(c=>c.put(r,clone)).catch(()=>{});}return resp;}).catch(()=>caches.match(r).then(hit=>hit||((r.mode==='navigate')?caches.match('./index.html'):Response.error()))));
});
