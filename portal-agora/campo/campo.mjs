import {protocols,readProtocol} from "./protocolos.mjs";
const byId=id=>document.getElementById(id),selector=byId("protocol");
const status=byId("local-status"),prefix="agora-campo-checklist-v1-";
for(const [id,item] of Object.entries(protocols))selector.add(new Option(item.name,id));
const checked=new Map();
function load(id){
 if(!checked.has(id)){
  let saved=[];
  try{
   const data=JSON.parse(localStorage.getItem(prefix+id)||"[]");
   if(Array.isArray(data))saved=data;
  }catch{status.textContent="El navegador no permite recuperar el avance local."}
  checked.set(id,new Set(saved));
 }
 return checked.get(id);
}
function refresh(){
 const id=selector.value,protocol=readProtocol(id),done=load(id);
 byId("name").textContent=protocol.name;
 byId("open-draft").href="../../operaciones/?protocolo="+encodeURIComponent(id);
 byId("checklist").replaceChildren(...protocol.steps.map(([key,label])=>{
  const row=document.createElement("label"),input=document.createElement("input");
  input.type="checkbox";input.checked=done.has(key);
  input.addEventListener("change",()=>{
   if(input.checked)done.add(key);else done.delete(key);
   try{localStorage.setItem(prefix+id,JSON.stringify([...done]));}
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
byId("print").addEventListener("click",()=>window.print());
window.addEventListener("online",online);
window.addEventListener("offline",online);
online();refresh();
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{
 status.textContent="El navegador no pudo preparar la apertura sin conexión.";
});
