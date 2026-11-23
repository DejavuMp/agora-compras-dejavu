import test from "node:test";
import assert from "node:assert/strict";
import {
  ownJornadas,coordinationJornadas,operationTotals,
  validateAssignmentDraft,assignmentDraftText,REQUEST_CHANNELS
} from "../roles-operacion.mjs";

const at="2026-12-04T10:00:00-06:00";
const work={
  personId:"p-01",
  events:[
    {id:"j1",title:"Jornada de oficina",project:"Interno",
      venueName:"Oficina Dejavú",status:"confirmado",
      start:"2026-12-04T09:00:00-06:00",end:"2026-12-04T18:00:00-06:00",
      staff:[{personId:"p-01",assignedByName:"Coordinador",
        activities:[{name:"Cotizar materiales",status:"terminada"},
          {name:"Revisar inventario",status:"en curso"},
          {name:"Coordinar staff",status:"pendiente"}]}]},
    {id:"other",title:"Jornada ajena",status:"confirmado",
      start:"2026-12-04T09:00:00-06:00",end:"2026-12-04T18:00:00-06:00",
      staff:[{personId:"p-99",activity:"No visible"}]},
    {id:"cancel",title:"Jornada cancelada",status:"cancelado",
      start:"2026-12-04T09:00:00-06:00",end:"2026-12-04T18:00:00-06:00",
      staff:[{personId:"p-01"}]}
  ],
  payroll:{bank:"0000",salary:25000}
};
const schedule={payload:{events:[
  {id:"j1",title:"Jornada de oficina",project:"Interno",
   venueName:"Oficina Dejavú",status:"confirmado",
   start:"2026-12-04T09:00:00-06:00",end:"2026-12-04T18:00:00-06:00",
   staff:[{personId:"p-01"},{personId:"p-02"}],
   estimatedTotal:2300,bankDetails:{clabe:"000000000000000000"},
   activities:[{name:"Cotizar"},{name:"Inventario"}]}
]}};
const draft={
  requester:"KFC cliente",channel:"WhatsApp",contact:"Persona de contacto",
  requestedAt:"2026-11-23T10:15",
  project:"Jornada interna",site:"Oficina Dejavú",
  date:"2026-12-04",start:"09:00",end:"18:00",
  headcount:3,description:"Trabajo de oficina",capturedBy:"Coordinación",
  activities:["Cotizar materiales","Revisar inventario","Coordinar personal"],
  evidenceNote:"Captura pendiente de guardar en almacén seguro"
};

test("staff ve solo la jornada propia y múltiples actividades de la misma jornada",()=>{
 const result=ownJornadas(work,new Date(at));
 assert.equal(result.length,1);
 assert.equal(result[0].title,"Jornada de oficina");
 assert.equal(result[0].activities.length,3);
 assert.equal(result[0].responsible,"Coordinador");
 assert.ok(!JSON.stringify(result).includes("Jornada ajena"));
 assert.ok(!JSON.stringify(result).includes("25000"));
 assert.ok(!JSON.stringify(result).includes("bank"));
});

test("coordinación solo ve métricas y campos operativos sin datos bancarios",()=>{
 const result=coordinationJornadas(schedule,new Date(at));
 assert.equal(result.length,1);
 assert.equal(result[0].staffCount,2);
 assert.equal(result[0].activitiesCount,2);
 assert.equal(operationTotals(result,new Date(at)).today,1);
 assert.ok(!JSON.stringify(result).includes("estimatedTotal"));
 assert.ok(!JSON.stringify(result).includes("clabe"));
 assert.ok(!JSON.stringify(result).includes("bankDetails"));
});

test("borrador incluye solicitante, medio y múltiples actividades sin registrar ni autorizar",()=>{
 const result=assignmentDraftText(draft);
 assert.match(result,/NO REGISTRADO/);
 assert.match(result,/KFC cliente/);
 assert.match(result,/WhatsApp/);
 assert.match(result,/Cotizar materiales/);
 assert.match(result,/Revisar inventario/);
 assert.match(result,/Coordinar personal/);
 assert.match(result,/No hay autorización, asignación ni archivo guardado en Firebase/);
 assert.doesNotMatch(result,/traslado|GPS|tiempo de traslado/i);
});

test("no se impone un máximo arbitrario de actividades dentro de la jornada",()=>{
 const values={...draft,activities:Array.from({length:95},(_,i)=>"Actividad "+String(i+1))};
 const valid=validateAssignmentDraft(values);
 assert.equal(valid.activities.length,95);
 assert.match(assignmentDraftText(values),/Actividad 95/);
});
test("se exige el origen de la solicitud",()=>{
 for(const key of ["requester","channel","project","site"]){
  assert.throws(()=>validateAssignmentDraft({...draft,[key]:""}));
 }
 assert.deepEqual(REQUEST_CHANNELS,["WhatsApp","Llamada","Correo","Presencial","Otro"]);
});
