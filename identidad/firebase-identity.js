import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  arrayUnion,collection,doc,getDoc,getDocs,getFirestore,limit,query,runTransaction,
  serverTimestamp,setDoc,updateDoc,where,writeBatch
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {formatAgoraId,normalizeText,publicCredential,validJob,validateBlockReason} from "./domain.mjs";

const firebaseConfig={
  apiKey:"AIzaSyDPh-AFdST9Ax_Eoho-wT0shlWlCHad6Zg",
  authDomain:"agora-dejavu-38b8c.firebaseapp.com",
  projectId:"agora-dejavu-38b8c",
  storageBucket:"agora-dejavu-38b8c.firebasestorage.app",
  messagingSenderId:"775680965171",
  appId:"1:775680965171:web:274557c8c9c25ff304c146"
};

const app=getApps().length?getApps()[0]:initializeApp(firebaseConfig);
export const auth=getAuth(app);
export const db=getFirestore(app);
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:"select_account"});

const cleanEmail=value=>normalizeText(value,240).toLowerCase();
const randomId=()=>crypto.randomUUID().replaceAll("-","");
const data=snap=>snap.exists()?{id:snap.id,...snap.data()}:null;

export function watchSession(callback){return onAuthStateChanged(auth,callback)}
export async function login(){
  try{return await signInWithPopup(auth,provider)}
  catch(error){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(error?.code)){
      return signInWithRedirect(auth,provider);
    }
    throw error;
  }
}
export const logout=()=>signOut(auth);

export async function loadAccount(uid){
  const snap=await getDoc(doc(db,"agora_users",uid));
  const record=data(snap);
  return record?.active===true?record:null;
}

async function readOwnDocument(collectionName,uid){
  try { return await getDoc(doc(db,collectionName,uid)); }
  catch(error){
    if(error?.code==="permission-denied"){
      const permissionError=new Error("Firestore rechazó la lectura de "+collectionName+".");
      permissionError.code="permission-denied";
      permissionError.collection=collectionName;
      throw permissionError;
    }
    throw error;
  }
}

export async function loadOwnIdentity(user){
  const uid=user.uid;
  const [accountSnap,registrationSnap,linkSnap,profileSnap,financialSnap,opsSnap]=await Promise.all([
    readOwnDocument("agora_users",uid),
    readOwnDocument("agora_identity_registrations",uid),
    readOwnDocument("agora_identity_links",uid),
    readOwnDocument("agora_identity_profiles",uid),
    readOwnDocument("agora_identity_financial",uid),
    readOwnDocument("agora_ops_staff",uid).catch(()=>null)
  ]);
  const account=data(accountSnap);
  const link=data(linkSnap);
  let registry=null;
  if(link?.agoraId) registry=data(await getDoc(doc(db,"agora_identity_registry",link.agoraId)));
  return {
    account:account?.active===true?account:null,
    registration:data(registrationSnap),link,registry,
    profile:data(profileSnap),financial:data(financialSnap),
    operations:opsSnap?data(opsSnap):null
  };
}

export async function requestRegistration(user,{name,phone,jobTitle,privacyAccepted}){
  const displayName=normalizeText(name,140);
  const telephone=normalizeText(phone,30);
  if(displayName.length<3)throw Error("Escribe tu nombre completo.");
  if(!validJob(jobTitle))throw Error("Selecciona un cargo válido.");
  if(privacyAccepted!==true)throw Error("Debes aceptar el aviso provisional para solicitar el alta.");
  const ref=doc(db,"agora_identity_registrations",user.uid);
  const existing=await getDoc(ref);
  if(existing.exists())return data(existing);
  await setDoc(ref,{
    uid:user.uid,email:cleanEmail(user.email),displayName,telephone,requestedJobTitle:jobTitle,
    status:"pending",privacyAccepted:true,privacyVersion:"provisional-2026-11-18",
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  return data(await getDoc(ref));
}

export async function saveProfile(user,values){
  const payload={
    uid:user.uid,
    telephone:normalizeText(values.telephone,30),
    address:normalizeText(values.address,300),
    shirtSize:normalizeText(values.shirtSize,12),
    pantSize:normalizeText(values.pantSize,12),
    shoeSize:normalizeText(values.shoeSize,12),
    emergencyName:normalizeText(values.emergencyName,140),
    emergencyRelation:normalizeText(values.emergencyRelation,80),
    emergencyPhone:normalizeText(values.emergencyPhone,30),
    medicalNotes:normalizeText(values.medicalNotes,300),
    updatedAt:serverTimestamp()
  };
  await setDoc(doc(db,"agora_identity_profiles",user.uid),payload,{merge:true});
}

export async function saveFinancial(user,values){
  const ref=doc(db,"agora_identity_financial",user.uid);
  const current=await getDoc(ref);
  if(current.exists()&&current.data().lockedByRH===true)throw Error("RH bloqueó esta sección. Solicita un proceso formal de cambio.");
  await setDoc(ref,{
    uid:user.uid,rfc:normalizeText(values.rfc,20).toUpperCase(),
    curp:normalizeText(values.curp,24).toUpperCase(),nss:normalizeText(values.nss,20),
    bank:normalizeText(values.bank,100),clabe:normalizeText(values.clabe,24),
    taxRegime:normalizeText(values.taxRegime,140),lockedByRH:false,updatedAt:serverTimestamp()
  },{merge:true});
}

export async function listPendingRegistrations(){
  const snap=await getDocs(query(collection(db,"agora_identity_registrations"),where("status","==","pending"),limit(100)));
  return snap.docs.map(data);
}

export async function listActiveCoordinators(){
  const snap=await getDocs(query(collection(db,"agora_users"),where("role","==","coordinador"),limit(200)));
  return snap.docs.map(data).filter(item=>item?.active===true).map(item=>({
    uid:item.id,name:normalizeText(item.name||item.email,140),email:cleanEmail(item.email)
  })).sort((a,b)=>a.name.localeCompare(b.name,"es"));
}

export async function listDirectory(account,userUid){
  if(account?.role==="admin"){
    const snap=await getDocs(query(collection(db,"agora_identity_registry"),limit(200)));
    return snap.docs.map(data);
  }
  if(account?.role==="coordinador"){
    const snap=await getDocs(query(collection(db,"agora_identity_registry"),where("coordinatorUids","array-contains",userUid),limit(200)));
    return snap.docs.map(data);
  }
  return [];
}

export async function approveRegistration(actor,registration,{jobTitle,coordinatorUid=""}={}){
  if(!registration?.uid)throw Error("Solicitud inválida.");
  const targetUid=registration.uid;
  const selectedJob=validJob(jobTitle)?jobTitle:registration.requestedJobTitle;
  if(!validJob(selectedJob))throw Error("Cargo oficial inválido.");
  const year=new Date().getFullYear();
  const auditId=randomId();
  const credentialId=randomId();
  return runTransaction(db,async tx=>{
    const counterRef=doc(db,"agora_identity_counters",String(year));
    const linkRef=doc(db,"agora_identity_links",targetUid);
    const registrationRef=doc(db,"agora_identity_registrations",targetUid);
    const [counterSnap,linkSnap,registrationSnap]=await Promise.all([
      tx.get(counterRef),tx.get(linkRef),tx.get(registrationRef)
    ]);
    if(linkSnap.exists()){
      const existing=linkSnap.data();
      return {agoraId:existing.agoraId,reused:true};
    }
    if(!registrationSnap.exists()||registrationSnap.data().status!=="pending")throw Error("La solicitud ya no está pendiente.");
    let sequence=Number(counterSnap.data()?.nextSequence||1);
    let registryRef=null;
    for(let attempt=0;attempt<25;attempt+=1){
      const candidate=formatAgoraId(year,sequence);
      const candidateRef=doc(db,"agora_identity_registry",candidate);
      const candidateSnap=await tx.get(candidateRef);
      if(!candidateSnap.exists()){registryRef=candidateRef;break}
      sequence+=1;
    }
    if(!registryRef)throw Error("No fue posible reservar un ID sin colisión.");
    const agoraId=registryRef.id;
    const coordinators=coordinatorUid?[normalizeText(coordinatorUid,128)]:[];
    const registry={
      uid:targetUid,agoraId,displayName:normalizeText(registration.displayName,140),
      email:cleanEmail(registration.email),jobTitle:selectedJob,rhStatus:"verified",
      credentialId,credentialActive:true,credentialStatus:"vigente",blockReason:"",
      coordinatorUids:coordinators,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
      createdBy:actor.uid,updatedBy:actor.uid,lastAuditId:auditId
    };
    const credential={...publicCredential(registry),credentialId,updatedAt:serverTimestamp(),updatedBy:actor.uid,lastAuditId:auditId};
    tx.set(counterRef,{year,nextSequence:sequence+1,updatedAt:serverTimestamp(),updatedBy:actor.uid},{merge:true});
    tx.set(registryRef,registry);
    tx.set(linkRef,{uid:targetUid,agoraId,credentialId,active:true,createdAt:serverTimestamp(),createdBy:actor.uid});
    tx.update(registrationRef,{status:"approved",agoraId,approvedAt:serverTimestamp(),approvedBy:actor.uid,updatedAt:serverTimestamp()});
    tx.set(doc(db,"agora_identity_credentials",credentialId),credential);
    tx.set(doc(db,"agora_identity_audit",auditId),{
      actorUid:actor.uid,targetUid,agoraId,action:"identity_approved",createdAt:serverTimestamp()
    });
    return {agoraId,credentialId,reused:false};
  });
}

export async function updateCredential(actor,registry,{active,reason,jobTitle}){
  if(!registry?.agoraId||!registry?.credentialId)throw Error("Credencial incompleta.");
  const nextJob=jobTitle||registry.jobTitle;
  if(!validJob(nextJob))throw Error("Cargo oficial inválido.");
  const isActive=active===true;
  const blockReason=isActive?"":validateBlockReason(reason);
  const auditId=randomId();
  const batch=writeBatch(db);
  const registryRef=doc(db,"agora_identity_registry",registry.agoraId);
  const credentialRef=doc(db,"agora_identity_credentials",registry.credentialId);
  const next={...registry,jobTitle:nextJob,credentialActive:isActive,
    credentialStatus:isActive?"vigente":"bloqueada",blockReason,updatedAt:serverTimestamp(),
    updatedBy:actor.uid,lastAuditId:auditId};
  batch.update(registryRef,{
    jobTitle:nextJob,credentialActive:isActive,credentialStatus:next.credentialStatus,
    blockReason,updatedAt:serverTimestamp(),updatedBy:actor.uid,lastAuditId:auditId
  });
  batch.update(credentialRef,{
    jobTitle:nextJob,active:isActive,status:next.credentialStatus,
    blockReason:isActive?"":"Credencial suspendida",
    updatedAt:serverTimestamp(),updatedBy:actor.uid,lastAuditId:auditId
  });
  batch.set(doc(db,"agora_identity_audit",auditId),{
    actorUid:actor.uid,targetUid:registry.uid,agoraId:registry.agoraId,
    action:isActive?"credential_activated":"credential_blocked",createdAt:serverTimestamp()
  });
  await batch.commit();
}

export async function assignCoordinator(actor,registry,coordinatorUid){
  const uid=normalizeText(coordinatorUid,128);
  if(!uid)throw Error("UID de coordinación inválido.");
  const auditId=randomId();
  const batch=writeBatch(db);
  batch.update(doc(db,"agora_identity_registry",registry.agoraId),{
    coordinatorUids:arrayUnion(uid),updatedAt:serverTimestamp(),updatedBy:actor.uid,lastAuditId:auditId
  });
  batch.update(doc(db,"agora_identity_credentials",registry.credentialId),{
    updatedAt:serverTimestamp(),updatedBy:actor.uid,lastAuditId:auditId
  });
  batch.set(doc(db,"agora_identity_audit",auditId),{
    actorUid:actor.uid,targetUid:registry.uid,agoraId:registry.agoraId,
    action:"coordinator_assigned",createdAt:serverTimestamp()
  });
  await batch.commit();
}

export async function readPublicCredential(credentialId){
  const token=String(credentialId||"").replace(/[^a-f0-9]/gi,"").slice(0,64);
  if(token.length<24)throw Error("Código de verificación inválido.");
  return data(await getDoc(doc(db,"agora_identity_credentials",token)));
}
