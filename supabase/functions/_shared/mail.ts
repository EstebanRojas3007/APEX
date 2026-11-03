import {InvitationError} from './invitations.ts';

export const GMAIL_SENDER='apex.soporte.co@gmail.com';
export const GMAIL_SEND_SCOPE='https://www.googleapis.com/auth/gmail.send';
export type GmailCredentials={clientId?:string;clientSecret?:string;refreshToken?:string};
const tokenEndpoint='https://oauth2.googleapis.com/token';
// Explicit account: credentials for another account must not silently change sender.
const sendEndpoint=`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_SENDER)}/messages/send`;
const base64=(text:string)=>btoa(String.fromCharCode(...new TextEncoder().encode(text)));
function message(email:string,id:string,token:string,redirect:string){
 if(!/^[^\s@<>(),;:"\\]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))throw new InvitationError('MAIL_REJECTED');
 const link=new URL(redirect);link.hash=new URLSearchParams({'teacher-invitation':id,token}).toString();
 const text=`Se propone asignarte el rol Profesor en APEX. Tu acceso actual se conserva hasta que aceptes. Inicia sesión con la cuenta destinataria y revisa la propuesta: ${link.toString()}\nEl enlace vence con la solicitud, como máximo en 24 horas. Abrirlo no cambia tu rol.`;
 const mime=[`From: APEX <${GMAIL_SENDER}>`,`To: ${email}`,`Subject: =?UTF-8?B?${base64('APEX · Invitación para ser Profesor')}?=`,
  'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(text).match(/.{1,76}/g)!.join('\r\n')].join('\r\n');
 return base64(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// One instance per warm Edge isolate. Access tokens stay only in memory;
// concurrent renewals share a promise, never a database or client token store.
export function createGmailSender(config:GmailCredentials&{redirect:string},send:typeof fetch=fetch,now:()=>number=Date.now,timeoutMs=10000){
 let cached:{value:string;until:number}|undefined,refreshing:Promise<string>|undefined;
 async function refresh():Promise<string>{
  if(!config.clientId||!config.clientSecret||!config.refreshToken)throw new InvitationError('MAIL_NOT_CONFIGURED');
  let response:Response;
  try{response=await send(tokenEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'})});}
  catch{throw new InvitationError('GOOGLE_UNAVAILABLE');}
  let data:{access_token?:unknown;expires_in?:unknown;scope?:unknown;error?:unknown};
  try{data=await response.json();}catch{throw new InvitationError('GOOGLE_UNAVAILABLE');}
  if(!data||typeof data!=='object')throw new InvitationError('GOOGLE_UNAVAILABLE');
  if(!response.ok){
   cached=undefined;
   if(data.error==='invalid_grant')throw new InvitationError('GOOGLE_AUTH_REVOKED');
   if(data.error==='invalid_client'||data.error==='unauthorized_client')throw new InvitationError('GOOGLE_OAUTH_CONFIG');
   if(response.status===429)throw new InvitationError('GOOGLE_RATE_LIMIT');
   throw new InvitationError(response.status>=500?'GOOGLE_UNAVAILABLE':'GOOGLE_OAUTH_CONFIG');
  }
  if(typeof data.scope==='string'&&!data.scope.split(' ').includes(GMAIL_SEND_SCOPE))throw new InvitationError('GOOGLE_SCOPE_REQUIRED');
  if(typeof data.access_token!=='string'||!data.access_token||/[\r\n]/.test(data.access_token)||typeof data.expires_in!=='number'||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new InvitationError('GOOGLE_UNAVAILABLE');
  const lifetime=data.expires_in*1000;
  cached={value:data.access_token,until:now()+lifetime-Math.min(60000,lifetime/10)};
  return cached.value;
 }
 async function accessToken(rejected?:string):Promise<string>{
  if(cached&&cached.until>now()&&cached.value!==rejected)return cached.value;
  if(refreshing)return refreshing;
  cached=undefined;refreshing=refresh();
  try{return await refreshing;}finally{refreshing=undefined;}
 }
 return async(email:string,id:string,token:string)=>{
  const raw=message(email,id,token,config.redirect);
  let access=await accessToken();
  for(let attempt=0;attempt<2;attempt++){
   let response:Response;
   try{response=await send(sendEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({raw})});}
   catch{throw new InvitationError('SEND_UNCERTAIN');}
   // Only a definite authentication rejection permits an automatic send retry.
   if(response.status===401){
    if(attempt===0){access=await accessToken(access);continue;}
    cached=undefined;throw new InvitationError('GOOGLE_AUTH_REVOKED');
   }
   if(response.status>=500||response.status===408)throw new InvitationError('SEND_UNCERTAIN');
   if(!response.ok){
    let reason='';try{const error=await response.json();reason=error?.error?.errors?.[0]?.reason??'';}catch{}
    if(response.status===429||['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded'].includes(reason))throw new InvitationError('GOOGLE_RATE_LIMIT');
    if(reason==='insufficientPermissions')throw new InvitationError('GOOGLE_SCOPE_REQUIRED');
    throw new InvitationError('GOOGLE_REJECTED');
   }
   let result:{id?:unknown};try{result=await response.json();}catch{throw new InvitationError('SEND_UNCERTAIN');}
   if(!result||typeof result.id!=='string'||!result.id)throw new InvitationError('SEND_UNCERTAIN');
   return; // API acceptance is not evidence of delivery to the inbox.
  }
 };
}
