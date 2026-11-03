// Dedicated server process, never imported by Expo or started by the app.
import {createClient} from '@supabase/supabase-js';
import {AIError,runAgent,type AIJob} from './adapter';
const url=process.env.APEX_AI_SUPABASE_URL,key=process.env.APEX_AI_SUPABASE_SERVICE_KEY;
if(!url||!key)throw Error('Configure server-only APEX_AI_SUPABASE_URL and APEX_AI_SUPABASE_SERVICE_KEY in .env.ai.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
let stopping=false;
process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
async function main(){
 do{
  const {data,error}=await db.rpc('apex_ai_claim');if(error)throw Error('Unable to claim AI queue. Verify migrations and server credentials.');
  if(!data){if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,3000));continue;}
  const job=data as AIJob;
  let output:unknown=null,failure:string|null=null;
  try{output=await runAgent(job,{url:process.env.APEX_AI_N8N_URL,token:process.env.APEX_AI_N8N_TOKEN});}catch(error){failure=error instanceof AIError?error.code:'AI_INVALID_RESPONSE';}
  const finished=await db.rpc('apex_ai_finish',{job_id:job.jobId,lease_token:job.lease,data:output,failure});
  if(finished.error){
   // SQL rejects stale contexts/references and invalid contracts atomically.
   const rejected=await db.rpc('apex_ai_finish',{job_id:job.jobId,lease_token:job.lease,data:null,failure:'AI_INVALID_RESPONSE'});
   if(rejected.error)console.error('AI job could not be persisted; its lease will expire.');
  }else console.log(`AI job ${job.jobId}: ${finished.data.status}`);
 }while(!stopping&&!process.argv.includes('--once'));
}
void main().catch(()=>{console.error('AI worker stopped. Verify server configuration and queue access.');process.exitCode=1;});
