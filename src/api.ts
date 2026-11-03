import { passwordChecks, validBirthDate, type Profile, type Summary, type Result } from '../shared/contracts';
import { authRedirect,supabase } from './supabase';
export class RequestError extends Error { constructor(public status:number,message:string,public details?:{code:string;result?:Result|null}) {super(message);} }
export function adminErrorMessage(error:{message:string;code?:string}){
 if(['P0001','28000','42501'].includes(error.code??'')&&!/permission denied|schema|relation|function/i.test(error.message))return error.message;
 if(error.code==='23505'||error.code==='40001'||error.code==='40P01')return 'La cuenta o la solicitud cambió durante la operación. Actualiza antes de reintentar.';
 if(error.code?.startsWith('PGRST')||['42883','42703','42P01'].includes(error.code??''))return 'Las funciones administrativas no están disponibles. Solicita revisar las migraciones y la configuración del servicio.';
 return 'No se pudo completar la operación administrativa. Actualiza el estado y solicita revisar el servicio si el problema continúa.';
}
type Input=Record<string,unknown>;
export async function dispatchTeacherInvitation(invitationId:string):Promise<{status:string;message:string}>{
 if(!supabase)throw new RequestError(503,'Configura Supabase. La solicitud queda guardada para reintentar.');
 const {data}=await supabase.auth.getSession();
 if(!data.session)throw new RequestError(401,'Inicia sesión.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const {data:result,error}=await supabase.functions.invoke('admin-invitations',{body:{invitationId},headers:{Authorization:`Bearer ${data.session.access_token}`},signal:controller.signal});
  if(error){
   const context=error.context;
   if(context instanceof Response){
    const status=context.status;let body:{message?:string;code?:string}|null=null;
    try{body=await context.json();}catch{}
    const message=status===401?'La sesión no es válida o venció. Inicia sesión de nuevo.':body?.message??'No se confirmó el envío. Consulta el estado antes de reintentar.';
    throw new RequestError(status,message);
   }
   throw error;
  }
  if(!result||typeof result.status!=='string'||typeof result.message!=='string')throw new Error('Invalid function response');
  return result;
 }catch(error){if(error instanceof RequestError)throw error;throw new RequestError(0,'No se pudo confirmar la respuesta del servicio de invitaciones. Revisa su disponibilidad y actualiza el estado antes de reintentar; la solicitud queda conservada.');}
 finally{clearTimeout(timer);}
}
export async function transitionDiagnostic(studentIds:string[]):Promise<{assigned:number;requested:number}> {
 if(!supabase)throw new RequestError(503,'Falta configurar Supabase.');
 const {data,error}=await supabase.rpc('apex_transition_diagnostic',{student_ids:studentIds});check(error);return data;
}

function check(error:{message:string;code?:string;status?:number}|null) {
 if(!error)return;
 const status=error.code==='28000'?401:error.code==='42501'?403:/fetch|network/i.test(error.message)?0:error.status??400;
 throw new RequestError(status,error.message);
}

export async function rpc<T>(operation:string,payload:unknown={}):Promise<T> {
 if(!supabase)throw new RequestError(503,'Configura las variables públicas de Supabase en .env.');
 const {data,error,status:responseStatus}=await supabase.rpc('apex_api',{operation,payload});check(error?{...error,message:operation.startsWith('admin_')||operation==='set_role'?adminErrorMessage(error):error.message,status:responseStatus}:null);
 if(data?.error?.code==='BANK_EXHAUSTED')throw new RequestError(409,data.error.message);
 if(data?.error?.code==='ATTEMPT_EXPIRED')throw new RequestError(409,data.error.message,{code:data.error.code,result:data.result});
 if(data?.error?.code==='ATTEMPT_SUSPENDED')throw new RequestError(409,data.error.message,{code:data.error.code});
 if(data?.error?.code==='TECHNICAL_ACCESS_REVOKED')throw new RequestError(403,data.error.message,{code:data.error.code});
 return data as T;
}
function validatePassword(value:unknown):asserts value is string {
 if(typeof value!=='string'||value.length>128||!passwordChecks(value).every(rule=>rule.valid))throw new RequestError(400,'La contraseña debe cumplir los requisitos indicados (máximo 128 caracteres).');
}
export type AuthResponse={token:string;profile:Profile;confirmationRequired?:boolean;invitationRequired?:boolean};
async function signedIn():Promise<AuthResponse> {
 const {data,error}=await supabase!.auth.getSession();check(error);
 if(!data.session)throw new RequestError(401,'Inicia sesión para continuar.');
 const summary=await rpc<Summary>('me');
 return {token:data.session.access_token,profile:summary.profile};
}
// Adapter for the existing UI. Domain operations run exclusively in PostgreSQL RPCs.
export async function request<T>(path:string,_token?:string,method='GET',data?:unknown):Promise<T> {
 if(!supabase)throw new RequestError(503,'Falta configurar Supabase. Consulta Docs/SUPABASE.md.');
 const input=(data??{}) as Input;
 try {
 let result:unknown;
 if(path==='/health'||path==='/catalog') {
  const response=await supabase.rpc('apex_catalog');check(response.error);result=response.data;
 }else if(path==='/auth/register') {
  validatePassword(input.password);
  if(typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>100)throw new RequestError(400,'Nombre: 2 a 100 caracteres.');
  if(typeof input.birthDate!=='string'||!validBirthDate(input.birthDate))throw new RequestError(400,'Revisa la fecha de nacimiento. Usa AAAA-MM-DD.');
  if(!Number.isInteger(input.semester)||Number(input.semester)<1||Number(input.semester)>20)throw new RequestError(400,'Semestre: un entero entre 1 y 20.');
  if(typeof input.program!=='string'||!input.program||input.consent!==true)throw new RequestError(400,'Selecciona tu carrera y acepta el aviso.');
  const response=await supabase.auth.signUp({email:String(input.email).trim(),password:input.password,options:{emailRedirectTo:authRedirect(),data:{name:input.name.trim(),birthDate:input.birthDate,program:input.program,semester:input.semester,consent:true}}});
  check(response.error);
  if(!response.data.session)return {confirmationRequired:true} as T;
  result=await signedIn();
 }else if(path==='/auth/login') {
  const response=await supabase.auth.signInWithPassword({email:String(input.email).trim(),password:String(input.password)});check(response.error);
  const invitation=await supabase.rpc('apex_teacher_invitation_status');check(invitation.error);
  result=invitation.data?.required?{invitationRequired:true}:await signedIn();
 }else if(path==='/auth/recovery') {
  const {error}=await supabase.auth.resetPasswordForEmail(String(input.email).trim(),{redirectTo:authRedirect()});check(error);result={ok:true};
 }else if(path==='/auth/reset-password') {
  validatePassword(input.password);
  const {error}=await supabase.auth.updateUser({password:input.password});check(error);
 const invitation=await supabase.rpc('apex_teacher_invitation_status');check(invitation.error);
 if(invitation.data?.required)return {invitationRequired:true} as T;
  const signout=await supabase.auth.signOut();check(signout.error);result={ok:true};
 }else if(path==='/auth/session')result=await signedIn();
 else if(path==='/auth/password') {
  validatePassword(input.next);
  const session=await supabase.auth.getUser();check(session.error);
  const verified=await supabase.auth.signInWithPassword({email:session.data.user!.email!,password:String(input.current)});check(verified.error);
  const updated=await supabase.auth.updateUser({password:input.next});check(updated.error);
  await rpc('logout');const signout=await supabase.auth.signOut();check(signout.error);result={ok:true};
 }else if(path==='/auth/logout') {
  try {await rpc('logout');}finally {const {error}=await supabase.auth.signOut();check(error);}result={ok:true};
 }else if(path==='/materials') {
  const response=await supabase.rpc('apex_materials');check(response.error);result=response.data;
 }else if(path==='/route') {
  const response=await supabase.rpc('apex_my_route');check(response.error);result=response.data;
 }else if(path==='/route/retry')result=await rpc('route_retry',input);
 else if(path==='/sections/open')result=await rpc('section',input);
 else if(path==='/sections/complete')result=await rpc('section_complete',input);
 else if(path==='/chat/open')result=await rpc('chat_open',input);
 else if(path==='/chat/get')result=await rpc('chat_get',input);
 else if(path==='/chat/send')result=await rpc('chat_send',input);
 else if(path==='/chat/complete')result=await rpc('review_complete',input);
 else if(path==='/me')result=await rpc(method==='PUT'?'profile':'me',input);
 else if(path==='/profile/consent')result=await rpc('profile_consent',input);
 else if(path==='/profile')result=await rpc('profile',input);
 else if(path==='/activity')result=await rpc('activity',input);
 else if(path==='/attempts/start')result=await rpc('start',input);
 else if(path==='/technical-assessment')result=await rpc('technical_status');
 else {
  const match=path.match(/^\/attempts\/([^/]+)(?:\/(answers|finish|clock))?$/);
  if(!match)throw new RequestError(404,'Operación no disponible.');
  result=await rpc(match[2]==='answers'?'answer':match[2]==='finish'?'finish':match[2]==='clock'?'attempt_clock':'attempt',{...input,attemptId:match[1]});
 }
 return result as T;
 }catch(error) {
  if(error instanceof RequestError)throw error;
  if(error instanceof TypeError || error instanceof Error && /fetch|network|abort/i.test(error.message))throw new RequestError(0,'Sin conexión con Supabase. Las respuestas confirmadas se conservan.');
  throw error;
 }
}
