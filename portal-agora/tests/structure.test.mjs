import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const here=new URL("../",import.meta.url);
const read=async p=>readFile(new URL(p,here),"utf8");
test("site portable and independent from other systems",async()=>{
  const [html,js,fire,css,verify]=await Promise.all([
    read("index.html"),read("app.js"),read("firebase.js"),
    read("style.css"),read("verify.js")
  ]);
  assert.match(html,/Dejavú Marketing/i);
  assert.match(html,/src="\.\/app\.js"/);
  assert.match(js,/Agencia/);
  assert.match(js,/Staff/);
  assert.match(js,/Administrador/);
  assert.match(js,/agora_identity_links/);
  assert.match(js,/agora_identity_registry/);
  assert.match(js,/agora_identity_registrations/);
  assert.match(js,/linkWithCredential/);
  assert.match(js,/sendSignInLinkToEmail/);
  assert.match(js,/signInWithPhoneNumber/);
  assert.match(js,/userRole\(\)==="admin"&&mainAdmin\(state\.user\)/);
  assert.match(js,/credentialActive===true/);
  assert.match(js,/new URL\("\.\/verificar\.html",location\.href\)/);
  assert.match(verify,/agora_identity_credentials/);
  assert.match(fire,/agora-dejavu-38b8c/);
  assert.ok(css.includes("@media(max-width:580px)"));
  assert.match(css,/@keyframes orbit/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.ok(html.includes('src="./assets/logo-agora-hq.webp"'));
  assert.match(js,/class="cinema-login"/);
  assert.ok(css.includes("escena-login-agora.webp"));
  assert.match(css,/@keyframes cinema-drift/);
  assert.match(html,/<body class="login-mode">/);
  const initialLogin=js.slice(js.indexOf("function login(){"),js.indexOf("function loading(){"));
  assert.doesNotMatch(initialLogin,/space-preview|class="preview"/);
  assert.match(initialLogin,/id="id-login"/);
  assert.match(initialLogin,/name="password" type="password"/);
  assert.match(initialLogin,/class="id-prefix"/);
  assert.match(initialLogin,/DJV-/);
  assert.match(initialLogin,/data-action="google"/);
  assert.doesNotMatch(initialLogin,/id="phone-send"|id="email-send"|data-method=/);
  assert.match(initialLogin,/type="submit" disabled/);
  assert.match(initialLogin,/pendiente de habilitarse de forma segura/);
  assert.ok(css.includes(".id-prefix"));
  assert.match(js,/const phone=input\.startsWith\("\+"\)\?input:"\+52"\+input/);
  assert.ok(js.includes('assets/logo-agora-hq.webp'));
  assert.ok(js.includes('icono-staff-hq.webp'));
  assert.ok(js.includes('icono-agencia-hq.webp'));
  assert.ok(css.includes("pdf-hero.webp"));
  assert.ok(css.includes("pdf-zeus.webp"));
  assert.match(js,/class="credential-mark"/);
  assert.doesNotMatch(js,/\.\.\/identidad\/|\.\.\/operaciones\//);
  assert.doesNotMatch(js,/agora_ops_|agora_finance_|agora_records|agora_file_deliveries/);
  assert.doesNotMatch(initialLogin,/compras|proveedores|inventario|nomina|nómina|solicitudes externas/i);
});
test("official Dejavú assets are bundled for independent hosting",async()=>{
  for(const filename of ["dejavu-logo-oficial.png","dejavu-horizontal.png","dejavu-monograma.png"]){
    const bytes=await readFile(new URL("../assets/"+filename,import.meta.url));
    assert.equal(bytes.subarray(1,4).toString(),"PNG",filename+" must be a real PNG");
    assert.ok(bytes.byteLength>1000,"Expected the original asset "+filename);
  }
});

test("official reference PDF imagery bundled as real WebP assets",async()=>{
  for(const filename of [
    "pdf-hero.webp","pdf-zeus.webp","pdf-agora-icon.webp",
    "pdf-staff-icon.webp","pdf-agency-icon.webp","pdf-agora-wordmark.webp"
  ]){
    const bytes=await readFile(new URL("../assets/"+filename,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString(),"RIFF",filename+" should be WebP");
    assert.equal(bytes.subarray(8,12).toString(),"WEBP",filename+" should be WebP");
    assert.ok(bytes.byteLength>4000,filename+" should not be a placeholder");
  }
});

test("original generated cinematic login background is bundled",async()=>{
 const bytes=await readFile(new URL("../assets/escena-login-agora.webp",import.meta.url));
 assert.equal(bytes.subarray(0,4).toString(),"RIFF");
 assert.equal(bytes.subarray(8,12).toString(),"WEBP");
 assert.ok(bytes.length>100000);
});

test("login logo uses the original transparent image and correct layout",async()=>{
  const js=await read("app.js");
  const css=await read("style.css");
  assert.match(js,/assets\/agora-wordmark-transparent\.webp/);
  assert.ok(css.includes('mix-blend-mode:normal'));
  assert.ok(css.includes('.cinema-brand'));
  const bytes=await readFile(new URL("../assets/agora-wordmark-transparent.webp",import.meta.url));
  assert.equal(bytes.subarray(0,4).toString(),"RIFF");
  assert.equal(bytes.subarray(8,12).toString(),"WEBP");
  assert.ok(bytes.byteLength>50000);
});

test("digital credential, module links and safe admin role gating",async()=>{
  const app=await read("app.js");
  const style=await read("style.css");
  for(const term of ["credentialVerificationLink","credential-qr","credential-qr-modal",
    "agora_identity_registry","share-credential","open-credential","Abrir credencial digital",
    "icono-staff-hq.webp","icono-agencia-hq.webp","Mis jornadas / Visor","Operaciones Agencia",
    "Compras y producción","Recursos y pagos","Archivos","Fichas de evento","Identidad y RH",
    "adminRoleNotice","copy-uid","role: "]){
    assert.ok(app.includes(term),term);
  }
  assert.match(app,/userRole\(\)==="admin"&&mainAdmin\(state\.user\)/);
  assert.match(app,/getDoc\(doc\(db,"agora_users",user\.uid\)\)/);
  assert.ok(style.includes(".sites-grid"));
  assert.ok(style.includes(".digital-dialog"));
});
test("original high resolution Dejavú images embedded",async()=>{
  const names=["logo-agora-hq.webp","icono-staff-hq.webp",
    "icono-agencia-hq.webp","icono-administrador-hq.webp"];
  for(const name of names){
    const b=await readFile(new URL("../assets/"+name,import.meta.url));
    assert.equal(b.subarray(0,4).toString(),"RIFF");
    assert.equal(b.subarray(8,12).toString(),"WEBP");
    assert.ok(b.byteLength>80000,name+" must be original HQ asset");
  }
});

test("quick access links show before the digital credential without bypassing roles",async()=>{
  const app=await read("app.js"),css=await read("style.css");
  assert.ok(app.includes('function quickAccess()'));
  assert.ok(app.includes('adminRoleNotice()+quickAccess()+'));
  assert.ok(app.includes('state.space==="staff"'));
  assert.ok(app.includes('rel="noopener noreferrer"'));
  assert.ok(css.includes(".quick-access"));
});

test("firestore SMS rules are limited to identity and own UID",async()=>{
  const rules=await readFile(new URL("../../firestore.rules",import.meta.url),"utf8");
  assert.match(rules,/function identitySignedIn\(\)/);
  assert.match(rules,/sign_in_provider == 'phone'/);
  assert.match(rules,/match \/agora_users\/\{uid\} \{[\s\S]*?request\.auth\.uid == uid/);
  assert.match(rules,/function isAdmin\(\) \{ return activeStaff\(\) && role\(\) == 'admin'; \}/);
  assert.match(rules,/match \/agora_identity_links\/\{uid\} \{[\s\S]*?identitySignedIn\(\)/);
  assert.match(rules,/match \/agora_identity_registrations\/\{uid\} \{[\s\S]*?allow create: if identitySignedIn\(\)/);
});
