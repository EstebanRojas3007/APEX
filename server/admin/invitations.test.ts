import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {authMailCode,invitationErrorMessage,dispatchInvitation,InvitationError,makeInvitationServer,type InvitationPorts} from './invitations';
const id='20000000-0000-4000-8000-000000000001';
function fixture(){
 let sent=0,finished=0,failed=0;
 const ports:InvitationPorts={authorize:async token=>{if(token!=='valid-admin')throw new InvitationError('FORBIDDEN');return 'actual-admin';},
  claim:async()=>({dispatch:true,status:'processing',id,email:'synthetic@example.test',name:'Test teacher',nonce:'server-private-nonce',lease:'lease',authId:null}),
  invite:async()=>{sent++;return 'actual-new-auth-uuid';},recoverOwned:async()=>{sent++;},complete:async()=>{finished++;},fail:async()=>{failed++;}};
 return {ports,counts:()=>({sent,finished,failed})};
}
test('Invitation HTTP validates authorization/origin/input and never exposes private claim data',async()=>{
 const f=fixture(),server=makeInvitationServer(f.ports,['https://apex.example']);server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{
  const request=(headers:Record<string,string>,body:unknown={invitationId:id})=>fetch(`${origin}/invitations/dispatch`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await request({})).status,401);assert.equal((await request({Authorization:'Bearer teacher'})).status,403);
  assert.equal((await request({Authorization:'Bearer valid-admin',Origin:'https://evil.example'})).status,403);
  assert.equal((await request({Authorization:'Bearer valid-admin'},{invitationId:id,email:'attacker@example.test'})).status,400);
  assert.equal((await request({Authorization:'Bearer valid-admin'},null)).status,400);
  assert.equal((await request({Authorization:'Bearer valid-admin'},{invitationId:'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'})).status,400);
  const response=await request({Authorization:'Bearer valid-admin',Origin:'https://apex.example'});assert.equal(response.status,200);
  const body=await response.text();assert.equal(body.includes('nonce'),false);assert.equal(body.includes('actual-new-auth-uuid'),false);assert.deepEqual(f.counts(),{sent:1,finished:1,failed:0});
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('Existing dispatch lease suppresses mail and uncertain sends record a retryable failure',async()=>{
 const f=fixture();f.ports.claim=async()=>({dispatch:false,status:'processing'});await dispatchInvitation(f.ports,'valid-admin',id);assert.equal(f.counts().sent,0);
 f.ports.claim=async()=>({dispatch:true,status:'processing',id,email:'synthetic@example.test',name:'Test',nonce:'private',lease:'lease'});
 f.ports.invite=async()=>{throw new InvitationError('AUTH_EXISTS');};await assert.rejects(dispatchInvitation(f.ports,'valid-admin',id),/AUTH_EXISTS/);assert.equal(f.counts().failed,1);assert.equal(f.counts().finished,0);
});
test('Auth error classification separates SMTP/rate/existing identity from generic Auth failures without leaking provider details',()=>{
 const message='Synthetic internal details that must stay private';
 assert.equal(authMailCode({code:'email_exists',message}),'AUTH_EXISTS');
 assert.equal(authMailCode({code:'over_email_send_rate_limit',status:429,message}),'AUTH_RATE_LIMIT');
 assert.equal(authMailCode({code:'email_address_not_authorized',message}),'AUTH_MAIL_REJECTED');
 assert.equal(authMailCode({code:'unexpected_failure',message}),'AUTH_FAILED');
 for(const code of ['AUTH_EXISTS','AUTH_RATE_LIMIT','AUTH_MAIL_REJECTED','AUTH_FAILED','SERVICE_CONFIG','AUTH_UNAVAILABLE',message])assert.ok(!invitationErrorMessage(code).includes(message));
});
