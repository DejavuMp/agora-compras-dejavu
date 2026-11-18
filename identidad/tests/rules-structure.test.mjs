import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const rules=await readFile(new URL("../../firestore.rules",import.meta.url),"utf8");
const required=[
  "agora_identity_registrations","agora_identity_counters","agora_identity_links",
  "agora_identity_registry","agora_identity_profiles","agora_identity_financial",
  "agora_identity_credentials","agora_identity_audit","agora_ops_control","agora_ops_staff"
];
for(const collection of required)assert.match(rules,new RegExp(`match /${collection}`),`Falta ${collection}`);
assert.doesNotMatch(rules,/^\+\s+\/\/ AGORA/m,"Las reglas contienen un marcador de parche inválido");
assert.match(rules,/match \/agora_identity_credentials\/\{credentialId\}[\s\S]*?allow list: if false;/);
assert.match(rules,/match \/agora_identity_audit\/\{auditId\}[\s\S]*?allow update, delete: if false;/);
assert.match(rules,/match \/agora_identity_profiles\/\{uid\}[\s\S]*?allow get: if identityRh\(\) \|\| \(signedIn\(\) && request\.auth\.uid == uid\);/);
assert.match(rules,/match \/agora_identity_financial\/\{uid\}[\s\S]*?resource\.data\.lockedByRH == false/);
assert.match(rules,/identityPublicMatchesRegistry\(request\.resource\.data\)/);
console.log("OK reglas estructurales: identidad, privacidad, auditoría y Operaciones permanecen cubiertas.");
