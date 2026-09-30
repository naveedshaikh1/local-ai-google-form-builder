import test from 'node:test';
import assert from 'node:assert/strict';
let listener;
let session = {};
const event = {addListener() {}};
globalThis.chrome = {
 storage:{session:{async get() {return session;},async set(v) {Object.assign(session,v);},remove(keys,cb) {for(const k of keys) delete session[k]; cb();}},local:{get(k,cb) {cb({});}}},
 runtime:{onInstalled:event,onConnect:event,onMessage:{addListener(fn) {listener=fn;}}},
 tabs:{onUpdated:event,onActivated:event},
 action:{onClicked:event},sidePanel:{}
};
await import('../background.js');
function message(msg) {return new Promise(resolve => listener(msg,{},resolve));}
test('blank public OAuth config gives actionable failure', async () => {
 const result=await message({type:'GOOGLE_LOGIN'});
 assert.equal(result.ok,false);
 assert.match(result.error,/GOOGLE_CLIENT_ID/);
});
test('expired authentication prevents form creation', async () => {
 session={googleAuthToken:'test-only',googleAuthExpiresAt:0};
 const result=await message({type:'CREATE_GOOGLE_FORM',title:'Quiz',questions:[{title:'Name',type:'short_answer'}]});
 assert.equal(result.ok,false);
 assert.match(result.error,/sign in/);
});
test('AI HTTP errors and empty responses are reported', async () => {
 const originalFetch=globalThis.fetch;
 try {
 globalThis.fetch=async () => new Response('unavailable',{status:503});
 const fail=await message({type:'TEST_AI_CONNECTION'});
 assert.equal(fail.ok,false); assert.match(fail.error,/503/);
 globalThis.fetch=async () => new Response('{}',{status:200});
 const empty=await message({type:'CALL_LOCAL_AI',prompt:'test'});
 assert.equal(empty.ok,false); assert.match(empty.error,/no text/);
 } finally {globalThis.fetch=originalFetch;}
});
