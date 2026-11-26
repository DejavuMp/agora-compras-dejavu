import assert from "node:assert/strict";
import {test} from "node:test";
import {assignmentPrefill} from "../../operaciones/assignment-prefill.mjs";

test("Operaciones prepara un borrador nocturno con los datos operativos de una solicitud pendiente",()=>{
 const draft=assignmentPrefill({status:"pendiente",project:"Montaje",site:"Sucursal",
  date:"2026-11-26",start:"23:30",end:"01:15",contact:"privado",evidenceImage:"privada"});
 assert.deepEqual(draft,{title:"Montaje",project:"Montaje",venueName:"Sucursal",
  start:"2026-11-26T23:30",end:"2026-11-27T01:15",status:"borrador"});
 assert.throws(()=>assignmentPrefill({status:"confirmada"}),/revisada/);
 assert.throws(()=>assignmentPrefill({status:"pendiente",date:"2026-02-30",start:"10:00",end:"12:00"}),/horario/);
});
