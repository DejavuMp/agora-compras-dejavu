export function assignmentPrefill(request){
 if(request?.status!=="pendiente")throw Error("La solicitud ya fue revisada o no está disponible.");
 const {date,start,end}=request;
 const day=new Date(date+"T00:00:00Z");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(day.getTime())||
  day.toISOString().slice(0,10)!==date||
  ![start,end].every(clock=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock))||start===end)
  throw Error("La solicitud no tiene un horario válido para preparar la jornada.");
 const project=String(request.project||"").trim();
 if(!project)throw Error("La solicitud no indica el proyecto.");
 if(end<start)day.setUTCDate(day.getUTCDate()+1);
 return {title:project.slice(0,120),project,venueName:String(request.site||"").trim(),
  start:date+"T"+start,end:day.toISOString().slice(0,10)+"T"+end,status:"borrador"};
}
