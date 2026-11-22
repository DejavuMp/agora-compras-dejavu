import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
 GMAIL_SEND_SCOPE,getDriveImageId,imageEvidenceCount,renderEmailEvidence,
 loadInlineImages,buildGmailMime,sendGmailInline,MAX_INLINE_BYTES
} from '../email-inline.js';

const first='https://drive.google.com/file/d/PHOTOid123456/view';
const second='https://drive.google.com/file/d/PHOTOidABCDEF/view';
const sampleBlob=()=>new Blob([new Uint8Array([0xff,0xd8,0xff,0xd9])],{type:'image/jpeg'});
const decodeRaw=raw=>Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
function requestForDrive(){
 const seen=[];
 const request=async (url,options)=>{
  seen.push({url,options});
  assert.equal(options.headers.Authorization,'Bearer drive-test');
  if(url.includes('fields='))return {ok:true,json:async()=>({mimeType:'image/jpeg',size:4})};
  if(url.includes('alt=media'))return {ok:true,blob:async()=>sampleBlob()};
  throw Error('Unexpected Drive URL '+url);
 };
 return {request,seen};
}
test('Drive IDs aceptan solo archivos en host auténtico de Google',()=>{
 assert.equal(getDriveImageId(first),'PHOTOid123456');
 assert.equal(getDriveImageId('https://drive.google.com/uc?id=PHOTOid123456'),'PHOTOid123456');
 assert.equal(getDriveImageId('https://drive.google.com.evil.com/file/d/PHOTOid123456/view'),'');
 assert.equal(getDriveImageId('https://drive.google.com/drive/folders/PHOTOid123456'),'');
 assert.equal(getDriveImageId('javascript:alert(1)'),'');
});
test('Cargar imágenes con Drive autorizado preserva enlaces y evita público',async()=>{
 const {request,seen}=requestForDrive();
 const {images,failures,totalBytes}=await loadInlineImages({urls:[first,second],accessToken:'drive-test',request});
 assert.equal(images.length,2);
 assert.deepEqual(failures,[]);
 assert.equal(totalBytes,8);
 assert.equal(images[0].cid,'agora-photo-1@archivos.dejavu');
 assert.equal(images[1].url,second);
 assert.equal(seen.length,4);
 assert.ok(seen.every(x=>!x.url.includes('permissions')));
});
test('Accesos inválidos no se muestran como imágenes incrustadas',async()=>{
 const {request}=requestForDrive();
 const result=await loadInlineImages({urls:[first,'https://example.com/secret.png'],accessToken:'drive-test',request});
 assert.equal(result.images.length,1);
 assert.equal(result.failures.length,1);
 assert.match(result.failures[0],/enlace individual/);
 const denied=await loadInlineImages({urls:[first],accessToken:'drive-test',
 request:async()=>({ok:false,status:403})});
 assert.equal(denied.images.length,0);
 assert.match(denied.failures[0],/Sin permiso/);
});
test('Vista previa muestra foto real blob y correo final usa Content ID',()=>{
 const image={url:first,previewUrl:'blob:https://ejemplo.local/123',cid:'agora-photo-1@archivos.dejavu'};
 const preview=renderEmailEvidence([first],'Artes de aplicación',[image],'preview');
 const finalHtml=renderEmailEvidence([first],'Artes de aplicación',[image],'email');
 assert.match(preview,/<img src="blob:https:\/\/ejemplo.local\/123"/);
 assert.match(finalHtml,/<img src="cid:agora-photo-1@archivos.dejavu"/);
 assert.match(finalHtml,/Abrir original/);
 assert.doesNotMatch(finalHtml,/blob:/);
 const noAccess=renderEmailEvidence([second],'Evidencia',[],'email');
 assert.doesNotMatch(noAccess,/<img/);
 assert.match(noAccess,/Archivo privado en Google Drive/);
});
test('Construcción de MIME Gmail usa multipart/related, CID y base64url',async()=>{
 const image={url:first,cid:'agora-photo-1@archivos.dejavu',mime:'image/jpeg',blob:sampleBlob()};
 const html=renderEmailEvidence([first],'Vistas',[image],'email');
 const raw=await buildGmailMime({
  from:'coordinacion@example.com',to:'proveedor@example.com',subject:'ÁGORA · Confirmación',
  plain:'Hola proveedor',html,images:[image]
 });
 assert.match(raw,/^[A-Za-z0-9_-]+$/);
 const mime=decodeRaw(raw);
 assert.match(mime,/From: coordinacion@example.com/);
 assert.match(mime,/To: proveedor@example.com/);
 assert.match(mime,/Content-Type: multipart\/related;/);
 assert.match(mime,/Content-Type: multipart\/alternative;/);
 assert.match(mime,/Content-Disposition: inline;/);
 assert.match(mime,/Content-ID: <agora-photo-1@archivos.dejavu>/);
 assert.match(mime,/Content-Transfer-Encoding: base64/);
 const htmlBase64=Buffer.from(html,'utf8').toString('base64').replace(/.{1,76}/g,'$&\r\n').trimEnd();
 assert.ok(mime.includes(htmlBase64));
 assert.match(html,/<img src="cid:agora-photo-1@archivos.dejavu"/);
 assert.equal(imageEvidenceCount({sampleImages:[first],folderImages:[first,second]}),2);
 assert.equal(GMAIL_SEND_SCOPE,'https://www.googleapis.com/auth/gmail.send');
 assert.equal(MAX_INLINE_BYTES,9*1024*1024);
});
test('Gmail solo envía con autorización, nunca registra éxito falso',async()=>{
 let count=0;
 const id=await sendGmailInline({accessToken:'gmail-test',raw:'raw-message',request:async(url,init)=>{
  count++;
  assert.match(url,/\/gmail\/v1\/users\/me\/messages\/send$/);
  assert.equal(init.method,'POST');
  assert.equal(init.headers.Authorization,'Bearer gmail-test');
  assert.equal(JSON.parse(init.body).raw,'raw-message');
  return {ok:true,json:async()=>({id:'gmail-message-123'})};
 }});
 assert.equal(id,'gmail-message-123');
 assert.equal(count,1);
 await assert.rejects(sendGmailInline({accessToken:'gmail-test',raw:'raw',
  request:async()=>({ok:true,json:async()=>({})})}),/sin identificador/);
 await assert.rejects(sendGmailInline({accessToken:'gmail-test',raw:'raw',
  request:async()=>({ok:false,status:403,json:async()=>({error:{message:'API disabled'}})})}),/Activa Gmail API/);
});
test('No permite encabezados de correo peligrosos ni usuarios vacíos',async()=>{
 await assert.rejects(buildGmailMime({from:'coordinacion@example.com',to:'dest@example.com\r\nBcc:evil@example.com',
 subject:'Asunto',html:'<p>Hola</p>',plain:'Hola'}),/Correo remitente/);
 await assert.rejects(buildGmailMime({from:'',to:'dest@example.com',subject:'Asunto',html:'<p>Hola</p>',plain:'Hola'}),/Correo remitente/);
});
test('La UI conserva links de respaldo y no envía automáticamente',()=>{
 const app=readFileSync(fileURLToPath(new URL('../app.js',import.meta.url)),'utf8');
 const page=readFileSync(fileURLToPath(new URL('../index.html',import.meta.url)),'utf8');
 assert.match(page,/id="sendGmailInline" type="button" disabled/);
 assert.match(page,/id="emailLoadPhotos"/);
 assert.match(app,/reauthenticateWithPopup\(auth.currentUser,provider\)/);
 assert.match(app,/if\(!confirm\('/);
 assert.match(app,/emailImages.length!==total/);
 assert.match(app,/const fresh=await getDoc/);
 assert.match(app,/evidenceEmailHtml/);
 assert.doesNotMatch(app,/firebase-storage\.js/);
});