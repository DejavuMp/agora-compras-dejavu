import assert from "node:assert/strict";
import {JOB_NAMES,csvCell,formatAgoraId,projectTodayAssignments,publicCredential,validateBlockReason} from "../domain.mjs";

assert.equal(JOB_NAMES.length, 8);
assert.equal(formatAgoraId(2026, 1), "DJV-2026-001");
assert.equal(formatAgoraId(2026, 1000), "DJV-2026-1000");
assert.throws(() => formatAgoraId(2026, 0));
assert.equal(csvCell("=IMPORTXML(A1)"), '"\'=IMPORTXML(A1)"');
assert.equal(validateBlockReason("Fin de turno"), "Fin de turno");
assert.throws(() => validateBlockReason("no"));

const events = [{id:"e1",title:"Apertura",project:"KFC",siteName:"Sucursal Centro",start:"2026-11-18T09:00:00-06:00",end:"2026-11-18T15:00:00-06:00",staff:[
  {personId:"p1",role:"Staff",activity:"Registro",assignedByName:"Coordinación",instructions:"Llegar 15 minutos antes",start:"2026-11-18T09:00:00-06:00",end:"2026-11-18T15:00:00-06:00"},
  {personId:"p2",role:"Runner",activity:"Traslados"}
]}];
const projected = projectTodayAssignments({personId:"p1",events}, new Date("2026-11-18T12:00:00-06:00"));
assert.equal(projected.length, 1);
assert.equal(projected[0].activity, "Registro");
assert.ok(!JSON.stringify(projected).includes("p2"));
assert.equal(projectTodayAssignments({personId:"p1",events}, new Date("2026-11-19T12:00:00-06:00")).length, 0);

assert.deepEqual(publicCredential({agoraId:"DJV-2026-001",displayName:"Persona Demo",jobTitle:"Staff",credentialActive:false,blockReason:"Fin de turno"}), {
  agoraId:"DJV-2026-001",displayName:"Persona Demo",jobTitle:"Staff",active:false,status:"bloqueada",blockReason:"Fin de turno"
});
console.log("OK identidad: ocho cargos, ID, CSV seguro, credencial y asignaciones propias.");
