/** E2E: editor online simulado, sin cuentas ni Firestore de producción. */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:1320,height:850},timezoneId:"America/Mexico_City"});
const errors=[],headers={"content-type":"application/javascript","access-control-allow-origin":"*"};
const auth=[
 "export class GoogleAuthProvider{}",
 "export function onAuthStateChanged(_auth,cb){queueMicrotask(()=>cb({uid:'coord-qa',email:'coord@example.invalid',emailVerified:true}));return ()=>{}}",
 "export async function signInWithPopup(){}",
 "export async function signInWithRedirect(){}",
 "export async function signOut(){}"
].join("\n");
const db=[
 "const pad=n=>String(n).padStart(2,'0');",
 "const dt=new Date(),day=n=>{const d=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};",
 "const event={id:'event-qa',title:'Volanteo QA',type:'Volanteo',status:'confirmado',venueName:'Sucursal QA',campaign:'Campaña QA',",
 " start:day(1)+'T10:00',end:day(1)+'T16:00',staff:[{personId:'ana',start:day(1)+'T09:30',end:day(1)+'T16:30'}],vehicles:[]};",
 "const people=[{id:'ana',name:'Ana QA',active:true,authUid:'ana-uid',role:'Promotora',hourRate:90}];",
 "const board={people,vehicles:[],events:[event],blocks:[],sites:[],campaigns:[],settings:{dailyLimit:8},audit:[]};",
 "const schedule={revision:2,payload:board};",
 "window.__controlWrites=[];",
 "export function doc(_db,...parts){return parts.join('/');}",
 "export function collection(_db,p){return p}",
 "export function query(col){return col}",
 "export function where(){return {}}",
 "export function serverTimestamp(){return new Date()}",
 "const snapshot=ref=>ref==='agora_ops_control/schedule'?{exists:()=>true,data:()=>schedule,metadata:{fromCache:false}}:",
 " {metadata:{fromCache:false},docs:[]};",
 "export function onSnapshot(ref,_opts,cb){queueMicrotask(()=>cb(snapshot(ref)));return ()=>{}}",
 "export async function getDocFromServer(ref){",
 " if(ref==='agora_users/coord-qa')return {exists:()=>true,data:()=>({active:true,role:'coordinador'})};",
 " if(ref==='agora_ops_members/coord-qa')return {exists:()=>false,data:()=>({})};",
 " if(ref==='agora_ops_control/schedule')return snapshot(ref);",
 " throw Error('Ref inesperada '+ref)}",
 "export async function getDoc(){return {exists:()=>false}}",
 "export async function setDoc(){}",
 "export async function runTransaction(_db,callback){",
 " const tx={get:async ref=>({exists:()=>false,data:()=>({})}),",
 " set:(ref,value)=>window.__controlWrites.push({ref,value}),",
 " update:(ref,value)=>window.__controlWrites.push({ref,value})};",
 " await callback(tx);return true;}"
].join("\n");
try{
 await context.route("**/firebase-init.js",r=>r.fulfill({status:200,headers,body:"window.AGORA_FIREBASE={auth:{},firestore:{}};"}));
 await context.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js",r=>r.fulfill({status:200,headers,body:auth}));
 await context.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js",r=>r.fulfill({status:200,headers,body:db}));
 const page=await context.newPage();page.on("pageerror",ex=>errors.push(ex.message));
 await page.goto("http://127.0.0.1:8765/operaciones/",{waitUntil:"domcontentloaded"});
 await page.locator("#app [data-action='board-view-cronograma']").waitFor({state:"visible",timeout:12000});
 await page.locator("[data-action='board-view-cronograma']").first().click();
 await page.locator(".ops-matrix").waitFor({state:"visible"});
 assert.equal(await page.locator(".ops-matrix-event.confirmed").count(),1,"Matriz muestra actividad confirmada en fecha correcta");
 assert.ok((await page.locator(".ops-matrix").innerText()).includes("Sucursal QA"));
 assert.ok((await page.locator(".ops-matrix").innerText()).includes("Volanteo QA"));
 assert.ok((await page.locator(".ops-matrix").innerText()).includes("Confirmada"));
 await page.locator("[data-action='ops-jornadas-control']").first().click();
 await page.locator("#event-control-overlay").waitFor({state:"visible"});
 await page.locator(".event-control-card select").selectOption("horas");
 await page.locator('[data-event-control="on"][data-id="event-qa"]').click();
 await page.waitForFunction(()=>window.__controlWrites.length===1);
 const written=await page.evaluate(()=>window.__controlWrites[0]);
 assert.equal(written.ref,"agora_ops_shift_access/ana-uid_event-qa");
 assert.equal(written.value.enabled,true);
 assert.equal(written.value.mode,"horas");
 assert.equal(written.value.maxMinutes,420,"Turno de 7 horas con margen de 30 minutos");
 assert.equal(written.value.personId,"ana");
 await page.locator("[data-control-close]").click();
 await page.locator('[data-action="new-event"]').first().click();
 await page.locator("#event-form").waitFor({state:"visible"});
 assert.equal(await page.locator("#ops-people-suggestions option").count(),1);
 assert.equal(await page.locator("#ops-people-suggestions option").first().getAttribute("value"),"Ana QA");
 assert.ok(await page.locator("#ev-work-mode").isVisible());
 assert.ok(await page.locator("#ops-planned-hours").isVisible());
 await page.locator("#ev-work-mode").selectOption("jornada_campo");
 assert.equal(await page.locator("#ev-work-mode").inputValue(),"jornada_campo");
 await page.locator('[data-person-name]').first().fill("Ana QAA");
 await page.locator("#ev-title").fill("Prueba de nombre mal escrito");
 await page.locator('#event-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.body.innerText.includes("Selecciona un nombre de las sugerencias"),{timeout:5000});
 assert.equal(await page.locator("#event-form").count(),1,"No se aceptó crear otra persona por un error de nombre");
 assert.deepEqual(errors,[],"Sin errores de navegador");
 console.log("OK Matriz y control por evento dentro del editor; autocompletar evita nombres mal escritos.");
}finally{await context.close();await browser.close()}
