import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseFetch} from './supabaseFetch';

for(const [path,deadline] of [['/functions/v1/english-tutor',40000],['/rest/v1/rpc/apex_api',12000]] as const){
 test(`shared fetch deadline for ${path}: ${deadline} ms, no retry`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let signal:AbortSignal|undefined,calls=0;
  t.mock.method(globalThis,'fetch',async(_input:unknown,init?:RequestInit)=>{
   calls++;signal=init?.signal??undefined;
   return new Promise<Response>((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  });
  const pending=supabaseFetch(`https://example.test${path}`);
  const rejected=assert.rejects(pending,{name:'AbortError'});
  t.mock.timers.tick(deadline-1);assert.equal(signal?.aborted,false);
  t.mock.timers.tick(1);await rejected;assert.equal(signal?.aborted,true);
  t.mock.timers.tick(40000);assert.equal(calls,1);
 });
}

test('shared fetch preserves the tutor API signal, cancellation and headers',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const controller=new AbortController();let calls=0;
 t.mock.method(globalThis,'fetch',async(_input:unknown,init?:RequestInit)=>{
  calls++;assert.equal(init?.signal,controller.signal);
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-session');
  return new Promise<Response>((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 });
 const pending=supabaseFetch('https://example.test/functions/v1/english-tutor',{signal:controller.signal,headers:{authorization:'Bearer synthetic-session'}});
 const rejected=assert.rejects(pending,{name:'AbortError'});
 t.mock.timers.tick(12000);assert.equal(controller.signal.aborted,false);
 controller.abort();await rejected;assert.equal(calls,1);
});

test('shared fetch clears its fallback timer after a response',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let signal:AbortSignal|undefined;
 t.mock.method(globalThis,'fetch',async(_input:unknown,init?:RequestInit)=>{signal=init?.signal??undefined;return Response.json({reply:'Practice English.'});});
 await supabaseFetch(new URL('https://example.test/functions/v1/english-tutor'));
 t.mock.timers.tick(40000);assert.equal(signal?.aborted,false);
});
