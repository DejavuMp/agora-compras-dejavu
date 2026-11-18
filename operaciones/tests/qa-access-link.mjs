import assert from "node:assert/strict";
import {availablePeople,personForLink} from "../access-link-model.mjs";

const uid="uid-qa-1",email="staff@example.invalid";
const empty={people:[]};
assert.deepEqual(availablePeople(empty.people,uid),[]);
const created=personForLink(empty,{uid,email,selection:"__new__",newName:"Persona de prueba",newId:"p-test"});
assert.equal(created.created,true);
assert.deepEqual(created.person,{
 id:"p-test",name:"Persona de prueba",role:"",phone:"",email,
 hourRate:0,dayRate:0,active:true,authUid:uid
});
assert.equal(empty.people.length,0,"La validación no muta el tablero real");
const existing={
 people:[
  {id:"p-existente",name:"Persona existente",email,role:"Promotor",hourRate:125,dayRate:700,active:true},
  {id:"p-ocupado",name:"Otro promotor",authUid:"otro-uid",email:"otro@example.invalid"},
 ]
};
assert.deepEqual(availablePeople(existing.people,uid).map(x=>x.id),["p-existente"]);
const linked=personForLink(existing,{uid,email,selection:"p-existente"});
assert.equal(linked.created,false);
assert.equal(linked.person.authUid,uid);
assert.equal(linked.person.hourRate,125,"No tocar nómina ni datos de la ficha");
assert.equal(existing.people[0].authUid,undefined,"No mutar estado previo");
assert.throws(()=>personForLink(existing,{uid,email,selection:"p-ocupado"}),/otra cuenta/);
assert.throws(()=>personForLink(existing,{uid,email,selection:"__new__",newName:"Copia",newId:"p-nuevo"}),/Ya existe una ficha/);
assert.throws(()=>personForLink(existing,{uid,email,selection:"",newName:"Sin selección"}),/Selecciona/);
assert.throws(()=>personForLink(empty,{uid,email,selection:"__new__",newName:" ",newId:"p-nuevo"}),/nombre válido/);
assert.throws(()=>personForLink(existing,{uid,email,selection:"p-perdido"}),/no existe/);
assert.throws(()=>personForLink({people:[{...existing.people[0],authUid:uid}]},
 {uid,email,selection:"__new__",newName:"Repetida",newId:"p-extra"}),/ya está vinculada/);
console.log("OK Vinculación: selección segura, creación sin catálogo, unicidad y nómina intacta.");
