import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("el calendario se abre dentro del portal sólo para coordinación autorizada",async()=>{
  const [app,page,operations]=await Promise.all([
    read("../app.js"),read("../calendario/index.html"),read("../../operaciones/index.html")
  ]);
  assert.match(app,/profileTool\("calendario\/","Calendario de operaciones"/);
  assert.match(app,/routePrivate==="calendario"\?allowed\("agencia"\)&&\["admin","coordinador"\]\.includes\(role\(\)\)/);
  assert.match(app,/iframe class="portal-calendar-frame"/);
  assert.match(app,/operaciones\/\?embedded=calendar/);
  assert.match(page,/src="\.\.\/app\.js\?v=20261126-calendar"/);
  assert.match(operations,/EMBEDDED_CALENDAR\?'calendario':'inicio'/);
  assert.match(operations,/body\.embedded-calendar \.sidebar/);
});
