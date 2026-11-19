// Manual diagnostic only: one real request, no retries, no application changes.
import {readFileSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
let apiKey='',http_status=null,startedAt,request_attempted=false;
const redact=value=>String(value).replaceAll(apiKey||'\u0000','[REDACTED]')
 .replaceAll(encodeURIComponent(apiKey)||'\u0000','[REDACTED]')
 .replace(/gsk_[\w-]+/g,'[REDACTED]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').slice(0,1200);
const report=fields=>console.log(JSON.stringify({request_attempted,http_status,duration_ms:startedAt===undefined?null:Math.max(0,Math.round(performance.now()-startedAt)),...fields}));

try{
 const args=process.argv.slice(2);let local={};
 if(args.length){
  if(args.length!==2||args[0]!=='--env-file')throw new Error('USAGE');
  try{
   const path=realpathSync(args[1]);
   // Refuse tracked files and files outside this repository's ignore rules.
   execFileSync('git',['-C',root,'check-ignore','--quiet','--',path],{stdio:'ignore'});
   local=parseEnv(readFileSync(path,'utf8'));
  }catch{throw new Error('LOCAL_ENV_UNAVAILABLE');}
 }
 apiKey=(process.env.GROQ_API_KEY||local.GROQ_API_KEY||'').trim();
 const model=(process.env.GROQ_MODEL||local.GROQ_MODEL||'').trim();
 if(!apiKey||!model)throw new Error('CONFIG_MISSING');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/.test(model))throw new Error('MODEL_FORMAT_INVALID');

 startedAt=performance.now();request_attempted=true;
 const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
  // No system instruction, history or temperature override. Retain the tutor's output cap.
  body:JSON.stringify({model,messages:[{role:'user',content:'Responde únicamente OK'}],max_completion_tokens:1536,stream:false}),
 });
 http_status=response.status;
 let body;try{body=await response.json();}catch(error){
  if(error?.name==='TimeoutError'||error?.name==='AbortError')throw error;
  report({code:'INVALID_JSON_RESPONSE',message:'Groq no devolvió JSON interpretable.'});process.exitCode=1;
 }
 if(body!==undefined){
  if(!response.ok){
   const error=body?.error;
   report({error:{code:typeof error?.code==='number'?error.code:typeof error?.code==='string'?redact(error.code):null,
    type:typeof error?.type==='string'?redact(error.type):null,
    message:typeof error?.message==='string'?redact(error.message):'Rechazo sin mensaje de error interpretable.'}});
   process.exitCode=1;
  }else{
   const choice=body?.choices?.[0],content=choice?.message?.content;
   const reply=typeof content==='string'?content.trim():'';
   const reply_is_ok=reply==='OK'&&choice?.finish_reason==='stop';
   report({reply_is_ok});
   if(!reply_is_ok)process.exitCode=1;
  }
 }
}catch(error){
 const safeCodes=['USAGE','LOCAL_ENV_UNAVAILABLE','CONFIG_MISSING','MODEL_FORMAT_INVALID'];
 const code=!request_attempted&&safeCodes.includes(error?.message)?error.message:
  ['TimeoutError','AbortError'].includes(error?.name)?'TIMEOUT':'NETWORK_ERROR';
 // Do not print exception messages, stacks, request headers or raw provider bodies.
 report({code});process.exitCode=1;
}
