/** Reproduce el enlace desde Accesos, sin Firebase real ni datos privados. */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext();
const errors=[];
const headers={"content-type":"application/javascript","access-control-allow-origin":"*"};
const fakeAuth=[
 "export class GoogleAuthProvider {}",
 "export function onAuthStateChanged(_auth,cb){queueMicrotask(()=>cb({uid:'coord-qa',email:'coord@example.invalid',emailVerified:true,displayName:'Coordinadora de prueba'}));return ()=>{}}",
 "export async function signInWithPopup(){}",
 "export async function signInWithRedirect(){}",
 "export async function signOut(){}"
].join("\n");
const fakeDb=[
 "const isNew=location.search.includes('newlink');",
 "const request={uid:'staff-qa',name:'Persona de prueba',email:'solicitante@example.invalid',status:'pendiente'};",
 "const board={people:isNew?[]:[{id:'person-1',name:'Persona de prueba',email:request.email,hourRate:105,dayRate:600,active:true}],vehicles:[],events:[],blocks:[],sites:[],campaigns:[],settings:{dailyLimit:8},audit:[]};",
 "const schedule={revision:2,payload:board};",
 "window.__writes=[];",
 "export function doc(_db,...p){return p.join('/');}",
 "export function collection(_db,p){return p}",
 "export function query(coll){return coll}",
 "export function where(){return {}}",
 "export function serverTimestamp(){return new Date()}",
 "const snap=ref=>ref==='agora_ops_control/schedule'?{metadata:{fromCache:false},exists:()=>true,data:()=>schedule}:",
 "ref==='agora_ops_access_requests'?{metadata:{fromCache:false},docs:[{id:request.uid,data:()=>request}]}:",
 "{metadata:{fromCache:false},docs:[]};",
 "export function onSnapshot(ref,_opts,cb){queueMicrotask(()=>cb(snap(ref)));return ()=>{}}",
 "export async function getDocFromServer(ref){",
 " if(ref==='agora_users/coord-qa')return {exists:()=>true,data:()=>({active:true,role:'coordinador'})};",
 " if(ref==='agora_ops_members/coord-qa')return {exists:()=>false,data:()=>({})};",
 " if(ref==='agora_ops_control/schedule')return snap(ref);",
 " throw Error('Unexpected getDocFromServer '+ref);}",
 "export async function getDoc(ref){return ref==='agora_ops_access_requests/staff-qa'?{exists:()=>true,data:()=>request}:{exists:()=>false}}",
 "export async function setDoc(){}",
 "export async function runTransaction(_db,callback){",
 " const tx={get:async ref=>ref==='agora_ops_control/schedule'?snap(ref):",
 " ref==='agora_ops_access_requests/staff-qa'?{exists:()=>true,data:()=>request}:",
 " ref==='agora_ops_members/staff-qa'?{exists:()=>false,data:()=>({})}:",
 " Promise.reject(Error('Unexpected tx.get '+ref)),",
 " set:(ref,value)=>window.__writes.push({ref,value}),",
 " update:(ref,value)=>window.__writes.push({ref,value})};",
 " await callback(tx);return true;}"
].join("\n");

try{
 await ctx.route("**/firebase-init.js",r=>r.fulfill({status:200,headers,body:"window.AGORA_FIREBASE={auth:{},firestore:{}};"}));
 await ctx.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js",r=>r.fulfill({status:200,headers,body:fakeAuth}));
 await ctx.route("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js",r=>r.fulfill({status:200,headers,body:fakeDb}));
 for(const createNew of [false,true]){
  const page=await ctx.newPage();
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("http://127.0.0.1:8765/operaciones/"+(createNew?"?newlink=1":""),{waitUntil:"domcontentloaded"});
  await page.locator("#ops-access").waitFor({state:"visible",timeout:10000});
  await page.locator("#ops-access").click();
  await page.locator('[data-approve="staff-qa"]').click();
  await page.locator("#ops-link-person").waitFor();
  assert.ok(await page.locator("#ops-link-form").isVisible(),"El botón muestra selector, no ventana prompt");
  if(createNew){
   await page.locator("#ops-link-person").selectOption("__new__");
   await page.locator("#ops-link-name").fill("Nueva persona de prueba");
  }else await page.locator("#ops-link-person").selectOption("person-1");
  await page.locator("#ops-link-confirm").check();
  await page.locator("#ops-link-save").click();
  await page.waitForFunction(()=>window.__writes?.length===4,{timeout:10000});
  const writes=await page.evaluate(()=>window.__writes);
  assert.deepEqual(writes.map(x=>x.ref),[
   "agora_ops_control/schedule","agora_ops_members/staff-qa",
   "agora_ops_staff/staff-qa","agora_ops_access_requests/staff-qa"
  ]);
  const linked=writes[1].value;
  const people=writes[0].value.payload.people;
  assert.equal(linked.role,"staff");
  assert.equal(linked.active,true);
  assert.equal(people.find(p=>p.id===linked.personId).authUid,"staff-qa");
  assert.equal(writes[3].value.status,"aprobada");
  assert.equal(writes[2].value.personId,linked.personId);
  assert.ok(!("hourRate" in writes[2].value.person),"Los datos de nómina no se publican a staff");
  if(createNew)assert.equal(people[0].name,"Nueva persona de prueba");
  else assert.equal(people[0].hourRate,105,"La ficha actual conserva tarifas internas");
  await page.close();
 }
 assert.deepEqual(errors,[],"No deben ocurrir errores de interfaz");
 console.log("OK Accesos: selección existente, registro de nueva persona, aprobación y privacidad (Firebase simulado).");
}finally{await ctx.close();await browser.close()}
