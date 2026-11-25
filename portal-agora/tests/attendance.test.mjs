import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  clockKey,ownAttendanceShifts,attendanceState,entryPayload,exitPayload
} from "../attendance-policy.mjs";
const now=new Date("2026-11-25T09:00:00-06:00");
const ownDoc={
 personId:"p-01",
 events:[
  {id:"shift-01",title:"Jornada Dejavú",type:"Oficina",status:"confirmado",
   venueName:"Oficina",start:"2026-11-25T08:00:00-06:00",
   end:"2026-11-25T18:00:00-06:00",
   staff:[{personId:"p-01",start:"2026-11-25T08:00:00-06:00",end:"2026-11-25T18:00:00-06:00"}]},
  {id:"shift-ajeno",title:"No mostrar",status:"confirmado",
   start:"2026-11-25T08:00:00-06:00",
   end:"2026-11-25T18:00:00-06:00",
   staff:[{personId:"p-99"}]}
 ]
};
const member={active:true,role:"staff",personId:"p-01"};
const permit={
 ownerUid:"valid-uid",personId:"p-01",eventId:"shift-01",
 enabled:true,
 startsAt:new Date("2026-11-25T07:30:00-06:00"),
 endsAt:new Date("2026-11-25T18:30:00-06:00")
};
const stamp={__serverTimestamp:true};
const geo={lat:19.4326,lng:-99.1332,accuracy:21};

test("reutiliza exclusivamente UID y evento en el ID del reloj",()=>{
 assert.equal(clockKey("uid1","shift-01"),"uid1_shift-01");
 assert.throws(()=>clockKey("uid1","shift/02"));
 assert.throws(()=>clockKey("","shift-01"));
});
test("solo muestra turnos propios para miembro staff activo",()=>{
 const list=ownAttendanceShifts(ownDoc,member,now);
 assert.equal(list.length,1);
 assert.equal(list[0].title,"Jornada Dejavú");
 assert.equal(list[0].eventId,"shift-01");
 assert.equal(ownAttendanceShifts(ownDoc,{...member,personId:"p-99"},now).length,0);
 assert.equal(ownAttendanceShifts(ownDoc,{...member,active:false},now).length,0);
 assert.equal(ownAttendanceShifts(ownDoc,{...member,role:"coordinador"},now).length,0);
});
test("entrada solo disponible en ventana autorizada; no duplica registro",()=>{
 assert.deepEqual(attendanceState(permit,null,now),{status:"habilitada",action:"entry"});
 assert.equal(attendanceState({...permit,enabled:false},null,now).action,"none");
 assert.equal(attendanceState(permit,null,new Date("2026-11-25T07:00:00-06:00")).action,"none");
 assert.equal(attendanceState(permit,{status:"en_curso"},now).action,"exit");
 assert.equal(attendanceState(permit,{status:"finalizada"},now).action,"none");
});
test("salida permitida si expira o se deshabilita permiso anterior",()=>{
 const old={...permit,enabled:false};
 assert.equal(attendanceState(old,{status:"en_curso"},now).action,"exit");
 assert.equal(attendanceState(null,{status:"en_curso"},now).action,"exit");
});
test("entrada usa reloj oficial, UID, GPS puntual y hora servidor",()=>{
 const payload=entryPayload("valid-uid","p-01","shift-01","Oficina · Jornada",geo,stamp);
 assert.equal(payload.ownerUid,"valid-uid");
 assert.equal(payload.personId,"p-01");
 assert.equal(payload.eventId,"shift-01");
 assert.equal(payload.status,"en_curso");
 assert.deepEqual(payload.startGeo,geo);
 assert.deepEqual(payload.lastGeo,geo);
 assert.equal(payload.startedAt,stamp);
 assert.equal(payload.updatedAt,stamp);
 assert.throws(()=>entryPayload("valid-uid","p-01","shift-01","Oficina",null,stamp));
});
test("salida usa hora servidor y permite GPS opcional",()=>{
 const payload=exitPayload("Trabajo terminado",null,stamp);
 assert.equal(payload.status,"finalizada");
 assert.equal(payload.endNote,"Trabajo terminado");
 assert.ok(!("endGeo" in payload));
 assert.equal(payload.endedAt,stamp);
 const withGps=exitPayload("",geo,stamp);
 assert.deepEqual(withGps.endGeo,geo);
});
test("credencial personal únicamente acredita identidad; las jornadas usan QR separado",async()=>{
 const [app,roster,verify,rules,html,style,staff,scanner]=await Promise.all([
  readFile(new URL("../app.js",import.meta.url),"utf8"),
  readFile(new URL("../attendance-roster.js",import.meta.url),"utf8"),
  readFile(new URL("../verify.js",import.meta.url),"utf8"),
  readFile(new URL("../../firestore.rules",import.meta.url),"utf8"),
  readFile(new URL("../verificar.html",import.meta.url),"utf8"),
  readFile(new URL("../perfil.css",import.meta.url),"utf8"),
  readFile(new URL("../staff/index.html",import.meta.url),"utf8"),
  readFile(new URL("../escanear/index.html",import.meta.url),"utf8")
 ]);
 assert.match(app,/id="credential-dialog"/);
 assert.match(app,/id="credential-qr-modal"/);
 assert.match(app,/data-action="open-credential"/);
 assert.doesNotMatch(app,/mountOwnAttendance|credential-attendance-panel/);
 assert.match(app,/QR es exclusivamente de identificación/);
 assert.match(verify,/agora_identity_credentials/);
 assert.match(verify,/d\.active===true/);
 assert.match(verify,/exclusivamente para identificación y vigencia/);
 assert.doesNotMatch(verify,/Registrar mi propia entrada o salida/);
 assert.match(app,/data-action="show-shift-qr"/);
 assert.match(app,/Mostrar QR para asistencia/);
 assert.doesNotMatch(app,/Registrar entrada \/ salida/);
 assert.match(app,/data-action="view-attendance"/);
 assert.match(app,/escanear\//);
 assert.match(app,/showShiftQr/);
 assert.match(app,/mountRoster/);
 assert.match(staff,/qrcodejs/);
 assert.match(scanner,/scan-jornada\.js/);
 assert.match(scanner,/noindex,nofollow/);
 assert.match(html,/name="referrer" content="no-referrer"/);
 assert.match(roster,/agora_ops_clock/);
 assert.match(roster,/agora_ops_incidents/);
 assert.match(roster,/Reloj entrada/);
 assert.match(roster,/Pase de lista/);
 assert.match(roster,/Pase remoto/);
 assert.match(rules,/match \/agora_ops_clock\/\{id\}/);
 assert.match(rules,/La asistencia nueva la registra coordinación mediante hojas delegadas/);
 assert.match(rules,/match \/agora_ops_breaks\/\{id\}[\s\S]*?allow create, update: if false;/);
 assert.match(rules,/match \/agora_ops_incidents\/\{id\}/);
 assert.match(style,/\.qr-shift-image/);
 assert.match(style,/\.qr-scan-page/);
});
