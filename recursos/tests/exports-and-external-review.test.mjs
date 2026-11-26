import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const app=readFileSync('recursos/app.js','utf8');
const html=readFileSync('recursos/aprobar.html','utf8');
const css=readFileSync('recursos/style.css','utf8');

assert.ok(app.includes("Array.from(host.querySelectorAll('img'))"),'PNG/PDF espera imágenes reales');
assert.ok(!app.includes("$('img',host).map"),'No se usa querySelector sobre un solo elemento como arreglo');
assert.ok(app.includes("host.classList.add('print-view')"),'Impresión no queda oculta por media print');
assert.ok(app.includes('const host=docHost(r);'),'La ventana de impresión conserva QR');
assert.ok(app.includes('data-action="copy-email"'),'Hay acción para copiar correo');
assert.ok(app.includes('data-action="whatsapp"'),'Hay acceso a WhatsApp');
assert.ok(app.includes('data-action="copy-email-bank"'),'Existe copiado explícito con banco y cuenta');
assert.ok(app.includes('function emailBody(r,includeBank=false)'),'Correo normal no incluye banco por defecto');
assert.ok(app.includes('emailBody(r,true)'),'Solo la acción especial añade banco');
assert.ok(app.includes('data-action="approval-link"'),'Hay acceso de revisión externo');
assert.ok(css.includes('.doc-print-host{position:fixed;left:0'),'Captura sin posición extrema');

const start=app.indexOf('function approvalReplyLink(r){');
const end=app.indexOf('\nfunction emailSubject(r)',start);
assert.ok(start>=0&&end>start,'Helper de enlace externo');
const fn=app.slice(start,end);
const sample={
 folio:'RF-2026-ABC123',project:'KFC · Campaña Cuernavaca',
 client:'KFC México',category:'materiales',dateNeeded:'2026-11-24',
 total:12345.5,bank:'BANCO PRIVADO',account:'123456789012345678',
 beneficiary:'NOMBRE CONFIDENCIAL',reason:'NOTAS SECRETAS'
};
const url=runInNewContext(
 'const CATEGORIES={materiales:"Materiales"};const round=n=>Math.round(n*100)/100;'+fn+
 '\napprovalReplyLink(sample);',
 {sample,TextEncoder,btoa,URL,location:{href:'https://dejavump.github.io/agora-compras-dejavu/recursos/'}} 
);
assert.throws(()=>runInNewContext(
 'const CATEGORIES={};const round=n=>n;'+fn+'\napprovalReplyLink(sample);',
 {sample:{...sample,hoursOrigin:{eventId:'qa',personId:'qa'}},TextEncoder,btoa,URL,location:{href:'https://dejavump.github.io/agora-compras-dejavu/recursos/'}}
),/se autorizan dentro de Finanzas/);
const actual=new URL(url);
assert.equal(actual.pathname,'/agora-compras-dejavu/recursos/aprobar.html');
const encoded=actual.searchParams.get('d').replace(/-/g,'+').replace(/_/g,'/');
const data=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
assert.equal(data.f,sample.folio);
assert.equal(data.p,sample.project);
assert.equal(data.t,12345.5);
for(const secret of ['BANCO PRIVADO','123456789012345678','NOMBRE CONFIDENCIAL','NOTAS SECRETAS']){
 assert.ok(!url.includes(secret),'El enlace no expone '+secret);
 assert.ok(!JSON.stringify(data).includes(secret),'El resumen no exporta '+secret);
}
assert.deepEqual(Object.keys(data).sort(),['c','d','f','p','t','v'].sort());

assert.match(html,/id="approve"/);
assert.match(html,/id="reject"/);
assert.match(html,/id="copy"/);
assert.match(html,/id="mail"/);
assert.match(html,/id="whatsapp"/);
assert.match(html,/no se registra automáticamente en ÁGORA/i);
assert.match(html,/content="no-referrer"/);
assert.ok(!html.includes('firebase-firestore'),'La respuesta externa no posee escritura pública a Firestore');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline,'JS de pantalla externa');
new Script(inline,{filename:'aprobar-inline.js'});
console.log('OK: exportación, impresión, enlace sin datos bancarios, correo y revisión externa.');

const {financeLedger,ledgerTotals}=await import("../finance-ledger.mjs");
const rows=financeLedger([
 {id:'A',category:'nomina',hoursOrigin:{eventId:'jor',personId:'uno'},beneficiary:'Ana',project:'Montaje',reason:'Horas',status:'pago_parcial',total:550,approvedAmount:550,paidAmount:150,payments:[{date:'2026-11-26',reference:'QA-1',amount:150}]},
 {id:'B',category:'nomina',hoursOrigin:{eventId:'jor',personId:'dos'},beneficiary:'Ana',status:'aprobada',total:200,approvedAmount:200,paidAmount:0},
 {id:'C',category:'proveedor',beneficiary:'Proveedor QA',status:'pendiente',total:500,paidAmount:0}
],[{id:'legado',eventId:'jor',personId:'uno',paymentStatus:'pagado',approvedAmount:550,activity:'Horas'},{id:'sinfolio',personId:'uno',paymentStatus:'pagado',approvedAmount:22}],
 {people:[{id:'uno',name:'Ana'}],events:[{id:'jor',title:'Montaje'}]});
assert.equal(rows.find(r=>r.id==='A').reconciliation,true);
assert.equal(rows.find(r=>r.id==='B').reconciliation,false);
assert.equal(rows.find(r=>r.id==='sinfolio').reconciliation,false);
assert.deepEqual(rows.find(r=>r.id==='A').payments,[{date:'2026-11-26',reference:'QA-1',amount:15000}]);
assert.deepEqual(ledgerTotals(rows),{pending:50000,approvedBalance:20000,needsReconciliation:40000,paid:15000});
assert.match(app,/function ledgerAccess\(\)\{return state\.cloud&&state\.role==='admin'/);
console.log('OK: trazabilidad, homonimia, parcialidades y conciliación sin duplicar saldos.');
