/* Cálculos puros para jornadas y traslados: no alteran la hora oficial de Firebase. */
export const MINUTE=60000;
export const clampMinutes=(v,limit=1440)=>Math.max(0,Math.min(limit,Math.floor(Number(v)||0)));
export const instant=v=>{
  if(v?.toMillis)return v.toMillis();
  const n=typeof v==="number"?v:new Date(v).getTime();
  return Number.isFinite(n)?n:NaN;
};
export const when=(v)=>Number.isFinite(instant(v))?
  new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeStyle:"short"}).format(new Date(instant(v))):"Pendiente del servidor";
export function elapsedMinutes(start,end=Date.now()){
  const a=instant(start),b=instant(end);
  return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.floor((b-a)/MINUTE)):0;
}
export function allowedByPolicy(policy,now=Date.now()){
  if(!policy||policy.enabled!==true)return {ok:false,reason:"Acceso bloqueado por coordinación."};
  const first=instant(policy.startsAt),last=instant(policy.endsAt);
  if(!Number.isFinite(first)||!Number.isFinite(last)||now<first||now>last)
    return {ok:false,reason:"Fuera de la ventana autorizada."};
  if(!["horario","horas"].includes(policy.mode))
    return {ok:false,reason:"Modo de jornada no autorizado."};
  return {ok:true,reason:"Jornada habilitada."};
}
export function timeLeft(policy,startedAt,now=Date.now()){
  if(!policy||policy.enabled!==true)return 0;
  const policyEnd=instant(policy.endsAt);
  const cap=policy.mode==="horas"?
    instant(startedAt)+clampMinutes(policy.maxMinutes,1440)*MINUTE:policyEnd;
  const target=Math.min(policyEnd,cap);
  return Number.isFinite(target)?Math.max(0,Math.ceil((target-now)/MINUTE)):0;
}
export function estimatedArrival(departure,travelMin,bufferMin){
  const start=instant(departure);
  return Number.isFinite(start)?
    new Date(start+(clampMinutes(travelMin)+clampMinutes(bufferMin,180))*MINUTE):null;
}
export function gpsValid(p){
  return Number.isFinite(p?.latitude)&&p.latitude>=-90&&p.latitude<=90&&
    Number.isFinite(p?.longitude)&&p.longitude>=-180&&p.longitude<=180&&
    Number.isFinite(p?.accuracy)&&p.accuracy>=0&&p.accuracy<=10000;
}
export function mapsUrl(origin,destination){
  if(!destination)return "";
  const u=new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api","1");
  if(origin)u.searchParams.set("origin",origin);
  u.searchParams.set("destination",destination);
  u.searchParams.set("travelmode","driving");
  return u.toString();
}
