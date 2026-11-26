const steps=[
 ["brief","Confirmar sucursal, horario, responsables y permisos."],
 ["materiales","Confirmar inventario, cantidades, faltantes y responsables de entrega."],
 ["transporte","Confirmar origen, destino, vehículo y orden de entregas."],
 ["jornadas","Asignar al personal en Operaciones y revisar empalmes."],
 ["acuse","Cotejar la entrega con el acuse y registrar las diferencias reales."],
 ["evidencia","Organizar fotografías y evidencias por sucursal y fecha."],
 ["cierre","Confirmar devolución, faltantes, incidencias y evidencias pendientes."]
];
export const protocols={
 "hot-cruji-bravo":{name:"Hot Crují Bravo",type:"Activación",workMode:"jornada_activaciones",
  steps:[...steps.slice(0,4),["montaje","Revisar piezas, cabina, montaje y desmontaje del stand."],
   ["insumos","Confirmar insumos de degustación y promocionales de la dinámica."],...steps.slice(4)]},
 "apertura-kfc":{name:"Apertura KFC",type:"Apertura",workMode:"jornada_activaciones",
  steps:[...steps.slice(0,4),["produccion","Confirmar artes, producción publicitaria y materiales autorizados."],
   ["difusion","Confirmar las actividades aprobadas de difusión, volanteo o publiandantes."],...steps.slice(4)]}
};
export function readProtocol(id){
 if(!Object.hasOwn(protocols,id))throw Error("No se encontró el protocolo.");
 return protocols[id];
}
export function protocolDocument(id,completed=new Set()){
 const {name,steps}=readProtocol(id);
 return [name+" · Checklist operativo","Sucursal y fecha: por confirmar",
  ...steps.map(([key,label])=>(completed.has(key)?"[x] ":"[ ] ")+label),
  "Acuse: anotar cantidades recibidas, nombre y fecha al confirmar la entrega.",
  "Evidencias: vincular originales y observaciones en ÁGORA Archivos cuando haya conexión."].join("\n");
}
export function protocolDraft(id){
 const {name,type,workMode}=readProtocol(id);
 return {title:name,project:name,type,workMode,status:"borrador",
  notes:protocolDocument(id).slice(0,1200)};
}
