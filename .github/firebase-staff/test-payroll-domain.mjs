import test from "node:test";
import assert from "node:assert/strict";
import {addDays, mxnCents, weeklyPayroll} from "../../recursos/weekly-payroll.mjs";
import {paymentReceipt} from "../../portal-agora/payment-receipt.js";

const person = {id: "qa-staff", name: "Staff QA"};
const agreement = {personId: person.id, amountCents: 250000, effectiveFrom: "2026-11-23"};
const start = "2026-11-23";
const events = Array.from({length: 6}, (_, index) => ({
  id: "qa-" + index, project: index % 2 ? "QA B" : "QA A",
  status: "confirmado", staff: [{personId: person.id, start: addDays(start, index) + "T09:00"}]
}));
const schedule = {people: [person], events};

test("seis jornadas en dos proyectos generan una sola base semanal", () => {
  const rows = weeklyPayroll(schedule, [agreement], start);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].events.length, 6);
  assert.equal(rows[0].agreement.amountCents, 250000);
});

test("usa la vigencia al inicio de la semana y excluye borradores y cancelaciones", () => {
  const changedEvents = events.map((event, index) => ({
    ...event, status: ["borrador", "cancelado"][index] ?? event.status
  }));
  const newer = {...agreement, amountCents: 300000, effectiveFrom: "2026-11-30"};
  const result = weeklyPayroll({...schedule, events: changedEvents}, [newer, agreement], start);
  assert.equal(result[0].events.length, 4);
  assert.equal(result[0].agreement.amountCents, 250000);
  assert.deepEqual(weeklyPayroll(schedule, [agreement], "2026-11-30"), []);
});

test("fechas de calendario y centavos exactos", () => {
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.throws(() => addDays("2026-02-30", 7));
  assert.equal(mxnCents("2500.09"), 250009);
  assert.equal(mxnCents("2.555"), null);
});

test("el comprobante toma un parcial registrado y omite datos bancarios", () => {
  const pay = {id: "qa-pago-1", amount: 1500, date: "2026-11-28", method: "transferencia", reference: "QA-1"};
  const request = {id: "horas~qa~staff", folio: "QA", category: "nomina", beneficiary: "QA",
    approvedAmount: 2500, paidAmount: 1500, status: "pago_parcial", payments: [pay],
    account: "DATO-PRIVADO", bank: "BANCO-PRIVADO"};
  const receipt = paymentReceipt(request, pay.id);
  assert.equal(receipt.total, 150000);
  assert.equal(receipt.balance, 100000);
  assert.equal(receipt.folio, "DVM-PAG-qa-pago-1");
  assert.equal(JSON.stringify(receipt).includes("PRIVADO"), false);
  assert.equal(paymentReceipt(request, "inexistente"), null);
  assert.equal(paymentReceipt({...request, status: "aprobada"}, pay.id), null);
  assert.equal(paymentReceipt({...request, paidAmount: 0}, pay.id), null);
  const final = {...pay, id: "qa-pago-2", amount: 1000, reference: "QA-2"};
  assert.equal(paymentReceipt({...request, paidAmount: 2500, status: "pagada", payments: [pay, final]}, final.id).balance, 0);
});
