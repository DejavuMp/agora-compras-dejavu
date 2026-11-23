import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertSucceeds,assertFails} from "@firebase/rules-unit-testing";
import {doc,collection,query,where,getDoc,getDocs,setDoc,updateDoc,serverTimestamp,Timestamp} from "firebase/firestore";
const env=await initializeTestEnvironment({projectId:"demo-agora-repairs",firestore:{
 host:"127.0.0.1",port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),rules:readFileSync("firestore.rules","utf8")}});
const id="d630d5ec-4e3a-4d51-92b2-0d917f43ebc9",aid="bc6305ec-4e3a-4d51-92b2-0d917f43ebc9",pic="b130d5ec-4e3a-4d51-92b2-0d917f43ebc9";
const staffId="repair-staff",coordId="repair-coord",email=id=>id+"@example.invalid";
const req=db=>doc(db,"agora_repair_requests",id),asset=db=>doc(db,"agora_repair_assets",aid);
const payload=creator=>({
 id,assetId:aid,project:"Hot Cruji Bravo",asset:"Stand",scope:"Elemento específico",area:"Panel frontal",
 cause:"Montaje",problem:"Pieza desprendida",solutionMode:"propuesta",instructions:"",
 materialLink:"https://example.invalid/planos",dueDate:"2026-12-01",priority:"Alta",
 createdBy:creator,createdByEmail:email(creator),createdByName:"Staff ficticio",
 createdAt:serverTimestamp(),updatedAt:serverTimestamp(),status:"pendiente",
 repairRoute:"pendiente",assignedTo:"",assignedUid:"",decisionBy:"",decisionNote:"",
 estimatedCost:0,quotes:[],selectedQuoteId:"",photos:[],revision:1
});
const assetData=()=>({id:aid,project:"Hot Cruji Bravo",stand:"Stand",piece:"Panel frontal",
 description:"Panel de prueba",materialLink:"",condition:"Por revisar",photoPaths:[],
 createdBy:coordId,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),revision:1});
let checks=0;
const yes=async(name,p)=>{await assertSucceeds(p);console.log("OK "+name);checks++};
const no=async(name,p)=>{await assertFails(p);console.log("DENEGADO "+name);checks++};
try{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,"agora_users",coordId),{name:"Coord",email:email(coordId),role:"coordinador",active:true,
    createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
  await setDoc(doc(db,"agora_ops_members",staffId),{uid:staffId,email:email(staffId),role:"staff",
    personId:"persona-uno",active:true,updatedAt:Timestamp.now()});
  await setDoc(doc(db,"agora_ops_members","asignado-2"),{uid:"asignado-2",email:email("asignado-2"),
    role:"staff",personId:"persona-dos",active:true,updatedAt:Timestamp.now()});
 });
 const anon=env.unauthenticatedContext().firestore();
 const coord=env.authenticatedContext(coordId,{email:email(coordId),email_verified:true}).firestore();
 const staff=env.authenticatedContext(staffId,{email:email(staffId),email_verified:true}).firestore();
 const outsider=env.authenticatedContext("extra",{email:email("extra"),email_verified:true}).firestore();
 const assignee=env.authenticatedContext("asignado-2",{email:email("asignado-2"),email_verified:true}).firestore();
 await no("anónimo no lee inventario",getDocs(collection(anon,"agora_repair_assets")));
 await no("externo no inventaría",setDoc(asset(outsider),assetData()));
 await no("staff no inventaría",setDoc(asset(staff),assetData()));
 await yes("coordinación registra pieza",setDoc(asset(coord),assetData()));
 await yes("staff consulta inventario",getDocs(collection(staff,"agora_repair_assets")));
 await no("staff no altera inventario",updateDoc(asset(staff),{condition:"Disponible",revision:2,updatedAt:serverTimestamp()}));
 await yes("staff crea solicitud",setDoc(req(staff),payload(staffId)));
 await yes("staff ve solicitud propia",getDoc(req(staff)));
 await yes("staff lista las suyas",getDocs(query(collection(staff,"agora_repair_requests"),where("createdBy","==",staffId))));
 await no("staff no enumera todos los reportes",getDocs(collection(staff,"agora_repair_requests")));
 await no("tercero no ve reporte",getDoc(req(outsider)));
 await no("staff no se autoautoriza",updateDoc(req(staff),{repairRoute:"proveedor",status:"autorizado",revision:2,updatedAt:serverTimestamp()}));
 await yes("staff adjunta evidencia",updateDoc(req(staff),{
  photos:[{path:"agora-repairs/"+id+"/"+staffId+"/"+pic+".jpg",label:"Panel.jpg"}],
  revision:2,updatedAt:serverTimestamp()}));
 await no("staff no elimina evidencia",updateDoc(req(staff),{photos:[],revision:3,updatedAt:serverTimestamp()}));
 await yes("coordinación decide la ruta",updateDoc(req(coord),{
  repairRoute:"agencia",assignedTo:"Taller",assignedUid:"asignado-2",status:"reparacion",decisionBy:"Coordinación",
  revision:3,updatedAt:serverTimestamp()}));
 await yes("responsable ve el trabajo asignado",getDoc(req(assignee)));
 await yes("responsable consulta solo sus asignaciones",getDocs(query(collection(assignee,"agora_repair_requests"),where("assignedUid","==","asignado-2"))));
 await no("responsable no cambia autorización de coordinación",updateDoc(req(assignee),{
  status:"entregado",revision:4,updatedAt:serverTimestamp()
 }));
 await yes("responsable puede reportar avance",setDoc(doc(assignee,"agora_repair_events","avance-01"),{
  requestId:id,actorUid:"asignado-2",actorEmail:email("asignado-2"),
  action:"avance",detail:"Se reparó la base",createdAt:serverTimestamp()
 }));
 await yes("responsable consulta su propio movimiento",getDocs(query(collection(assignee,"agora_repair_events"),where("actorUid","==","asignado-2"))));
 await no("responsable no puede inventar decisiones",setDoc(doc(assignee,"agora_repair_events","fraude-01"),{
  requestId:id,actorUid:"asignado-2",actorEmail:email("asignado-2"),
  action:"decisión",detail:"Autorizado falsamente",createdAt:serverTimestamp()
 }));
 await no("coordinación no altera autoría",updateDoc(req(coord),{
  createdBy:"otro",revision:4,updatedAt:serverTimestamp()}));
 const token="A".repeat(43);
 const invite=db=>doc(db,"agora_repair_invites",token);
 const snapshotPublic={project:"Hot Cruji Bravo",asset:"Stand",area:"Panel frontal",
  problem:"Pieza desprendida",scope:"Elemento específico",priority:"Alta",
  dueDate:"2026-12-01",materialLink:"https://example.invalid/planos"};
 const inviteData=()=>({
  requestId:id,snapshot:snapshotPublic,supplierHint:"Proveedor ficticio",
  createdBy:coordId,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
  expiresAt:Timestamp.fromMillis(Date.now()+7*86400000),
  status:"pending",response:null,submittedAt:null
 });
 await no("proveedor no crea invitación sin coordinación",setDoc(invite(anon),inviteData()));
 await yes("coordinación crea enlace de cotización",setDoc(invite(coord),inviteData()));
 await yes("proveedor sin login consulta solo invitación conocida",getDoc(invite(anon)));
 await no("proveedor no lista invitaciones",getDocs(collection(anon,"agora_repair_invites")));
 await no("proveedor no modifica el problema o alcance",updateDoc(invite(anon),{
  snapshot:{...snapshotPublic,problem:"Problema adulterado"}
 }));
 await yes("proveedor envía primera propuesta",updateDoc(invite(anon),{
  status:"submitted",response:{
   provider:"Taller ficticio",email:"hola@example.invalid",amount:1800,
   scope:"Reparar panel",note:"Entrega en dos días",link:""
  },submittedAt:serverTimestamp(),updatedAt:serverTimestamp()
 }));
 await no("proveedor no modifica importe después de enviar",updateDoc(invite(anon),{
  response:{provider:"Taller ficticio",email:"",amount:1,scope:"Otro",note:"",link:""}
 }));
 await yes("coordinación puede consultar respuesta",getDoc(invite(coord)));
 await yes("coordinación revoca invitación",updateDoc(invite(coord),{
  status:"revoked",updatedAt:serverTimestamp()
 }));
 await no("invitación revocada deja de abrirse externamente",getDoc(invite(anon)));
 console.log("Comprobaciones de roles terminadas: "+checks);
}finally{await env.cleanup()}
