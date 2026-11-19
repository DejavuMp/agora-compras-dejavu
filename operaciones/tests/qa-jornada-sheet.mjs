import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {buildJornadaSheet,existingAssignments,suggestedEventStaff,jornadaPdf,jornadaShareText,jornadaEmail} from "../ops-jornada-sheet.mjs";
const person={id:"p1",name:"Andrea QA",role:"Promotoría",hourRate:100,dayRate:700,active:true};
const t=(day,h)=>"2026-11-"+day+"T"+h+":00-06:00";
const ev=(id,day,i)=>({
 id,seriesId:"grupo-volanteo-qa",dayIndex:i,dayCount:2,title:"Volanteo campaña QA",
 campaign:"Campaña QA",project:"Cliente ficticio",venueName:"Sucursal QA",venueAddress:"Cuernavaca, Morelos, México",
 type:"Volanteo",status:"confirmado",start:t(day,"10"),end:t(day,"16"),
 staff:[{personId:"p1",start:t(day,"09"),end:t(day,"17")}],vehicles:[]
});
const db={events:[ev("e1","19",1),ev("e2","20",2)],people:[person],vehicles:[],sites:[],campaigns:[],
 settings:{payrollPlan:{"2026-11":"2026-12-10"}},
 logs:[{id:"log1",eventId:"e1",personId:"p1",start:t("19","09"),end:t("19","17"),
 paymentBasis:"hora",paymentStatus:"validado",approvedAmount:800,breakMins:0}],
 incidents:[{id:"review1",eventId:"e1",personId:"p1",type:"validacion_asistencia",status:"correcta"}],
 clocks:[{eventId:"e1",personId:"p1",startedAt:{seconds:1763564400},status:"en_curso"}]
};
const result=buildJornadaSheet(db,"e1");
assert.equal(result.events.length,2,"Agrupa jornadas del evento sin repetirlas");
assert.equal(result.assignedPeople,1,"Persona única entre 2 días");
assert.equal(result.roster.length,2,"Dos asignaciones operativas");
assert.equal(result.days.length,2,"Calendario 2 días");
assert.equal(result.payroll.length,2,"Dos registros de prenómina por evento y persona");
assert.equal(result.totals.estimated,1600,"Total evento, 800 por día");
assert.equal(result.totals.authorized,800);
assert.equal(result.totals.pending,800);
assert.equal(result.roster[0].attendance,"Correcta");
assert.equal(result.roster[1].attendance,"Pendiente de coordinación");
assert.equal(result.payroll[0].dueDate,"2026-12-10");
const one=buildJornadaSheet(db,"e1",{scope:"dia"});
assert.equal(one.events.length,1);
assert.equal(one.payroll.length,1);
assert.equal(one.totals.estimated,800);
assert.equal(existingAssignments(db,"p1",{excludeEventId:"e1"}).length,1,"Otra asignación aparece al elegir staff");
assert.equal(existingAssignments(db,"p1").length,2,"Carga todas las asignaciones anteriores");
assert.equal(suggestedEventStaff(db,{campaign:"Campaña QA",title:"Volanteo campaña QA",site:"Sucursal QA"}).length,1,"Recupera integrante sin duplicar");
assert.equal(suggestedEventStaff(db,{campaign:"Otra campaña",title:"Volanteo campaña QA"}).length,0,"No mezcla otras campañas");
const pub=jornadaShareText(result);
assert.ok(!pub.includes("1600")&&!pub.includes("800"),"Texto operativo no expone nómina por defecto");
const privateText=jornadaShareText(result,{includePayroll:true});
assert.ok(privateText.includes("1,600.00"),"Importes solo cuando se incluyen");
assert.match(jornadaEmail(result).subject,/Jornada/);
const publicPdf=jornadaPdf(result);
const confidentialPdf=jornadaPdf(result,{includePayroll:true});
assert.deepEqual([...publicPdf.slice(0,8)],Array.from(Buffer.from("%PDF-1.4")));
assert.ok(publicPdf.length>800);
assert.ok(!Buffer.from(publicPdf).toString("latin1").includes("PRENÓMINA DEL EVENTO"),"Sin nómina en PDF operativo");
assert.ok(Buffer.from(confidentialPdf).toString("latin1").includes("PRENÓMINA DEL EVENTO"),"PDF financiero incluye nómina");
assert.ok(!Buffer.from(publicPdf).toString("latin1").includes("startGeo"),"No GPS");
writeFileSync("/tmp/agora-ficha-jornada-qa.pdf",confidentialPdf);
console.log("OK: calendario por evento, staff existente, prenómina sin duplicados, PDF real y privacidad.");
