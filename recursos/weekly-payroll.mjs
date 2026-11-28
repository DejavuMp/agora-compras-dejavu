const isoDay = /^\d{4}-\d{2}-\d{2}$/;
export const personKey = /^[A-Za-z0-9_-]{1,90}$/;

export function addDays(day, count) {
  if (!isoDay.test(day)) throw new Error("Selecciona una fecha válida.");
  const date = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new Error("Selecciona una fecha válida.");
  }
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function mxnCents(value) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function weeklyPayroll(schedule, agreements, start) {
  const end = addDays(start, 7);
  const effective = new Map();
  for (const agreement of agreements) {
    if (agreement.effectiveFrom > start) continue;
    const current = effective.get(agreement.personId);
    if (!current || agreement.effectiveFrom > current.effectiveFrom) effective.set(agreement.personId, agreement);
  }
  const people = new Map((schedule.people ?? []).map(person => [person.id, person]));
  const rows = new Map();
  for (const event of schedule.events ?? []) {
    if (["cancelado", "borrador"].includes(event.status)) continue;
    for (const shift of event.staff ?? []) {
      const date = (shift.start || event.start || "").slice(0, 10);
      if (date < start || date >= end) continue;
      const personId = shift.personId;
      const agreement = effective.get(personId);
      if (!agreement || agreement.amountCents === 0 || !people.has(personId)) continue;
      if (!rows.has(personId)) {
        rows.set(personId, {person: people.get(personId), agreement, events: new Map()});
      }
      rows.get(personId).events.set(event.id, event);
    }
  }
  return [...rows.values()].map(row => ({...row, events: [...row.events.values()]}));
}
