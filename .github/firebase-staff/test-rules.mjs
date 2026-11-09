/**
 * Pruebas de seguridad para reglas de Fichas Dejavú. Solo usan
 * Firebase Emulator Suite y datos inventados: NO tocan producción.
 */
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,deleteDoc,serverTimestamp,Timestamp} from 'firebase/firestore';
const projectId='demo-dejavu-fichas-staff';
const environment=await initializeTestEnvironment({
 projectId,
 firestore:{host:'127.0.0.1',port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),rules:readFileSync('firestore.rules','utf8')}
});
const PUB='dejavu_staff_publicadas';
const folio='DJV-20261109-9988776655';
const card={
 id:folio,campaign:'Campaña de prueba',responsible:'Coordinación Dejavú',
 activityDate:'2026-11-09',location:'Ubicación ficticia',
 publishedBy:'coordinador',publishedAt:serverTimestamp(),updatedAt:serverTimestamp()
};
let tests=0;
async function pass(message,promise){await assertSucceeds(promise);tests++;console.log('OK '+message)}
async function deny(message,promise){await assertFails(promise);tests++;console.log('OK bloqueado: '+message)}
try{
 await environment.withSecurityRulesDisabled(async(ctx)=>{
  const db=ctx.firestore();
  for(const [uid,role] of [['coordinador','coordinador'],['consulta','consulta'],['admin','admin']]){
   await setDoc(doc(db,'agora_users',uid),{
    email:uid+'@example.invalid',name:uid,role,active:true,
    createdAt:Timestamp.now(),updatedAt:Timestamp.now()
   });
  }
  await setDoc(doc(db,'dejavu_staff_fichas',folio),{
   campaign:'Expediente privado de prueba',
   staffEmail:'destinataria@example.invalid',
   activityDate:'2026-11-09',
   location:'Lugar inventado'
  });
 });
 const anon=environment.unauthenticatedContext().firestore();
 const staff=environment.authenticatedContext('consulta',{email:'consulta@example.invalid',email_verified:true}).firestore();
 const outsider=environment.authenticatedContext('sin-registro',{email:'externo@example.invalid',email_verified:true}).firestore();
 const editor=environment.authenticatedContext('coordinador',{email:'coordinador@example.invalid',email_verified:true}).firestore();
 const recipient=environment.authenticatedContext('destinataria',{email:'destinataria@example.invalid',email_verified:true}).firestore();
 await pass('cualquier visitante puede consultar el catálogo expresamente publicado',getDocs(collection(anon,PUB)));
 await deny('un visitante no puede publicar',setDoc(doc(anon,PUB,folio),card));
 await deny('una cuenta sin rol no puede publicar',setDoc(doc(outsider,PUB,folio),card));
 await deny('un rol de consulta no puede publicar',setDoc(doc(staff,PUB,folio),card));
 await deny('no se pueden publicar correos de trabajadores',setDoc(doc(editor,PUB,folio),{...card,staffEmail:'privado@example.invalid'}));
 await pass('un coordinador autorizado puede publicar una ficha mínima',setDoc(doc(editor,PUB,folio),card));
 await pass('el staff puede leer la ficha ya publicada sin autenticar',getDoc(doc(anon,PUB,folio)));
 await pass('el staff puede listar fichas publicadas',getDocs(collection(anon,PUB)));
 await deny('un visitante no puede modificar fichas',setDoc(doc(anon,PUB,folio),{location:'Modificación'} ,{merge:true}));
 await deny('un rol consulta no puede borrar fichas',deleteDoc(doc(staff,PUB,folio)));
 await pass('un coordinador puede corregir ficha publicada',setDoc(doc(editor,PUB,folio),{location:'Ubicación actualizada',updatedAt:serverTimestamp()},{merge:true}));
 await deny('un visitante no puede listar los expedientes privados',getDocs(collection(anon,'dejavu_staff_fichas')));
 await deny('un visitante no puede leer compras privadas',getDoc(doc(anon,'agora_records','orders_demo')));
 await deny('un visitante no puede leer cuentas internas',getDoc(doc(anon,'agora_users','admin')));
 await deny('una cuenta ajena no puede ver ficha privada asignada a otra persona',getDoc(doc(outsider,'dejavu_staff_fichas',folio)));
 await pass('el destinatario verificado sí puede consultar su ficha privada',getDoc(doc(recipient,'dejavu_staff_fichas',folio)));
 await pass('el coordinador puede retirar una ficha del catálogo',deleteDoc(doc(editor,PUB,folio)));
 assert.equal(tests,17);
 console.log('Todas las '+tests+' pruebas de permisos pasaron.');
}catch(error){console.error('Falló el control de seguridad del catálogo de Staff');throw error}
finally{await environment.cleanup()}
