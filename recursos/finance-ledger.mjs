const string=value=>String(value??"").trim();
const cents=value=>value==null||value===""||!Number.isFinite(Number(value))?null:Math.round(Number(value)*100);
const key=(eventId,personId)=>eventId&&personId?JSON.stringify([String(eventId),String(personId)]):"";
export function financeLedger(records,legacy,schedule){
 const events=new Map((schedule?.events||[]).map(e=>[String(e.id),e]));
 const people=new Map((schedule?.people||[]).map(p=>[String(p.id),p.name]));
 const legacyByKey=new Map();
 for(const item of legacy){
  const id=key(item.eventId,item.personId);
  if(id)legacyByKey.set(id,[...legacyByKey.get(id)||[],item]);
 }
 const linkedKeys=new Set(records.map(r=>key(r.hoursOrigin?.eventId,r.hoursOrigin?.personId)).filter(Boolean));
 const current=records.map(r=>{
  const origin=r.hoursOrigin||{},personId=string(origin.personId),eventId=string(origin.eventId);
  const approved=cents(r.approvedAmount)??0,paid=cents(r.paidAmount)??0;
  const legacyMatches=legacyByKey.get(key(eventId,personId))||[];
  return {id:r.id,source:"finanzas",category:r.category,personId,eventId,
   beneficiary:string(r.beneficiary)||people.get(personId)||"Sin beneficiario",
   project:string(r.project)||events.get(eventId)?.title||"",
   reason:string(r.reason),date:string(r.dateNeeded),status:r.status,
   requested:cents(r.total)??0,approved,paid,balance:Math.max(0,approved-paid),
   reconciliation:legacyMatches.length>0,
   payments:(r.payments||[]).map(p=>({date:string(p.date),amount:cents(p.amount),reference:string(p.reference)})),
   folio:string(r.folio)};
 });
 const historical=legacy.map(item=>{
  const personId=string(item.personId),eventId=string(item.eventId),e=events.get(eventId);
  return {id:item.id,source:"operaciones",category:"nomina",personId,eventId,
   beneficiary:people.get(personId)||string(item.personName)||personId||"Sin ficha vinculada",
   project:e?.project||e?.title||string(item.activity),
   reason:string(item.activity)||string(item.notes),date:string(item.start).slice(0,10),
   status:item.paymentStatus||"capturado",
   approved:cents(item.approvedAmount),requested:cents(item.requestedAmount),
   reconciliation:linkedKeys.has(key(eventId,personId)),payments:[]};
 });
 return [...current,...historical].sort((a,b)=>b.date.localeCompare(a.date));
}
export function ledgerTotals(rows){
 const totals={pending:0,approvedBalance:0,needsReconciliation:0,paid:0};
 for(const r of rows){
  if(r.source!=="finanzas")continue;
  if(["pendiente","ajustes"].includes(r.status))totals.pending+=r.requested;
  if(r.reconciliation)totals.needsReconciliation+=r.balance;
  else totals.approvedBalance+=r.balance;
  totals.paid+=r.paid;
 }
 return totals;
}
