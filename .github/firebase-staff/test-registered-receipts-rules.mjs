import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {collection,doc,getDoc,getDocs,query,where,setDoc,serverTimestamp,updateDoc} from "firebase/firestore";

const [host,port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const env = await initializeTestEnvironment({projectId:"demo-dejavu-receipts",
  firestore:{host,port:Number(port),rules:readFileSync("firestore.rules","utf8")}});
const col="agora_registered_receipts",uid="qa-staff",personId="qa-person",adminUid="qa-admin";
const requestId="horas~qa-jornada~qa-person";
const db = uid => env.authenticatedContext(uid,{email:uid+"@example.invalid",email_verified:true}).firestore();
const admin=db(adminUid),staff=db(uid),unrelated=db("qa-otro"),coord=db("qa-coord");
const source = {category:"nomina",status:"pagada",beneficiary:"Staff QA",project:"Proyecto QA",
  approvedAmount:2500,paidAmount:2500,hoursOrigin:{eventId:"qa-jornada",personId},
  payments:[
    {id:"qa-pago-1",amount:1500,date:"2026-11-28",method:"transferencia",reference:"QA-1"},
    {id:"qa-pago-2",amount:1000,date:"2026-11-28",method:"transferencia",reference:"QA-2"}
  ]};
const one={requestId,paymentIndex:0,ownerUid:uid,personId,folio:"DVM-PAG-qa-pago-1",beneficiary:source.beneficiary,
  project:source.project,date:source.payments[0].date,method:"transferencia",reference:"QA-1",amountCents:150000,
  createdBy:adminUid,createdAt:serverTimestamp()};
const answer={ownerUid:uid,folio:one.folio,amountCents:one.amountCents,response:"recibido",note:"",
  verification:"identidad_dejavu",createdAt:serverTimestamp()};
try {
  await env.withSecurityRulesDisabled(async ctx=>{
    const fs=ctx.firestore();
    await setDoc(doc(fs,"agora_users",adminUid),{active:true,role:"admin"});
    await setDoc(doc(fs,"agora_users","qa-coord"),{active:true,role:"coordinador"});
    for(const [owner,person] of [[uid,personId],["qa-otro","qa-ajeno"]]){
      await setDoc(doc(fs,"agora_ops_members",owner),{uid:owner,active:true,role:"staff",personId:person});
      await setDoc(doc(fs,"agora_ops_staff",owner),{uid:owner,personId:person});
    }
    await setDoc(doc(fs,"agora_finance_requests",requestId),source);
    await setDoc(doc(fs,"agora_ops_attendance_sheets","qa-jornada","roster",personId),{uid,personId});
  });
  const ref=(fs,id="qa-pago-1")=>doc(fs,col,id);
  const response=(fs,id="qa-pago-1",owner=uid)=>doc(fs,col,id,"responses",owner);
  await assertFails(setDoc(ref(staff),one));
  await assertFails(setDoc(ref(coord),one));
  await assertFails(setDoc(ref(admin,"qa-pago-falso"),one));
  await assertFails(setDoc(ref(admin),{...one,ownerUid:"qa-otro"}));
  await assertFails(setDoc(ref(admin),{...one,amountCents:151000}));
  await assertFails(setDoc(ref(admin),{...one,account:"dato privado"}));
  await assertSucceeds(setDoc(ref(admin),one));
  await assertFails(updateDoc(ref(admin),{amountCents:100}));
  await assertSucceeds(getDoc(ref(staff)));
  await assertFails(getDoc(ref(unrelated)));
  await assertFails(getDoc(ref(coord)));
  await assertFails(getDoc(ref(env.unauthenticatedContext().firestore())));
  await assertFails(getDocs(collection(staff,col)));
  await assertSucceeds(getDocs(query(collection(staff,col),where("ownerUid","==",uid))));
  await assertSucceeds(getDoc(response(staff)));
  await assertFails(setDoc(response(unrelated,"qa-pago-1","qa-otro"),{...answer,ownerUid:"qa-otro"}));
  await assertFails(setDoc(response(staff),{...answer,amountCents:100}));
  await assertFails(setDoc(response(staff),{...answer,response:"diferencia"}));
  await assertSucceeds(setDoc(response(staff),answer));
  await assertSucceeds(getDoc(response(admin)));
  await assertFails(getDoc(response(unrelated)));
  await assertFails(updateDoc(response(staff),{response:"aclaracion"}));
  const two={...one,paymentIndex:1,folio:"DVM-PAG-qa-pago-2",reference:"QA-2",amountCents:100000};
  await assertSucceeds(setDoc(ref(admin,"qa-pago-2"),two));
  await assertSucceeds(setDoc(response(staff,"qa-pago-2"),{...answer,folio:two.folio,amountCents:two.amountCents,
    response:"aclaracion",note:"QA: el depósito tiene otra referencia."}));
  console.log("24 controles QA de comprobantes individuales y acuses aprobados");
} finally { await env.cleanup(); }
