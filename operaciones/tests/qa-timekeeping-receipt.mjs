/** Horas, descansos, excedentes y comprobantes con datos ficticios. */
import assert from "node:assert/strict";
import {timeStatement,scheduledMinutes,workedMinutes,isJornada,hours} from "../ops-timekeeping.mjs";
import {receiptData,receiptHtml} from "../ops-receipt.mjs";
import {reportFromFinishedClock} from "../staff-dashboard.mjs";
const event={
 id:"evt-qa",title:"Volanteo de prueba",workMode:"actividad_horas",
 venueName:"Sucursal de prueba",start:"2026-11-18T10:00:00-06:00",end:"2026-11-18T16:00:00-06:00",
 staff:[{personId:"p1",start:"2026-11-18T09:30:00-06:00",end:"2026-11-18T16:30:00-06:00"}]
};
const clock={
 status:"finalizada",startedAt:new Date("2026-11-18T09:20:00-06:00"),
 endedAt:new Date("2026-11-18T17:10:00-06:00"),endNote:"Volanteo de prueba completado"
};
const info=timeStatement({clock,event,personId:"p1",breakMins:30});
assert.equal(scheduledMinutes(event,"p1"),420,"Cuenta el turno real ±30 min");
assert.equal(workedMinutes(clock),470);
assert.equal(info.grossMinutes,470);
assert.equal(info.breakMinutes,30);
assert.equal(info.netMinutes,440);
assert.equal(info.overtimeCandidateMinutes,20);
assert.equal(info.ordinaryMinutes,420);
assert.equal(info.reviewRequired,true);
assert.equal(info.paymentBasis,"hora");
assert.equal(isJornada({...event,workMode:"jornada_campo"}),true);
assert.equal(timeStatement({clock,event:{...event,workMode:"jornada_campo"},personId:"p1",breakMins:30}).paymentBasis,"jornada");
assert.throws(()=>timeStatement({clock,event,personId:"p1",breakMins:471}),/exceder/);
assert.equal(hours(90),"1.5 h");
const log=reportFromFinishedClock({clock,event,uid:"u1",personId:"p1",id:"j_u1_evt-qa",breakMins:30});
assert.equal(log.breakMins,30);
assert.equal(log.paymentBasis,"hora");
assert.equal(log.paymentStatus,"capturado");
assert.ok(!("approvedHours" in log),"No aprobar extras sin coordinación");
assert.ok(!("approvedAmount" in log),"No fijar pago en comprobante");
const receipt=receiptData({log,event,clock,personId:"p1",person:{id:"p1",name:"Persona de prueba"}});
assert.equal(receipt.planned,"7 h");
assert.equal(receipt.net,"7.33 h");
assert.equal(receipt.overtime,"0.33 h");
const html=receiptHtml(receipt);
for(const fragment of ["Comprobante de jornada","Persona de prueba","7.33 h","Guardar como PDF","Tiempo excedente"]){
 assert.ok(html.includes(fragment),fragment);
}
assert.ok(!html.includes("bankAccount"));
assert.ok(!html.includes("startGeo"));
assert.throws(()=>receiptData({log,event,clock,personId:"p2",person:{id:"p2"}}),/misma jornada/);
const htmlMalicioso=receiptHtml({...receipt,name:"<script>alert(1)</script>"});
assert.ok(!htmlMalicioso.includes("<script>alert(1)</script>"),"Sanitiza nombres de usuarios");
console.log("OK tiempos: modalidad, descanso, extras sin aprobar y comprobante sin datos sensibles.");
