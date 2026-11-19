/** Pruebas de seguridad de marcajes y rutas con Firestore Emulator.
 * Todos los usuarios y datos son ficticios; nunca se conecta a producción.
 */
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertSucceeds,assertFails} from "@firebase/rules-unit-testing";
import {doc,collection,query,where,getDoc,getDocs,setDoc,updateDoc,serverTimestamp,Timestamp}
  from "firebase/firestore";
const env=await initializeTestEnvironment({
  projectId:"demo-agora-jornadas",
  firestore:{host:"127.0.0.1",port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),
    rules:readFileSync("firestore.rules","utf8")}
});
let ok=0;
const yes=async(label,p)=>{await assertSucceeds(p);console.log("OK "+label);ok++};
const no=async(label,p)=>{await assertFails(p);console.log("DENEGADO "+label);ok++};
const as=(id)=>env.authenticatedContext(id,{email:id+"@example.invalid",email_verified:true}).firestore();
const admin=as("coord"),staff=as("staff1"),other=as("staff2"),anon=env.unauthenticatedContext().firestore();
const id="staff1_jornadaA",otherId="staff2_jornadaA";
const access=db=>doc(db,"agora_ops_shift_access",id);
const punch=db=>doc(db,"agora_ops_clock",id);
const trip=db=>doc(db,"agora_ops_trips",id);
const pause=db=>doc(db,"agora_ops_breaks",id+"_1");
const breakRecord=(extra={})=>({
  ownerUid:"staff1",personId:"persona1",eventId:"jornadaA",slot:"1",
  status:"en_descanso",startedAt:serverTimestamp(),updatedAt:serverTimestamp(),...extra
});

const geo={lat:19.43261,lng:-99.13321,accuracy:16};
const start=Timestamp.fromMillis(Date.now()-3600000);
const end=Timestamp.fromMillis(Date.now()+3*3600000);
const policy=(extra={})=>({
  ownerUid:"staff1",personId:"persona1",eventId:"jornadaA",enabled:true,
  mode:"horas",maxMinutes:120,startsAt:start,endsAt:end,
  updatedBy:"coord",updatedAt:serverTimestamp(),...extra
});
const createPunch=(extra={})=>({
  ownerUid:"staff1",personId:"persona1",eventId:"jornadaA",
  activity:"Volanteo de muestra",status:"en_curso",startGeo:geo,
  startedAt:serverTimestamp(),lastGeo:geo,lastGeoAt:serverTimestamp(),
  updatedAt:serverTimestamp(),...extra
});
const createTrip=(extra={})=>({
  ownerUid:"staff1",personId:"persona1",eventId:"jornadaA",
  origin:"Salida ficticia",destination:"Sucursal ficticia",
  travelMin:30,bufferMin:15,status:"en_ruta",
  startedAt:serverTimestamp(),updatedAt:serverTimestamp(),...extra
});
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,"agora_users","coord"),{
      name:"Coord QA",email:"coord@example.invalid",role:"coordinador",active:true,
      createdAt:Timestamp.now(),updatedAt:Timestamp.now()
    });
    await setDoc(doc(db,"agora_ops_members","staff1"),{
      uid:"staff1",personId:"persona1",role:"staff",active:true,
      email:"staff1@example.invalid",updatedAt:Timestamp.now()
    });
    await setDoc(doc(db,"agora_ops_members","staff2"),{
      uid:"staff2",personId:"persona2",role:"staff",active:true,
      email:"staff2@example.invalid",updatedAt:Timestamp.now()
    });
  });
  await no("anónimo no lee políticas",getDoc(access(anon)));
  await no("staff no se habilita a sí mismo",setDoc(access(staff),policy({updatedBy:"staff1"})));
  await yes("coordinación habilita cupo horario",setDoc(access(admin),policy()));
  await yes("personal lee su acceso",getDoc(access(staff)));
  await no("otro integrante no lee la política",getDoc(access(other)));
  await no("staff no lista políticas ajenas",getDocs(collection(staff,"agora_ops_shift_access")));
  await yes("staff consulta solo sus políticas",getDocs(query(collection(staff,"agora_ops_shift_access"),where("ownerUid","==","staff1"))));
  await no("staff no cambia límites de horas",updateDoc(access(staff),{maxMinutes:720,updatedAt:serverTimestamp()}));
  await no("otro integrante no marca asistencia ajena",setDoc(doc(other,"agora_ops_clock",id),createPunch()));
  await no("marcaje falso fuera de rango GPS",setDoc(punch(staff),createPunch({startGeo:{lat:999,lng:-99.13,accuracy:20}})));
  await no("personal no inventa hora de entrada",setDoc(punch(staff),createPunch({startedAt:Timestamp.fromMillis(Date.now()-600000)})));
  await yes("entrada legítima registra hora del servidor",setDoc(punch(staff),createPunch()));
  await yes("staff lee su entrada",getDoc(punch(staff)));
  await no("otro integrante no consulta entrada",getDoc(punch(other)));
  await no("staff no lista todas las entradas",getDocs(collection(staff,"agora_ops_clock")));
  await yes("consulta filtrada por UID",getDocs(query(collection(staff,"agora_ops_clock"),where("ownerUid","==","staff1"))));
  await no("imposible editar hora de inicio",updateDoc(punch(staff),{startedAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await no("imposible cambiar cuenta propietaria",updateDoc(punch(staff),{ownerUid:"staff2",updatedAt:serverTimestamp()}));
  await yes("actualiza último GPS durante jornada",updateDoc(punch(staff),{
    lastGeo:{lat:19.434,lng:-99.132,accuracy:22},
    lastGeoAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await no("anónimo no consulta descanso",getDoc(pause(anon)));
  await no("otra cuenta no crea descanso ajeno",setDoc(pause(other),breakRecord()));
  await no("no se pueden registrar más de ocho descansos",setDoc(doc(staff,"agora_ops_breaks",id+"_9"),breakRecord({slot:"9"})));
  await no("no se falsifica la hora de inicio de descanso",setDoc(pause(staff),breakRecord({
    startedAt:Timestamp.fromMillis(Date.now()-300000)
  })));
  await yes("inicio de descanso certificado por Firebase",setDoc(pause(staff),breakRecord()));
  await yes("staff consulta su descanso",getDoc(pause(staff)));
  await no("otro integrante no lee descanso",getDoc(pause(other)));
  await no("staff no lista descansos de todo el equipo",getDocs(collection(staff,"agora_ops_breaks")));
  await yes("staff consulta solo descansos propios",getDocs(query(collection(staff,"agora_ops_breaks"),where("ownerUid","==","staff1"))));
  await no("no se cambia la cuenta de un descanso",updateDoc(pause(staff),{ownerUid:"staff2",updatedAt:serverTimestamp()}));
  await no("no se falsifica la reanudación",updateDoc(pause(staff),{
    status:"reanudado",endedAt:Timestamp.fromMillis(Date.now()-300000),updatedAt:serverTimestamp()
  }));
  await yes("reanudación certificada por Firebase",updateDoc(pause(staff),{
    status:"reanudado",endedAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await no("no se vuelve a abrir un descanso cerrado",updateDoc(pause(staff),{
    status:"en_descanso",updatedAt:serverTimestamp()
  }));
  await yes("coordinación puede bloquear cuenta",setDoc(access(admin),policy({enabled:false})));
  await no("staff bloqueado no puede hacer nuevo traslado",setDoc(trip(staff),createTrip()));
  await yes("salida sin GPS sigue permitida tras bloqueo",updateDoc(punch(staff),{
    status:"finalizada",endNote:"Jornada cerrada, GPS no disponible",
    endedAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await no("no se inicia descanso después del cierre oficial",setDoc(doc(staff,"agora_ops_breaks",id+"_2"),breakRecord({slot:"2"})));
  await no("no se puede reabrir jornada cerrada",updateDoc(punch(staff),{
    status:"en_curso",updatedAt:serverTimestamp()
  }));
  await yes("coordinación reactiva al personal",setDoc(access(admin),policy()));
  await yes("staff inicia traslado con duración manual",setDoc(trip(staff),createTrip()));
  await no("otro empleado no lee traslado",getDoc(trip(other)));
  await no("staff no lista rutas ajenas",getDocs(collection(staff,"agora_ops_trips")));
  await yes("staff lee únicamente sus traslados",getDocs(query(collection(staff,"agora_ops_trips"),where("ownerUid","==","staff1"))));
  await no("staff no reescribe hora de salida",updateDoc(trip(staff),{
    startedAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await yes("staff marca llegada real GPS",updateDoc(trip(staff),{
    status:"llegue",arrivalGeo:geo,arrivedAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await no("no se altera llegada ya cerrada",updateDoc(trip(staff),{
    status:"en_ruta",updatedAt:serverTimestamp()
  }));
  await yes("coordinación ve marcajes",getDocs(collection(admin,"agora_ops_clock")));
  await yes("coordinación ve viajes",getDocs(collection(admin,"agora_ops_trips")));
  console.log("Jornadas QA: "+ok+" comprobaciones.");
}finally{await env.cleanup()}
