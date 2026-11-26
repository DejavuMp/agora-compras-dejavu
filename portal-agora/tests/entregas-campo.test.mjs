import test from "node:test";
import assert from "node:assert/strict";
import {checklistKey,receiptDocument} from "../campo/entregas.mjs";

test("Campo conserva el progreso por combinación de protocolo y folio",()=>{
 assert.equal(checklistKey("hot-cruji-bravo","   "),"");
 assert.equal(checklistKey("hot-cruji-bravo"," aa-1 "),checklistKey("hot-cruji-bravo","AA-1"));
 assert.notEqual(checklistKey("hot-cruji-bravo","AA-1"),checklistKey("hot-cruji-bravo","AA-2"));
 assert.notEqual(checklistKey("hot-cruji-bravo","AA-1"),checklistKey("apertura-kfc","AA-1"));
});

test("Acuse provisional conserva entregas parciales y cantidades cero",()=>{
 const sample={protocol:"apertura-kfc",folio:"JOR-DEMO",destination:"Destino de prueba",date:"2026-11-26",notes:"",
  rows:[{name:"Cartel",planned:"2",received:"0"},{name:"Carpeta",planned:"3",received:"3"}]};
 const result=receiptDocument(sample);
 assert.match(result,/Acuse provisional/);
 assert.match(result,/Cartel · Programado: 2 · Recibido: 0 · Diferencia: -2/);
 assert.match(result,/Carpeta · Programado: 3 · Recibido: 3\n/);
 assert.match(result,/Pendiente de cotejo/);
 assert.throws(()=>receiptDocument({...sample,rows:[{...sample.rows[0],received:""}]}),/cantidades/);
});
