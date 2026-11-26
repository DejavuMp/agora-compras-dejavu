import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const source=await readFile(new URL("../remote-attendance.js",import.meta.url),"utf8");
const state={requests:[],sends:[],positions:0};
const stub=`
 const {state}=globalThis.remoteRequestTest;
 const navigator={geolocation:{getCurrentPosition(ok){
  state.positions++;
  ok({coords:{latitude:10,longitude:20,accuracy:25}});
 }}};
 const collection=(db,...path)=>path;
 const collectionGroup=collection;
 const doc=collection;
 const query=(...args)=>args;
 const where=(...args)=>args;
 const getDocsFromServer=async()=>({docs:state.requests.map(data=>({data:()=>data}))});
 const serverTimestamp=()=>"server-time";
 const setDoc=async(ref,data)=>state.sends.push({ref,data});
`;
globalThis.remoteRequestTest={state};
const moduleSource=source.replace(/^import [\s\S]*?;\n/,stub);
const {requestRemoteAttendance}=await import("data:text/javascript;base64,"+Buffer.from(moduleSource).toString("base64"));
const input={db:{},uid:"uid-qa",personId:"person-qa",personName:"Persona QA",
 eventId:"event-qa",eventTitle:"Jornada ficticia",site:"Sede QA",action:"entrada"};

test("Staff envía el pase sin leer documentos exclusivos de Supervisión",async()=>{
 await requestRemoteAttendance({...input,shiftTime:Date.now()});
 assert.equal(state.positions,1);
 assert.equal(state.sends.length,1);
 const {ref,data}=state.sends[0];
 assert.deepEqual(ref.slice(0,3),["agora_ops_attendance_sheets","event-qa","remote_requests"]);
 assert.equal(data.reviewerName,"");
 assert.equal(data.reviewedBy,"");
 assert.equal(data.createdAt,"server-time");
 assert.equal(data.ownerUid,input.uid);
 assert.equal(data.status,"pendiente");
});

test("ventana cerrada y solicitud pendiente no vuelven a pedir GPS",async()=>{
 await assert.rejects(requestRemoteAttendance({...input,shiftTime:Date.now()-31*60_000}),/ventana/);
 state.requests=[{status:"pendiente",action:"entrada"}];
 await assert.rejects(requestRemoteAttendance(input),/pendiente de revisión/);
 assert.equal(state.positions,1);
 assert.equal(state.sends.length,1);
});
