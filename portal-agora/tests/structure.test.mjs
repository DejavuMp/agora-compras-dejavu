import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

// Portal pages may pin app.js to a release version to avoid stale browser caches.
const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("el portal conserva la autenticación Google y el mismo proyecto Firebase",async()=>{
  const [app,config,html]=await Promise.all([read("app.js"),read("firebase.js"),read("index.html")]);
  assert.match(config,/agora-dejavu-38b8c/);
  assert.match(app,/onAuthStateChanged\(auth/);
  assert.match(app,/signInWithPopup\(auth,provider\)/);
  assert.match(app,/signInWithRedirect\(auth,provider\)/);
  assert.match(app,/getDoc\(doc\(db,"agora_identity_links",user\.uid\)\)/);
  assert.match(app,/getDoc\(doc\(db,"agora_identity_registry",linked\.agoraId\)\)/);
  assert.match(app,/getDoc\(doc\(db,"agora_users",user\.uid\)\)/);
  assert.match(html,/src="\.\/app\.js(?:\?v=[^"]+)?"/);
  assert.match(html,/href="\.\/perfil\.css"/);
  assert.match(app,/type="submit" disabled/);
  assert.match(app,/data-action="google"/);
});

test("inicio autenticado es Mi perfil, sin herramientas, accesos rápidos ni QR visible",async()=>{
  const [app,css]=await Promise.all([read("app.js"),read("perfil.css")]);
  const home=app.slice(app.indexOf("function profile(){"),app.indexOf("function routeDenied("));
  assert.match(home,/<h1>Mi perfil<\/h1>/);
  assert.match(home,/profile-identity|pageShell/);
  assert.match(home,/profile-fields/);
  assert.match(home,/profile-space-link/);
  assert.match(home,/Ver mi credencial/);
  assert.match(home,/credentialDialog\(\)/);
  assert.doesNotMatch(home,/<div id="credential-qr"|<div class="credential-qr"/);
  assert.doesNotMatch(app,/SITE_URLS|quickAccess\(|siteTile\(|sites\(\)|https:\/\/dejavump\.github\.io\/agora-(?:compras|operaciones)/);
  assert.doesNotMatch(app,/Compras y producción|Recursos y pagos|Mis jornadas \/ Visor|Mis herramientas/);
  assert.match(css,/\.profile-layout/);
  assert.match(css,/\.profile-space-list/);
  assert.match(css,/--profile-bg:#101113/);
});

test("fotografía real, respaldo por iniciales y navegación basada en iconos",async()=>{
  const [app,css,html]=await Promise.all([
    read("app.js"),read("perfil.css"),read("index.html")
  ]);
  assert.match(app,/user\?\.photoURL/);
  assert.match(app,/user\?\.providerData/);
  assert.match(app,/url\.protocol==="https:"/);
  assert.match(app,/person-photo--/);
  assert.match(app,/person-photo-fallback/);
  assert.match(app,/person-photo-image/);
  assert.match(app,/Foto de perfil de /);
  assert.match(app,/Sin foto en Google; se muestran tus iniciales/);
  assert.match(app,/img\.addEventListener\("error"/);
  assert.match(app,/profile-space-visual/);
  assert.match(app,/aria-label="Abrir espacio /);
  assert.match(app,/profile-space-role/);
  assert.match(css,/\.person-photo--profile/);
  assert.match(css,/\.profile-space-link:focus-visible/);
  assert.match(css,/\.profile-photo-hint/);
  assert.doesNotMatch(html,/<strong>PORTAL ÁGORA<\/strong>/);
  for(const route of ["staff","agencia","administrador"]){
    const routeHTML=await read(route+"/index.html");
    assert.doesNotMatch(routeHTML,/<strong>ÁGORA<\/strong>/);
  }
});

test("panel de perfil negro delimitado, fondo ambiental Dejavú y legibilidad adaptable",async()=>{
  const [css,global,html]=await Promise.all([
    read("perfil.css"),read("style.css"),read("index.html")
  ]);
  const image=await readFile(new URL("../assets/escena-login-agora.webp",import.meta.url));
  assert.equal(image.subarray(0,4).toString(),"RIFF");
  assert.equal(image.subarray(8,12).toString(),"WEBP");
  assert.ok(image.byteLength>100000);
  assert.match(css,/body:not\(\.login-mode\)::before/);
  assert.match(css,/url\("\.\/assets\/escena-login-agora\.webp"\)/);
  assert.match(css,/filter:blur\(10px\) brightness\(\.49\)/);
  assert.match(css,/body:not\(\.login-mode\) main\{/);
  assert.match(css,/background:rgba\(11,12,14,\.965\)/);
  assert.match(css,/border-radius:23px/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(global,/cinema-login/);
  assert.match(html,/body class="login-mode"/);
});

test("las tres páginas tienen ruta propia, etiqueta y regreso al perfil",async()=>{
  const app=await read("app.js");
  for(const path of ["staff","agencia","administrador"]){
    const html=await read(path+"/index.html");
    assert.match(html,/<main id="app">/);
    assert.match(html,/src="\.\.\/app\.js(?:\?v=[^"]+)?"/);
    assert.match(html,/href="\.\.\/perfil\.css"/);
    assert.match(html,/href="\.\.\/"/);
    assert.match(app,new RegExp(''+path));
  }
  assert.match(app,/function staffOperationsSpace\(\)/);
  assert.match(app,/function coordinationOperationsSpace\(admin=false\)/);
  assert.match(app,/function emptySpace\(\)/);
  assert.match(app,/Volver a Mi perfil/);
  assert.match(app,/new URL\(path,ROOT\)/);
  assert.match(app,/routeDenied\(true\)/);
  assert.match(app,/if\(allowed\(routeSpace\)\)emptySpace\(\)/);
  assert.match(app,/else routeDenied\(\)/);
});

test("Mi perfil integra solo Mi operación y Expediente privado sin salir del portal",async()=>{
  const app=await read("app.js");
  const home=app.slice(app.indexOf("function profile(){"),app.indexOf("function routeDenied("));
  assert.match(home,/Mi operación/);
  assert.match(home,/Expediente privado/);
  assert.match(home,/href\("mi-operacion\/"\)/);
  assert.match(home,/href\("expediente\/"\)/);
  assert.doesNotMatch(home,/href="https?:\/\/dejavump\.github\.io\/agora-/);
  for(const [name,title] of [["expediente","Expediente privado"],["mi-operacion","Mi operación"]]){
    const html=await read(name+"/index.html");
    assert.ok(html.includes("<title>ÁGORA · "+title+"</title>"));
    assert.match(html,/name="robots" content="noindex,nofollow"/);
    assert.match(html,/src="\.\.\/app\.js(?:\?v=[^"]+)?"/);
    assert.match(html,/href="\.\.\/perfil\.css"/);
    assert.match(html,/href="\.\.\/"/);
  }
});

test("expediente mantiene las colecciones y funciones seguras de RH por UID",async()=>{
  const [app,old,css,rules]=await Promise.all([
    read("app.js"),read("../identidad/firebase-identity.js"),
    read("perfil.css"),read("../firestore.rules")
  ]);
  assert.match(app,/import \{saveProfile,saveFinancial\} from "\.\.\/identidad\/firebase-identity\.js"/);
  assert.match(app,/getDoc\(doc\(db,"agora_identity_profiles",uid\)\)/);
  assert.match(app,/getDoc\(doc\(db,"agora_identity_financial",uid\)\)/);
  assert.match(app,/readPrivateSection\(user\.uid,routePrivate\)/);
  assert.match(app,/if\(routePrivate&&verifiedId\(\)\)/);
  assert.match(app,/if\(verifiedId\(\)\)renderPrivateSection\(\)/);
  assert.match(app,/form id="private-profile-form"/);
  assert.match(app,/form id="private-financial-form"/);
  assert.match(app,/lockedByRH===true/);
  assert.match(app,/await saveProfile\(state\.user,values\)/);
  assert.match(app,/await saveFinancial\(state\.user,values\)/);
  for(const field of ["telephone","address","shirtSize","pantSize","shoeSize",
    "emergencyName","emergencyRelation","emergencyPhone","medicalNotes",
    "rfc","curp","nss","bank","clabe","taxRegime"]){
    assert.ok(app.includes('"'+field+'"'),"Falta "+field);
  }
  assert.match(app,/La carga de documentos permanece deshabilitada/);
  assert.match(old,/lockedByRH===true/);
  assert.match(rules,/match \/agora_identity_profiles\/\{uid\}/);
  assert.match(rules,/match \/agora_identity_financial\/\{uid\}/);
  assert.match(css,/\.secure-accordion/);
  assert.match(css,/\.secure-form/);
});

test("Mi operación solo proyecta actividades propias y no información de pagos",async()=>{
  const [app,projection,css]=await Promise.all([
    read("app.js"),read("../identidad/domain.mjs"),read("perfil.css")
  ]);
  assert.match(app,/import \{projectTodayAssignments\} from "\.\.\/identidad\/domain\.mjs"/);
  assert.match(app,/getDoc\(doc\(db,"agora_ops_staff",uid\)\)/);
  assert.match(app,/projectTodayAssignments\(state\.privateData\?\.operations,new Date\(\)\)/);
  assert.match(app,/No hay actividades programadas para hoy/);
  const start=app.indexOf("function renderMyOperation(){");
  const end=app.indexOf("function renderPrivateSection(){",start);
  const op=app.slice(start,end);
  for(const field of ["project","site","jobTitle","activity","responsible","instructions","start","end"]){
    assert.ok(op.includes("item."+field),"Falta dato seguro "+field);
  }
  assert.doesNotMatch(op,/item\.(?:salary|rate|bank|clabe|rfc|payment|gps|latitude|longitude)/i);
  assert.match(projection,/export function projectTodayAssignments/);
  assert.match(css,/\.secure-assignment/);
});

test("los tres espacios se autorizan con UID, acreditación y rol",async()=>{
  const app=await read("app.js");
  assert.match(app,/state\.identity\?\.link\?\.active===true/);
  assert.match(app,/state\.identity\?\.registry\?\.rhStatus==="verified"/);
  assert.match(app,/state\.identity\?\.registry\?\.credentialActive===true/);
  assert.match(app,/state\.identity\?\.account\?\.active===true/);
  assert.match(app,/state\.user\?\.emailVerified===true/);
  assert.match(app,/role\(\)==="admin"/);
  assert.match(app,/principalAdmin\(\)/);
  assert.match(app,/if\(key==="agencia"\)/);
  assert.match(app,/if\(key==="staff"\)/);
  assert.match(app,/if\(key==="administrador"\)/);
  assert.doesNotMatch(app,/setDoc\(doc\(db,"agora_users"/);
});

test("credencial digital sólo se abre en modal, conserva QR y verificación pública",async()=>{
  const [app,verify]=await Promise.all([read("app.js"),read("verify.js")]);
  assert.match(app,/function credentialDialog\(\)/);
  assert.match(app,/id="credential-dialog"/);
  assert.match(app,/id="credential-qr-modal"/);
  assert.match(app,/data-action="open-credential"/);
  assert.match(app,/data-action="share-credential"/);
  assert.match(app,/data-action="close-credential"/);
  assert.match(app,/new URL\("verificar\.html",ROOT\)/);
  assert.match(app,/new window\.QRCode/);
  assert.match(verify,/agora_identity_credentials/);
  assert.match(verify,/d\.active===true/);
});

test("iconos originales y tipografía adaptable siguen en el portal",async()=>{
  const css=await read("perfil.css");
  for(const asset of [
    "icono-staff-hq.webp","icono-agencia-hq.webp",
    "icono-administrador-hq.webp","logo-agora-hq.webp"
  ]){
    const bin=await readFile(new URL("assets/"+asset,root));
    assert.equal(bin.subarray(0,4).toString(),"RIFF",asset);
    assert.equal(bin.subarray(8,12).toString(),"WEBP",asset);
    assert.ok(bin.byteLength>20000,asset);
  }
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.credential-modal/);
});

test("Staff, Agencia y Administrador conectan al mismo Firestore sin escrituras operativas nuevas",async()=>{
  const app=await read("app.js");
  const css=await read("perfil.css");
  assert.match(app,/getDoc\(doc\(db,"agora_ops_staff",uid\)\)/);
  assert.match(app,/getDoc\(doc\(db,"agora_ops_control","schedule"\)\)/);
  assert.match(app,/if\(space==="staff"\)/);
  assert.match(app,/\["admin","coordinador"\]\.includes\(role\(\)\)/);
  assert.match(app,/if\(routeSpace&&allowed\(routeSpace\)\)/);
  assert.match(app,/role\(\)=="admin"|role\(\)===/i);
  assert.match(app,/function staffOperationsSpace\(\)/);
  assert.match(app,/function coordinationOperationsSpace\(admin=false\)/);
  assert.match(app,/data-action="new-assignment"/);
  assert.match(app,/data-action="add-assignment-activity"/);
  assert.match(app,/data-draft-activity/);
  assert.match(app,/validateAssignmentDraft/);
  assert.match(app,/Solicitud guardada con folio/);
  assert.match(app,/agora_ops_assignment_requests/);
  assert.match(app,/compressAssignmentImage/);
  assert.match(app,/agora_ops_assignment_requests/);
  assert.match(app,/showAssignmentHistory/);
  assert.match(app,/Solicitud guardada con folio/);
  assert.doesNotMatch(app,/setDoc\(doc\(db,"agora_ops_(?:control|staff|shift_access)"/);
  assert.match(css,/\.role-jornada/);
  assert.match(css,/\.role-assignment-form/);
});


test("el acceso por contraseña del portal se limita a los dos usuarios QA y exige correo verificado",async()=>{
  const app=await read("app.js");
  assert.match(app,/signInWithEmailAndPassword\(auth,qaEmail,password\)/);
  assert.match(app,/QA_LOGIN_USERS\.has\(qaEmail\)/);
  assert.match(app,/credential\.user\.emailVerified/);
  assert.match(app,/qa\/email-not-verified/);
  assert.match(app,/admi\.agora\+qa\.staff@gmail\.com/);
  assert.match(app,/admi\.agora\+qa\.supervisor@gmail\.com/);
});
