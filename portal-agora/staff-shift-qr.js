import {newShiftQr,QR_LIFETIME_MS} from "./qr-jornada.mjs";
/**
 * QR personal POR JORNADA / ACTIVIDAD, separado del QR de identificación.
 * No escribe en Firestore. El supervisor debe validar la asignación.
 */
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const root=new URL("./",import.meta.url);
const sessions=new WeakMap();
function build(session){
 const {target,shift}=session;
 if(!target.isConnected)return;
 const activities=(shift.activities||[]).filter(x=>x.key&&x.name&&
   !/[/\\\s?#]/.test(x.key));
 const options=activities.map(a=>
   '<option value="'+esc(a.key)+'">'+esc(a.name)+'</option>').join("");
 target.innerHTML='<div class="qr-shift-header">'+
   '<strong>'+esc(shift.title)+'</strong>'+
   '<small>'+esc(shift.site||"")+'</small></div>'+
   '<label class="qr-shift-choice">QR para'+
    '<select id="qr-shift-activity"><option value="">Jornada completa · Entrada o salida</option>'+
      options+'</select></label>'+
   '<div class="qr-shift-preview">'+
    '<div id="qr-shift-image" class="qr-shift-image" aria-label="QR exclusivo de la jornada"></div>'+
    '<p id="qr-shift-status" role="status" aria-live="polite"></p></div>'+
   '<div class="qr-shift-buttons">'+
    '<button type="button" class="profile-button profile-button-primary" data-shift-refresh>Renovar QR</button>'+
    '<button type="button" class="profile-button profile-button-outline" data-shift-copy>Copiar enlace del QR</button></div>'+
   '<p class="qr-shift-disclaimer">Este QR sirve para que Coordinación confirme tu presencia en la jornada o actividad. No sustituye tu identificación Dejavú ni registra asistencia por sí solo. El coordinador debe escanearlo y confirmar.</p>';
 const select=target.querySelector("select");
 select.addEventListener("change",()=>makeQr(session));
 target.querySelector("[data-shift-refresh]").addEventListener("click",()=>makeQr(session));
 target.querySelector("[data-shift-copy]").addEventListener("click",async()=>{
  if(!session.link)return;
  try{
   await navigator.clipboard.writeText(session.link);
   target.querySelector("#qr-shift-status").textContent="Enlace copiado. Recuerda que caduca rápidamente.";
  }catch{
   target.querySelector("#qr-shift-status").textContent="No fue posible copiar automáticamente. Puedes usar el enlace mostrado.";
  }
 });
 makeQr(session);
}
function makeQr(session){
 const {target,shift}=session;
 const activityKey=target.querySelector("#qr-shift-activity")?.value||"";
 const container=target.querySelector("#qr-shift-image");
 const status=target.querySelector("#qr-shift-status");
 if(!container||!status)return;
 try{
  session.link=newShiftQr({
   root:root.href,uid:session.uid,personId:session.personId,
   eventId:shift.key,activityKey,now:Date.now()
  });
  container.replaceChildren();
  if(window.QRCode){
   new window.QRCode(container,{
    text:session.link,width:210,height:210,
    colorDark:"#151719",colorLight:"#ffffff",
    correctLevel:window.QRCode.CorrectLevel.L
   });
  }else{
   const link=document.createElement("a");
   link.href=session.link;link.textContent="Abrir enlace de la jornada";
   container.append(link);
  }
  status.textContent="QR de "+(activityKey?"actividad":"jornada")+
    " válido durante "+Math.floor(QR_LIFETIME_MS/1000)+
    " segundos. Muéstralo al coordinador o supervisor autorizado.";
 }catch(e){
  session.link="";
  container.replaceChildren();
  status.textContent="No se pudo generar el QR: "+String(e?.message||e);
 }
}
export function showShiftQr({target,uid,personId,shift}){
 if(!target||!uid||!personId||!shift?.key)return;
 const session={target,uid,personId,shift,link:""};
 sessions.set(target,session);
 build(session);
}
