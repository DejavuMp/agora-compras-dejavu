import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,reauthenticateWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,collectionGroup,onSnapshot,serverTimestamp,Timestamp,setDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {DRIVE_SCOPE,uploadDriveImages} from './drive-upload.js';
import {galleryHtml,imageLinkInfo} from './image-preview.js';
import {evidenceEmailHtml,evidenceEmailPlain} from './email-evidence.js';
import {GMAIL_SEND_SCOPE,loadInlineImages,renderEmailEvidence,imageEvidenceCount,buildGmailMime,sendGmailInline} from './email-inline.js';

// Usa el proyecto Firebase existente de ÁGORA Pedidos. Estas son claves de cliente públicas.
const config={apiKey:'AIzaSyDPh-AFdST9Ax_Eoho-wT0shlWlCHad6Zg',authDomain:'agora-dejavu-38b8c.firebaseapp.com',projectId:'agora-dejavu-38b8c',storageBucket:'agora-dejavu-38b8c.firebasestorage.app',messagingSenderId:'775680965171',appId:'1:775680965171:web:274557c8c9c25ff304c146'};
const app=getApps()[0]||initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
window.__AGORA_FILES_BOOT?.mark('module-ready');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>d?.toDate?d.toDate().toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Mexico_City'}):'—';
const fmtTime=d=>d?.toDate?d.toDate().toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}):'—';
const statuses={pendiente:'Pendiente',recibido:'Recibido',aprobado:'Aprobado',cambios:'Solicitan cambios',no_recibido:'No recibido',vencido:'Vencido',revocado:'Revocado'};
const safeHttps=url=>{try{let u=new URL(url);return u.protocol==='https:'?u.href:'';}catch{return '';}};
// 32 bytes de aleatoriedad; cada byte representa exactamente 6 bits en el alfabeto de 64 caracteres.
const secret=()=>{let bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');};
const urlFor=id=>new URL('./recibir.html',location.href).href+'#t='+id;
const assetHtml=(arr,heading)=>galleryHtml(arr,heading);
let user=null,role=null,deliveries=[],responses=new Map(),editRecord=null,openRecord=null,subscriptions=[],readyDeliveries=false,readyResponses=false,firstResponses=true;
let sampleSelected=[],folderSelected=[],editorMode='new',emailRecord=null;
let emailImages=[],emailFailures=[],emailPreviewUrls=[],emailLoadSerial=0,emailSending=false,emailSent=false;
function notify(msg,error=false){$('alert').textContent=msg;$('alert').className='alert'+(error?' error':'');$('alert').hidden=false;setTimeout(()=>{if($('alert').textContent===msg)$('alert').hidden=true;},8500);}
function authRequired(){if(!user||!['admin','coordinador'].includes(role))throw new Error('Inicia sesión con una cuenta de ÁGORA autorizada (admin o coordinador).');}
function responseFor(id,version){return responses.get(`${id}_v${version}`)||null;}
function statusFor(r){if(!r.active)return 'revocado';const response=responseFor(r.id,r.version);if(response)return response.status;if(r.validUntil?.toMillis?.()<Date.now())return 'vencido';return 'pendiente';}
function selectedRevisions(r){return Array.isArray(r.revisions)?r.revisions:[];}
function imagesToDisplay(files,slot){const preview=$(slot),current=files;preview.innerHTML=current.map((file,i)=>`<div class="preview-item"><img alt="${esc(file.name)}" src="${esc(file.preview)}"><button type="button" data-remove="${i}" aria-label="Quitar imagen">×</button></div>`).join('');preview.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>{const k=Number(btn.dataset.remove);URL.revokeObjectURL(files[k].preview);files.splice(k,1);imagesToDisplay(files,slot);}));}
function addFiles(input,arr,slot,max){const chosen=Array.from(input.files||[]);if(chosen.length+arr.length>max){notify(`Máximo ${max} imágenes en esta sección.`,true);input.value='';return;}for(const file of chosen){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){notify('Las imágenes deben ser JPG, PNG o WEBP y pesar menos de 12 MB cada una.',true);continue;}arr.push({file,name:file.name,preview:URL.createObjectURL(file)});}imagesToDisplay(arr,slot);input.value='';}
function readImageUrls(el,max){const values=String($(el).value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(values.length>max)throw Error(`Demasiadas URL de imágenes (${max} máximo).`);for(const raw of values){const info=imageLinkInfo(raw);if(!info.original)throw Error('Una imagen tiene un enlace no válido. Usa https://');if(['folder','document','unknown-drive'].includes(info.type))throw Error('Pega el enlace individual de la foto, no el de una carpeta o documento de Drive.');}return values;}

function updateLinkPreviews(){
 for(const [id,title] of [['sampleUrls','Vistas de artes enlazados'],['folderUrls','Imágenes de archivos en Drive']]){
  const input=$(id),holder=$(id+'LinkPreview');
  if(!input||!holder)continue;
  const values=String(input.value||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  holder.innerHTML=values.length?galleryHtml(values,title):'<p class="agora-preview-empty">Pega el enlace individual de una imagen y aparecerá aquí su vista previa.</p>';
 }
}
function setupLinkPreviews(){
 for(const id of ['sampleUrls','folderUrls']){
  const field=$(id);if(!field||$(id+'LinkPreview'))continue;
  const wrap=document.createElement('div');wrap.id=id+'LinkPreview';wrap.className='agora-link-previews';
  field.insertAdjacentElement('afterend',wrap);
  field.addEventListener('input',updateLinkPreviews);
 }
 updateLinkPreviews();
}
function clearFiles(){for(const v of [...sampleSelected,...folderSelected])URL.revokeObjectURL(v.preview);sampleSelected=[];folderSelected=[];imagesToDisplay(sampleSelected,'samplePreview');imagesToDisplay(folderSelected,'folderPreview');$('sampleFiles').value='';$('folderFiles').value='';}
function openEditor(record=null,mode='revision'){try{authRequired();}catch(e){notify(e.message,true);return;}editRecord=mode==='duplicate'?null:record;editorMode=record?mode:'new';if(uploadProgress){uploadProgress.hidden=true;uploadProgress.dataset.error='0';uploadMeter.value=0;uploadMeter.hidden=false;uploadStatus.textContent='';}$('deliveryForm').reset();clearFiles();$('formTitle').textContent=record?(editorMode==='duplicate'?'Duplicar expediente · nuevo enlace':editorMode==='edit'?'Editar expediente · '+record.folio:'Publicar nueva versión de archivos'):'Enviar archivos para fabricar muestras';$('formSubtitle').textContent=record?(editorMode==='duplicate'?'Se copiarán los datos e imágenes a un envío nuevo con un enlace y acuse independientes. Puedes corregir al destinatario.':editorMode==='edit'?(record.active?'Corrige datos y fotografías conservando el enlace y la versión.':'Este expediente está revocado. Puedes editarlo para uso interno; el enlace seguirá desactivado.'):'Se crea la versión '+(record.version+1)+' y se conserva el mismo enlace.'):'Crea un expediente que se guarda directamente en Firebase.';$('saveButton').textContent=record?(editorMode==='duplicate'?'Publicar nuevo envío':editorMode==='edit'?'Guardar cambios':'Publicar versión '+(record.version+1)):'Publicar envío';$('sampleUrls').value=record?.sampleImages?.join('\n')||'';$('folderUrls').value=record?.folderImages?.join('\n')||'';const f=$('deliveryForm');for(const key of ['project','category','title','recipientName','recipientEmail','driveUrl','notes']){if(record)f.elements[key].value=record[key]||'';}f.elements.recipientName.readOnly=!!record&&editorMode!=='duplicate';f.elements.recipientEmail.readOnly=!!record&&editorMode!=='duplicate';const today=new Date();const y=today.getFullYear(),m=String(today.getMonth()+1).padStart(2,'0'),d=String(today.getDate()).padStart(2,'0');f.elements.validUntil.min=`${y}-${m}-${d}`;const prev=record?.validUntil?.toDate?.();const defaultUntil=new Date(today.getTime()+14*86400000);const target=prev&&prev>today?prev:defaultUntil;f.elements.validUntil.value=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
 if(!record){
   const handoff=(()=>{try{return JSON.parse(sessionStorage.getItem('agora_sample_file_context')||'null')}catch{return null}})();
   if(handoff?.sampleFolio){
     f.elements.project.value=(String(handoff.sampleFolio)+' · '+String(handoff.project||'')).slice(0,120);
     f.elements.category.value='Artes para muestras';
     f.elements.title.value=String(handoff.title||'Artes de producción').slice(0,160);
     f.elements.recipientName.value=String(handoff.recipientName||'').slice(0,120);
     f.elements.recipientEmail.value=String(handoff.recipientEmail||'').slice(0,240);
     f.elements.driveUrl.value=String(handoff.driveUrl||'').slice(0,2048);
     f.elements.notes.value=('Archivos de aplicación para '+String(handoff.sampleFolio)+'.\n'+String(handoff.notes||'')).slice(0,3000);
     if(Array.isArray(handoff.driveImageUrls))$('sampleUrls').value=handoff.driveImageUrls.filter(u=>/^https:\/\//.test(u)).slice(0,8).join('\n');
     sessionStorage.removeItem('agora_sample_file_context');
   }
 }updateLinkPreviews();$('editorOverlay').hidden=false;document.body.style.overflow='hidden';}
function disposeEmailPhotos(){++emailLoadSerial;for(const url of emailPreviewUrls)URL.revokeObjectURL(url);emailPreviewUrls=[];emailImages=[];emailFailures=[];emailSent=false;}
function closeModals(){disposeEmailPhotos();emailRecord=null;for(const id of ['editorOverlay','detailOverlay','emailOverlay'])$(id).hidden=true;document.body.style.overflow='';}
function recordLine(r){const state=statusFor(r);const recipient=r.recipientName||'—';return `<tr><td><strong>${esc(r.title)}</strong><small>${esc(r.folio||'Sin folio')} · Versión ${r.version}</small></td><td>${esc(r.project)}<br><small>${esc(r.category)}</small></td><td>${esc(recipient)}<br><small>${esc(r.recipientEmail)}</small></td><td>${fmt(r.validUntil)}</td><td><span class="status-pill ${state}">${statuses[state]}</span></td><td><button class="table-action" type="button" data-detail="${r.id}">Ver expediente</button></td></tr>`;}
function updateCounters(){const results={};for(const r of deliveries)results[statusFor(r)]=(results[statusFor(r)]||0)+1;$('statTotal').textContent=deliveries.length;$('statPending').textContent=results.pendiente||0;$('statChanges').textContent=results.cambios||0;$('statReceived').textContent=(results.recibido||0)+(results.aprobado||0);}
function renderList(){if(!readyDeliveries||!readyResponses)return;updateCounters();const q=$('search').value.toLowerCase().trim(),f=$('filter').value;const rows=deliveries.filter(r=>(f==='all'||statusFor(r)===f)&&[r.title,r.project,r.recipientName,r.recipientEmail,r.folio,r.category].join(' ').toLowerCase().includes(q));$('deliveryRows').innerHTML=rows.length?rows.map(recordLine).join(''):'<tr><td colspan="6" class="empty-cell">No se encontraron envíos con estos filtros.</td></tr>';$('syncState').textContent='● Firebase · actualizado';$('syncState').style.color='#2a7355';retrySyncButton.hidden=true;$('deliveryRows').querySelectorAll('[data-detail]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.detail)));if(openRecord&&!$('detailOverlay').hidden){const updated=deliveries.find(r=>r.id===openRecord);if(updated)renderDetail(updated);}}
function responseTimeline(r){return selectedRevisions(r).slice().reverse().map(v=>{const resp=responseFor(r.id,v.version);return `<div class="timeline-item"><b>Versión ${v.version} · ${esc(v.title||r.title)}</b><br><small>Publicada: ${esc(v.publishedAt?new Date(v.publishedAt).toLocaleString('es-MX'):'—')}</small><p>${esc(v.notes||'Sin instrucciones adicionales')}</p>${resp?`<div class="feedback-note"><strong>${statuses[resp.status]||resp.status}</strong> · ${esc(resp.receiverName)}<br>${esc(resp.comments||'Sin comentarios')}<br><small>${fmtTime(resp.createdAt)} · ${esc(resp.receiverEmail)}</small></div>`:'<small>Sin respuesta registrada para esta versión.</small>'}</div>`;}).join('');}
function renderDetail(r){const state=statusFor(r),res=responseFor(r.id,r.version),url=urlFor(r.id),active=r.active;const link=safeHttps(r.driveUrl);$('detailTitle').textContent=r.title;$('detailSub').textContent=`${r.folio||''} · ${r.project} · Versión ${r.version}`;$('detailContent').innerHTML=`
 <div class="head-row"><span class="status-pill ${state}">${statuses[state]}</span><small class="muted">Actualizado: ${fmtTime(r.updatedAt)}</small></div>
 ${!active?'<div class="notice" role="status"><b>Este expediente está revocado.</b> Puedes editarlo para uso interno. Para compartirlo de nuevo, utiliza «Duplicar y publicar nuevo enlace»: el vínculo anterior permanecerá desactivado.</div>':''}
 <div class="detail-meta" style="margin-top:17px"><div class="meta-card"><small>DESTINATARIO</small><b>${esc(r.recipientName)}<br>${esc(r.recipientEmail)}</b></div><div class="meta-card"><small>PROYECTO / TIPO</small><b>${esc(r.project)}<br>${esc(r.category)}</b></div><div class="meta-card"><small>VIGENCIA</small><b>${fmt(r.validUntil)}</b></div></div>
 <h3 class="section-heading">Enlace de revisión</h3><div class="copy-block"><input readonly value="${esc(url)}" aria-label="Enlace de revisión"><button type="button" data-copy="link">Copiar</button></div>
 <div class="detail-actions">
 <button class="btn btn-gold" type="button" data-emailpreview="1">✉ Vista previa del correo</button>
 ${active?'<a class="btn btn-dark" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Abrir vista del proveedor</a><button class="btn btn-outline" type="button" data-mail="1">Abrir Gmail</button>':''}
 ${res&&active?'<a class="btn btn-gold" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Ver comprobante de recibido / PDF</a>':''}
 ${!res?'<button class="btn btn-outline" data-edit="1">✎ Editar expediente</button>':''}
 ${active?'<button class="btn btn-gold" data-revision="1">＋ Publicar nueva versión</button><button class="btn btn-danger" data-revoke="1">Revocar enlace</button>':'<button class="btn btn-gold" data-duplicate="1">＋ Duplicar y publicar nuevo enlace</button>'}
 </div>
 ${res?`<div class="notice"><b>Última respuesta · ${statuses[res.status]||res.status}</b><br>Registrada por ${esc(res.receiverName)} (${esc(res.receiverEmail)}), ${fmtTime(res.createdAt)}.${res.comments?`<br><br>“${esc(res.comments)}”`:''}</div>`:'<div class="notice">El destinatario todavía no registra una respuesta a esta versión.</div>'}
 <div class="two-col"><div><h3 class="section-heading">Archivos para aplicar en las muestras</h3><a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Abrir carpeta de Drive</a>${assetHtml(r.sampleImages,'Artes y vistas de aplicación')}${assetHtml(r.folderImages,'Evidencia de los archivos enviados por Drive')}</div><div><h3 class="section-heading">Historial de revisiones y respuestas</h3><div class="timeline">${responseTimeline(r)}</div></div></div>`;
 $('detailContent').querySelector('[data-copy]')?.addEventListener('click',()=>copyLink(url));$('detailContent').querySelector('[data-mail]')?.addEventListener('click',()=>prepareEmail(r));$('detailContent').querySelector('[data-emailpreview]')?.addEventListener('click',()=>openEmailPreview(r));$('detailContent').querySelector('[data-edit]')?.addEventListener('click',()=>{closeModals();openEditor(r,'edit');});$('detailContent').querySelector('[data-duplicate]')?.addEventListener('click',()=>{closeModals();openEditor(r,'duplicate');});$('detailContent').querySelector('[data-revision]')?.addEventListener('click',()=>{closeModals();openEditor(r);});$('detailContent').querySelector('[data-revoke]')?.addEventListener('click',()=>revoke(r));}
function openDetail(id){const r=deliveries.find(d=>d.id===id);if(!r)return;openRecord=r.id;renderDetail(r);$('detailOverlay').hidden=false;document.body.style.overflow='hidden';}
async function copyLink(url){try{await navigator.clipboard.writeText(url);notify('Enlace copiado. Puedes enviarlo por correo o mensaje.');}catch(e){notify('No se pudo copiar el enlace: '+e.message,true);}}

function emailContent(r,{images=[],mode='email'}={}){
  const url=urlFor(r.id),confirmUrl=url+'&accion=recibido',drive=safeHttps(r.driveUrl);
  const html='<div style="margin:auto;max-width:620px;background:#fff;font:14px/1.6 Arial,Helvetica,sans-serif;color:#29251f;border:1px solid #e4ddd1">'+
  '<div style="background:#181715;color:#e1c083;padding:22px 26px;border-bottom:3px solid #bd9656">'+
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr>'+
  '<td width="68" style="width:68px;vertical-align:middle;padding:0"><img src="https://dejavump.github.io/agora-compras-dejavu/archivos/dejavu-logo-oficial.png" alt="Dejavú Marketing" width="52" height="72" style="display:block;width:52px;height:72px;object-fit:contain;border:0"></td>'+
  '<td style="vertical-align:middle;padding:0 0 0 13px">'+
  '<div style="font-size:11px;line-height:1.5;letter-spacing:2px">ÁGORA · DEJAVÚ MARKETING</div>'+
  '<div style="font-size:21px;line-height:1.3;font-weight:bold;margin-top:5px">Entrega de archivos de producción</div>'+
  '</td></tr></table></div>'+
  '<div style="padding:26px"><p style="margin-top:0">Hola, <b>'+esc(r.recipientName)+'</b>:</p>'+
  '<p>Te compartimos los archivos que se utilizarán para las muestras. Por favor, abre la carpeta, revisa las imágenes y registra tu confirmación de recibido.</p>'+
  '<div style="background:#f8f5ef;border:1px solid #e7dccb;padding:15px 17px"><b>'+esc(r.title)+'</b><div style="font-size:12px;color:#73695d;margin-top:5px">'+esc(r.project)+' · '+esc(r.folio)+' · Versión '+Number(r.version)+'</div></div>'+
  '<p style="margin:24px 0 12px"><a href="'+esc(confirmUrl)+'" style="display:inline-block;padding:13px 22px;background:#b78e4d;color:#fff;border-radius:5px;text-decoration:none;font-weight:bold">✓ Confirmar de recibido</a></p>'+
  '<p style="margin:0 0 18px"><a href="'+esc(drive)+'" style="display:inline-block;padding:13px 22px;background:#24211c;color:#fff;border-radius:5px;text-decoration:none;font-weight:bold">↗ Abrir archivos en Drive</a></p>'+
  '<p style="font-size:12px;color:#756858">El primer botón abre el formulario de confirmación en ÁGORA; no registra una respuesta automáticamente.</p>'+
  '<p><b>Indicaciones de producción:</b> '+esc(r.notes||'Revisa las artes y confirma que recibiste los archivos.')+'</p>'+
  (images.length?renderEmailEvidence(r.sampleImages,'Vistas de artes y aplicaciones',images,mode):evidenceEmailHtml(r.sampleImages,'Vistas de artes y aplicaciones'))+
  (images.length?renderEmailEvidence(r.folderImages,'Evidencia de archivos compartidos',images,mode):evidenceEmailHtml(r.folderImages,'Evidencia de archivos compartidos'))+
  '<div style="border-top:1px solid #e9e1d4;margin-top:22px;padding-top:15px;font-size:12px;color:#73695d">Vigencia: '+esc(fmt(r.validUntil))+'. Si no puedes abrir los archivos o necesitas cambios, repórtalo desde el mismo expediente. <br>Dejavú Marketing · ÁGORA Archivos.</div>'+
  '</div></div>';
  const plain='ÁGORA · DEJAVÚ MARKETING\nEntrega de archivos: '+r.title+'\nProyecto: '+r.project+
    '\n\nConfirmar de recibido: '+confirmUrl+'\nAbrir archivos en Drive: '+drive+
    evidenceEmailPlain(r.sampleImages,'Vistas de artes y aplicaciones')+
    evidenceEmailPlain(r.folderImages,'Evidencia de archivos compartidos')+
    '\n\nIndicaciones: '+(r.notes||'Revisar los archivos')+'\nVigencia: '+fmt(r.validUntil);
  return {html,plain,confirmUrl,drive};
}
function updateInlineSendButton(){
 const total=imageEvidenceCount(emailRecord);
 const ready=!!emailRecord?.active&&total>0&&emailImages.length===total&&!emailFailures.length&&!emailSending&&!emailSent;
 $('sendGmailInline').disabled=!ready;
 $('sendGmailInline').textContent=emailSent?'✓ Correo enviado':emailSending?'Enviando correo…':'Enviar por Gmail con fotografías';
}
function currentEmailPreview(){
 const r=emailRecord;
 if(!r)return;
 const content=emailContent(r,{images:emailImages,mode:'preview'});
 $('emailPreviewContent').innerHTML=(!r.active?'<p class="notice"><b>Expediente revocado.</b> No se puede enviar este correo. Duplica el expediente y publica un enlace nuevo.</p>':'')+content.html;
}
async function loadEmailPhotos(){
 const r=emailRecord;
 if(!r?.active)return;
 const total=imageEvidenceCount(r);
 if(!total){$('emailPhotosStatus').textContent='Este expediente no contiene fotografías para incrustar.';return;}
 if(!driveConnected()){
  $('emailPhotosStatus').textContent='Conecta Google Drive para mostrar las imágenes reales y preparar su envío privado.';
  updateInlineSendButton();return;
 }
 const stamp=++emailLoadSerial;
 $('emailLoadPhotos').disabled=true;
 $('emailPhotosStatus').textContent='Consultando las fotografías privadas en Drive…';
 for(const url of emailPreviewUrls)URL.revokeObjectURL(url);
 emailPreviewUrls=[];emailImages=[];emailFailures=[];
 updateInlineSendButton();
 try{
  const result=await loadInlineImages({
   urls:[...(r.sampleImages||[]),...(r.folderImages||[])],
   accessToken:currentDriveToken(),
   onProgress:status=>{if(stamp===emailLoadSerial)$('emailPhotosStatus').textContent=status;}
  });
  if(stamp!==emailLoadSerial||emailRecord!==r)return;
  emailImages=result.images.map(image=>{
   const previewUrl=URL.createObjectURL(image.blob);
   emailPreviewUrls.push(previewUrl);
   return {...image,previewUrl};
  });
  emailFailures=result.failures;
  currentEmailPreview();
  $('emailPhotosStatus').textContent=emailFailures.length?
   'Se pudieron cargar '+emailImages.length+' de '+total+' fotografías. No se enviará un correo incompleto. '+emailFailures.join(' '):
   '✓ '+total+' fotografías visibles y preparadas como imágenes incrustadas. Tamaño total: '+Math.round(result.totalBytes/1024)+' KB.';
 }catch(e){
  if(stamp===emailLoadSerial){emailFailures=[e?.message||String(e)];$('emailPhotosStatus').textContent='Error al leer Drive: '+emailFailures[0];currentEmailPreview();}
 }finally{
  if(stamp===emailLoadSerial){$('emailLoadPhotos').disabled=false;updateInlineSendButton();}
 }
}
function openEmailPreview(r){
 disposeEmailPhotos();
 emailRecord=r;
 $('emailRecipient').textContent=r.recipientEmail;
 $('emailSubject').textContent='ÁGORA · Archivos de producción · '+r.folio;
 $('emailPreviewTitle').textContent=r.active?'Vista previa del correo':'Vista previa del correo · expediente revocado';
 $('copyEmailPreview').disabled=!r.active;
 $('openGmailPreview').disabled=!r.active;
 $('emailLoadPhotos').disabled=!r.active;
 $('emailPhotosStatus').textContent=r.active?'Pulsa «Mostrar fotografías» para ver las imágenes reales y preparar su envío.':'Este expediente está revocado: no se puede enviar.';
 currentEmailPreview();
 updateInlineSendButton();
 $('emailOverlay').hidden=false;
 document.body.style.overflow='hidden';
 if(r.active&&driveConnected())loadEmailPhotos();
}
async function sendEmailWithPhotos(){
 const r=emailRecord;
 if(!r)return;
 const total=imageEvidenceCount(r);
 if(emailSending||emailSent||!r.active||total===0||emailImages.length!==total||emailFailures.length){
  $('emailPhotosStatus').textContent='Primero carga correctamente todas las fotografías para enviarlas incrustadas.';
  updateInlineSendButton();return;
 }
 try{authRequired();}catch(e){$('emailPhotosStatus').textContent=e.message;return;}
 // Este segundo consentimiento autoriza enviar un mensaje, no leer el buzón.
 if(!confirm('¿Enviar el correo a '+r.recipientEmail+' con '+total+' fotografías incrustadas?\n\nEl destinatario conservará las imágenes que reciba en su correo, incluso si después revocas permisos en Drive. Esta acción realmente envía el mensaje.'))return;
 emailSending=true;updateInlineSendButton();
 $('emailPhotosStatus').textContent='Solicitando permiso para enviar desde Gmail…';
 try{
  const sender=user?.email||'';
  const senderUid=user?.uid;
  const provider=new GoogleAuthProvider();
  provider.addScope(GMAIL_SEND_SCOPE);
  const credentials=await reauthenticateWithPopup(auth.currentUser,provider);
  if(!emailRecord||emailRecord!==r||!r.active||user?.uid!==senderUid||credentials.user.uid!==senderUid)throw Error('La sesión o el expediente cambió durante la autorización.');
  const gmailToken=GoogleAuthProvider.credentialFromResult(credentials)?.accessToken;
  if(!gmailToken)throw Error('Google no proporcionó el permiso gmail.send. Revisa la configuración de Google Auth Platform.');
  $('emailPhotosStatus').textContent='Confirmando que el expediente siga vigente…';
  const fresh=await getDoc(doc(db,'agora_file_deliveries',r.id));
  if(!fresh.exists()||fresh.data().active!==true||fresh.data().version!==r.version||
     fresh.data().recipientEmail!==r.recipientEmail||fresh.data().validUntil?.toMillis?.()<=Date.now())
   throw Error('El expediente cambió, fue revocado o venció. Recarga antes de enviarlo.');
  $('emailPhotosStatus').textContent='Preparando correo con imágenes incrustadas…';
  const {html,plain}=emailContent(r,{images:emailImages,mode:'email'});
  const raw=await buildGmailMime({from:sender,to:r.recipientEmail,subject:$('emailSubject').textContent,html,plain,images:emailImages});
  $('emailPhotosStatus').textContent='Enviando mediante Gmail…';
  const messageId=await sendGmailInline({accessToken:gmailToken,raw});
  emailSent=true;
  $('emailPhotosStatus').textContent='✓ Enviado correctamente desde '+sender+' a '+r.recipientEmail+' · ID Gmail: '+messageId+'. Revisa «Enviados».';
  notify('Correo enviado mediante Gmail con '+total+' fotografías incrustadas. No se modificaron los acuses ni el expediente.');
 }catch(e){
  $('emailPhotosStatus').textContent='No se confirmó el envío: '+(e?.message||e)+'. Revisa «Enviados» antes de reintentar si la conexión se interrumpió.';
 }finally{emailSending=false;updateInlineSendButton();}
}
async function copyEmailEvidence(r){
  const {html,plain}=emailContent(r);
  try{
    if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':new Blob([html],{type:'text/html'}),
        'text/plain':new Blob([plain],{type:'text/plain'})
      })]);
      notify('Correo visual copiado con enlaces privados. Para incrustar las fotos reales, usa «Enviar por Gmail con fotografías».');
    }else{
      await navigator.clipboard.writeText(plain);
      notify('Se copió el correo en texto con ambos enlaces. Pégalo en Gmail.');
    }
  }catch(err){notify('No fue posible copiar el correo: '+err.message,true);}
}
function prepareEmail(r){const url=urlFor(r.id);const subject=`ÁGORA · Archivos de aplicación para muestras · ${r.folio}`;const content=`Hola ${r.recipientName},\n\nDejavú Marketing te comparte los artes y archivos de producción para ${r.project}.\n\n1. Abre el enlace de ÁGORA para ver las capturas de evidencia y las indicaciones:\n${url}\n\n2. Accede a los archivos originales en Google Drive:\n${safeHttps(r.driveUrl)}\n\n3. Confirma de recibido desde ÁGORA para generar el comprobante digital. Si falta algún archivo o no puedes abrirlo, repórtalo en el mismo formulario.\n\nVigencia: ${fmt(r.validUntil)}\nVersión: ${r.version}\n\nSaludos,\nDejavú Marketing`;const extra=evidenceEmailPlain(r.sampleImages,'Vistas de artes y aplicaciones')+evidenceEmailPlain(r.folderImages,'Evidencia de archivos compartidos');const gmail='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(r.recipientEmail)+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(content+extra);window.open(gmail,'_blank','noopener,noreferrer');notify('Gmail abrió un mensaje con enlaces. Para enviar fotografías reales incrustadas, usa el botón «Enviar por Gmail con fotografías» de la vista previa.');}
function revoke(r){if(!confirm('¿Revocar este enlace? El destinatario dejará de poder abrirlo o responder. La información del expediente se conservará.'))return;authRequired();runTransaction(db,async tx=>{const refDoc=doc(db,'agora_file_deliveries',r.id),s=await tx.get(refDoc);if(!s.exists()||!s.data().active)throw Error('El envío ya fue revocado o no existe.');tx.update(refDoc,{active:false,updatedAt:serverTimestamp()});}).then(()=>{closeModals();notify('Enlace revocado. El expediente permanece en el historial.');}).catch(e=>notify(e.message,true));}
function parseValidUntil(value){const d=new Date(value+'T23:59:59');if(Number.isNaN(+d)||d.getTime()<=Date.now())throw Error('Selecciona una vigencia futura.');return Timestamp.fromDate(d);}
// Los originales permanecen en Drive; aquí guardamos vistas optimizadas.
function resize(file){
  return new Promise((resolve,reject)=>{
    const src=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      try{
        const scale=Math.min(1,1200/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d');
        if(!ctx)throw Error('El navegador no pudo procesar la imagen.');
        ctx.fillStyle='#ffffff';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{
          URL.revokeObjectURL(src);
          if(blob)resolve(blob);
          else reject(Error('No se pudo comprimir la imagen.'));
        },'image/jpeg',0.72);
      }catch(e){URL.revokeObjectURL(src);reject(e);}
    };
    img.onerror=()=>{URL.revokeObjectURL(src);reject(Error('Archivo de imagen no válido.'));};
    img.src=src;
  });
}
const uploadProgress=$('uploadProgress');
const uploadMeter=$('uploadMeter');
const uploadStatus=$('uploadStatus');
function updateUploadStatus(label,progress=null,error=false){
  if(!uploadProgress)return;
  uploadProgress.hidden=false;
  uploadProgress.dataset.error=error?'1':'0';
  uploadStatus.textContent=label;
  if(progress===null){uploadMeter.hidden=true;return;}
  uploadMeter.hidden=false;
  uploadMeter.value=Math.max(0,Math.min(100,Math.round(progress)));
}
let driveAccessToken='',driveTokenExpiry=0,driveOwnerUid='';
function driveConnected(){return !!(driveAccessToken&&driveOwnerUid===auth.currentUser?.uid&&Date.now()<driveTokenExpiry);}
function updateDriveConnectionStatus(){
 const label=$('driveConnectionStatus');
 if(label)label.textContent=driveConnected()?'● Google Drive conectado · permiso temporal':'Drive sin conectar · obligatorio para subir fotografías';
 const button=$('connectDriveButton');
 if(button)button.textContent=driveConnected()?'↻ Renovar acceso a Drive':'Conectar Google Drive';
}
async function connectDrive(){
 try{
  authRequired();
  const provider=new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  const result=await reauthenticateWithPopup(auth.currentUser,provider);
  if(result.user.uid!==user.uid)throw Error('La cuenta de Drive debe ser la misma cuenta autorizada de ÁGORA.');
  const credential=GoogleAuthProvider.credentialFromResult(result);
  if(!credential?.accessToken)throw Error('Google no entregó el permiso para Drive.');
  driveAccessToken=credential.accessToken;
  driveOwnerUid=result.user.uid;
  driveTokenExpiry=Date.now()+45*60*1000;
  updateDriveConnectionStatus();
  notify('Drive conectado. Las imágenes se compartirán solo con el destinatario del expediente.');
  return true;
 }catch(e){const message='No se pudo conectar Drive: '+(e?.message||e);$('driveConnectionStatus').textContent=message;notify(message,true);return false;}
}
function currentDriveToken(){
 if(!driveConnected()){updateDriveConnectionStatus();throw Error('Para adjuntar fotografías, primero pulsa «Conectar Google Drive». No se requiere Firebase Blaze.');}
 return driveAccessToken;
}
async function uploadAllImages(samples,folders,id,version,project,recipientEmail){
 const pending=[...samples.map(item=>({item,group:'samples',section:'muestra'})),
                ...folders.map(item=>({item,group:'folders',section:'carpeta'}))];
 if(!pending.length)return;
 const token=currentDriveToken();
 updateUploadStatus('Optimizando fotografías…',0);
 const jobs=[];
 for(const job of pending)jobs.push({...job,blob:await resize(job.item.file)});
 const folder=await uploadDriveImages({
  accessToken:token,project,deliveryId:id,version,recipientEmail,
  uploaderEmail:user.email||'',items:jobs,
  onStatus:(label,progress)=>{updateUploadStatus(label,progress);$('saveButton').textContent=label;},
  onSaved:({item,group,url})=>{
   // Cada enlace exitoso permanece en el formulario incluso si después falla Firestore.
   const field=$(group==='samples'?'sampleUrls':'folderUrls');
   field.value=(field.value.trim()?field.value.trim()+'\n':'')+url;
   const selected=group==='samples'?sampleSelected:folderSelected;
   const at=selected.indexOf(item);
   if(at!==-1){URL.revokeObjectURL(item.preview);selected.splice(at,1);}
   imagesToDisplay(selected,group==='samples'?'samplePreview':'folderPreview');
   updateLinkPreviews();
  }
 });
 updateUploadStatus('Fotos guardadas en Drive. Publicando expediente…',100);
 return folder;
}
function normalizeDrive(raw){const uri=safeHttps(String(raw||'').trim());if(!uri)throw Error('Agrega un enlace válido de Drive con https://');const host=new URL(uri).hostname;if(!['drive.google.com','docs.google.com'].includes(host))throw Error('El enlace debe ser de Google Drive o Google Docs.');return uri;}

async function saveDelivery(event){
 event.preventDefault();
 const btn=$('saveButton');if(btn.disabled)return;
 btn.disabled=true;btn.textContent='Guardando en Firebase…';
 try{
  authRequired();
  const fd=new FormData($('deliveryForm')),read=k=>String(fd.get(k)||'').trim();
  const recipientEmail=read('recipientEmail').toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))throw Error('Indica un correo válido.');
  const validUntil=parseValidUntil(read('validUntil'));
   let driveUrl=read('driveUrl')?normalizeDrive(read('driveUrl')):'';
   if(!read('project')||!read('title')||!read('recipientName'))throw Error('Completa los campos obligatorios.');
   if(!driveUrl&&!sampleSelected.length&&!folderSelected.length)throw Error('Agrega un enlace original de Drive o adjunta fotografías para crear una carpeta automáticamente.');
  const id=editRecord?.id||secret(),isEdit=!!editRecord&&editorMode==='edit';
  const version=isEdit?editRecord.version:(editRecord?.version||0)+1;
  let samples=readImageUrls('sampleUrls',8),folders=readImageUrls('folderUrls',6);
  if(samples.length+sampleSelected.length>8||folders.length+folderSelected.length>6)throw Error('Se superó el límite de imágenes por sección.');
  if(sampleSelected.length||folderSelected.length){
   const saved=await uploadAllImages(sampleSelected,folderSelected,id,version,read('project'),recipientEmail);
   samples=readImageUrls('sampleUrls',8);folders=readImageUrls('folderUrls',6);
   if(!driveUrl&&saved?.folderUrl){driveUrl=saved.folderUrl;$('deliveryForm').elements.driveUrl.value=driveUrl;}
  }
  const payload={project:read('project'),category:read('category'),title:read('title'),
   recipientName:read('recipientName'),recipientEmail,driveUrl,validUntil,
   notes:read('notes'),sampleImages:samples,folderImages:folders};
  if(!payload.project||!payload.title||!payload.recipientName)throw Error('Completa los campos obligatorios.');
  const rev={version,title:payload.title,notes:payload.notes,driveUrl,
   sampleImages:samples,folderImages:folders,publishedAt:new Date().toISOString(),editorEmail:user.email||''};
  if(editRecord){
   await runTransaction(db,async tx=>{
    const target=doc(db,'agora_file_deliveries',id);
    const snap=await tx.get(target);
    if(!snap.exists())throw Error('El expediente ya no existe.');
    const old=snap.data();
    if(old.version!==editRecord.version||old.active!==editRecord.active||old.updatedAt?.toMillis?.()!==editRecord.updatedAt?.toMillis?.())
     throw Error('El expediente fue modificado por otra persona. Vuelve a abrirlo.');
    if(old.recipientEmail!==recipientEmail||old.recipientName!==payload.recipientName)
     throw Error('Para cambiar de destinatario, crea un nuevo envío con un enlace diferente.');
    if(isEdit){
     const receipt=await tx.get(doc(db,'agora_file_responses',id,'agora_file_reply_versions',String(version)));
     if(receipt.exists())throw Error('Este expediente ya tiene acuse. Publica una nueva versión para cambiarlo.');
     const revisions=Array.isArray(old.revisions)?old.revisions.slice():[];
     if(!revisions.length)throw Error('El expediente no tiene historial de versiones válido.');
     revisions[revisions.length-1]={...revisions[revisions.length-1],...rev,
      publishedAt:revisions[revisions.length-1].publishedAt,editedAt:new Date().toISOString()};
     tx.update(target,{...payload,revisions,updatedAt:serverTimestamp()});
    }else{
     if(old.version>=30)throw Error('Se alcanzó el máximo de 30 versiones.');
     tx.update(target,{...payload,version,revisions:[...old.revisions,rev],updatedAt:serverTimestamp()});
    }
   });
  }else{
   const now=new Date(),folio='ARC-'+now.getFullYear()+'-'+now.toISOString().replace(/\D/g,'').slice(4,12)+'-'+id.slice(0,4).toUpperCase();
   await setDoc(doc(db,'agora_file_deliveries',id),{...payload,folio,id,version,
    active:true,createdBy:user.uid,createdByEmail:user.email||'',
    createdAt:serverTimestamp(),updatedAt:serverTimestamp(),revisions:[rev]});
  }
  closeModals();
  notify(isEdit?'Cambios del expediente guardados. El enlace y la versión no cambiaron.':
    editRecord?'Nueva versión publicada. El enlace es el mismo.':'Envío publicado. Ya puedes compartir el enlace.');
  openDetail(id);
 }catch(e){
  const message=e?.message||String(e);notify(message,true);updateUploadStatus(message,null,true);
 }finally{
  btn.disabled=false;
  btn.textContent=editorMode==='edit'?'Guardar cambios':editorMode==='duplicate'?'Publicar nuevo envío':editRecord?'Publicar nueva versión':'Publicar envío';
 }
}
function stopListeners(){for(const u of subscriptions)u();subscriptions=[];readyDeliveries=false;readyResponses=false;deliveries=[];responses.clear();firstResponses=true;}
/* Estado visible y recuperable: nunca mostrar "sin conexión" indefinidamente. */
const retrySyncButton=document.createElement('button');
retrySyncButton.type='button';
retrySyncButton.id='retrySyncButton';
retrySyncButton.textContent='Reintentar';
retrySyncButton.title='Revisar de nuevo la conexión y los permisos de Firebase';
retrySyncButton.style.cssText='margin-left:10px;padding:7px 10px;border:1px solid #cbb28a;border-radius:8px;background:#fff;color:#6f512a;font:600 12px Arial;cursor:pointer';
retrySyncButton.hidden=true;
$('syncState').insertAdjacentElement('afterend',retrySyncButton);
let checkingRole=false;
let connectionSerial=0;
function connectionError(prefix,e){
  const details=String(e?.message||e||'Error desconocido');
  const isPerm=e?.code==='permission-denied'||/permission|permiso|acceso denegado/i.test(details);
  $('syncState').textContent=isPerm?'Permiso denegado':'Error de Firebase';
  $('syncState').style.color='#a34f31';
  retrySyncButton.hidden=false;
  notify(prefix+': '+details,true);
  console.error('[ÁGORA Archivos]',prefix,e);
}
function connect(){
  stopListeners();
  const stamp=++connectionSerial;
  $('syncState').textContent='Cargando historial…';
  $('syncState').style.color='';
  retrySyncButton.hidden=true;
  subscriptions.push(onSnapshot(collection(db,'agora_file_deliveries'),snap=>{
    if(stamp!==connectionSerial)return;
    deliveries=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0));
    readyDeliveries=true;renderList();
  },e=>{if(stamp===connectionSerial)connectionError('No se pudo consultar envíos',e);}));
  subscriptions.push(onSnapshot(collectionGroup(db,'agora_file_reply_versions'),snap=>{
    if(stamp!==connectionSerial)return;
    const previous=new Set(responses.keys());
    responses=new Map(snap.docs.map(d=>{const v=d.data();return [v.deliveryId+'_v'+v.version,v];}));
    if(!firstResponses){const fresh=[...responses.keys()].filter(k=>!previous.has(k));if(fresh.length)notify('Se registraron '+fresh.length+' nueva(s) respuesta(s) a envíos.');}
    firstResponses=false;readyResponses=true;renderList();
  },e=>{if(stamp===connectionSerial)connectionError('No se pudieron consultar respuestas',e);}));
  setTimeout(()=>{
    if(stamp===connectionSerial&&auth.currentUser&&(!readyDeliveries||!readyResponses)){
      const pending=[!readyDeliveries?'envíos':null,!readyResponses?'respuestas':null].filter(Boolean).join(' y ');
      connectionError('Sin respuesta de Firestore para '+pending,new Error('La consulta no terminó. Comprueba tu conexión o las reglas publicadas y pulsa Reintentar.'));
    }
  },16000);
}
async function checkRole(person){
  if(checkingRole)return;
  checkingRole=true;
  retrySyncButton.hidden=true;
  $('syncState').textContent='Verificando permisos…';
  $('syncState').style.color='';
  try{
    const token=person.uid;
    const snap=await Promise.race([
      getDoc(doc(db,'agora_users',token)),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Firestore no respondió durante 15 segundos. Comprueba que tu navegador permita conexiones a firestore.googleapis.com.')),15000))
    ]);
    if(auth.currentUser?.uid!==token)return;
    role=snap.exists()&&snap.data().active===true?snap.data().role:null;
    if(!['admin','coordinador','consulta'].includes(role))throw Error('Tu cuenta de Google no tiene un documento agora_users activo con rol admin, coordinador o consulta.');
    $('userLabel').textContent=(person.email||'Cuenta conectada')+' · '+role;
    $('authButton').textContent='Cerrar sesión';
    $('newButton').disabled=$('menuNew').disabled=!['admin','coordinador'].includes(role);
    connect();
    if(['admin','coordinador'].includes(role)&&sessionStorage.getItem('agora_sample_file_context')&&new URLSearchParams(location.search).get('origen')==='muestras')openEditor();
  }finally{checkingRole=false;}
}
async function retryConnection(){
  if(!auth.currentUser){$('syncState').textContent='Inicia sesión primero';return;}
  try{await checkRole(auth.currentUser);}catch(e){connectionError('No se pudo verificar la cuenta',e);}
}
retrySyncButton.addEventListener('click',retryConnection);
window.addEventListener('online',()=>{if(auth.currentUser&&retrySyncButton.hidden===false)retryConnection();});
onAuthStateChanged(auth,async person=>{
  ++connectionSerial;
  stopListeners();
  if(user?.uid!==person?.uid){driveAccessToken='';driveTokenExpiry=0;driveOwnerUid='';}
  user=person;role=null;closeModals();updateDriveConnectionStatus();
  $('authButton').textContent=person?'Cerrar sesión':'Iniciar sesión';
  $('userLabel').textContent=person?.email||'Sin sesión';
  $('newButton').disabled=true;$('menuNew').disabled=true;
  for(const id of ['statTotal','statPending','statChanges','statReceived']) $(id).textContent='—';
  $('deliveryRows').innerHTML='<tr><td colspan="6" class="empty-cell">Verificando el acceso a Firebase…</td></tr>';
  if(!person){$('syncState').textContent='Sin sesión';retrySyncButton.hidden=true;return;}
  await retryConnection();
});
$('connectDriveButton').addEventListener('click',connectDrive);
$('authButton').addEventListener('click',async()=>{try{if(user)await signOut(auth);else await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){notify('Error de autenticación: '+e.message,true);}});
$('deliveryForm').addEventListener('submit',saveDelivery);$('sampleFiles').addEventListener('change',e=>addFiles(e.target,sampleSelected,'samplePreview',8));$('folderFiles').addEventListener('change',e=>addFiles(e.target,folderSelected,'folderPreview',6));$('search').addEventListener('input',renderList);$('filter').addEventListener('change',renderList);
$('newButton').addEventListener('click',()=>openEditor());$('menuNew').addEventListener('click',()=>openEditor());$('menuHistory').addEventListener('click',()=>{$('search').focus();$('sidebar').classList.remove('mobile-open');});
for(const el of document.querySelectorAll('[data-close]'))el.addEventListener('click',closeModals);
for(const name of ['editorOverlay','detailOverlay','emailOverlay'])$(name).addEventListener('click',e=>{if(e.target===$(name))closeModals();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals();});
$('toggleSide').addEventListener('click',()=>{const side=$('sidebar');if(window.innerWidth<=760)side.classList.toggle('mobile-open');else side.classList.toggle('collapsed');});document.addEventListener('click',e=>{if(window.innerWidth<=760&&!e.target.closest('.sidebar,#toggleSide'))$('sidebar').classList.remove('mobile-open');});
setupLinkPreviews();
updateDriveConnectionStatus();

$('copyEmailPreview').addEventListener('click',()=>{if(emailRecord)copyEmailEvidence(emailRecord);});
$('openGmailPreview').addEventListener('click',()=>{if(emailRecord)prepareEmail(emailRecord);});
$('emailLoadPhotos').addEventListener('click',async()=>{if(!driveConnected()&&!await connectDrive())return;await loadEmailPhotos();});
$('sendGmailInline').addEventListener('click',sendEmailWithPhotos);
