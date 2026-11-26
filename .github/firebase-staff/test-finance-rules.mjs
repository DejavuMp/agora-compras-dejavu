/**
 * ÁGORA Finanzas · pruebas con datos ficticios. No toca Firebase real.
 * Ejecutar dentro de Firebase Emulator Suite con rules-unit-testing.
 */
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,query,where,setDoc,getDoc,getDocs,updateDoc,serverTimestamp,Timestamp} from 'firebase/firestore';
const environment=await initializeTestEnvironment({
 projectId:'demo-agora-finanzas',
 firestore:{
  host:'127.0.0.1',
  port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),
  rules:readFileSync('firestore.rules','utf8')
 }
});
const COLL='agora_finance_requests';
const baseHistory={kind:'solicitud',by:'coordinacion@example.invalid',at:'2026-11-15T10:00:00.000Z',note:'Solicitud creada'};
const baseRequest=id=>({
 schema:1,id,folio:'RF-2026-'+id,category:'materiales',
 project:'Proyecto de prueba',client:'Cliente ficticio',requester:'Coordinación',
 dateNeeded:'2026-12-01',priority:'normal',reason:'Insumos para producción',
 paymentType:'entrega',paymentMethod:'transferencia',beneficiary:'Beneficiario ficticio',
 beneficiaryEmail:'contacto@example.invalid',bank:'Banco ficticio',account:'123456789012345678',
 notes:'',attachments:[],items:[{description:'Material de prueba',quantity:3,unitPrice:500}],
 total:1500,status:'pendiente',approvedAmount:0,paidAmount:0,payments:[],
 decisionNote:'',decisionBy:'',history:[baseHistory],createdBy:'coord',
 createdByEmail:'coordinacion@example.invalid',createdAt:serverTimestamp(),
 updatedAt:serverTimestamp(),updatedBy:'coord'
});
let passed=0;
async function yes(label,p){await assertSucceeds(p);passed++;console.log('OK '+label);}
async function no(label,p){await assertFails(p);passed++;console.log('OK bloqueado: '+label);}
try{
 await environment.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [id,role,email] of [
   ['coord','coordinador','coordinacion@example.invalid'],
   ['otro','coordinador','otro@example.invalid'],
   ['admin','admin','admin@example.invalid'],
   ['consulta','consulta','consulta@example.invalid']
  ])await setDoc(doc(d,'agora_users',id),{
   active:true,role,name:id,email,createdAt:Timestamp.now(),updatedAt:Timestamp.now()
  });
 });
 const anon=environment.unauthenticatedContext().firestore();
 const outsider=environment.authenticatedContext('no-registrado',{email:'externo@example.invalid',email_verified:true}).firestore();
 const consult=environment.authenticatedContext('consulta',{email:'consulta@example.invalid',email_verified:true}).firestore();
 const coord=environment.authenticatedContext('coord',{email:'coordinacion@example.invalid',email_verified:true}).firestore();
 const other=environment.authenticatedContext('otro',{email:'otro@example.invalid',email_verified:true}).firestore();
 const admin=environment.authenticatedContext('admin',{email:'admin@example.invalid',email_verified:true}).firestore();
 const id='test-finance-01',ref=db=>doc(db,COLL,id);
 const request=baseRequest(id);
 await no('visitante no puede listar solicitudes',getDocs(collection(anon,COLL)));
 await no('visitante no puede crear solicitudes',setDoc(ref(anon),request));
 await no('usuario sin perfil no puede crear',setDoc(ref(outsider),request));
 await no('rol consulta no puede crear',setDoc(ref(consult),request));
 await yes('coordinación crea su propia solicitud',setDoc(ref(coord),request));
 await yes('creador puede leer su solicitud',getDoc(ref(coord)));
 await yes('creador puede listar las suyas',getDocs(query(collection(coord,COLL),where('createdBy','==','coord'))));
 await no('coordinación no puede listar todo el archivo',getDocs(collection(coord,COLL)));
 await no('otra coordinación no puede leer esta solicitud',getDoc(ref(other)));
 await no('consulta no puede leer solicitud de terceros',getDoc(ref(consult)));
 await yes('administración puede consultar todo',getDocs(collection(admin,COLL)));
 await no('creador no puede aprobar su propia solicitud sin ser admin',updateDoc(ref(coord),{
  status:'aprobada',approvedAmount:1500,decisionBy:'coordinacion@example.invalid',
  history:[baseHistory,{kind:'evento',by:'coordinacion@example.invalid',at:'2026-11-15T10:01:00.000Z',note:'Autorizada'}],
  updatedBy:'coord',updatedAt:serverTimestamp()
 }));
 await yes('creador puede corregir solicitud pendiente',updateDoc(ref(coord),{
  notes:'Cotización corregida',
  history:[baseHistory,{kind:'revision',by:'coordinacion@example.invalid',at:'2026-11-15T10:02:00.000Z',note:'Corrección'}],
  updatedBy:'coord',updatedAt:serverTimestamp()
 }));
 const revised=[baseHistory,{kind:'revision',by:'coordinacion@example.invalid',at:'2026-11-15T10:02:00.000Z',note:'Corrección'}];
 await yes('admin puede aprobar la solicitud completa',updateDoc(ref(admin),{
  status:'aprobada',approvedAmount:1500,decisionBy:'admin@example.invalid',
  history:[...revised,{kind:'evento',by:'admin@example.invalid',at:'2026-11-15T10:03:00.000Z',note:'Aprobada'}],
  updatedBy:'admin',updatedAt:serverTimestamp()
 }));
 const approvedHistory=[...revised,{kind:'evento',by:'admin@example.invalid',at:'2026-11-15T10:03:00.000Z',note:'Aprobada'}];
 await no('coordinación no puede inventar transferencia',updateDoc(ref(coord),{
  status:'pagada',paidAmount:1500,
  payments:[{amount:1500,date:'2026-11-15',method:'transferencia',reference:'FICTICIA'}],
  history:[...approvedHistory,{kind:'evento',by:'coordinacion@example.invalid',at:'2026-11-15T10:04:00.000Z',note:'Pago'}],
  updatedBy:'coord',updatedAt:serverTimestamp()
 }));
 await no('admin no puede reescribir cuenta bancaria después de aprobar',updateDoc(ref(admin),{
  account:'000000000000000000',updatedBy:'admin',updatedAt:serverTimestamp()
 }));
 const first={id:'payment-01',amount:500,date:'2026-11-15',method:'transferencia',reference:'Prueba1'};
 const second={id:'payment-02',amount:1000,date:'2026-11-15',method:'transferencia',reference:'Prueba2'};
 await yes('admin registra pago parcial',updateDoc(ref(admin),{
  payments:[first],paidAmount:500,status:'pago_parcial',
  history:[...approvedHistory,{kind:'evento',by:'admin@example.invalid',at:'2026-11-15T10:05:00.000Z',note:'Pago parcial'}],
  updatedBy:'admin',updatedAt:serverTimestamp()
 }));
 const partHistory=[...approvedHistory,{kind:'evento',by:'admin@example.invalid',at:'2026-11-15T10:05:00.000Z',note:'Pago parcial'}];
 await yes('admin registra pago final',updateDoc(ref(admin),{
  payments:[first,second],paidAmount:1500,status:'pagada',
  history:[...partHistory,{kind:'evento',by:'admin@example.invalid',at:'2026-11-15T10:06:00.000Z',note:'Liquidada'}],
  updatedBy:'admin',updatedAt:serverTimestamp()
 }));
 await no('no se permite borrar solicitudes con historial',import('firebase/firestore').then(m=>m.deleteDoc(ref(admin))));
 const eventId='jornada-qa',personId='persona-qa';
 const hoursId='horas~'+eventId+'~'+personId;
 const hoursRef=db=>doc(db,COLL,hoursId);
 await environment.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'agora_ops_attendance_sheets',eventId,'approvals',personId),{
   status:'horas_validadas',eventId,personId,approvedMinutes:240,personName:'Beneficiario ficticio'
  });
 });
 const linked={...baseRequest(hoursId),folio:'RF-QA-HORAS',category:'nomina',
  createdBy:'admin',updatedBy:'admin',createdByEmail:'admin@example.invalid',
  hoursOrigin:{eventId,personId,approvedMinutes:240},paymentReferences:[]};
 await no('perfil Consulta no puede crear obligación vinculada',setDoc(hoursRef(consult),linked));
 await no('coordinación no crea obligación vinculada',setDoc(hoursRef(coord),{
  ...linked,createdBy:'coord',updatedBy:'coord',createdByEmail:'coordinacion@example.invalid'
 }));
 await no('administración no puede alterar los minutos validados',setDoc(hoursRef(admin),{
  ...linked,hoursOrigin:{eventId,personId,approvedMinutes:241}
 }));
 await no('un segundo folio para la misma validación se bloquea',setDoc(doc(admin,COLL,'horas-alternas'),{
  ...linked,id:'horas-alternas'
 }));
 await no('el espacio de folios de horas requiere una validación',setDoc(hoursRef(admin),{
  ...baseRequest(hoursId),folio:'RF-QA-HORAS',createdBy:'admin',updatedBy:'admin',createdByEmail:'admin@example.invalid'
 }));
 await yes('Finanzas crea la obligación vinculada y pendiente',setDoc(hoursRef(admin),linked));
 await no('un reintento no puede reemplazar la obligación',setDoc(hoursRef(admin),linked));
 await no('coordinación no lee la obligación financiera',getDoc(hoursRef(coord)));
 const hoursHistory=[baseHistory,{kind:'evento',by:'admin@example.invalid',at:'2026-11-16T10:00:00.000Z',note:'Importe autorizado'}];
 await yes('Finanzas autoriza el importe vinculado',updateDoc(hoursRef(admin),{
  status:'aprobada',approvedAmount:1500,decisionBy:'admin@example.invalid',
  history:hoursHistory,updatedBy:'admin',updatedAt:serverTimestamp()
 }));
 function hoursPayment(prior,payments,refs,paid,status){
  return {payments,paymentReferences:refs,paidAmount:paid,status,
   history:[...prior,{kind:'evento',by:'admin@example.invalid',at:'2026-11-16T10:00:00.000Z',note:'Pago QA'}],
   updatedBy:'admin',updatedAt:serverTimestamp()};
 }
 const partial={...first,reference:'REF-QA-1'};
 const last={...second,reference:'REF-QA-2'};
 await no('no se puede reescribir historial al registrar pago',updateDoc(hoursRef(admin),
  hoursPayment([{...baseHistory,note:'Retocado'},hoursHistory[1]],[partial],['REF-QA-1'],500,'pago_parcial')));
 const paid=hoursPayment(hoursHistory,[partial],['REF-QA-1'],500,'pago_parcial');
 await yes('Finanzas registra un pago parcial ficticio',updateDoc(hoursRef(admin),paid));
 await no('la misma referencia no puede utilizarse otra vez',updateDoc(hoursRef(admin),
  hoursPayment(paid.history,[partial,{...last,reference:'REF-QA-1'}],['REF-QA-1','REF-QA-1'],1500,'pagada')));
 await no('el pago agregado debe coincidir con saldo registrado',updateDoc(hoursRef(admin),
  hoursPayment(paid.history,[partial,{...last,amount:999}],['REF-QA-1','REF-QA-2'],1500,'pagada')));
 await yes('Finanzas liquida el saldo ficticio con otra referencia',updateDoc(hoursRef(admin),
  hoursPayment(paid.history,[partial,last],['REF-QA-1','REF-QA-2'],1500,'pagada')));
 await environment.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'agora_ops_logs','legado-qa'),{eventId,personId,revision:2,paymentStatus:'pagado'});
 });
 const auditRef=(db,n)=>doc(db,'agora_finance_audit','01234567-1234-1234-1234-'+String(n).padStart(12,'0'));
 const audit={kind:'legado',requestId:hoursId,legacyId:'legado-qa',legacyRevision:2,decision:'pago_previo',
  reference:'RECIBO-QA',evidenceUrl:'',note:'Registro histórico cotejado',createdBy:'admin',createdAt:serverTimestamp()};
 await no('Coordinación no crea revisiones de Finanzas',setDoc(auditRef(coord,1),{...audit,createdBy:'coord'}));
 await no('No se concilia una revisión antigua del legado',setDoc(auditRef(admin,2),{...audit,legacyRevision:1}));
 await no('No se concilian folios y jornadas distintos',setDoc(auditRef(admin,3),{...audit,requestId:id}));
 await yes('Administración registra una decisión de conciliación',setDoc(auditRef(admin,4),audit));
 await no('Coordinación no lee la bitácora de conciliación',getDoc(auditRef(coord,4)));
 await no('Administración no altera la revisión original',updateDoc(auditRef(admin,4),{note:'Otra nota'}));
 const expense={...audit,kind:'comprobante',requestId:id,legacyId:'',legacyRevision:0,
  decision:'evidencia_recibida',evidenceUrl:'https://example.invalid/qa'};
 await yes('Administración vincula comprobante de un anticipo entregado',setDoc(auditRef(admin,5),expense));
 await no('Se rechaza evidencia que no sea HTTPS',setDoc(auditRef(admin,6),{...expense,evidenceUrl:'http://example.invalid/qa'}));
 await no('Se rechaza un comprobante con importe inventado',setDoc(auditRef(admin,7),{...expense,paidAmount:5}));
 await no('Se rechaza comprobante con folio inexistente',setDoc(auditRef(admin,8),{...expense,requestId:'inexistente'}));
 console.log('PRUEBAS FINANZAS SUPERADAS: '+passed);
}catch(error){console.error('Fallaron pruebas de seguridad financiera');throw error}
finally{await environment.cleanup();}
