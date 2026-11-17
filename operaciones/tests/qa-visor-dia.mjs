/**
 * ÁGORA Operaciones · prueba end-to-end exclusivamente con datos ficticios.
 * No necesita ni modifica Firebase.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1366,height:900}});
const failures=[];
page.on('pageerror',e=>failures.push(e.message));
const origin='http://127.0.0.1:8765/operaciones/';
const local=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const plus=(date,minutes)=>local(new Date(new Date(date).getTime()+minutes*60000));
const state=()=>page.evaluate(()=>window.AGORA_TEST.getState());
async function action(name,id){
  await page.evaluate(({name,id})=>{
    const b=document.createElement('button');b.dataset.action=name;if(id)b.dataset.id=id;
    document.body.appendChild(b);b.click();b.remove();
  },{name,id});
}
async function commit(form){await page.locator(form+' button[type="submit"]').click()}
try{
  await page.goto(origin+'demo.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.AGORA_TEST?.getState);
  await page.evaluate(()=>localStorage.clear());
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.AGORA_TEST?.getState);
  assert.equal((await state()).events.length,0);
  const next=new Date();next.setDate(next.getDate()+1);next.setHours(10,0,0,0);
  const start=local(next),end=plus(start,360);
  await action('new-event');
  assert.ok(await page.locator('#event-form').isVisible(),'Se abre actividad');
  assert.equal(await page.locator('[data-action^="inline-open"]').count(),0,'No existe catálogo ni modal secundario');
  assert.equal(await page.locator('#ev-site').count(),0,'No hay desplegable de sucursales');
  assert.ok(await page.locator('#ev-site-name').isVisible(),'La sucursal se escribe directamente');
  assert.ok(await page.locator('#ev-campaign').isVisible(),'Campaña editable');
  await page.setViewportSize({width:390,height:640});
  const scroll=await page.locator('#event-form .modal-content').evaluate(el=>({body:el.scrollHeight,window:el.clientHeight,overflow:getComputedStyle(el).overflowY}));
  assert.ok(scroll.body>scroll.window+80 && scroll.overflow==='auto','Modal desplazable en celular');
  await page.locator('#ev-stops').scrollIntoViewIfNeeded();
  const foot=await page.locator('#event-form .modal-foot').boundingBox();
  assert.ok(foot&&foot.y>=0&&foot.y+foot.height<=640,'Botones visibles en móvil');
  await page.setViewportSize({width:1366,height:900});
  await page.locator('#ev-title').fill('Volanteo de prueba QA');
  await page.locator('#ev-project').fill('Hot Crují · proyecto de prueba');
  await page.locator('#ev-campaign').fill('Campaña HCB QA');
  await page.locator('#ev-site-name').fill('Sucursal ficticia Coyoacán');
  await page.locator('#ev-site-address').fill('Coyoacán, Ciudad de México, México');
  await page.locator('#ev-location').fill('Acceso principal');
  await page.locator('#ev-type').selectOption({label:'Volanteo'});
  await page.locator('#ev-days').fill('3');
  await page.locator('#ev-origin').fill('Álvaro Obregón, Ciudad de México, México');
  await page.locator('#ev-travel').fill('40');
  await page.locator('#ev-route-margin').fill('15');
  await page.locator('#ev-start').fill(start);
  await page.locator('#ev-end').fill(end);
  const member=page.locator('.direct-person-row').first();
  await member.locator('[data-person-name]').fill('Colaborador ficticio QA');
  await member.locator('[data-person-role]').fill('Volanteo');
  assert.equal(await member.locator('[data-person-start]').inputValue(),plus(start,-30),'Entrada 30 min antes');
  assert.equal(await member.locator('[data-person-end]').inputValue(),plus(end,30),'Salida 30 min después');
  await page.locator('.direct-vehicle-row').first().locator('[data-vehicle-name]').fill('Camioneta ficticia QA');
  await page.locator('.direct-vehicle-row').first().locator('[data-vehicle-plate]').fill('DEMO-QA-01');
  await page.locator('#ev-driver-name').fill('Colaborador ficticio QA');
  await page.locator('#ev-status').selectOption('confirmado');
  await commit('#event-form');
  let d=await state();
  assert.equal(d.events.length,3,'Genera 3 jornadas');
  assert.equal(d.people.length,1,'Crea personal al guardar sin catálogo previo');
  assert.equal(d.vehicles.length,1,'Crea camioneta al guardar sin catálogo previo');
  assert.equal(d.sites.length,1,'Crea sede al guardar sin catálogo previo');
  const [first,second,third]=d.events.slice().sort((a,b)=>a.dayIndex-b.dayIndex);
  assert.deepEqual([first.dayIndex,second.dayIndex,third.dayIndex],[1,2,3],'Días vinculados');
  assert.ok([first,second,third].every(x=>x.type==='Volanteo'&&x.campaign==='Campaña HCB QA'&&x.venueName==='Sucursal ficticia Coyoacán'));
  assert.ok([first,second,third].every(x=>x.staff.length===1&&x.vehicles.length===1));
  assert.equal(first.staff[0].start,plus(start,-30));
  assert.equal(first.staff[0].end,plus(end,30));
  assert.equal(first.venueAddress,'Coyoacán, Ciudad de México, México');
  assert.ok(await page.evaluate(e=>!!window.AGORA_TEST.routeUrl(e),first),'Ruta disponible');
  // Edición de una jornada no debe modificar otras ni duplicar recursos.
  await action('edit-event',first.id);
  assert.equal(await page.locator('#ev-site-name').inputValue(),'Sucursal ficticia Coyoacán');
  assert.equal(await page.locator('[data-person-name]').first().inputValue(),'Colaborador ficticio QA');
  await page.locator('#ev-campaign').fill('Campaña HCB QA ajustada');
  await page.locator('[data-action="add-person-row"]').click();
  assert.equal(await page.locator('.direct-person-row').count(),2,'Permite añadir fila de personal');
  await page.locator('[data-person-name]').last().fill('Otro colaborador ficticio QA');
  await page.locator('[data-action="add-vehicle-row"]').click();
  assert.equal(await page.locator('.direct-vehicle-row').count(),2,'Permite añadir una unidad');
  await page.locator('[data-vehicle-name]').last().fill('Segunda camioneta QA');
  await commit('#event-form');
  d=await state();
  assert.equal(d.events.length,3,'No duplica jornadas al editar');
  assert.equal(d.events.find(e=>e.id===first.id).staff.length,2);
  assert.equal(d.events.find(e=>e.id===first.id).vehicles.length,2);
  assert.equal(d.events.find(e=>e.id===second.id).staff.length,1,'No modifica otro día');
  assert.equal(d.events.find(e=>e.id===second.id).campaign,'Campaña HCB QA','Día 2 conserva campaña original');
  assert.equal(d.people.length,2,'La persona extra solo se añade al guardar');
  assert.equal(d.vehicles.length,2);
  // Conflicto de personal: no debe guardar evento ni catálogo.
  await action('new-event');
  await page.locator('#ev-title').fill('Evento empalmado QA');
  await page.locator('#ev-site-name').fill('Sucursal ficticia Coyoacán');
  await page.locator('#ev-start').fill(start);
  await page.locator('#ev-end').fill(end);
  await page.locator('[data-person-name]').first().fill('Colaborador ficticio QA');
  await page.locator('#ev-status').selectOption('confirmado');
  await commit('#event-form');
  assert.ok((await page.locator('#event-validation').innerText()).includes('empalme'),'Bloquea empalme de personal');
  assert.equal((await state()).events.length,3);
  await page.locator('#event-form [data-action="close-modal"]').click();
  // Una ruta con tiempo insuficiente entre sucursales tampoco debe guardarse.
  await action('new-event');
  await page.locator('#ev-title').fill('Traslado corto QA');
  await page.locator('#ev-site-name').fill('Otra sede ficticia QA');
  await page.locator('#ev-site-address').fill('Tlalpan, Ciudad de México, México');
  await page.locator('#ev-start').fill(plus(end,80));
  await page.locator('#ev-end').fill(plus(end,200));
  await page.locator('#ev-travel').fill('40');
  await page.locator('#ev-route-margin').fill('15');
  await page.locator('[data-person-name]').first().fill('Colaborador ficticio QA');
  await page.locator('#ev-status').selectOption('confirmado');
  await commit('#event-form');
  assert.ok((await page.locator('#event-validation').innerText()).includes('tiempo insuficiente'),'Bloquea traslado insuficiente');
  assert.equal((await state()).sites.length,1,'No agrega sede si el formulario falla');
  await page.goto(origin+'visor.html',{waitUntil:'domcontentloaded'});
  await page.locator('#local').click();
  await page.locator('#focusdate').fill(start.slice(0,10));
  assert.ok((await page.locator('#week').innerText()).includes('Volanteo de prueba QA'),'Visor diario muestra actividad');
  assert.ok((await page.locator('#week').innerText()).includes('Día 1 de 3'),'Visor indica cantidad de días');
  assert.ok(await page.locator('a[href*="google.com/maps/dir"]').count(),'Maps vinculado');
  await page.locator('#next').click();
  assert.ok((await page.locator('#week').innerText()).includes('Día 2 de 3'),'Otro día disponible');
  await page.screenshot({path:'/tmp/agora-visor-qa.png',fullPage:true});
  assert.equal(failures.length,0,'Sin errores JS: '+failures.join(' | '));
  console.log('ÉXITO: captura libre sin catálogos, turnos, jornadas, rutas, empalmes y visor.');
}finally{await browser.close()}
