import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {invitationConfig} from '../../supabase/functions/_shared/config.ts';
import {invitationHandler} from '../../supabase/functions/_shared/handler.ts';
import {supabaseInvitationPorts} from '../../supabase/functions/_shared/supabase.ts';
const id='20000000-0000-4000-8000-000000000001';
const token='synthetic.session.signature';
const env:Record<string,string>={SUPABASE_URL:'https://project.example.test',APEX_ADMIN_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',APEX_ADMIN_SUPABASE_SERVICE_KEY:'sb_secret_synthetic',APEX_ADMIN_INVITE_REDIRECT_URL:'http://localhost:8081/auth/invite',APEX_ADMIN_ALLOWED_ORIGINS:'http://localhost:8081',APEX_ADMIN_GMAIL_CLIENT_ID:'google-client',APEX_ADMIN_GMAIL_CLIENT_SECRET:'google-secret',APEX_ADMIN_GMAIL_REFRESH_TOKEN:'google-refresh'};
test('Edge configuration fails closed on missing values and arbitrary/unsafe return URLs and origins',()=>{
 for(const key of ['SUPABASE_URL','APEX_ADMIN_SUPABASE_PUBLISHABLE_KEY','APEX_ADMIN_SUPABASE_SERVICE_KEY','APEX_ADMIN_INVITE_REDIRECT_URL','APEX_ADMIN_ALLOWED_ORIGINS'])assert.throws(()=>invitationConfig(name=>name===key?undefined:env[name]),/SERVICE_CONFIG/);
 for(const value of ['javascript:alert(1)','http://public.example.test','https://user:pass@app.example.test','https://app.example.test/#secret','https://app.example.test/?token=value'])assert.throws(()=>invitationConfig(name=>name==='APEX_ADMIN_INVITE_REDIRECT_URL'?value:env[name]),/SERVICE_CONFIG/);
 assert.equal(invitationConfig(name=>name==='APEX_ADMIN_INVITE_REDIRECT_URL'?'apex://auth/recovery':env[name]).redirect,'apex://auth/recovery');
 assert.throws(()=>invitationConfig(name=>name==='APEX_ADMIN_ALLOWED_ORIGINS'?'*':env[name]),/SERVICE_CONFIG/);
 assert.equal(invitationConfig(name=>name==='SUPABASE_URL'?'http://kong:8000':env[name]).url,'http://kong:8000');
 assert.throws(()=>invitationConfig(name=>name==='APEX_ADMIN_INVITE_REDIRECT_URL'?'http://kong:8000':env[name]),/SERVICE_CONFIG/);
});
function fixture(){
 let authStatus=200,roleStatus=200,claimStatus=200,mailStatus=200,mode:'new'|'existing'='new',dispatch=true;
 const calls:{path:string;url:string;body:any;headers:Headers}[]=[];
 const fake:typeof fetch=async(input,init)=>{
  const endpoint=new URL(String(input)),path=endpoint.pathname,body=init?.body?(endpoint.hostname==='oauth2.googleapis.com'?Object.fromEntries(new URLSearchParams(init.body as URLSearchParams)):JSON.parse(String(init.body))):null,headers=new Headers(init?.headers);calls.push({path,url:String(input),body,headers});
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});
  if(endpoint.hostname==='oauth2.googleapis.com')return json({access_token:'synthetic-google-access',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.send'});
  if(endpoint.hostname==='gmail.googleapis.com')return json({id:'synthetic-gmail-message'});
  if(path==='/auth/v1/user')return json(authStatus===200?{id:'actual-actor',email:'admin@example.test'}:{message:'Internal auth details',code:'bad_jwt'},authStatus);
  if(path==='/rest/v1/rpc/apex_api')return json(roleStatus===200?{}:{code:'42501',message:'private denied'},roleStatus);
  if(path==='/rest/v1/rpc/apex_admin_invitation_dispatch')return json(claimStatus===200?(body.step==='claim'?{dispatch,status:dispatch?'processing':'sent',id,email:'target@example.test',name:'Teacher',nonce:'private-nonce',lease:'lease',mode,authId:mode==='existing'?'20000000-0000-4000-8000-000000000002':null}:{}):{code:'42501',message:'revoked'},claimStatus);
  if(path==='/auth/v1/invite')return json(mailStatus===200?{id:'new-auth',email:'target@example.test'}:{message:'private provider details',code:'email_address_not_authorized'},mailStatus);
  if(path==='/auth/v1/admin/users/20000000-0000-4000-8000-000000000002')return json({id:'20000000-0000-4000-8000-000000000002',email:'target@example.test',aud:'authenticated'});
  throw Error('Unexpected outbound request');
 };
 const client:typeof createClient=(url,key,options)=>createClient(url,key,{...options,global:{...options?.global,fetch:fake}});
 const ports=supabaseInvitationPorts(invitationConfig(name=>env[name]),client,fake);
 const handler=invitationHandler(ports,['http://localhost:8081']);
 const request=(bearer:string|null=token,body:unknown={invitationId:id},origin?:string)=>handler(new Request('https://project.example.test/functions/v1/admin-invitations',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`} :{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(body)}));
 return {ports,handler,request,calls,setAuth:(value:number)=>{authStatus=value;},setRole:(value:number)=>{roleStatus=value;},setClaim:(value:number)=>{claimStatus=value;},setMail:(value:number)=>{mailStatus=value;},existing:()=>{mode='existing';},alreadySent:()=>{dispatch=false;}};
}
test('Edge rejects absent/invalid/expired sessions, API keys as bearer, non-admins and revocation before privileged work',async()=>{
 const f=fixture();assert.equal((await f.request(null)).status,401);
 assert.equal((await f.request(env.APEX_ADMIN_SUPABASE_PUBLISHABLE_KEY)).status,401);assert.equal(f.calls.length,0);
 f.setAuth(401);assert.equal((await f.request()).status,401);assert.ok(!f.calls.some(c=>c.path.includes('/rest/')));
 f.setAuth(503);assert.equal((await f.request()).status,503);
 f.setAuth(200);f.setRole(403);assert.equal((await f.request()).status,403);assert.ok(!f.calls.some(c=>c.path.includes('dispatch')));
 f.setRole(200);f.setClaim(403);assert.equal((await f.request()).status,403);assert.ok(!f.calls.some(c=>c.path.endsWith('/invite')));
});
test('Edge accepts session on Android without Origin, derives actor from Auth, preserves RPC lease and sanitizes provider errors',async()=>{
 const f=fixture();const response=await f.request();assert.equal(response.status,200);assert.match((await response.json()).message,/no se ha confirmado la entrega/);
 const auth=f.calls.find(c=>c.path==='/auth/v1/user')!;assert.equal(auth.headers.get('Authorization'),`Bearer ${token}`);assert.equal(auth.headers.get('apikey'),env.APEX_ADMIN_SUPABASE_PUBLISHABLE_KEY);
 const claim=f.calls.find(c=>c.body?.step==='claim')!;assert.equal(claim.body.actor_auth,'actual-actor');assert.equal(claim.headers.get('apikey'),env.APEX_ADMIN_SUPABASE_SERVICE_KEY);
 assert.equal(new URL(f.calls.find(c=>c.path.endsWith('/invite'))!.url).searchParams.get('redirect_to'),env.APEX_ADMIN_INVITE_REDIRECT_URL);
 assert.ok(f.calls.some(c=>c.body?.step==='sent'&&c.body.auth_id==='new-auth'));
 f.alreadySent();const before=f.calls.filter(c=>c.path.endsWith('/invite')).length;assert.equal((await f.request()).status,200);assert.equal(f.calls.filter(c=>c.path.endsWith('/invite')).length,before);
 const failed=fixture();failed.setMail(400);const result=await failed.request();assert.equal(result.status,503);assert.ok(!(await result.text()).includes('private provider'));assert.ok(failed.calls.some(c=>c.body?.step==='error'&&c.body.failure_code==='AUTH_MAIL_REJECTED'));
});
test('Edge CORS permits only configured web origin, supports SDK preflight and rejects client actor/redirect/oversized input',async()=>{
 const f=fixture();assert.equal((await f.request(token,{invitationId:id},'https://evil.example.test')).status,403);
 const response=await f.handler(new Request('https://function.example.test',{method:'OPTIONS',headers:{Origin:'http://localhost:8081','Access-Control-Request-Headers':'apikey,authorization,x-client-info,content-type'}}));assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'http://localhost:8081');assert.match(response.headers.get('Access-Control-Allow-Headers')!,/apikey/);
 for(const body of [{invitationId:id,actor:'attacker'},{invitationId:id,redirect:'https://evil.example.test'},{invitationId:'x'.repeat(5000)}])assert.equal((await f.request(token,body)).status,400);
 assert.equal(f.calls.length,0);
});
test('Existing Edge flow never invites/resets Auth and sends only the server-configured APEX link',async()=>{
 const f=fixture();f.existing();const response=await f.request();assert.equal(response.status,200,await response.text());
 const mail=f.calls.find(c=>c.url.startsWith('https://gmail.googleapis.com'))!;
 const mime=Buffer.from(mail.body.raw,'base64url').toString('utf8'),text=Buffer.from(mime.split('\r\n\r\n')[1]!,'base64').toString('utf8');
 assert.ok(text.includes('http://localhost:8081/auth/invite#teacher-invitation='));assert.ok(mime.includes('To: target@example.test'));assert.ok(mime.includes('apex.soporte.co@gmail.com'));
 assert.ok(!f.calls.some(c=>/\/invite$|\/recover$/.test(c.path)));assert.ok(f.calls.every(c=>!c.url.includes('resend')));
});
