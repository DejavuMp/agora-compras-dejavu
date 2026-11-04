// ÁGORA Archivos · caché propio, independiente de Compras & Producción
const CACHE='agora-archivos-web-v2-fix-storage';
const ASSETS=['./','./index.html','./app.js','./style.css','./recibir.html','./recibir.js','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('agora-archivos-web-')&&x!==CACHE).map(x=>caches.delete(x)))),self.clients.claim()])
));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith(fetch(req).then(res=>{
    if(res.ok)caches.open(CACHE).then(cache=>cache.put(req,res.clone())).catch(()=>{});
    return res;
  }).catch(async()=>{
    const cached=await caches.match(req);
    if(cached)return cached;
    if(req.mode==='navigate')return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><title>Archivos sin conexión</title><body style="font:16px Arial;padding:36px"><h1>ÁGORA Archivos</h1><p>Sin conexión. La recepción de archivos y sus comprobantes necesitan conexión a Firebase. Vuelve a intentarlo en línea.</p></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8'}});
    return Response.error();
  }));
});
