import * as fbApi from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import * as fire from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
(function providerRuntime(fbApi,fire){
  const config={apiKey:"AIzaSyDPh-AFdST9Ax_Eoho-wT0shlWlCHad6Zg",authDomain:"agora-dejavu-38b8c.firebaseapp.com",projectId:"agora-dejavu-38b8c",storageBucket:"agora-dejavu-38b8c.firebasestorage.app",messagingSenderId:"775680965171",appId:"1:775680965171:web:274557c8c9c25ff304c146"};
  const app=fbApi.getApps().length?fbApi.getApps()[0]:fbApi.initializeApp(config);
  const firestore=fire.getFirestore(app);
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get("t")||"",view=params.get("view")==="cotizar"?"cotizar":"acuse";
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let data=null,working=false;
  const setBusy=message=>{$("busy").textContent=message||"";};
  const docRef=()=>fire.doc(firestore,"provider_invites",token);
  const itemLabel=x=>esc(x.name||x.product||"Producto");
  function field(name,label,value="",type="text"){
    return '<div class="field"><label>'+esc(label)+'</label><input name="'+esc(name)+'" type="'+type+'" value="'+esc(value)+'" '+(type==="number"?'min="0" step="any"':"")+'></div>';
  }
  function imageMarkup(src){
    if(typeof src!=="string"||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src))return"";
    return '<img alt="Imagen de producto" src="'+src+'">';
  }
  function header(){
    const p=data.request;
    $("header-title").textContent=p.folio+" · "+(p.title||"Solicitud");
    const labels={quote:"Solicitud de cotización",order:"Pedido de compra",sample:"Solicitud de muestras"};
    $("subtitle").textContent=(labels[p.kind]||"Solicitud")+
      " · Proveedor: "+(p.supplier?.name||"")+" · Válido hasta "+data.expiresAt.toDate().toLocaleDateString("es-MX");
  }
  function referenceInfo(ref){if(!ref)return '';const drive=String(ref.driveUrl||'');let main='';try{const u=new URL(drive);if(u.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(u.hostname))main=u.href}catch{}const notes=String(ref.instructions||'');const images=Array.isArray(ref.sampleImages)?ref.sampleImages:[],links=Array.isArray(ref.driveImages)?ref.driveImages:[];if(!main&&!notes&&!images.length&&!links.length)return '';const gallery=images.slice(0,6).map(img=>imageMarkup(img.data)).join('');const driveImgs=links.slice(0,12).map((url,i)=>{let href='',src='';try{const u=new URL(url);if(u.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(u.hostname))return '';href=u.href;const id=u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');if(id&&/^[\w-]{8,}$/.test(id))src='https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w320'}catch{return ''}return '<div class="item"><div class="itemhead">'+(src?'<img loading="lazy" src="'+esc(src)+'" alt="Imagen de Drive">':'')+'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">Ver imagen de Drive '+(i+1)+'</a></div></div>'}).join('');return '<div class="card"><h2>Material de referencia para las muestras</h2>'+(main?'<p><b>Carpeta o archivo de Drive:</b> <a href="'+esc(main)+'" target="_blank" rel="noopener noreferrer">Abrir en Google Drive</a></p>':'')+(notes?'<p><b>Indicaciones:</b></p><p style="white-space:pre-line">'+esc(notes)+'</p>':'')+(gallery?'<h3>Fotografías de muestra</h3><div class="itemhead">'+gallery+'</div>':'')+(driveImgs?'<h3>Imágenes del Drive</h3>'+driveImgs:'')+'<p class="muted">Para visualizar imágenes alojadas en Drive debes contar con permiso de acceso a esos archivos.</p></div>'}

  function requestInfo(){
    const p=data.request;
    return '<div class="card"><h2>Información de la solicitud</h2><div class="grid">'+
      '<p><b>Proyecto</b><br>'+esc(p.project||"—")+'</p>'+
      '<p><b>Fecha requerida</b><br>'+esc(p.dueDate||"Por definir")+'</p>'+
      '</div><p><b>Instrucciones</b><br>'+esc(p.instructions||"Sin observaciones")+'</p>'+
      '<h2>Conceptos solicitados</h2>'+
      p.items.map((x,i)=>'<div class="item"><div class="itemhead">'+imageMarkup(x.image)+
        '<div><strong>'+(i+1)+'. '+itemLabel(x)+'</strong><p class="muted">'+esc(x.description||"")+'</p>'+
        (x.qty?'<p>Cantidad: '+esc(x.qty)+'</p>':"")+'</div></div></div>').join("")+
      '</div>'+referenceInfo(p.kind==='sample'?p.references:null);
  }
  function ackSection(){
    if(data.status!=="pendiente")return "";
    const p=data.request;
    return '<div class="card" id="ackform"><h2>Confirmación de recibido</h2>'+
      '<p>Confirma que recibiste esta solicitud en nombre de tu empresa. La confirmación se guardará inmediatamente en Ágora.</p>'+
      field("receiver","Nombre de quien recibe",p.supplier?.contact||"")+
      '<div class="actions"><button class="primary" id="ackButton">Confirmar de recibido</button></div></div>';
  }
  function quoteForm(){
    if(data.status!=="recibida")return "";
    const p=data.request;
    const quote=p.kind==="quote",sample=p.kind==="sample";
    const items=p.items.map((x,i)=>{
      const fields=quote?[
        field("minRetail","Cantidad mínima de menudeo","","number"),
        field("retailCost","Precio unitario menudeo","","number"),
        field("minWholesale","Cantidad mínima de mayoreo","","number"),
        field("wholesaleCost","Precio unitario mayoreo","","number"),
        field("sampleCost","Costo de muestra","","number")
      ].join(""):sample?[
        field("confirmedQty","Cantidad de muestras que prepararás",x.qty||1,"number"),
        field("sampleCost","Costo unitario confirmado (MXN)",x.unitCost||0,"number")
      ].join(""):"";
      return '<div class="item" data-product="'+esc(x.id)+'"><strong>'+(i+1)+'. '+itemLabel(x)+'</strong>'+
        '<div class="itemhead">'+imageMarkup(x.image)+'<p class="muted">'+esc(x.description||"")+'</p></div>'+(sample?'<p><b>Cantidad solicitada:</b> '+esc(x.qty||1)+' · <b>Costo previamente cotizado:</b> $'+esc(x.unitCost||0)+' MXN</p>':'')+'<div class="grid">'+fields+
        '<div class="field"><label>Disponibilidad / plazo</label><input name="availability" placeholder="Disponible / 5 días / A consultar"></div></div>'+
        '<div class="field"><label>Comentarios del producto</label><textarea name="comment" placeholder="Notas del proveedor"></textarea></div></div>';
    }).join("");
    return '<form class="card" id="quoteform"><h2>'+(quote?"Llenar cotización":sample?"Responder solicitud de muestras":"Confirmar pedido")+'</h2>'+
      '<p>Tu respuesta se guardará directamente en la solicitud de Dejavú Marketing. No tienes que enviar archivos.</p>'+
      '<div class="grid">'+field("company","Empresa / razón social",p.supplier?.name||"")+
      field("email","Correo de contacto",p.supplier?.email||"","email")+'</div>'+
      '<h2>Productos y condiciones</h2>'+items+
      '<div class="grid">'+field("deliveryDays",sample?"Días de entrega":"Plazo general de entrega")+
      (sample?field("productionDays","Días de preparación"):field("paymentTerms","Condiciones de pago"))+'</div>'+
      (sample?'<div class="grid">'+field("deliveryDate","Fecha estimada de entrega","","date")+
        field("deliveryMethod","Entrega (sucursal / domicilio / paquetería)")+
        field("deliveryPlace","Lugar o sucursal de entrega")+
        field("tracking","Paquetería y número de guía (si aplica)")+'</div>':'')+
      '<div class="field"><label>Comentarios generales</label><textarea name="notes"></textarea></div>'+
      '<div class="actions"><button type="submit" class="primary">Enviar respuesta a ÁGORA</button></div></form>';
  }
  function receiptText(){
    const p=data.request||{},response=data.response||{};
    const lines=[
      'CONSTANCIA DIGITAL · ÁGORA / DEJAVÚ MARKETING',
      'Solicitud: '+(p.folio||''),
      'Proveedor: '+(response.company||p.supplier?.name||''),
      'Recibido por: '+(data.receiver||'Proveedor'),
      'Fecha de recepción: '+(data.receivedAt?.toDate?.().toLocaleString('es-MX')||''),
      'Estado: '+(data.status==='cotizada'?'Respuesta registrada en ÁGORA':'Acuse de recibido confirmado')
    ];
    if(data.status==='cotizada'){
      lines.push('Fecha de respuesta: '+(data.submittedAt?.toDate?.().toLocaleString('es-MX')||''));
      for(const item of response.items||[]){
        const found=p.items.find(x=>String(x.id)===String(item.id))||{};
        lines.push('',(found.name||found.product||'Producto')+':');
        for(const [name,label] of [['retailCost','Precio menudeo'],['minRetail','Mínimo menudeo'],['wholesaleCost','Precio mayoreo'],['minWholesale','Mínimo mayoreo'],['sampleCost','Costo muestra'],['availability','Disponibilidad'],['comment','Comentarios']]){
          if(item[name]!==undefined&&String(item[name]).trim())lines.push('  '+label+': '+String(item[name]));
        }
      }
      const general=response.general||{};
      if(general.deliveryDays)lines.push('Plazo: '+general.deliveryDays);
      if(general.paymentTerms)lines.push('Condiciones de pago: '+general.paymentTerms);
      if(general.notes)lines.push('Comentarios generales: '+general.notes);
    }
    lines.push('','Esta constancia corresponde a la solicitud registrada en ÁGORA de Dejavú Marketing.');
    return lines.join('\n');
  }
  function receiptCard(){
    if(!['recibida','cotizada'].includes(data.status))return '';
    const heading=data.status==='cotizada'?'Copia de tu cotización':'Copia del acuse de recibido';
    return '<div class="card"><h2>✓ '+heading+'</h2>'+
      '<p>Tu información ya quedó registrada. Puedes consultar esta constancia aquí y preparar una copia para tu correo.</p>'+
      '<div class="actions"><button type="button" id="receiptEmail">Preparar copia por correo</button><button type="button" id="receiptCopy">Copiar constancia</button></div>'+
      '<p class="muted" style="font-size:12px">El correo se abrirá listo para enviar. Revisa y presiona Enviar: todavía no se manda automáticamente.</p></div>';
  }
  function openReceiptEmail(){
    const p=data.request||{},recipient=data.response?.email||p.supplier?.email||'';
    const subject='ÁGORA · '+(data.status==='cotizada'?'Copia de cotización':'Acuse de recibido')+' · '+(p.folio||'');
    const link='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(recipient)+
      '&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(receiptText());
    window.open(link,'_blank','noopener,noreferrer');
    setBusy('Se abrió Gmail con la copia preparada. Recuerda pulsar Enviar para que llegue al correo.');
  }
  async function copyReceipt(){
    try{await navigator.clipboard.writeText(receiptText());setBusy('Constancia copiada para pegarla donde necesites.');}
    catch(error){setBusy('No se pudo copiar: '+error.message);}
  }
  function render(){
    if(!data)return;
    header();
    let html=requestInfo();
    html+=receiptCard();
    if(data.status==="pendiente")html+=ackSection();
    else if(data.status==="recibida"){
      html+='<div class="card notice"><b>✓ Recepción confirmada</b> por '+esc(data.receiver)+'. Ahora completa tu respuesta.</div>';
      html+=quoteForm();
    }else if(data.status==="cotizada")html+='<div class="card"><h2>✓ Respuesta enviada</h2><p>ÁGORA registró tu confirmación y respuesta. Ya no necesitas enviar documentos por correo.</p></div>';
    else html+='<div class="card notice">Esta invitación fue cerrada o cancelada.</div>';
    $("content").innerHTML=html;
    $("ackButton")?.addEventListener("click",acknowledge);
    $("quoteform")?.addEventListener("submit",submit);
    $("receiptEmail")?.addEventListener("click",openReceiptEmail);
    $("receiptCopy")?.addEventListener("click",copyReceipt);
    setBusy("");
    if(view==="cotizar"&&data.status==="pendiente")$("ackform")?.scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function reread(){
    const snap=await fire.getDoc(docRef());
    if(!snap.exists())throw Error("No se encontró esta solicitud. Solicita un enlace nuevo.");
    data=snap.data();
    if(data.expiresAt?.toDate?.()<new Date())throw Error("El enlace caducó. Solicita uno nuevo a Dejavú Marketing.");
    render();
  }
  async function acknowledge(){
    if(working||data.status!=="pendiente")return;
    const input=document.querySelector('#ackform [name="receiver"]');
    const receiver=input.value.trim();
    if(receiver.length<2)return setBusy("Escribe el nombre de quien recibe.");
    if(receiver.length>120)return setBusy("El nombre es demasiado largo.");
    working=true;$("ackButton").disabled=true;setBusy("Registrando confirmación en Firebase…");
    try{
      await fire.updateDoc(docRef(),{receivedAt:fire.serverTimestamp(),receiver,status:"recibida",updatedAt:fire.serverTimestamp()});
      await reread();
      $("quoteform")?.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(error){setBusy("No se pudo confirmar: "+error.message);}
    finally{working=false;}
  }
  async function submit(event){
    event.preventDefault();if(working||data.status!=="recibida")return;
    const form=event.currentTarget;
    const company=form.querySelector('[name="company"]').value.trim();
    const email=form.querySelector('[name="email"]').value.trim();
    if(!company||!email||!email.includes("@"))return setBusy("Completa tu empresa y un correo válido.");
    const items=[...form.querySelectorAll("[data-product]")].map(el=>{
      const obj={id:el.dataset.product};
      for(const input of el.querySelectorAll("[name]"))obj[input.name]=input.value.trim().slice(0,2000);
      return obj;
    });
    if(items.length>60)return setBusy("La solicitud tiene demasiados productos.");
    const val=name=>form.querySelector('[name="'+name+'"]')?.value.trim().slice(0,200)||'';
    const general={deliveryDays:val('deliveryDays'),paymentTerms:val('paymentTerms'),
      productionDays:val('productionDays'),deliveryDate:val('deliveryDate'),
      deliveryMethod:val('deliveryMethod'),deliveryPlace:val('deliveryPlace'),
      tracking:val('tracking'),notes:form.querySelector('[name="notes"]').value.trim().slice(0,2000)};
    const response={company:company.slice(0,160),email:email.slice(0,240),general,items};
    const size=new Blob([JSON.stringify(response)]).size;
    if(size>180000)return setBusy("Tu respuesta es demasiado extensa. Acorta los comentarios.");
    if(!confirm("¿Enviar tu respuesta a ÁGORA? Después de enviarla ya no podrás modificarla desde este enlace."))return;
    working=true;const button=form.querySelector('[type="submit"]');button.disabled=true;setBusy("Guardando respuesta en Firebase…");
    try{
      await fire.updateDoc(docRef(),{response,submittedAt:fire.serverTimestamp(),status:"cotizada",updatedAt:fire.serverTimestamp()});
      await reread();window.scrollTo({top:0,behavior:"smooth"});
    }catch(error){setBusy("No se pudo guardar la respuesta: "+error.message);button.disabled=false;}
    finally{working=false;}
  }
  async function start(){
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)){setBusy("Falta un enlace válido de Ágora. Solicita uno nuevo a Dejavú Marketing.");return;}
    try{await reread();}catch(error){$("content").innerHTML='<div class="card notice"><b>No se pudo abrir el formulario.</b><p>'+esc(error.message)+'</p></div>';setBusy("");}
  }
  start();
})(fbApi,fire);
