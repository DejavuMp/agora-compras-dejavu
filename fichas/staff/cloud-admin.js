/* Dejavú Marketing · Fichas de Staff · sincronización protegida por reglas Firestore.
   La conexión y cualquier fallo nunca eliminan ni sustituyen el respaldo local.
   Requiere reglas específicas desplegadas en Firebase; el repositorio GitHub por sí solo no las activa. */
import "../../firebase-init.js";
import {GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {collection,doc,getDoc,getDocs,query,orderBy,limit,runTransaction,serverTimestamp,deleteDoc} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const fb=window.AGORA_FIREBASE;
const COL='dejavu_staff_fichas';
const ready=!!(fb&&fb.auth&&fb.firestore);
const $=id=>document.getElementById(id);
const login=$('dejavuCloudLogin'),logout=$('dejavuCloudLogout'),status=$('dejavuCloudStatus'),sync=$('dejavuCloudSync');
let user=null,canWrite=false,busy=false,initializing=false;
function message(s){if(status)status.textContent=s;}
function valid(r){return r&&typeof r.id==='string'&&/^DJV-\d{8}-\d{3,}$/.test(r.id)&&
['campaign','responsible','activityDate','location'].every(k=>typeof r[k]==='string'&&r[k].trim())}
function normalized(r){
 return {
  id:r.id,
  campaign:String(r.campaign||'').slice(0,95),
  responsible:String(r.responsible||'').slice(0,95),
  activityDate:String(r.activityDate||'').slice(0,10),
  location:String(r.location||'').slice(0,240),
  staffEmail:String(r.staffEmail||'').trim().toLowerCase().slice(0,240),
  localUpdatedAt:String(r.updatedAt||new Date().toISOString()),
  active:true
 };
}
function cloudToLocal(docSnap){const d=docSnap.data();return {id:docSnap.id,campaign:d.campaign||'',responsible:d.responsible||'',activityDate:d.activityDate||'',location:d.location||'',staffEmail:d.staffEmail||'',createdAt:d.createdAt?.toDate?.().toISOString?.()||new Date().toISOString(),updatedAt:d.localUpdatedAt||new Date().toISOString(),cloudRevision:d.revision||1,cloudSyncedAt:d.updatedAt?.toDate?.().toISOString?.()||'',hasEvidence:false,evidenceName:''}}
async function ensureEditor(u){
 if(!u||!u.emailVerified)return false;
 const profile=await getDoc(doc(fb.firestore,'agora_users',u.uid));
 return profile.exists()&&profile.data().active===true&&['admin','coordinador'].includes(profile.data().role);
}
async function writeRecord(record,forceCreateOnly=false){
 if(!canWrite||!user||!valid(record))return;
 const data=normalized(record),ref=doc(fb.firestore,COL,data.id);
 const result=await runTransaction(fb.firestore,async(tx)=>{
  const prev=await tx.get(ref);
  if(prev.exists()){
   if(forceCreateOnly)return {revision:Number(prev.data().revision||1),unchanged:true};
   if(Number(record.cloudRevision||0)!==Number(prev.data().revision||0))throw Error('Esta ficha tiene una versión más reciente en la nube. Actualiza el archivo antes de guardar.');
   const revision=Number(prev.data().revision||1)+1;
   tx.update(ref,{...data,updatedBy:user.uid,updatedAt:serverTimestamp(),revision});
   return {revision};
  }
  tx.set(ref,{...data,createdBy:user.uid,createdAt:serverTimestamp(),updatedBy:user.uid,updatedAt:serverTimestamp(),revision:1});
  return {revision:1};
 });
 if(!result.unchanged)window.DEJAVU_STAFF_BRIDGE?.setRevision?.(data.id,result.revision);
 return result;
}
async function refresh(){
 if(!canWrite||busy)return;
 busy=true;
 try{
  message('Consultando fichas de Dejavú…');
  const snap=await getDocs(query(collection(fb.firestore,COL),orderBy('updatedAt','desc'),limit(650)));
  const cloud=snap.docs.map(cloudToLocal).filter(valid);
  window.DEJAVU_STAFF_BRIDGE?.merge?.(cloud);
  const cloudMap=new Map(snap.docs.map(x=>[x.id,x.data()]));
  let imported=0,unassigned=0,failed=0,updated=0;
  for(const r of (window.DEJAVU_STAFF_BRIDGE?.list?.()||[])){
   if(!valid(r))continue;
   const remote=cloudMap.get(r.id);
   if(!remote){
    try{await writeRecord(r,true);imported++;if(!r.staffEmail)unassigned++}
    catch(err){failed++;console.warn('Dejavú: ficha no sincronizada',r.id,err)}
   }else if(String(r.updatedAt||'')>String(remote.localUpdatedAt||'')&&
     Number(r.cloudRevision||0)===Number(remote.revision||0)){
    try{await writeRecord(r);updated++}
    catch(err){failed++;console.warn('Dejavú: actualización pendiente',r.id,err)}
   }
  }
  message(failed?'Archivo local conservado · '+failed+' ficha(s) pendientes de sincronizar.':('Nube conectada · '+snap.size+' fichas · '+imported+' nuevas · '+updated+' actualizadas'+(unassigned?' · '+unassigned+' sin correo asignado':'')));
 }catch(error){message('Sin sincronización de nube: '+(error?.code==='permission-denied'?'faltan activar permisos de Firebase':'no se pudo consultar Firebase')+'. Tus fichas locales están a salvo.');console.warn(error)}
 finally{busy=false}
}
async function onRecord(ev){
 if(!canWrite||!user)return;
 const r=ev.detail?.record;if(!valid(r))return;
 try{message('Guardando ficha en la nube…');await writeRecord(r);message('Ficha guardada en la nube y en este navegador.')}
 catch(e){message('Ficha local guardada; nube pendiente: '+(e.message||'sin conexión'));console.warn(e)}
}
async function onDelete(ev){
 if(!canWrite||!user||!ev.detail?.id)return;
 try{await deleteDoc(doc(fb.firestore,COL,ev.detail.id));message('Ficha retirada del archivo de la nube.')}
 catch(e){message('Ficha eliminada localmente; no se pudo retirar de la nube.');console.warn(e)}
}
if(!ready){message('Firebase aún no está disponible. Las fichas quedan guardadas localmente.');if(login)login.disabled=true;}
else {
 if(login)login.addEventListener('click',async()=>{
  try{await signInWithPopup(fb.auth,new GoogleAuthProvider())}
  catch(e){message('No fue posible iniciar sesión: '+(e?.code||'revisa la configuración de Firebase'))}
 });
 if(logout)logout.addEventListener('click',()=>signOut(fb.auth).catch(console.warn));
 if(sync)sync.addEventListener('click',refresh);
 window.addEventListener('dejavu:staff-saved',onRecord);
 window.addEventListener('dejavu:staff-deleted',onDelete);
 onAuthStateChanged(fb.auth,async(u)=>{
  user=u;canWrite=false;const id=u?.uid;
  if(login)login.hidden=!!u;if(logout)logout.hidden=!u;if(sync)sync.hidden=!u;
  if(!u){message('Solo en este dispositivo. Inicia sesión con tu cuenta autorizada para sincronizar.');return;}
  message('Verificando acceso de Dejavú…');
  try{
   canWrite=await ensureEditor(u);
   if(user?.uid!==id)return;
   if(!canWrite){message('Esta cuenta no tiene permiso de edición en Dejavú. Las fichas siguen locales.');if(sync)sync.disabled=true;return;}
   if(sync)sync.disabled=false;
   await refresh();
  }catch(e){message('No se pudo validar la cuenta de Dejavú. Guardado local disponible.');console.warn(e)}
 });
}
