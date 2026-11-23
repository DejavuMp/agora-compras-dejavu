/**
 * Pruebas de Storage del módulo de inventario (únicamente emuladores).
 * No carga archivos ni cuentas reales.
 */
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {doc,setDoc,Timestamp} from "firebase/firestore";
import {ref,uploadBytes,getMetadata,deleteObject} from "firebase/storage";
const projectId="demo-agora-repairs-storage";
const env=await initializeTestEnvironment({
 projectId,
 firestore:{host:"127.0.0.1",port:8080,rules:readFileSync("firestore.rules","utf8")},
 storage:{host:"127.0.0.1",port:9199,rules:readFileSync("storage.rules","utf8")}
});
const coordId="coord",staffId="staff",otherId="other";
const assetId="b130d5ec-4e3a-4d51-92b2-0d917f43ebc9",requestId="d630d5ec-4e3a-4d51-92b2-0d917f43ebc9";
const filename="fb30d5ec-4e3a-4d51-92b2-0d917f43ebc9.jpg";
const email=x=>x+"@example.invalid";
const bucket="gs://"+projectId+".appspot.com";
let count=0;
const yes=async(name,p)=>{await assertSucceeds(p);console.log("OK "+name);count++};
const no=async(name,p)=>{await assertFails(p);console.log("DENEGADO "+name);count++};
try{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,"agora_users",coordId),{name:"Coord",email:email(coordId),role:"coordinador",active:true,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
  await setDoc(doc(db,"agora_ops_members",staffId),{uid:staffId,email:email(staffId),role:"staff",personId:"staff-1",active:true,updatedAt:Timestamp.now()});
  await setDoc(doc(db,"agora_ops_members",otherId),{uid:otherId,email:email(otherId),role:"staff",personId:"staff-2",active:true,updatedAt:Timestamp.now()});
  await setDoc(doc(db,"agora_repair_assets",assetId),{createdBy:coordId});
  await setDoc(doc(db,"agora_repair_requests",requestId),{createdBy:staffId});
 });
 const coordinator=env.authenticatedContext(coordId,{email:email(coordId),email_verified:true}).storage(bucket);
 const staff=env.authenticatedContext(staffId,{email:email(staffId),email_verified:true}).storage(bucket);
 const other=env.authenticatedContext(otherId,{email:email(otherId),email_verified:true}).storage(bucket);
 const anon=env.unauthenticatedContext().storage(bucket);
 const assetPath="agora-repair-assets/"+assetId+"/"+coordId+"/"+filename;
 const reportPath="agora-repairs/"+requestId+"/"+staffId+"/"+filename;
 const photo=new Uint8Array([255,216,255,217]);
 await yes("coordinación adjunta foto de inventario",uploadBytes(ref(coordinator,assetPath),photo,{contentType:"image/jpeg"}));
 await yes("staff autorizado consulta foto del activo",getMetadata(ref(staff,assetPath)));
 await no("visitante no consulta foto del activo",getMetadata(ref(anon,assetPath)));
 await no("staff no edita inventario",uploadBytes(ref(staff,"agora-repair-assets/"+assetId+"/"+staffId+"/"+filename),photo,{contentType:"image/jpeg"}));
 await yes("staff reportante adjunta evidencia",uploadBytes(ref(staff,reportPath),photo,{contentType:"image/jpeg"}));
 await yes("coordinación consulta evidencia",getMetadata(ref(coordinator,reportPath)));
 await yes("propietario consulta evidencia",getMetadata(ref(staff,reportPath)));
 await no("otro empleado no ve evidencia",getMetadata(ref(other,reportPath)));
 await no("no se permite sobrescribir evidencia",uploadBytes(ref(staff,reportPath),photo,{contentType:"image/jpeg"}));
 await no("no se permiten fotos sin tipo JPEG",uploadBytes(ref(staff,"agora-repairs/"+requestId+"/"+staffId+"/fb30d5ec-4e3a-4d51-92b2-0d917f43ebca.jpg"),photo,{contentType:"image/png"}));
 await no("staff no borra evidencia",deleteObject(ref(staff,reportPath)));
 console.log("Pruebas de Storage aprobadas: "+count);
}finally{await env.cleanup();}
