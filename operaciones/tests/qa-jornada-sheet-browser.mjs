/** Ficha visual y autocompletado, solo datos ficticios en demo local. */
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {readFileSync} from "node:fs";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:1340,height:920},timezoneId:"America/Mexico_City",acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on("pageerror",err=>errors.push(err.message));
const date=new Date();date.setDate(date.getDate()+1);
const fmt=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const d1=fmt(date),d2=fmt(new Date(date.getFullYear(),date.getMonth(),date.getDate()+1));
try{
 await page.goto("http://127.0.0.1:8765/operaciones/demo.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.AGORA_TEST?.getState);
 await page.evaluate(({d1,d2})=>{
  const old=window.AGORA_TEST.getState();
  const mk=(id,day,dayIndex)=>({
   id,seriesId:"grupo-qa",dayIndex,dayCount:2,title:"Volanteo QA",project:"Cliente QA",
   campaign:"Campaña QA",venueName:"Sucursal QA",venueAddress:"Ciudad de México, México",type:"Volanteo",
   start:day+"T10:00",end:day+"T16:00",status:"confirmado",
   staff:[{personId:"p1",start:day+"T09:30",end:day+"T16:30"}],vehicles:[]
  });
  const saved={...old,
   people:[{id:"p1",name:"Persona QA",role:"Promotor",hourRate:100,active:true}],
   events:[mk("ev1",d1,1),mk("ev2",d2,2)],logs:[],incidents:[],clocks:[],vehicles:[],sites:[]
  };
  localStorage.setItem("agora_planeacion_recursos_v3",JSON.stringify(saved));
 },{d1,d2});
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.AGORA_JORNADA_UI?.open);
 await page.locator("#board-date").fill(d1);
 await page.locator('[data-action="view-jornada"]').first().click();
 assert.equal(await page.locator(".jornada-day").count(),2,"Calendario muestra ambos días vinculados");
 assert.equal(await page.locator(".jornada-kpis").innerText().then(t=>t.includes("1")) ,true);
 assert.equal(await page.locator(".jornada-table").count(),2,"Asistencia y nómina en misma ficha");
 assert.ok((await page.locator(".jornada-dialog").innerText()).includes("Persona QA"));
 assert.ok((await page.locator(".jornada-dialog").innerText()).includes("$1,400.00"),"Prenómina calculada por ambos días");
 assert.equal(await page.locator("#jornada-finanzas").isChecked(),false,"Sin datos financieros en PDF por defecto");
 assert.ok(await page.locator("#jornada-whatsapp").isVisible());
 assert.ok(await page.locator("#jornada-email").isVisible());
 const [file]=await Promise.all([page.waitForEvent("download"),page.locator("#jornada-download").click()]);
 const filename=await file.path();
 assert.ok(file.suggestedFilename().endsWith(".pdf"),"Descarga PDF real");
 const data=readFileSync(filename);
 assert.equal(data.subarray(0,8).toString(),"%PDF-1.4");
 await page.locator("#jornada-finanzas").check();
 const [file2]=await Promise.all([page.waitForEvent("download"),page.locator("#jornada-download").click()]);
 assert.ok(readFileSync(await file2.path()).toString("latin1").includes("PRENÓMINA DEL EVENTO"));
 await page.locator("#jornada-dia").click();
 assert.equal(await page.locator(".jornada-day").count(),1,"Solo jornada seleccionada");
 await page.locator("#jornada-close").click();
 // Seleccionar integrante ya registrado debe cargar automáticamente sus otras asignaciones.
 await page.locator('[data-action="edit-event"]').first().click();
 assert.ok((await page.locator('[data-assignment-summary]').first().innerText()).includes("1 asignacion"),
   "Muestra jornada anterior/restante sin recapturar");
 await page.locator('#event-form [data-action="close-modal"]').click();
 // Nueva actividad misma campaña: recupera equipo sin duplicar la ficha del personal.
 await page.locator('[data-action="new-event"]').first().click();
 await page.locator("#ev-title").fill("Volanteo QA");
 await page.locator("#ev-campaign").fill("Campaña QA");
 await page.locator("#ev-campaign").press("Tab");
 assert.equal(await page.locator('[data-person-name]').first().inputValue(),"Persona QA","Equipo ya asignado se carga");
 assert.equal(await page.locator(".direct-person-row").count(),1,"No duplica al integrante");
 assert.ok((await page.locator("#ops-autoload-note").innerText()).includes("automáticamente"));
 assert.deepEqual(errors,[],"Sin errores de JavaScript");
 console.log("OK: ficha de jornada, calendario multi-día, prenómina, PDF y reuso de asignaciones.");
}finally{await context.close();await browser.close()}
