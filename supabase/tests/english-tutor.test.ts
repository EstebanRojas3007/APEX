import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorConfig,type TutorConfig} from '../functions/english-tutor/config.ts';
import {englishTutorHandler} from '../functions/english-tutor/handler.ts';
import {TUTOR_INSTRUCTION,TutorError,tutorPorts,type TutorPorts,type TutorTurn} from '../functions/english-tutor/service.ts';

const pilot='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000002';
const config:TutorConfig={url:'http://localhost:54321',publishableKey:'synthetic-public-key',apiKey:'synthetic-server-secret',model:'test-chat-model',pilotUserId:pilot,origins:['http://localhost:8091']};
const token=(sid=session)=>`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:pilot,session_id:sid})).toString('base64url')}.signature`;
function request(body:unknown={message:'Explícame el presente simple'},headers:Record<string,string>={},method='POST'){
 return new Request('http://localhost/functions/v1/english-tutor',{method,headers:{'content-type':'application/json',authorization:`Bearer ${token()}`,origin:config.origins[0]!,...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
function setup(overrides:Partial<TutorPorts>={},clock=Date.now){
 const calls:TutorTurn[][]=[];
 const handler=englishTutorHandler({authorize:async()=>({userId:pilot,sessionId:session}),generate:async turns=>{calls.push(structuredClone(turns));return 'Usa el presente simple: I study English every day.';},...overrides},config,clock);
 return {handler,calls};
}

test('pilot + session required; unauthorized callers never reach Groq',async()=>{
 let generated=0;
 const generate=async()=>{generated++;return 'Unexpected';};
 const missing=setup({generate});assert.equal((await missing.handler(request({}, {authorization:''}))).status,401);
 const invalid=setup({generate,authorize:async()=>{throw new TutorError(401,'Inicia sesión.');}});assert.equal((await invalid.handler(request())).status,401);
 const outsider=setup({generate,authorize:async()=>({userId:'another-account',sessionId:session})});assert.equal((await outsider.handler(request())).status,403);
 const closed=englishTutorHandler({generate,authorize:async()=>({userId:pilot,sessionId:session})},{...config,pilotUserId:''});assert.equal((await closed(request())).status,403);
 assert.equal(generated,0);
});

test('strict {message} contract, bounded body, methods and CORS',async()=>{
 const {handler,calls}=setup();
 for(const body of [null,[],{}, {message:1},{message:'  '},{message:'a'.repeat(2001)},{message:'hello',userId:pilot},{message:'hello',history:[]},{message:'hello',attemptId:'attempt'}])assert.equal((await handler(request(body))).status,400);
 assert.equal((await handler(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:'{'}))).status,400);
 assert.equal((await handler(request({message:'x'.repeat(13000)}))).status,413);
 assert.equal((await handler(request(undefined,{'content-type':'text/plain'}))).status,400);
 assert.equal((await handler(request(undefined,{},'GET'))).status,405);
 assert.equal((await handler(request(undefined,{origin:'https://foreign.invalid'}))).status,403);
 const preflight=await handler(request(undefined,{},'OPTIONS'));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),config.origins[0]);
 assert.equal(calls.length,0);
 const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(Object.keys(await response.json()),['reply']);assert.equal(response.headers.get('cache-control'),'no-store');
 const native=request();native.headers.delete('origin');assert.equal((await handler(native)).status,200);
});

test('context stays in memory, bounded to eight exchanges, isolated by session and expired after 30 minutes',async()=>{
 let time=0,sid=session;
 const {handler,calls}=setup({authorize:async()=>({userId:pilot,sessionId:sid})},()=>time);
 await handler(request({message:'Primera pregunta'}));await handler(request({message:'Dame otro ejemplo'}));
 assert.deepEqual(calls[1]?.map(turn=>turn.role),['user','model','user']);assert.equal(calls[1]?.[0]?.parts[0]?.text,'Primera pregunta');
 for(let i=0;i<12;i++)await handler(request({message:`Pregunta ${i}`}));
 assert.equal(calls.at(-1)?.length,17);
 sid='00000000-0000-4000-8000-000000000003';await handler(request());assert.equal(calls.at(-1)?.length,1);
 sid=session;time=30*60*1000;await handler(request());assert.equal(calls.at(-1)?.length,1);
});

test('concurrent requests are fenced and failed turns are not retained; provider details are hidden',async()=>{
 let finish!:(reply:string)=>void;
 const {handler}=setup({generate:()=>new Promise(resolve=>{finish=resolve;})});
 const first=handler(request());await new Promise(resolve=>setTimeout(resolve,0));assert.equal((await handler(request())).status,429);
 finish('Respuesta de práctica');assert.equal((await first).status,200);
 let failed=true;const turns:TutorTurn[][]=[];
 const retry=setup({generate:async history=>{turns.push(history);if(failed){failed=false;throw new Error('PROVIDER SECRET');}return 'Ejemplo nuevo';}});
 const error=await retry.handler(request());assert.equal(error.status,503);assert.doesNotMatch(await error.text(),/PROVIDER SECRET/);
 assert.equal((await retry.handler(request())).status,200);assert.equal(turns[1]?.length,1);
});

test('server config fails closed, explicit model/pilot/origins, no public AI variables',t=>{
 t.mock.method(performance,'now',()=>0);
 const logs:string[]=[];t.mock.method(console,'error',(line:string)=>logs.push(line));
 const values:Record<string,string>={SUPABASE_URL:config.url,SUPABASE_ANON_KEY:config.publishableKey,GROQ_API_KEY:config.apiKey,GROQ_MODEL:config.model,ENGLISH_TUTOR_PILOT_USER_ID:pilot,ENGLISH_TUTOR_ALLOWED_ORIGINS:config.origins.join(',')};
 assert.deepEqual(tutorConfig(key=>values[key]),config);
 for(const key of Object.keys(values))assert.throws(()=>tutorConfig(name=>name===key?undefined:values[name]));
 // Legacy provider secrets never substitute for the mandatory Groq secrets.
 for(const key of ['GROQ_API_KEY','GROQ_MODEL'])assert.throws(()=>tutorConfig(name=>name===key?undefined:name==='GEMINI_API_KEY'?'legacy-secret':name==='GEMINI_MODEL'?'legacy-model':values[name]));
 for(const origin of ['*','null','https://example.test/path'])assert.throws(()=>tutorConfig(name=>name==='ENGLISH_TUTOR_ALLOWED_ORIGINS'?origin:values[name]));
 for(const model of ['https://api.groq.com/model','/model','model/','model//name','model name','model:latest'])assert.throws(()=>tutorConfig(name=>name==='GROQ_MODEL'?model:values[name]));
 for(const model of ['llama-3.3-70b-versatile','openai/gpt-oss-120b'])assert.deepEqual(tutorConfig(name=>name==='GROQ_MODEL'?` ${model} `:values[name]),{...config,model});
 assert.deepEqual(logs.map(line=>JSON.parse(line)),[
  ...Array.from({length:Object.keys(values).length+2},()=>({stage:'configuration',code:'CONFIG_MISSING',duration_ms:0})),
  ...Array.from({length:9},()=>({stage:'configuration',code:'CONFIG_INVALID',duration_ms:0})),
 ]);
});

test('structured failures distinguish Groq rejection, timeout, network and invalid output without leaking data',async t=>{
 let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
 const logs:string[]=[];t.mock.method(console,'error',(line:string)=>logs.push(line));
 const sensitive=`${config.apiKey} ${token()} PRIVATE USER MESSAGE PRIVATE PROVIDER BODY`;
 const invalid={stage:'groq_response',code:'GROQ_INVALID_RESPONSE',duration_ms:0};
 const cases:{fetch:typeof fetch;status:number;diagnostic:object;message?:string}[]=[
  ...[400,401,403,404,429,500,503].map(status=>({fetch:async()=>{elapsed+=174;return new Response(sensitive,{status});},status:503,diagnostic:{stage:'groq_response',code:'GROQ_REJECTED',duration_ms:174,groq_status:status},message:'El tutor no está disponible temporalmente. Inténtalo de nuevo.'})),
  ...['TimeoutError','AbortError'].map(name=>({fetch:async()=>{throw new DOMException(sensitive,name);},status:503,diagnostic:{stage:'groq_request',code:'GROQ_TIMEOUT',duration_ms:0}})),
  {fetch:async()=>{throw new TypeError(sensitive);},status:503,diagnostic:{stage:'groq_request',code:'GROQ_NETWORK_ERROR',duration_ms:0}},
  {fetch:async()=>new Response(sensitive),status:502,diagnostic:invalid},
  ...[null,{}, {choices:[]},
   ...['length','content_filter','tool_calls',undefined].map(finish_reason=>({choices:[{finish_reason,message:{content:sensitive}}]})),
   {choices:[{finish_reason:'stop'}]},
   ...[null,12,[],{},'  ','x'.repeat(12001)].map(content=>({choices:[{finish_reason:'stop',message:{content}}]})),
  ].map(body=>({fetch:async()=>Response.json(body),status:502,diagnostic:invalid})),
  {fetch:async()=>new Response(new ReadableStream({start(controller){controller.error(new DOMException(sensitive,'TimeoutError'));}})),status:503,diagnostic:{stage:'groq_response',code:'GROQ_TIMEOUT',duration_ms:0}},
  {fetch:async()=>new Response(new ReadableStream({start(controller){controller.error(new TypeError(sensitive));}})),status:503,diagnostic:{stage:'groq_response',code:'GROQ_NETWORK_ERROR',duration_ms:0}},
 ];
 for(const entry of cases){
  logs.length=0;
  let attempts=0;const ports=tutorPorts(config,async(...args)=>{attempts++;return entry.fetch(...args);});
  const {handler}=setup({generate:ports.generate});
  const response=await handler(request({message:sensitive}));
  assert.equal(response.status,entry.status);
  assert.equal(attempts,1);
  const body=await response.json();assert.deepEqual(Object.keys(body),['message']);
  if(entry.message)assert.equal(body.message,entry.message);
  assert.equal(logs.length,1);assert.deepEqual(JSON.parse(logs[0]!),entry.diagnostic);
  for(const privateValue of [config.apiKey,config.publishableKey,token(),'PRIVATE USER MESSAGE','PRIVATE PROVIDER BODY']){
   assert.ok(!JSON.stringify(body).includes(privateValue));assert.ok(!logs.join('').includes(privateValue));
  }
 }
 // An expired signal takes precedence even if parsing also fails on the aborted body.
 logs.length=0;
 t.mock.method(AbortSignal,'timeout',(delay:number)=>{assert.equal(delay,30000);return AbortSignal.abort(new Error(sensitive));});
 const expired=tutorPorts(config,async()=>{elapsed+=30000;return new Response('invalid JSON');});
 assert.equal((await setup({generate:expired.generate}).handler(request())).status,503);
 assert.deepEqual(logs.map(line=>JSON.parse(line)),[{stage:'groq_response',code:'GROQ_TIMEOUT',duration_ms:30000}]);
});

test('Auth failures and unexpected exceptions log only their stage; access denials and success stay silent',async t=>{
 t.mock.method(performance,'now',()=>0);
 const logs:string[]=[];t.mock.method(console,'error',(line:string)=>logs.push(line));
 const ports=tutorPorts(config,async()=>Response.json({message:'PRIVATE AUTH ERROR'},{status:503}));
 const unavailable=setup({authorize:ports.authorize});
 assert.equal((await unavailable.handler(request())).status,503);
 assert.deepEqual(logs.map(line=>JSON.parse(line)),[{stage:'auth',code:'AUTH_UNAVAILABLE',duration_ms:0}]);
 for(const stage of ['auth','groq_request'] as const){
  logs.length=0;const fail=async()=>{throw Error(`SECRET ${token()}`);};
  const {handler}=setup(stage==='auth'?{authorize:fail}:{generate:fail});
  const response=await handler(request());assert.equal(response.status,503);
  assert.deepEqual(logs.map(line=>JSON.parse(line)),[{stage,code:'UNEXPECTED_ERROR',duration_ms:0}]);
  assert.doesNotMatch(await response.text(),/SECRET/);
 }
 logs.length=0;
 const invalid=setup({generate:async()=>''});assert.equal((await invalid.handler(request())).status,502);
 assert.deepEqual(logs.map(line=>JSON.parse(line)),[{stage:'groq_response',code:'GROQ_INVALID_RESPONSE',duration_ms:0}]);
 logs.length=0;
 const denied=setup({authorize:async()=>({userId:'another-account',sessionId:session})});
 assert.equal((await denied.handler(request())).status,403);
 const invalidSession=setup({authorize:async()=>{throw new TutorError(401,'Inicia sesión.');}});
 assert.equal((await invalidSession.handler(request())).status,401);
 assert.equal((await setup().handler(request())).status,200);assert.deepEqual(logs,[]);
});

test('real adapter validates via Auth before using session claims; API keys and anonymous users denied',async()=>{
 let authCalls=0;
 const fakeFetch:typeof fetch=async(input,init)=>{authCalls++;assert.match(String(input),/\/auth\/v1\/user$/);assert.equal(new Headers(init?.headers).get('authorization'),`Bearer ${token()}`);return Response.json({id:pilot,is_anonymous:false});};
 const ports=tutorPorts(config,fakeFetch);
 assert.deepEqual(await ports.authorize(token()),{userId:pilot,sessionId:session});
 await assert.rejects(ports.authorize('publishable-api-key'),{status:401});assert.equal(authCalls,1);
 for(const [status,body] of [[401,{message:'invalid token'}],[200,{id:pilot,is_anonymous:true}],[200,{id:'different-user'}],[503,{message:'secret auth error'}]] as const){
  const denied=tutorPorts(config,async()=>Response.json(body,{status}));await assert.rejects(denied.authorize(token()),(error:unknown)=>error instanceof TutorError&&error.status===(status===503?503:401));
 }
});

test('Groq REST uses server key, system instructions, and supplied ephemeral turns; no academic operations',async()=>{
 const turns:TutorTurn[]=[{role:'user',parts:[{text:'Explícame los pronombres'}]},{role:'model',parts:[{text:'I, you, he, she.'}]},{role:'user',parts:[{text:'Dame otro ejemplo.'},{text:'En presente simple.'}]}];
 const ports=tutorPorts(config,async(input,init)=>{
  assert.equal(String(input),'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(init?.method,'POST');
  assert.equal(init?.redirect,'error');
  const headers=new Headers(init?.headers);assert.equal(headers.get('authorization'),`Bearer ${config.apiKey}`);assert.equal(headers.get('content-type'),'application/json');assert.equal(headers.has('x-goog-api-key'),false);
  const body=JSON.parse(String(init?.body));assert.deepEqual(body,{
   model:config.model,messages:[{role:'system',content:TUTOR_INSTRUCTION},{role:'user',content:'Explícame los pronombres'},{role:'assistant',content:'I, you, he, she.'},{role:'user',content:'Dame otro ejemplo.\nEn presente simple.'}],
   temperature:0.5,max_completion_tokens:1536,stream:false,
  });
  assert.doesNotMatch(String(init?.body),/synthetic-server-secret|service_role|attemptId/);
  for(const instruction of ['español','ejemplos en inglés','práctica original','redirige','No reproduzcas preguntas oficiales','No tienes herramientas'])assert.ok(TUTOR_INSTRUCTION.includes(instruction));
  return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',reasoning:'private thought',content:' I, you, he, she: son pronombres personales. '}}]});
 });
 assert.equal(await ports.generate(turns),'I, you, he, she: son pronombres personales.');
 for(const body of [{},{choices:[{finish_reason:'content_filter'}]},{choices:[{finish_reason:'length',message:{content:'truncated'}}]},{choices:[{finish_reason:'stop',message:{content:'   '}}]}])await assert.rejects(tutorPorts(config,async()=>Response.json(body)).generate(turns),{status:502});
 await assert.rejects(tutorPorts(config,async()=>new Response('sensitive provider error',{status:429})).generate(turns),{status:503});
});
