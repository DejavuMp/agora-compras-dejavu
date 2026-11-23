import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const rules=await readFile(new URL("../../firestore.rules",import.meta.url),"utf8");
const required=[
  "agora_identity_registrations","agora_identity_counters","agora_identity_links",
  "agora_identity_registry","agora_identity_profiles","agora_identity_financial",
  "agora_identity_credentials","agora_identity_audit","agora_ops_control","agora_ops_staff"
];
for(const collection of required)assert.match(rules,new RegExp("match /"+collection),"Falta "+collection);
assert.doesNotMatch(rules,/^\+\s+\/\/ AGORA/m,"Las reglas contienen un marcador de parche inválido");
assert.match(rules,/match \/agora_identity_credentials\/\{credentialId\}[\s\S]*?allow list: if false;/);
assert.match(rules,/match \/agora_identity_audit\/\{auditId\}[\s\S]*?allow update, delete: if false;/);
assert.match(rules,/match \/agora_identity_profiles\/\{uid\}[\s\S]*?allow get: if identityRh\(\) \|\| \(identitySignedIn\(\) && request\.auth\.uid == uid\);/);
assert.match(rules,/match \/agora_identity_financial\/\{uid\}[\s\S]*?resource\.data\.lockedByRH == false/);
assert.match(rules,/identityPublicMatchesRegistry\(request\.resource\.data\)/);
assert.match(rules,/function identitySignedIn\(\)/);
assert.match(rules,/sign_in_provider == 'phone'/);
assert.match(rules,/function isAdmin\(\) \{ return activeStaff\(\) && role\(\) == 'admin'; \}/);
assert.match(rules,/match \/agora_users\/\{uid\}[\s\S]*?allow list: if isAdmin\(\);/);
assert.match(rules,/match \/agora_identity_registrations\/\{uid\}[\s\S]*?request\.resource\.data\.email == request\.auth\.token\.get\('email', ''\)/);
console.log("OK reglas estructurales: identidad, SMS verificado, privacidad, auditoría y operaciones.");
