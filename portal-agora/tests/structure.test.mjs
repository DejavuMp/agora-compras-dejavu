import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

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
  assert.match(html,/src="\.\/app\.js"/);
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
  assert.match(home,/Ver credencial digital/);
  assert.match(home,/credentialDialog\(\)/);
  assert.doesNotMatch(home,/<div id="credential-qr"|<div class="credential-qr"/);
  assert.doesNotMatch(app,/SITE_URLS|quickAccess\(|siteTile\(|sites\(\)|https:\/\/dejavump\.github\.io\/agora-(?:compras|operaciones)/);
  assert.doesNotMatch(app,/Compras y producción|Recursos y pagos|Mis jornadas \/ Visor|Mis herramientas/);
  assert.match(css,/\.profile-layout/);
  assert.match(css,/\.profile-space-list/);
  assert.match(css,/--profile-bg:#101113/);
});

test("las tres páginas tienen ruta propia, etiqueta y regreso al perfil",async()=>{
  const app=await read("app.js");
  for(const path of ["staff","agencia","administrador"]){
    const html=await read(path+"/index.html");
    assert.match(html,/<main id="app">/);
    assert.match(html,/src="\.\.\/app\.js"/);
    assert.match(html,/href="\.\.\/perfil\.css"/);
    assert.match(html,/href="\.\.\/"/);
    assert.match(app,new RegExp(''+path));
  }
  assert.match(app,/Espacio en preparación/);
  assert.match(app,/Volver a Mi perfil/);
  assert.match(app,/new URL\(path,ROOT\)/);
  assert.match(app,/routeDenied\(true\)/);
  assert.match(app,/if\(allowed\(routeSpace\)\)emptySpace\(\)/);
  assert.match(app,/else routeDenied\(\)/);
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

test("no hay proveedores, actividades, pagos ni navegación a herramientas en los espacios nuevos",async()=>{
  const app=await read("app.js");
  const route=app.slice(app.indexOf("function emptySpace(){"),app.indexOf("function render(){"));
  assert.match(route,/Espacio en preparación/);
  assert.doesNotMatch(route,/https?:\/\/|herramientas|pago|proyecto|cotizaci|calendario|compras/i);
  for(const path of ["staff","agencia","administrador"]){
    const html=await read(path+"/index.html");
    assert.doesNotMatch(html,/https?:\/\/|href="[^"]*compras|href="[^"]*operaciones|href="[^"]*recursos/i);
  }
});
