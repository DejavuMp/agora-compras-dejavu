/* ÁGORA Operaciones: vistas mínimas, sin sueldos ni registros privados.
 * Las reglas de Firestore, no este módulo, deciden qué documentos puede leer cada usuario.
 */
const str = (v, limit=300) => String(v ?? "").slice(0, limit);
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const field = (object, allowed) => Object.fromEntries(allowed.filter(k => object?.[k] !== undefined).map(k => [k, object[k]]));
const staffEventFields = [
  "id","seriesId","dayCount","dayIndex","title","project","campaign",
  "siteId","venueName","venueAddress","location","origin","stops",
  "type","status","start","end","before","after","travelMin","routeBufferMin","notes"
];
const staffSettings = ["dailyLimit","weeklyLimit","prepDefault","afterDefault","notificationMinutes","lateGraceMinutes","earlyGraceMinutes"];

export function projectStaffView(person, board) {
  const mine = (board.events || []).filter(e => (e.staff || []).some(a => a.personId === person.id))
    .map(e => ({
      ...field(e, staffEventFields),
      vehicles: (e.vehicles || []).slice(0, 50),
      staff: (e.staff || []).filter(a => a.personId === person.id).map(a => field(a, ["personId","start","end"]))
    }));
  const units = new Set(mine.flatMap(e => e.vehicles || []));
  const siteIds = new Set(mine.map(e => e.siteId).filter(Boolean));
  return {
    personId:person.id,
    person:field(person, ["id","name","role","phone","email","active"]),
    events:mine,
    vehicles:(board.vehicles || []).filter(v => units.has(v.id)).map(v => field(v, ["id","name","active","type"])),
    sites:(board.sites || []).filter(s => siteIds.has(s.id)).map(s => field(s, ["id","name","address","city"])),
    campaigns:[],
    settings:field(board.settings || {}, staffSettings)
  };
}

const ms = v => new Date(v).getTime();
const overlap = (a,b,c,d) => [ms(a),ms(b),ms(c),ms(d)].every(Number.isFinite) && ms(a)<ms(d) && ms(c)<ms(b);
const span = e => {
  const times = (e.staff || []).flatMap(a => [ms(a.start),ms(a.end)]).filter(Number.isFinite);
  const start = Math.min(ms(e.start) - num(e.before)*60000, ...times);
  const end = Math.max(ms(e.end) + num(e.after)*60000, ...times);
  return [new Date(start-(num(e.travelMin)+num(e.routeBufferMin))*60000).toISOString(),
          new Date(end+num(e.travelMin)*60000).toISOString()];
};

function flaggedEvents(events) {
  const set = new Set();
  const active = events.filter(e => !["borrador","cancelado"].includes(e.status));
  for(let i=0;i<active.length;i++) for(let j=i+1;j<active.length;j++){
    const a=active[i],b=active[j];
    const staffOverlap=(a.staff||[]).some(p => (b.staff||[]).some(q =>
      p.personId && p.personId===q.personId && overlap(p.start,p.end,q.start,q.end)));
    const sameVehicle=(a.vehicles||[]).some(id => (b.vehicles||[]).includes(id));
    const vehicleOverlap=sameVehicle && overlap(...span(a),...span(b));
    if(staffOverlap||vehicleOverlap){set.add(a.id);set.add(b.id)}
  }
  return set;
}

/* Únicamente se presenta a administradores y coordinadores autenticados.
 * Nunca incluir aquí personas, tarifas, placas, reportes de horas, pagos o UID.
 */
export function projectViewerView(board) {
  const sites = new Map((board.sites || []).map(s => [s.id, s]));
  const flags = flaggedEvents(board.events || []);
  const events=(board.events || []).map(e => {
    const site=sites.get(e.siteId) || {};
    return {
      id:str(e.id,100),seriesId:str(e.seriesId,100),title:str(e.title,120),
      type:str(e.type,80),project:str(e.project,120),campaign:str(e.campaign,120),
      venueName:str(e.venueName || site.name || e.location,160),
      venueAddress:str(e.venueAddress || site.address,300),
      location:str(e.location,200),origin:str(e.origin,300),stops:str(e.stops,500),
      start:str(e.start,24),end:str(e.end,24),status:str(e.status,40),
      dayCount:num(e.dayCount),dayIndex:num(e.dayIndex),
      staffCount:(e.staff||[]).length,vehicleCount:(e.vehicles||[]).length,
      travelMin:num(e.travelMin),routeBufferMin:num(e.routeBufferMin),
      before:num(e.before ?? 30),after:num(e.after ?? 30),
      conflict:flags.has(e.id)
    };
  });
  return {events};
}
