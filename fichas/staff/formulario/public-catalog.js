/* Dejavú Marketing · catálogo público de fichas aprobadas.
   Solo lee documentos públicos en dejavu_staff_publicadas. Nunca solicita login. */
import "../../../firebase-init.js";
import {collection,doc,getDocs,getDoc,query,orderBy,limit} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
const fb=window.AGORA_FIREBASE;
const app=window.DEJAVU_PUBLIC_APP;
const COL='dejavu_staff_publicadas';
function normalized(x,id){
 const s=k=>String(x?.[k]??'').slice(0,k==='location'?240:95);
 return {id:String(id||x?.id||''),campaign:s('campaign'),responsible:s('responsible'),
 activityDate:s('activityDate').slice(0,10),location:s('location')};
}
async function load(){
 if(!fb||!fb.firestore){app.setError('No se pudo iniciar el catálogo compartido. El formulario de pagos sigue disponible.');return}
 try{
  app.setLoading('Consultando las fichas publicadas por Dejavú…');
  const snap=await getDocs(query(collection(fb.firestore,COL),orderBy('activityDate','desc'),limit(800)));
  const rows=snap.docs.map(d=>normalized(d.data(),d.id));
  app.setCards(rows);
  const id=app.currentRequestedId();
  if(id&&!rows.some(x=>x.id===id)){
   try{const one=await getDoc(doc(fb.firestore,COL,id));if(one.exists())app.openCard(normalized(one.data(),one.id),false);
    else app.notFound();}
   catch(e){app.notFound()}
  }else if(id){app.openCard(rows.find(r=>r.id===id),false)}
 }catch(e){
  console.warn('Catálogo público de Dejavú:',e);
  app.setError(e?.code==='permission-denied'?'El catálogo aún no está habilitado en Firebase. Mientras tanto, el formulario de pagos sigue disponible.':'No pudimos consultar las fichas publicadas. Comprueba tu conexión o vuelve a intentarlo.');
 }
}
if(!app.hasSharedCatalog()){app.onRefresh(load);load();}else{app.onRefresh(()=>app.setLoading('Estás viendo un catálogo compartido. Para recibir fichas nuevas, pide a Dejavú un enlace actualizado.'));}
