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
    start:eStart,end:eEnd,staff:[{personId:"p1",start:eStart,end:eEnd,assignedByName:"Coordinación QA"}],dayIndex:1,dayCount:1,
    ownPay:{amount:720,basis:"hora",label:"Estimado por horas programadas"}}]
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
  " if(ref.startsWith('agora_ops_logs/')){const row=rec.logs.get(ref.split('/')[1]);return {exists:()=>!!row,data:()=>row}}",
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
  assert.ok(await page.locator('.staff-shortcuts summary').isVisible(),"Acceso sencillo con herramientas plegadas");
  assert.equal(await page.locator("#staff-tabs button").count(),3,"Menú del staff con solo tres opciones");
  assert.ok(await page.locator("#j-home-attendance #j-active").isVisible(),"El marcaje está en Mi día, no en otra pantalla");
  assert.ok((await page.locator("#j-active").innerText()).includes("Coordinación QA"),"El staff ve quién lo asignó");
  assert.ok((await page.locator("#j-home-pay").innerText()).includes("$720.00"),"Staff ve solo su propio pago previsto");
  assert.ok((await page.locator("#j-home-pay").innerText()).includes("Estimado"),"Estimado no se confunde con autorizado");
  assert.ok(await page.locator("#j-home-pay").isVisible());

  await page.locator('.staff-shortcuts summary').click();
  await page.locator('#staff-tabs [data-staff-tab="cronograma"]').click();
  assert.ok(await page.locator("#j-return-home").isVisible(),"Botón claro de regreso al inicio");
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
  await page.locator('.staff-more-tools [data-staff-tab="asistencia"]').click();
  assert.equal(new URL(page.url()).pathname,"/operaciones/visor.html","El staff permanece dentro del visor");
  assert.ok(await page.locator("#viewer-agenda").isHidden(),"Sin acceso a agenda administrativa");
  assert.ok(await page.locator("#viewer-request").isHidden(),"Una cuenta asignada no requiere repetir solicitud");
  assert.ok(!(await page.locator("body").innerText()).includes("NOMINA_PRIVADA"));
  assert.ok((await page.locator("#j-name").textContent()).includes("¡Hola, Persona ficticia QA!"));
  assert.equal(await page.locator("#start-shift").count(),0,"Staff no registra su propia entrada");
  assert.equal(await page.locator("#end-shift").count(),0,"Staff no registra su propia salida");
  assert.equal(await page.locator("#j-break-start").count(),0,"Staff no registra descansos oficiales");
  assert.ok((await page.locator("#j-active").innerText()).includes("tu Supervisor o Coordinador registrará entrada"));
  assert.equal(await page.evaluate(()=>window.__mockRecords.clock.size),0,"La pantalla no escribe asistencia por cuenta propia");
  assert.deepEqual(errors,[],"Interfaz no debe lanzar errores de JavaScript");
  console.log("OK: Staff no marca asistencia propia; el responsable registra mediante QR/lista. NO producción.");
}finally{await c.close();await browser.close()}
