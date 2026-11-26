import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {protocols,protocolDraft,protocolDocument} from "../campo/protocolos.mjs";
test("los dos protocolos preparan borradores y checklists sin inventar sede, horario ni cantidad",()=>{
 for(const id of Object.keys(protocols)){
  const draft=protocolDraft(id);
  assert.equal(draft.status,"borrador");
  assert.equal(draft.start,undefined);
  assert.equal(draft.venueName,undefined);
  assert.match(draft.notes,/Sucursal y fecha: por confirmar/);
  assert.match(protocolDocument(id,new Set(["materiales"])),/\[x\] Confirmar inventario/);
 }
 assert.throws(()=>protocolDraft("otro"),/No se encontró/);
});
test("el service worker solo intercepta los archivos estáticos de Campo",async()=>{
 const source=await readFile(new URL("../campo/sw.js",import.meta.url),"utf8");
 const handlers={},site="https://example.invalid/portal-agora/campo/";
 runInNewContext(source,{URL,Set,self:{location:{href:site+"sw.js"},addEventListener:(key,fn)=>handlers[key]=fn},
  fetch:async()=>{throw Error("offline");},caches:{match:async r=>"offline:"+r.url}});
 const responses=[];
 for(const url of [site,site+"campo.mjs","https://example.invalid/portal-agora/staff/","https://firestore.googleapis.com/"]){
  handlers.fetch({request:{method:"GET",url},respondWith:r=>responses.push(r)});
 }
 assert.deepEqual(await Promise.all(responses),["offline:"+site,"offline:"+site+"campo.mjs"]);
});
