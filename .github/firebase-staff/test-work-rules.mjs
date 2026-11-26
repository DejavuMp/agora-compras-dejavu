import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {doc,setDoc,getDoc,updateDoc,serverTimestamp,Timestamp} from "firebase/firestore";
const env=await initializeTestEnvironment({projectId:"demo-agora-work",firestore:{host:"127.0.0.1",port:Number(process.env.FIRESTORE_EMULATOR_PORT||8080),rules:readFileSync("firestore.rules","utf8")}});
try{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,"agora_users","admin"),{active:true,role:"admin"});
  await setDoc(doc(db,"agora_users","coord"),{active:true,role:"coordinador"});
  for(const [uid,personId] of [["staffA","A"],["staffB","B"]]){
   await setDoc(doc(db,"agora_ops_members",uid),{active:true,role:"staff",personId,uid,email:uid+"@example.invalid",updatedAt:Timestamp.now()});
   await setDoc(doc(db,"agora_ops_staff",uid),{uid,personId,person:{},events:[],vehicles:[],sites:[],campaigns:[],settings:{},updatedAt:Timestamp.now()});
  }
 });
 const ctx=id=>env.authenticatedContext(id,{email:id+"@example.invalid",email_verified:true}).firestore();
 const admin=ctx("admin"),coord=ctx("coord"),a=ctx("staffA"),b=ctx("staffB");
 const finance=doc(admin,"agora_finance_requests","private");
 await env.withSecurityRulesDisabled(async x=>setDoc(doc(x.firestore(),"agora_finance_requests","private"),{bank:"Banco privado",account:"1234567890"}));
 await assertFails(getDoc(doc(a,"agora_finance_requests","private")));
 await assertFails(getDoc(doc(b,"agora_finance_requests","private")));
 const view={ownerUid:"staffA",personId:"A",eventId:"event",project:"Prueba",concept:"Horas",date:"2026-11-26",approvedAmount:100,paidAmount:20,balance:80,status:"pago_parcial",lastPaidAt:"2026-11-26",reconciliation:true,sourceRevision:Timestamp.now(),updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(admin,"agora_staff_payment_views","payment"),view));
 await assertSucceeds(getDoc(doc(a,"agora_staff_payment_views","payment")));
 await assertFails(getDoc(doc(b,"agora_staff_payment_views","payment")));
 await assertFails(updateDoc(doc(a,"agora_staff_payment_views","payment"),{paidAmount:100}));
 await assertSucceeds(setDoc(doc(a,"agora_staff_payment_feedback","reply"),{ownerUid:"staffA",paymentId:"payment",response:"aclaracion",note:"Revisar",createdAt:serverTimestamp(),status:"pendiente"}));
 await assertFails(getDoc(doc(b,"agora_staff_payment_feedback","reply")));
 const state={ownerUid:"staffA",personId:"A",eventId:"event",linkId:"link",state:"enviado",note:"",evidence:"",linkVersion:1,linkUrl:"https://example.invalid/form",verified:false,history:[{by:"staffA",at:new Date().toISOString(),state:"enviado"}],updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(a,"agora_work_form_states","one"),state));
 await assertFails(getDoc(doc(b,"agora_work_form_states","one")));
 await assertFails(updateDoc(doc(b,"agora_work_form_states","one"),{state:"problema"}));
 await assertFails(updateDoc(doc(a,"agora_work_form_states","one"),{ownerUid:"staffB"}));
 await assertSucceeds(getDoc(doc(coord,"agora_work_form_states","one")));
 console.log("MIS TRABAJOS Y PAGOS: permisos individuales comprobados");
}finally{await env.cleanup()}
