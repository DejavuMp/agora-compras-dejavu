import assert from "node:assert/strict";
import {
  localDay,atLocalDay,myEvents,filteredEvents,shiftOf,eventStart,payLabel,
  paymentFilter,netHours,reportFromFinishedClock
} from "../staff-dashboard.mjs";

const day="2026-11-18";
const [morning,evening]=["10:00","16:00"].map(h=>day+"T"+h+":00");
const events=[
 {id:"one",title:"Volanteo día 1",type:"volanteo",start:morning,end:evening,
  dayIndex:1,dayCount:3,staff:[{personId:"p1",start:morning,end:evening}]},
 {id:"two",title:"Volanteo día 2",start:"2026-11-19T10:00:00",end:"2026-11-19T16:00:00",
  dayIndex:2,dayCount:3,staff:[{personId:"p1",start:"2026-11-19T09:30:00",end:"2026-11-19T16:30:00"}]},
 {id:"cancel",status:"cancelado",start:morning,end:evening,staff:[{personId:"p1",start:morning,end:evening}]},
];
assert.equal(localDay(atLocalDay(day)),day);
assert.equal(myEvents(events,"p1").length,2);
assert.equal(filteredEvents(events,"p1",day,1).length,1,"Vista por día");
assert.equal(filteredEvents(events,"p1",day,7).length,2,"Cronograma 7 días");
assert.equal(filteredEvents(events,"p1",day,14).length,2,"Cronograma 14 días");
assert.equal(filteredEvents(events,"p1",day,30).length,2,"Cronograma 30 días");
assert.equal(filteredEvents(events,"p1","2026-11-19",1)[0].id,"two");
assert.ok(Number.isNaN(atLocalDay("2026-02-30")),"Fechas inválidas no generan filtros");
assert.equal(shiftOf(events[1],"p1").start,"2026-11-19T09:30:00");
assert.equal(eventStart(events[1],"p1"),"2026-11-19T09:30:00");
const done={status:"finalizada",startedAt:new Date(morning),endedAt:new Date(evening),endNote:"Se completó el volanteo"};
const draft=reportFromFinishedClock({clock:done,event:events[0],uid:"uid-qa",personId:"p1",id:"j_uid-qa_one"});
assert.equal(draft.paymentStatus,"capturado");
assert.equal(draft.revision,1);
assert.equal(draft.eventId,"one");
assert.equal(draft.ownerUid,"uid-qa");
assert.equal(netHours(draft),6);
assert.ok(!("requestedAmount" in draft)&&!("approvedAmount" in draft),"Nunca calcular importes de staff");
assert.throws(()=>reportFromFinishedClock({clock:{...done,status:"en_curso"},event:events[0],uid:"uid-qa",personId:"p1",id:"bad"}),/Termina/);
assert.equal(paymentFilter("capturado","pendientes"),true);
assert.equal(paymentFilter("solicitado","revision"),true);
assert.equal(paymentFilter("pagado","pagados"),true);
assert.equal(paymentFilter("capturado","pagados"),false);
assert.equal(payLabel["pagado"],"Marcado como pagado");
console.log("OK Staff UX: Por día / 7 / 14 / 30, jornadas múltiples, turnos ±30 min y pagos seguros.");
