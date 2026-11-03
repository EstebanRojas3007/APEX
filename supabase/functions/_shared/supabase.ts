import {createClient} from '@supabase/supabase-js';
import {authMailCode,InvitationError,type InvitationPorts} from './invitations.ts';
import {createGmailSender} from './mail.ts';
import type {InvitationConfig} from './config.ts';

export function supabaseInvitationPorts(config:InvitationConfig,client:typeof createClient=createClient,mailFetch:typeof fetch=fetch):InvitationPorts{
 const {url,secret,publishable,redirect}=config;
const authOptions={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
const db=client(url,secret,{auth:authOptions});
const sendExisting=createGmailSender({clientId:config.gmailClientId,clientSecret:config.gmailClientSecret,refreshToken:config.gmailRefreshToken,redirect:config.existingRedirect},mailFetch);
async function dispatch(args:Record<string,unknown>){const {data,error}=await db.rpc('apex_admin_invitation_dispatch',args);if(error)throw new InvitationError(error.code==='42501'?'FORBIDDEN':error.code==='P0001'?'INVITATION_CONFLICT':'SERVICE_CONFIG');return data;}
return {
 authorize:async token=>{
  const userDb=client(url,publishable,{auth:authOptions,global:{headers:{Authorization:`Bearer ${token}`}}});
  // Reject API keys before contacting Auth, even if the gateway accepts one.
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw new InvitationError('UNAUTHENTICATED');
  let result;try{result=await userDb.auth.getUser(token);}catch{throw new InvitationError('AUTH_UNAVAILABLE');}
  const {data,error}=result;
  if(error)throw new InvitationError([400,401,403].includes(error.status??0)?'UNAUTHENTICATED':'AUTH_UNAVAILABLE');
  if(!data.user)throw new InvitationError('UNAUTHENTICATED');
  const authorized=await userDb.rpc('apex_api',{operation:'admin_overview',payload:{}});
  if(authorized.error)throw new InvitationError(['28000','42501'].includes(authorized.error.code)?'FORBIDDEN':'SERVICE_CONFIG');return data.user.id;
 },
 claim:(id,actor)=>dispatch({invitation_id:id,actor_auth:actor,step:'claim'}),
 invite:async(email,name,nonce)=>{
  const {data,error}=await db.auth.admin.inviteUserByEmail(email,{data:{name,apex_invite_nonce:nonce},redirectTo:redirect});
  if(error||!data.user)throw new InvitationError(authMailCode(error));
  return data.user.id;
 },
 recoverOwned:async(authId,email)=>{
  const {data,error}=await db.auth.admin.getUserById(authId);
  if(error||data.user?.id!==authId||data.user.email?.trim().toLowerCase()!==email)throw new InvitationError('FORBIDDEN');
  // A previous Auth insertion committed but delivery/final persistence failed.
  // Supabase's SMTP sends a password setup link only to the already bound UUID.
  const result=await db.auth.resetPasswordForEmail(email,{redirectTo:redirect});if(result.error)throw new InvitationError(authMailCode(result.error));
 },
 sendExisting:async(authId,email,id,token)=>{
  const {data,error}=await db.auth.admin.getUserById(authId);
  if(error||data.user?.id!==authId||data.user.email?.trim().toLowerCase()!==email)throw new InvitationError('INVITATION_CONFLICT');
  await sendExisting(email,id,token);
 },
 complete:async(id,actor,lease,authId)=>{await dispatch({invitation_id:id,actor_auth:actor,step:'sent',lease_token:lease,auth_id:authId});},
 fail:async(id,actor,lease,code)=>{await dispatch({invitation_id:id,actor_auth:actor,step:'error',lease_token:lease,failure_code:code});},
};
}
