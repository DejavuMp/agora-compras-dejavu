import {protocols,readProtocol} from "./protocolos.mjs";
const byId=id=>document.getElementById(id),selector=byId("protocol");
import {checklistKey,receiptDocument} from "./entregas.mjs";
const status=byId("local-status"),folio=byId("activity-folio");
for(const [id,item] of Object.entries(protocols))selector.add(new Option(item.name,id));
const checked=new Map();
function load(id){
 if(!checked.has(id)){
  let saved=[];
  try{
   const data=JSON.parse(localStorage.getItem(id.startsWith("preview:")?"agora-campo-checklist-v1-"+id.slice(8):id)||"[]");
   if(Array.isArray(data))saved=data;
  }catch{status.textContent="El navegador no permite recuperar el avance local."}
  checked.set(id,new Set(saved));
 }
 return checked.get(id);
}
function refresh(){
 const id=selector.value,protocol=readProtocol(id),storageKey=checklistKey(id,folio.value),done=load(storageKey||"preview:"+id);
 status.textContent=storageKey?"Avance local para "+folio.value.trim()+" en este dispositivo.":"Ingresa el folio para guardar el avance del checklist en este dispositivo.";
 invalidateReceipt();
 byId("name").textContent=protocol.name;
 byId("open-draft").href="../../operaciones/?protocolo="+encodeURIComponent(id);
 byId("checklist").replaceChildren(...protocol.steps.map(([key,label])=>{
  const row=document.createElement("label"),input=document.createElement("input");
  input.type="checkbox";input.checked=done.has(key);
  input.addEventListener("change",()=>{
   if(input.checked)done.add(key);else done.delete(key);
   try{if(storageKey) localStorage.setItem(storageKey,JSON.stringify([...done]));}
   catch{status.textContent="El avance solo se conserva mientras esta pestaña está abierta."}
   showProgress(protocol,done);
  });
  row.append(input,document.createTextNode(label));return row;
 }));
 showProgress(protocol,done);
}
function showProgress(protocol,done){
 byId("progress").textContent=protocol.steps.filter(([id])=>done.has(id)).length+" de "+protocol.steps.length+" completados";
}
function online(){
 byId("connection").textContent=navigator.onLine?"Con conexión":"Sin conexión · checklist local";
}
selector.addEventListener("change",refresh);
folio.addEventListener("change",refresh);
function printSheet(name){
 document.body.dataset.print=name;
 try{window.print()}finally{delete document.body.dataset.print}
}
byId("print").addEventListener("click",()=>printSheet("protocol"));
const deliveryForm=byId("delivery-form"),materials=byId("materials");
function invalidateReceipt(){
 byId("receipt-preview").hidden=true;
}
function addMaterial(){
 const row=document.createElement("fieldset"),legend=document.createElement("legend");
 legend.textContent="Material";
 row.append(legend);
 if(materials.children.length){
  const remove=document.createElement("button");remove.type="button";remove.textContent="Quitar material";
  remove.addEventListener("click",()=>{row.remove();invalidateReceipt()});row.append(remove);
 }
 for(const [name,text,type] of [["material","Material o insumo","text"],["planned","Cantidad programada","number"],["received","Cantidad recibida","number"]]){
  const label=document.createElement("label"),input=document.createElement("input");
  label.textContent=text+" ";input.name=name;input.type=type;input.required=true;
  if(type==="number"){input.min="0";input.step="1"}else input.maxLength=120;
  label.append(input);row.append(label);
 }
 materials.append(row);
 invalidateReceipt();
}
addMaterial();
byId("add-material").addEventListener("click",addMaterial);
deliveryForm.addEventListener("input",invalidateReceipt);
folio.addEventListener("input",invalidateReceipt);
deliveryForm.addEventListener("submit",event=>{
 event.preventDefault();
 if(!folio.value.trim()){
  status.textContent="Indica un folio de actividad para preparar el acuse.";
  folio.focus();
  return;
 }
 const data=new FormData(deliveryForm);
 const rows=data.getAll("material").map((name,i)=>({name,planned:data.getAll("planned")[i],received:data.getAll("received")[i]}));
 try{
  byId("receipt").textContent=receiptDocument({protocol:selector.value,folio:folio.value,destination:data.get("destination"),date:data.get("date"),notes:data.get("notes"),rows});
  byId("receipt-preview").hidden=false;
 }catch(error){status.textContent=error.message}
});
byId("print-receipt").addEventListener("click",()=>printSheet("delivery"));
window.addEventListener("online",online);
window.addEventListener("offline",online);
online();refresh();
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{
 status.textContent="El navegador no pudo preparar la apertura sin conexión.";
});
