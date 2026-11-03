import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGmailSender,GMAIL_SENDER,GMAIL_SEND_SCOPE} from './mail';
const config={clientId:'synthetic-client',clientSecret:'synthetic-client-secret',refreshToken:'synthetic-refresh-secret',redirect:'http://localhost:8081/auth/invite'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
function fixture(){
 let renewals=0,sends=0,time=0,mailStatus=200,mailBody:unknown={id:'synthetic-mail-id'},tokenStatus=200,tokenError='invalid_grant',scope=GMAIL_SEND_SCOPE;
 const requests:{url:string;init:RequestInit}[]=[];
 const send:typeof fetch=async(url,init)=>{
  requests.push({url:String(url),init:init!});
  if(String(url)==='https://oauth2.googleapis.com/token'){renewals++;return tokenStatus===200?json({access_token:`access-${renewals}`,expires_in:3600,scope}):json({error:tokenError,error_description:config.refreshToken},tokenStatus);}
  sends++;return json(mailBody,mailStatus);
 };
 const sender=createGmailSender(config,send,()=>time);
 return {sender,send,requests,counts:()=>({renewals,sends}),tick:()=>{time+=3600000;},mail:(status:number,body:unknown)=>{mailStatus=status;mailBody=body;},token:(status:number,error='invalid_grant')=>{tokenStatus=status;tokenError=error;},scope:(value:string)=>{scope=value;}};
}
test('Gmail sends MIME with the fixed account, private localhost link, UTF-8 and no provider idempotency claim',async()=>{
 const f=fixture();await f.sender('to@example.test','id','private-token');
 assert.deepEqual(f.counts(),{renewals:1,sends:1});
 const token=f.requests[0]!,params=new URLSearchParams(token.init.body as URLSearchParams);
 assert.equal(token.init.method,'POST');assert.equal(params.get('grant_type'),'refresh_token');assert.equal(params.get('client_secret'),config.clientSecret);assert.equal(params.get('refresh_token'),config.refreshToken);
 const mail=f.requests[1]!,headers=new Headers(mail.init.headers);
 assert.equal(mail.url,`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_SENDER)}/messages/send`);
 assert.equal(headers.get('Authorization'),'Bearer access-1');assert.equal(headers.has('Idempotency-Key'),false);
 const mime=Buffer.from(JSON.parse(String(mail.init.body)).raw,'base64url').toString('utf8');
 assert.ok(mime.includes(`From: APEX <${GMAIL_SENDER}>\r\nTo: to@example.test`));
 const body=Buffer.from(mime.split('\r\n\r\n')[1]!,'base64').toString('utf8');
 assert.ok(body.includes('http://localhost:8081/auth/invite#teacher-invitation=id&token=private-token'));assert.ok(body.includes('sesión'));
 for(const secret of [config.clientSecret,config.refreshToken,'access-1'])assert.ok(!mime.includes(secret));
 assert.ok(f.requests.every(r=>!r.url.includes('token=')));assert.ok(f.requests.every(r=>r.init.signal&&r.init.redirect==='error'));
});
test('Gmail renews expired access tokens and shares concurrent renewals without caching refresh secrets in the client',async()=>{
 const f=fixture();await Promise.all([f.sender('one@example.test','id1','t1'),f.sender('two@example.test','id2','t2')]);
 assert.deepEqual(f.counts(),{renewals:1,sends:2});f.tick();await f.sender('three@example.test','id3','t3');assert.deepEqual(f.counts(),{renewals:2,sends:3});
});
test('Gmail authorization revoked, invalid client, scope and quota errors are sanitized before sending',async()=>{
 const f=fixture();f.token(400);await assert.rejects(f.sender('to@example.test','id','t'),error=>error instanceof Error&&error.message==='GOOGLE_AUTH_REVOKED');assert.equal(f.counts().sends,0);
 f.token(401,'invalid_client');await assert.rejects(f.sender('to@example.test','id','t'),/GOOGLE_OAUTH_CONFIG/);
 f.token(200);f.scope('unrelated-scope');await assert.rejects(f.sender('to@example.test','id','t'),/GOOGLE_SCOPE_REQUIRED/);
 f.scope(GMAIL_SEND_SCOPE);f.mail(403,{error:{errors:[{reason:'userRateLimitExceeded'}],message:config.clientSecret}});await assert.rejects(f.sender('to@example.test','id','t'),/GOOGLE_RATE_LIMIT/);
 assert.equal(f.counts().sends,1);
 await assert.rejects(createGmailSender({...config,refreshToken:undefined},f.send)('to@example.test','id','t'),/MAIL_NOT_CONFIGURED/);
});
test('Gmail retries only a definite 401 after renewing access, at most once',async()=>{
 let renewals=0,sends=0;
 const sender=createGmailSender(config,async(url)=>{
  if(String(url).includes('oauth2.googleapis.com'))return json({access_token:`access-${++renewals}`,expires_in:3600});
  return ++sends===1?json({error:{}},401):json({id:'mail'});
 });
 await sender('to@example.test','id','t');assert.equal(renewals,2);assert.equal(sends,2);
 const denied=fixture();denied.mail(401,{});await assert.rejects(denied.sender('to@example.test','id','t'),/GOOGLE_AUTH_REVOKED/);assert.deepEqual(denied.counts(),{renewals:2,sends:2});
});
test('Gmail 5xx, network failure and ambiguous success never auto-retry a send',async()=>{
 for(const [status,body] of [[503,{error:{message:'private'}}],[200,{}],[200,null]] as const){const f=fixture();f.mail(status,body);await assert.rejects(f.sender('to@example.test','id','t'),/SEND_UNCERTAIN/);assert.equal(f.counts().sends,1);}
 let sends=0;const sender=createGmailSender(config,async(url)=>{if(String(url).includes('oauth2.googleapis.com'))return json({access_token:'access',expires_in:3600});sends++;throw new Error(config.refreshToken);});
 await assert.rejects(sender('to@example.test','id','t'),/SEND_UNCERTAIN/);assert.equal(sends,1);
});
test('Gmail timeouts distinguish renewal failure from a possibly accepted send and reject header injection',async()=>{
 for(const blockToken of [true,false]){
  let sends=0;const sender=createGmailSender(config,async(url,init)=>{
   if(!blockToken&&String(url).includes('oauth2.googleapis.com'))return json({access_token:'access',expires_in:3600});
   if(!String(url).includes('oauth2.googleapis.com'))sends++;
   return await new Promise<Response>((_,reject)=>{const keepAlive=setTimeout(()=>reject(Error('Abort did not fire')),500);init!.signal!.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(init!.signal!.reason);},{once:true});});
  },Date.now,10);
  await assert.rejects(sender('to@example.test','id','t'),blockToken?/GOOGLE_UNAVAILABLE/:/SEND_UNCERTAIN/);assert.equal(sends,blockToken?0:1);
 }
 const f=fixture();await assert.rejects(f.sender('to@example.test\r\nBcc: victim@example.test','id','t'),/MAIL_REJECTED/);assert.equal(f.requests.length,0);
});
