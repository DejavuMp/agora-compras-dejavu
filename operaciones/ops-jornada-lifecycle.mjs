export const journeyLabels = Object.freeze({
  cancelada: "Cancelada", archivada: "Archivada", papelera: "En papelera", restaurada: "Restaurada como borrador"
});

export function journeyState(event) {
  if (event.status !== "cancelado") return "activa";
  const state = event.journeyHistory?.at(-1)?.state;
  return state === "archivada" || state === "papelera" ? state : "cancelada";
}

export function moveJourneys(events, ids, target, {isAdmin, actor, reason, at}) {
  const selected = new Set(ids);
  if (!selected.size || !actor || !at || !Object.hasOwn(journeyLabels, target)) {
    throw new Error("Selecciona las jornadas y la operación.");
  }
  if (target !== "cancelada" && !isAdmin) throw new Error("Este movimiento requiere Administración.");
  const note = reason.trim();
  if (note.length < 5 || note.length > 300) throw new Error("Indica un motivo de 5 a 300 caracteres.");
  const matched = events.filter(event => selected.has(event.id));
  if (matched.length !== selected.size) throw new Error("La selección cambió. Actualiza la lista.");
  for (const event of matched) {
    const from = journeyState(event);
    const allowed = {
      activa: ["cancelada", "archivada", "papelera"],
      cancelada: ["archivada", "papelera", "restaurada"],
      archivada: ["papelera", "restaurada"],
      papelera: ["restaurada"]
    };
    if (!allowed[from].includes(target)) {
      throw new Error("El movimiento no corresponde al estado actual de «" + event.title + "».");
    }
  }
  return events.map(event => selected.has(event.id) ? {
    ...event,
    status: target === "restaurada" ? "borrador" : "cancelado",
    journeyHistory: [...(event.journeyHistory ?? []), {state: target, from: journeyState(event),
      previousStatus: event.status, byUid: actor, note, at}]
  } : event);
}

export function duplicateJourneyDraft(event) {
  const fields = ["project","campaign","siteId","location","origin","stops","travelMin",
    "routeBufferMin","staffBufferMin","type","workMode","start","end","before","after",
    "notes","venueName","venueAddress","responsibleCoordinator","driverId"];
  const draft = Object.fromEntries(fields.filter(field => event[field] !== undefined)
    .map(field => [field, event[field]]));
  return {...draft, title: String(event.title).slice(0, 110) + " (copia)", status: "borrador",
    staff: (event.staff ?? []).map(({personId, start, end}) => ({personId, start, end})),
    vehicles: [...(event.vehicles ?? [])]};
}
