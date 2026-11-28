import {addDays, mxnCents, personKey, weeklyPayroll} from "./weekly-payroll.mjs";

const AGREEMENTS = "agora_payroll_weekly_agreements";
const weekday = day => new Date(addDays(day, 0) + "T00:00:00Z").getUTCDay();

function currentWeek() {
  const today = new Intl.DateTimeFormat("sv-SE", {timeZone: "America/Mexico_City"}).format(new Date());
  return addDays(today, -((weekday(today) + 6) % 7));
}

export function mountWeeklyPayroll(host, {session, connection, money, onError, notify}) {
  const form = host.querySelector("#weekly-agreement");
  const controls = host.querySelector("#weekly-controls");
  const versions = host.querySelector("#weekly-versions");
  const output = host.querySelector("#weekly-rows");
  const start = host.querySelector("#weekly-start");
  const select = form.elements.person;
  const submit = form.querySelector('[type="submit"]');
  let snapshot = null;
  let version = 0;

  function reset() {
    version++;
    snapshot = null;
    form.reset();
    select.replaceChildren();
    render();
  }

  function render() {
    controls.hidden = !session() || !snapshot;
    versions.replaceChildren();
    output.replaceChildren();
    if (!session() || !snapshot) {
      output.textContent = session() ? "Consultando acuerdos y cronograma…" :
        "Disponible para Administración con sesión de Firebase.";
      return;
    }

    const text = (tag, value) => {
      const node = document.createElement(tag);
      node.textContent = value;
      return node;
    };
    for (const item of snapshot.agreements.filter(item => item.personId === select.value)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))) {
      versions.append(text("li", item.effectiveFrom + " · " + money(item.amountCents / 100) +
        (item.note ? " · " + item.note : "")));
    }

    if (!start.value || weekday(start.value) !== 1) {
      output.textContent = "Selecciona el lunes que inicia la semana.";
      return;
    }
    const rows = weeklyPayroll(snapshot.board, snapshot.agreements, start.value);
    const total = rows.reduce((sum, row) => sum + row.agreement.amountCents, 0);
    output.append(text("h4", "Base semanal estimada " + money(total / 100)),
      text("p", start.value + " al " + addDays(start.value, 6)));
    if (!rows.length) {
      output.append(text("p", "Sin jornadas programadas con acuerdo semanal vigente en este periodo."));
      return;
    }
    const list = document.createElement("ul");
    for (const {person, agreement, events} of rows) {
      const item = text("li", person.name + " · " + money(agreement.amountCents / 100) +
        " · " + events.length + " jornadas");
      item.append(text("small", events.map(event => [event.title, event.project].filter(Boolean).join(" · ")).join(", ")));
      item.querySelector("small").style.display = "block";
      list.append(item);
    }
    output.append(list);
  }

  async function load() {
    const actor = session();
    if (!actor) return;
    const revision = ++version;
    const {sdk, db} = connection();
    snapshot = null;
    render();
    try {
      const [schedule, agreements] = await Promise.all([
        sdk.getDocFromServer(sdk.doc(db, "agora_ops_control", "schedule")),
        sdk.getDocsFromServer(sdk.collection(db, AGREEMENTS))
      ]);
      if (revision !== version || actor !== session()) return;
      const board = schedule.data()?.payload ?? {};
      const selected = select.value;
      const people = (board.people ?? []).filter(person => personKey.test(person.id))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
      select.replaceChildren(new Option("Selecciona a una persona", ""));
      for (const person of people) select.add(new Option(person.name + " · " + person.id, person.id));
      if (people.some(person => person.id === selected)) select.value = selected;
      if (!start.value) start.value = currentWeek();
      snapshot = {board, agreements: agreements.docs.map(doc => doc.data())};
      render();
    } catch (error) {
      if (revision === version && actor === session()) {
        output.textContent = "No se pudo cargar la prenómina. " + onError(error);
      }
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const actor = session();
    if (!actor || !snapshot || submit.disabled) return;
    const fields = new FormData(form);
    const personId = String(fields.get("person") ?? "");
    const effectiveFrom = String(fields.get("effectiveFrom") ?? "");
    const amountCents = mxnCents(fields.get("amount"));
    const note = String(fields.get("note") ?? "").trim();
    try {
      if (!personKey.test(personId) || !(snapshot.board.people ?? []).some(person => person.id === personId) ||
        amountCents === null || weekday(effectiveFrom) !== 1) {
        throw new Error("Selecciona personal, un importe en MXN y una fecha de vigencia que sea lunes.");
      }
      const {sdk, db} = connection();
      const ref = sdk.doc(db, AGREEMENTS, personId + "~" + effectiveFrom);
      submit.disabled = true;
      await sdk.runTransaction(db, async tx => {
        const prior = await tx.get(ref);
        if (actor !== session()) throw new Error("La sesión cambió. Ingresa nuevamente.");
        if (prior.exists()) throw new Error("Ya existe una versión para esa persona y semana.");
        tx.set(ref, {personId, amountCents, effectiveFrom, note, periodicity: "semana",
          authorizedBy: actor.uid, createdAt: sdk.serverTimestamp()});
      });
      if (actor !== session()) return;
      form.elements.amount.value = "";
      form.elements.note.value = "";
      await load();
      notify("Acuerdo semanal guardado.");
    } catch (error) {
      if (actor === session()) notify(onError(error));
    } finally {
      submit.disabled = false;
    }
  });

  start.addEventListener("change", render);
  select.addEventListener("change", render);
  host.querySelector("#weekly-refresh").addEventListener("click", load);
  return {reset, load, render};
}
