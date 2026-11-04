'use strict';
const {onDocumentCreated,onDocumentUpdated}=require('firebase-functions/v2/firestore');
const {defineSecret,defineString}=require('firebase-functions/params');
const {logger}=require('firebase-functions');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
if(!getApps().length)initializeApp();
const db=getFirestore();
const apiKey=defineSecret('RESEND_API_KEY');
const mailFrom=defineString('AGORA_MAIL_FROM');
const baseUrl=defineString('AGORA_PUBLIC_BASE_URL');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function link(id){const origin=baseUrl.value().replace(/\/?$/,'/');return new URL('archivo-recibir.html#t='+encodeURIComponent(id),origin).toString();}
function validEmail(s){return typeof s==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<245;}
async function send(to,subject,html,eventId){
  const targets=[...new Set(to.filter(validEmail).map(x=>x.trim().toLowerCase()))];
  if(!targets.length)return;
  const resp=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+apiKey.value(),'Content-Type':'application/json','Idempotency-Key':eventId},body:JSON.stringify({from:mailFrom.value(),to:targets,subject,html})});
  if(!resp.ok){const detail=await resp.text();logger.error('No se pudo enviar la notificación',{code:resp.status,detail:detail.slice(0,400)});throw Error('Resend respondió '+resp.status);}
}
const frame=(title,body)=>`<!doctype html><html lang="es"><body style="margin:0;padding:26px;background:#f4f1ea;font-family:Arial,sans-serif;color:#302a22"><div style="max-width:570px;margin:auto;background:#fff;border:1px solid #e6d7bb;border-radius:12px;overflow:hidden"><div style="background:#1b1916;color:#e4c189;padding:22px;font-size:24px;letter-spacing:2px;font-weight:bold">ÁGORA <small style="font-size:11px;color:#c6b8a3;letter-spacing:0">Dejavú Marketing</small></div><div style="padding:25px"><h2 style="font-size:20px">${escape(title)}</h2>${body}<p style="font-size:11px;color:#80786b">Este correo es una notificación automática del sistema ÁGORA. Los acuses no constituyen firma electrónica certificada.</p></div></div></body></html>`;
function shareBody(data,id){return `<p>Dejavú Marketing te comparte archivos para revisión.</p><p><b>Proyecto:</b> ${escape(data.project)}<br><b>Archivo:</b> ${escape(data.title)}<br><b>Versión:</b> ${escape(data.version)}</p><p>Abre la carpeta de Drive, revisa las imágenes y registra en línea si recibiste los archivos o necesitas cambios.</p><p><a href="${escape(link(id))}" style="display:inline-block;background:#aa8347;color:#fff;text-decoration:none;padding:13px 19px;border-radius:7px">Revisar archivos y confirmar</a></p><p style="font-size:12px">El enlace es exclusivo de este envío y se mantendrá en las versiones siguientes.</p>`;}
exports.deliveryCreated=onDocumentCreated({document:'agora_file_deliveries/{id}',region:'us-central1',secrets:[apiKey]},async event=>{
  const d=event.data?.data();if(!d||!d.active)return;
  await send([d.recipientEmail],`ÁGORA · Archivos para revisar · ${d.title}`,frame('Archivos disponibles para revisión',shareBody(d,event.params.id)),event.id+'-created');
});
exports.deliveryRevised=onDocumentUpdated({document:'agora_file_deliveries/{id}',region:'us-central1',secrets:[apiKey]},async event=>{
  const before=event.data?.before?.data(),after=event.data?.after?.data();
  if(!before||!after||!after.active||after.version<=before.version)return;
  await send([after.recipientEmail],`ÁGORA · Nueva versión ${after.version} · ${after.title}`,frame('Nueva versión de archivos',shareBody(after,event.params.id)),event.id+'-revised');
});
exports.deliveryResponded=onDocumentCreated({document:'agora_file_responses/{id}/agora_file_reply_versions/{versionId}',region:'us-central1',secrets:[apiKey]},async event=>{
  const r=event.data?.data();if(!r?.deliveryId)return;
  const source=await db.doc('agora_file_deliveries/'+r.deliveryId).get();if(!source.exists)return;
  const d=source.data();const options={recibido:'Confirmó de recibido',aprobado:'Aprobó los archivos',cambios:'Solicitó cambios',no_recibido:'Reportó que no recibió los archivos'};
  const body=`<p>Se registró una respuesta a los archivos del proyecto <b>${escape(d.project)}</b>.</p><p><b>Estado:</b> ${escape(options[r.status]||r.status)}<br><b>Archivo:</b> ${escape(d.title)}<br><b>Versión:</b> ${escape(r.version)}<br><b>Respondió:</b> ${escape(r.receiverName)}<br><b>Correo declarado:</b> ${escape(r.receiverEmail)}</p><p><b>Comentarios:</b> ${escape(r.comments||'Sin comentarios')}</p><p><a href="${escape(link(r.deliveryId))}" style="color:#946d36">Ver expediente / constancia</a></p>`;
  // Copia solo al correo del destinatario originalmente registrado y al remitente.
  // Nunca enviar a receiverEmail: es un dato introducido por el visitante, no verificado.
  await send([d.createdByEmail,d.recipientEmail],`ÁGORA · ${options[r.status]||'Respuesta registrada'} · ${d.folio}`,frame('Respuesta registrada',body),event.id+'-responded');
});
