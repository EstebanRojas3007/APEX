import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runAgent,validateResponse,type AIJob,AIError} from './adapter';
const ref={fragmentId:'fragment-test',sourceId:'source-test',page:1,title:'Synthetic source',text:'Synthetic text',sha256:'a'.repeat(64),edition:null,url:null};
const job:AIJob={jobId:'opaque-job-test',requestId:'opaque-job-test:context-hash',lease:'opaque-lease-test',input:{contractVersion:2,kind:'chat',references:[ref]}};
const answer={contractVersion:2,kind:'chat',text:'Original guidance',references:[{fragmentId:ref.fragmentId,sourceId:ref.sourceId,page:1}]};
test('Authenticated HTTPS adapter, idempotency and validated references; no configured service means no fabricated response',async()=>{
 let called=0;
 const fake:typeof fetch=async(url,init)=>{called++;assert.equal(String(url),'https://n8n.example.test/webhook/apex');assert.equal((init!.headers as any).Authorization,'Bearer test-server-token');assert.equal((init!.headers as any)['Idempotency-Key'],job.requestId);assert.equal(init!.redirect,'error');assert.doesNotMatch(init!.body as string,/opaque-lease-test|test-server-token/);return new Response(JSON.stringify(answer));};
 await assert.rejects(runAgent(job,{},fake),(e:any)=>e instanceof AIError&&e.code==='AI_NOT_CONFIGURED');assert.equal(called,0);
 await assert.rejects(runAgent(job,{url:'http://insecure.test',token:'test'},fake),/AI_NOT_CONFIGURED/);
 await assert.rejects(runAgent({...job,input:{...job.input,references:[]}},{url:'https://n8n.example.test',token:'test'},fake),/NO_AUTHORIZED_REFERENCES/);
 assert.deepEqual(await runAgent(job,{url:'https://n8n.example.test/webhook/apex',token:'test-server-token'},fake),answer);
 await assert.rejects(runAgent(job,{url:'https://n8n.example.test',token:'test'},async()=>new Response('{}',{status:503})),/AI_UNAVAILABLE/);
 await assert.rejects(runAgent(job,{url:'https://n8n.example.test',token:'test'},async()=>new Response('not JSON')),/AI_INVALID_RESPONSE/);
 for(const bad of [{...answer,passed:true},{...answer,references:[{...answer.references[0],page:2}]},{...answer,text:''}])assert.throws(()=>validateResponse(bad,job.input),/AI_INVALID_RESPONSE/);
});
