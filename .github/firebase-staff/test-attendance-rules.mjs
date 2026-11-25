/**
 * QA de pase de lista por jornada con Firebase Emulator.
 * Identidades ficticias; nunca usa datos o credenciales reales.
 */
import {readFileSync} from "node:fs";
import {
 initializeTestEnvironment,assertSucceeds,assertFails
} from "@firebase/rules-unit-testing";
import {
 doc,collection,query,where,getDoc,getDocs,setDoc,updateDoc,
 serverTimestamp,Timestamp
} from "firebase/firestore";
const env=await initializeTestEnvironment({
 projectId:"demo-agora-asistencia",
 firestore:{host:"127.0.0.1",port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),
  rules:readFileSync("firestore.rules","utf8")}
});
let passed=0;
const yes=async(label,p)=>{await assertSucceeds(p);passed++;console.log("OK "+label)};
const no=async(label,p)=>{await assertFails(p);passed++;console.log("OK DENEGADO "+label)};
const ctx=id=>env.authenticatedContext(id,{
 email:id+"@example.invalid",email_verified:true
}).firestore();
const coord=ctx("coordAs"),sup=ctx("supAs"),staff=ctx("staffAs"),other=ctx("outsiderAs");
const anon=env.unauthenticatedContext().firestore();
const eventId="jornadaPrueba";
const sheet=db=>doc(db,"agora_ops_attendance_sheets",eventId);
const roster=(db,person="p01")=>doc(db,"agora_ops_attendance_sheets",eventId,"roster",person);
const entry=(db,id="p01__entrada__jornada")=>doc(db,"agora_ops_attendance_sheets",eventId,"entries",id);
const approval=db=>doc(db,"agora_ops_attendance_sheets",eventId,"approvals","p01");
const activity=(db,id="tarea_1234567890")=>doc(db,"agora_ops_attendance_sheets",eventId,"activities",id);
const start=Timestamp.fromMillis(Date.now()-3600000);
const end=Timestamp.fromMillis(Date.now()+7*3600000);
const sheetData=()=>({
 eventId,title:"Jornada demostración",site:"Oficina",startsAt:start,endsAt:end,
 active:true,supervisorUids:["supAs"],
 createdBy:"coordAs",createdAt:serverTimestamp(),
 updatedBy:"coordAs",updatedAt:serverTimestamp(),revision:1
});
const rosterData=(personId="p01",uid="staffAs",name="Persona Ejemplo")=>({
 eventId,personId,uid,name,activityKeys:["origen","actividad01"],
 createdBy:"coordAs",createdAt:serverTimestamp()
});
const attendance=(action="entrada",extra={})=>({
 id:"p01__"+action+"__jornada",eventId,
 personId:"p01",ownerUid:"staffAs",personName:"Persona Ejemplo",
 source:"manual",action,activityKey:"jornada",
 reason:"No tenía teléfono con QR",notes:"",
 actorUid:"supAs",createdAt:serverTimestamp(),status:"pendiente",...extra
});
const provisional=()=>({
 id:"prov_1234567890abcdef1234__entrada__jornada",eventId,
 personId:"prov_1234567890abcdef1234",ownerUid:"",
 personName:"Visitante asignado",source:"provisional",action:"entrada",
 activityKey:"jornada",reason:"Solicitado por llamada sin ficha previa",
 notes:"",actorUid:"supAs",createdAt:serverTimestamp(),status:"pendiente"
});
try{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,"agora_users","coordAs"),{
   name:"Coordinación",email:"coordAs@example.invalid",role:"coordinador",
   active:true,createdAt:Timestamp.now(),updatedAt:Timestamp.now()
  });
  await setDoc(doc(db,"agora_identity_links","supAs"),{
   uid:"supAs",agoraId:"DJV-2026-555",credentialId:"111122223333444455556666",
   active:true,createdAt:Timestamp.now(),createdBy:"coordAs"
  });
  await setDoc(doc(db,"agora_ops_members","staffAs"),{
   uid:"staffAs",personId:"p01",role:"staff",active:true,
   email:"staffAs@example.invalid",updatedAt:Timestamp.now()
  });
 });
 await no("anónimo no accede al pase de lista",getDoc(sheet(anon)));
 await no("supervisor no consulta la agenda completa",getDoc(doc(sup,"agora_ops_control","schedule")));
 await no("supervisor no puede habilitar su propia jornada",setDoc(sheet(sup),sheetData()));
 await yes("coordinación habilita jornada y delega supervisor",setDoc(sheet(coord),sheetData()));
 await yes("supervisor delegado consulta únicamente su jornada",getDoc(sheet(sup)));
 await yes("supervisor consulta sus jornadas delegadas",getDocs(query(
  collection(sup,"agora_ops_attendance_sheets"),where("supervisorUids","array-contains","supAs")
 )));
 await no("otro usuario sin delegación no consulta jornada",getDoc(sheet(other)));
 await yes("coordinación publica roster mínimo",setDoc(roster(coord),rosterData()));
 await yes("coordinación publica persona sin cuenta (manual)",setDoc(
  roster(coord,"p02"),rosterData("p02","","Sin teléfono")
 ));
 await yes("supervisor consulta la lista de su jornada",getDocs(
  collection(sup,"agora_ops_attendance_sheets",eventId,"roster")
 ));
 await no("personal no consulta roster completo",getDocs(
  collection(staff,"agora_ops_attendance_sheets",eventId,"roster")
 ));
 await no("supervisor no accede a datos bancarios",getDoc(
  doc(sup,"agora_identity_financial","staffAs")
 ));
 await no("staff no se autoriza asistencia a sí mismo",setDoc(entry(staff),
  {...attendance(),actorUid:"staffAs"}));
 await yes("supervisor registra asistencia manual",setDoc(entry(sup),attendance()));
 await no("supervisor no duplica la misma entrada",setDoc(entry(sup),attendance()));
 await no("supervisor no valida sus propias capturas",updateDoc(entry(sup),{
  status:"validado",validatedBy:"supAs",validatedAt:serverTimestamp(),validationNote:""
 }));
 await no("supervisor no crea aprobación de horas",setDoc(approval(sup),{
  eventId,personId:"p01",personName:"Persona Ejemplo",startAt:start,endAt:end,
  breakMinutes:0,approvedMinutes:180,notes:"",status:"horas_validadas",
  source:"manual",approvedBy:"supAs",approvedAt:serverTimestamp()
 }));
 await yes("supervisor registra persona provisional con motivo",setDoc(
  entry(sup,provisional().id),provisional()
 ));
 await no("provisional sin motivo no se permite",setDoc(
  entry(sup,"prov_ffffffffffffffffffff__entrada__jornada"),{
   ...provisional(),id:"prov_ffffffffffffffffffff__entrada__jornada",
   personId:"prov_ffffffffffffffffffff",reason:""
  }
 ));
 await yes("supervisor registra salida manual",setDoc(entry(sup,"p01__salida__jornada"),
  attendance("salida")));
 await yes("coordinación valida entrada",updateDoc(entry(coord),{
  status:"validado",validatedBy:"coordAs",validatedAt:serverTimestamp(),
  validationNote:"Presencia comprobada"
 }));
 await yes("coordinación valida salida",updateDoc(entry(coord,"p01__salida__jornada"),{
  status:"validado",validatedBy:"coordAs",validatedAt:serverTimestamp(),
  validationNote:"Salida comprobada"
 }));
 await no("supervisor no altera validación oficial",updateDoc(entry(sup),{
  status:"rechazado",validatedBy:"supAs",validatedAt:serverTimestamp(),validationNote:"No"
 }));
 await yes("coordinación valida horas para revisión de pago",setDoc(approval(coord),{
  eventId,personId:"p01",personName:"Persona Ejemplo",startAt:start,endAt:end,
  breakMinutes:15,approvedMinutes:225,notes:"Horas verificadas con el supervisor",
  status:"horas_validadas",source:"manual",
  approvedBy:"coordAs",approvedAt:serverTimestamp()
 }));
 await no("no se cambia silenciosamente aprobación histórica",updateDoc(approval(coord),{
  approvedMinutes:700
 }));
 await no("supervisor no consulta las aprobaciones para pago",getDoc(approval(sup)));
 await no("personal sin permiso no crea actividades ajenas",setDoc(activity(other),{
  id:"tarea_1234567890",eventId,personId:"p01",uid:"staffAs",
  name:"Revisión de inventario",status:"pendiente",
  createdAt:serverTimestamp(),createdBy:"outsiderAs",
  updatedAt:serverTimestamp(),updatedBy:"outsiderAs"
 }));
 await yes("Staff agrega otra actividad sin crear jornada",setDoc(activity(staff),{
  id:"tarea_1234567890",eventId,personId:"p01",uid:"staffAs",
  name:"Revisión de inventario",status:"pendiente",
  createdAt:serverTimestamp(),createdBy:"staffAs",
  updatedAt:serverTimestamp(),updatedBy:"staffAs"
 }));
 await yes("Staff marca actividad terminada",updateDoc(activity(staff),{
  status:"terminada",updatedAt:serverTimestamp(),updatedBy:"staffAs"
 }));
 await no("otro personal no ve actividades ajenas",getDoc(activity(other)));
 await yes("coordinador consulta actividades",getDoc(activity(coord)));

 const requestId="12345678-1234-4234-9234-1234567890ab";
 const reqRef=db=>doc(db,"agora_ops_assignment_requests",requestId);
 const requestData=()=>({
  id:requestId,requester:"Cliente KFC",channel:"WhatsApp",
  contact:"",requestedAt:"2026-11-25T08:45",
  project:"Activación de prueba",site:"Oficina Dejavú",
  date:"2026-11-25",start:"09:00",end:"18:00",
  headcount:3,description:"Solicitó personal para oficina",
  activities:["Cotizar","Coordinar materiales"],
  evidenceNote:"Captura recibida por mensaje",
  evidenceImage:"data:image/jpeg;base64,"+"A".repeat(120),
  capturedBy:"coordAs",createdAt:serverTimestamp(),
  status:"pendiente",linkedEventId:"",
  updatedAt:serverTimestamp(),updatedBy:"coordAs"
 });
 await no("supervisor no crea solicitudes administrativas",setDoc(reqRef(sup),{
  ...requestData(),capturedBy:"supAs",updatedBy:"supAs"
 }));
 await yes("coordinación guarda solicitud con captura privada",setDoc(reqRef(coord),requestData()));
 await yes("coordinación consulta solicitud y evidencia",getDoc(reqRef(coord)));
 await no("supervisor no consulta capturas ni contactos privados",getDoc(reqRef(sup)));
 await no("personal Staff no consulta las solicitudes de coordinación",getDoc(reqRef(staff)));
 await no("coordinación no puede reemplazar captura histórica",updateDoc(reqRef(coord),{
  evidenceNote:"Reescribir evidencia",updatedAt:serverTimestamp(),updatedBy:"coordAs"
 }));
 await yes("coordinación vincula solicitud a una jornada publicada",updateDoc(reqRef(coord),{
  status:"confirmada",linkedEventId:eventId,
  updatedAt:serverTimestamp(),updatedBy:"coordAs"
 }));
 await no("coordinación no puede borrar solicitud",setDoc(reqRef(coord),requestData()));

 console.log("ÁGORA asistencia: "+passed+" controles de seguridad en emulador.");
}finally{await env.cleanup()}
