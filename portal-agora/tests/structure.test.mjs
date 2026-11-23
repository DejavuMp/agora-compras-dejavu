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
