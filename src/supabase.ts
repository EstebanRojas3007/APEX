import 'react-native-url-polyfill/auto';
import { AppState, Linking, Platform } from 'react-native';

import { createClient } from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured=!!url && !!key;
// Memory-only sessions intentionally require login after restart. Never store passwords.
export const supabase=configured?createClient(url!,key!,{
 global:{fetch:async(input,init)=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
    try{return await fetch(input,{...init,signal:init?.signal??controller.signal});}finally{clearTimeout(timer);}}},
 auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false,flowType:'implicit'}
}):null;

export const authRedirect=()=>process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ?? (Platform.OS==='web'?window.location.origin:'apex://auth/recovery');
export async function consumeAuthLink(url:string) {
 if(!supabase)return;
 const parsed=new URL(url),params=new URLSearchParams(parsed.hash.slice(1));
 const access_token=params.get('access_token'),refresh_token=params.get('refresh_token');
 if(!access_token||!refresh_token)return;
 const {error}=await supabase.auth.setSession({access_token,refresh_token});
 if(error)throw error;
 return params.get('type');
}
export type TeacherInvitationLink={id:string;token:string};
function teacherInvitationLink(url:string,onInvitation?:(link:TeacherInvitationLink)=>void){
 const parsed=new URL(url),params=new URLSearchParams(parsed.hash.slice(1));
 const id=params.get('teacher-invitation'),token=params.get('token'),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!id||!token||!uuid.test(id)||!uuid.test(token))return false;
 onInvitation?.({id,token});return true;
}
export function watchAuthLinks(onRecovery:()=>void,onError:(error:unknown)=>void,onInvitation?:(link:TeacherInvitationLink)=>void) {
 if(Platform.OS==='web'){
  const receive=()=>{if(teacherInvitationLink(window.location.href,onInvitation)){window.history.replaceState(null,'',window.location.pathname+window.location.search);return;}void consumeAuthLink(window.location.href).then(type=>{
   if(type){window.history.replaceState(null,'',window.location.pathname+window.location.search);if(type==='recovery'||type==='invite')onRecovery();}
  }).catch(onError);};
  receive();window.addEventListener('hashchange',receive);
  return ()=>window.removeEventListener('hashchange',receive);
 }
 const receive=(url:string)=>{if(teacherInvitationLink(url,onInvitation))return;void consumeAuthLink(url).then(type=>{if(type==='recovery'||type==='invite')onRecovery();}).catch(onError);};
 void Linking.getInitialURL().then(url=>{if(url)receive(url);}).catch(onError);
 const listener=Linking.addEventListener('url',event=>receive(event.url));
 return ()=>listener.remove();
}
if(supabase && Platform.OS!=='web')AppState.addEventListener('change',state=>{
 if(state==='active')supabase.auth.startAutoRefresh();else supabase.auth.stopAutoRefresh();
});
