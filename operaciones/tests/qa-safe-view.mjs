import assert from "node:assert/strict";
import {projectStaffView,projectViewerView} from "../ops-safe-view.mjs";

const board={
  people:[{id:"p1",name:"Persona A",hourRate:9999,bankAccount:"SENSITIVE_BANK"}],
  vehicles:[{id:"v1",name:"Unidad A",plate:"SENSITIVE_PLATE",cost:555}],
  sites:[{id:"s1",name:"Sucursal ficticia",address:"México",notes:"PRIVATE_NOTES"}],
  settings:{dailyLimit:8,weeklyLimit:48,payroll:"SENSITIVE_PAYROLL"},
  events:[
    {id:"e1",title:"Volanteo ficticio",type:"Volanteo",status:"confirmado",
      start:"2026-12-01T10:00",end:"2026-12-01T16:00",before:30,after:30,
      staff:[{personId:"p1",start:"2026-12-01T09:30",end:"2026-12-01T16:30",assignedByName:"Coordinación QA",rate:800},
             {personId:"p2",start:"2026-12-01T09:30",end:"2026-12-01T16:30",rate:900}],
      vehicles:["v1"],siteId:"s1",travelMin:40,routeBufferMin:15,
      venueName:"Sucursal ficticia",venueAddress:"México",
      dayCount:3,dayIndex:1,seriesId:"s-1",
      rate:12000,approvedAmount:15000,bankAccount:"SENSITIVE_BANK"},
    {id:"e2",title:"Jornada ficticia dos",type:"Montaje",status:"confirmado",
      start:"2026-12-01T14:00",end:"2026-12-01T18:00",
      staff:[{personId:"p2",start:"2026-12-01T13:30",end:"2026-12-01T18:30"}],
      vehicles:["v1"],siteId:"s1",travelMin:20,routeBufferMin:10}
  ]
};
const person={id:"p1",name:"Persona A",role:"Volanteo",
  phone:"0000000000",email:"one@example.invalid",
  hourRate:999,dayRate:888,bankAccount:"SENSITIVE_BANK",authUid:"internal"};
const staff=projectStaffView(person,board);
assert.equal(staff.events.length,1);
assert.equal(staff.events[0].staff.length,1);
assert.equal(staff.events[0].staff[0].personId,"p1");
assert.equal(staff.events[0].staff[0].start,"2026-12-01T09:30");
assert.equal(staff.events[0].staff[0].end,"2026-12-01T16:30");
assert.equal(staff.events[0].staff[0].assignedByName,"Coordinación QA","Nombre del asignador visible únicamente en la jornada propia");
assert.equal(staff.events[0].ownPay.amount,6993,"La persona puede ver solo su propio estimado (7 h x 999)");
assert.equal(staff.events[0].ownPay.basis,"hora");
assert.ok(!("ownPay" in (staff.events[1]||{})),"Sin jornadas ajenas");
assert.equal(staff.vehicles[0].name,"Unidad A");
assert.equal(staff.settings.dailyLimit,8);
for(const secret of ["SENSITIVE_BANK","SENSITIVE_PLATE","SENSITIVE_PAYROLL","hourRate","dayRate","approvedAmount","authUid","rate"]){
  assert.ok(!JSON.stringify(staff).includes(secret),"Staff leaked "+secret);
}
assert.ok(!JSON.stringify(staff).includes('"p2"'),"Assigned colleague leaked");

const shared=projectViewerView(board);
assert.equal(shared.events.length,2);
assert.deepEqual(shared.events.map(e=>e.conflict),[true,true]);
assert.equal(shared.events[0].staffCount,2);
assert.equal(shared.events[0].vehicleCount,1);
assert.equal(shared.events[0].dayIndex,1);
assert.equal(shared.events[0].dayCount,3);
for(const secret of ["SENSITIVE_BANK","SENSITIVE_PLATE","SENSITIVE_PAYROLL","Persona A","p1","p2","approvedAmount","rate","hourRate","dayRate","bankAccount"]){
  assert.ok(!JSON.stringify(shared).includes(secret),"Viewer leaked "+secret);
}
assert.ok(!("people" in shared));
assert.ok(!("staff" in shared.events[0]));
console.log("OK proyección: vista del staff aislada y visor sin nómina ni identidad ajena.");
