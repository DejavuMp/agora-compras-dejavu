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
 console.log('PRUEBAS FINANZAS SUPERADAS: '+passed);
}catch(error){console.error('Fallaron pruebas de seguridad financiera');throw error}
finally{await environment.cleanup();}
