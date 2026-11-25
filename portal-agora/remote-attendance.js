import {
 collection,collectionGroup,doc,getDocFromServer,getDocsFromServer,query,where,
 serverTimestamp,setDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const clean=value=>String(value??"").trim();
const geoError=error=>{
 if(error?.code===1)return "Permite la ubicación para solicitar el pase remoto.";
 if(error?.code===2)return "El teléfono no pudo obtener una ubicación. Activa GPS e inténtalo otra vez.";
 if(error?.code===3)return "La ubicación tardó demasiado. Revisa GPS y vuelve a intentar.";
 return "No se pudo obtener la ubicación del dispositivo.";
};
function locationOnce(){
 if(!navigator.geolocation)throw Error("Este dispositivo no ofrece ubicación GPS.");
 return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>{
  const {latitude:lat,longitude:lng,accuracy}=position.coords;
  if(![lat,lng,accuracy].every(Number.isFinite)||accuracy>150){
   reject(Error("La ubicación no fue lo bastante precisa. Activa el GPS y vuelve a intentar."));return;
  }
  resolve({lat,lng,accuracy});
 },error=>reject(Error(geoError(error))),{
  enableHighAccuracy:true,maximumAge:0,timeout:20000
 }));
}
const requestId=()=>"req_"+[...crypto.getRandomValues(new Uint8Array(16))]
 .map(value=>value.toString(16).padStart(2,"0")).join("");

export async function requestRemoteAttendance({db,uid,personId,personName,eventId,eventTitle,site,action}){
 if(!uid||!personId||!eventId||!["entrada","salida"].includes(action))
  throw Error("Falta la identidad o la jornada.");
 const sheetRef=doc(db,"agora_ops_attendance_sheets",eventId);
 const rosterRef=doc(db,"agora_ops_attendance_sheets",eventId,"roster",personId);
 const [sheetSnap,rosterSnap]=await Promise.all([
  getDocFromServer(sheetRef),getDocFromServer(rosterRef)
 ]);
 if(!sheetSnap.exists()||sheetSnap.data().active!==true||
    sheetSnap.data().validationMode!=="remoto")
  throw Error("Coordinación debe habilitar pase remoto para esta jornada.");
 if(!rosterSnap.exists()||rosterSnap.data().uid!==uid)
  throw Error("Tu identidad todavía no está vinculada al personal de esta jornada.");
 personName=String(rosterSnap.data().name||personName||"").trim();
 if(personName.length<2)throw Error("No se encontró el nombre registrado para esta jornada.");
 const ownRequests=await getDocsFromServer(query(
  collection(db,"agora_ops_attendance_sheets",eventId,"remote_requests"),
  where("ownerUid","==",uid)
 ));
 if(ownRequests.docs.some(item=>item.data().action===action&&item.data().status==="pendiente"))
  throw Error("Ya tienes una solicitud de "+action+" pendiente de revisión.");
 const entryId=personId+"__"+action+"__jornada";
 if((await getDocFromServer(doc(db,"agora_ops_attendance_sheets",eventId,"entries",entryId))).exists())
  throw Error("Esta "+action+" ya fue registrada para la jornada.");
 const location=await locationOnce();
 const capturedAt=serverTimestamp();
 const id=requestId();
 const ref=doc(db,"agora_ops_attendance_sheets",eventId,"remote_requests",id);
 await setDoc(ref,{
  id,eventId,eventTitle:String(eventTitle||sheetSnap.data().title||"Jornada").slice(0,160),
  site:String(site||sheetSnap.data().site||"").slice(0,160),
  personId,ownerUid:uid,personName,action,activityKey:"jornada",
  location,capturedAt,createdAt:serverTimestamp(),status:"pendiente",
  requestedBy:uid,reviewedBy:"",reviewedAt:null,validationNote:"",notes:""
 });
 return {id,location,capturedAt};
}

export async function loadOwnRemoteRequests(db,uid,target){
 if(!target||!uid)return;
 target.textContent="Consultando solicitudes remotas…";
 try{
  const snaps=await getDocsFromServer(query(collectionGroup(db,"remote_requests"),
   where("ownerUid","==",uid)));
  const rows=snaps.docs.map(s=>({id:s.id,...s.data()}));
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
   "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const time=value=>{
   const date=value?.toDate?value.toDate():new Date(value);
   return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("es-MX",{
    day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"
   }).format(date):"—";
  };
  const mapLink=row=>{
   const lat=Number(row.location?.lat),lng=Number(row.location?.lng);
   if(!Number.isFinite(lat)||!Number.isFinite(lng))return "";
   return '<a href="https://maps.google.com/?q='+encodeURIComponent(lat+","+lng)+
    '" target="_blank" rel="noopener noreferrer">Ver ubicación compartida</a>';
  };
  const status={pendiente:"Esperando validación",validado:"Pase confirmado",rechazado:"Requiere revisión"};
  rows.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  target.innerHTML=rows.length?rows.slice(0,8).map(row=>
   '<article class="remote-attendance-item"><b>'+esc(row.eventTitle||row.eventId)+
   ' · '+esc(row.action)+'</b><span>'+esc(status[row.status]||row.status)+
   '</span><small>'+esc(row.site||"")+' · Solicitado '+esc(time(row.capturedAt))+(
    row.reviewedBy?' · Revisó '+esc(row.reviewerName||"Responsable")+
     ' a las '+esc(time(row.reviewedAt)):"")+
   '</small>'+(mapLink(row)?'<small>'+mapLink(row)+'</small>':"")+
   (row.validationNote?'<small>'+esc(row.validationNote)+'</small>':"")+
   '</article>').join(""):'<p class="role-empty">Aún no hay solicitudes remotas.</p>';
 }catch(e){
  target.textContent="No fue posible consultar solicitudes remotas. Revisa la conexión.";
  console.warn("Solicitudes remotas:",e?.code||e);
 }
}
