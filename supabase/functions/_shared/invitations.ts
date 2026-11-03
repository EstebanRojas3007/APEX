export type InvitationClaim={dispatch:boolean;status:string;id?:string;email?:string;name?:string;mode?:'new'|'existing';nonce?:string;lease?:string;authId?:string|null};
export type InvitationPorts={
 authorize:(token:string)=>Promise<string>;
 claim:(id:string,actor:string)=>Promise<InvitationClaim>;
 invite:(email:string,name:string,nonce:string)=>Promise<string>;
 recoverOwned:(authId:string,email:string)=>Promise<void>;
 sendExisting?:(authId:string,email:string,id:string,token:string)=>Promise<void>;
 complete:(id:string,actor:string,lease:string,authId:string)=>Promise<void>;
 fail:(id:string,actor:string,lease:string,code:string)=>Promise<void>;
};
export class InvitationError extends Error{constructor(public code:string){super(code);}}
export async function dispatchInvitation(ports:InvitationPorts,token:string,id:string){
 const actor=await ports.authorize(token); // real session AND current database role
 const claim=await ports.claim(id,actor);
 if(!claim.dispatch)return {status:claim.status,message:claim.status==='sent'?'La invitación ya fue enviada.':'El envío está en proceso; actualiza su estado.'};
 if(!claim.id||!claim.email||!claim.name||!claim.nonce||!claim.lease)throw new InvitationError('INVALID_CLAIM');
 try{
  let authId=claim.authId;
  if(claim.mode==='existing'){
   if(!authId)throw new InvitationError('INVALID_CLAIM');
   if(!ports.sendExisting)throw new InvitationError('MAIL_NOT_CONFIGURED');
   await ports.sendExisting(authId,claim.email,id,claim.nonce);
  }else if(authId)await ports.recoverOwned(authId,claim.email);
  else authId=await ports.invite(claim.email,claim.name,claim.nonce);
  await ports.complete(id,actor,claim.lease,authId);
  return {status:'sent',message:'El proveedor aceptó el envío. Pendiente de aceptación del destinatario; no se ha confirmado la entrega del correo.'};
 }catch(error){
  // Auth/email and PostgreSQL cannot share a transaction. The insert trigger
  // retains the verified new UUID and quarantines its profile. A retry uses
  // that UUID; it never adopts an account merely because its email matches.
  const googleAudit:Record<string,string>={GOOGLE_AUTH_REVOKED:'MAIL_REJECTED',GOOGLE_OAUTH_CONFIG:'SERVICE_CONFIG',GOOGLE_SCOPE_REQUIRED:'MAIL_REJECTED',GOOGLE_RATE_LIMIT:'MAIL_REJECTED',GOOGLE_REJECTED:'MAIL_REJECTED',GOOGLE_UNAVAILABLE:'DELIVERY_FAILED',SEND_UNCERTAIN:'DELIVERY_FAILED'};
  const code=error instanceof InvitationError&&([...Object.keys(googleAudit),'AUTH_EXISTS','AUTH_FAILED','AUTH_UNAVAILABLE','MAIL_NOT_CONFIGURED','MAIL_REJECTED','AUTH_RATE_LIMIT','AUTH_MAIL_REJECTED','SERVICE_CONFIG','INVITATION_CONFLICT'].includes(error.code))?error.code:'DELIVERY_FAILED';
  // Preserve the applied SQL's limited audit codes; responses may explain Google
  // failures more precisely without persisting private provider response bodies.
  await ports.fail(id,actor,claim.lease,googleAudit[code]??code).catch(()=>{}); // fenced/cancelled jobs stay unchanged
  throw new InvitationError(code);
 }
}
export function invitationErrorMessage(code:string){
 const messages:Record<string,string>={
  AUTH_EXISTS:'Ya existe una cuenta con ese correo. Utiliza Invitar profesor con cuenta existente y su ID APEX.',
  UNAUTHENTICATED:'La sesión no es válida o venció. Inicia sesión de nuevo.',
  FORBIDDEN:'La sesión o los permisos administrativos ya no son válidos.',
  MAIL_NOT_CONFIGURED:'El servicio de correo para cuentas existentes no está configurado. La solicitud queda guardada.',
  MAIL_REJECTED:'El proveedor de correo rechazó el envío. Solicita revisar la configuración del remitente y reintenta.',
  GOOGLE_AUTH_REVOKED:'La autorización de Google venció o fue revocada. El responsable debe volver a autorizar la cuenta remitente.',
  GOOGLE_OAUTH_CONFIG:'La configuración OAuth de Gmail no es válida. Solicita revisar el cliente y los secretos del servidor.',
  GOOGLE_SCOPE_REQUIRED:'Google no autorizó el permiso de envío de Gmail. Solicita autorizar únicamente el alcance gmail.send.',
  GOOGLE_RATE_LIMIT:'Google limitó el envío de correo. Espera y consulta el estado antes de reintentar.',
  GOOGLE_REJECTED:'Gmail rechazó el envío. Solicita revisar que se autorizó la cuenta remitente apex.soporte.co@gmail.com y sus permisos.',
  GOOGLE_UNAVAILABLE:'No se pudo renovar el acceso a Google. No se inició el envío del correo; solicita revisar el servicio.',
  SEND_UNCERTAIN:'No se confirmó el envío de Gmail. Puede haberse enviado: revisa el estado y consulta al responsable antes de reintentar para evitar duplicados.',
  AUTH_RATE_LIMIT:'Auth limitó temporalmente el envío de correos. Espera antes de reintentar.',
  AUTH_MAIL_REJECTED:'Auth no aceptó el correo. Solicita revisar SMTP, remitente y destinatarios permitidos.',
  AUTH_FAILED:'Auth no pudo completar el alta o el envío. Solicita revisar el servicio y sus registros privados antes de reintentar.',
  AUTH_UNAVAILABLE:'No se pudo comprobar la sesión con Auth. Revisa la disponibilidad del servicio antes de reintentar.',
  SERVICE_CONFIG:'El servicio no pudo acceder a las funciones de invitación. Solicita revisar su configuración y las migraciones.',
  INVITATION_CONFLICT:'La solicitud venció, fue cancelada o cambió la cuenta. Actualiza el estado antes de continuar.',
  INVALID_INPUT:'La solicitud de envío no es válida.',
 };
 return messages[code]??'No se confirmó el envío. Actualiza el estado de la invitación antes de reintentar.';
}
export function authMailCode(error:{code?:string;status?:number;message:string}|null){
 if(error&&/already|exists|registered/i.test(error.code??error.message))return 'AUTH_EXISTS';
 if(error?.status===429||/rate_limit/.test(error?.code??''))return 'AUTH_RATE_LIMIT';
 if(/email_address_not_authorized|email_address_invalid/.test(error?.code??''))return 'AUTH_MAIL_REJECTED';
 // unexpected_failure can also be a database/trigger failure; it is not SMTP evidence.
 if(error?.code==='unexpected_failure')return 'AUTH_FAILED';
 return 'DELIVERY_FAILED';
}
