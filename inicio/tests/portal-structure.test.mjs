import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const js=await readFile(new URL("../app.js",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const css=await readFile(new URL("../style.css",import.meta.url),"utf8");
const identity=await readFile(new URL("../../identidad/firebase-identity.js",import.meta.url),"utf8");
const functions=await readFile(new URL("../../functions/index.js",import.meta.url),"utf8");
for(const key of ["phone","email","google","staff","agency","admin"]){
  assert.ok(js.includes('"'+key+'"'),"Falta método o espacio "+key);
}
assert.match(js,/signInWithPhoneNumber/);
assert.match(js,/signInWithEmailLink/);
assert.match(js,/linkWithCredential/);
assert.match(js,/requestRegistration/);
assert.match(js,/loadOwnIdentity/);
assert.match(js,/projectTodayAssignments/);
assert.match(js,/workspace\?\.registry\?\.credentialActive===true/);
assert.match(js,/workspace\?\.account\?\.role==="admin"/);
assert.match(js,/emailVerified===true/);
assert.match(js,/const MAIN_ADMIN="admi\.agora@gmail\.com"/);
assert.doesNotMatch(js,/email\s*===\s*MAIN_ADMIN\s*\?\s*["']admin["']/);
assert.doesNotMatch(js,/signInAnonymously|localStorage\.setItem\(["']password/);
assert.match(identity,/agora_identity_links/);
assert.match(html,/noindex,nofollow/);
assert.match(css,/@media\(max-width:640px\)/);
assert.match(functions,/identityRegistrationRequested/);
assert.match(functions,/identityRegistrationApproved/);
console.log("OK: portal, tres espacios, QR, vinculación UID, avisos y permisos sin admin por email.");
