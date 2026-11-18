/** Rutas gratuitas: sólo geometría local o geocodificación por clic explícito. */
import assert from "node:assert/strict";
import {
 parsePoint,distanceKm,approximateDrive,resolvePublicPlace,estimatePublicRoute,OSM_ATTRIBUTION
} from "../ops-route-estimate.mjs";
const center={lat:19.4326,lon:-99.1332},south={lat:19.354,lon:-99.180};
assert.deepEqual(parsePoint("19.4326,-99.1332"),center);
assert.deepEqual(parsePoint("https://www.openstreetmap.org/#map=17/19.4326/-99.1332"),center);
assert.deepEqual(parsePoint("https://www.google.com/maps/place/foo/@19.4326,-99.1332,17z"),center);
assert.deepEqual(parsePoint("https://www.google.com/maps?q=19.4326,-99.1332"),center);
assert.equal(parsePoint("99,190"),null);
assert.equal(parsePoint("Dirección sin coordenadas"),null);
const d=distanceKm(center,south);
assert.ok(d>5&&d<20,"Distancia de prueba en CDMX");
const estimate=approximateDrive([center,south]);
assert.ok(estimate.minutes>5&&estimate.minutes<100);
assert.ok(estimate.minMinutes<estimate.minutes&&estimate.maxMinutes>estimate.minutes);
assert.ok(estimate.estimatedKm>estimate.distanceStraightKm);
assert.equal(approximateDrive([center,center]).minutes,5);
assert.throws(()=>approximateDrive([center]),/ubicaciones/i);
assert.throws(()=>approximateDrive([center,{lat:99,lon:10}]),/válida/);
assert.ok(OSM_ATTRIBUTION.includes("OpenStreetMap"));
const saved=new Map(),storage={
 getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)
};
let requests=0,tick=1_000_000;
const now=()=>{tick+=1450;return tick;};
const fetcher=async url=>{
 requests++;
 assert.ok(String(url).startsWith("https://nominatim.openstreetmap.org/search?"));
 assert.ok(String(url).includes("countrycodes=mx"));
 return {ok:true,json:async()=>[{lat:"19.4326",lon:"-99.1332",display_name:"Centro Histórico, CDMX"}]};
};
const place=await resolvePublicPlace("Centro Histórico, Ciudad de México",{fetcher,storage,now});
assert.equal(place.point.lat,19.4326);
assert.equal(place.fromCache,false);
const cached=await resolvePublicPlace("Centro Histórico, Ciudad de México",{fetcher,storage,now});
assert.equal(cached.fromCache,true);
assert.equal(requests,1,"La misma dirección se consulta una vez y se conserva localmente.");
const coordsOnly=await estimatePublicRoute("19.4326,-99.1332","19.354,-99.180","",{fetcher:()=>{throw Error("No debe enviar coordenadas")}});
assert.ok(coordsOnly.minutes>0);
assert.equal(requests,1);
await assert.rejects(estimatePublicRoute("A","B","C;D;E",{fetcher,storage,now}),/dos paradas/);
await assert.rejects(resolvePublicPlace("Calle pública sin resultado",{fetcher:async()=>({ok:true,json:async()=>[]}),storage,now}),/No se identificó/);
console.log("OK estimación gratuita: coordenadas, caché, rango honesto y consultas OSM por clic.");
