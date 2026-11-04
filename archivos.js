import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,collectionGroup,onSnapshot,serverTimestamp,Timestamp,setDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {getStorage,ref,uploadBytesResumable,getDownloadURL,setMaxUploadRetryTime,setMaxOperationRetryTime} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js';

// Usa el proyecto Firebase existente de ÁGORA Pedidos. Estas son claves de cliente públicas.
const config={apiKey:'AIzaSyDPh-AFdST9Ax_Eoho-wT0shlWlCHad6Zg',authDomain:'agora-dejavu-38b8c.firebaseapp.com',projectId:'agora-dejavu-38b8c',storageBucket:'agora-dejavu-38b8c.firebasestorage.app',messagingSenderId:'775680965171',appId:'1:775680965171:web:274557c8c9c25ff304c146'};
const app=getApps()[0]||initializeApp(config),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);
// Limita los reintentos cuando Firebase Storage no está disponible o requiere facturación.
setMaxUploadRetryTime(storage,18000);
setMaxOperationRetryTime(storage,15000);
const $=id=>document.getElementById(id);
window.__AGORA_FILES_BOOT?.mark('module-ready');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>d?.toDate?d.toDate().toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Mexico_City'}):'—';
const fmtTime=d=>d?.toDate?d.toDate().toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}):'—';
const statuses={pendiente:'Pendiente',recibido:'Recibido',aprobado:'Aprobado',cambios:'Solicitan cambios',no_recibido:'No recibido',vencido:'Vencido',revocado:'Revocado'};
const safeHttps=url=>{try{let u=new URL(url);return u.protocol==='https:'?u.href:'';}catch{return '';}};
// 32 bytes de aleatoriedad; cada byte representa exactamente 6 bits en el alfabeto de 64 caracteres.
const secret=()=>{let bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');};
const urlFor=id=>new URL('./archivo-recibir.html',location.href).href+'#t='+id;
const assetHtml=(arr,heading)=>arr?.length?`<div class="reference-group"><h3>${heading}</h3><div class="image-grid">${arr.map((url,i)=>`<a href="${esc(safeHttps(url))}" target="_blank" rel="noopener noreferrer"><img src="${esc(safeHttps(url))}" alt="${esc(heading)} ${i+1}" loading="lazy"></a>`).join('')}</div></div>`:'';
let user=null,role=null,deliveries=[],responses=new Map(),editRecord=null,openRecord=null,subscriptions=[],readyDeliveries=false,readyResponses=false,firstResponses=true;
let sampleSelected=[],folderSelected=[];
function notify(msg,error=false){$('alert').textContent=msg;$('alert').className='alert'+(error?' error':'');$('alert').hidden=false;setTimeout(()=>{if($('alert').textContent===msg)$('alert').hidden=true;},8500);}
function authRequired(){if(!user||!['admin','coordinador'].includes(role))throw new Error('Inicia sesión con una cuenta de ÁGORA autorizada (admin o coordinador).');}
function responseFor(id,version){return responses.get(`${id}_v${version}`)||null;}
function statusFor(r){if(!r.active)return 'revocado';const response=responseFor(r.id,r.version);if(response)return response.status;if(r.validUntil?.toMillis?.()<Date.now())return 'vencido';return 'pendiente';}
function selectedRevisions(r){return Array.isArray(r.revisions)?r.revisions:[];}
function imagesToDisplay(files,slot){const preview=$(slot),current=files;preview.innerHTML=current.map((file,i)=>`<div class="preview-item"><img alt="${esc(file.name)}" src="${esc(file.preview)}"><button type="button" data-remove="${i}" aria-label="Quitar imagen">×</button></div>`).join('');preview.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>{const k=Number(btn.dataset.remove);URL.revokeObjectURL(files[k].preview);files.splice(k,1);imagesToDisplay(files,slot);}));}
function addFiles(input,arr,slot,max){const chosen=Array.from(input.files||[]);if(chosen.length+arr.length>max){notify(`Máximo ${max} imágenes en esta sección.`,true);input.value='';return;}for(const file of chosen){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){notify('Las imágenes deben ser JPG, PNG o WEBP y pesar menos de 12 MB cada una.',true);continue;}arr.push({file,name:file.name,preview:URL.createObjectURL(file)});}imagesToDisplay(arr,slot);input.value='';}
function readImageUrls(el,max){const values=String($(el).value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(values.length>max)throw Error(`Demasiadas URL de imágenes (${max} máximo).`);for(const url of values){if(!safeHttps(url))throw Error('Las imágenes externas deben usar una dirección https:// válida.');}return values;}
function clearFiles(){for(const v of [...sampleSelected,...folderSelected])URL.revokeObjectURL(v.preview);sampleSelected=[];folderSelected=[];imagesToDisplay(sampleSelected,'samplePreview');imagesToDisplay(folderSelected,'folderPreview');$('sampleFiles').value='';$('folderFiles').value='';}
function openEditor(record=null){try{authRequired();}catch(e){notify(e.message,true);return;}editRecord=record;if(uploadProgress){uploadProgress.hidden=true;uploadProgress.dataset.error='0';uploadMeter.value=0;uploadMeter.hidden=false;uploadStatus.textContent='';}$('deliveryForm').reset();clearFiles();$('formTitle').textContent=record?'Publicar nueva versión de archivos':'Enviar archivos para fabricar muestras';$('formSubtitle').textContent=record?`Versión ${record.version+1}. El enlace de recepción será el mismo.`:'Crea un expediente que se guarda directamente en Firebase.';$('saveButton').textContent=record?'Publicar versión '+(record.version+1):'Publicar envío';$('sampleUrls').value=record?.sampleImages?.join('\n')||'';$('folderUrls').value=record?.folderImages?.join('\n')||'';const f=$('deliveryForm');for(const key of ['project','category','title','recipientName','recipientEmail','driveUrl','notes']){if(record)f.elements[key].value=record[key]||'';}f.elements.recipientName.readOnly=!!record;f.elements.recipientEmail.readOnly=!!record;const today=new Date();const y=today.getFullYear(),m=String(today.getMonth()+1).padStart(2,'0'),d=String(today.getDate()).padStart(2,'0');f.elements.validUntil.min=`${y}-${m}-${d}`;const prev=record?.validUntil?.toDate?.();const defaultUntil=new Date(today.getTime()+14*86400000);const target=prev&&prev>today?prev:defaultUntil;f.elements.validUntil.value=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
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
 }$('editorOverlay').hidden=false;document.body.style.overflow='hidden';}
function closeModals(){for(const id of ['editorOverlay','detailOverlay'])$(id).hidden=true;document.body.style.overflow='';}
function recordLine(r){const state=statusFor(r);const recipient=r.recipientName||'—';return `<tr><td><strong>${esc(r.title)}</strong><small>${esc(r.folio||'Sin folio')} · Versión ${r.version}</small></td><td>${esc(r.project)}<br><small>${esc(r.category)}</small></td><td>${esc(recipient)}<br><small>${esc(r.recipientEmail)}</small></td><td>${fmt(r.validUntil)}</td><td><span class="status-pill ${state}">${statuses[state]}</span></td><td><button class="table-action" type="button" data-detail="${r.id}">Ver expediente</button></td></tr>`;}
function updateCounters(){const results={};for(const r of deliveries)results[statusFor(r)]=(results[statusFor(r)]||0)+1;$('statTotal').textContent=deliveries.length;$('statPending').textContent=results.pendiente||0;$('statChanges').textContent=results.cambios||0;$('statReceived').textContent=(results.recibido||0)+(results.aprobado||0);}
function renderList(){if(!readyDeliveries||!readyResponses)return;updateCounters();const q=$('search').value.toLowerCase().trim(),f=$('filter').value;const rows=deliveries.filter(r=>(f==='all'||statusFor(r)===f)&&[r.title,r.project,r.recipientName,r.recipientEmail,r.folio,r.category].join(' ').toLowerCase().includes(q));$('deliveryRows').innerHTML=rows.length?rows.map(recordLine).join(''):'<tr><td colspan="6" class="empty-cell">No se encontraron envíos con estos filtros.</td></tr>';$('syncState').textContent='● Firebase · actualizado';$('syncState').style.color='#2a7355';retrySyncButton.hidden=true;$('deliveryRows').querySelectorAll('[data-detail]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.detail)));if(openRecord&&!$('detailOverlay').hidden){const updated=deliveries.find(r=>r.id===openRecord);if(updated)renderDetail(updated);}}
function responseTimeline(r){return selectedRevisions(r).slice().reverse().map(v=>{const resp=responseFor(r.id,v.version);return `<div class="timeline-item"><b>Versión ${v.version} · ${esc(v.title||r.title)}</b><br><small>Publicada: ${esc(v.publishedAt?new Date(v.publishedAt).toLocaleString('es-MX'):'—')}</small><p>${esc(v.notes||'Sin instrucciones adicionales')}</p>${resp?`<div class="feedback-note"><strong>${statuses[resp.status]||resp.status}</strong> · ${esc(resp.receiverName)}<br>${esc(resp.comments||'Sin comentarios')}<br><small>${fmtTime(resp.createdAt)} · ${esc(resp.receiverEmail)}</small></div>`:'<small>Sin respuesta registrada para esta versión.</small>'}</div>`;}).join('');}
function renderDetail(r){const state=statusFor(r),res=responseFor(r.id,r.version),url=urlFor(r.id),active=r.active;const link=safeHttps(r.driveUrl);$('detailTitle').textContent=r.title;$('detailSub').textContent=`${r.folio||''} · ${r.project} · Versión ${r.version}`;$('detailContent').innerHTML=`
 <div class="head-row"><span class="status-pill ${state}">${statuses[state]}</span><small class="muted">Actualizado: ${fmtTime(r.updatedAt)}</small></div>
 <div class="detail-meta" style="margin-top:17px"><div class="meta-card"><small>DESTINATARIO</small><b>${esc(r.recipientName)}<br>${esc(r.recipientEmail)}</b></div><div class="meta-card"><small>PROYECTO / TIPO</small><b>${esc(r.project)}<br>${esc(r.category)}</b></div><div class="meta-card"><small>VIGENCIA</small><b>${fmt(r.validUntil)}</b></div></div>
 <h3 class="section-heading">Enlace de revisión</h3><div class="copy-block"><input readonly value="${esc(url)}" aria-label="Enlace de revisión"><button type="button" data-copy="link">Copiar</button></div>
 <div class="detail-actions"><a class="btn btn-dark" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir vista del proveedor</a><button class="btn btn-outline" type="button" data-mail="1">Correo con enlace y Drive</button>${res?`<a class="btn btn-gold" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver comprobante de recibido / PDF</a>`:''}${active?`<button class="btn btn-gold" data-revision="1">＋ Publicar nueva versión</button><button class="btn btn-danger" data-revoke="1">Revocar enlace</button>`:''}</div>
 ${res?`<div class="notice"><b>Última respuesta · ${statuses[res.status]||res.status}</b><br>Registrada por ${esc(res.receiverName)} (${esc(res.receiverEmail)}), ${fmtTime(res.createdAt)}.${res.comments?`<br><br>“${esc(res.comments)}”`:''}</div>`:'<div class="notice">El destinatario todavía no registra una respuesta a esta versión.</div>'}
 <div class="two-col"><div><h3 class="section-heading">Archivos para aplicar en las muestras</h3><a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Abrir carpeta de Drive</a>${assetHtml(r.sampleImages,'Artes y vistas de aplicación')}${assetHtml(r.folderImages,'Evidencia de los archivos enviados por Drive')}</div><div><h3 class="section-heading">Historial de revisiones y respuestas</h3><div class="timeline">${responseTimeline(r)}</div></div></div>`;
 $('detailContent').querySelector('[data-copy]')?.addEventListener('click',()=>copyLink(url));$('detailContent').querySelector('[data-mail]')?.addEventListener('click',()=>prepareEmail(r));$('detailContent').querySelector('[data-revision]')?.addEventListener('click',()=>{closeModals();openEditor(r);});$('detailContent').querySelector('[data-revoke]')?.addEventListener('click',()=>revoke(r));}
function openDetail(id){const r=deliveries.find(d=>d.id===id);if(!r)return;openRecord=r.id;renderDetail(r);$('detailOverlay').hidden=false;document.body.style.overflow='hidden';}
async function copyLink(url){try{await navigator.clipboard.writeText(url);notify('Enlace copiado. Puedes enviarlo por correo o mensaje.');}catch(e){notify('No se pudo copiar el enlace: '+e.message,true);}}
function prepareEmail(r){const url=urlFor(r.id);const subject=`ÁGORA · Archivos de aplicación para muestras · ${r.folio}`;const content=`Hola ${r.recipientName},\n\nDejavú Marketing te comparte los artes y archivos de producción para ${r.project}.\n\n1. Abre el enlace de ÁGORA para ver las capturas de evidencia y las indicaciones:\n${url}\n\n2. Accede a los archivos originales en Google Drive:\n${safeHttps(r.driveUrl)}\n\n3. Confirma de recibido desde ÁGORA para generar el comprobante digital. Si falta algún archivo o no puedes abrirlo, repórtalo en el mismo formulario.\n\nVigencia: ${fmt(r.validUntil)}\nVersión: ${r.version}\n\nSaludos,\nDejavú Marketing`;const mailto=`mailto:${encodeURIComponent(r.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;location.href=mailto;}
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
function explainStorageError(error){
  const code=String(error?.code||'');
  if(['storage/quota-exceeded','storage/unauthorized','storage/bucket-not-found','storage/project-not-found'].includes(code))
    return 'Firebase Storage rechazó las imágenes ('+code+'). Comprueba que el proyecto tenga el plan Blaze, un bucket activo y las reglas de Storage publicadas. Los enlaces de Drive siguen disponibles.';
  if(code==='storage/unauthenticated')return 'La sesión expiró mientras subías imágenes. Vuelve a iniciar sesión y prueba de nuevo.';
  if(code==='storage/retry-limit-exceeded')return 'Firebase Storage no respondió. Comprueba que Storage esté habilitado y que tu conexión funcione.';
  if(code==='storage/canceled')return 'Se canceló la subida de imágenes.';
  return 'No se pudo subir una imagen: '+String(error?.message||error);
}
function uploadBlob(blob,handle,section,onProgress){
  return new Promise((resolve,reject)=>{
    const task=uploadBytesResumable(handle,blob,{contentType:'image/jpeg',customMetadata:{section}});
    task.on('state_changed',
      snap=>onProgress(snap.bytesTransferred,Math.max(1,snap.totalBytes)),
      reject,
      resolve);
  });
}
async function uploadAllImages(samples,folders,id,version){
  const jobs=[...samples.map((item,i)=>({item,group:'samples',section:'muestra',i})),
              ...folders.map((item,i)=>({item,group:'folders',section:'carpeta',i}))];
  const result={samples:new Array(samples.length),folders:new Array(folders.length)};
  if(!jobs.length)return result;
  const uploaded=new Array(jobs.length).fill(0),total=new Array(jobs.length).fill(0);
  let completed=0,next=0,failed=false;
  const refresh=()=>{
    let partial=0;
    for(let j=0;j<jobs.length;j++)partial+=total[j]?Math.min(1,uploaded[j]/total[j]):0;
    const percent=Math.min(99,(partial/jobs.length)*100);
    updateUploadStatus('Subiendo imágenes: '+completed+' de '+jobs.length+' completadas · '+Math.round(percent)+'%',percent);
    $('saveButton').textContent='Subiendo '+completed+'/'+jobs.length+'…';
  };
  updateUploadStatus('Preparando '+jobs.length+' imágenes optimizadas…',0);
  async function worker(){
    while(next<jobs.length&&!failed){
      const index=next++,job=jobs[index];
      try{
        const blob=await resize(job.item.file);
        total[index]=blob.size;
        refresh();
        const path='agora-file-previews/'+id+'/v'+version+'/'+job.section+'-'+crypto.randomUUID()+'.jpg';
        const handle=ref(storage,path);
        await uploadBlob(blob,handle,job.section,(bytes,full)=>{
          uploaded[index]=bytes;total[index]=full;refresh();
        });
        const url=await getDownloadURL(handle);
        result[job.group][job.i]=url;
        uploaded[index]=total[index];
        completed++;refresh();
      }catch(error){failed=true;throw error;}
    }
  }
  const settled=await Promise.allSettled(
    Array.from({length:Math.min(3,jobs.length)},()=>worker()));
  const error=settled.find(x=>x.status==='rejected');
  if(error)throw Error(explainStorageError(error.reason));
  updateUploadStatus('Imágenes listas: '+jobs.length+' de '+jobs.length+'. Guardando expediente…',100);
  return result;
}
function normalizeDrive(raw){const uri=safeHttps(String(raw||'').trim());if(!uri)throw Error('Agrega un enlace válido de Drive con https://');const host=new URL(uri).hostname;if(!['drive.google.com','docs.google.com'].includes(host))throw Error('El enlace debe ser de Google Drive o Google Docs.');return uri;}
async function saveDelivery(event){event.preventDefault();let btn=$('saveButton');if(btn.disabled)return;btn.disabled=true;btn.textContent='Guardando en Firebase…';try{authRequired();const f=$('deliveryForm'),fd=new FormData(f),read=x=>String(fd.get(x)||'').trim();const recipientEmail=read('recipientEmail').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))throw Error('Indica un correo válido para el destinatario.');const validUntil=parseValidUntil(read('validUntil'));const driveUrl=normalizeDrive(read('driveUrl'));const id=editRecord?.id||secret(),version=(editRecord?.version||0)+1;if(sampleSelected.length>8||folderSelected.length>6)throw Error('Hay demasiadas imágenes.');let samples=readImageUrls('sampleUrls',8),folders=readImageUrls('folderUrls',6);if(samples.length+sampleSelected.length>8||folders.length+folderSelected.length>6)throw Error('Se superó el límite entre archivos e imágenes por URL.');if(sampleSelected.length||folderSelected.length){const prepared=await uploadAllImages(sampleSelected,folderSelected,id,version);samples=[...samples,...prepared.samples];folders=[...folders,...prepared.folders];btn.textContent='Guardando expediente…';}const payload={project:read('project'),category:read('category'),title:read('title'),recipientName:read('recipientName'),recipientEmail,driveUrl,validUntil,notes:read('notes'),sampleImages:samples,folderImages:folders};if(!payload.project||!payload.title||!payload.recipientName)throw Error('Completa los campos obligatorios.');const rev={version,title:payload.title,notes:payload.notes,driveUrl,sampleImages:samples,folderImages:folders,publishedAt:new Date().toISOString(),editorEmail:user.email||''};if(editRecord){await runTransaction(db,async tx=>{const path=doc(db,'agora_file_deliveries',id),snap=await tx.get(path);if(!snap.exists())throw Error('El expediente ya no existe.');const old=snap.data();if(old.version!==editRecord.version||!old.active)throw Error('El expediente fue actualizado o revocado por otro usuario. Cierra y abre de nuevo el registro.');if(old.recipientEmail!==recipientEmail)throw Error('No se puede cambiar el destinatario del mismo enlace.');tx.update(path,{...payload,version,revisions:[...old.revisions,rev],updatedAt:serverTimestamp()});});}else{const createdAt=new Date(),folio='ARC-'+createdAt.getFullYear()+'-'+createdAt.toISOString().replace(/\D/g,'').slice(4,12)+'-'+id.slice(0,4).toUpperCase();await setDoc(doc(db,'agora_file_deliveries',id),{...payload,folio,id,version,active:true,createdBy:user.uid,createdByEmail:user.email||'',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),revisions:[rev]});}closeModals();notify(`Envío ${editRecord?'actualizado':'publicado'} en Firebase. El enlace ${editRecord?'continúa siendo el mismo':'ya se puede compartir'}.`);openDetail(id);}catch(e){const message=e.message||String(e);notify(message,true);updateUploadStatus(message,null,true);}finally{btn.disabled=false;btn.textContent=editRecord?'Publicar nueva versión':'Publicar envío';}}
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
  user=person;role=null;closeModals();
  $('authButton').textContent=person?'Cerrar sesión':'Iniciar sesión';
  $('userLabel').textContent=person?.email||'Sin sesión';
  $('newButton').disabled=true;$('menuNew').disabled=true;
  for(const id of ['statTotal','statPending','statChanges','statReceived']) $(id).textContent='—';
  $('deliveryRows').innerHTML='<tr><td colspan="6" class="empty-cell">Verificando el acceso a Firebase…</td></tr>';
  if(!person){$('syncState').textContent='Sin sesión';retrySyncButton.hidden=true;return;}
  await retryConnection();
});
$('authButton').addEventListener('click',async()=>{try{if(user)await signOut(auth);else await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){notify('Error de autenticación: '+e.message,true);}});
$('deliveryForm').addEventListener('submit',saveDelivery);$('sampleFiles').addEventListener('change',e=>addFiles(e.target,sampleSelected,'samplePreview',8));$('folderFiles').addEventListener('change',e=>addFiles(e.target,folderSelected,'folderPreview',6));$('search').addEventListener('input',renderList);$('filter').addEventListener('change',renderList);
$('newButton').addEventListener('click',()=>openEditor());$('menuNew').addEventListener('click',()=>openEditor());$('menuHistory').addEventListener('click',()=>{$('search').focus();$('sidebar').classList.remove('mobile-open');});
for(const el of document.querySelectorAll('[data-close]'))el.addEventListener('click',closeModals);
for(const name of ['editorOverlay','detailOverlay'])$(name).addEventListener('click',e=>{if(e.target===$(name))closeModals();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals();});
$('toggleSide').addEventListener('click',()=>{const side=$('sidebar');if(window.innerWidth<=760)side.classList.toggle('mobile-open');else side.classList.toggle('collapsed');});document.addEventListener('click',e=>{if(window.innerWidth<=760&&!e.target.closest('.sidebar,#toggleSide'))$('sidebar').classList.remove('mobile-open');});
