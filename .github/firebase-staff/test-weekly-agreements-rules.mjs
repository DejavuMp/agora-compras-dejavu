import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {collection,deleteDoc,doc,getDoc,getDocs,setDoc,serverTimestamp,updateDoc} from "firebase/firestore";

const [host,port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const env = await initializeTestEnvironment({
  projectId: "demo-agora-payroll",
  firestore: {host,port:Number(port),rules:readFileSync("firestore.rules","utf8")}
});
const collectionName = "agora_payroll_weekly_agreements";
try {
  await env.withSecurityRulesDisabled(async ctx => {
    for (const [uid,role,active] of [
      ["qa-admin","admin",true], ["qa-coord","coordinador",true],
      ["qa-supervisor","supervisor",true], ["qa-staff","staff",true], ["qa-inactive","admin",false]
    ]) {
      await setDoc(doc(ctx.firestore(),"agora_users",uid),{active,role});
    }
  });
  const db = uid => env.authenticatedContext(uid,{email:uid+"@example.invalid",email_verified:true}).firestore();
  const admin = db("qa-admin");
  const id = "qa-staff~2026-11-23";
  const data = {personId:"qa-staff",effectiveFrom:"2026-11-23",amountCents:250000,
    periodicity:"semana",note:"QA",authorizedBy:"qa-admin",createdAt:serverTimestamp()};
  const agreement = doc(admin,collectionName,id);
  await assertSucceeds(setDoc(agreement,data));
  await assertSucceeds(getDoc(agreement));
  await assertSucceeds(getDocs(collection(admin,collectionName)));
  await assertFails(updateDoc(agreement,{amountCents:100}));
  await assertFails(deleteDoc(agreement));
  await assertFails(setDoc(agreement,data));

  const next = doc(admin,collectionName,"qa-staff~2026-11-30");
  const nextData = {...data,effectiveFrom:"2026-11-30"};
  await assertFails(setDoc(next,{...nextData,authorizedBy:"qa-coord"}));
  await assertFails(setDoc(next,{...nextData,amountCents:12.5}));
  await assertFails(setDoc(next,{...nextData,amountCents:-2}));
  await assertFails(setDoc(next,{...nextData,unexpected:true}));
  await assertFails(setDoc(doc(admin,collectionName,"unrelated"),nextData));
  await assertSucceeds(setDoc(next,{...nextData,amountCents:0}));

  for (const uid of ["qa-coord","qa-supervisor","qa-staff","qa-inactive","qa-provider"]) {
    const visitor = db(uid);
    await assertFails(getDoc(doc(visitor,collectionName,id)));
    await assertFails(getDocs(collection(visitor,collectionName)));
    await assertFails(setDoc(doc(visitor,collectionName,"qa-staff~2026-12-07"),
      {...data,effectiveFrom:"2026-12-07",authorizedBy:uid}));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),collectionName,id)));
  console.log("28 controles de acuerdos semanales QA aprobados");
} finally {
  await env.cleanup();
}
