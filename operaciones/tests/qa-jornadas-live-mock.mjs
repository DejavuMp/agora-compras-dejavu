/* Prueba de interfaz con Firebase y GPS simulados; no toca producción. */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
const c=await browser.newContext({permissions:["geolocation"],geolocation:{latitude:19.4326,longitude:-99.1332,accuracy:12}});
const headers={"content-type":"application/javascript","access-control-allow-origin":"*"};
const eStart=new Date(Date.now()+3600000).toISOString(),eEnd=new Date(Date.now()+7*3600000).toISOString();
const staff={
  personId:"p1",person:{id:"p1",name:"Persona ficticia QA"},
  events:[{id:"evento1",title:"Volanteo de prueba",type:"Volanteo",status:"confirmado",
    venueName:"Sucursal ficticia",venueAddress:"Insurgentes 100, Ciudad de México",
    start:eStart,end:eEnd,staff:[{personId:"p1",start:eStart,end:eEnd}],dayIndex:1,dayCount:1}]
};
const policy={
  ownerUid:"staff-qa",personId:"p1",eventId:"evento1",enabled:true,mode:"horario",maxMinutes:480,
  startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+36000000).toISOString()
};
const authJS=[
  "export class GoogleAuthProvider {}",
  "export function onAuthStateChanged(_a,cb){queueMicrotask(()=>cb({uid:'staff-qa',email:'staff-qa@example.invalid',emailVerified:true}));return ()=>{}}",
  "export async function signInWithPopup(){}",
  "export async function signInWithRedirect(){}",
  "export async function signInWithEmailAndPassword(){}",
  "export async function sendPasswordResetEmail(){}",
  "export async function sendEmailVerification(){}",
  "export async function signOut(){}"
].join("\n");
const dbJS=[
  "const staff="+JSON.stringify(staff)+";",
  "const access="+JSON.stringify(policy)+";",
  "const rec={clock:new Map(),trips:new Map(),logs:new Map(),breaks:new Map()};",
  "window.__mockRecords=rec;",
  "const listeners={};",
  "export function doc(_db,...parts){return parts.join('/');}",
  "export function collection(_db,coll){return coll;}",
  "export function where(field,op,value){return {field,op,value}}",
  "export function query(coll,...filters){return {coll,filters}}",
  "export function serverTimestamp(){return new Date()}",
  "export async function getDocFromServer(ref){",
  " if(ref==='agora_users/staff-qa')return {exists:()=>false,data:()=>({})};",
  " if(ref==='agora_ops_members/staff-qa')return {exists:()=>true,data:()=>({active:true,role:'staff',personId:'p1'})};",
  " throw Error('unexpected '+ref);}",
  "function emit(coll){for(const fn of listeners[coll]||[])queueMicrotask(()=>fn(snapshot(coll)))}",
  "function snapshot(coll){",
  " if(coll==='agora_ops_staff/staff-qa')return {metadata:{fromCache:false},exists:()=>true,data:()=>staff};",
  " let map=coll==='agora_ops_shift_access'?new Map([['staff-qa_evento1',access]]):",
  " (coll==='agora_ops_clock'?rec.clock:coll==='agora_ops_logs'?rec.logs:coll==='agora_ops_breaks'?rec.breaks:rec.trips);",
  " return {metadata:{fromCache:false},docs:[...map.entries()].map(([id,data])=>({id,data:()=>data}))};",
  "}",
  "export function onSnapshot(ref,_o,fn){",
  " const coll=typeof ref==='string'?ref:ref.coll;",
  " (listeners[coll]??=[]).push(fn);queueMicrotask(()=>fn(snapshot(coll)));",
  " return ()=>{listeners[coll]=listeners[coll].filter(x=>x!==fn)};}",
  "export async function setDoc(ref,data){const [coll,id]=ref.split('/');",
  " const row=rec[coll==='agora_ops_clock'?'clock':coll==='agora_ops_logs'?'logs':coll==='agora_ops_breaks'?'breaks':'trips'];row.set(id,data);emit(coll);}",
  "export async function updateDoc(ref,data){const [coll,id]=ref.split('/');",
  " const row=rec[coll==='agora_ops_clock'?'clock':coll==='agora_ops_logs'?'logs':coll==='agora_ops_breaks'?'breaks':'trips'];row.set(id,{...row.get(id),...data});emit(coll);}"
].join("\n");
try{
  await c.route("**/firebase-init.js",r=>r.fulfill({status:200,headers,body:"window.AGORA_FIREBASE={auth:{},firestore:{}};"}));
  await c.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js",r=>r.fulfill({status:200,headers,body:authJS}));
  await c.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js",r=>r.fulfill({status:200,headers,body:dbJS}));
  const page=await c.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/operaciones/visor.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#j-events")?.textContent.includes("Volanteo de prueba"));
  assert.ok(await page.locator('[data-staff-tab="inicio"]').isVisible());
  await page.locator('#staff-tabs [data-staff-tab="cronograma"]').click();
  await page.locator("#j-period").selectOption("14");
  await page.locator("#j-period").selectOption("30");
  await page.locator("#j-period").selectOption("7");
  await page.locator('[data-calendar-mode="dia"]').click();
  await page.locator('[data-calendar-mode="timeline"]').click();
  assert.ok(await page.locator("#j-events").isVisible());
  const calendar=page.waitForEvent("download");
  await page.locator("#j-download-calendar").click();
  const calendarFile=await calendar;
  assert.ok(calendarFile.suggestedFilename().endsWith(".ics"),"El staff puede exportar sus jornadas");
  await page.locator('#staff-tabs [data-staff-tab="asistencia"]').click();
  assert.equal(new URL(page.url()).pathname,"/operaciones/visor.html","El staff permanece dentro del visor");
  assert.ok(await page.locator("#viewer-agenda").isHidden(),"Sin acceso a agenda administrativa");
  assert.ok(await page.locator("#viewer-request").isHidden(),"Una cuenta asignada no requiere repetir solicitud");
  assert.ok(!(await page.locator("body").innerText()).includes("NOMINA_PRIVADA"));
  assert.ok((await page.locator("#j-name").textContent()).includes("¡Hola, Persona ficticia QA!"));
  await page.locator("#start-shift").click();
  await page.waitForFunction(()=>document.querySelector("#auth-status")?.textContent.includes("Acepta compartir ubicación"));
  await page.locator("#live-location").check();
  await page.locator("#start-shift").click();
  await page.waitForFunction(()=>document.querySelector("#j-active")?.textContent.includes("Entrada oficial:"));
  // Simular una jornada ficticia de una hora en Firestore mock (sin modificar reloj real).
  await page.evaluate(()=>{window.__mockRecords.clock.get("staff-qa_evento1").startedAt=new Date(Date.now()-60*60000)});
  assert.ok((await page.locator("#j-operational-status").textContent()).includes("En jornada"));
  await page.locator("#j-break-start").click();
  await page.waitForFunction(()=>document.querySelector("#j-operational-status")?.textContent.includes("En descanso"));
  assert.ok(await page.locator("#end-shift").isDisabled(),"Jornada no termina con descanso abierto");
  await page.evaluate(()=>{
    window.__mockRecords.breaks.get("staff-qa_evento1_1").startedAt=new Date(Date.now()-15*60000);
  });
  await page.locator("#j-break-resume").click();
  await page.waitForFunction(()=>document.querySelector("#j-operational-status")?.textContent.includes("En jornada"));
  assert.equal((await page.evaluate(()=>[...window.__mockRecords.breaks.values()]))[0].status,"reanudado");

  await page.locator("#end-shift").click();
  await page.waitForFunction(()=>document.querySelector("#j-active")?.textContent.includes("Salida oficial:"),{timeout:8000}).catch(async error=>{console.log("JORNADA END DEBUG",JSON.stringify({status:await page.locator("#auth-status").textContent(),body:await page.locator("#j-active").innerText(),checked:await page.locator("#live-location").isChecked(),clock:await page.evaluate(()=>[...window.__mockRecords.clock.values()])}));throw error;});
  await page.locator('#staff-tabs [data-staff-tab="traslados"]').click();
  await page.locator("#trip-origin").fill("Metro ficticio");
  await page.locator("#trip-minutes").fill("30");
  await page.locator("#trip-buffer").fill("15");
  await page.locator("#trip-start").click();
  await page.waitForFunction(()=>document.querySelector("#j-trips")?.textContent.includes("Traslado en curso"));
  await page.locator("#trip-arrive").click();
  await page.waitForFunction(()=>document.querySelector("#j-trips")?.textContent.includes("Llegada registrada"));

  await page.locator('#staff-tabs [data-staff-tab="pagos"]').click();
  assert.equal(await page.locator('[data-break-for="evento1"]').count(),0,"Descansos verificados no permiten duplicación manual");
  await page.locator('[data-create-report="evento1"]').click();
  await page.waitForFunction(()=>document.querySelector("#j-payment-list")?.textContent.includes("Horas capturadas"));
  const monthWindow=page.waitForEvent("popup");
  await page.locator("#j-print-month").click();
  const monthPage=await monthWindow;
  await monthPage.waitForLoadState("domcontentloaded");
  const monthText=await monthPage.locator("body").innerText();
  assert.ok(monthText.includes("Reporte de días y horas trabajadas"));
  assert.ok(monthText.includes("Volanteo de prueba"));
  assert.ok(monthText.includes("Días distintos con reporte"));
  assert.ok(!monthText.includes("NOMINA_PRIVADA"));
  await monthPage.close();
  const receiptWindow=page.waitForEvent("popup");
  await page.locator('[data-print-report]').click();
  const receiptPage=await receiptWindow;
  await receiptPage.waitForLoadState("domcontentloaded");
  assert.ok((await receiptPage.locator("body").innerText()).includes("Comprobante de jornada"));
  assert.ok((await receiptPage.locator("body").innerText()).includes("Descanso declarado"));
  assert.ok(!(await receiptPage.locator("body").innerText()).includes("NOMINA_PRIVADA"));
  await receiptPage.close();
  await page.locator('[data-request-payment]').click();
  await page.waitForFunction(()=>document.querySelector("#j-payment-list")?.textContent.includes("En revisión"));
  const reports=await page.evaluate(()=>[...window.__mockRecords.logs.values()]);
  assert.equal(reports.length,1,"El reporte no debe duplicarse");
  assert.equal(reports[0].paymentStatus,"solicitado");
  assert.ok(reports[0].breakMins>=14&&reports[0].breakMins<=15,"Se descuenta la pausa con hora del servidor.");
  assert.equal(reports[0].requestedAmount,null,"El staff no define monto");
  assert.ok(reports[0].requestedHours>0);
  assert.ok(!(await page.locator("#j-payment-list").innerText()).includes("Tarifa por hora"));
  assert.deepEqual(errors,[],"Interfaz no debe lanzar errores de JavaScript");
  console.log("OK: UI de personal: turno, salida, GPS, traslado y arribo en un navegador simulado. NO producción.");
}finally{await c.close();await browser.close()}
