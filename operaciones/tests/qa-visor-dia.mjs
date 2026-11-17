/**
 * ÁGORA · Operaciones: prueba visual funcional con datos ficticios.
 * Ejecuta en GitHub Actions sin tocar Firestore, sueldos ni el portal real.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const origin='http://127.0.0.1:8765/operaciones/';
const local=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const shift=(s,n)=>local(new Date(new Date(s).getTime()+n*60000));
async function action(name){
 await page.evaluate(a=>{
  const b=document.createElement('button');b.dataset.action=a;document.body.append(b);b.click();b.remove();
 },name);
}
async function save(form){await page.locator(form+' button[type="submit"]').click()}
try {
 await page.goto(origin+'demo.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.AGORA_TEST?.getState);
 await page.evaluate(()=>localStorage.clear());
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.AGORA_TEST?.getState);
 assert.equal((await page.evaluate(()=>window.AGORA_TEST.getState())).events.length,0);
 await action('new-person');
 await page.locator('#p-name').fill('Persona ficticia de QA');
 await page.locator('#p-role').fill('Volanteo');
 await save('#person-form');
 const state1=await page.evaluate(()=>window.AGORA_TEST.getState());
 assert.equal(state1.people.length,1,'Crear persona');
 const person=state1.people[0];
 await action('new-vehicle');
 await page.locator('#v-name').fill('Camioneta ejemplo QA');
 await page.locator('#v-plate').fill('PRUEBA-01');
 await save('#vehicle-form');
 const state2=await page.evaluate(()=>window.AGORA_TEST.getState());
 assert.equal(state2.vehicles.length,1,'Crear camioneta');
 await action('new-site');
 await page.locator('#site-name').fill('Sucursal ficticia QA');
 await page.locator('#site-address').fill('Ciudad de México, México');
 await save('#site-form');
 const state3=await page.evaluate(()=>window.AGORA_TEST.getState());
 assert.equal(state3.sites.length,1,'Crear sede');
 const next=new Date();next.setDate(next.getDate()+1);next.setHours(10,0,0,0);
 const start=local(next),end=shift(start,6*60);
 await action('new-event');
 assert.ok(await page.locator('#ev-days').count(),'Número de días en la ficha');
 await page.locator('#ev-title').fill('Volanteo de prueba QA');
 await page.locator('#ev-type').selectOption({label:'Volanteo'});
 await page.locator('#ev-days').fill('3');
 await page.locator('#ev-site').selectOption(state3.sites[0].id);
 await page.locator('#ev-origin').fill('Álvaro Obregón, Ciudad de México, México');
 await page.locator('#ev-travel').fill('40');
 await page.locator('#ev-route-margin').fill('15');
 await page.locator('#ev-start').fill(start);
 await page.locator('#ev-end').fill(end);
 await page.locator('[data-person-choose="'+person.id+'"]').check();
 await page.locator('[data-vehicle-choose="'+state2.vehicles[0].id+'"]').check();
 const staffStart=await page.locator('[data-person-start="'+person.id+'"]').inputValue();
 const staffEnd=await page.locator('[data-person-end="'+person.id+'"]').inputValue();
 assert.equal(staffStart,shift(start,-30),'Staff entra 30 minutos antes');
 assert.equal(staffEnd,shift(end,30),'Staff sale 30 minutos después');
 await page.locator('#ev-status').selectOption('confirmado');
 await save('#event-form');
 let db=await page.evaluate(()=>window.AGORA_TEST.getState());
 assert.equal(db.events.length,3,'Crear tres jornadas independientes');
 const events=db.events.slice().sort((a,b)=>a.dayIndex-b.dayIndex);
 assert.deepEqual(events.map(x=>x.dayIndex),[1,2,3],'Numeración de jornadas');
 assert.ok(events.every(x=>x.dayCount===3&&x.type==='Volanteo'&&x.seriesId===events[0].seriesId));
 assert.ok(events.every(x=>x.staff[0].start===shift(x.start,-30)&&x.staff[0].end===shift(x.end,30)),'Turnos automáticos por día');
 assert.ok(events.every(x=>x.travelMin===40&&x.routeBufferMin===15),'Rutas por jornada');
 assert.ok(await page.evaluate(e=>!!window.AGORA_TEST.routeUrl(e),events[0]),'Google Maps disponible para ruta');
 await action('new-event');
 await page.locator('#ev-title').fill('Evento empalmado QA');
 await page.locator('#ev-site').selectOption(state3.sites[0].id);
 await page.locator('#ev-start').fill(start);
 await page.locator('#ev-end').fill(end);
 await page.locator('[data-person-choose="'+person.id+'"]').check();
 await page.locator('#ev-status').selectOption('confirmado');
 await save('#event-form');
 assert.ok((await page.locator('#event-validation').innerText()).includes('empalmes'),'Bloqueo de horarios duplicados');
 assert.equal((await page.evaluate(()=>window.AGORA_TEST.getState())).events.length,3,'Empalme no se guarda');
 await page.locator('#event-form').evaluate(form=>form.querySelector('[data-action="close-modal"]').click());
 await action('new-event');
 await page.locator('#ev-title').fill('Traslado demasiado corto QA');
 await page.locator('#ev-location').fill('Segunda sede ficticia QA');
 await page.locator('#ev-travel').fill('40');
 await page.locator('#ev-route-margin').fill('15');
 const nextStart=shift(end,80),nextEnd=shift(nextStart,120);
 await page.locator('#ev-start').fill(nextStart);
 await page.locator('#ev-end').fill(nextEnd);
 await page.locator('[data-person-choose="'+person.id+'"]').check();
 await page.locator('#ev-status').selectOption('confirmado');
 await save('#event-form');
 assert.ok((await page.locator('#event-validation').innerText()).toLowerCase().includes('tiempo insuficiente'),'Evitar traslado entre sedes sin minutos suficientes');
 assert.equal((await page.evaluate(()=>window.AGORA_TEST.getState())).events.length,3,'Ruta imposible no se guarda');

 await page.goto(origin+'visor.html',{waitUntil:'domcontentloaded'});
 await page.locator('#local').click();
 await page.locator('#focusdate').fill(start.slice(0,10));
 assert.ok((await page.locator('#week').innerText()).includes('Volanteo de prueba QA'),'Visor por día muestra la jornada');
 assert.ok((await page.locator('#week').innerText()).includes('Día 1 de 3'),'Muestra secuencia de varios días');
 assert.ok((await page.locator('#week').innerText()).includes('40 min de camino'),'Visor muestra tiempo manual estimado');
 assert.ok(await page.locator('a[href*="google.com/maps/dir"]').count(),'Botón de recorrido en Maps');
 await page.locator('#next').click();
 assert.ok((await page.locator('#week').innerText()).includes('Día 2 de 3'),'Navegación diaria');
 await page.screenshot({path:'/tmp/agora-visor-qa.png',fullPage:true});
 assert.equal(errors.length,0,'Sin errores JS: '+errors.join(' | '));
 console.log('ÉXITO: edición diaria, 3 jornadas, volanteo, turnos +/- 30, reservas, ruta, bloqueo de empalmes y visor diario.');
}finally{await browser.close()}
