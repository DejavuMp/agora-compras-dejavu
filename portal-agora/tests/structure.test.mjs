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
  assert.ok(html.includes('src="./assets/pdf-agora-wordmark.webp"'));
  assert.match(js,/class="scene-hero"/);
  assert.ok(js.includes('assets/pdf-agora-wordmark.webp'));
  assert.ok(js.includes('assets/pdf-staff-icon.webp'));
  assert.ok(js.includes('assets/pdf-agency-icon.webp'));
  assert.ok(css.includes("pdf-hero.webp"));
  assert.ok(css.includes("pdf-zeus.webp"));
  assert.match(js,/class="credential-mark"/);
  assert.doesNotMatch(js,/\.\.\/identidad\/|\.\.\/operaciones\//);
  assert.doesNotMatch(js,/agora_ops_|agora_finance_|agora_records|agora_file_deliveries/);
  assert.doesNotMatch(js,/compras|proveedores|inventario|nomina|nómina|solicitudes externas/i);
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

test("firestore SMS rules are limited to identity and own UID",async()=>{
  const rules=await readFile(new URL("../../firestore.rules",import.meta.url),"utf8");
  assert.match(rules,/function identitySignedIn\(\)/);
  assert.match(rules,/sign_in_provider == 'phone'/);
  assert.match(rules,/match \/agora_users\/\{uid\} \{[\s\S]*?request\.auth\.uid == uid/);
  assert.match(rules,/function isAdmin\(\) \{ return activeStaff\(\) && role\(\) == 'admin'; \}/);
  assert.match(rules,/match \/agora_identity_links\/\{uid\} \{[\s\S]*?identitySignedIn\(\)/);
  assert.match(rules,/match \/agora_identity_registrations\/\{uid\} \{[\s\S]*?allow create: if identitySignedIn\(\)/);
});
