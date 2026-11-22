/* ÁGORA · Archivos — fotografías optimizadas en Google Drive (sin Firebase Storage).
   Solo usa drive.file: crea carpetas y archivos propios de la aplicación.
   No hace públicos los archivos ni conserva tokens OAuth de forma persistente. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function assertId(id) {
  if (!/^[A-Za-z0-9_-]{8,}$/.test(String(id || ''))) throw new Error('Google Drive devolvió un identificador inválido.');
  return id;
}
function folderName(name, max=85) {
  return String(name || 'Sin proyecto').replace(/[\\/\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g,' ').trim().slice(0,max) || 'Sin proyecto';
}
function quoteSearch(text) {
  return String(text).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
async function driveFetch(accessToken, endpoint, options={}) {
  if (!accessToken) throw new Error('Conecta Google Drive antes de subir imágenes.');
  let response;
  try {
    response=await fetch(endpoint, {
      ...options,
      headers:{Authorization:'Bearer '+accessToken,Accept:'application/json',...(options.headers || {})}
    });
  } catch(e) {
    throw new Error('No se pudo conectar con Google Drive. Revisa tu conexión y los bloqueadores del navegador. '+(e?.message||''));
  }
  const body=await response.json().catch(()=>({}));
  if (!response.ok) {
    const reason=body?.error?.errors?.[0]?.reason||body?.error?.status||'';
    const detail=body?.error?.message||response.statusText||'';
    let hint='';
    if(response.status===401) hint='Tu permiso de Drive expiró. Pulsa «Conectar Google Drive» nuevamente.';
    else if(reason==='accessNotConfigured'||reason==='SERVICE_DISABLED'||/API has not been used|disabled/i.test(detail))
      hint='Activa «Google Drive API» en Google Cloud para el proyecto agora-dejavu-38b8c.';
    else if(response.status===403) hint='Comprueba los permisos de Drive, la cuenta autorizada y las políticas de uso compartido.';
    else if(response.status===429) hint='Se alcanzó temporalmente la cuota de Drive. Intenta de nuevo.';
    throw new Error('Google Drive ('+response.status+'): '+detail+(hint?' '+hint:''));
  }
  return body;
}
async function findFolder(token, name, parent) {
  const q="name = '"+quoteSearch(name)+"' and mimeType = '"+FOLDER_MIME+
    "' and trashed = false and '"+(parent||'root')+"' in parents";
  const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name)',page_size:'100',pageSize:'100'});
  params.delete('page_size');
  const result=await driveFetch(token,DRIVE_BASE+'?'+params);
  const candidate=result.files?.find(f=>f.name===name);
  return candidate?assertId(candidate.id):null;
}
async function ensureFolder(token, name, parent=null) {
  const safe=folderName(name);
  const existing=await findFolder(token,safe,parent);
  if(existing)return existing;
  const data={name:safe,mimeType:FOLDER_MIME};
  if(parent)data.parents=[assertId(parent)];
  const created=await driveFetch(token,DRIVE_BASE+'?fields=id,name',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
  });
  return assertId(created.id);
}
async function grantRecipientAccess(token,folderId,recipientEmail,uploaderEmail){
  if(recipientEmail.toLowerCase()===String(uploaderEmail||'').toLowerCase())return;
  const endpoint=DRIVE_BASE+'/'+assertId(folderId)+'/permissions';
  const existing=await driveFetch(token,endpoint+'?fields=nextPageToken,permissions(id,type,emailAddress,role)&pageSize=100');
  if(existing.permissions?.some(p=>p.type==='user'&&p.emailAddress?.toLowerCase()===recipientEmail.toLowerCase()))return;
  await driveFetch(token,endpoint+'?sendNotificationEmail=false&fields=id',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({type:'user',role:'reader',emailAddress:recipientEmail})
  });
}
async function uploadJpeg(token, folderId, fileName, blob) {
  if(blob.type!=='image/jpeg'||blob.size>6*1024*1024)
    throw new Error('La fotografía optimizada debe ser JPEG y menor de 6 MB.');
  const name=folderName(fileName,140);
  const metadata=JSON.stringify({name,parents:[assertId(folderId)],mimeType:'image/jpeg'});
  const boundary='agora-'+crypto.randomUUID();
  const body=new Blob([
    '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    '\r\n--'+boundary+'\r\nContent-Type: image/jpeg\r\n\r\n',
    blob,
    '\r\n--'+boundary+'--\r\n'
  ],{type:'multipart/related; boundary='+boundary});
  const result=await driveFetch(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{
    method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
  });
  return 'https://drive.google.com/file/d/'+assertId(result.id)+'/view';
}
/** Crea una carpeta por expediente/versión y comparte SOLO esa carpeta con el destinatario.
 * onSaved se ejecuta por cada archivo completado para conservar enlaces ante reintentos.
 * Los documentos y acuses existentes en Firestore nunca se modifican aquí.
 */
export async function uploadDriveImages({accessToken, project, deliveryId, version,
  recipientEmail, uploaderEmail, items, onSaved=()=>{}, onStatus=()=>{}}) {
  if(!Array.isArray(items)||!items.length)return {folderUrl:''};
  if(!/^[A-Za-z0-9_-]{43}$/.test(String(deliveryId||'')))throw new Error('El folio de archivo no es válido.');
  if(!Number.isInteger(version)||version<1||version>30)throw new Error('Versión de expediente no válida.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipientEmail||'')))throw new Error('Correo del destinatario no válido.');
  onStatus('Preparando carpetas de Google Drive…',0);
  const root=await ensureFolder(accessToken,'ÁGORA Dejavú');
  const appFolder=await ensureFolder(accessToken,'Archivos de producción',root);
  const projectFolder=await ensureFolder(accessToken,project,appFolder);
  const deliveryFolder=await ensureFolder(accessToken,deliveryId,projectFolder);
  const versionFolder=await ensureFolder(accessToken,'v'+version,deliveryFolder);
  // No publicar vínculos de fotografías si el destinatario no obtiene acceso.
  onStatus('Compartiendo carpeta privada con el destinatario…',0);
  await grantRecipientAccess(accessToken,versionFolder,recipientEmail,uploaderEmail);
  let done=0;
  for(const job of items) {
    if(!['muestra','carpeta'].includes(job.section))throw new Error('Sección de imagen inválida.');
    onStatus('Subiendo a Drive '+(done+1)+' de '+items.length+'…',Math.floor(done/items.length*100));
    const link=await uploadJpeg(accessToken,versionFolder,
      job.section+'-'+crypto.randomUUID()+'.jpg',job.blob);
    await onSaved({...job,url:link});
    done++;
    onStatus('Fotografías guardadas en Drive: '+done+' de '+items.length,Math.round(done/items.length*100));
  }
  return {folderUrl:'https://drive.google.com/drive/folders/'+versionFolder};
}
