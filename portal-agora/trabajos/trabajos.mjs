import {auth,db} from "../firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {collection,doc,getDoc,getDocFromServer,getDocs,getDocsFromServer,query,where,addDoc,updateDoc,runTransaction,serverTimestamp,setDoc,writeBatch} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {ownJornadas} from "../roles-operacion.mjs";
function ownHistory(staff){
 const active=ownJornadas(staff,new Date(),100),seen=new Set(active.map(j=>j.key));
 for(const event of staff?.events||[]){
  if(seen.has(event.id)||!event.staff?.some(p=>p.personId===staff.personId))continue;
  const start=new Date(event.start).getTime();if(!Number.isFinite(start))continue;
  active.push({key:String(event.id),title:event.title||event.project||"Trabajo",project:event.project||"",site:event.venueName||"Por confirmar",start});
 }
 return active.sort((a,b)=>b.start-a.start).slice(0,100);
}
const $=id=>document.getElementById(id),safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const note=text=>$("status").textContent=text;
let user,member,staff,links=[],states=[],payments=[],feedback=[],manager=false,admin=false,editingLink="";
const date=t=>t?.toDate?.()?.toLocaleString("es-MX")||"";
async function load(){
 if(!user)return;
 const [m,s,u]=await Promise.all([getDoc(doc(db,"agora_ops_members",user.uid)),getDoc(doc(db,"agora_ops_staff",user.uid)),getDoc(doc(db,"agora_users",user.uid))]);
 member=m.data();staff=s.data();admin=u.data()?.active===true&&u.data()?.role==="admin";
 manager=admin||u.data()?.active===true&&u.data()?.role==="coordinador";
 $("manager").hidden=!manager;$("admin").hidden=!admin;
 const [l,t,p,f]=await Promise.all([getDocs(query(collection(db,"agora_work_forms"))),manager?getDocs(collection(db,"agora_work_form_states")):getDocs(query(collection(db,"agora_work_form_states"),where("ownerUid","==",user.uid))),manager?Promise.resolve(null):getDocs(query(collection(db,"agora_staff_payment_views"),where("ownerUid","==",user.uid))),admin?getDocs(collection(db,"agora_staff_payment_feedback")):Promise.resolve(null)]);
 links=l.docs.map(d=>({id:d.id,...d.data()}));states=t.docs.map(d=>({id:d.id,...d.data()}));payments=p?.docs.map(d=>({id:d.id,...d.data()}))||[];feedback=f?.docs.map(d=>({id:d.id,...d.data()}))||[];
 render();note("Información actualizada.");
 void loadReceipts(user);
}

const responses={recibido:"Pago recibido",no_identificado:"No identifico el depósito",diferencia:"El importe es diferente",aclaracion:"Solicito una aclaración"};
const receiptMoney=cents=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(cents/100);
let receiptRows=new Map();
async function loadReceipts(actor){
 const node=$("registered-receipts");
 if(actor!==user||member?.active!==true||!member.personId)return;
 try{
  const snap=await getDocsFromServer(query(collection(db,"agora_registered_receipts"),where("ownerUid","==",actor.uid)));
  if(actor!==user)return;
  const rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.personId===member.personId);
  const entries=await Promise.all(rows.sort((a,b)=>b.date.localeCompare(a.date)).map(async row=>{
   const response=await getDocFromServer(doc(db,"agora_registered_receipts",row.id,"responses",actor.uid));
   return [row.id,{...row,answer:response.data()}];
  }));
  if(actor!==user)return;
  receiptRows=new Map(entries);
  node.innerHTML=receiptRows.size?[...receiptRows.values()].map(row=>'<article><h3>'+safe(row.folio)+'</h3>'+
   '<p>'+safe(row.project)+' · '+safe(row.date)+' · <strong>'+safe(receiptMoney(row.amountCents))+'</strong></p>'+
   '<p>'+safe({transferencia:"Transferencia",efectivo:"Efectivo",otro:"Otro"}[row.method]||"Pago")+
   (row.reference?' · Referencia '+safe(row.reference):'')+'</p>'+
   (row.answer?'<p>Respuesta registrada: '+safe(responses[row.answer.response])+' · '+safe(date(row.answer.createdAt))+'</p>':
    '<form data-receipt="'+safe(row.id)+'"><label>Selecciona tu respuesta<select name="response" required><option value="">Elegir respuesta</option>'+
    Object.entries(responses).map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join("")+
    '</select></label><label>Comentario<textarea name="note" maxlength="500"></textarea></label><button>Registrar respuesta</button></form>')+
   '</article>').join(""):"<p>Aún no tienes comprobantes compartidos por Administración.</p>";
 }catch(error){if(actor===user)node.textContent="No se pudo consultar tus comprobantes.";}
}
async function respondToReceipt(form){
 const actor=user, id=form.dataset.receipt, row=receiptRows.get(id);
 if(!actor||!row||row.answer)return;
 const fields=new FormData(form),response=String(fields.get("response")),comment=String(fields.get("note")).trim();
 const button=form.querySelector("button");
 if(button.disabled)return;
 if(!Object.hasOwn(responses,response))throw Error("Selecciona una respuesta.");
 if(["diferencia","aclaracion"].includes(response)&&comment.length<5)throw Error("Describe la diferencia o aclaración.");
 button.disabled=true;
 try{
  const ref=doc(db,"agora_registered_receipts",id,"responses",actor.uid);
  await runTransaction(db,async tx=>{
   const prior=await tx.get(ref);
   if(actor!==user)throw Error("La sesión cambió.");
   if(prior.exists())return;
   tx.set(ref,{ownerUid:actor.uid,folio:row.folio,amountCents:row.amountCents,response,note:comment,
    verification:"identidad_dejavu",createdAt:serverTimestamp()});
  });
  if(actor===user){note("Respuesta registrada.");await loadReceipts(actor);}
 }finally{button.disabled=false;}
}

function matching(link,job){
 const match={event:job.key,person:staff?.personId,project:job.project||job.title,group:job.group};
 return link.active&&String(match[link.scope]||"").toLowerCase()===String(link.scopeId).toLowerCase();
}
function renderJobs(){
 const jobs=staff?ownHistory(staff):[];
 $("jobs").innerHTML=jobs.length?jobs.map(job=>{
 const forms=links.filter(link=>matching(link,job));
 return '<article><h3>'+safe(job.title)+'</h3><p>'+safe(new Date(job.start).toLocaleString("es-MX"))+' · '+safe(job.site||"Sede por confirmar")+'</p>'+
 (forms.length?forms.map(link=>{
 const previous=states.find(s=>s.ownerUid===user.uid&&s.eventId===job.key&&s.linkId===link.id);
 return '<div><a href="'+safe(link.url)+'" target="_blank" rel="noopener noreferrer">'+safe(link.label)+'</a>'+
 '<small>'+safe(link.instructions||"")+(link.due?" · Fecha límite "+safe(link.due):"")+(link.required?" · Obligatorio":"")+'</small>'+
 '<small>Versión actual '+link.version+' · '+(previous?'Mi estado: '+safe(previous.state)+' · Enlace usado: versión '+previous.linkVersion:"Pendiente de enviar")+'</small>'+
 '<form data-state data-event="'+safe(job.key)+'" data-link="'+safe(link.id)+'"><label>Estado<select name="state"><option value="pendiente">Pendiente de enviar</option><option value="enviado">Enviado</option><option value="correccion">Requiere corrección</option><option value="problema">Tengo un problema</option></select></label><label>Observaciones opcionales<textarea name="note" maxlength="500"></textarea></label><label>Evidencia opcional, imagen<input name="evidence" type="file" accept="image/jpeg,image/png,image/webp"></label><button>Actualizar estado</button></form></div>';
 }).join(""):"<p>Esta jornada no tiene un formulario activo asignado.</p>")+'</article>';
 }).join(""):"<p>No hay jornadas vinculadas a tu cuenta. Coordinación puede revisar la vinculación de tu ficha.</p>";
}
function renderPayments(){
 $("payments").innerHTML=payments.length?payments.map(p=>'<article><h3>'+safe(p.project||"Trabajo")+'</h3><p>'+safe(p.date||"")+" · "+safe(p.concept||"")+'</p><p>Autorizado: '+safe(p.approvedAmount)+' MXN · Pagado: '+safe(p.paidAmount)+' MXN</p><p>'+ (p.reconciliation?"Saldo por conciliar":'Saldo pendiente: '+safe(p.balance)+' MXN')+' · '+safe(p.status||"Pendiente")+'</p><small>Último pago: '+safe(p.lastPaidAt||"Sin fecha")+'</small>'+
 '<a href="../escanear/?jornada='+encodeURIComponent(p.eventId)+'">Consultar recibo de horas</a>'+
 '<form data-payment="'+safe(p.id)+'"><label>Mi respuesta<select name="response"><option value="recibido">Pago recibido</option><option value="no_recibido">Pago no recibido</option><option value="incorrecto">Importe incorrecto</option><option value="aclaracion">Solicitar aclaración</option></select></label><label>Comentario opcional<textarea name="note" maxlength="500"></textarea></label><button>Registrar respuesta</button></form></article>').join(""):"<p>Aún no hay obligaciones vinculadas a tu ficha en la vista individual. Administración puede actualizarla desde este espacio.</p>";
}
function renderManager(){
 if(!manager)return;
 $("links").innerHTML=links.map(l=>'<article><strong>'+safe(l.label)+'</strong><p>'+safe(l.scope)+' · '+safe(l.scopeId)+' · versión '+l.version+' · '+(l.active?"Activo":"Inactivo")+'</p><button data-edit="'+safe(l.id)+'">Sustituir enlace</button> <button data-toggle="'+safe(l.id)+'">'+(l.active?"Desactivar":"Activar")+'</button></article>').join("");
 $("tracking").innerHTML=(admin?feedback.filter(x=>x.status==="pendiente").map(x=>'<article><strong>Aclaración de pago</strong><p>Referencia: '+safe(x.paymentId)+' · Cuenta: '+safe(x.ownerUid)+' · '+safe(x.response)+' · '+safe(x.note||"") +'</p></article>').join(""):"")+states.filter(s=>["enviado","problema","correccion"].includes(s.state)).slice(0,60).map(s=>'<article><strong>'+safe(s.eventId)+'</strong><p>'+safe(s.state)+' · '+safe(s.ownerUid)+' · '+safe(s.note||"")+'</p><button data-correction="'+safe(s.id)+'">Solicitar corrección</button></article>').join("")||"<p>Sin avisos que requieran atención.</p>";
}
function render(){renderJobs();renderPayments();renderManager()}
async function imageData(file){
 if(!file)return "";
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5e6)throw Error("Usa una imagen JPG, PNG o WEBP de hasta 5 MB.");
 const bmp=await createImageBitmap(file),canvas=document.createElement("canvas");
 const scale=Math.min(1,800/Math.max(bmp.width,bmp.height));canvas.width=Math.round(bmp.width*scale);canvas.height=Math.round(bmp.height*scale);
 canvas.getContext("2d").drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();
 const result=canvas.toDataURL("image/jpeg",.55);
 if(result.length>100000)throw Error("La imagen sigue siendo demasiado grande.");
 return result;
}
document.addEventListener("submit",async e=>{
 if(e.target.matches("form[data-receipt]")){e.preventDefault();try{await respondToReceipt(e.target)}catch(error){note(error.message)}return;}
 const form=e.target; if(!form.matches("#link-form,[data-state],[data-payment]"))return;e.preventDefault();
 const button=form.querySelector("button");button.disabled=true;
 try{
 const data=new FormData(form);
 if(form.id==="link-form"){
  if(!manager)throw Error("Acceso restringido.");
  const url=new URL(String(data.get("url")));if(url.protocol!=="https:")throw Error("Usa un enlace HTTPS.");
  const update={label:String(data.get("label")).trim(),url:url.href,instructions:String(data.get("instructions")).trim(),scope:data.get("scope"),scopeId:String(data.get("scopeId")).trim(),due:String(data.get("due")),required:data.has("required"),active:true,version:1,history:[{by:user.uid,at:new Date().toISOString(),action:"creado"}],updatedAt:serverTimestamp()};
  if(editingLink){const ref=doc(db,"agora_work_forms",editingLink);await runTransaction(db,async tx=>{const current=await tx.get(ref),old=current.data();tx.update(ref,{...update,active:old.active,version:old.version+1,history:[...old.history,{by:user.uid,at:new Date().toISOString(),action:"sustituido",previousUrl:old.url}]})});editingLink="";}else await addDoc(collection(db,"agora_work_forms"),update);
  form.reset();
 }else if(form.dataset.state){
  if(!member?.active||member.role!=="staff"||!staff)throw Error("Falta vincular tu ficha de Operaciones.");
  const link=links.find(l=>l.id===form.dataset.link),job=ownHistory(staff).find(j=>j.key===form.dataset.event);
  if(!job||!link||!matching(link,job))throw Error("Formulario no asignado.");
  const image=await imageData(data.get("evidence")?.size?data.get("evidence"):null);
  const state=String(data.get("state")),observation=String(data.get("note")).trim(),id=user.uid+"_"+job.key+"_"+link.id;
  const ref=doc(db,"agora_work_form_states",id);
  await runTransaction(db,async tx=>{
   const current=await tx.get(ref),entry={at:new Date().toISOString(),by:user.uid,state,observation,linkVersion:link.version,url:link.url};
   if(current.exists())tx.update(ref,{state,note:observation,evidence:image,linkVersion:link.version,linkUrl:link.url,verified:false,history:[...(current.data().history||[]),entry],updatedAt:serverTimestamp()});
   else tx.set(ref,{ownerUid:user.uid,personId:staff.personId,eventId:job.key,linkId:link.id,state,note:observation,evidence:image,linkVersion:link.version,linkUrl:link.url,verified:false,history:[entry],updatedAt:serverTimestamp()});
  });
 }else{
  const id=form.dataset.payment,p=payments.find(x=>x.id===id);if(!p)throw Error("Pago fuera de tu ficha.");
  await addDoc(collection(db,"agora_staff_payment_feedback"),{ownerUid:user.uid,paymentId:id,response:String(data.get("response")),note:String(data.get("note")).trim(),createdAt:serverTimestamp(),status:"pendiente"});
 }
 await load();
 }catch(error){note(error.message)}finally{button.disabled=false}
});
document.addEventListener("click",async e=>{
 const edit=e.target.closest("[data-edit]"),toggle=e.target.closest("[data-toggle]"),correction=e.target.closest("[data-correction]");
 try{
 if(edit&&manager){const l=links.find(x=>x.id===edit.dataset.edit);if(l){editingLink=l.id;const f=$("link-form");for(const key of ["label","url","instructions","scope","scopeId","due"])f.elements[key].value=l[key]||"";f.elements.required.checked=l.required;f.scrollIntoView({behavior:"smooth"});note("Editando la versión "+l.version+". Los envíos anteriores conservarán su enlace.");}}
 if(toggle&&manager){
  const ref=doc(db,"agora_work_forms",toggle.dataset.toggle);
  await runTransaction(db,async tx=>{const s=await tx.get(ref),d=s.data();tx.update(ref,{active:!d.active,version:d.version+1,history:[...d.history,{by:user.uid,at:new Date().toISOString(),action:d.active?"desactivado":"activado"}],updatedAt:serverTimestamp()})});
  await load();
 }
 if(correction&&manager){const ref=doc(db,"agora_work_form_states",correction.dataset.correction);
  await runTransaction(db,async tx=>{const s=await tx.get(ref),d=s.data();tx.update(ref,{state:"correccion",note:"Coordinación solicita corrección",verified:false,history:[...d.history,{at:new Date().toISOString(),by:user.uid,state:"correccion",observation:"Coordinación solicita corrección",linkVersion:d.linkVersion,url:d.linkUrl}],updatedAt:serverTimestamp()})});await load()}
 }catch(error){note(error.message)}
});
$("sync-payments").addEventListener("click",async()=>{
 if(!admin)return; const button=$("sync-payments");button.disabled=true;
 try{
 const [requests,members]=await Promise.all([getDocs(collection(db,"agora_finance_requests")),getDocs(collection(db,"agora_ops_members"))]);
 const byPerson=new Map(members.docs.filter(d=>d.data().active&&d.data().role==="staff").map(d=>[d.data().personId,d.id]));
 let count=0;
 for(const snap of requests.docs){
  const r=snap.data(),origin=r.hoursOrigin,ownerUid=origin&&byPerson.get(origin.personId);
  if(!ownerUid||r.category!=="nomina")continue;
  const approved=Number(r.approvedAmount)||0,paid=Number(r.paidAmount)||0;
  await setDoc(doc(db,"agora_staff_payment_views",snap.id),{ownerUid,personId:origin.personId,eventId:origin.eventId,project:r.project,concept:r.reason,date:r.dateNeeded,approvedAmount:approved,paidAmount:paid,balance:Math.max(0,approved-paid),status:r.status,lastPaidAt:r.payments?.at(-1)?.date||"",reconciliation:true,sourceRevision:r.updatedAt,updatedAt:serverTimestamp()});
  count++;
 }
 note(count+" obligaciones vinculadas actualizadas. Revisa saldos en Finanzas antes de considerarlos definitivos.");
 await load();
 }catch(error){note(error.message)}finally{button.disabled=false}
});
onAuthStateChanged(auth,async current=>{user=current;receiptRows.clear();$("registered-receipts").replaceChildren();if(!user){note("Inicia sesión en ÁGORA para consultar tu información.");return}try{await load()}catch(error){note("No se pudo consultar la información: "+error.message)}});
