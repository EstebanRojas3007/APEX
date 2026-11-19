import type {TutorConfig} from './config.ts';
import {logTutorFailure,tutorDiagnostic,type TutorDiagnostic} from './diagnostics.ts';
import {TutorError,type TutorPorts,type TutorTurn} from './service.ts';

const MAX_MESSAGE=2000,MAX_BYTES=12000,TTL_MS=30*60*1000;
type Conversation={turns:TutorTurn[];updatedAt:number;busy:boolean};

// Ephemeral context per verified Auth session; never persisted or sent by the client.
export function englishTutorHandler(ports:TutorPorts,config:Pick<TutorConfig,'pilotUserId'|'origins'>,now=Date.now){
 const conversations=new Map<string,Conversation>();
 return async(request:Request):Promise<Response>=>{
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'});
  const respond=(status:number,body:unknown)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
  const origin=request.headers.get('origin');
  if(origin&&!config.origins.includes(origin))return respond(403,{message:'Origen no autorizado.'});
  if(origin)headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');
  headers.set('Access-Control-Allow-Methods','POST,OPTIONS');
  if(request.method==='OPTIONS')return respond(204,null);
  if(request.method!=='POST')return respond(405,{message:'Método no permitido.'});
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token)return respond(401,{message:'Inicia sesión para usar el tutor.'});
  let stage:TutorDiagnostic['stage']='auth';
  let startedAt=performance.now();
  try{
   const {userId,sessionId}=await ports.authorize(token);
   stage='request';startedAt=performance.now();
   // Fail closed if the pilot is unset, including in isolated tests.
   if(!config.pilotUserId||userId.toLowerCase()!==config.pilotUserId.toLowerCase())throw new TutorError(403,'El Tutor de inglés está habilitado únicamente para la cuenta piloto.');
   if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new TutorError(400,'Envía un mensaje en formato JSON.');
   const reader=request.body?.getReader();let raw='',size=0;
   if(reader){const decoder=new TextDecoder();try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new TutorError(413,'El mensaje es demasiado largo.');}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}}
   let body;try{body=JSON.parse(raw);}catch{throw new TutorError(400,'Envía un mensaje en formato JSON.');}
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(key=>key!=='message')||typeof body.message!=='string'||!body.message.trim()||body.message.length>MAX_MESSAGE)throw new TutorError(400,`Escribe un mensaje de 1 a ${MAX_MESSAGE} caracteres.`);
   for(const [key,value] of conversations)if(!value.busy&&now()-value.updatedAt>=TTL_MS)conversations.delete(key);
   const conversation=conversations.get(sessionId)??{turns:[],updatedAt:now(),busy:false};
   if(conversation.busy)throw new TutorError(429,'Espera a que termine la respuesta anterior.');
   // Limit retained sessions even if the pilot opens many devices.
   if(!conversations.has(sessionId)&&conversations.size>=10){const oldest=[...conversations].find(([,value])=>!value.busy);if(oldest)conversations.delete(oldest[0]);else throw new TutorError(429,'El tutor está ocupado. Inténtalo de nuevo.');}
   conversation.busy=true;conversations.set(sessionId,conversation);
   try{
    const turns:TutorTurn[]=[...conversation.turns,{role:'user',parts:[{text:body.message.trim()}]}];
    stage='groq_request';startedAt=performance.now();
    const reply=await ports.generate(turns);
    stage='groq_response';
    if(typeof reply!=='string'||!reply.trim()||reply.length>12000)throw new TutorError(502,'El tutor no pudo completar la respuesta. Inténtalo de nuevo.',tutorDiagnostic(stage,'GROQ_INVALID_RESPONSE',startedAt));
    conversation.turns=[...turns,{role:'model' as const,parts:[{text:reply}]}].slice(-16);
    conversation.updatedAt=now();
    return respond(200,{reply});
   }finally{conversation.busy=false;}
  }catch(error){
   if(!(error instanceof TutorError)||error.status>=500)logTutorFailure(error instanceof TutorError&&error.diagnostic?error.diagnostic:tutorDiagnostic(stage,'UNEXPECTED_ERROR',startedAt));
   return respond(error instanceof TutorError?error.status:503,{message:error instanceof TutorError?error.message:'No se pudo contactar al tutor. Inténtalo de nuevo.'});
  }
 };
}
