/**
 * ÁGORA Operaciones V4 · seguridad en emulador (identidades ficticias).
 * Nunca conecta con el proyecto real.
 */
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {
  doc,collection,query,where,getDoc,getDocs,setDoc,updateDoc,
  serverTimestamp,Timestamp
} from 'firebase/firestore';
const env=await initializeTestEnvironment({
  projectId:'demo-agora-ops',
  firestore:{host:'127.0.0.1',port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),
             rules:readFileSync('firestore.rules','utf8')}
});
let passed=0;
async function yes(label,p){await assertSucceeds(p);console.log('OK '+label);passed++;}
async function no(label,p){await assertFails(p);console.log('OK DENEGADO '+label);passed++;}
const personId='staff-01';
const adminId='opsadmin';
const coordId='opscoord';
const staffId='opsstaff';
const otherId='otroexterno';
const email=(id)=>id+'@example.invalid';
const payload=()=>({
 people:[{id:personId,name:'Personal ficticio',role:'Montaje',authUid:staffId,hourRate:120,dayRate:900,active:true}],
 vehicles:[{id:'car-01',name:'Camioneta ficticia',active:true}],
 events:[],blocks:[],sites:[],campaigns:[],settings:{dailyLimit:8,weeklyLimit:48},audit:[]
});
const sched=(db)=>doc(db,'agora_ops_control','schedule');
const view=(db,uid=staffId)=>doc(db,'agora_ops_staff',uid);
const member=(db,uid=staffId)=>doc(db,'agora_ops_members',uid);
const request=(db,uid=staffId)=>doc(db,'agora_ops_access_requests',uid);
const log=(db,id='log001')=>doc(db,'agora_ops_logs',id);
const inc=(db,id='inc001')=>doc(db,'agora_ops_incidents',id);
const logData=()=>({
 id:'log001',personId,ownerUid:staffId,eventId:'event001',
 start:'2026-12-01T09:00',end:'2026-12-01T18:00',breakMins:30,
 activity:'Montaje de ejemplo',place:'Sede ficticia',notes:'',
 paymentBasis:'hora',paymentStatus:'capturado',
 revision:1,updatedAt:serverTimestamp()
});
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    for(const [id,role] of [[adminId,'admin'],[coordId,'coordinador'],['lector','consulta']]){
      await setDoc(doc(db,'agora_users',id),{
        name:id,email:email(id),role,active:true,createdAt:Timestamp.now(),updatedAt:Timestamp.now()
      });
    }
  });
  const anon=env.unauthenticatedContext().firestore();
  const admin=env.authenticatedContext(adminId,{email:email(adminId),email_verified:true}).firestore();
  const coord=env.authenticatedContext(coordId,{email:email(coordId),email_verified:true}).firestore();
  const staff=env.authenticatedContext(staffId,{email:email(staffId),email_verified:true}).firestore();
  const outsider=env.authenticatedContext(otherId,{email:email(otherId),email_verified:true}).firestore();
  const viewer=env.authenticatedContext('lector',{email:email('lector'),email_verified:true}).firestore();
  await no('anónimo no puede leer agenda',getDoc(sched(anon)));
  await no('lector consulta no puede leer tarifas',getDoc(sched(viewer)));
  await no('externo no puede leer agenda',getDoc(sched(outsider)));
  await yes('coordinación crea agenda protegida',setDoc(sched(coord),{
    revision:1,payload:payload(),updatedAt:serverTimestamp(),updatedBy:coordId
  }));
  await yes('administración consulta agenda',getDoc(sched(admin)));
  await no('staff sin vincular no puede leer agenda',getDoc(sched(staff)));
  await no('staff sin vincular no puede leer fichas ajenas',getDoc(view(staff,'otro')));
  await no('externo no puede solicitar por otro UID',setDoc(request(outsider,staffId),{
    uid:staffId,name:'Falso',email:email(otherId),status:'pendiente',createdAt:serverTimestamp()
  }));
  await yes('staff solicita acceso con cuenta propia',setDoc(request(staff),{
    uid:staffId,name:'Persona ficticia',email:email(staffId),status:'pendiente',createdAt:serverTimestamp()
  }));
  await yes('coordinador lee solicitudes',getDocs(collection(coord,'agora_ops_access_requests')));
  await no('externo no puede listar solicitudes',getDocs(collection(outsider,'agora_ops_access_requests')));
  await no('staff no puede autorizar su propia cuenta',setDoc(member(staff),{
    uid:staffId,email:email(staffId),role:'staff',personId,active:true,updatedAt:serverTimestamp()
  }));
  await yes('coordinación autoriza perfil individual',setDoc(member(coord),{
    uid:staffId,email:email(staffId),role:'staff',personId,active:true,updatedAt:serverTimestamp()
  }));
  await yes('coordinación publica ficha reducida',setDoc(view(coord),{
    uid:staffId,personId,person:{id:personId,name:'Personal ficticio',role:'Montaje',active:true},
    events:[],vehicles:[],sites:[],campaigns:[],settings:{dailyLimit:8},
    updatedAt:serverTimestamp()
  }));
  await yes('staff ve sólo su ficha',getDoc(view(staff)));
  await no('staff no puede consultar agenda completa con salarios',getDoc(sched(staff)));
  await no('staff no puede modificar sus asignaciones',updateDoc(view(staff),{
    person:{id:personId,name:'Manipulado'},updatedAt:serverTimestamp()
  }));
  await no('staff no puede modificar la agenda',updateDoc(sched(staff),{
    revision:2,updatedBy:staffId,updatedAt:serverTimestamp()
  }));
  await no('coordinador no puede saltarse el número de revisión',updateDoc(sched(coord),{
    revision:9,updatedBy:coordId,updatedAt:serverTimestamp()
  }));
  await yes('staff registra sus propias horas',setDoc(log(staff),logData()));
  await yes('staff ve su propio registro',getDoc(log(staff)));
  await yes('staff consulta solo sus registros',getDocs(query(collection(staff,'agora_ops_logs'),where('ownerUid','==',staffId))));
  await no('staff no puede listar todos los pagos',getDocs(collection(staff,'agora_ops_logs')));
  await no('otro empleado no puede leer este registro',getDoc(log(outsider)));
  await no('staff no puede registrar horas de otra persona',setDoc(log(staff,'log002'),{
    ...logData(),id:'log002',personId:'otra-persona'
  }));
  await yes('staff solicita revisión de pago',updateDoc(log(staff),{
    paymentStatus:'solicitado',requestedAmount:null,requestedRate:null,
    requestedHours:8.5,revision:2,updatedAt:serverTimestamp()
  }));
  await no('staff no puede aprobar sueldos',updateDoc(log(staff),{
    paymentStatus:'validado',approvedAmount:99999,revision:3,updatedAt:serverTimestamp()
  }));
  await yes('coordinador valida el registro',updateDoc(log(coord),{
    paymentStatus:'validado',approvedAmount:850,approvedHours:8.5,
    revision:3,updatedAt:serverTimestamp()
  }));
  await no('staff no puede sobrescribir registro validado',updateDoc(log(staff),{
    paymentStatus:'capturado',revision:4,updatedAt:serverTimestamp()
  }));
  await yes('staff reporta incidencia',setDoc(inc(staff),{
    id:'inc001',personId,ownerUid:staffId,eventId:'event001',type:'retardo',
    notes:'Tráfico ficticio',status:'pendiente',revision:1,updatedAt:serverTimestamp()
  }));
  await no('staff no puede justificar su propio retardo',updateDoc(inc(staff),{
    status:'justificado',revision:2,updatedAt:serverTimestamp()
  }));
  await yes('coordinador revisa incidencia',updateDoc(inc(coord),{
    status:'justificado',revision:2,updatedAt:serverTimestamp()
  }));
  await no('staff no puede declararse asistencia correcta',setDoc(inc(staff,'asistencia-qa'),{
    id:'asistencia-qa',personId,ownerUid:staffId,eventId:'event001',
    type:'validacion_asistencia',status:'pendiente',notes:'',
    revision:1,updatedAt:serverTimestamp()
  }));
  await yes('coordinación crea validación de asistencia manual',setDoc(inc(coord,'asistencia-qa'),{
    id:'asistencia-qa',personId,ownerUid:staffId,eventId:'event001',
    type:'validacion_asistencia',status:'correcta',notes:'Revisado por coordinación',
    revision:1,updatedAt:serverTimestamp()
  }));
  await no('staff no puede cambiar validación de coordinación',updateDoc(inc(staff,'asistencia-qa'),{
    status:'retardo',notes:'Manipulado',revision:2,updatedAt:serverTimestamp()
  }));
  await yes('coordinación puede corregir validación manual',updateDoc(inc(coord,'asistencia-qa'),{
    status:'justificada',notes:'Documentación comprobada',revision:2,updatedAt:serverTimestamp()
  }));
  await no('staff no puede fijar fecha de nómina',updateDoc(log(staff),{
    paymentDueDate:'2026-12-12',revision:4,updatedAt:serverTimestamp()
  }));
  await yes('coordinación fija la fecha prevista del pago',updateDoc(log(coord),{
    paymentDueDate:'2026-12-12',revision:4,updatedAt:serverTimestamp()
  }));
  console.log('ÁGORA OPS V4: '+passed+' pruebas terminadas.');
}finally{await env.cleanup();}
