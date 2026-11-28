// Generador local: no escribe en Firebase ni representa un pago bancario.
export function mountPaymentReceipt(host){
  if(!host)return;
  const money=n=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(n);
  const cents=v=>{const s=String(v).trim();if(!/^\d{1,8}(\.\d{1,2})?$/.test(s))return NaN;const [a,b=""]=s.split(".");return Number(a)*100+Number(b.padEnd(2,"0"));};
  const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day;};
  const folio=()=> "DVM-PAG-"+new Date().getFullYear()+"-"+crypto.randomUUID().slice(0,12).toUpperCase();
  host.innerHTML=`<details class="role-module" id="payment-receipt"><summary><strong>Comprobantes de pago · DEJAVÚ</strong></summary>
  <p>Genera una notificación de un pago ya realizado. No ejecuta transferencias ni guarda información en el servidor.</p>
  <form id="payment-receipt-form" style="display:grid;gap:12px">
  <label>Folio <input name="folio" required maxlength="45"></label>
  <label>Tipo de beneficiario <select name="type"><option>Staff</option><option>Proveedor</option></select></label>
  <label>Nombre del beneficiario <input name="beneficiary" required maxlength="100"></label>
  <label>Fecha de pago <input name="date" type="date" required></label>
  <label>Proyecto / servicio <input name="project" maxlength="110"></label>
  <label>Periodo pagado <input name="period" placeholder="Ej. 23 al 29 de noviembre" maxlength="90"></label>
  <label>Forma de pago <select name="method"><option>Transferencia</option><option>Efectivo</option><option>Otro</option></select></label>
  <label>Referencia (opcional) <input name="reference" maxlength="80"></label>
  <fieldset><legend>Conceptos pagados (MXN)</legend><div id="receipt-lines"></div><button type="button" id="receipt-add" class="profile-button profile-button-outline">+ Concepto</button></fieldset>
  <label>Observaciones <textarea name="notes" maxlength="220" rows="2"></textarea></label>
  <label><input type="checkbox" name="verified" required> Verifiqué que el pago fue realizado y que los datos son correctos.</label>
  <button class="profile-button profile-button-primary" type="submit">Generar comprobante</button></form>
  <p id="receipt-status" role="status" aria-live="polite"></p>
  <div id="receipt-output" hidden><canvas id="receipt-canvas" style="display:block;width:100%;height:auto;max-width:620px;background:white;margin:12px auto;border:1px solid #ddd" aria-label="Vista previa del comprobante"></canvas>
  <div style="display:flex;flex-wrap:wrap;gap:8px">
  <button type="button" id="receipt-png" class="profile-button profile-button-outline">Descargar PNG</button>
  <button type="button" id="receipt-pdf" class="profile-button profile-button-outline">Imprimir / guardar PDF</button>
  <button type="button" id="receipt-copy" class="profile-button profile-button-outline">Copiar mensaje</button>
  <button type="button" id="receipt-wa" class="profile-button profile-button-outline">WhatsApp</button>
  <button type="button" id="receipt-mail" class="profile-button profile-button-outline">Correo</button>
  </div><p>Adjunta manualmente el PDF o PNG al mensaje. Solicita la confirmación por respuesta con el folio. El acuse no se registra automáticamente.</p></div></details>`;
  const $=id=>host.querySelector("#"+id),form=$("payment-receipt-form"),rows=$("receipt-lines"),out=$("receipt-output"),status=$("receipt-status"),canvas=$("receipt-canvas");
  let receipt=null;
  form.elements.folio.value=folio();form.elements.date.value=today();
  function invalidate(){receipt=null;out.hidden=true;status.textContent="";};
  function add(){
    if(rows.children.length>=10){status.textContent="Máximo de 10 conceptos por comprobante.";return;}
    const row=document.createElement("div");row.style.cssText="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto;gap:6px;margin:8px 0;align-items:end";
    row.innerHTML='<label>Concepto<input class="receipt-concept" required maxlength="90" placeholder="Jornada / servicio"></label><label>Importe<input class="receipt-amount" required inputmode="decimal" placeholder="0.00" pattern="[0-9]{1,8}([.][0-9]{1,2})?"></label><button type="button" aria-label="Quitar concepto" class="profile-button profile-button-outline">×</button>';
    row.querySelector("button").addEventListener("click",()=>{if(rows.children.length>1){row.remove();invalidate();}});
    rows.append(row);invalidate();
  }
  add();$("receipt-add").addEventListener("click",add);form.addEventListener("input",invalidate);form.addEventListener("change",invalidate);
  function wrap(ctx,value,max){
    const result=[];let line="";
    for(const word of String(value).split(/\s+/)){let candidate=line?line+" "+word:word;if(ctx.measureText(candidate).width<=max){line=candidate;continue;}
      if(line){result.push(line);line="";}
      for(const char of word){if(ctx.measureText(line+char).width>max&&line){result.push(line);line="";}line+=char;}
    }if(line)result.push(line);return result.length?result:[""];
  }
  function draw(d){
    canvas.width=1240;const ctx=canvas.getContext("2d");const operations=[];let y=360;
    function section(label,value){if(!value)return;ctx.font="bold 25px Arial";operations.push({text:label,x:70,y,font:ctx.font,color:"#555"});y+=42;ctx.font="32px Arial";for(const t of wrap(ctx,value,1100)){operations.push({text:t,x:70,y,font:ctx.font,color:"#171717"});y+=40;}y+=22;}
    section("BENEFICIARIO · "+d.type.toUpperCase(),d.beneficiary);section("FECHA DE PAGO",d.date);section("PROYECTO / SERVICIO",d.project);section("PERIODO PAGADO",d.period);section("FORMA DE PAGO",d.method);section("REFERENCIA",d.reference);
    operations.push({text:"DESGLOSE DEL PAGO",x:70,y,font:"bold 28px Arial",color:"#171717"});y+=50;
    for(const item of d.items){ctx.font="29px Arial";const lines=wrap(ctx,item.concept,740);for(let i=0;i<lines.length;i++){operations.push({text:lines[i],x:70,y,font:ctx.font,color:"#171717"});if(i===0)operations.push({text:money(item.amount/100),x:1170,y,font:"bold 28px Arial",color:"#171717",align:"right"});y+=38;}y+=17;}
    section("OBSERVACIONES",d.notes);
    section("ACUSE DE RECIBIDO","Pendiente de confirmación. Responde al mensaje indicando si recibiste el importe y cita el folio.");
    canvas.height=y+120;ctx.fillStyle="#fff";ctx.fillRect(0,0,1240,canvas.height);ctx.fillStyle="#141414";ctx.fillRect(0,0,1240,176);
    const write=(t,x,y,font,color,align="left")=>{ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);};
    write("DEJAVÚ",70,78,"bold 58px Arial","#fff");write("MARKETING  /  ADMINISTRACIÓN",70,128,"24px Arial","#fff");
    write("COMPROBANTE DE PAGO",70,225,"bold 34px Arial","#171717");write(d.folio,70,267,"26px Arial","#555");
    write(money(d.total/100)+" MXN",1170,325,"bold 52px Arial","#171717","right");
    for(const o of operations)write(o.text,o.x,o.y,o.font,o.color,o.align);
    ctx.fillStyle="#141414";ctx.fillRect(0,canvas.height-76,1240,76);write("DEJAVÚ MARKETING · Notificación administrativa, no comprobante bancario",70,canvas.height-30,"22px Arial","#fff");
  }
  form.addEventListener("submit",e=>{
    e.preventDefault();invalidate();if(!form.reportValidity())return;
    const f=new FormData(form),get=k=>String(f.get(k)||"").trim();
    const items=[...rows.children].map(r=>({concept:r.querySelector(".receipt-concept").value.trim(),amount:cents(r.querySelector(".receipt-amount").value)}));
    if(!get("beneficiary")||!get("folio")||!items.length||items.some(i=>!i.concept||!Number.isSafeInteger(i.amount)||i.amount<=0)){status.textContent="Completa los datos y captura importes mayores a cero.";return;}
    receipt={folio:get("folio"),type:get("type"),beneficiary:get("beneficiary"),date:get("date"),project:get("project"),period:get("period"),method:get("method"),reference:get("reference"),notes:get("notes"),items,total:items.reduce((s,i)=>s+i.amount,0)};
    draw(receipt);out.hidden=false;status.textContent="Comprobante generado. Conserva una copia para tu registro.";
  });
  function message(){const d=receipt;return ["Hola, "+d.beneficiary+".","DEJAVÚ MARKETING informa que se realizó el siguiente pago:","Folio: "+d.folio,"Fecha: "+d.date,"Importe: "+money(d.total/100)+" MXN",d.project&&"Proyecto: "+d.project,d.period&&"Periodo: "+d.period,...d.items.map(i=>i.concept+": "+money(i.amount/100)),"Por favor responde: CONFIRMO RECIBIDO "+d.folio+". Si hay una diferencia o no identificas el pago, indícalo en tu respuesta.","Gracias. DEJAVÚ MARKETING · Administración"].filter(Boolean).join("\n");}
  $("receipt-png").addEventListener("click",()=>{if(!receipt)return;const a=document.createElement("a");a.download=receipt.folio.replace(/[^a-zA-Z0-9_-]/g,"_")+".png";a.href=canvas.toDataURL("image/png");a.click();});
  $("receipt-pdf").addEventListener("click",()=>{if(!receipt)return;const w=window.open("","_blank");if(!w){status.textContent="Permite ventanas emergentes para imprimir.";return;}w.opener=null;w.document.title=receipt.folio;const style=w.document.createElement("style");style.textContent="@page{size:A4 portrait;margin:10mm}body{margin:0;display:flex;justify-content:center}img{display:block;max-width:190mm;max-height:277mm;object-fit:contain}";w.document.head.append(style);const img=w.document.createElement("img");img.onload=()=>{w.focus();w.print();};img.src=canvas.toDataURL("image/png");w.document.body.append(img);});
  $("receipt-copy").addEventListener("click",async()=>{if(!receipt)return;try{await navigator.clipboard.writeText(message());status.textContent="Mensaje copiado.";}catch{status.textContent="No se pudo copiar. Usa WhatsApp o correo.";}});
  $("receipt-wa").addEventListener("click",()=>{if(receipt)window.open("https://wa.me/?text="+encodeURIComponent(message()),"_blank","noopener,noreferrer");});
  $("receipt-mail").addEventListener("click",()=>{if(receipt)location.href="mailto:?subject="+encodeURIComponent("Comprobante de pago "+receipt.folio)+"&body="+encodeURIComponent(message());});
}
