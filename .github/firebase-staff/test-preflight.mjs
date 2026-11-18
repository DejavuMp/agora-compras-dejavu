/**
 * Preflight aislado: simula Firebase Rules API en memoria y comprueba que
 * se preserva el respaldo incluso ante diferencias de producción.
 * NUNCA consulta ni escribe en el proyecto Firebase real.
 */
import assert from "node:assert/strict";
import {readFileSync,rmSync} from "node:fs";
import {fileURLToPath} from "node:url";

// La copia previa debe publicarse, incluso dentro de un directorio oculto,
// y la ausencia del artefacto no puede considerarse una ejecución exitosa.
const workflow=readFileSync(".github/workflows/dejavu-staff-firebase-rules.yml","utf8");
assert.match(workflow,/name: respaldo-reglas-agora-antes-dejavu-staff[\s\S]*?include-hidden-files: true[\s\S]*?if-no-files-found: error/,
  "El respaldo real es obligatorio antes de cualquier despliegue");
const candidate=readFileSync("firestore.rules","utf8");
const opsMarker="    // ÁGORA · Centro de Operaciones V4 (aislado de Compras y Finanzas).";
const endMarker="    // Todas las demás colecciones permanecen cerradas.";
const financeMarker="// ÁGORA · Recursos y Finanzas 2026";
const financeAt=candidate.indexOf(financeMarker);
const opsAt=candidate.indexOf(opsMarker);
const endAt=candidate.indexOf(endMarker,opsAt);
assert.ok(financeAt>0&&opsAt>financeAt&&endAt>opsAt,"El archivo tiene bloques conocidos");
const withoutOps=candidate.slice(0,opsAt-1)+candidate.slice(endAt);
const legacy=candidate.slice(0,financeAt)+candidate.slice(endAt);
const drift=candidate.replace("      allow list: if false;","      allow list: if true;");
assert.notEqual(drift,candidate,"La alteración desconocida debe existir");

const dir=".github/firebase-staff/.preflight";
const rulesBackup=dir+"/antes-dejavu.rules";
const refBackup=dir+"/ruleset-name.txt";
process.env.FIREBASE_PROJECT_ID="agora-dejavu-38b8c";
process.env.FIREBASE_ACCESS_TOKEN="qa-token-not-real";
const originalFetch=globalThis.fetch;
let attempts=0;
async function verify(label,live,shouldPass){
  const rulesetName="projects/agora-dejavu-38b8c/rulesets/qa-preflight";
  globalThis.fetch=async url=>{
    const path=String(url);
    assert.ok(path.startsWith("https://firebaserules.googleapis.com/v1/"),"Solo URL de Rules API");
    const response=path.endsWith("/releases/cloud.firestore")?{rulesetName}:
      path.endsWith("/rulesets/qa-preflight")?{source:{files:[{name:"firestore.rules",content:live}]}}:
      null;
    assert.ok(response,"Ruta API reconocida");
    return {ok:true,json:async()=>response};
  };
  attempts++;
  let thrown=null;
  try{await import("./safe-rules-preflight.mjs?fixture="+attempts)}
  catch(e){thrown=e}
  assert.equal(Boolean(thrown),!shouldPass,label+": resultado correcto");
  if(!shouldPass)assert.match(thrown.message,/REGLAS DISTINTAS EN PRODUCCIÓN/,label+": se impide sobrescribir");
  assert.equal(readFileSync(rulesBackup,"utf8"),live,label+": respaldo íntegro");
  assert.equal(readFileSync(refBackup,"utf8"),rulesetName+"\n",label+": versión conservada");
  console.log("OK "+label+": "+(shouldPass?"reglas reconocidas":"despliegue detenido")+", respaldo verificado");
}
try{
  await verify("repositorio actual",candidate,true);
  await verify("producción anterior a Operaciones",withoutOps,true);
  await verify("versión histórica sin Finanzas",legacy,true);
  await verify("diferencias desconocidas",drift,false);
}finally{
  globalThis.fetch=originalFetch;
  rmSync(dir,{recursive:true,force:true});
}
