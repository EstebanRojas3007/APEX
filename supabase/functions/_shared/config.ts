import {InvitationError} from './invitations.ts';
export type InvitationConfig={url:string;publishable:string;secret:string;redirect:string;existingRedirect:string;origins:string[];gmailClientId?:string;gmailClientSecret?:string;gmailRefreshToken?:string};
function validURL(value:string,originOnly=false,internal=false){
 try{
  const url=new URL(value);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.hash||url.search)throw Error();
  if(originOnly){if(!['https:','http:'].includes(url.protocol)||url.origin!==value)throw Error();}
  else if(url.protocol!=='https:'&&url.protocol!=='apex:'&&!(url.protocol==='http:'&&local))throw Error();
  if(url.protocol==='http:'&&!local&&!(internal&&url.hostname==='kong'&&url.port==='8000'))throw Error();
  return value;
 }catch{throw new InvitationError('SERVICE_CONFIG');}
}
export function invitationConfig(env:(key:string)=>string|undefined):InvitationConfig{
 const required=(key:string)=>{const value=env(key)?.trim();if(!value)throw new InvitationError('SERVICE_CONFIG');return value;};
 const redirect=validURL(required('APEX_ADMIN_INVITE_REDIRECT_URL'));
 const origins=required('APEX_ADMIN_ALLOWED_ORIGINS').split(',').map(value=>validURL(value.trim(),true));
 return {url:validURL(required('SUPABASE_URL'),true,true),publishable:required('APEX_ADMIN_SUPABASE_PUBLISHABLE_KEY'),secret:required('APEX_ADMIN_SUPABASE_SERVICE_KEY'),redirect,existingRedirect:validURL(env('APEX_ADMIN_EXISTING_INVITE_REDIRECT_URL')?.trim()||redirect),origins,gmailClientId:env('APEX_ADMIN_GMAIL_CLIENT_ID')?.trim(),gmailClientSecret:env('APEX_ADMIN_GMAIL_CLIENT_SECRET')?.trim(),gmailRefreshToken:env('APEX_ADMIN_GMAIL_REFRESH_TOKEN')?.trim()};
}
