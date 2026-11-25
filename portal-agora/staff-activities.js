/**
 * Actividades ilimitadas dentro de UNA jornada.
 * No abre otra jornada, no altera horas oficiales ni pagos.
 * El trabajador solo puede consultar/actualizar las propias.
 */
import {db,auth} from "./firebase.js";
import {
 collection,doc,query,where,getDocsFromServer,setDoc,
 updateDoc,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const statusLabel={pendiente:"Pendiente",en_curso:"En curso",terminada:"Terminada",no_realizada:"No realizada"};
const loading=new WeakMap();
export async function readStaffTasks(eventId,uid){
 const list=await getDocsFromServer(query(
  collection(db,"agora_ops_attendance_sheets",eventId,"activities"),
  where("uid","==",uid)
 ));
 return list.docs.map(d=>d.data()).sort((a,b)=>
   (a.createdAt?.toMillis?.()||0)-(b.createdAt?.toMillis?.()||0));
}
export async function renderStaffTasks({target,eventId,personId,uid}){
 if(!target?.isConnected||auth.currentUser?.uid!==uid)return;
 if(loading.get(target))return;
 loading.set(target,true);
 target.innerHTML='<p class="role-help">Consultando actividades de la jornada…</p>';
 let tasks=[];
 try{tasks=await readStaffTasks(eventId,uid)}
 catch(e){
  target.innerHTML='<p class="role-draft-warning">Las actividades se guardan cuando Coordinación habilita el pase de lista de esta jornada. '+esc(
   String(e?.code||"Comprueba tu asignación"))+'</p>';loading.delete(target);return;
 }
 if(auth.currentUser?.uid!==uid)return;
 const list=tasks.map(t=>
  '<div class="attendance-task"><div><strong>'+esc(t.name)+'</strong>'+
   '<small>'+esc(statusLabel[t.status]||t.status)+'</small></div>'+
   '<select data-task-status="'+esc(t.id)+'" aria-label="Estado de '+esc(t.name)+'">'+
    Object.entries(statusLabel).map(([key,value])=>
      '<option value="'+esc(key)+'"'+(t.status===key?" selected":"")+'>'+
      esc(value)+'</option>').join("")+'</select></div>').join("");
 target.innerHTML='<div class="attendance-task-list">'+
   (list||'<p class="role-help">Todavía no hay actividades nuevas registradas en esta jornada.</p>')+
   '</div><form data-task-add class="attendance-task-form">'+
   '<label>Agregar actividad a mi jornada'+
     '<input name="name" type="text" required maxlength="200" minlength="3" placeholder="Ej.: Revisar cotización o coordinar materiales">'+
   '</label><button type="submit" class="profile-button profile-button-outline">+ Agregar actividad</button>'+
   '</form><p class="role-help">Puedes agregar todas las actividades necesarias y cambiar su estado, sin crear otra jornada. Los cambios quedan registrados en Firebase.</p>';
 target.querySelector("[data-task-add]").addEventListener("submit",async e=>{
  e.preventDefault();
  if(auth.currentUser?.uid!==uid)return;
  const form=e.currentTarget;
  const text=String(new FormData(form).get("name")||"").trim();
  if(text.length<3||text.length>200)return;
  const id=crypto.randomUUID();
  const ref=doc(db,"agora_ops_attendance_sheets",eventId,"activities",id);
  try{
   await setDoc(ref,{
    id,eventId,personId,uid,name:text,status:"pendiente",
    createdBy:uid,createdAt:serverTimestamp(),
    updatedBy:uid,updatedAt:serverTimestamp()
   });
   await renderStaffTasksReload(target,{eventId,personId,uid});
  }catch(error){
   const p=target.querySelector(".role-help");
   if(p)p.textContent="No se pudo guardar: "+String(error?.code||error.message);
  }
 });
 target.querySelectorAll("[data-task-status]").forEach(select=>{
  select.addEventListener("change",async e=>{
   if(auth.currentUser?.uid!==uid)return;
   const id=e.currentTarget.dataset.taskStatus;
   try{
    await updateDoc(doc(db,"agora_ops_attendance_sheets",eventId,"activities",id),{
     status:e.currentTarget.value,updatedBy:uid,updatedAt:serverTimestamp()
    });
    await renderStaffTasksReload(target,{eventId,personId,uid});
   }catch(error){
    alert("No se pudo marcar la actividad: "+String(error?.code||error.message));
   }
  });
 });
 loading.delete(target);
}
async function renderStaffTasksReload(target,args){
 loading.delete(target);
 await renderStaffTasks({target,...args});
}
