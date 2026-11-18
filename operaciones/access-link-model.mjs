/**
 * Lógica pura de vinculación: nunca concede acceso sin la confirmación
 * explícita de coordinación y una transacción autorizada en Firestore.
 */
const norm=v=>String(v??"").trim().toLocaleLowerCase("es-MX");

export function availablePeople(people,uid){
  return (Array.isArray(people)?people:[]).filter(p=>
    p&&typeof p.id==="string"&&p.id&&typeof p.name==="string"&&p.name.trim()&&
    (!p.authUid||p.authUid===uid)
  ).sort((a,b)=>a.name.localeCompare(b.name,"es-MX"));
}

/** Entrega la ficha actualizada sin modificar el tablero original. */
export function personForLink(board,{uid,email,selection,newName,newId}){
  const people=Array.isArray(board?.people)?board.people:[];
  if(!uid||!email||!selection)throw Error("Selecciona una persona antes de vincular.");
  if(people.some(p=>p.authUid===uid&&p.id!==selection))
    throw Error("Esta cuenta ya está vinculada con otra ficha de personal.");
  if(selection==="__new__"){
    const name=String(newName??"").trim();
    if(name.length<2||name.length>120)throw Error("Escribe un nombre válido para la nueva ficha.");
    if(!newId||people.some(p=>p.id===newId))throw Error("No se pudo generar un identificador único.");
    if(people.length>=200)throw Error("Se alcanzó el máximo de fichas de personal.");
    const matching=people.find(p=>norm(p.email)===norm(email));
    if(matching)throw Error("Ya existe una ficha con este correo. Selecciónala en lugar de duplicarla.");
    const person={id:newId,name,role:"",phone:"",email:String(email).trim(),
      hourRate:0,dayRate:0,active:true,authUid:uid};
    return {person,created:true,id:newId};
  }
  const original=people.find(p=>p.id===selection);
  if(!original)throw Error("La ficha elegida ya no existe.");
  if(original.authUid&&original.authUid!==uid)throw Error("Esta ficha ya pertenece a otra cuenta.");
  if(people.some(p=>p.id!==selection&&p.authUid===uid))
    throw Error("Esta cuenta ya está vinculada con otra ficha.");
  return {person:{...original,authUid:uid},created:false,id:selection};
}
