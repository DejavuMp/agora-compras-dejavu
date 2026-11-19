import {buildJornadaSheet,existingAssignments,suggestedEventStaff,jornadaPdf,jornadaShareText,jornadaEmail,safeHtml} from "./ops-jornada-sheet.mjs";
let root=null,eventId="",scope="evento",includePayroll=false,report=null;
const db=()=>window.AGORA_OPS_APP?.snapshot?.()||window.AGORA_TEST?.getState?.();
const allowed=()=>window.AGORA_OPS_BRIDGE?
 (window.AGORA_OPS_BRIDGE.ready&&window.AGORA_OPS_BRIDGE.role==="coordinador"):
 window.AGORA_OPS_APP?.getRole?.()==="coordinador";
const money=x=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(x||0);
function pdfFile(){
 const bytes=jornadaPdf(report,{includePayroll});
 const id=report.folio.replace(/[^A-Za-z0-9_-]/g,"").slice(0,48);
 return new File([bytes],id+(includePayroll?"-NOMINA":"-OPERATIVO")+".pdf",{type:"application/pdf"});
}
function downloadPdf(){
 const file=pdfFile(),url=URL.createObjectURL(file),a=document.createElement("a");
 a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
 return file;
}
function info(s){const n=root?.querySelector("#jornada-message");if(n)n.textContent=s}
function render(){
 if(!root)return;
 try{report=buildJornadaSheet(db(),eventId,{scope})}
 catch(e){root.innerHTML='<section class="jornada-dialog"><p>'+safeHtml(e.message)+'</p><button id="jornada-close">Cerrar</button></section>';return}
 const r=report;
 const days=r.days.map(d=>'<article class="jornada-day"><div class="jornada-day-head"><b>'+safeHtml(d.date)+'</b><small>'+d.count+' asignaciones</small></div>'+
 d.people.map(p=>'<p><b>'+safeHtml(p.name)+'</b><span>'+safeHtml(p.start)+'–'+safeHtml(p.end)+'</span></p>').join('')+'</article>').join('');
 const team=r.roster.map(p=>'<tr><td><b>'+safeHtml(p.person)+'</b><small>'+safeHtml(p.role||'Sin puesto')+'</small></td><td>'+safeHtml(p.date)+
 '</td><td>'+safeHtml(p.scheduledStart)+'–'+safeHtml(p.scheduledEnd)+'</td><td>'+safeHtml(p.actualStart)+' / '+safeHtml(p.actualEnd)+'</td><td>'+safeHtml(p.attendance)+'</td></tr>').join('');
 const pay=r.payroll.map(p=>'<tr><td>'+safeHtml(p.date)+'</td><td>'+safeHtml(p.person)+'</td><td>'+safeHtml(p.basis)+
 '</td><td>'+money(p.rate)+'</td><td>'+safeHtml(p.hours)+' h</td><td>'+money(p.amount)+'</td><td>'+safeHtml(p.status)+
 '</td><td>'+safeHtml(p.dueDate||'Sin definir')+'</td></tr>').join('');
 root.innerHTML='<div class="jornada-dialog" role="dialog" aria-modal="true" aria-label="Ficha de Jornada">'+
 '<div class="jornada-head"><div><small>ÁGORA · DEJAVÚ MARKETING · FICHA DE JORNADA</small><h2>'+safeHtml(r.title)+
 '</h2><p>'+safeHtml(r.campaign||r.project||'Sin campaña')+' · '+safeHtml(r.site)+' · '+safeHtml(r.dateFrom)+
 (r.dateTo!==r.dateFrom?' al '+safeHtml(r.dateTo):'')+'</p></div><button id="jornada-close">✕ Cerrar</button></div>'+
 '<div class="jornada-body"><div class="jornada-switch"><button id="jornada-evento" class="'+(scope==='evento'?'active':'')+
 '">Evento completo</button><button id="jornada-dia" class="'+(scope==='dia'?'active':'')+'">Esta jornada</button>'+
 '<span>Folio: '+safeHtml(r.folio)+'</span></div><div class="jornada-kpis"><div><small>Jornadas</small><b>'+r.events.length+
 '</b></div><div><small>Personal único</small><b>'+r.assignedPeople+'</b></div><div><small>Importe previsto</small><b>'+money(r.totals.estimated)+
 '</b></div><div><small>Autorizado</small><b>'+money(r.totals.authorized)+'</b></div><div><small>Programado / pagado</small><b>'+
 money(r.totals.programmed)+' / '+money(r.totals.paid)+'</b></div></div>'+
 '<section><h3>Calendario del personal</h3><p class="jornada-note">Se carga automáticamente de las asignaciones registradas.</p>'+
 '<div class="jornada-calendar">'+(days||'<p>Sin asignaciones todavía.</p>')+'</div></section>'+
 '<section><h3>Personal asignado · Asistencia</h3><div class="jornada-table"><table><thead><tr><th>Personal</th><th>Fecha</th><th>Turno</th><th>Entrada / salida real</th><th>Validación</th></tr></thead><tbody>'+
 (team||'<tr><td colspan="5">No hay personal asignado.</td></tr>')+'</tbody></table></div></section>'+
 '<section><h3>Previsión de nómina del evento</h3><p class="jornada-note">Privada. Los importes sin autorizar son estimaciones.</p>'+
 '<div class="jornada-table"><table><thead><tr><th>Fecha</th><th>Integrante</th><th>Base</th><th>Tarifa</th><th>Horas</th><th>Importe</th><th>Estado</th><th>Pago previsto</th></tr></thead><tbody>'+
 (pay||'<tr><td colspan="8">Sin importes previstos.</td></tr>')+'</tbody></table></div>'+
 '<p><b>Total estimado: '+money(r.totals.estimated)+'</b> · Autorizado: '+money(r.totals.authorized)+
 ' · Por revisar: '+money(r.totals.pending)+'</p><p class="jornada-note">'+safeHtml(r.moneyWarning)+'</p></section>'+
 '<section><h3>Descargar y compartir</h3><label class="jornada-private"><input type="checkbox" id="jornada-finanzas" '+
 (includePayroll?'checked':'')+'> Incluir nómina e importes en el PDF y el mensaje (confidencial)</label>'+
 '<div class="jornada-actions"><button id="jornada-download">Descargar PDF</button><button class="primary" id="jornada-share">Compartir archivo PDF</button>'+
 '<button id="jornada-whatsapp">WhatsApp</button><button id="jornada-email">Correo</button><button id="jornada-copy">Copiar texto</button></div>'+
 '<p id="jornada-message" class="jornada-note" aria-live="polite">WhatsApp y correo abren el mensaje listo. En equipos sin compartir archivos, adjunta manualmente el PDF descargado.</p></section></div></div>';
}
async function action(e){
 const b=e.target.closest("button");if(!b||root.hidden)return;
 if(b.id==="jornada-close"){close();return}
 if(!allowed()){close();alert("Ficha privada para coordinación.");return}
 if(b.id==="jornada-evento"){scope="evento";render();return}
 if(b.id==="jornada-dia"){scope="dia";render();return}
 if(b.id==="jornada-download"){const f=downloadPdf();info("PDF descargado: "+f.name);return}
 if(b.id==="jornada-share"){
  const file=pdfFile(),text=jornadaShareText(report,{includePayroll});
  if(navigator.canShare?.({files:[file]})&&navigator.share){
   try{await navigator.share({files:[file],title:report.title,text});info("Elige a quién compartir el documento.")}
   catch(error){if(error.name!=="AbortError")info("No se pudo compartir. Descarga el PDF y adjúntalo manualmente.")}
  }else{downloadPdf();info("Tu navegador no comparte archivos directamente. Descargué el PDF; adjúntalo en WhatsApp o correo.")}
  return;
 }
 if(b.id==="jornada-whatsapp"){
  downloadPdf();
  const url="https://api.whatsapp.com/send?text="+encodeURIComponent(jornadaShareText(report,{includePayroll}));
  window.open(url,"_blank","noopener,noreferrer");
  info("PDF descargado. Adjunta ese archivo en WhatsApp; no es posible anexarlo mediante un enlace de mensaje.");
  return;
 }
 if(b.id==="jornada-email"){
  downloadPdf();const x=jornadaEmail(report,{includePayroll});
  window.location.href="mailto:?subject="+encodeURIComponent(x.subject)+"&body="+encodeURIComponent(x.body);
  info("PDF descargado. Adjunta el archivo al correo antes de enviarlo.");return;
 }
 if(b.id==="jornada-copy"){
  const msg=jornadaShareText(report,{includePayroll});
  try{await navigator.clipboard.writeText(msg);info("Resumen copiado al portapapeles.")}
  catch(_){window.prompt("Copia este texto",msg)}
 }
}
function install(){
 if(root)return;root=document.createElement("div");root.id="agora-jornada-overlay";root.hidden=true;document.body.append(root);
 const style=document.createElement("style");
 style.textContent=[
 "#agora-jornada-overlay{position:fixed;inset:0;z-index:9997;background:#0009;display:grid;place-items:center;padding:12px;font:13px/1.5 Arial,sans-serif;color:#24272a}",
 "#agora-jornada-overlay[hidden]{display:none!important}",
 ".jornada-dialog{background:#fff;border-radius:16px;width:min(1240px,100%);max-height:calc(100dvh - 24px);overflow-y:auto;box-shadow:0 24px 90px #0005}",
 ".jornada-head{padding:22px 25px;background:#181a1c;color:#fff;display:flex;align-items:start;justify-content:space-between;gap:16px}",
 ".jornada-head small{color:#c1a16c;font-size:10px;letter-spacing:1px}.jornada-head h2{font-size:24px;margin:6px 0}.jornada-head p{margin:0;font-size:12px;color:#ddd}",
 ".jornada-head button{background:#fff;border:0;border-radius:8px;padding:9px 12px;white-space:nowrap;font-weight:bold;cursor:pointer}",
 ".jornada-body{padding:20px 24px}.jornada-switch{display:flex;gap:7px;align-items:center;flex-wrap:wrap}",
 ".jornada-switch button,.jornada-actions button{padding:10px 13px;border:1px solid #d9d9d7;border-radius:9px;background:#fff;font:700 12px Arial;cursor:pointer}",
 ".jornada-switch button.active,.jornada-actions button.primary{background:#202224;color:#fff;border-color:#202224}",
 ".jornada-switch span{margin-left:auto;font-size:11px;color:#75787a}",
 ".jornada-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:17px 0}",
 ".jornada-kpis>div{border:1px solid #e8e6e2;border-radius:12px;padding:14px;background:#faf9f7}",
 ".jornada-kpis small{display:block;font-size:10px;color:#787c80;margin-bottom:5px}.jornada-kpis b{font-size:19px}",
 ".jornada-body section{border-top:1px solid #e9e9e7;padding-top:18px;margin-top:20px}.jornada-body h3{font-size:15px;margin:0 0 9px}",
 ".jornada-note{font-size:11px;color:#6d747b;line-height:1.6}",
 ".jornada-calendar{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px}",
 ".jornada-day{border:1px solid #e9e3d8;background:#fffdfa;border-radius:11px;padding:13px}",
 ".jornada-day-head{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #eee2cb;padding-bottom:9px;font-size:11px}",
 ".jornada-day-head small{color:#868078}.jornada-day p{display:flex;justify-content:space-between;gap:8px;margin:8px 0;font-size:11px}",
 ".jornada-day p span{color:#7d807c}",
 ".jornada-table{overflow:auto;border:1px solid #e8e9e8;border-radius:9px}.jornada-table table{border-collapse:collapse;width:100%;font-size:11px}",
 ".jornada-table th,.jornada-table td{padding:10px 12px;border-bottom:1px solid #ececeb;text-align:left;white-space:nowrap}",
 ".jornada-table th{background:#f7f7f5;color:#4e5459;font-size:10px}.jornada-table td small{display:block;font-size:10px;color:#80858a}",
 ".jornada-private{display:flex;gap:8px;align-items:center;font-size:12px;padding:10px 0}.jornada-private input{accent-color:#9a7541}",
 ".jornada-actions{display:flex;gap:8px;flex-wrap:wrap}",
 "@media(max-width:760px){.jornada-body{padding:13px}.jornada-head{padding:16px}.jornada-head h2{font-size:19px}.jornada-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.jornada-kpis>div:last-child{grid-column:1/-1}.jornada-switch span{margin-left:0}}"
 ].join("\n");document.head.append(style);
 root.addEventListener("click",action);
 root.addEventListener("change",e=>{if(e.target.id==="jornada-finanzas"){includePayroll=e.target.checked;render()}});
 root.addEventListener("click",e=>{if(e.target===root)close()});
}
function open(id){
 if(!allowed()){alert("Solo coordinación puede abrir la ficha de jornada con nómina.");return false}
 if(!db()?.events?.some(e=>e.id===id)){alert("Jornada no encontrada.");return false}
 install();eventId=id;scope="evento";includePayroll=false;root.hidden=false;render();return true;
}
function close(){if(root)root.hidden=true}
window.AGORA_JORNADA_UI={open,close,existingAssignments,suggestedEventStaff};
