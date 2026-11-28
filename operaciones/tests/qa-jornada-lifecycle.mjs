import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {duplicateJourneyDraft,journeyState,moveJourneys} from "../ops-jornada-lifecycle.mjs";

const event = {id:"qa-jornada",title:"QA Jornadas",status:"confirmado",project:"QA",
  start:"2026-11-28T10:00",end:"2026-11-28T11:00",seriesId:"QA-original",
  staff:[{personId:"qa-staff",start:"2026-11-28T10:00",end:"2026-11-28T11:00"}],
  evidence:["QA-evidencia"],payments:["QA-pago"]};
const actor = {isAdmin:true,actor:"qa-admin",reason:"Prueba de ciclo administrativo",at:"2026-11-28T16:00:00Z"};

test("archiva, pasa a papelera y restaura registrando cada movimiento", () => {
  const [archived] = moveJourneys([event],[event.id],"archivada",actor);
  assert.equal(journeyState(archived),"archivada");
  const [removed] = moveJourneys([archived],[event.id],"papelera",actor);
  assert.equal(journeyState(removed),"papelera");
  const [restored] = moveJourneys([removed],[event.id],"restaurada",actor);
  assert.equal(restored.status,"borrador");
  assert.equal(restored.id,event.id);
  assert.equal(restored.payments,event.payments);
  assert.equal(restored.evidence,event.evidence);
  assert.deepEqual(restored.staff,event.staff);
  assert.deepEqual(restored.journeyHistory.map(item=>item.state),["archivada","papelera","restaurada"]);
});

test("Coordinación cancela con motivo y Administración recupera", () => {
  const coordinator = {...actor,isAdmin:false,actor:"qa-coordinacion"};
  assert.throws(()=>moveJourneys([event],[event.id],"papelera",coordinator),/Administración/);
  assert.throws(()=>moveJourneys([event],[event.id],"archivada",coordinator),/Administración/);
  assert.throws(()=>moveJourneys([event],[event.id],"cancelada",{...coordinator,reason:"  "}),/motivo/);
  const [cancelled] = moveJourneys([event],[event.id],"cancelada",coordinator);
  assert.equal(journeyState(cancelled),"cancelada");
  assert.equal(cancelled.journeyHistory[0].byUid,"qa-coordinacion");
  assert.throws(()=>moveJourneys([cancelled],[event.id],"restaurada",coordinator),/Administración/);
});

test("la selección agrupada se valida completa antes de modificar", () => {
  const another = {...event,id:"qa-otra"};
  const updated = moveJourneys([event,another],[event.id,another.id],"papelera",actor);
  assert.equal(updated.length,2);
  assert.ok(updated.every(item=>journeyState(item)==="papelera"));
  assert.throws(()=>moveJourneys([event,updated[1]],[event.id,another.id],"archivada",actor),/estado actual/);
  assert.equal(event.status,"confirmado");
  assert.throws(()=>moveJourneys([event],[event.id,"no-existe"],"papelera",actor),/selección cambió/);
});

test("duplica una sola jornada como borrador y conserva juntas las horas planificadas", () => {
  const draft = duplicateJourneyDraft(event);
  assert.equal(draft.status,"borrador");
  assert.equal(draft.title,"QA Jornadas (copia)");
  assert.deepEqual(draft.staff,event.staff);
  for (const field of ["id","seriesId","evidence","payments","journeyHistory"]) assert.equal(draft[field],undefined);
});

test("el editor enlaza la papelera y no invoca borrado físico de jornadas", () => {
  const html = readFileSync("operaciones/index.html","utf8");
  for (const [,source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(source);
  assert.ok(html.includes('id="journey-lifecycle-form"'));
  assert.ok(html.includes('Gestionar jornada'));
  assert.ok(!html.includes("deleteItem('event',id)"));
});
