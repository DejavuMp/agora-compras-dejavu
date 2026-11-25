import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  newShiftQr,parseShiftQr,verifyShiftAssignment,validateScanPermit,
  qrValidationKey,qrValidationDocId,qrValidationRecord,
  QR_LIFETIME_MS
} from "../qr-jornada.mjs";
const root="https://dejavump.github.io/agora-compras-dejavu/portal-agora/";
const time=new Date("2026-11-25T09:00:00-06:00").getTime();
const params={root,uid:"firebase-uid-01",personId:"persona-01",eventId:"evento-01",now:time};
const schedule={payload:{
 people:[{id:"persona-01",name:"Integrante prueba",active:true,authUid:"firebase-uid-01"}],
 events:[{id:"evento-01",title:"Jornada de oficina",status:"confirmado",
   staff:[{personId:"persona-01",activity:"Revisar materiales",
     activities:[{id:"a1",name:"Revisar materiales"},{id:"a2",name:"Cotizar proveedores"}]}]}]
}};
const permit={
 enabled:true,ownerUid:"firebase-uid-01",personId:"persona-01",eventId:"evento-01",
 startsAt:new Date("2026-11-25T08:30:00-06:00"),
 endsAt:new Date("2026-11-25T18:30:00-06:00")
};
test("el QR de jornada no es el QR de identidad y caduca",()=>{
 const link=newShiftQr(params);
 assert.match(link,/\/portal-agora\/escanear\/\?/);
 assert.doesNotMatch(link,/verificar\.html|credentialId|email|clabe|token/);
 assert.deepEqual(
  parseShiftQr(link,{origin:root,now:time+10_000}),
  {uid:"firebase-uid-01",personId:"persona-01",eventId:"evento-01",activityKey:"",issuedAt:time}
 );
 assert.throws(()=>parseShiftQr(link,{origin:root,now:time+QR_LIFETIME_MS+1}),/caducó/);
 assert.throws(()=>parseShiftQr(link.replace("firebase-uid-01","bad/uid"),{origin:root,now:time}));
});
test("no acepta QR de identidad ni QR de otro sitio",()=>{
 assert.throws(()=>parseShiftQr(root+"verificar.html?id=a".repeat(28),{origin:root,now:time}));
 assert.throws(()=>parseShiftQr("https://evil.invalid/escanear/?v=1",{origin:root,now:time}));
});
test("verifica persona y actividad contra cronograma real",()=>{
 const link=newShiftQr({...params,activityKey:"a2"});
 const code=parseShiftQr(link,{origin:root,now:time});
 const verified=verifyShiftAssignment(schedule,code);
 assert.equal(verified.fullName,"Integrante prueba");
 assert.equal(verified.activity.name,"Cotizar proveedores");
 assert.throws(()=>verifyShiftAssignment(schedule,{...code,uid:"uid-ajeno"}),/UID verificado/);
 assert.throws(()=>verifyShiftAssignment(schedule,{...code,personId:"otro"}),/no está asignada/);
 assert.throws(()=>verifyShiftAssignment(schedule,{...code,activityKey:"desconocida"}),/no aparece/);
});
test("supervisor no puede confirmar jornada sin permiso habilitado",()=>{
 const code=parseShiftQr(newShiftQr(params),{origin:root,now:time});
 const verified=verifyShiftAssignment(schedule,code);
 assert.equal(validateScanPermit(permit,verified,time),true);
 assert.throws(()=>validateScanPermit({...permit,enabled:false},verified,time),/no está habilitada/);
 assert.throws(()=>validateScanPermit(permit,verified,time+2*86400000),/fuera de la ventana/);
});
test("una jornada puede tener muchas actividades pero solo una entrada y salida QR",async()=>{
 const scan=parseShiftQr(newShiftQr(params),{origin:root,now:time});
 const id1=await qrValidationDocId(scan,"entrada",webcrypto.subtle);
 const id2=await qrValidationDocId(scan,"entrada",webcrypto.subtle);
 const out=await qrValidationDocId(scan,"salida",webcrypto.subtle);
 assert.equal(id1,id2);
 assert.notEqual(id1,out);
 assert.match(id1,/^qr_[a-f0-9]{48}$/);
 assert.throws(()=>qrValidationKey(scan,"actividad"),/QR de actividad/);
 const task=parseShiftQr(newShiftQr({...params,activityKey:"a1"}),{origin:root,now:time});
 assert.notEqual(await qrValidationDocId(task,"actividad",webcrypto.subtle),id1);
 assert.throws(()=>qrValidationKey(task,"entrada"),/QR general/);
});
test("cada registro guarda actor, hora del servidor y no toca el reloj oficial",()=>{
 const scan=parseShiftQr(newShiftQr(params),{origin:root,now:time});
 const assignment=verifyShiftAssignment(schedule,scan);
 const timestamp={server:true};
 const record=qrValidationRecord({
  scan,assignment,action:"entrada",
  actorUid:"coordinador-uid",actorName:"Coordinación",
  stamp:timestamp
 });
 assert.deepEqual(Object.keys(record).sort(),
  ["ownerUid","personId","eventId","type","status","notes","revision","updatedAt"].sort());
 assert.equal(record.ownerUid,"firebase-uid-01");
 assert.equal(record.type,"validacion_asistencia");
 assert.equal(record.status,"entrada");
 assert.equal(record.revision,1);
 assert.equal(record.updatedAt,timestamp);
 assert.match(record.notes,/coordinador-uid/);
 assert.ok(!JSON.stringify(record).includes("startGeo"));
 assert.ok(!JSON.stringify(record).includes("salary"));
});
test("interfaz admite QR manual y delegación mínima por jornada",async()=>{
 const [scanner,staff,app,roster,rules,identity,html]=await Promise.all([
  readFile(new URL("../scan-jornada.js",import.meta.url),"utf8"),
  readFile(new URL("../staff-shift-qr.js",import.meta.url),"utf8"),
  readFile(new URL("../app.js",import.meta.url),"utf8"),
  readFile(new URL("../attendance-roster.js",import.meta.url),"utf8"),
  readFile(new URL("../../firestore.rules",import.meta.url),"utf8"),
  readFile(new URL("../verify.js",import.meta.url),"utf8"),
  readFile(new URL("../escanear/index.html",import.meta.url),"utf8")
 ]);
 assert.match(scanner,/\["admin","coordinador"\]/);
 assert.match(scanner,/getDocFromServer\(doc\(db,"agora_ops_control","schedule"\)\)/);
 assert.match(scanner,/state\.isCoordinator/);
 assert.match(scanner,/where\("supervisorUids","array-contains",state\.user\.uid\)/);
 assert.match(scanner,/parseShiftQr/);
 assert.match(scanner,/getDocFromServer\(ref\)/);
 assert.match(scanner,/setDoc\(ref,draft\)/);
 assert.match(scanner,/entryDraft/);
 assert.match(scanner,/reviewEntry/);
 assert.match(scanner,/approveHours/);
 assert.match(scanner,/confirm\("¿Confirmas que/);
 assert.match(scanner,/BarcodeDetector/);
 assert.match(staff,/newShiftQr\(/);
 assert.match(staff,/const activityKey=""/);
 assert.doesNotMatch(staff,/qr-shift-activity/);
 assert.match(scanner,/const next=options\.find/);
 assert.doesNotMatch(scanner,/scan-activity-options|scan-manual-reason/);
 assert.doesNotMatch(identity,/Registrar mi propia entrada o salida/);
 assert.doesNotMatch(app,/mountOwnAttendance|credential-attendance-panel/);
 assert.match(roster,/Pase de lista/);
 assert.match(roster,/Pase remoto/);
 assert.match(app,/requestRemoteAttendance/);
 assert.match(app,/Pedir entrada remota/);
 assert.match(app,/Pedir salida remota/);
 assert.match(scanner,/validationMode===\"remoto\"/);
 assert.match(scanner,/renderRemoteRequests/);
 assert.match(rules,/attendanceRemoteRequestCreate/);
 assert.match(rules,/attendanceRemoteEntryCreate/);
 assert.match(rules,/remoteWindowMinutes/);
 assert.match(roster,/Reloj entrada/);
 assert.match(html,/Pase de lista manual/);
 assert.match(rules,/match \/agora_ops_attendance_sheets\/\{eventId\}/);
 assert.match(rules,/match \/agora_ops_incidents\/\{id\}/);
});
