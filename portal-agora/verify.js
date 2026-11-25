import {db} from "./firebase.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const result=document.getElementById("result");
const id=(new URL(location.href)).searchParams.get("id")||"";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
if(!/^[0-9a-f]{24,64}$/i.test(id)){
  result.textContent="Código de verificación no válido.";
  result.className="note error";
}else{
  try{
    const snap=await getDoc(doc(db,"agora_identity_credentials",id));
    if(!snap.exists()){
      result.textContent="No se encontró una credencial con este código.";
      result.className="note error";
    }else{
      const d=snap.data();
      // Proyección pública mínima: no se muestran contactos, montos, datos médicos ni fiscales.
      const active=d.active===true&&d.status==="vigente";
      result.className="note"+(active?" success":" error");
      result.innerHTML="<b>"+(active?"CREDENCIAL VIGENTE":"CREDENCIAL NO VIGENTE")+"</b>"+
       "<p><b>ID:</b> "+esc(d.agoraId)+"</p><p><b>Nombre:</b> "+esc(d.displayName)+
       "</p><p><b>Cargo:</b> "+esc(d.jobTitle)+"</p>"+
       (active?'<p><a class="btn outline" href="./?asistencia=1">Registrar mi propia entrada o salida</a></p>':"")+
       '<p>Este QR verifica identidad y vigencia. No registra asistencia automáticamente; el marcaje requiere iniciar sesión con la cuenta del titular y una jornada autorizada.</p>';
    }
  }catch(e){
    console.error(e);
    result.textContent="No se pudo validar el código. Comprueba tu conexión.";
    result.className="note error";
  }
}
