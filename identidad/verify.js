import {readPublicCredential} from "./firebase-identity.js";
const root=document.querySelector("#verification");
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const token=new URLSearchParams(location.search).get("id")||"";
try{
  const credential=await readPublicCredential(token);
  if(!credential)throw Error("La credencial no existe o fue retirada.");
  const active=credential.active===true&&credential.status==="vigente";
  root.innerHTML=`<p class="eyebrow">Verificación en tiempo real</p>
    <h1>${active?"Credencial vigente":"Credencial inválida o bloqueada"}</h1>
    <div class="credential ${active?"":"blocked"}">
      <div class="credential-head"><span>DEJAVÚ MARKETING · ÁGORA</span><span class="tag ${active?"ok":"bad"}">${active?"VIGENTE":"NO VÁLIDA"}</span></div>
      <div class="credential-body"><div><small>IDENTIDAD ÚNICA</small><h2>${esc(credential.displayName)}</h2>
        <p>${esc(credential.agoraId)} · ${esc(credential.jobTitle)}</p></div></div>
      ${!active?`<p>Motivo: ${esc(credential.blockReason||"Credencial suspendida")}</p>`:""}
    </div><p class="muted">Consulta realizada el ${new Intl.DateTimeFormat("es-MX",{dateStyle:"long",timeStyle:"short"}).format(new Date())}.</p>`;
}catch(error){
  console.error(error);
  root.innerHTML=`<p class="eyebrow">Verificación ÁGORA</p><h1>No fue posible validar la credencial</h1>
    <p class="notice error">${esc(error?.message||"Código inválido o sin conexión.")}</p><a class="button secondary" href="./">Volver al portal</a>`;
}
