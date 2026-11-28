const money = amount => new Intl.NumberFormat("es-MX", {style: "currency", currency: "MXN"}).format(amount);
const methods = {transferencia: "Transferencia", efectivo: "Efectivo", otro: "Otro"};

export function paymentReceipt(request, paymentId) {
  const payments = request?.payments ?? [];
  const payment = payments.find(item => item.id === paymentId);
  if (!payment || !/^[A-Za-z0-9_-]{1,197}$/.test(request.id.replaceAll("~", "_")) ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(paymentId) || !["pago_parcial", "pagada"].includes(request.status) ||
      !Number.isFinite(payment.amount) || payment.amount <= 0 ||
      !Number.isFinite(request.paidAmount) || !Number.isFinite(request.approvedAmount) ||
      request.paidAmount < payment.amount || request.paidAmount > request.approvedAmount ||
      !payment.date || !request.beneficiary) {
    return null;
  }
  const total = Math.round(payment.amount * 100);
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  const type = request.category === "nomina" ? "Personal" : request.category === "proveedor" ? "Proveedor" : "Pago operativo";
  const concept = request.hoursOrigin ? "Pago de horas validadas" : "Pago aplicado a la solicitud";
  return {
    folio: "DVM-PAG-" + paymentId,
    type,
    beneficiary: request.beneficiary,
    date: payment.date,
    project: request.project || "",
    period: request.hoursOrigin ? "Jornada " + request.hoursOrigin.eventId : "",
    method: methods[payment.method] || "Otro",
    reference: payment.reference || "",
    total,
    balance: Math.round(request.approvedAmount * 100) - Math.round(request.paidAmount * 100),
    items: [{concept: concept + " " + request.folio, amount: total}]
  };
}

function receiptMessage(receipt) {
  return [
    "Hola, " + receipt.beneficiary + ".",
    "DEJAVÚ registró el siguiente pago.",
    "Folio " + receipt.folio,
    "Fecha " + receipt.date,
    "Importe " + money(receipt.total / 100) + " MXN",
    receipt.project && "Proyecto " + receipt.project,
    "Responde a este mensaje para confirmar de recibido. Si no identificas el pago o hay una diferencia, indícanos el folio.",
    "DEJAVÚ MARKETING · Administración"
  ].filter(Boolean).join("\n");
}

  function wrap(ctx,value,max){
    const result=[];let line="";
    for(const word of String(value).split(/\s+/)){let candidate=line?line+" "+word:word;if(ctx.measureText(candidate).width<=max){line=candidate;continue;}
      if(line){result.push(line);line="";}
      for(const char of word){if(ctx.measureText(line+char).width>max&&line){result.push(line);line="";}line+=char;}
    }if(line)result.push(line);return result.length?result:[""];
  }
  function draw(d, canvas){
    canvas.width=1240;const ctx=canvas.getContext("2d");const operations=[];let y=360;
    function section(label,value){if(!value)return;ctx.font="bold 25px Arial";operations.push({text:label,x:70,y,font:ctx.font,color:"#555"});y+=42;ctx.font="32px Arial";for(const t of wrap(ctx,value,1100)){operations.push({text:t,x:70,y,font:ctx.font,color:"#171717"});y+=40;}y+=22;}
    section("BENEFICIARIO · "+d.type.toUpperCase(),d.beneficiary);section("FECHA DE PAGO",d.date);section("PROYECTO / SERVICIO",d.project);section("PERIODO PAGADO",d.period);section("FORMA DE PAGO",d.method);section("REFERENCIA",d.reference);
    operations.push({text:"DESGLOSE DEL PAGO",x:70,y,font:"bold 28px Arial",color:"#171717"});y+=50;
    for(const item of d.items){ctx.font="29px Arial";const lines=wrap(ctx,item.concept,740);for(let i=0;i<lines.length;i++){operations.push({text:lines[i],x:70,y,font:ctx.font,color:"#171717"});if(i===0)operations.push({text:money(item.amount/100),x:1170,y,font:"bold 28px Arial",color:"#171717",align:"right"});y+=38;}y+=17;}
    section("SALDO ACTUAL DE LA OBLIGACIÓN",money(d.balance/100));
    section("ACUSE DE RECIBIDO","Responde al mensaje indicando si recibiste el importe y cita el folio.");
    canvas.height=y+120;ctx.fillStyle="#fff";ctx.fillRect(0,0,1240,canvas.height);ctx.fillStyle="#141414";ctx.fillRect(0,0,1240,176);
    const write=(t,x,y,font,color,align="left")=>{ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);};
    write("DEJAVÚ",70,78,"bold 58px Arial","#fff");write("MARKETING  /  ADMINISTRACIÓN",70,128,"24px Arial","#fff");
    write("COMPROBANTE DE PAGO",70,225,"bold 34px Arial","#171717");write(d.folio,70,267,"26px Arial","#555");
    write(money(d.total/100)+" MXN",1170,325,"bold 52px Arial","#171717","right");
    for(const o of operations)write(o.text,o.x,o.y,o.font,o.color,o.align);
    ctx.fillStyle="#141414";ctx.fillRect(0,canvas.height-76,1240,76);write("DEJAVÚ MARKETING · Notificación administrativa, no comprobante bancario",70,canvas.height-30,"22px Arial","#fff");
  }

export function mountRegisteredPaymentReceipt(host, receipt, onError) {
  host.innerHTML = `<h3>Comprobante de pago · DEJAVÚ</h3>
    <canvas aria-label="Vista previa del comprobante" style="display:block;width:min(100%,520px);height:auto;margin:12px auto"></canvas>
    <div class="action-bar">
      <button type="button" class="btn btn-gold" data-receipt="pdf">Descargar PDF</button>
      <button type="button" class="btn btn-outline" data-receipt="png">Descargar PNG</button>
      <button type="button" class="btn btn-outline" data-receipt="print">Imprimir</button>
      <button type="button" class="btn btn-outline" data-receipt="copy">Copiar texto</button>
      <button type="button" class="btn btn-outline" data-receipt="wa">WhatsApp</button>
      <button type="button" class="btn btn-outline" data-receipt="mail">Correo</button>
    </div>
    <p>Adjunta el comprobante al mensaje. La respuesta se recibe por el medio que elijas.</p>
    <p role="status" aria-live="polite"></p>`;
  const canvas = host.querySelector("canvas");
  const status = host.querySelector('[role="status"]');
  draw(receipt, canvas);
  const message = receiptMessage(receipt);
  host.addEventListener("click", async event => {
    const action = event.target.closest("[data-receipt]")?.dataset.receipt;
    if (!action) return;
    try {
      if (action === "png") {
        const link = document.createElement("a");
        link.download = receipt.folio + ".png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      }
      if (action === "pdf") {
        const Pdf = window.jspdf?.jsPDF;
        if (!Pdf) throw new Error("PDF no disponible. Usa Imprimir para guardar una copia.");
        const pdf = new Pdf({orientation: "portrait", unit: "mm", format: "a4"});
        const width = Math.min(190, 277 * canvas.width / canvas.height);
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", (210 - width) / 2, 10,
          width, width * canvas.height / canvas.width);
        pdf.save(receipt.folio + ".pdf");
      }
      if (action === "print") {
        const popup = window.open("", "_blank");
        if (!popup) throw new Error("Permite ventanas emergentes para imprimir.");
        popup.opener = null;
        popup.document.title = receipt.folio;
        const style = popup.document.createElement("style");
        style.textContent = "@page{size:A4;margin:10mm}body{margin:0;text-align:center}img{max-width:100%;max-height:277mm}";
        popup.document.head.append(style);
        const img = popup.document.createElement("img");
        img.onload = () => { popup.focus(); popup.print(); };
        img.src = canvas.toDataURL("image/png");
        popup.document.body.append(img);
      }
      if (action === "copy") {
        await navigator.clipboard.writeText(message);
        status.textContent = "Texto copiado.";
      }
      if (action === "wa") window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
      if (action === "mail") location.href = "mailto:?subject=" + encodeURIComponent("Comprobante " + receipt.folio) +
        "&body=" + encodeURIComponent(message);
    } catch (error) {
      onError(error);
    }
  });
}
