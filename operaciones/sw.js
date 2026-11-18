/* ÁGORA Operaciones PWA. Solo shell estático, jamás Firestore, GPS, selfies, datos o credenciales. */
const CACHE="agora-ops-shell-v4-20261118";
const FILES=[
  "./visor.html","./index.html","./visor-live.js","./jornadas-live.js",
  "./jornadas-logic.mjs","./staff-dashboard.mjs","./ops-timekeeping.mjs","./ops-receipt.mjs","./ops-breaks.mjs","./ops-reminders.mjs","./ops-safe-view.mjs",
  "./cloud-v4.js","./editor-jornadas-control.mjs","./access-link-model.mjs",
  "./assets/dejavu-horizontal.png","./assets/dejavu-monograma.png",
  "./manifest.webmanifest","../icons/icon-192.png","../icons/icon-512.png"
];
const STATIC=new Set(FILES.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("agora-ops-shell-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||url.search||!STATIC.has(url.pathname))return;
  event.respondWith(fetch(req).then(response=>{
    if(response.ok&&response.type==="basic"){
      const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
    }
    return response;
  }).catch(()=>caches.match(req).then(cached=>cached||Response.error())));
});
