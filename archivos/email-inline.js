/* ÁGORA · Archivos: vista previa privada e imágenes CID para Gmail.
 * Archivos binarios y tokens OAuth permanecen únicamente en memoria.
 * Nunca hace públicos los documentos ni escribe en Firestore. */
export const GMAIL_SEND_SCOPE='https://www.googleapis.com/auth/gmail.send';
export const MAX_INLINE_BYTES=9*1024*1024;
export const MAX_SINGLE_IMAGE_BYTES=4*1024*1024;
const DRIVE_API='https://www.googleapis.com/drive/v3/files/';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const emailValid=value=>/^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/.test(String(value??''));
const allowedTypes=new Set(['image/jpeg','image/png','image/webp']);

export function getDriveImageId(raw){
 try{
  const u=new URL(String(raw||'').trim());
  if(u.protocol!=='https:'||u.hostname!=='drive.google.com')return '';
  const id=u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{8,})(?:\/|$)/)?.[1]||
    (/^\/(?:uc|open|thumbnail)$/.test(u.pathname)?u.searchParams.get('id'):'');
  return /^[A-Za-z0-9_-]{8,}$/.test(id||'')?id:'';
 }catch{return '';}
}
export function imageEvidenceCount(record){
 return [...new Set([...(record?.sampleImages||[]),...(record?.folderImages||[])].filter(Boolean))].length;
}
function base64Bytes(bytes){
 let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}
function encodeBody(value){return base64Bytes(new TextEncoder().encode(value)).replace(/.{1,76}/g,'$&\r\n').trimEnd();}
function encodeHeader(value){
 const text=String(value||'').replace(/[\r\n]+/g,' ').trim();
 const words=[];let part='',bytes=0;
 for(const char of text){
  const size=new TextEncoder().encode(char).length;
  if(part&&bytes+size>36){words.push('=?UTF-8?B?'+base64Bytes(new TextEncoder().encode(part))+'?=');part='';bytes=0;}
  part+=char;bytes+=size;
 }
 if(part)words.push('=?UTF-8?B?'+base64Bytes(new TextEncoder().encode(part))+'?=');
 return words.join('\r\n ');
}
export function renderEmailEvidence(urls,heading,images=[],mode='email'){
 const list=Array.isArray(urls)?urls.slice(0,8):[];
 if(!list.length)return '';
 const safeHeading=esc(heading);
 return '<h3 style="font:700 14px Arial,Helvetica,sans-serif;color:#5a431f;margin:22px 0 10px">'+safeHeading+'</h3>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">'+
 list.map((raw,index)=>{
  let url='';try{const u=new URL(String(raw));if(u.protocol==='https:')url=u.href;}catch{}
  if(!url)return '';
  const found=images.find(x=>x.url===url);
  const source=found?(mode==='preview'?found.previewUrl:'cid:'+found.cid):'';
  const imageHtml=source?
    '<img src="'+esc(source)+'" alt="Fotografía '+(index+1)+'" width="245" style="display:block;width:245px;max-width:100%;height:auto;max-height:230px;object-fit:contain;border:0;background:#fff">':
    '<div style="padding:22px 8px;color:#796b57;font:12px Arial,Helvetica,sans-serif;background:#f5f0e8">Vista disponible en Drive</div>';
  return '<tr><td style="padding:0 0 12px">'+
   '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e0d5c3;background:#faf8f3"><tr>'+
   '<td style="width:50%;padding:9px;vertical-align:middle;text-align:center"><a href="'+esc(url)+'" style="text-decoration:none" target="_blank">'+imageHtml+'</a></td>'+
   '<td style="padding:12px;vertical-align:middle;font:12px Arial,Helvetica,sans-serif;color:#4b4033">'+
   '<b>Fotografía '+(index+1)+'</b><div style="margin-top:7px;color:#82715d">'+(found?'Vista del arte adjunta':'Archivo privado en Google Drive')+'</div>'+
   '<a href="'+esc(url)+'" style="display:inline-block;background:#29251f;color:#fff;text-decoration:none;padding:11px 13px;margin-top:13px;border-radius:4px;font:bold 11px Arial,Helvetica,sans-serif">Abrir original</a>'+
   '</td></tr></table></td></tr>';
 }).join('')+'</table>';
}
/** Solo lee imágenes en Drive con el acceso de la misma cuenta que las creó. */
export async function loadInlineImages({urls,accessToken,onProgress=()=>{},request=fetch}){
 if(!accessToken)throw Error('Conecta Drive antes de cargar las fotografías privadas.');
 const unique=[...new Set((urls||[]).filter(Boolean))];
 if(unique.length>14)throw Error('Se excedió el máximo de 14 fotografías por envío.');
 const images=[],failures=[];let sum=0;
 for(let i=0;i<unique.length;i++){
  const url=unique[i],id=getDriveImageId(url);
  onProgress('Preparando fotografía '+(i+1)+' de '+unique.length+'…');
  if(!id){failures.push('Fotografía '+(i+1)+': requiere un enlace individual de Google Drive.');continue;}
  try{
   const headers={Authorization:'Bearer '+accessToken};
   const metadataRes=await request(DRIVE_API+encodeURIComponent(id)+'?fields=id,mimeType,size&supportsAllDrives=true',{headers});
   if(!metadataRes.ok)throw Error(metadataRes.status===403?'Sin permiso de lectura en Drive.':metadataRes.status===401?'Sesión de Drive vencida.':'Drive respondió '+metadataRes.status+'.');
   const metadata=await metadataRes.json();
   const mime=String(metadata.mimeType||'').toLowerCase();
   if(!allowedTypes.has(mime))throw Error('No es una imagen JPG, PNG o WebP.');
   const n=Number(metadata.size||0);
   if(n>MAX_SINGLE_IMAGE_BYTES)throw Error('Imagen mayor de 4 MB; comprímela antes de enviarla.');
   if(n&&sum+n>MAX_INLINE_BYTES)throw Error('Límite total de fotografías incrustadas: 9 MB.');
   const media=await request(DRIVE_API+encodeURIComponent(id)+'?alt=media&supportsAllDrives=true',{headers});
   if(!media.ok)throw Error(media.status===403?'Sin permiso para descargarla de Drive.':'No fue posible descargarla (HTTP '+media.status+').');
   const blob=await media.blob();
   if(blob.size>MAX_SINGLE_IMAGE_BYTES||sum+blob.size>MAX_INLINE_BYTES)throw Error('El tamaño de las fotografías supera el límite de 9 MB.');
   if(!blob.size)throw Error('La imagen está vacía.');
   sum+=blob.size;
   images.push({url,mime,blob,cid:'agora-photo-'+(i+1)+'@archivos.dejavu'});
  }catch(err){failures.push('Fotografía '+(i+1)+': '+(err?.message||err));}
 }
 return {images,failures,totalBytes:sum};
}
export async function buildGmailMime({from,to,subject,html,plain,images=[]}){
 if(!emailValid(from)||!emailValid(to))throw Error('Correo remitente o destinatario no válido.');
 if(!subject||!html||!plain)throw Error('El correo requiere asunto y contenido.');
 if(images.reduce((n,x)=>n+x.blob.size,0)>MAX_INLINE_BYTES)throw Error('Se excede el límite de 9 MB para fotos incrustadas.');
 const related='agora-related-'+crypto.randomUUID().replace(/-/g,'');
 const alternative='agora-alternative-'+crypto.randomUUID().replace(/-/g,'');
 const lines=[
  'From: '+from,'To: '+to,'Subject: '+encodeHeader(subject),
  'MIME-Version: 1.0','Content-Type: multipart/related; boundary="'+related+'"','',
  '--'+related,'Content-Type: multipart/alternative; boundary="'+alternative+'"','',
  '--'+alternative,'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: base64','',encodeBody(plain),'',
  '--'+alternative,'Content-Type: text/html; charset=UTF-8',
  'Content-Transfer-Encoding: base64','',encodeBody(html),'',
  '--'+alternative+'--'
 ];
 for(const [i,image] of images.entries()){
  if(!allowedTypes.has(image.mime)||!/^[a-z0-9@.-]+$/i.test(image.cid))throw Error('Imagen adjunta no válida.');
  const bytes=new Uint8Array(await image.blob.arrayBuffer());
  const extension=image.mime==='image/png'?'png':image.mime==='image/webp'?'webp':'jpg';
  lines.push('','--'+related,'Content-Type: '+image.mime+'; name="evidencia-'+(i+1)+'.'+extension+'"',
    'Content-Transfer-Encoding: base64','Content-Disposition: inline; filename="evidencia-'+(i+1)+'.'+extension+'"',
    'Content-ID: <'+image.cid+'>','',
    base64Bytes(bytes).replace(/.{1,76}/g,'$&\r\n').trimEnd());
 }
 lines.push('','--'+related+'--','');
 const raw=lines.join('\r\n');
 return base64Bytes(new TextEncoder().encode(raw)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function sendGmailInline({accessToken,raw,request=fetch}){
 if(!accessToken||!raw)throw Error('Conecta Gmail y prepara el correo antes de enviarlo.');
 const response=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
  method:'POST',
  headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
  body:JSON.stringify({raw})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const detail=data?.error?.message||'No fue posible enviar el correo.';
  const hint=response.status===403?' Activa Gmail API y revisa el permiso gmail.send en Google Auth Platform.':
    response.status===401?' Reautoriza Gmail con tu cuenta de ÁGORA.':'';
  throw Error('Gmail ('+response.status+'): '+detail+hint);
 }
 if(!data.id)throw Error('Gmail respondió sin identificador de mensaje. Comprueba Enviados antes de reintentar.');
 return data.id;
}
