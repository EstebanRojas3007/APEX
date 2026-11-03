import {dispatchInvitation,InvitationError,invitationErrorMessage,type InvitationPorts} from './invitations.ts';

// Web standard Request/Response: this exact handler runs in Edge and in local tests.
export function invitationHandler(ports:InvitationPorts,origins:string[]){
 return async(request:Request):Promise<Response>=>{
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'});
  const reply=(status:number,body:unknown)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
  const origin=request.headers.get('origin');
  if(origin&&!origins.includes(origin))return reply(403,{message:'Origen no autorizado.'});
  if(origin)headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');
  headers.set('Access-Control-Allow-Methods','POST,OPTIONS');
  if(request.method==='OPTIONS')return reply(204,null);
  if(request.method!=='POST')return reply(405,{message:'Método no permitido.'});
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token)return reply(401,{code:'UNAUTHENTICATED',message:'Inicia sesión como administrador.'});
  try{
   // Bound even chunked bodies; do not allocate arbitrary request bodies in Edge.
   const reader=request.body?.getReader();let raw='',size=0;
   if(reader){const decoder=new TextDecoder();try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096){await reader.cancel();throw new InvitationError('INVALID_INPUT');}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}}
   let body;try{body=JSON.parse(raw);}catch{throw new InvitationError('INVALID_INPUT');}
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='invitationId')||typeof body.invitationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.invitationId))throw new InvitationError('INVALID_INPUT');
   return reply(200,await dispatchInvitation(ports,token,body.invitationId));
  }catch(error){
   const code=error instanceof InvitationError?error.code:'DELIVERY_FAILED';
   return reply(code==='INVALID_INPUT'?400:code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'?403:503,{code,message:invitationErrorMessage(code)});
  }
 };
}
