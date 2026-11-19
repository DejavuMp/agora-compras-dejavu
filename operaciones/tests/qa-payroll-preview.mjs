import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {phaseByTime,buildPayroll,payrollXlsx,payrollHtml,payrollEmail,attendanceReviewId} from "../ops-payroll-preview.mjs";
const act={id:"ev1",status:"confirmado",title:"Volanteo QA",project:"KFC QA",campaign:"Hot Crují QA",
 start:"2026-11-19T10:00:00-06:00",end:"2026-11-19T16:00:00-06:00",
 staff:[{personId:"p1",start:"2026-11-19T09:30:00-06:00",end:"2026-11-19T16:30:00-06:00"},
  {personId:"p2",start:"2026-11-19T09:30:00-06:00",end:"2026-11-19T16:30:00-06:00"}]};
assert.equal(phaseByTime(act,new Date("2026-11-19T09:00:00-06:00").getTime()),"programada");
assert.equal(phaseByTime(act,new Date("2026-11-19T12:00:00-06:00").getTime()),"en_curso");
assert.equal(phaseByTime(act,new Date("2026-11-19T17:00:00-06:00").getTime()),"terminada_programacion");
assert.equal(phaseByTime({...act,status:"cancelado"},Date.now()),"cancelado");
assert.equal(attendanceReviewId("p1","ev1"),attendanceReviewId("p1","ev1"));
const people=[{id:"p1",name:"Integrante QA",hourRate:100},{id:"p2",name:"=SUM(1,2) QA",hourRate:75}];
const logs=[{id:"log1",eventId:"ev1",personId:"p1",start:"2026-11-19T09:32:00-06:00",
 end:"2026-11-19T16:30:00-06:00",breakMins:30,paymentBasis:"hora",paymentStatus:"validado",approvedAmount:650}];
const incidents=[{id:"r1",eventId:"ev1",personId:"p1",type:"validacion_asistencia",status:"correcta"}];
const p=buildPayroll({events:[act],people,logs,incidents,month:"2026-11",dueDate:"2026-11-27"});
assert.equal(p.count,2);
assert.equal(p.rows.find(x=>x.personId==="p1").amount,650);
assert.equal(p.rows.find(x=>x.personId==="p1").status,"Autorizado");
assert.equal(p.rows.find(x=>x.personId==="p2").status,"Previsto");
assert.equal(p.total,1175);
assert.equal(p.authorized,650);
assert.equal(p.pending,525);
assert.equal(p.rows.find(x=>x.personId==="p2").attendance,"Pendiente de coordinación");
assert.equal(new Set(p.rows.map(x=>x.folio)).size,p.rows.length,"Folios únicos");
const file=payrollXlsx(p);
assert.ok(file instanceof Uint8Array);
assert.deepEqual([...file.slice(0,4)],[80,75,3,4],"Es un contenedor XLSX ZIP real");
assert.ok(Buffer.from(file).includes(Buffer.from("xl/worksheets/sheet1.xml")));
assert.ok(Buffer.from(file).includes(Buffer.from("SUM(1,2) QA")),"Nombre se escribe como texto, no fórmula");
writeFileSync("/tmp/agora-prenomina-qa.xlsx",file);
const html=payrollHtml(p);
assert.ok(html.includes("Imprimir / Guardar como PDF"));
assert.ok(html.includes("Prenómina interna"));
assert.ok(!html.includes("CLABE:")&&!html.includes("startGeo"),"No expone datos de ubicación o banco");
const email=payrollEmail(p);
assert.match(email.subject,/Prenómina prevista/);
assert.match(email.body,/Adjunto/);
assert.throws(()=>buildPayroll({...p,month:"2026-13-XX"}),/Mes inválido/);
console.log("OK: fase automática, prenómina prevista/autorizada, folios, XLSX real, PDF imprimible, correo seguro.");
