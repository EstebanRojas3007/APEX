import {RequestError} from './api';
import {supabase} from './supabase';
import {ENGLISH_TUTOR_CLIENT_TIMEOUT_MS} from './supabaseFetch';

export async function sendEnglishTutor(message:string,signal:AbortSignal):Promise<string>{
 if(!supabase)throw new RequestError(503,'Falta configurar Supabase para usar el tutor.');
 const {data,error:sessionError}=await supabase.auth.getSession();
 if(sessionError||!data.session)throw new RequestError(401,'Inicia sesión para usar el tutor.');
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort();
 if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},ENGLISH_TUTOR_CLIENT_TIMEOUT_MS);
 try{
  if(controller.signal.aborted)throw new Error('Tutor request cancelled');
  const {data:result,error}=await supabase.functions.invoke('english-tutor',{
   body:{message},headers:{Authorization:`Bearer ${data.session.access_token}`},signal:controller.signal,
  });
  if(controller.signal.aborted)throw new Error('Tutor request cancelled');
  if(error){
   if(error.context instanceof Response){
    const status=error.context.status;
    const messages:Record<number,string>={400:'Revisa tu mensaje (máximo 2000 caracteres).',401:'La sesión no es válida o venció. Inicia sesión de nuevo.',403:'El Tutor de inglés está habilitado únicamente para la cuenta piloto.',413:'El mensaje es demasiado largo.',429:'Espera un momento antes de enviar otro mensaje.'};
    throw new RequestError(status,messages[status]??'El tutor no está disponible temporalmente. Inténtalo de nuevo.');
   }
   throw error;
  }
  if(!result||typeof result.reply!=='string'||!result.reply.trim()||result.reply.length>12000)throw new Error('Invalid tutor response');
  return result.reply.trim();
 }catch(error){
  if(timedOut)throw new RequestError(0,'El tutor tardó demasiado. Tu mensaje se conserva; inténtalo de nuevo.');
  if(error instanceof RequestError)throw error;
  throw new RequestError(0,'No se pudo contactar al tutor. Revisa tu conexión e inténtalo de nuevo.');
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
