import {readProtocol} from "./protocolos.mjs";

export function checklistKey(protocol,folio){
 const clean=folio.trim().toUpperCase();
 return clean?"agora-campo-checklist-v2:"+JSON.stringify([protocol,clean]):"";
}

function quantity(value){
 const number=Number(value);
 if(!String(value??"").trim()||!Number.isSafeInteger(number)||number<0)throw Error("Indica cantidades enteras de cero o más.");
 return number;
}

export function receiptDocument({protocol,folio,destination,date,notes,rows}){
 const {name}=readProtocol(protocol);
 if(!folio.trim()||!destination.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!rows.length)throw Error("Completa el folio, destino, fecha y materiales.");
 const items=rows.map(({name,planned,received})=>{
  const item=name.trim(),expected=quantity(planned),actual=quantity(received);
  if(!item)throw Error("Indica el nombre de cada material.");
  return item+" · Programado: "+expected+" · Recibido: "+actual+(expected===actual?"":" · Diferencia: "+(actual-expected));
 });
 return ["Acuse provisional de entrega · ÁGORA Campo",name,"Folio de actividad: "+folio.trim(),
  "Destino: "+destination.trim(),"Fecha de entrega: "+date,"",...items,"",
  ...(notes.trim()?["Observaciones: "+notes.trim(),""]:[]),
  "Nombre y firma de quien recibe: ______________________________",
  "Pendiente de cotejo con la entrega y las evidencias en ÁGORA."].join("\n");
}
