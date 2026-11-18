/** Nuevo usuario verifica su identidad y solicita aprobación antes de ver jornadas.
 * Toda la prueba es local con Firestore/Auth falsos. No modifica producción.
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const authJS=[
 "export class GoogleAuthProvider {}",
 "export function onAuthStateChanged(_auth,cb){queueMicrotask(()=>cb({uid:'unapproved-qa',email:'unapproved@example.invalid',displayName:'Persona de prueba',emailVerified:true}));return ()=>{}}",
 "export async function signInWithPopup(){}",
 "export async function signInWithRedirect(){}",
 "export async function signInWithEmailAndPassword(){}",
 "export async function sendPasswordResetEmail(){}",
 "export async function sendEmailVerification(){}",
 "export async function signOut(){}"
].join("\n");
const dbJS=[
 "let existing=false;",
 "window.__requestCalls=0;window.__agendaReads=0;",
 "export function doc(_db,...parts){return parts.join('/');}",
 "export async function getDocFromServer(ref){",
 " if(ref==='agora_users/unapproved-qa'||ref==='agora_ops_members/unapproved-qa')return {exists:()=>false,data:()=>({})};",
 " if(ref==='agora_ops_access_requests/unapproved-qa')return {exists:()=>existing,data:()=>existing?{status:'pendiente'}:{}};",
 " if(ref==='agora_ops_control/schedule'){window.__agendaReads++;throw Error('No debería consultar agenda');}",
 " throw Error('Referencia inesperada: '+ref);",
 "}",
 "export function onSnapshot(ref,_opts,cb){",
 " if(ref==='agora_ops_members/unapproved-qa'){queueMicrotask(()=>cb({metadata:{fromCache:false},data:()=>undefined}));return ()=>{}}",
 " throw Error('El usuario no autorizado intentó escuchar: '+ref);",
 "}",
 "export function serverTimestamp(){return new Date()}",
 "export async function setDoc(ref,data){if(ref!=='agora_ops_access_requests/unapproved-qa'||existing)throw Error('Solicitud duplicada o no permitida');",
 "existing=true;window.__requestCalls++;window.__requestData=data;}"
].join("\n");
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext();
const headers={"content-type":"application/javascript","access-control-allow-origin":"*"};
const errors=[];
try{
 await ctx.route("**/firebase-init.js",r=>r.fulfill({status:200,headers,body:"window.AGORA_FIREBASE={auth:{},firestore:{}};"}));
 await ctx.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js",r=>r.fulfill({status:200,headers,body:authJS}));
 await ctx.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js",r=>r.fulfill({status:200,headers,body:dbJS}));
 const page=await ctx.newPage();
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:8765/operaciones/visor.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#viewer-request-state")?.textContent.includes("Puedes solicitarla ahora"));
 assert.ok(await page.locator("#viewer-request").isVisible());
 assert.ok(await page.locator("#viewer-agenda").isHidden());
 assert.ok(await page.locator("#viewer-staff").isHidden());
 await page.locator("#viewer-request-submit").click();
 await page.waitForFunction(()=>document.querySelector("#viewer-request-state")?.textContent.includes("Solicitud enviada"));
 const values=await page.evaluate(()=>({n:window.__requestCalls,body:window.__requestData,agenda:window.__agendaReads}));
 assert.equal(values.n,1,"Solo una solicitud por cuenta");
 assert.equal(values.body.status,"pendiente");
 assert.equal(values.body.uid,"unapproved-qa");
 assert.equal(values.body.email,"unapproved@example.invalid");
 assert.equal(values.agenda,0,"No se leen datos administrativos antes de la autorización");
 assert.ok(await page.locator("#viewer-request-submit").isDisabled());
 assert.deepEqual(errors,[],"Sin errores de navegador");
 console.log("OK: primer acceso pide autorización desde visor, no abre agenda ni jornadas de staff.");
}finally{
 await ctx.close();await browser.close();
}
