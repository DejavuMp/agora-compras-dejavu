/** UI de coordinación: marcajes reales, validación humana y prenómina.
 * Solo usa almacenamiento ficticio local; jamás conecta datos reales. */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:1350,height:900},timezoneId:"America/Mexico_City",acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on("pageerror",e=>errors.push(e.message));
const pad=n=>String(n).padStart(2,"0");
const now=new Date(),date=now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate()),month=date.slice(0,7);
const next=new Date(now);next.setDate(next.getDate()+7);
const due=next.getFullYear()+"-"+pad(next.getMonth()+1)+"-"+pad(next.getDate());
const start=date+"T10:00",end=date+"T16:00";
try{
 await page.goto("http://127.0.0.1:8765/operaciones/demo.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.AGORA_TEST?.getState);
 await page.evaluate(({start,end})=>{
   const d={
     version:3,people:[{id:"qa-person",name:"Personal de prueba",role:"Volanteo",active:true,hourRate:110,dayRate:700}],
     vehicles:[],sites:[],campaigns:[],blocks:[],audit:[],incidents:[],
     settings:{dailyLimit:8,weeklyLimit:48,prepDefault:30,afterDefault:30,notificationMinutes:60,lateGraceMinutes:10,earlyGraceMinutes:10},
     events:[{id:"qa-event",title:"Volanteo de control",project:"KFC ficticio",campaign:"Prueba",
       status:"confirmado",type:"Volanteo",start,end,staff:[{personId:"qa-person",start:start.replace("T10:00","T09:30"),end:end.replace("T16:00","T16:30")}],vehicles:[]}],
     clocks:[{id:"qa-clock",personId:"qa-person",eventId:"qa-event",ownerUid:"uid-qa",
       status:"finalizada",startedAt:start.replace("T10:00","T10:19"),endedAt:end.replace("T16:00","T16:10")}],
     logs:[{id:"qa-log",personId:"qa-person",eventId:"qa-event",start:start.replace("T10:00","T10:19"),
       end:end.replace("T16:00","T16:10"),breakMins:20,paymentBasis:"hora",paymentStatus:"validado",approvedAmount:650,
       activity:"Entrega de material de promoción",place:"Sucursal ficticia"}]
   };
   localStorage.setItem("agora_planeacion_recursos_v3",JSON.stringify(d));
 },{start,end});
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.AGORA_TEST?.getState&&window.AGORA_TEST.getState().events.length===1);
 // El registro 19 min después de su turno NO determina un retardo automáticamente.
 await page.locator('[data-nav="asistencia"]').first().click();
 assert.ok(await page.locator(".data-table").isVisible());
 assert.ok((await page.locator(".data-table").innerText()).includes("Pendiente"),"Asistencia pendiente, no retardo automático");
 assert.ok((await page.locator(".data-table").innerText()).includes("10:19"),"Entrada real registrada");
 await page.locator('[data-action="review-attendance"]').first().click();
 await page.locator("#attendance-review-decision").selectOption("retardo");
 await page.locator("#attendance-review-notes").fill("Se revisó la entrada y se confirma retardo.");
 await page.locator('#attendance-review-form button[type="submit"]').click();
 const db=await page.evaluate(()=>window.AGORA_TEST.getState());
 assert.equal(db.incidents.filter(x=>x.type==="validacion_asistencia").length,1,"Una validación manual por jornada");
 assert.equal(db.incidents.find(x=>x.type==="validacion_asistencia").status,"retardo");
 assert.ok((await page.locator(".data-table").innerText()).includes("Retardo validado"));
 await page.locator('[data-nav="pagos"]').first().click();
 await page.waitForFunction(()=>window.AGORA_PAYROLL_UI?.open);
 await page.locator('[data-action="open-payroll"]').click();
 await page.locator("#ops-payroll-overlay").waitFor({state:"visible"});
 await page.locator("#payroll-month").fill(month);
 assert.ok((await page.locator(".ops-payroll-table").innerText()).includes("Personal de prueba"));
 assert.ok((await page.locator(".ops-payroll-table").innerText()).includes("650"));
 await page.locator("#payroll-due").fill(due);
 await page.locator("#payroll-save-date").click();
 const db2=await page.evaluate(()=>window.AGORA_TEST.getState());
 assert.equal(db2.settings.payrollPlan[month],due,"Fecha de pago guardada");
 const [file]=await Promise.all([
   page.waitForEvent("download"),
   page.locator("#payroll-xlsx").click()
 ]);
 assert.ok(file.suggestedFilename().endsWith(".xlsx"),"Excel descargable");
 const [popup]=await Promise.all([page.waitForEvent("popup"),page.locator("#payroll-print").click()]);
 await popup.waitForLoadState("domcontentloaded");
 assert.ok((await popup.locator("body").innerText()).includes("Prenómina interna"),"Documento PDF imprimible");
 await popup.close();
 await page.locator("#payroll-close").click();
 await page.locator("#role-select").selectOption("personal");
 let alertShown=false;
 page.once("dialog",d=>{alertShown=true;d.dismiss()});
 await page.evaluate(()=>window.AGORA_PAYROLL_UI.open());
 assert.equal(alertShown,true,"El staff de demostración no abre prenómina");
 assert.deepEqual(errors,[],"Sin errores JS: "+errors.join(" | "));
 console.log("OK UI: revisión manual, marcajes reales, fecha prevista, XLSX, PDF y protección de rol.");
}finally{await context.close();await browser.close()}
