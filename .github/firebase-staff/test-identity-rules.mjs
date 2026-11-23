/**
 * AGORA Identidad Unica y RH - reglas en emulador con datos ficticios.
 * Nunca conecta con el proyecto real.
 */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {
  collection,doc,getDoc,getDocs,limit,query,setDoc,serverTimestamp,Timestamp,where,writeBatch
} from 'firebase/firestore';

const env=await initializeTestEnvironment({
  projectId:'demo-agora-identity',
  firestore:{host:'127.0.0.1',port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),
    rules:readFileSync('firestore.rules','utf8')}
});
let passed=0;
async function yes(label,promise){await assertSucceeds(promise);passed++;console.log('OK '+label)}
async function no(label,promise){await assertFails(promise);passed++;console.log('OK DENEGADO '+label)}

const adminId='identity-admin',coordId='identity-coord',staffId='identity-staff',otherId='identity-other';
const mail=id=>id+'@example.invalid';
const agoraId='DJV-2026-001';
const credentialId='a1b2c3d4e5f60718293a4b5c6d7e8f90';
const approvalAudit='11112222333344445555666677778888';

try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    for(const [id,role] of [[adminId,'admin'],[coordId,'coordinador']]){
      await setDoc(doc(db,'agora_users',id),{
        name:id,email:mail(id),role,active:true,createdAt:Timestamp.now(),updatedAt:Timestamp.now()
      });
    }
  });
  const anon=env.unauthenticatedContext().firestore();
  const admin=env.authenticatedContext(adminId,{email:mail(adminId),email_verified:true}).firestore();
  const coord=env.authenticatedContext(coordId,{email:mail(coordId),email_verified:true}).firestore();
  const staff=env.authenticatedContext(staffId,{email:mail(staffId),email_verified:true}).firestore();
  const other=env.authenticatedContext(otherId,{email:mail(otherId),email_verified:true}).firestore();
  // Emula un teléfono confirmado por Firebase Auth, sin correo electrónico.
  const phoneId='identity-phone';
  const phone=env.authenticatedContext(phoneId,{
    phone_number:'+525500000001',
    firebase:{sign_in_provider:'phone'}
  }).firestore();
  await yes('celular verificado puede solicitar su propio ID',setDoc(doc(phone,'agora_identity_registrations',phoneId),{
    uid:phoneId,email:'',displayName:'Staff Telefonico',
    telephone:'+525500000001',requestedJobTitle:'Staff',status:'pending',
    privacyAccepted:true,privacyVersion:'provisional-2026-11-18',
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await yes('celular lee su propia solicitud',getDoc(doc(phone,'agora_identity_registrations',phoneId)));
  await yes('celular consulta solo su perfil de usuario',getDoc(doc(phone,'agora_users',phoneId)));
  await no('celular no accede a otro usuario',getDoc(doc(phone,'agora_users',adminId)));
  await no('celular no enumera usuarios',getDocs(collection(phone,'agora_users')));
  await no('celular no accede al directorio completo',getDocs(collection(phone,'agora_identity_registry')));
  await no('celular no puede crear registros financieros',setDoc(doc(phone,'agora_finance_requests','test-phone'),{foo:'bar'}));

  await yes('persona solicita su propia identidad',setDoc(doc(staff,'agora_identity_registrations',staffId),{
    uid:staffId,email:mail(staffId),displayName:'Persona de Prueba',telephone:'5500000000',
    requestedJobTitle:'Staff',status:'pending',privacyAccepted:true,
    privacyVersion:'provisional-2026-11-18',createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await no('otra cuenta no puede solicitar identidad por un tercero',setDoc(doc(other,'agora_identity_registrations',staffId),{
    uid:staffId,email:mail(otherId),displayName:'Suplantacion de Prueba',telephone:'5500000000',
    requestedJobTitle:'Staff',status:'pending',privacyAccepted:true,
    privacyVersion:'provisional-2026-11-18',createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));

  const approval=writeBatch(admin);
  approval.set(doc(admin,'agora_identity_counters','2026'),{
    year:2026,nextSequence:2,updatedAt:serverTimestamp(),updatedBy:adminId
  });
  approval.set(doc(admin,'agora_identity_registry',agoraId),{
    uid:staffId,agoraId,displayName:'Persona de Prueba',email:mail(staffId),jobTitle:'Staff',
    rhStatus:'verified',credentialId,credentialActive:true,credentialStatus:'vigente',blockReason:'',
    coordinatorUids:[coordId],createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
    createdBy:adminId,updatedBy:adminId,lastAuditId:approvalAudit
  });
  approval.set(doc(admin,'agora_identity_links',staffId),{
    uid:staffId,agoraId,credentialId,active:true,createdAt:serverTimestamp(),createdBy:adminId
  });
  approval.update(doc(admin,'agora_identity_registrations',staffId),{
    status:'approved',agoraId,approvedAt:serverTimestamp(),approvedBy:adminId,updatedAt:serverTimestamp()
  });
  approval.set(doc(admin,'agora_identity_credentials',credentialId),{
    credentialId,agoraId,displayName:'Persona de Prueba',jobTitle:'Staff',active:true,status:'vigente',
    blockReason:'',updatedAt:serverTimestamp(),updatedBy:adminId,lastAuditId:approvalAudit
  });
  approval.set(doc(admin,'agora_identity_audit',approvalAudit),{
    actorUid:adminId,targetUid:staffId,agoraId,action:'identity_approved',createdAt:serverTimestamp()
  });
  await yes('RH emite ID, vinculo, credencial y auditoria en un lote atomico',approval.commit());

  await yes('titular lee su registro de identidad',getDoc(doc(staff,'agora_identity_registry',agoraId)));
  await yes('coordinacion asignada lee el registro operativo',getDoc(doc(coord,'agora_identity_registry',agoraId)));
  await yes('RH lista registros del directorio',getDocs(query(collection(admin,'agora_identity_registry'),limit(200))));
  await yes('RH lista solicitudes pendientes',getDocs(query(collection(admin,'agora_identity_registrations'),where('status','==','pending'),limit(100))));
  await yes('RH lista usuarios con rol coordinador',getDocs(query(collection(admin,'agora_users'),where('role','==','coordinador'),limit(200))));
  await yes('coordinacion lista solo registros asignados',getDocs(query(collection(coord,'agora_identity_registry'),where('coordinatorUids','array-contains',coordId),limit(200))));
  await no('coordinacion no puede enumerar el directorio completo',getDocs(query(collection(coord,'agora_identity_registry'),limit(200))));
  await no('persona ajena no lee el registro interno',getDoc(doc(other,'agora_identity_registry',agoraId)));
  await yes('verificacion publica lee solo la proyeccion de credencial',getDoc(doc(anon,'agora_identity_credentials',credentialId)));
  await no('visitante no puede enumerar credenciales',getDocs(collection(anon,'agora_identity_credentials')));

  await yes('titular guarda expediente privado',setDoc(doc(staff,'agora_identity_profiles',staffId),{
    uid:staffId,telephone:'5500000000',address:'Domicilio ficticio',shirtSize:'M',pantSize:'30',shoeSize:'26',
    emergencyName:'Contacto Ficticio',emergencyRelation:'Amistad',emergencyPhone:'5511111111',
    medicalNotes:'Sin datos reales',updatedAt:serverTimestamp()
  }));
  await yes('titular guarda datos fiscales ficticios',setDoc(doc(staff,'agora_identity_financial',staffId),{
    uid:staffId,rfc:'FICT010101AA0',curp:'FICT010101HDFXXX00',nss:'00000000000',bank:'Banco ficticio',
    clabe:'000000000000000000',taxRegime:'Prueba',lockedByRH:false,updatedAt:serverTimestamp()
  }));
  await no('coordinacion no lee datos medicos o de emergencia',getDoc(doc(coord,'agora_identity_profiles',staffId)));
  await no('coordinacion no lee datos bancarios o fiscales',getDoc(doc(coord,'agora_identity_financial',staffId)));
  await no('persona ajena no lee el expediente privado',getDoc(doc(other,'agora_identity_profiles',staffId)));

  const blockAudit='99990000111122223333444455556666';
  const block=writeBatch(coord);
  block.update(doc(coord,'agora_identity_registry',agoraId),{
    credentialActive:false,credentialStatus:'bloqueada',blockReason:'Fin de turno',
    updatedAt:serverTimestamp(),updatedBy:coordId,lastAuditId:blockAudit
  });
  block.update(doc(coord,'agora_identity_credentials',credentialId),{
    active:false,status:'bloqueada',blockReason:'Credencial suspendida',
    updatedAt:serverTimestamp(),updatedBy:coordId,lastAuditId:blockAudit
  });
  block.set(doc(coord,'agora_identity_audit',blockAudit),{
    actorUid:coordId,targetUid:staffId,agoraId,action:'credential_blocked',createdAt:serverTimestamp()
  });
  await yes('coordinacion asignada bloquea credencial con auditoria sincronizada',block.commit());
  await yes('publico consulta estado bloqueado sin datos privados',getDoc(doc(anon,'agora_identity_credentials',credentialId)));
  const publicSnap=await getDoc(doc(anon,'agora_identity_credentials',credentialId));
  assert.equal(publicSnap.data().blockReason,'Credencial suspendida');
  assert.notEqual(publicSnap.data().blockReason,'Fin de turno');
  await yes('RH lista auditoria',getDocs(collection(admin,'agora_identity_audit')));
  await no('publico no lee auditoria',getDocs(collection(anon,'agora_identity_audit')));
  console.log('Todas las '+passed+' pruebas de Identidad pasaron.');
}finally{
  await env.cleanup();
}
