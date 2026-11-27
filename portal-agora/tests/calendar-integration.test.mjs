import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("el calendario se despliega en Mi perfil sólo para coordinación autorizada",async()=>{
  const [app,page,css,operations]=await Promise.all([
    read("../app.js"),read("../index.html"),read("../perfil.css"),read("../../operaciones/index.html")
  ]);
  assert.match(app,/allowed\("agencia"\)&&\["admin","coordinador"\]\.includes\(role\(\)\)\?/);
  assert.match(app,/<details id="calendario" class="profile-calendar-inline"/);
  assert.match(app,/iframe class="portal-calendar-frame"/);
  assert.match(app,/operaciones\/\?embedded=calendar/);
  assert.match(app,/calendar\.addEventListener\("toggle",loadCalendar\)/);
  assert.match(app,/href\("\?calendario=1#calendario"\)/);
  assert.match(page,/src="\.\/app\.js\?v=20261126-calendar-inline"/);
  assert.match(css,/\.profile-calendar-inline/);
  assert.match(operations,/EMBEDDED_CALENDAR\?'calendario':'inicio'/);
  assert.match(operations,/body\.embedded-calendar \.sidebar/);
});
