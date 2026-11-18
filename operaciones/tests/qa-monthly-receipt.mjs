import assert from "node:assert/strict";
import {ownMonthReport,monthlyReceiptHtml} from "../ops-monthly-receipt.mjs";
const person={id:"p1",name:"Personal <QA>"};
const e1={id:"ev-1",title:"Volanteo QA",workMode:"actividad_horas",venueName:"Sede QA",
 start:"2026-11-18T10:00:00-06:00",end:"2026-11-18T16:00:00-06:00",
 staff:[{personId:"p1",start:"2026-11-18T09:30:00-06:00",end:"2026-11-18T16:30:00-06:00"}]};
const e2={...e1,id:"ev-2",title:"Entrega QA",start:"2026-11-19T10:00:00-06:00",
 end:"2026-11-19T16:00:00-06:00"};
const clock=(date,finish)=>({status:"finalizada",startedAt:date,endedAt:finish,endNote:"Actividad terminada"});
const clocks=new Map([
 ["ev-1",clock("2026-11-18T09:20:00-06:00","2026-11-18T17:10:00-06:00")],
 ["ev-2",clock("2026-11-19T09:30:00-06:00","2026-11-19T16:30:00-06:00")]
]);
const log1={id:"log1",ownerUid:"u1",personId:"p1",eventId:"ev-1",
 breakMins:30,paymentStatus:"capturado",start:"2026-11-18T09:20:00-06:00"};
const log2={...log1,id:"log2",eventId:"ev-2",start:"2026-11-19T09:30:00-06:00"};
const wrong={...log1,id:"log-other",ownerUid:"u2",eventId:"ev-2"};
const r=ownMonthReport({logs:[log1,log2,wrong],events:[e1,e2],clocks,
 person,personId:"p1",uid:"u1",month:"2026-11"});
assert.equal(r.dayCount,2);
assert.equal(r.activityCount,2);
assert.equal(r.total.breakMinutes,60);
assert.equal(r.total.overtimeCandidateMinutes,20);
assert.equal(r.total.netMinutes,860);
const html=monthlyReceiptHtml(r);
assert.ok(html.includes("Reporte de días y horas trabajadas"));
assert.ok(html.includes("Volanteo QA")&&html.includes("Entrega QA"));
assert.ok(html.includes("Imprimir / Guardar como PDF"));
assert.ok(!html.includes("<QA>"),"Escapar nombre");
assert.ok(html.includes("&lt;QA&gt;"));
assert.ok(!html.includes("UID")&&!html.includes("startGeo")&&!html.includes("approvedAmount"));
const empty=ownMonthReport({logs:[log1],events:[e1],clocks,person,
 personId:"p1",uid:"u2",month:"2026-11"});
assert.equal(empty.activityCount,0);
assert.throws(()=>ownMonthReport({logs:[log1],events:[e1],clocks,person,
 personId:"p2",uid:"u1",month:"2026-11"}),/identidad/);
assert.throws(()=>ownMonthReport({logs:[log1],events:[e1],clocks,person,
 personId:"p1",uid:"u1",month:"2026-13"}),/mes válido/);
console.log("OK informe mensual: días únicos, horas netas, excedentes y aislamiento UID.");
