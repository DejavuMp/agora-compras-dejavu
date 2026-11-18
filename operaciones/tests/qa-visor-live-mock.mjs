/** Visor: dos navegadores con emulación de respuestas Auth/Firestore.
 * Este test NO se conecta a Firebase real ni demuestra permisos de producción.
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";

const base={
  sites:[{id:"s1",name:"Sucursal ficticia QA",address:"Ciudad de México, México"}],
  events:[{
    id:"ev1",seriesId:"serieqa",dayIndex:1,dayCount:3,
    title:"Volanteo QA 3 días",type:"Volanteo",status:"confirmado",
    project:"Proyecto ficticio",campaign:"Campaña QA",siteId:"s1",
    origin:"Cuauhtémoc, Ciudad de México, México",
    start:"2026-12-01T10:00",end:"2026-12-01T16:00",
    before:30,after:30,travelMin:40,routeBufferMin:15,
    staff:[{personId:"persona-privada",start:"2026-12-01T09:30",end:"2026-12-01T16:30",payroll:"NOMINA_OCULTA"}],
    vehicles:["v1"],approvedAmount:98765
  }]
};
const authModule=[
 "export class GoogleAuthProvider {}",
 "export function onAuthStateChanged(_auth,ready){queueMicrotask(()=>ready({uid:'coord-qa',emailVerified:true}));return ()=>{}}",
 "export async function signInWithPopup(){}",
 "export async function signInWithRedirect(){}",
 "export async function signInWithEmailAndPassword(){}",
 "export async function signOut(){}"
].join("\n");
const dbModule=[
 "const board="+JSON.stringify(base)+";",
 "let listener=null,revision=1;",
 "const snapshot=()=>({metadata:{fromCache:false},data:()=>({revision,payload:board}),exists:()=>true});",
 "export function doc(_db,...args){return args.join('/');}",
 "export async function getDocFromServer(ref){if(ref==='agora_users/coord-qa')return {exists:()=>true,data:()=>({active:true,role:'coordinador'})};return snapshot();}",
 "export function onSnapshot(_doc,_settings,callback){listener=callback;queueMicrotask(()=>callback(snapshot()));return ()=>{listener=null}}",
 "window.__qaEmitTitle=(title)=>{board.events[0].title=title;revision++;if(listener)listener(snapshot())};"
].join("\n");
async function mocked(ctx){
  const jsHeaders={"content-type":"application/javascript","access-control-allow-origin":"*"};
  await ctx.route("**/firebase-init.js",r=>r.fulfill({status:200,headers:jsHeaders,body:"window.AGORA_FIREBASE={auth:{},firestore:{}};"}));
  await ctx.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js",r=>r.fulfill({status:200,headers:jsHeaders,body:authModule}));
  await ctx.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js",r=>r.fulfill({status:200,headers:jsHeaders,body:dbModule}));
}
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const contexts=[await browser.newContext(),await browser.newContext()];
const errors=[];
try{
  await Promise.all(contexts.map(mocked));
  const pages=await Promise.all(contexts.map(async c=>{
    const page=await c.newPage({viewport:{width:1366,height:900}});
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:8765/operaciones/visor.html",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.querySelector("#message")?.textContent.includes("Firebase sincronizado"));
    await page.locator("#focusdate").fill("2026-12-01");
    return page;
  }));
  for(const page of pages){
    assert.ok((await page.locator("#week").innerText()).includes("Volanteo QA 3 días"));
    assert.ok((await page.locator("#week").innerText()).includes("Día 1 de 3"));
    const body=await page.locator("body").innerText();
    assert.ok(!body.includes("NOMINA_OCULTA"));
    assert.ok(!body.includes("98765"));
    assert.ok(!body.includes("persona-privada"));
    assert.ok(await page.locator("a[href*='google.com/maps/dir']").count());
    await page.locator("#show-schedule").click();
    await page.locator("#days-control").selectOption("14");
    assert.equal(await page.locator(".schedule-row").count(),1);
    await page.locator("#days-control").selectOption("30");
    assert.equal(await page.locator(".schedule-row").count(),1);
    await page.locator("#days-control").selectOption("7");
    assert.equal(await page.locator(".schedule-row").count(),1);
  }
  await Promise.all(pages.map(p=>p.evaluate(()=>window.__qaEmitTitle("Volanteo QA ACTUALIZADO"))));
  for(const page of pages){
    await page.waitForFunction(()=>document.querySelector("#week")?.textContent.includes("Volanteo QA ACTUALIZADO"));
    assert.ok(!(await page.locator("#week").innerText()).includes("Volanteo QA 3 días"));
  }
  assert.deepEqual(errors,[],"Sin fallos de JavaScript en los dos navegadores");
  console.log("OK: visor proyecta dos sesiones, cambios ficticios en memoria sin recargar. NO es una prueba Firebase real.");
}finally{await Promise.all(contexts.map(c=>c.close()));await browser.close()}
