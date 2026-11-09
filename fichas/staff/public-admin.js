/* Dejavú Marketing · publicación automática de fichas aprobadas.
   Las fichas originales continúan locales; en la nube solo van campaña,
   responsable, fecha y ubicación. No se publican correos ni evidencias.
   Requiere activar las reglas de seguridad Firebase desde consola autorizada. */
import "../../firebase-init.js";
import {GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {getDoc,doc,collection,getDocs,setDoc,deleteDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const fb=window.AGORA_FIREBASE,$=id=>document.getElementById(id);
const COL='dejavu_staff_publicadas';
const OPT='dejavu.staff.publication.approved.v1';
const login=$('publicLogin'),logout=$('publicLogout'),publish=$('publicAll'),status=$('publicStatus'),count=$('publicCount');
let user=null,editor=false,busy=false,approved=false,published=new Set();
function say(t){if(status)status.textContent=t;}
function items(){return window.DEJAVU_STAFF_BRIDGE?.list?.()||[];}
function valid(r){return r&&/^DJV-[0-9]{8}-[0-9]{3,}$/.test(String(r.id||''))&&
 ['campaign','responsible','activityDate','location'].every(k=>typeof r[k]==='string'&&r[k].trim().length>0);}
function snapshot(r){return {id:r.id,campaign:r.campaign.slice(0,95),responsible:r.responsible.slice(0,95),
 activityDate:r.activityDate.slice(0,10),location:r.location.slice(0,240)};}
function updateUi(){
 if(login)login.hidden=!!user;
 if(logout)logout.hidden=!user;
 if(publish)publish.disabled=busy||!editor;
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
 }catch(e){say('No se pudo publicar: '+(e?.code||e?.message||'sin conexión'))}
 finally{busy=false;updateUi();}
}
async function autoSave(ev){
 const r=ev.detail?.record;
 if(!approved||!editor||!valid(r))return;
 try{await publishOne(r);window.DEJAVU_STAFF_PUBLIC_READY=true;say('Ficha actualizada para todo el staff.')}
 catch(e){window.DEJAVU_STAFF_PUBLIC_READY=false;say('Ficha guardada localmente. Publicación pendiente: '+(e?.code||e?.message||'sin conexión'))}
}
async function autoDelete(ev){
 const id=ev.detail?.id;
 if(!approved||!editor||!id||!published.has(id))return;
 try{await deleteDoc(doc(fb.firestore,COL,id));published.delete(id);updateUi();say('Ficha eliminada del catálogo compartido.')}
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
 window.addEventListener('dejavu:staff-saved',autoSave);
 window.addEventListener('dejavu:staff-deleted',autoDelete);
 window.addEventListener('dejavu:staff-imported',()=>{if(approved&&editor)publishAll()});
 onAuthStateChanged(fb.auth,async(u)=>{
   user=u;editor=false;window.DEJAVU_STAFF_PUBLIC_READY=false;updateUi();
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
   }catch(e){say('No se pudo verificar la conexión: '+(e?.code||e?.message||'revisa Firebase'))}
 });
}
