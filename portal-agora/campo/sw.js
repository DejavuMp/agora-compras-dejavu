// Exclusivamente archivos estáticos de Campo. El portal y Firebase conservan su red normal.
const CACHE="agora-campo-static-v3";
const SHELL=["./","./index.html","./campo.css","./campo.mjs","./protocolos.mjs","./entregas.mjs","./manifest.webmanifest"];
const urls=new Set(SHELL.map(path=>new URL(path,self.location.href).href));
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(
 keys.filter(key=>key.startsWith("agora-campo-static-")&&key!==CACHE).map(key=>caches.delete(key))
)).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET"||!urls.has(event.request.url))return;
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request,{cacheName:CACHE})));
});
