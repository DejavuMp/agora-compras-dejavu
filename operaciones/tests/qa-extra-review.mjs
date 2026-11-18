/** Prueba pura del cálculo y tabla de excedentes del editor; sin Firebase. */
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync("operaciones/index.html","utf8");
const marker="/* Diferencia operativa entre turno asignado y horas netas reportadas.";
const start=html.indexOf(marker),end=html.indexOf("function renderHours(){",start);
assert.ok(start>=0&&end>start,"Se integra el panel en el editor.");
const code=html.slice(start,end);
const event={id:"evt",title:"Volanteo ficticio",staff:[
 {personId:"p1",start:"2026-11-18T09:30:00-06:00",end:"2026-11-18T16:30:00-06:00"}]};
const log={id:"log-1",personId:"p1",eventId:"evt",
 start:"2026-11-18T09:20:00-06:00",end:"2026-11-18T17:10:00-06:00",
 breakMins:30,paymentStatus:"solicitado"};
const db={events:[event],people:[{id:"p1",name:"Persona ficticia"}],logs:[log]};
const dateMs=s=>new Date(s).getTime();
const hDiff=(a,b)=>(dateMs(b)-dateMs(a))/3600000;
const logHours=l=>Math.max(0,hDiff(l.start,l.end)-Number(l.breakMins||0)/60);
const fmtHours=n=>Number(n.toFixed(2)).toString();
const getPerson=id=>db.people.find(p=>p.id===id);
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fmtDate=s=>String(s).slice(0,10);
const payPill=s=>'<span>'+esc(s)+'</span>';
const {extraCandidate,renderExtraReviewPanel}=new Function(
 "db","getPerson","hDiff","logHours","dateMs","fmtHours","esc","fmtDate","payPill",
 code+"\nreturn {extraCandidate,renderExtraReviewPanel};"
)(db,getPerson,hDiff,logHours,dateMs,fmtHours,esc,fmtDate,payPill);
const result=extraCandidate(log);
assert.equal(Number(result.planned.toFixed(2)),7);
assert.equal(Number(result.actual.toFixed(2)),7.33);
assert.equal(Number(result.extra.toFixed(2)),.33);
assert.match(renderExtraReviewPanel(),/Posibles horas extras por revisar/);
assert.match(renderExtraReviewPanel(),/Revisar horas/);
assert.match(renderExtraReviewPanel(),/0\.33 h/);
assert.match(renderExtraReviewPanel(),/ninguna diferencia autoriza un pago/);
db.people[0].name="<script>alert('X')</script>";
assert.ok(!renderExtraReviewPanel().includes("<script>"),"Sanitiza el nombre.");
db.logs[0].breakMins=60;
assert.equal(extraCandidate(db.logs[0]),null,"No crear excedente si no existe.");
db.logs[0].eventId="evento-inexistente";
assert.equal(extraCandidate(db.logs[0]),null,"No adivinar turnos faltantes.");
console.log("OK revisión de excedentes: comparación real, estado no aprobado y escape de contenido.");
