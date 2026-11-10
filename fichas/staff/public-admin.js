/* Dejavú Marketing · publicación automática de fichas aprobadas.
   Las fichas originales continúan locales; en la nube solo van campaña,
   responsable, fecha y ubicación. No se publican correos ni evidencias.
   Requiere activar las reglas de seguridad Firebase desde consola autorizada. */
import "../../firebase-init.js";
import {GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {getDoc,doc,collection,getDocs,setDoc,deleteDoc,serverTimestamp,Bytes} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const fb=window.AGORA_FIREBASE,$=id=>document.getElementById(id);
const COL='dejavu_staff_publicadas';
const EVIDENCE='dejavu_staff_evidencias';
const PHOTOS_OPT='dejavu.staff.photos.approved.v1';
const OPT='dejavu.staff.publication.approved.v1';
const login=$('publicLogin'),logout=$('publicLogout'),publish=$('publicAll'),status=$('publicStatus'),count=$('publicCount');
const photoButton=$('publishPhotos'),photoStatus=$('photoPublishStatus');
let user=null,editor=false,busy=false,approved=false,published=new Set();
let photosApproved=false,photoBusy=false;
function say(t){if(status)status.textContent=t;}
function sayPhoto(t){if(photoStatus)photoStatus.textContent=t;}
function items(){return window.DEJAVU_STAFF_BRIDGE?.list?.()||[];}
function valid(r){return r&&/^DJV-[0-9]{8}-[0-9]{3,}$/.test(String(r.id||''))&&
 ['campaign','responsible','activityDate','location'].every(k=>typeof r[k]==='string'&&r[k].trim().length>0);}
function snapshot(r){return {id:r.id,campaign:r.campaign.slice(0,95),responsible:r.responsible.slice(0,95),
 activityDate:r.activityDate.slice(0,10),location:r.location.slice(0,240)};}
function updateUi(){
 if(login)login.hidden=!!user;
 if(logout)logout.hidden=!user;
 if(publish)publish.disabled=busy||!editor;
 if(photoButton)photoButton.disabled=busy||photoBusy||!editor||!published.size;
 if(count)count.textContent=published.size+' fichas visibles en el catálogo del personal';
}
async function isEditor(u){
 if(!u||!u.emailVerified)return false;
 const snap=await getDoc(doc(fb.firestore,'agora_users',u.uid));
 return snap.exists()&&snap.data().active===true&&['admin','coordinador'].includes(snap.data().role);
}
async function reloadIds(){
 const snap=await getDocs(collection(fb.firestore,COL));
 published=new Set(snap.docs.map(x=>x.id));
 updateUi();
}
async function publishOne(r){
 if(!valid(r)||!editor||!user)return false;
 const ref=doc(fb.firestore,COL,r.id);
 const now=serverTimestamp();
 const old=await getDoc(ref);
 const fields={...snapshot(r),updatedAt:now};
 if(old.exists())await setDoc(ref,fields,{merge:true});
 else await setDoc(ref,{...fields,publishedBy:user.uid,publishedAt:serverTimestamp()});
 published.add(r.id);updateUi();return true;
}
// Las fotos de evidencia son archivos JPEG en Firestore. Cloud Storage
// requiere Blaze, así que utilizamos un documento separado de menos de 1 MiB.
// El archivo local original jamás se modifica.
function isPhoto(url){return typeof url==='string'&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url);}
function sourceHash(source){
 let h=2166136261;
 for(let i=0;i<source.length;i++)h=Math.imul(h^source.charCodeAt(i),16777619);
 return (h>>>0).toString(16).padStart(8,'0');
}
function decodeBase64(str){
 const raw=atob(str);
 const result=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)result[i]=raw.charCodeAt(i);
 return result;
}
function jpegPart(source){
 const index=source.indexOf(',');
 return decodeBase64(source.slice(index+1));
}
async function jpegForCloud(source){
 if(!isPhoto(source))throw Error('El archivo guardado no es una fotografía compatible.');
 if(source.startsWith('data:image/jpeg;')){
  const bytes=jpegPart(source);
  if(bytes.length<=850000)return bytes;
 }
 const img=new Image();img.src=source;await img.decode();
 let maxSize=1800;
 for(let n=0;n<9;n++){
  const ratio=Math.min(1,maxSize/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  const c=canvas.getContext('2d');
  if(!c)throw Error('No se pudo optimizar la foto.');
  c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
  c.drawImage(img,0,0,canvas.width,canvas.height);
  const quality=n<3?[.86,.77,.67][n]:.75;
  const bytes=jpegPart(canvas.toDataURL('image/jpeg',quality));
  if(bytes.length<=820000)return bytes;
  maxSize=Math.max(550,Math.round(maxSize*.80));
 }
 throw Error('La fotografía es demasiado grande para el archivo compartido.');
}
function nameFor(r){
 const cleaned=String(r.evidenceName||'Evidencia_'+r.activityDate+'_'+r.id).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,145);
 return (cleaned.replace(/\.[a-zA-Z0-9]{2,5}$/,'')||'Evidencia_'+r.id)+'.jpg';
}
async function publishEvidence(r){
 if(!editor||!user||!valid(r)||!published.has(r.id))return 'skip';
 const source=await window.DEJAVU_STAFF_BRIDGE?.photo?.(r.id);
 const ref=doc(fb.firestore,EVIDENCE,r.id);
 if(!isPhoto(source)){
  if(r.hasEvidence)throw Error('No se encontró la fotografía guardada de '+r.id+'. Utiliza el navegador original.');
  // Cuando se elimina la evidencia local, también retirarla del catálogo.
  const old=await getDoc(ref);
  if(old.exists())await deleteDoc(ref);
  return 'without';
 }
 const hash=sourceHash(source);
 const old=await getDoc(ref);
 if(old.exists()&&old.data().sourceHash===hash)return 'unchanged';
 const bytes=await jpegForCloud(source);
 await setDoc(ref,{
  id:r.id,photoBytes:Bytes.fromUint8Array(bytes),photoName:nameFor(r),
  mime:'image/jpeg',sourceHash:hash,uploadedBy:user.uid,updatedAt:serverTimestamp()
 });
 return 'published';
}
async function publishAllEvidence(){
 if(!editor||!user||photoBusy)return;
 if(!published.size){sayPhoto('Primero publica tus fichas en la nube.');return}
 if(!photosApproved){
  const count=items().filter(r=>r.hasEvidence).length;
  if(!count){sayPhoto('No hay fotografías guardadas en este navegador para publicar.');return}
  const ok=window.confirm('¿PUBLICAR '+count+' FOTO(S) DE EVIDENCIA? Cualquier persona que acceda a una ficha publicada podrá ver y descargar su foto. No se publicarán datos bancarios. Las fotos originales del navegador se conservan.');
  if(!ok)return;
 }
 photosApproved=true;
 localStorage.setItem(PHOTOS_OPT,'yes');
 photoBusy=true;updateUi();
 let uploaded=0,unchanged=0,without=0,failed=0;
 try{
  const all=items().filter(r=>valid(r)&&published.has(r.id));
  for(let i=0;i<all.length;i++){
   try{
    const result=await publishEvidence(all[i]);
    if(result==='published')uploaded++;
    if(result==='unchanged')unchanged++;
    if(result==='without')without++;
   }catch(e){failed++;console.warn('Foto pendiente',all[i].id,e)}
   sayPhoto('Fotografías: '+(i+1)+' de '+all.length+' revisadas…');
  }
  sayPhoto('Fotografías listas: '+(uploaded+unchanged)+' · nuevas '+uploaded+' · sin foto '+without+(failed?' · '+failed+' pendientes de sincronizar. Revisa los permisos de Firestore.':'.'));
 }catch(e){sayPhoto('No se pudieron publicar las fotografías: '+(e?.code||e?.message||'error de conexión'))}
 finally{photoBusy=false;updateUi()}
}

async function publishAll(){
 if(!editor||!user||busy)return;
 if(!approved){
  const ok=window.confirm('¿Publicar todas tus fichas guardadas para que cualquier persona con el enlace de Staff pueda consultarlas? Solo se mostrarán campaña, solicitado por, fecha y ubicación; nunca el correo ni las fotos.');
  if(!ok)return;
 }
 busy=true;updateUi();
 let saved=0,failed=0;
 try{
  approved=true;
  localStorage.setItem(OPT,'yes');
  const records=items().filter(valid);
  for(let i=0;i<records.length;i++){
   try{await publishOne(records[i]);saved++}
   catch(e){failed++;console.warn('No se publicó',records[i].id,e); if(e?.code==='permission-denied'){break;}}
   if(i%10===0)say('Publicando fichas… '+(i+1)+' / '+records.length);
  }
  if(failed)say('No se publicaron todas las fichas. Verifica que las reglas de Firebase estén activadas; los originales siguen guardados.');
  else{say(saved+' fichas publicadas para todo el staff. Los próximos cambios se publicarán al guardarlos.');window.DEJAVU_STAFF_PUBLIC_READY=true;}
  if(!failed&&photosApproved&&!photoBusy)await publishAllEvidence();
 }catch(e){say('No se pudo publicar: '+(e?.code||e?.message||'sin conexión'))}
 finally{busy=false;updateUi();}
}
async function autoSave(ev){
 const r=ev.detail?.record;
 if(!approved||!editor||!valid(r))return;
 try{await publishOne(r);window.DEJAVU_STAFF_PUBLIC_READY=true;say('Ficha actualizada para todo el staff.');
  if(photosApproved){try{const result=await publishEvidence(r);sayPhoto(result==='published'?'Fotografía actualizada para el staff.':'Fotografía sincronizada.')}catch(error){sayPhoto('La ficha se guardó, pero la foto aún no se publicó: '+(error.code||error.message||'error'));}}}
 catch(e){window.DEJAVU_STAFF_PUBLIC_READY=false;say('Ficha guardada localmente. Publicación pendiente: '+(e?.code||e?.message||'sin conexión'))}
}
async function autoDelete(ev){
 const id=ev.detail?.id;
 if(!approved||!editor||!id||!published.has(id))return;
 try{
  try{await deleteDoc(doc(fb.firestore,EVIDENCE,id))}catch(e){if(e.code!=='not-found')console.warn('Foto no retirada',e)}
  await deleteDoc(doc(fb.firestore,COL,id));published.delete(id);updateUi();say('Ficha eliminada del catálogo compartido.')
 }
 catch(e){say('Eliminada del archivo local, pero sigue visible en el catálogo. Revisa la conexión.')}
}
if(!fb||!fb.auth||!fb.firestore){
 say('El archivo local funciona; no está disponible la conexión de Firebase.');
 if(login)login.disabled=true;
}else{
 login?.addEventListener('click',async()=>{try{await signInWithPopup(fb.auth,new GoogleAuthProvider())}
  catch(e){say('No fue posible iniciar sesión: '+(e?.code||'revisa la cuenta autorizada'))}});
 logout?.addEventListener('click',()=>signOut(fb.auth).catch(console.warn));
 publish?.addEventListener('click',publishAll);
 photoButton?.addEventListener('click',publishAllEvidence);
 window.addEventListener('dejavu:staff-saved',autoSave);
 window.addEventListener('dejavu:staff-deleted',autoDelete);
 window.addEventListener('dejavu:staff-imported',()=>{if(approved&&editor)publishAll()});
 onAuthStateChanged(fb.auth,async(u)=>{
   user=u;editor=false;window.DEJAVU_STAFF_PUBLIC_READY=false;
   photosApproved=localStorage.getItem(PHOTOS_OPT)==='yes';updateUi();
   if(!u){say('Tus fichas están guardadas aquí. Para publicar el archivo compartido, conecta tu cuenta Dejavú.');return}
   say('Validando acceso del coordinador…');
   try{
    editor=await isEditor(u);updateUi();
    if(!editor){say('Esta cuenta no tiene permiso para publicar fichas.');return}
    await reloadIds();
    approved=localStorage.getItem(OPT)==='yes';
    say(approved?'Archivo conectado. Los cambios nuevos se publican al guardar.':'Cuenta autorizada. Pulsa “Publicar mis fichas” una vez para compartir el archivo con el staff.');
    window.DEJAVU_STAFF_PUBLIC_READY=approved;
    if(approved)await publishAll();
    else if(photosApproved)await publishAllEvidence();
   }catch(e){say('No se pudo verificar la conexión: '+(e?.code||e?.message||'revisa Firebase'))}
 });
}
