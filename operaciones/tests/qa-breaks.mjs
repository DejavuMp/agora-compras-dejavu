import assert from "node:assert/strict";
import {ownBreaks,openBreak,nextBreakSlot,verifiedBreakSummary} from "../ops-breaks.mjs";
const started="2026-11-18T09:00:00-06:00",ended="2026-11-18T18:00:00-06:00";
const clock={status:"finalizada",startedAt:started,endedAt:ended};
const pause=(slot,start,end)=>({
 ownerUid:"staff-qa",eventId:"evt-qa",personId:"p1",slot:String(slot),
 status:"reanudado",startedAt:start,endedAt:end
});
const all=[
 pause(1,"2026-11-18T11:00:00-06:00","2026-11-18T11:30:00-06:00"),
 pause(2,"2026-11-18T11:15:00-06:00","2026-11-18T11:45:00-06:00"),
 pause(3,"2026-11-18T17:50:00-06:00","2026-11-18T18:30:00-06:00"),
 {...pause(4,"2026-11-18T12:00:00-06:00","2026-11-18T12:10:00-06:00"),ownerUid:"otra"}
];
const own=ownBreaks(all,"staff-qa","evt-qa");
assert.equal(own.length,3);
assert.equal(verifiedBreakSummary(clock,own).minutes,55,"Fusionar solapes y recortar después de salida");
assert.equal(verifiedBreakSummary(clock,own).count,3);
assert.equal(openBreak(own),null);
assert.equal(nextBreakSlot(own),"4");
assert.equal(nextBreakSlot(Array.from({length:8},(_,i)=>({slot:String(i+1)}))),null);
const pending=[...own,{ownerUid:"staff-qa",eventId:"evt-qa",slot:"4",status:"en_descanso",startedAt:"2026-11-18T17:59:00-06:00"}];
assert.equal(verifiedBreakSummary(clock,pending).active.slot,"4");
assert.equal(verifiedBreakSummary({status:"en_curso",startedAt:null},pending).unverified,true);
console.log("OK descansos certificados: unión de intervalos, límite ocho, identidad y pendiente.");
