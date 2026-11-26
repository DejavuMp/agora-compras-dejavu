import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
 shiftPreview,shiftCandidates,minimalRoster,entryDocId,
 freshProvisionalId,entryDraft,calculateNetMinutes,approvalDraft,payrollSummary,validatedHoursReceipt,isLocalAttendanceTime
} from "../asistencia-policy.mjs";
const start=new Date("2026-11-25T09:00:00-06:00");
const end=new Date("2026-11-25T18:00:00-06:00");
const schedule={payload:{
 people:[
  {id:"p01",name:"Colaborador Uno",authUid:"staff-uid",hourRate:100,bank:"001"},
  {id:"p02",name:"Colaborador Sin Cuenta",authUid:"",dayRate:300}
 ],
 events:[{id:"j01",title:"Jornada oficina",venueName:"Dejavú",
   start,end,status:"confirmado",
   staff:[{personId:"p01",activities:[
     {id:"t1",name:"Cotización"},{id:"t2",name:"Coordinar personal"}]},
    {personId:"p02",activity:"Montaje de apoyo"}]}]
}};
test("jornada original conserva actividades múltiples y ficha mínima sin sueldos",()=>{
 const shift=shiftPreview(schedule,"j01");
 assert.equal(shift.eventId,"j01");
 assert.equal(shift.roster.length,2);
 assert.deepEqual(shift.roster[0].activityKeys,["t1","t2"]);
 assert.ok(shift.roster[1].activityKeys.includes("origen"));
 assert.equal(shift.roster[1].uid,"");
 assert.ok(!JSON.stringify(shift).includes("hourRate"));
 assert.ok(!JSON.stringify(shift).includes('"bank"'));
});
test("registros son únicos por jornada, persona y acción",()=>{
 assert.equal(entryDocId("p01","entrada"),"p01__entrada__jornada");
 assert.equal(entryDocId("p01","salida"),"p01__salida__jornada");
 assert.equal(entryDocId("p01","actividad","t2"),"p01__actividad__t2");
 assert.throws(()=>entryDocId("p01","actividad","jornada"));
 assert.throws(()=>entryDocId("p01","entrada","t2"));
});
test("permitir asistencia manual sin UID y provisional documentado",()=>{
 const stamp={serverTime:true};
 const manual=entryDraft({
  eventId:"j01",person:{personId:"p02",uid:"",name:"Sin cuenta"},
  source:"manual",action:"entrada",reason:"Sin acceso ni teléfono",actorUid:"supervisor",stamp
 });
 assert.equal(manual.ownerUid,"");
 assert.equal(manual.status,"pendiente");
 const provisional=freshProvisionalId("0123456789abcdef0123");
 const created=entryDraft({
  eventId:"j01",person:{personId:provisional,uid:"",name:"Personal extra"},
  source:"provisional",action:"entrada",
  reason:"Cliente pidió apoyo por llamada",actorUid:"supervisor",stamp
 });
 assert.equal(created.personId,provisional);
 assert.throws(()=>entryDraft({
  eventId:"j01",person:{personId:provisional,uid:"",name:"Personal extra"},
  source:"provisional",action:"entrada",reason:"Nada",actorUid:"supervisor",stamp
 }));
});
test("impedir autovalidación de asistencia",()=>{
 assert.throws(()=>entryDraft({
  eventId:"j01",person:{personId:"p01",uid:"supervisor",name:"Supervisor"},
  source:"manual",action:"entrada",actorUid:"supervisor",stamp:{serverTime:true}
 }),/propia asistencia/);
});
test("horas para pago son netas y no incluyen tarifas",()=>{
 assert.equal(calculateNetMinutes(start,end,30),510);
 assert.throws(()=>calculateNetMinutes(start,end,600),/fuera del rango/);
 const approval=approvalDraft({
  eventId:"j01",person:{personId:"p01",name:"Colaborador Uno",source:"manual"},
  entry:start,exit:end,breakMinutes:30,notes:"Revisado",
  actorUid:"coord",stamp:{server:true}
 });
 assert.equal(approval.approvedMinutes,510);
 assert.equal(approval.status,"horas_validadas");
 assert.ok(!JSON.stringify(approval).includes("bank"));
 assert.ok(!JSON.stringify(approval).includes("salary"));
 const summary=payrollSummary({eventId:"j01",title:"Oficina",site:"Dejavú"},[approval]);
 assert.match(summary,/8.50 h/);
 assert.match(summary,/no autorización de transferencia/);
 const sheet={eventId:"j01",title:"Oficina",site:"Dejavú"};
 const receipt=validatedHoursReceipt(sheet,approval);
 assert.match(receipt,/Recibo de horas validadas/);
 assert.match(receipt,/Colaborador Uno/);
 assert.match(receipt,/8\.50 h/);
 assert.throws(()=>validatedHoursReceipt({...sheet,eventId:"j02"},approval),/esta jornada/);
 assert.throws(()=>validatedHoursReceipt(sheet,{...approval,status:"pendiente"}),/horas validadas/);
});
test("interfaces y permisos no mezclan funciones o sitios",async()=>{
 const [scanner,staff,app,rules,html,css]=await Promise.all([
  readFile(new URL("../scan-jornada.js",import.meta.url),"utf8"),
  readFile(new URL("../staff-activities.js",import.meta.url),"utf8"),
  readFile(new URL("../app.js",import.meta.url),"utf8"),
  readFile(new URL("../../firestore.rules",import.meta.url),"utf8"),
  readFile(new URL("../escanear/index.html",import.meta.url),"utf8"),
  readFile(new URL("../perfil.css",import.meta.url),"utf8")
 ]);
 for(const word of ["QR","manual","provisional","horas","Supervisor"]){
  assert.ok(html.toLowerCase().includes(word.toLowerCase()),"Falta "+word);
 }
 assert.match(scanner,/where\("supervisorUids","array-contains",state\.user\.uid\)/);
 assert.match(scanner,/setDoc\(ref,draft\)/);
 assert.match(scanner,/validateScanPermit|state\.sheet\.active/);
 assert.match(scanner,/approvedMinutes/);
 assert.match(scanner,/getDocsFromServer\(collection\(db,"agora_ops_attendance_sheets",id,"roster"\)\)/);
 assert.match(staff,/setDoc\(ref/);
 assert.match(staff,/updateDoc\(doc\(db,"agora_ops_attendance_sheets"/);
 assert.match(app,/renderStaffTasks/);
 assert.match(app,/showShiftQr/);
 assert.match(rules,/function attendanceSupervisor\(eventId\)/);
 assert.match(rules,/match \/agora_ops_attendance_sheets\/\{eventId\}/);
 assert.match(rules,/match \/entries\/\{id\}/);
 assert.match(rules,/match \/activities\/\{activityId\}/);
 assert.match(rules,/match \/approvals\/\{personId\}/);
 assert.match(css,/\.attendance-methods/);
 assert.match(css,/\.attendance-task-list/);
});

test("el pase presencial respeta la ventana de treinta minutos de Firestore",()=>{
 const sheet={startsAt:start,endsAt:end};
 const halfHour=30*60_000;
 assert.equal(isLocalAttendanceTime(sheet,+start-halfHour-1),false);
 assert.equal(isLocalAttendanceTime(sheet,+start-halfHour),true);
 assert.equal(isLocalAttendanceTime(sheet,+end+halfHour),true);
 assert.equal(isLocalAttendanceTime(sheet,+end+halfHour+1),false);
 assert.equal(isLocalAttendanceTime({},+start),false);
});
