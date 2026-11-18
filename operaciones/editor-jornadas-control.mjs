/* ÁGORA: control de acceso por evento, dentro del editor, con permisos existentes. */
const e=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function linkedStaff(event,people){
  const byId=new Map((people||[]).map(p=>[p.id,p]));
  const linked=[],missing=[],uids=new Set();
  for(const assignment of event.staff||[]){
    const person=byId.get(assignment.personId);
    if(!person||person.active===false||!person.authUid){missing.push(person?.name||"Ficha sin usuario");continue}
    if(uids.has(person.authUid))throw Error("Cuenta duplicada en esta actividad.");
    const start=new Date(assignment.start||event.start),end=new Date(assignment.end||event.end);
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>=end)throw Error("Horarios del personal inválidos.");
    linked.push({uid:person.authUid,personId:person.id,start,end,name:person.name});
    uids.add(person.authUid);
  }
  return {linked,missing};
}
export function eventPolicyEntries(event,people,enabled,mode,uid,serverTimestamp){
  if(!["horario","horas"].includes(mode))throw Error("Modalidad inválida.");
  const {linked,missing}=linkedStaff(event,people);
  if(!linked.length)throw Error("Primero vincula al staff con una cuenta de acceso.");
  if(linked.length>100)throw Error("Demasiados integrantes en una sola operación.");
  return {missing,items:linked.map(p=>({
    id:p.uid+"_"+event.id,
    data:{ownerUid:p.uid,personId:p.personId,eventId:event.id,enabled,mode,
      startsAt:p.start,endsAt:p.end,maxMinutes:Math.max(30,Math.min(1440,Math.round((p.end-p.start)/60000))),
      updatedAt:serverTimestamp(),updatedBy:uid}
  }))};
}
export function createEventControl({getBoard,getUser,isCoordinator,fs,doc,collection,onSnapshot,runTransaction,serverTimestamp}){
  let panel=null,policies=new Map(),off=null,busy=false,loaded=false,filter="";
  const status=msg=>{const x=panel?.querySelector("#event-control-status");if(x)x.textContent=msg};
  function install(){
    if(panel)return;
    panel=document.createElement("div");panel.id="event-control-overlay";panel.hidden=true;panel.className="event-control-overlay";
    document.body.appendChild(panel);
    const style=document.createElement("style");
    style.textContent=[
      ".event-control-overlay{position:fixed;inset:0;z-index:9000;background:#0009;display:grid;place-items:center;padding:14px}",
      ".event-control-overlay[hidden],.event-control-card[hidden]{display:none!important}",
      ".event-control-window{width:min(1100px,100%);max-height:calc(100vh - 28px);background:#f8f8f6;border-radius:14px;overflow:auto;box-shadow:0 22px 80px #0005}",
      ".event-control-header{display:flex;justify-content:space-between;align-items:center;background:#212325;color:white;padding:16px 20px;gap:14px}",
      ".event-control-header h2{color:white;font-size:19px;margin:0}.event-control-header p{color:#ddd;font-size:12px;margin:5px 0 0}",
      ".event-control-header button,.event-control-action{border:1px solid #bbb;padding:9px 13px;border-radius:8px;cursor:pointer;background:white;color:#222;font-weight:700}",
      ".event-control-body{padding:15px}.event-control-body input{width:100%;padding:12px;border:1px solid #ddd;border-radius:9px;margin:0 0 14px}",
      ".event-control-status{background:#fff6df;padding:11px 14px;border-radius:9px;font-size:12px;margin-bottom:10px}",
      ".event-control-card{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(130px,.7fr) auto;gap:12px;align-items:center;border:1px solid #ddd;border-radius:10px;margin:8px 0;padding:13px;background:white}",
      ".event-control-card h3{font-size:14px;margin:0 0 6px}.event-control-card p{font-size:12px;color:#656b70;margin:4px 0}",
      ".event-control-card label{font-size:11px}.event-control-card select{display:block;width:100%;margin-top:5px;border:1px solid #ccc;padding:9px;border-radius:8px}",
      ".event-control-buttons{display:flex;gap:6px;flex-wrap:wrap}.event-control-action.on{background:#252525;color:white}",
      ".event-control-action:disabled{opacity:.5;cursor:not-allowed}",
      "@media(max-width:820px){.event-control-card{grid-template-columns:1fr}}"
    ].join("\n");
    document.head.appendChild(style);
    panel.addEventListener("click",async ev=>{
      if(ev.target===panel||ev.target.closest("[data-control-close]")){panel.hidden=true;return}
      const button=ev.target.closest("[data-event-control]");if(!button||busy||!isCoordinator())return;
      const board=getBoard(),event=board?.events?.find(x=>x.id===button.dataset.id);
      if(!event)return;
      busy=true;button.disabled=true;status("Actualizando los accesos del evento…");
      try{
        const mode=button.closest(".event-control-card").querySelector("select").value;
        const result=eventPolicyEntries(event,board.people,button.dataset.eventControl==="on",mode,getUser()?.uid,serverTimestamp);
        await runTransaction(fs,async tx=>{
          const refs=result.items.map(x=>doc(fs,"agora_ops_shift_access",x.id));
          const previous=await Promise.all(refs.map(ref=>tx.get(ref)));
          previous.forEach((snap,i)=>{
            if(snap.exists()&&(snap.data().ownerUid!==result.items[i].data.ownerUid||snap.data().personId!==result.items[i].data.personId))
              throw Error("Inconsistencia de identidad. No se guardó ningún permiso.");
          });
          result.items.forEach((x,i)=>tx.set(refs[i],x.data));
        });
        status((button.dataset.eventControl==="on"?"Evento activado":"Evento desactivado")+
          " para "+result.items.length+" integrante(s)."+
          (result.missing.length?" Sin cuenta vinculada: "+result.missing.join(", "):""));
      }catch(err){status("No se guardó el control: "+String(err?.message||err))}
      finally{busy=false;render()}
    });
    panel.addEventListener("input",ev=>{
      if(ev.target.id!=="event-control-search")return;
      filter=ev.target.value.trim().toLocaleLowerCase("es-MX");
      panel.querySelectorAll("[data-event-search]").forEach(x=>x.hidden=!x.dataset.eventSearch.includes(filter));
    });
  }
  function render(){
    if(!panel||panel.hidden||!isCoordinator())return;
    const board=getBoard(),events=(board?.events||[]).filter(x=>x.status!=="cancelado")
      .slice().sort((a,b)=>new Date(b.start)-new Date(a.start)).slice(0,150);
    const items=events.map(event=>{
      let linked=[],missing=[],error="";
      try{({linked,missing}=linkedStaff(event,board.people||[]))}
      catch(ex){error=String(ex?.message||ex)}
      const enabled=linked.filter(p=>policies.get(p.uid+"_"+event.id)?.enabled===true).length;
      const summary=linked.length===0?"Sin cuentas vinculadas":enabled===linked.length&&missing.length===0?"Activada":enabled===0?"Desactivada":"Parcial";
      const p=linked.find(x=>policies.has(x.uid+"_"+event.id));
      const mode=p?policies.get(p.uid+"_"+event.id).mode:"horario";
      const description=[event.venueName||event.location||"Sede",event.title||event.type||"Actividad",event.campaign||""].join(" ");
      return '<article class="event-control-card" data-event-search="'+e(description.toLocaleLowerCase("es-MX"))+'">'+
        '<div><h3>'+e(event.title||event.type)+'</h3><p>'+e(event.venueName||event.location||"Sede pendiente")+
        ' · '+e(new Date(event.start).toLocaleString("es-MX"))+'</p><p>'+e(summary)+' · '+enabled+
        '/'+linked.length+' integrantes habilitados'+(missing.length?' · '+missing.length+' pendiente(s) de vinculación':'')+
        (error?' · '+e(error):'')+'</p></div>'+
        '<label>Tipo de control<select aria-label="Modalidad del evento">'+
        '<option value="horario" '+(mode==="horario"?"selected":"")+'>Horario definido</option>'+
        '<option value="horas" '+(mode==="horas"?"selected":"")+'>Cantidad de horas</option>'+
        '</select></label>'+
        '<div class="event-control-buttons"><button class="event-control-action on" type="button" data-event-control="on" data-id="'+e(event.id)+'" '+(busy||!linked.length?"disabled":"")+'>Activar evento</button>'+
        '<button class="event-control-action" type="button" data-event-control="off" data-id="'+e(event.id)+'" '+(busy||!linked.length?"disabled":"")+'>Desactivar</button></div></article>';
    }).join("");
    panel.innerHTML='<div class="event-control-window" role="dialog" aria-modal="true" aria-label="Control de jornadas dentro del editor">'+
      '<div class="event-control-header"><div><h2>Control de jornadas · por evento</h2>'+
      '<p>Una sola acción habilita o deshabilita los marcajes de todo el staff vinculado.</p></div>'+
      '<button type="button" data-control-close>Cerrar</button></div>'+
      '<div class="event-control-body"><p id="event-control-status" class="event-control-status">'+
      (loaded?"Permisos sincronizados desde Firebase.":"Consultando permisos…")+'</p>'+
      '<input type="search" id="event-control-search" placeholder="Buscar actividad, sucursal o campaña" value="'+e(filter)+'">'+
      (items||"<p>No hay actividades en la agenda.</p>")+'</div></div>';
    if(filter)panel.querySelectorAll("[data-event-search]").forEach(x=>x.hidden=!x.dataset.eventSearch.includes(filter));
  }
  function open(){
    if(!isCoordinator())return;
    install();panel.hidden=false;render();
    if(!off)off=onSnapshot(collection(fs,"agora_ops_shift_access"),{includeMetadataChanges:true},snap=>{
      if(snap.metadata.fromCache)return;
      policies=new Map(snap.docs.map(d=>[d.id,d.data()]));loaded=true;render();
    },err=>status("Error verificando permisos: "+String(err?.message||err)));
    panel.querySelector("[data-control-close]")?.focus();
  }
  function stop(){if(panel)panel.hidden=true;if(off){off();off=null}policies.clear();loaded=false}
  return {open,stop,render};
}
