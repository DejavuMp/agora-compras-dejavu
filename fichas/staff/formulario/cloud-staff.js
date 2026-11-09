/* Dejavú Marketing · historial de fichas asignadas al usuario autenticado.
   Firestore rules protegen los documentos; ningún resultado se publica en GitHub. */
import "../../../firebase-init.js";
import {GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {collection,query,where,getDocs} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const fb=window.AGORA_FIREBASE;
const $=id=>document.getElementById(id);
const status=$('staffCloudStatus'),login=$('staffCloudLogin'),logout=$('staffCloudLogout'),refresh=$('staffCloudRefresh'),list=$('staffCloudList');
let user=null,loading=false;
function say(t){if(status)status.textContent=t}
function safeData(x){return {
 campaign:String(x.campaign||'').slice(0,95),responsible:String(x.responsible||'').slice(0,95),
 activityDate:String(x.activityDate||'').slice(0,10),location:String(x.location||'').slice(0,240),
 id:String(x.id||'').slice(0,70)
}}
function create(tag,text,className){
 let n=document.createElement(tag);
 if(text!=null)n.textContent=text;
 if(className)n.className=className;
 return n;
}
async function load(){
 if(!fb||!user?.emailVerified)return;
 if(loading)return;
 loading=true;
 if(refresh)refresh.disabled=true;
 say('Consultando tus fichas asignadas…');
 try{
  const normalized=user.email.trim().toLowerCase();
  // La consulta contiene un filtro idéntico al permitido por las reglas de Firestore.
  const snap=await getDocs(query(collection(fb.firestore,'dejavu_staff_fichas'),where('staffEmail','==',normalized)));
  const rows=snap.docs.map(s=>safeData({...s.data(),id:s.id})).filter(x=>x.campaign&&x.activityDate)
   .sort((a,b)=>b.activityDate.localeCompare(a.activityDate));
  list.replaceChildren();
  if(!rows.length){
   list.append(create('p','Todavía no tienes fichas asignadas en la nube. Pide a tu coordinador que vincule tu correo a la ficha.','small'));
  }else{
   for(const r of rows){
    const entry=create('article',null,'history-item');
    const body=create('div');
    body.append(create('h3',r.campaign),create('p',r.activityDate+' · '+r.location));
    const actions=create('div',null,'history-actions'),open=create('button','Ver ficha','btn');
    open.type='button';
    open.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('dejavu:staff-cloud-open',{detail:{record:r}})));
    actions.append(open);entry.append(body,actions);list.append(entry);
   }
  }
  say(rows.length+' '+(rows.length===1?'ficha asignada':'fichas asignadas')+' a '+normalized);
 }catch(e){
  console.warn('Historial de Dejavú:',e);
  say(e?.code==='permission-denied'?'Faltan habilitar permisos de acceso a las fichas en Firebase.':'No se pudo consultar la nube. Tu historial local sigue disponible.');
 }finally{loading=false;if(refresh)refresh.disabled=false}
}
if(!fb||!fb.auth||!fb.firestore){
 say('Conexión de nube no disponible; historial local activo.');
 if(login)login.disabled=true;
}else{
 if(login)login.addEventListener('click',async()=>{
  try{await signInWithPopup(fb.auth,new GoogleAuthProvider())}
  catch(e){say('Inicio de sesión no disponible: '+(e?.code||'error de acceso'))}
 });
 if(logout)logout.addEventListener('click',()=>signOut(fb.auth).catch(console.warn));
 if(refresh)refresh.addEventListener('click',load);
 onAuthStateChanged(fb.auth,async(u)=>{
  user=u;
  if(login)login.hidden=!!u;if(logout)logout.hidden=!u;if(refresh)refresh.hidden=!u;
  if(!u){say('Inicia sesión con el correo que compartiste a Dejavú para consultar tus actividades de otros dispositivos.');list.replaceChildren();return}
  if(!u.emailVerified){say('Verifica el correo de tu cuenta para consultar tus fichas.');return}
  await load();
 });
}
