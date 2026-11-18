import assert from "node:assert/strict";
import {clampMinutes,elapsedMinutes,allowedByPolicy,timeLeft,estimatedArrival,gpsValid,mapsUrl}
  from "../jornadas-logic.mjs";
const base=new Date("2026-11-17T10:00:00-06:00").getTime();
const pol={enabled:true,mode:"horas",startsAt:new Date(base-1800000),endsAt:new Date(base+8*3600000),maxMinutes:360};
assert.equal(allowedByPolicy(pol,base).ok,true);
assert.equal(allowedByPolicy({...pol,enabled:false},base).ok,false);
assert.equal(allowedByPolicy(pol,base-3600000).ok,false);
assert.equal(timeLeft(pol,new Date(base),base),360);
assert.equal(timeLeft(pol,new Date(base),base+360*60000),0);
assert.equal(elapsedMinutes(base,base+60*60000),60);
assert.equal(estimatedArrival(base,35,10).getTime(),base+45*60000);
assert.equal(estimatedArrival(null,35,10),null);
assert.equal(clampMinutes(-5),0);
assert.equal(clampMinutes(2000),1440);
assert.equal(gpsValid({latitude:19.43,longitude:-99.13,accuracy:15}),true);
assert.equal(gpsValid({latitude:190,longitude:-99.13,accuracy:15}),false);
assert.match(mapsUrl("Mi origen","Sucursal de prueba"),/google.com\/maps\/dir/);
console.log("OK Jornadas: ventanas, cupo horario, ETA, límites y GPS.");
