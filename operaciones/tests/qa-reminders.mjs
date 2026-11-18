import assert from "node:assert/strict";
import {upcomingNotice,eligibleNotices} from "../ops-reminders.mjs";
const now=new Date("2026-11-18T12:00:00-06:00").getTime();
const e=minutes=>({
 id:"ev-qa",title:"Volanteo QA",status:"confirmado",venueName:"Sucursal ficticia",
 staff:[{personId:"p1",start:new Date(now+minutes*60000).toISOString()}]
});
assert.equal(upcomingNotice(e(60),"p1",now).kind,"60");
assert.equal(upcomingNotice(e(30),"p1",now).kind,"30");
assert.equal(upcomingNotice(e(10),"p1",now).kind,"10");
assert.equal(upcomingNotice(e(-5),"p1",now).kind,"pendiente");
assert.equal(upcomingNotice(e(120),"p1",now),null);
assert.equal(upcomingNotice(e(40),"p1",now),null);
assert.equal(upcomingNotice({...e(10),status:"cancelado"},"p1",now),null);
assert.equal(upcomingNotice(e(10),"p1",now,{status:"en_curso"}),null);
assert.equal(eligibleNotices([e(30)],"p1",new Map(),now).length,1);
assert.equal(eligibleNotices([e(30)],"p1",new Map([["ev-qa",{status:"finalizada"}]]),now).length,0);
console.log("OK avisos: 60/30/10 minutos y ausencia de entrada; sin alertas tras marcaje.");
