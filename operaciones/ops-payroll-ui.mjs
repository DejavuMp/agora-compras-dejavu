import {buildPayroll,payrollHtml,payrollXlsx,payrollEmail} from "./ops-payroll-preview.mjs";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let root=null,report=null,month="",dueDate="";
const isAdmin=()=>window.AGORA_OPS_BRIDGE?(window.AGORA_OPS_BRIDGE.role==="coordinador"&&window.AGORA_OPS_BRIDGE.ready):(window.AGORA_OPS_APP?.getRole?.()==="coordinador");
const state=()=>window.AGORA_OPS_APP?.snapshot?.()||window.AGORA_TEST?.getState?.();
const pad=x=>String(x).padStart(2,"0");
const currentMonth=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)};
function build(){
 const db=state();if(!db)return;
 dueDate=dueDate||db.settings?.payrollPlan?.[month]||"";
 report=buildPayroll({...db,month,dueDate});
}
const currency=v=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(v||0);
function view(){
 if(!root)return;build();const x=report;
 root.innerHTML='<div class="ops-payroll-window" role="dialog" aria-modal="true" aria-label="Prenómina interna">'+
 '<div class="ops-payroll-head"><div><strong>Dejavú · Prenómina prevista</strong><small>No realiza transferencias ni emite CFDI de nómina</small></div><button id="payroll-close" type="button">Cerrar</button></div>'+
 '<div class="ops-payroll-main"><div class="ops-payroll-filters"><label>Mes de jornadas<input id="payroll-month" type="month" value="'+safe(month)+'"></label>'+
 '<label>Fecha prevista del pago<input id="payroll-due" type="date" value="'+safe(dueDate)+'"></label>'+
 '<button type="button" id="payroll-save-date">Guardar previsión</button></div>'+
 '<div class="ops-payroll-stats"><div><small>Jornadas</small><b>'+x.count+'</b></div><div><small>Total previsto</small><b>'+currency(x.total)+'</b></div><div><small>Autorizado</small><b>'+currency(x.authorized)+'</b></div><div><small>Por validar</small><b>'+currency(x.pending)+'</b></div></div>'+
 '<p class="ops-payroll-note">Los importes sin jornada validada son <b>estimaciones de planeación</b>, según las tarifas cargadas. No equivalen a pagos aprobados.</p>'+
 '<div class="ops-payroll-table"><table><thead><tr><th>Folio</th><th>Personal</th><th>Jornada</th><th>Horas</th><th>Tarifa</th><th>Importe</th><th>Asistencia</th><th>Pago</th></tr></thead><tbody>'+
 (x.rows.map(r=>'<tr><td>'+safe(r.folio)+'</td><td>'+safe(r.person)+'</td><td>'+safe(r.date)+' · '+safe(r.activity)+'</td><td>'+safe(r.hours)+'</td><td>'+currency(r.rate)+'</td><td>'+currency(r.amount)+'</td><td>'+safe(r.attendance)+'</td><td>'+safe(r.status)+'</td></tr>').join('')||'<tr><td colspan="8">Sin jornadas para este mes.</td></tr>')+
 '</tbody></table></div><div class="ops-payroll-actions"><button id="payroll-xlsx" type="button">Descargar Excel (.xlsx)</button>'+
 '<button id="payroll-print" type="button">Imprimir / Guardar PDF</button><button id="payroll-copy" type="button">Copiar texto para correo</button>'+
 '<button id="payroll-mail" type="button">Abrir correo</button></div><p class="ops-payroll-message" id="payroll-message"></p></div></div>';
}
function download(bytes,filename,type){
 const link=document.createElement("a"),url=URL.createObjectURL(new Blob([bytes],{type}));
 link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function message(s){const el=root?.querySelector("#payroll-message");if(el)el.textContent=s}
function openPrint(){
 const url=URL.createObjectURL(new Blob([payrollHtml(report)],{type:"text/html;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 message("En la pestaña imprimible selecciona «Guardar como PDF».");
}
async function action(ev){
 const b=ev.target.closest("button");if(!b||!root||root.hidden)return;
 if(b.id==="payroll-close"){close();return}
 if(b.id==="payroll-save-date"){
   dueDate=root.querySelector("#payroll-due").value;
   window.AGORA_OPS_APP?.savePayrollDueDate?.(month,dueDate);
   view();message("Fecha prevista guardada para la coordinación.");return;
 }
 if(b.id==="payroll-xlsx"){download(payrollXlsx(report),report.folio+".xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");return}
 if(b.id==="payroll-print"){openPrint();return}
 if(b.id==="payroll-copy"){
   const x=payrollEmail(report),body="Asunto: "+x.subject+"\n\n"+x.body;
   try{await navigator.clipboard.writeText(body);message("Texto copiado. Adjunta el Excel o PDF descargado.")}
   catch(_){prompt("Copia el texto:",body)}
 }
 if(b.id==="payroll-mail"){
   const x=payrollEmail(report);
   location.href="mailto:?subject="+encodeURIComponent(x.subject)+"&body="+encodeURIComponent(x.body);
   message("Adjunta manualmente el documento; el enlace no envía archivos ni dinero.");
 }
}
function install(){
 if(root)return;root=document.createElement("div");root.id="ops-payroll-overlay";root.hidden=true;document.body.append(root);
 const st=document.createElement("style");
 st.textContent=[
 "#ops-payroll-overlay{position:fixed;inset:0;z-index:9998;display:grid;place-items:center;background:#0009;padding:12px;font:13px Arial}",
 "#ops-payroll-overlay[hidden]{display:none!important}",
 ".ops-payroll-window{background:#fff;border-radius:16px;width:min(1120px,100%);max-height:calc(100dvh - 24px);overflow:auto;box-shadow:0 20px 80px #0004}",
 ".ops-payroll-head{background:#1a1c1e;color:#fff;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:18px 20px}",
 ".ops-payroll-head strong{font-size:18px}.ops-payroll-head small{display:block;color:#d8c49b;margin-top:6px}",
 ".ops-payroll-head button{background:#fff;border:0;border-radius:8px;padding:9px 13px;font-weight:bold}",
 ".ops-payroll-main{padding:18px 20px}.ops-payroll-filters,.ops-payroll-actions,.ops-payroll-stats{display:flex;gap:10px;align-items:end;flex-wrap:wrap}",
 ".ops-payroll-filters label{display:grid;gap:5px;color:#5c6168;font-size:11px}",
 ".ops-payroll-filters input{border:1px solid #ccc;border-radius:8px;padding:10px}",
 ".ops-payroll-main button{border:1px solid #bea877;border-radius:8px;padding:10px 12px;background:#fff;font-weight:700;cursor:pointer}",
 ".ops-payroll-stats{margin:18px 0}.ops-payroll-stats>div{background:#f8f7f4;border:1px solid #eee;padding:15px;border-radius:12px;min-width:140px;flex:1}",
 ".ops-payroll-stats small{display:block;color:#777}.ops-payroll-stats b{display:block;font-size:22px;margin-top:8px}",
 ".ops-payroll-note,.ops-payroll-message{font-size:12px;line-height:1.6;color:#696c71}",
 ".ops-payroll-table{max-height:40vh;overflow:auto;border:1px solid #eee}",
 ".ops-payroll-table table{border-collapse:collapse;width:100%;font-size:11px}",
 ".ops-payroll-table th,.ops-payroll-table td{padding:10px;border-bottom:1px solid #ececec;text-align:left;white-space:nowrap}",
 ".ops-payroll-table th{position:sticky;top:0;background:#faf9f6}",
 ".ops-payroll-actions{margin-top:15px}",
 "@media(max-width:620px){.ops-payroll-main{padding:12px}.ops-payroll-stats>div{min-width:calc(50% - 10px)}}"
 ].join("\n");document.head.append(st);
 root.addEventListener("click",action);
 root.addEventListener("change",ev=>{
   if(ev.target.id==="payroll-month"&&/^\d{4}-\d{2}$/.test(ev.target.value)){month=ev.target.value;dueDate="";view()}
   if(ev.target.id==="payroll-due"){dueDate=ev.target.value;view()}
 });
 root.addEventListener("click",ev=>{if(ev.target===root)close()});
}
function open(){
 if(!isAdmin()){alert("Solo coordinación puede consultar la prenómina.");return}
 install();month=month||currentMonth();root.hidden=false;view();
}
function close(){if(root)root.hidden=true}
window.AGORA_PAYROLL_UI={open,close};
