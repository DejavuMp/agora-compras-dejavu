import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync,rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const rulesFile="firestore.rules";
const source=readFileSync(rulesFile,"utf8");
const root=".github/firebase-staff/.preflight";
const envFile=root+"/test-spark-env.txt";
mkdirSync(root,{recursive:true});
const saved={project:process.env.FIREBASE_PROJECT_ID,token:process.env.FIREBASE_ACCESS_TOKEN,
  env:process.env.GITHUB_ENV,digest:process.env.AGORA_SPARK_EXPECTED_SHA256};
const fetchBefore=globalThis.fetch;
const sha=s=>createHash("sha256").update(s).digest("hex");
const releaseName="projects/agora-dejavu-38b8c/rulesets/spark-mock";
const url=pathToFileURL(resolve(".github/firebase-staff/prepare-spark-firestore-release.mjs"));
let live=source,iteration=0;
async function run(verify=false){
 const before=[...process.argv];
 try{
  process.argv=verify?[...before,"--verify"]:before.filter(x=>x!=="--verify");
  return await import(url+"?spark_test="+ ++iteration);
 }finally{process.argv=before;}
}
globalThis.fetch=async url=>{
 if(String(url).endsWith("/releases/cloud.firestore"))
  return {ok:true,json:async()=>({rulesetName:releaseName})};
 if(String(url).endsWith("/rulesets/spark-mock"))
  return {ok:true,json:async()=>({source:{files:[{content:live,name:"firestore.rules"}]}})};
 throw Error("Unexpected request from safety test: "+url);
};
process.env.FIREBASE_PROJECT_ID="agora-dejavu-38b8c";
process.env.FIREBASE_ACCESS_TOKEN="fake-test-only-token";
process.env.GITHUB_ENV=envFile;
try{
 await run();
 const envText=readFileSync(envFile,"utf8");
 assert.match(envText,/AGORA_SPARK_ACTION=already_installed/);
 assert.match(envText,new RegExp("AGORA_SPARK_EXPECTED_SHA256="+sha(source)));
 assert.equal(readFileSync(rulesFile,"utf8"),source,"Already-installed must not alter rules");
 process.env.AGORA_SPARK_EXPECTED_SHA256=sha(source);
 await run(true);
 live=source.replace("request.resource.data.dataUrl.size() <= 90000",
  "request.resource.data.dataUrl.size() <= 99999");
 await assert.rejects(run(),/distinto al revisado/);
 assert.equal(readFileSync(rulesFile,"utf8"),source,"Unknown live rules must not be deployed");
 const marker="    // ÁGORA · Inventario, mantenimiento y reparaciones.";
 const close="    // Todas las demás colecciones permanecen cerradas.";
 const pos=source.indexOf(marker),end=source.indexOf(close,pos);
 assert.ok(pos>=0&&end>pos);
 live=source.slice(0,pos)+source.slice(end);
 await assert.rejects(run(),/cambiaron desde|no son la base auditada/);
 console.log("OK Spark: primera publicación no simulada, segunda no-op, verificación y deriva bloqueada");
}finally{
 globalThis.fetch=fetchBefore;
 for(const [k,v] of Object.entries({FIREBASE_PROJECT_ID:saved.project,FIREBASE_ACCESS_TOKEN:saved.token,
  GITHUB_ENV:saved.env,AGORA_SPARK_EXPECTED_SHA256:saved.digest})){
  if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
 writeFileSync(rulesFile,source);
 rmSync(root,{recursive:true,force:true});
}
