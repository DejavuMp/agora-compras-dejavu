export const JOBS = Object.freeze({
  "Coordinador": {level:"Mando operativo", mission:"Liderar la operación, validar asistencias y resolver incidencias.", checklist:["Confirmar equipo y accesos","Validar arranque y comunicación","Cerrar y documentar incidencias"]},
  "Subcoordinador de cuenta": {level:"Mando de cuenta", mission:"Apoyar la supervisión de células, insumos y avances.", checklist:["Distribuir células","Revisar insumos","Consolidar avances"]},
  "Supervisor": {level:"Control en piso", mission:"Vigilar calidad, imagen, puntualidad y seguridad.", checklist:["Revisar uniforme","Coordinar descansos","Liberar operación"]},
  "Staff": {level:"Operación directa", mission:"Atender al público y ejecutar la actividad asignada.", checklist:["Presentarse en punto","Seguir el protocolo","Reportar incidencias"]},
  "Staff de montaje": {level:"Logística previa", mission:"Descargar, armar y probar los elementos del evento.", checklist:["Usar protección","Seguir el plano","Entregar área limpia"]},
  "Staff de desmontaje": {level:"Logística de cierre", mission:"Retirar, contar y resguardar los elementos del evento.", checklist:["Esperar liberación","Contar y empacar","Dejar el espacio limpio"]},
  "Volanteero": {level:"Activación en punto", mission:"Promover, entregar material y captar interés en la zona autorizada.", checklist:["Confirmar perímetro","Usar discurso de marca","Reportar material"]},
  "Runner": {level:"Soporte ágil", mission:"Trasladar materiales y resolver requerimientos urgentes.", checklist:["Mantener comunicación","Priorizar traslados","Confirmar entregas"]}
});

export const JOB_NAMES = Object.freeze(Object.keys(JOBS));
export const ID_PATTERN = /^DJV-(\d{4})-(\d{3,})$/;

export function formatAgoraId(year, sequence) {
  if (!Number.isInteger(year) || year < 2020 || year > 2200) throw new Error("Año de identidad inválido.");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) throw new Error("Secuencia de identidad inválida.");
  return `DJV-${year}-${String(sequence).padStart(3, "0")}`;
}

export function normalizeText(value, max = 180) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function validJob(job) { return JOB_NAMES.includes(job); }

export function validateBlockReason(value) {
  const reason = normalizeText(value, 240);
  if (reason.length < 5) throw new Error("Indica un motivo de al menos 5 caracteres.");
  return reason;
}

export function csvCell(value) {
  let text = normalizeText(value, 500);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function instant(value) {
  if (value?.toDate) return value.toDate().getTime();
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : NaN;
}

function sameLocalDay(a, b) {
  const left = new Date(a), right = new Date(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function projectTodayAssignments(staffDocument, now = new Date()) {
  const personId = normalizeText(staffDocument?.personId, 100);
  if (!personId || !Array.isArray(staffDocument?.events)) return [];
  const sites = new Map((Array.isArray(staffDocument.sites) ? staffDocument.sites : [])
    .filter(site => typeof site?.id === "string").map(site => [site.id, site]));
  return staffDocument.events.flatMap((event) => {
    if (["cancelado","borrador"].includes(event?.status)) return [];
    const assignment = Array.isArray(event?.staff) ? event.staff.find((item) => item?.personId === personId) : null;
    const start = instant(assignment?.start ?? event?.start);
    const end = instant(assignment?.end ?? event?.end);
    if (!assignment || !Number.isFinite(start) || !Number.isFinite(end) || !sameLocalDay(start, now)) return [];
    return [{
      eventId: normalizeText(event.id, 100),
      project: normalizeText(event.project || event.campaign || event.title || event.type, 160),
      site: normalizeText(event.venueName || sites.get(event.siteId)?.name || event.location || event.siteName || event.site || event.place, 180),
      start: new Date(start), end: new Date(end),
      jobTitle: normalizeText(assignment.role || assignment.jobTitle || staffDocument?.person?.role || "", 80),
      activity: normalizeText(assignment.activity || event.activity || event.type || "", 240),
      responsible: normalizeText(assignment.assignedByName || event.responsible || event.coordinator || "", 140),
      instructions: normalizeText(assignment.instructions || event.instructions || event.notes || "", 300)
    }];
  }).sort((a, b) => a.start - b.start);
}

export function publicCredential(registry) {
  if (!registry || !ID_PATTERN.test(String(registry.agoraId || ""))) throw new Error("Identidad inválida.");
  if (!validJob(registry.jobTitle)) throw new Error("Cargo inválido.");
  return {
    agoraId: registry.agoraId,
    displayName: normalizeText(registry.displayName, 140),
    jobTitle: registry.jobTitle,
    active: registry.credentialActive === true,
    status: registry.credentialActive === true ? "vigente" : "bloqueada",
    blockReason: registry.credentialActive === true ? "" : "Credencial suspendida"
  };
}
