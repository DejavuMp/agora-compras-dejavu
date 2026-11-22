import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {uploadDriveImages,DRIVE_SCOPE} from '../drive-upload.js';

const id='a'.repeat(43);
const jpeg=()=>new Blob(['jpeg test bytes'],{type:'image/jpeg'});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,statusText:'Test',
  json:async()=>body});
function mockDrive({hasPermission=false,denyShare=false}={}){
 const calls=[];let num=0;
 globalThis.fetch=async(url,opts={})=>{
  const address=String(url),method=opts.method||'GET';calls.push({address,method,opts});
  assert.equal(opts.headers?.Authorization,'Bearer test-access-token');
  if(method==='GET'&&address.includes('/permissions?')){
   return response({permissions:hasPermission?[{type:'user',emailAddress:'destinatario@example.com',role:'reader'}]:[]});
  }
  if(method==='GET')return response({files:[]});
  if(address.includes('/permissions?')){
   assert.equal(method,'POST');
   const params=JSON.parse(opts.body);
   assert.deepEqual(params,{type:'user',role:'reader',emailAddress:'destinatario@example.com'});
   return denyShare?response({error:{message:'Compartir prohibido'}},403):response({id:'permission-id'});
  }
  if(address.includes('/upload/drive/v3/files')){
   assert.equal(method,'POST');
   assert.match(opts.headers['Content-Type'],/^multipart\/related; boundary=/);
   assert.ok(opts.body instanceof Blob);
   return response({id:'image-id-'+String(++num).padStart(8,'0')});
  }
  if(method==='POST'){
   const body=JSON.parse(opts.body);
   assert.equal(body.mimeType,'application/vnd.google-apps.folder');
   assert.ok(body.name);
   return response({id:'folder-id-'+String(++num).padStart(8,'0')});
  }
  throw Error('unexpected: '+address);
 };
 return calls;
}
const upload=overrides=>uploadDriveImages({
 accessToken:'test-access-token',project:'KFC 2026',deliveryId:id,version:1,
 recipientEmail:'destinatario@example.com',uploaderEmail:'coordinador@example.com',
 items:[{section:'muestra',blob:jpeg()},{section:'carpeta',blob:jpeg()}],
 ...overrides
});
test('Drive pide scope limitado y no Storage ni permisos públicos',async()=>{
 const backup=globalThis.fetch;
 try{
  assert.equal(DRIVE_SCOPE,'https://www.googleapis.com/auth/drive.file');
  const calls=mockDrive(),saved=[];
  const result=await upload({onSaved:item=>saved.push(item)});
  assert.equal(saved.length,2);
  assert.match(result.folderUrl,/^https:\/\/drive.google.com\/drive\/folders\//);
  assert.ok(saved.every(v=>v.url.startsWith('https://drive.google.com/file/d/')));
  assert.equal(calls.filter(c=>c.address.includes('/permissions?')&&c.method==='POST').length,1);
  assert.ok(!calls.some(c=>c.address.includes('firebasestorage')));
  assert.equal(calls.filter(c=>c.address.includes('/upload/drive/v3/files')).length,2);
  assert.ok(!calls.some(c=>String(c.opts.body).includes('"anyone"')));
 }finally{globalThis.fetch=backup;}
});
test('fallo al compartir carpeta impide subir archivos al destinatario',async()=>{
 const backup=globalThis.fetch;
 try{
  const calls=mockDrive({denyShare:true});
  await assert.rejects(upload(),/Compartir prohibido/);
  assert.equal(calls.filter(c=>c.address.includes('/upload/drive/v3/files')).length,0);
 }finally{globalThis.fetch=backup;}
});
test('edición con permisos ya existentes no intenta duplicarlos',async()=>{
 const backup=globalThis.fetch;
 try{
  const calls=mockDrive({hasPermission:true});
  await upload();
  assert.equal(calls.filter(c=>c.address.includes('/permissions?')&&c.method==='POST').length,0);
 }finally{globalThis.fetch=backup;}
});
test('no acepta subir sin token o con versión inválida',async()=>{
 await assert.rejects(upload({accessToken:''}),/Conecta Google Drive/);
 await assert.rejects(upload({version:31}),/Versión de expediente/);
});
test('pantalla mantiene las acciones y deja de depender de Firebase Storage',()=>{
 const index=readFileSync(fileURLToPath(new URL('../index.html',import.meta.url)),'utf8');
 const app=readFileSync(fileURLToPath(new URL('../app.js',import.meta.url)),'utf8');
 assert.match(index,/id="connectDriveButton"/);
 assert.match(index,/id="driveConnectionStatus"/);
 assert.match(app,/reauthenticateWithPopup/);
 assert.match(app,/onSaved:/);
 assert.doesNotMatch(app,/firebase-storage\.js/);
});
