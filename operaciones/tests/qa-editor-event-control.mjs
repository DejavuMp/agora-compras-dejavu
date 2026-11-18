import assert from "node:assert/strict";
import {linkedStaff,eventPolicyEntries} from "../editor-jornadas-control.mjs";
const people=[{id:"p1",name:"Ana",authUid:"uid-ana",active:true},
 {id:"p2",name:"José",authUid:"uid-jose",active:true},
 {id:"p3",name:"Sin cuenta",active:true}];
const event={id:"evento-qa",start:"2026-11-20T10:00:00",end:"2026-11-20T16:00:00",
 staff:[{personId:"p1",start:"2026-11-20T09:30:00",end:"2026-11-20T16:30:00"},
 {personId:"p2",start:"2026-11-20T09:30:00",end:"2026-11-20T16:30:00"},
 {personId:"p3",start:"2026-11-20T09:30:00",end:"2026-11-20T16:30:00"}]};
const roster=linkedStaff(event,people);
assert.equal(roster.linked.length,2);
assert.deepEqual(roster.missing,["Sin cuenta"]);
const data=eventPolicyEntries(event,people,true,"horas","coord",()=>new Date("2026-11-18T12:00:00"));
assert.equal(data.items.length,2);
assert.equal(data.items[0].id,"uid-ana_evento-qa");
assert.equal(data.items[1].data.enabled,true);
assert.equal(data.items[0].data.mode,"horas");
assert.equal(data.items[0].data.maxMinutes,420);
assert.equal(data.items[0].data.personId,"p1");
const disabled=eventPolicyEntries(event,people,false,"horario","coord",()=>new Date());
assert.ok(disabled.items.every(p=>p.data.enabled===false));
assert.throws(()=>eventPolicyEntries({...event,staff:[{personId:"p3"}]},people,true,"horario","coord",()=>new Date()),/vincula/i);
assert.throws(()=>linkedStaff({...event,staff:[event.staff[0],event.staff[0]]},people),/duplicada/i);
assert.throws(()=>eventPolicyEntries(event,people,true,"otra","coord",()=>new Date()),/Modalidad/);
console.log("OK control del evento: activación grupal con UID, cálculo por turno, cuenta faltante y validaciones.");
