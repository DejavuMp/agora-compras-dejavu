/**
 * ÁGORA · estimador gratuito, deliberadamente NO navegación/tráfico.
 * No claves, pagos ni API de rutas. La geocodificación OSM es opcional:
 * sólo por clic del coordinador y nunca para direcciones privadas.
 *
 * OSMF Nominatim usage: https://operations.osmfoundation.org/policies/nominatim/
 * No autocompletar, máximo una solicitud/segundo, caché local, atribución.
 */
export const OSM_ATTRIBUTION="Geocodificación © colaboradores de OpenStreetMap (ODbL)";
const NOMINATIM="https://nominatim.openstreetmap.org/search";
const MAX_AGE=1000*60*60*24*30;
let lastRequest=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const valid=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
const coords=(lat,lon)=>valid(lat,lon)?{lat,lon}:null;
export function parsePoint(text){
  const s=String(text||"").trim();
  if(!s)return null;
  // Structured, explicit "lat, lon" and https://www.openstreetmap.org/#map=...
  let m=s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if(m)return coords(Number(m[1]),Number(m[2]));
  m=s.match(/(?:\/@|[?&#]map=\d+\/)(-?\d{1,2}(?:\.\d+)?)[,/+](-?\d{1,3}(?:\.\d+)?)/i);
  if(m)return coords(Number(m[1]),Number(m[2]));
  // Standard maps query coordinates, not private short links.
  m=s.match(/[?&](?:q|query|ll|center|destination|origin)=(-?\d{1,2}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i);
  if(m)return coords(Number(m[1]),Number(m[2]));
  return null;
}
export function distanceKm(a,b){
  if(!a||!b||!valid(a.lat,a.lon)||!valid(b.lat,b.lon))return null;
  const rad=Math.PI/180;
  const lat1=a.lat*rad,lat2=b.lat*rad,delta=(b.lon-a.lon)*rad;
  const x=Math.sin((lat2-lat1)/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(delta/2)**2;
  return 2*6371*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
}
const round5=v=>Math.max(5,Math.round(v/5)*5);
/**
 * Heurística de planificación, NO ruta por calle: recta geográfica multiplicada
 * por un desvío urbano y velocidad operativa genérica, sin consultar tráfico.
 * Nunca calcula minutos desde una dirección sin geocodificar verificablemente.
 */
export function approximateDrive(points){
  if(!Array.isArray(points)||points.length<2||points.length>6)throw Error("Selecciona entre dos y seis ubicaciones.");
  let direct=0;
  for(let i=1;i<points.length;i++){
    const d=distanceKm(points[i-1],points[i]);
    if(d===null)throw Error("Ubicación no válida.");
    direct+=d;
  }
  if(direct<0.08)return {distanceStraightKm:0,estimatedKm:0,minutes:5,minMinutes:5,maxMinutes:15,method:"cercanía"};
  const roadKm=direct*1.5;
  const speed=direct<18?24:direct<50?33:47;
  const raw=roadKm/speed*60+6+Math.max(0,points.length-2)*7;
  const min=round5(Math.max(5,raw*0.7)),max=round5(raw*1.45);
  return {distanceStraightKm:Number(direct.toFixed(1)),estimatedKm:Number(roadKm.toFixed(1)),
    minutes:round5(raw),minMinutes:min,maxMinutes:Math.max(min+5,max),
    method:"distancia geográfica + factor urbano, sin tráfico"};
}
const cacheKey=value=>"agora-public-route-v1:"+String(value).trim().toLocaleLowerCase("es-MX").slice(0,190);
function readCache(key,storage,now){
  try{
    const raw=storage?.getItem(key);if(!raw)return null;
    const record=JSON.parse(raw);
    if(!record||record.date>now||now-record.date>MAX_AGE||!valid(record.point?.lat,record.point?.lon))return null;
    return {point:record.point,label:record.label,fromCache:true};
  }catch{return null}
}
function storeCache(key,record,storage,now){
  try{storage?.setItem(key,JSON.stringify({date:now,point:record.point,label:record.label}))}catch{}
}
/**
 * ONLY user-initiated; no automatic lookup on typing or rendering.
 * Deliberately avoid sensitive origin names (home address etc.).
 * Caller must not feed personal addresses to the public service.
 */
export async function resolvePublicPlace(value,{
  fetcher=fetch,storage=typeof localStorage!=="undefined"?localStorage:null,
  now=()=>Date.now(),sleep=wait
}={}){
  const text=String(value||"").trim().slice(0,190);
  if(!text)throw Error("Indica la dirección pública o las coordenadas del lugar.");
  const direct=parsePoint(text);
  if(direct)return {point:direct,label:"Coordenadas proporcionadas",fromCache:true};
  const key=cacheKey(text),stored=readCache(key,storage,now());
  if(stored)return stored;
  if(text.length<9)throw Error("La dirección es demasiado breve. Escribe calle, colonia y municipio.");
  const elapsed=now()-lastRequest;
  if(elapsed<1250)await sleep(1250-elapsed);
  lastRequest=now();
  const url=NOMINATIM+"?format=jsonv2&countrycodes=mx&limit=1&addressdetails=0&q="+encodeURIComponent(text);
  const res=await fetcher(url,{method:"GET",headers:{Accept:"application/json"},referrerPolicy:"strict-origin-when-cross-origin"});
  if(!res.ok)throw Error("El servicio comunitario de mapas no está disponible. Captura los minutos manualmente.");
  const data=await res.json();
  if(!Array.isArray(data)||!data.length)throw Error("No se identificó la dirección. Revisa los datos o usa coordenadas.");
  const first=data[0],point=coords(Number(first.lat),Number(first.lon));
  if(!point)throw Error("El mapa devolvió coordenadas inválidas.");
  const record={point,label:String(first.display_name||text).slice(0,200),fromCache:false};
  storeCache(key,record,storage,now());
  return record;
}
/** Cap at two public addresses and two public stops. Explicit user click only. */
export async function estimatePublicRoute(origin,destination,stops="",options={}){
  const middle=String(stops||"").split(";").map(x=>x.trim()).filter(Boolean);
  if(middle.length>2)throw Error("Para estimar gratis, utiliza como máximo dos paradas. Puedes ajustar los minutos manualmente.");
  const addresses=[origin,...middle,destination];
  const matches=[];
  for(const address of addresses)matches.push(await resolvePublicPlace(address,options));
  const estimate=approximateDrive(matches.map(x=>x.point));
  return {...estimate,matches};
}
