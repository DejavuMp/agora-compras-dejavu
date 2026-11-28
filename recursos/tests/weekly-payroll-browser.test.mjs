import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {chromium} from "playwright";

const root = process.cwd();
const pdfScript = resolve(root,"node_modules/jspdf/dist/jspdf.umd.min.js");
const mime = {".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".png":"image/png"};
const server = createServer(async (request,response) => {
  const path = resolve(root, "." + new URL(request.url,"http://localhost").pathname.replace(/\/$/, "/index.html"));
  if (!path.startsWith(root+sep)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    response.writeHead(200,{"content-type":mime[extname(path)]||"application/octet-stream"}).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch();
const script = (route,body) => route.fulfill({contentType:"text/javascript",headers:{"access-control-allow-origin":"*"},body});
const staff = {id:"qa-staff",name:"Staff QA"};
const events = Array.from({length:6},(_,i)=>({id:"qa-"+i,title:"Jornada QA "+i,project:i%2?"QA B":"QA A",status:"confirmado",
  staff:[{personId:staff.id,start:"2026-11-"+(23+i)+"T09:00"}]}));
const record = {
  id:"qa-obligation",folio:"RF-QA",project:"Proyecto QA",category:"nomina",beneficiary:"Staff QA",status:"pago_parcial",
  approvedAmount:2500,paidAmount:1500,total:2500,createdAt:"2026-11-28",payments:[
    {id:"qa-payment",date:"2026-11-28",amount:1500,reference:"QA-1500",method:"transferencia"}
  ],items:[{description:"Semana QA",quantity:1,unitPrice:2500}],history:[]
};
const agreement = {personId:staff.id,amountCents:250000,effectiveFrom:"2026-11-23"};
try {
  for (const role of ["staff", "admin"]) {
    const page = await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
    page.setDefaultTimeout(9000);
    page.on("pageerror",error=>console.error("Error de página QA",error));
    await page.route("**/*", async route => {
      const url = route.request().url();
      if (url.startsWith(base) && url.endsWith("/firebase-init.js")) {
        return script(route,`const user={uid:"qa-user",email:"qa@example.invalid"};
          window.AGORA_FIREBASE={initialized:true,auth:{currentUser:user},firestore:{}};`);
      }
      if (url.endsWith("/firebase-auth.js")) return script(route,`export const onAuthStateChanged=(auth,callback)=>callback(auth.currentUser);`);
      if (url.endsWith("/firebase-firestore.js")) return script(route,`
        let finance = ${JSON.stringify(record)};
        const board = ${JSON.stringify({people:[staff],events})};
        const agreement = ${JSON.stringify(agreement)};
        const snapshot = (data,id) => ({data:()=>data,id,exists:()=>Boolean(data)});
        export const doc = (_,kind,id)=>({kind,id});
        export const collection = (_,kind)=>({kind});
        export const getDoc = async ()=>snapshot({active:true,role:${JSON.stringify(role)}},"qa-user");
        export const getDocFromServer = async ref=>ref.kind==="agora_ops_control"?
          snapshot({payload:board},ref.id):snapshot(finance,ref.id);
        export const getDocs = async ref=>({docs:ref.kind==="agora_finance_requests"?[snapshot(finance,finance.id)]:
          ref.kind==="agora_payroll_weekly_agreements"?[snapshot(agreement,agreement.personId)]:[]});
        export const getDocsFromServer = getDocs;
        export const serverTimestamp = ()=>"QA";
        export const runTransaction = async (_,cb)=>cb({get:getDocFromServer,update:(_,patch)=>{finance={...finance,...patch}}});
      `);
      if (url.endsWith("/jspdf.umd.min.js")) return route.fulfill({path:pdfScript,contentType:"text/javascript"});
      if (url.startsWith(base)) return route.continue();
      return route.abort();
    });
    await page.goto(base+"/recursos/?vista=personal");
    if (role==="staff") {
      await page.getByText("Solo local",{exact:true}).waitFor();
      assert.equal(await page.locator("#payroll-nav").isVisible(),false);
      await page.close();
      continue;
    }
    await page.getByRole("heading",{name:"Prenómina semanal estimada"}).waitFor();
    await page.locator("#weekly-start").fill("2026-11-23");
    await page.getByText("Base semanal estimada $2,500.00",{exact:true}).waitFor();
    await page.getByText("Staff QA · $2,500.00 · 6 jornadas",{exact:false}).first().waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto(base+"/recursos/?id=qa-obligation");
    await page.getByRole("button",{name:"Ver comprobante de este pago"}).click();
    const canvas = page.getByLabel("Vista previa del comprobante");
    assert.ok(await canvas.evaluate(node=>node.width===1240&&node.height>700));
    for (const [label,extension,signature] of [["Descargar PDF",".pdf","%PDF-"],["Descargar PNG",".png","89504e470d0a1a0a"]]) {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button",{name:label,exact:true}).click();
      const download = await downloadPromise;
      assert.ok(download.suggestedFilename().endsWith(extension));
      const file = await readFile(await download.path());
      assert.ok(file.length>1000);
      assert.ok(extension===".pdf"?file.toString("ascii",0,5)===signature:file.subarray(0,8).toString("hex")===signature);
    }
    await page.evaluate(()=>{window.open=url=>{window.qaShareUrl=url;};});
    await page.getByRole("button",{name:"WhatsApp",exact:true}).click();
    const share = new URL(await page.evaluate(()=>window.qaShareUrl));
    assert.equal(share.origin,"https://wa.me");
    assert.match(share.searchParams.get("text"),/DVM-PAG-qa-payment/);
    assert.match(share.searchParams.get("text"),/1,500\.00/);
    await page.getByRole("button",{name:"Volver al expediente"}).click();
    const paymentForm = page.locator("#payment-form");
    await paymentForm.locator('[name="amount"]').fill("1000");
    await paymentForm.locator('[name="date"]').fill("2026-11-28");
    await paymentForm.locator('[name="reference"]').fill("QA-1500");
    const invalid = await paymentForm.evaluate(form=>Array.from(form.elements).filter(el=>el.validity&&!el.validity.valid)
      .map(el=>[el.name,el.value,el.validationMessage]));
    assert.deepEqual(invalid,[]);
    await paymentForm.getByRole("button",{name:"Guardar pago"}).click();
    await page.getByText("Esta referencia ya fue registrada en la obligación.",{exact:true}).waitFor();
    await paymentForm.locator('[name="reference"]').fill("QA-1000");
    await paymentForm.getByRole("button",{name:"Guardar pago"}).click();
    await page.getByText("Pago registrado correctamente.",{exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Ver comprobante de este pago"}).count(),2);
    await page.close();
  }
  console.log("QA Chromium móvil: permisos de interfaz, semana fija, PDF/PNG reales y liquidación con Firestore simulado.");
} finally { await browser.close(); server.close(); }
