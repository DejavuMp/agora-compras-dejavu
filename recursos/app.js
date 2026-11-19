// Arranque independiente de Firebase: el módulo local funciona incluso sin CDN.
// Los SDK se importan únicamente cuando la conexión Firebase está disponible.
let authSdk=null, dbSdk=null, firebaseSdkLoading=null;
async function ensureFirebaseSdk(){
 if(authSdk&&dbSdk)return true;
 if(!firebaseSdkLoading){
  firebaseSdkLoading=Promise.all([
   import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
   import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
  ]).then(([auth,db])=>{authSdk=auth;dbSdk=db;return true;}).catch(error=>{
   firebaseSdkLoading=null;
   console.warn('ÁGORA Recursos: Firebase no disponible, se conserva el modo local.',error);
   showToast('Firebase no respondió. Puedes continuar creando solicitudes en modo local.');
   return false;
  });
 }
 return firebaseSdkLoading;
}

const COLLECTION='agora_finance_requests';
const LOGO_URL=new URL('../archivos/dejavu-logo-oficial.png',import.meta.url).href;
const DB_NAME='AGORA_RECURSOS_LOCAL_V1';
const STATUS={pendiente:'Por autorizar',ajustes:'Solicita cambios',aprobada:'Aprobada',aprobada_parcial:'Aprobada parcial',pago_parcial:'Pago parcial',pagada:'Pagada',rechazada:'Rechazada'};
const CATEGORIES={materiales:'Compra de materiales e insumos',productos:'Productos para cliente o reventa',proveedor:'Pago o anticipo a proveedor',nomina:'Nómina, staff u honorarios',otro:'Otro pago operativo'};
const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(v)||0);
const round=v=>Math.round((Number(v)||0)*100)/100;
const iso=()=>new Date().toISOString();
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const dateOnly=v=>v?String(v).slice(0,10):'';
const asDate=v=>v?.toDate?.()?.toLocaleString('es-MX')||String(v||'');
const el=(tag,cls='',txt='')=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e;};
const state={view:'dashboard',records:[],selected:'',user:null,role:'',fb:null,cloud:false,loading:false,mode:'local',editingId:'',forceLocal:false};
let idbPromise;
function dbOpen(){
 if(idbPromise)return idbPromise;
 idbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB)return reject(new Error('Tu navegador no permite guardar datos locales.'));
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('requests'))req.result.createObjectStore('requests',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('No se pudo abrir IndexedDB.'));
 });
 return idbPromise;
}
async function dbAll(){
 const db=await dbOpen();
 return new Promise((resolve,reject)=>{const tx=db.transaction('requests','readonly'),req=tx.objectStore('requests').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});
}
async function dbPut(row){
 const db=await dbOpen();
 return new Promise((resolve,reject)=>{const tx=db.transaction('requests','readwrite');tx.objectStore('requests').put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
function showToast(message){const t=$('#toast');t.textContent=message;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.textContent='',4500);}
function banner(message='',kind=''){const e=$('#notice');e.textContent=message;e.className='notice '+kind;}
function readable(error){const m=String(error?.message||error||'');if(/permission|insufficient/i.test(m))return 'Firebase rechazó el acceso. Revisa el rol en agora_users y las reglas de Recursos y Finanzas antes de sincronizar.';return m;}
function sortRows(rows){return rows.sort((a,b)=>String(b.createdAt?.seconds||b.createdAt||'').localeCompare(String(a.createdAt?.seconds||a.createdAt||'')));}
async function loadRecords(){
 state.loading=true;
 try{
  if(state.cloud){
   const col=dbSdk.collection(state.fb.firestore,COLLECTION);
   const ref=state.role==='admin'?col:dbSdk.query(col,dbSdk.where('createdBy','==',state.user.uid));
   const snap=await dbSdk.getDocs(ref);
   state.records=sortRows(snap.docs.map(d=>({...d.data(),id:d.id})));
   state.mode='cloud';
   banner('Conectado a Firebase · Los datos financieros son visibles solo para cuentas autorizadas. Los enlaces de aprobación requieren iniciar sesión con un perfil administrador.','success');
  }else{
   state.records=sortRows(await dbAll());
   state.mode='local';
   banner('Modo local: los registros solo están en este navegador. Puedes generar PDF, PNG y respaldos, pero los enlaces no permiten aprobación remota. No elimines los datos del sitio.');
  }
 }catch(error){
  if(state.cloud){state.cloud=false;state.mode='local';state.records=sortRows(await dbAll().catch(()=>[]));banner('No se pudo consultar Firebase: '+readable(error)+' Se muestra la copia local independiente.','error');}
  else banner('No se pudo cargar la información local: '+readable(error),'error');
 }finally{state.loading=false;render();}
}
async function refreshCloudUser(user){
 state.user=user;state.role='';state.cloud=false;
 if(user&&!state.forceLocal){
  try{
   const staff=await dbSdk.getDoc(dbSdk.doc(state.fb.firestore,'agora_users',user.uid));
   const profile=staff.data();
   if(profile?.active===true&&['admin','coordinador','consulta'].includes(profile.role)){
    state.role=profile.role;state.cloud=true;
   }else{
    showToast('Tu cuenta no tiene un perfil activo en ÁGORA. Puedes trabajar localmente.');
   }
  }catch(error){showToast('Nube no disponible: '+readable(error));}
 }
 await loadRecords();
 if(location.search.includes('id='))openQueryDetail();
}
async function activateFirebase(){
 const fb=window.AGORA_FIREBASE;if(!fb?.initialized)return;
 const ready=await ensureFirebaseSdk();
 if(!ready)return; // Ningún error de Firebase debe bloquear la interfaz local.
 if(state.fb===fb)return;
 state.fb=fb;
 authSdk.onAuthStateChanged(fb.auth,user=>refreshCloudUser(user));
}
async function toggleLocalMode(){
 state.forceLocal=!state.forceLocal;
 if(state.forceLocal){
  state.cloud=false;
  await loadRecords();
  if(!state.editingId)view('new');
  showToast('Modo local activado. Ya puedes llenar y guardar una solicitud.');
 }else{
  if(state.fb&&authSdk&&dbSdk)await refreshCloudUser(state.fb.auth.currentUser);
  else if(window.AGORA_FIREBASE?.initialized)await activateFirebase();
  else {await loadRecords();showToast('Firebase no está disponible. Continúa en modo local.');}
 }
}
async function connect(){
 try{
  if(!state.fb){
   if(!window.AGORA_FIREBASE?.initialized){
    showToast('Firebase no está disponible. El formulario local continúa funcionando.');
    return;
   }
   await activateFirebase();
  }
  if(!state.fb || !await ensureFirebaseSdk())return;
  if(state.user){await authSdk.signOut(state.fb.auth);return;}
  await authSdk.signInWithPopup(state.fb.auth,new authSdk.GoogleAuthProvider());
 }catch(error){showToast('No se pudo conectar a Google: '+readable(error));}
}
function badge(s){return '<span class="chip '+esc(s)+'">'+esc(STATUS[s]||s)+'</span>';}
function view(name){
 state.view=name;
 $$('.view').forEach(e=>e.hidden=e.id!==name);
 $$('[data-view]').forEach(e=>e.classList.toggle('active',e.classList.contains('nav-item')&&e.dataset.view===name));
 $('#page-title').textContent={dashboard:'Resumen de recursos',new:'Nueva solicitud',history:'Solicitudes e historial',gastos:'Comprobación de gastos'}[name]||'Recursos y Finanzas';
 $('#sidebar').classList.remove('open');
 if(name==='new')$('#request-form').querySelector('[name="project"]').focus();
 render();
}
function emptyHtml(){return '<div class="empty"><div style="font-size:34px">▤</div><strong>No hay solicitudes para mostrar</strong><p>Crea una solicitud para controlar importes, autorizaciones y pagos desde un mismo expediente.</p><button class="btn btn-gold" data-view="new">+ Nueva solicitud</button></div>';}
function card(r){
 return '<div class="request-card"><div><div class="request-meta">'+esc(r.folio)+' · '+esc(asDate(r.createdAt).slice(0,19))+'</div><div class="request-title">'+esc(r.project||'Sin proyecto')+'</div><div class="request-sub">'+esc(CATEGORIES[r.category]||r.category)+' · '+esc(r.beneficiary||'Sin beneficiario')+'</div></div><div class="request-money"><strong>'+money(r.total)+'</strong>'+badge(r.status)+'</div><button class="btn btn-outline" data-open="'+esc(r.id)+'">Ver expediente</button></div>';
}
function render(){
 const rows=state.records;
 $('#stat-total').textContent=String(rows.length);
 $('#stat-pending').textContent=String(rows.filter(r=>['pendiente','ajustes'].includes(r.status)).length);
 $('#stat-amount').textContent=money(rows.reduce((a,r)=>a+Number(r.total||0),0));
 $('#stat-outstanding').textContent=money(rows.reduce((a,r)=>a+Math.max(0,Number(r.approvedAmount||0)-Number(r.paidAmount||0)),0));
 $('#recent-list').innerHTML=rows.length?rows.slice(0,6).map(card).join(''):emptyHtml();
 const q=$('#search').value.trim().toLowerCase(),s=$('#status-filter').value;
 const filtered=rows.filter(r=>(!s||r.status===s)&&(!q||[r.folio,r.project,r.client,r.beneficiary,r.category,r.requester].join(' ').toLowerCase().includes(q)));
 $('#all-list').innerHTML=filtered.length?filtered.map(card).join(''):emptyHtml();
 $('#mode-pill').textContent=state.cloud?'Nube · '+state.role:'Solo local';
 $('#mode-pill').style.background=state.cloud?'#e9f7ed':'#fcf7ec';
 $('#login-btn').textContent=state.user?'Salir de Google':'Conectar Google';
 $('#work-local-btn').textContent=state.forceLocal?'Reintentar nube':'Trabajar localmente';
 $('#submit-request').disabled=state.cloud&&state.role==='consulta';
}
function addLine(description='',quantity=1,unitPrice=''){
 const row=el('div','line-row');
 row.innerHTML='<input class="item-desc" maxlength="220" placeholder="Artículo, concepto o servicio" aria-label="Descripción" required value="'+esc(description)+'"><input class="item-qty" type="number" min="0.01" step="0.01" aria-label="Cantidad" required value="'+esc(quantity)+'"><input class="item-price" type="number" min="0" step="0.01" aria-label="Precio unitario" required placeholder="0.00" value="'+esc(unitPrice)+'"><div class="item-sum line-sum">$0.00</div><button class="delete-line" type="button" aria-label="Eliminar concepto">×</button>';
 $('#line-items').appendChild(row);calc();
}
function calc(){
 let total=0;
 $$('.line-row').forEach(row=>{
  const qty=Number($('.item-qty',row).value),price=Number($('.item-price',row).value);
  const amount=round(qty*price);$('.line-sum',row).textContent=money(amount);total+=amount;
 });
 $('#form-total').textContent=money(round(total));return round(total);
}
function validHttps(text){
 const urls=String(text||'').split(/\n/).map(v=>v.trim()).filter(Boolean);
 if(urls.length>12)throw Error('Se admiten como máximo 12 enlaces.');
 for(const u of urls){let parsed;try{parsed=new URL(u);}catch{}if(!parsed||parsed.protocol!=='https:')throw Error('Los documentos de soporte deben ser enlaces HTTPS válidos.');}
 return urls;
}
function getFormData(){
 const f=$('#request-form'),fd=new FormData(f);
 const items=$$('.line-row').map(row=>({description:$('.item-desc',row).value.trim(),quantity:Number($('.item-qty',row).value),unitPrice:round($('.item-price',row).value)}));
 if(!items.length||items.some(x=>!x.description||!(x.quantity>0)||x.unitPrice<0||!Number.isFinite(x.quantity)||!Number.isFinite(x.unitPrice)))throw Error('Revisa conceptos, cantidades y precios.');
 const total=round(items.reduce((a,x)=>a+round(x.quantity*x.unitPrice),0));
 if(total<=0)throw Error('El total de la solicitud debe ser mayor a $0.');
 if(items.length>50)throw Error('Máximo 50 conceptos por solicitud.');
 const category=String(fd.get('category')||'');
 const paymentMethod=String(fd.get('paymentMethod')||'');
 const account=String(fd.get('account')||'').trim().replace(/[\s-]/g,'');
 if(account&&!/^[0-9]{10,18}$/.test(account))throw Error('La cuenta debe contener solo 10 a 18 dígitos. Revisa CLABE o número de cuenta.');
 if(paymentMethod==='transferencia'&&!account)showToast('Aviso: no agregaste CLABE ni cuenta; puedes completarlo después en una nueva solicitud.');
 const id=crypto.randomUUID?.()||('r'+Date.now()+Math.random().toString(36).slice(2));
 const folio='RF-'+new Date().getFullYear()+'-'+Date.now().toString(36).slice(-6).toUpperCase();
 const date=iso(),creator=state.cloud?state.user.uid:'local';
 return {schema:1,id,folio,category,project:String(fd.get('project')||'').trim(),client:String(fd.get('client')||'').trim(),requester:String(fd.get('requester')||'').trim(),dateNeeded:String(fd.get('dateNeeded')||''),priority:String(fd.get('priority')||'normal'),reason:String(fd.get('reason')||'').trim(),paymentType:String(fd.get('paymentType')||'entrega'),paymentMethod,beneficiary:String(fd.get('beneficiary')||'').trim(),beneficiaryEmail:String(fd.get('beneficiaryEmail')||'').trim(),bank:String(fd.get('bank')||'').trim(),account,notes:String(fd.get('notes')||'').trim(),attachments:validHttps(fd.get('attachments')),items,total,status:'pendiente',approvedAmount:0,paidAmount:0,payments:[],decisionNote:'',decisionBy:'',history:[{kind:'solicitud',by:state.user?.email||'Operador local',at:date,note:'Solicitud creada'}],createdBy:creator,createdByEmail:state.user?.email||'',createdAt:state.cloud?dbSdk.serverTimestamp():date,updatedAt:state.cloud?dbSdk.serverTimestamp():date,updatedBy:creator};
}
async function saveRequest(e){
 e.preventDefault();
 if(state.cloud&&state.role==='consulta')return showToast('Tu perfil no puede crear solicitudes.');
 try{
  const row=getFormData();$('#submit-request').disabled=true;
  let savedId=row.id,folio=row.folio;
  if(state.editingId){
   const existing=state.records.find(x=>x.id===state.editingId);
   if(!existing||!canEditRequest(existing))throw Error('Esta solicitud ya no admite cambios o no es tuya.');
   savedId=existing.id;folio=existing.folio;
   const editableFields=['category','project','client','requester','dateNeeded','priority','reason','paymentType','paymentMethod','beneficiary','beneficiaryEmail','bank','account','notes','attachments','items','total'];
   const patch=Object.fromEntries(editableFields.map(key=>[key,row[key]]));
   patch.status='pendiente';
   patch.updatedBy=state.cloud?state.user.uid:'local';
   patch.updatedAt=state.cloud?dbSdk.serverTimestamp():iso();
   patch.history=[...(existing.history||[]),{kind:'revision',by:state.user?.email||'Operador local',at:iso(),note:'Solicitud corregida y reenviada a revisión'}].slice(-60);
   if(state.cloud)await dbSdk.updateDoc(dbSdk.doc(state.fb.firestore,COLLECTION,savedId),patch);
   else await dbPut({...existing,...patch});
  }else{
   if(state.cloud)await dbSdk.setDoc(dbSdk.doc(state.fb.firestore,COLLECTION,row.id),row);
   else await dbPut(row);
  }
  state.editingId='';$('#submit-request').textContent='Guardar solicitud →';
  $('#request-form').reset();$('#line-items').innerHTML='';addLine();
  await loadRecords();view('history');showToast('Solicitud '+folio+' guardada '+(state.cloud?'en Firebase.':'en este navegador.'));
  openDetail(savedId);
 }catch(err){showToast('No se guardó: '+readable(err));}
 finally{$('#submit-request').disabled=false;}
}
function canEditRequest(r){return ['pendiente','ajustes'].includes(r.status)&&(!state.cloud||(state.role!=='consulta'&&r.createdBy===state.user?.uid));}
function available(r){return ['aprobada','aprobada_parcial','pago_parcial'].includes(r.status)&&round(r.approvedAmount-r.paidAmount)>0;}
function canManage(){return !state.cloud||state.role==='admin';}
function visibleLink(r){if(!state.cloud||r.createdBy==='local')return '';const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('id',r.id);return u.href;}
// Enlace autocontenido de respuesta externa. Nunca exporta cuentas, CLABE ni notas bancarias.
// NO modifica automáticamente la solicitud, para evitar permisos públicos de escritura.
function approvalReplyLink(r){
 const data={v:1,folio:String(r.folio||'').slice(0,35),project:String(r.project||'').slice(0,130),
  client:String(r.client||'').slice(0,100),category:String(CATEGORIES[r.category]||r.category||'').slice(0,100),
  total:round(r.total),dateNeeded:String(r.dateNeeded||'').slice(0,10)};
 const bytes=new TextEncoder().encode(JSON.stringify(data));
 let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
 return new URL('./aprobar.html?d='+btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),location.href).href;
}
function emailSubject(r){return 'Solicitud de recursos '+r.folio+' · '+r.project;}
function emailBody(r){
 return 'Hola,\n\nSolicito la revisión de esta solicitud de Dejavú Marketing:\n\n'
  +'Folio: '+r.folio+'\nProyecto: '+r.project+'\nConcepto: '+(CATEGORIES[r.category]||r.category)
  +'\nImporte solicitado: '+money(r.total)+'\nFecha requerida: '+(r.dateNeeded||'Por definir')
  +'\n\nREVISAR Y RESPONDER SIN INICIAR SESIÓN:\n'+approvalReplyLink(r)
  +'\n\nLa respuesta se enviará por correo o WhatsApp. Administración la verificará y la registrará en Finanzas.'
  +'\nLos datos bancarios solo se muestran en el PDF/PNG que se adjunte de forma manual.\n\nGracias.';
}
function shareText(r){
 return 'DEJAVÚ MARKETING · SOLICITUD DE DINERO\nFolio: '+r.folio
 +'\nProyecto: '+r.project+'\nConcepto: '+(CATEGORIES[r.category]||r.category)
 +'\nImporte solicitado: '+money(r.total)
 +'\nFecha requerida: '+(r.dateNeeded||'Por definir')
 +'\n\nResponder sin iniciar sesión:\n'+approvalReplyLink(r)
 +'\nLa respuesta externa requiere validación y registro en Finanzas. Sin datos bancarios en este mensaje.';
}
async function copyText(value,label='Texto copiado'){
 try{await navigator.clipboard.writeText(value);}
 catch{
  const ta=el('textarea');ta.value=value;ta.style.position='fixed';ta.style.left='-999px';
  document.body.appendChild(ta);ta.select();
  const ok=document.execCommand('copy');ta.remove();
  if(!ok)throw Error('No se pudo copiar. Revisa permisos del navegador.');
 }
 showToast(label);
}
function openWhatsApp(r){window.open('https://wa.me/?text='+encodeURIComponent(shareText(r)),'_blank','noopener,noreferrer');}
function openEmail(r){window.location.href='mailto:?subject='+encodeURIComponent(emailSubject(r))+'&body='+encodeURIComponent(emailBody(r));}
function modalClose(){$('#modal').hidden=true;state.selected='';document.body.style.overflow='';}
function openQueryDetail(){
 const id=new URLSearchParams(location.search).get('id');
 if(!id)return;
 if(!state.cloud){banner('Este enlace requiere acceder a Firebase con una cuenta autorizada. No se puede autorizar un expediente desde el modo local.','error');return;}
 if(state.records.some(r=>r.id===id))openDetail(id);
 else banner('No tienes permiso para consultar este expediente o no existe.','error');
}
function openDetail(id){
 const r=state.records.find(r=>r.id===id);if(!r)return showToast('No se encontró la solicitud.');
 state.selected=id;
 $('#modal-title').textContent='Solicitud '+r.folio;
 $('#modal-body').innerHTML=detailHtml(r);
 $('#modal').hidden=false;document.body.style.overflow='hidden';
}
function detailHtml(r){
 const outstanding=Math.max(0,round(Number(r.approvedAmount||0)-Number(r.paidAmount||0)));
 const safeLinks=(r.attachments||[]).filter(u=>typeof u==='string'&&/^https:\/\//i.test(u));
 const links=safeLinks.length?'<div class="detail-card detail-full"><b>Documentos de soporte</b>'+safeLinks.map(u=>'<div><a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(u)+'</a></div>').join('')+'</div>':'';
 let result='<div class="detail-head"><div><small>'+esc(r.folio)+'</small><h3>'+esc(r.project)+'</h3><span>'+esc(CATEGORIES[r.category]||r.category)+'</span></div>'+badge(r.status)+'</div>';
 result+='<div class="action-bar">'+(canEditRequest(r)?'<button class="btn btn-outline" data-action="edit">✎ Editar solicitud</button>':'')+'<button class="btn btn-gold" data-action="pdf">↓ PDF</button><button class="btn btn-outline" data-action="png">↓ Imagen PNG</button><button class="btn btn-outline" data-action="print">⎙ Imprimir</button><button class="btn btn-outline" data-action="preview">Vista previa</button><button class="btn btn-outline" data-action="share">Copiar WhatsApp</button><button class="btn btn-outline" data-action="whatsapp">Abrir WhatsApp</button><button class="btn btn-outline" data-action="copy-email">Copiar texto correo</button><button class="btn btn-outline" data-action="email">Abrir correo</button><button class="btn btn-outline" data-action="approval-link">Copiar enlace para autorizar</button></div>';
 result+='<div class="detail-grid">'+[
 ['Solicitado',money(r.total)],['Autorizado',money(r.approvedAmount)],['Pagado',money(r.paidAmount)],['Por pagar',money(outstanding)],
 ['Solicitante',r.requester||'—'],['Beneficiario',r.beneficiary||'—'],['Fecha requerida',r.dateNeeded||'—'],['Modalidad',r.paymentType==='directo'?'Pago directo':'Entrega de recursos'],
 ['Cliente',r.client||'—'],['Forma de pago',r.paymentMethod||'—'],['Banco',r.bank||'—'],['Cuenta / CLABE',r.account||'No registrada']
 ].map(([k,v])=>'<div class="detail-card"><b>'+esc(k)+'</b><span>'+esc(v)+'</span></div>').join('')+
 '<div class="detail-card detail-full"><b>Justificación</b><span>'+esc(r.reason||'—')+'</span></div>'+
 '<div class="detail-card detail-full"><b>Conceptos</b><table class="detail-table"><thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio unit.</th><th>Subtotal</th></tr></thead><tbody>'+r.items.map(i=>'<tr><td>'+esc(i.description)+'</td><td>'+esc(i.quantity)+'</td><td>'+money(i.unitPrice)+'</td><td>'+money(i.quantity*i.unitPrice)+'</td></tr>').join('')+'</tbody></table></div>'+links+
 '<div class="detail-card detail-full"><b>Historial de movimientos</b>'+(r.history||[]).map(h=>'<div class="history-line">'+esc(asDate(h.at))+' · '+esc(h.by)+' · '+esc(h.note)+'</div>').join('')+'</div></div>';
 if(r.payments?.length)result+='<div class="decision"><h4>Pagos registrados</h4>'+r.payments.map(p=>'<p>'+esc(p.date)+' · '+money(p.amount)+' · '+esc(p.method)+' · Ref. '+esc(p.reference||'Sin referencia')+'</p>').join('')+'</div>';
 if(canManage()&&['pendiente','ajustes'].includes(r.status)){
  result+='<form id="decision-form" class="decision"><h4>Registrar decisión'+(!state.cloud?' (manual / local)':'')+'</h4><select name="decision"><option value="aprobada">Autorizar importe completo</option><option value="aprobada_parcial">Autorizar parcialmente</option><option value="ajustes">Solicitar cambios</option><option value="rechazada">Rechazar</option></select><input name="approved" type="number" step="0.01" min="0" max="'+esc(r.total)+'" placeholder="Monto autorizado para autorización parcial"><textarea name="comment" rows="2" maxlength="1000" placeholder="Comentarios / motivo de la decisión"></textarea><button class="btn btn-gold" type="submit">Registrar decisión</button><p>Las decisiones tomadas en modo local son registros manuales, no autorizaciones emitidas por terceros.</p></form>';
 }
 if(canManage()&&available(r)){
  result+='<form id="payment-form" class="decision"><h4>Registrar entrega o pago</h4><input name="amount" type="number" step=".01" min=".01" max="'+esc(outstanding)+'" placeholder="Importe entregado (máximo '+money(outstanding)+')" required><input name="date" type="date" required value="'+localDate()+'"><select name="method"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="otro">Otro</option></select><input name="reference" maxlength="120" placeholder="Referencia bancaria o comprobante"><button class="btn btn-gold" type="submit">Guardar pago</button></form>';
 }
 result+='<p class="small-note" style="margin-top:17px;font-size:11px;color:#837664">La persona destinataria puede responder desde el enlace sin entrar a ÁGORA. Por ahora la respuesta se envía mediante correo o WhatsApp; no cambia el estado del expediente automáticamente. Administración valida y registra la decisión. No incluyas archivos bancarios en grupos abiertos.</p>';
 return result;
}
async function updateRecord(r,patch,log){
 const now=iso(), actor=state.user?.email||'Operador local';
 const changes={...patch,updatedAt:state.cloud?dbSdk.serverTimestamp():now,updatedBy:state.cloud?state.user.uid:'local',history:[...(r.history||[]),{kind:'evento',by:actor,at:now,note:log}].slice(-60)};
 if(state.cloud){
  if(state.role!=='admin')throw Error('Solo administración puede registrar autorizaciones y pagos.');
  await dbSdk.updateDoc(dbSdk.doc(state.fb.firestore,COLLECTION,r.id),changes);
 }else{await dbPut({...r,...changes});}
 await loadRecords();openDetail(r.id);
}
async function decide(e){
 e.preventDefault();
 const r=state.records.find(x=>x.id===state.selected),f=new FormData(e.currentTarget);
 if(!r)return;
 try{
  const status=String(f.get('decision')),comment=String(f.get('comment')||'').trim();
  if(['ajustes','rechazada'].includes(status)&&comment.length<5)throw Error('Explica el motivo de cambios o rechazo (mínimo 5 caracteres).');
  const amount=status==='aprobada'?Number(r.total):status==='aprobada_parcial'?round(f.get('approved')):0;
  if(status==='aprobada_parcial'&&!(amount>0&&amount<Number(r.total)))throw Error('El monto parcial debe ser mayor a $0 y menor al total solicitado.');
  await updateRecord(r,{status,approvedAmount:amount,decisionBy:state.user?.email||'Registro manual',decisionNote:comment},'Decisión: '+(STATUS[status]||status)+' · '+money(amount)+(comment?' · '+comment:''));
  showToast('Decisión registrada '+(state.cloud?'en Firebase.':'solo localmente.'));
 }catch(error){showToast(readable(error));}
}
async function pay(e){
 e.preventDefault();
 const r=state.records.find(x=>x.id===state.selected),f=new FormData(e.currentTarget);
 if(!r)return;
 try{
  const amount=round(f.get('amount')),left=round(r.approvedAmount-r.paidAmount);
  if(!(amount>0&&amount<=left))throw Error('El pago debe ser mayor a cero y no exceder el saldo autorizado.');
  const payment={id:crypto.randomUUID?.()||String(Date.now()),amount,date:String(f.get('date')||localDate()),method:String(f.get('method')||''),reference:String(f.get('reference')||'').trim().slice(0,120)};
  const paidAmount=round(Number(r.paidAmount||0)+amount);
  const status=paidAmount>=r.approvedAmount?'pagada':'pago_parcial';
  await updateRecord(r,{payments:[...(r.payments||[]),payment],paidAmount,status},'Pago registrado: '+money(amount)+' · '+payment.method);
  showToast('Pago registrado correctamente.');
 }catch(error){showToast(readable(error));}
}
function htmlDoc(r){
 const link=approvalReplyLink(r);
 const code='<div class="doc-qr" id="document-qr"></div>';
 const list=r.items.map(i=>'<tr><td>'+esc(i.description)+'</td><td>'+esc(i.quantity)+'</td><td>'+money(i.unitPrice)+'</td><td>'+money(i.unitPrice*i.quantity)+'</td></tr>').join('');
 const payment=r.payments?.length?'<div class="doc-desc"><b>Pagos registrados:</b> '+r.payments.map(p=>esc(p.date)+' · '+money(p.amount)+' ('+esc(p.method)+')').join('; ')+'</div>':'';
 return '<article class="document-sheet" id="document-sheet"><div class="doc-brand"><div><img src="' + esc(LOGO_URL) + '" style="width:165px;height:65px;object-fit:contain;object-position:left center" alt="Dejavú Marketing"><br><em>MARKETING · ÁGORA</em></div><div style="text-align:right"><b>'+esc(r.folio)+'</b><br><span style="font-size:11px;color:#8b8174">'+esc(STATUS[r.status]||r.status)+'</span></div></div><h2>SOLICITUD DE RECURSOS Y PAGOS</h2><p class="doc-desc">'+esc(CATEGORIES[r.category]||r.category)+'</p><div class="doc-meta">'+[
 ['Proyecto / campaña',r.project],['Cliente',r.client||'—'],['Solicitante',r.requester],['Fecha requerida',r.dateNeeded],['Beneficiario',r.beneficiary],['Entrega / pago',r.paymentType==='directo'?'Pago directo':'Recursos al responsable'],['Forma de pago',r.paymentMethod],['Banco y cuenta',(r.bank||'—')+' · '+(r.account||'Sin registrar')]
 ].map(x=>'<div><span>'+esc(x[0])+'</span>'+esc(x[1]||'—')+'</div>').join('')+'</div><div class="doc-desc"><b>Justificación:</b> '+esc(r.reason)+'</div><table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio unit.</th><th>Subtotal</th></tr></thead><tbody>'+list+'</tbody></table><div class="doc-total">TOTAL SOLICITADO: '+money(r.total)+'</div><p class="doc-desc"><b>Autorizado:</b> '+money(r.approvedAmount)+' &nbsp; <b>Pagado:</b> '+money(r.paidAmount)+'</p><p class="doc-desc"><b>Observaciones:</b> '+esc(r.notes||'Sin observaciones')+'</p>'+payment+'<div class="doc-foot"><div><b>DEJAVÚ MARKETING</b><br>Expediente '+esc(r.folio)+'<br>Generado el '+new Date().toLocaleString('es-MX')+'<br>'+(link?'<span class="doc-url">'+esc(link)+'</span>':'<span>Documento generado desde registro local. Sin enlace remoto.</span>')+'<br><span>Respuesta externa por correo o WhatsApp. Administración valida y registra la decisión.</span></div>'+code+'</div></article>';
}
function docHost(r){
 const host=el('div','doc-print-host');host.innerHTML=htmlDoc(r);document.body.appendChild(host);
 const link=approvalReplyLink(r),target=$('#document-qr',host);
 if(link&&target&&window.QRCode){new window.QRCode(target,{text:link,width:96,height:96,colorDark:'#1b1a18',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});}
 return host;
}
function removeDoc(host){host?.remove();}
async function makeCanvas(host){
 if(!window.html2canvas)throw Error('No se cargó la biblioteca para generar imagen. Revisa la conexión a internet y vuelve a intentar.');
 await Promise.all(Array.from(host.querySelectorAll('img')).map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve;})));
 return await window.html2canvas($('.document-sheet',host),{scale:2,backgroundColor:'#fff',useCORS:false,logging:false,windowWidth:850});
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function downloadPNG(r){
 const host=docHost(r);
 try{const canvas=await makeCanvas(host);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo crear PNG.')),'image/png'));downloadBlob(blob,r.folio+'.png');}
 finally{removeDoc(host);}
}
async function downloadPDF(r){
 if(!window.jspdf?.jsPDF)throw Error('La biblioteca PDF aún no está disponible. Puedes usar Imprimir y elegir Guardar como PDF.');
 const host=docHost(r);
 try{
  const canvas=await makeCanvas(host),doc=new window.jspdf.jsPDF({orientation:'p',unit:'mm',format:'a4'}),w=194,h=canvas.height*w/canvas.width;
  const pageH=281;let top=8;
  doc.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',8,top,w,h);
  while(h+top>pageH){top-=pageH;doc.addPage();doc.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',8,top,w,h);}
  const link=approvalReplyLink(r);
  doc.setFontSize(8);doc.textWithLink('Responder sin iniciar sesión',12,289,{url:link});
  doc.save(r.folio+'.pdf');
 }finally{removeDoc(host);}
}
function printDoc(r){
 // El CSS general oculta documentos no marcados .print-view al imprimir.
 // Abrimos la ventana directamente desde el clic para evitar el bloqueo de popups.
 const pop=window.open('','_blank');
 if(!pop){showToast('El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir.');return;}
 pop.opener=null;
 const content=htmlDoc(r).replace('class="document-sheet"','class="document-sheet print-view"');
 const css='<style>body{background:#fff!important;margin:0!important}.document-sheet{margin:0 auto!important;border:0!important;min-height:0!important;width:190mm!important;padding:9mm!important;font-size:12px!important;box-shadow:none!important}.document-sheet img{max-width:100%!important}@page{size:A4;margin:8mm}@media print{body>article.document-sheet.print-view{display:block!important}body{background:#fff!important}}</style>';
 pop.document.open();
 pop.document.write('<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>'+esc(r.folio)+'</title><link rel="stylesheet" href="'+new URL('./style.css',location.href).href+'">'+css+'</head><body>'+content+'</body></html>');
 pop.document.close();
 let started=false;
 const go=async()=>{
  if(started)return;
  started=true;
  try{
   await Promise.all(Array.from(pop.document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));
   if(pop.document.fonts?.ready)await pop.document.fonts.ready;
  }catch{}
  if(pop.closed)return;
  pop.focus();pop.print();
 };
 pop.addEventListener('load',go,{once:true});
 // Si el evento load ya ocurrió, este respaldo también activa el diálogo.
 setTimeout(go,1000);
}
function previewDoc(r){
 const host=docHost(r);$('#modal-body').innerHTML='<div class="action-bar"><button class="btn btn-outline" data-action="back">← Volver al expediente</button><button class="btn btn-gold" data-action="pdf">↓ PDF</button><button class="btn btn-outline" data-action="png">↓ PNG</button></div><div class="doc-preview">'+host.innerHTML+'</div>';removeDoc(host);
}
function clearRequestForm(){
 state.editingId='';$('#submit-request').textContent='Guardar solicitud →';
 const form=$('#request-form');
 for(const e of form.querySelectorAll('input,textarea')){if(!e.closest('#line-items'))e.value='';}
 for(const e of form.querySelectorAll('select'))e.selectedIndex=0;
 form.elements.namedItem('dateNeeded').value=localDate();
 $('#line-items').innerHTML='';addLine();
}
function editRequest(r){
 if(!canEditRequest(r))return showToast('Solo el creador puede corregir una solicitud pendiente.');
 modalClose();view('new');
 state.editingId=r.id;
 const form=$('#request-form');
 const keys=['category','project','client','requester','dateNeeded','priority','reason','paymentType','paymentMethod','beneficiary','beneficiaryEmail','bank','account','notes'];
 for(const name of keys){const field=form.elements.namedItem(name);if(field)field.value=r[name]||'';}
 form.elements.namedItem('attachments').value=(r.attachments||[]).join('\n');
 $('#line-items').innerHTML='';for(const i of r.items||[])addLine(i.description,i.quantity,i.unitPrice);
 $('#submit-request').textContent='Guardar cambios →';
 $('#page-title').textContent='Editar '+r.folio;
}

async function shareReference(r){await copyText(shareText(r),'Mensaje de WhatsApp copiado.');}
async function copyEmail(r){await copyText('Asunto: '+emailSubject(r)+'\n\n'+emailBody(r),'Texto del correo copiado.');}
async function copyApprovalLink(r){await copyText(approvalReplyLink(r),'Enlace de revisión copiado.');}

async function exportBackup(){
 try{
  const data={format:'agora-recursos-local-v1',exportedAt:iso(),records:state.cloud?[]:await dbAll()};
  if(state.cloud){showToast('Los registros de Firebase no se exportan desde esta opción. Desconecta Google para respaldar los registros locales.');return;}
  downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'AGORA_RECURSOS_RESPALDO_'+localDate()+'.json');showToast('Respaldo local descargado.');
 }catch(error){showToast(readable(error));}
}
async function importBackup(file){
 if(state.cloud)return showToast('Desconecta Google antes de importar un respaldo local.');
 try{
  if(file.size>5e6)throw Error('El archivo es demasiado grande (máximo 5 MB).');
  const data=JSON.parse(await file.text());
  if(data.format!=='agora-recursos-local-v1'||!Array.isArray(data.records))throw Error('Este respaldo no tiene el formato de Recursos y Finanzas.');
  if(data.records.length>2000)throw Error('Demasiados registros para importar.');
  const existing=new Set((await dbAll()).map(r=>r.id));let added=0;
  for(const r of data.records){
   if(!r||typeof r.id!=='string'||!r.id||!Array.isArray(r.items)||typeof r.total!=='number'||typeof r.folio!=='string')continue;
   if(existing.has(r.id))continue;
   await dbPut(r);added++;existing.add(r.id);
  }
  await loadRecords();showToast('Importación terminada: '+added+' registros nuevos; no se reemplazaron existentes.');
 }catch(error){showToast('Importación cancelada: '+readable(error));}
}
async function loadExistingCatalog(){
 // Lectura voluntaria de la BD local de Compras existente en el mismo origen;
 // nunca se modifica, ni se copian expedientes financieros a otro sistema.
 if(typeof indexedDB.databases!=='function')return;
 try{
  const names=await indexedDB.databases();
  if(!names.some(x=>x.name==='AGORA_COMPRAS_LOCAL'))return;
  const data=await new Promise((resolve,reject)=>{
   const req=indexedDB.open('AGORA_COMPRAS_LOCAL',1);
   req.onsuccess=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains('app')){db.close();return resolve(null);}
    const tx=db.transaction('app','readonly'),q=tx.objectStore('app').get('data');
    q.onsuccess=()=>{const v=q.result;db.close();resolve(v);};
    q.onerror=()=>{db.close();reject(q.error);};
   };
   req.onerror=()=>reject(req.error);
  });
  if(!data)return;
  const projects=new Set();
  for(const name of ['rfqs','orders','samples'])for(const item of data[name]||[]){if(typeof item?.project==='string'&&item.project.trim())projects.add(item.project.trim());}
  const suppliers=new Set((data.suppliers||[]).map(x=>String(x.name||'').trim()).filter(Boolean));
  const add=(id,values)=>{
   const target=$(id);if(!target)return;
   for(const value of [...values].sort((a,b)=>a.localeCompare(b,'es')).slice(0,150)){
    const opt=document.createElement('option');opt.value=value;target.appendChild(opt);
   }
  };
  add('#agora-projects',projects);add('#agora-beneficiaries',suppliers);
 }catch(error){console.info('ÁGORA Recursos: el catálogo de Compras no está disponible en este navegador.');}
}

function setup(){
 $('#footer-date').textContent=new Date().getFullYear();
 $('#request-form').querySelector('[name="dateNeeded"]').value=localDate();
 addLine();
 $$('#line-items').length;
 document.addEventListener('click',async e=>{
  const v=e.target.closest('[data-view]');if(v){if(v.dataset.view==='new')clearRequestForm();view(v.dataset.view);return;}
  const target=e.target.closest('[data-open]');if(target){openDetail(target.dataset.open);return;}
  if(e.target.closest('#menu-toggle')){$('#sidebar').classList.toggle('open');return;}
  if(e.target.closest('#login-btn')){await connect();return;}
  if(e.target.closest('#work-local-btn')){await toggleLocalMode();return;}
  if(e.target.closest('#modal-close')||e.target.matches('[data-close]')){modalClose();return;}
  if(e.target.closest('#add-item')){addLine();return;}
  if(e.target.closest('.delete-line')){if($$('.line-row').length>1){e.target.closest('.line-row').remove();calc();}return;}
  if(e.target.closest('#backup-btn')){exportBackup();return;}
  if(e.target.closest('#import-btn')){$('#import-file').click();return;}
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(!action)return;
  const r=state.records.find(x=>x.id===state.selected);if(!r)return;
  try{
   if(action==='edit')editRequest(r);
   if(action==='pdf')await downloadPDF(r);
   if(action==='png')await downloadPNG(r);
   if(action==='print')printDoc(r);
   if(action==='share')await shareReference(r);
    if(action==='whatsapp')openWhatsApp(r);
    if(action==='copy-email')await copyEmail(r);
    if(action==='email')openEmail(r);
    if(action==='approval-link')await copyApprovalLink(r);
   if(action==='preview')previewDoc(r);
   if(action==='back')openDetail(r.id);
  }catch(error){showToast(readable(error));}
 });
 $('#request-form').addEventListener('submit',saveRequest);
 $('#request-form').addEventListener('reset',()=>setTimeout(()=>{state.editingId='';$('#submit-request').textContent='Guardar solicitud →';$('#line-items').innerHTML='';addLine();$('#request-form').querySelector('[name="dateNeeded"]').value=localDate();},0));
 $('#line-items').addEventListener('input',calc);
 $('#search').addEventListener('input',render);
 $('#status-filter').addEventListener('change',render);
 $('#import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(file)await importBackup(file);e.target.value='';});
 $('#modal-body').addEventListener('submit',e=>{
  if(e.target.id==='decision-form')decide(e);
  if(e.target.id==='payment-form')pay(e);
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)modalClose();});
 // Los botones y formularios se activan primero; Firebase es opcional.
 loadRecords();
 loadExistingCatalog();
 if(window.AGORA_FIREBASE)activateFirebase();
 else window.addEventListener('agora:firebase-ready',activateFirebase,{once:true});
 // Mensaje explícito cuando falla la inicialización externa.
 window.addEventListener('agora:firebase-error',()=>{
  showToast('No se pudo conectar Firebase. Tus formularios locales siguen disponibles.');
 });
}
setup();
