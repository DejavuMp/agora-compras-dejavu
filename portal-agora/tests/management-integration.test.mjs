import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("altas y accesos usan la gestión RH existente dentro del portal",async()=>{
  const [portal,identity,rules]=await Promise.all([
    read("../app.js"),read("../../identidad/app.js"),read("../../firestore.rules")
  ]);
  assert.match(portal,/if\(!activeAccount\(\)\|\|role\(\)!=="admin"\)return ""/);
  assert.match(portal,/id="altas" class="profile-calendar-inline management-inline"/);
  assert.match(portal,/identidad\/\?embedded=management/);
  assert.match(identity,/if\(EMBEDDED_MANAGEMENT\)/);
  assert.match(identity,/\["admin","coordinador"\]\.includes\(state\.workspace\.account\?\.role\)/);
  assert.match(identity,/item\.uid===state\.user\.uid/);
  assert.match(identity,/current\?\.role==="admin"/);
  assert.match(identity,/\["inactive","consulta","coordinador"\]\.includes\(selected\)/);
  assert.match(rules,/allow create, update: if isAdmin\(\) && validStaff\(\)/);
});
