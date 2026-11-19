import {logTutorFailure,tutorDiagnostic} from './diagnostics.ts';

export type TutorConfig={url:string;publishableKey:string;apiKey:string;model:string;pilotUserId:string;origins:string[]};

export function tutorConfig(env:(name:string)=>string|undefined):TutorConfig{
 const startedAt=performance.now();
 const required=(name:string)=>{const value=env(name)?.trim();if(!value){logTutorFailure(tutorDiagnostic('configuration','CONFIG_MISSING',startedAt));throw new Error('Missing english-tutor configuration');}return value;};
 const url=required('SUPABASE_URL').replace(/\/$/,'');
 const publishableKey=required('SUPABASE_ANON_KEY');
 const apiKey=required('GROQ_API_KEY'),model=required('GROQ_MODEL');
 const pilotUserId=required('ENGLISH_TUTOR_PILOT_USER_ID').toLowerCase();
 const origins=required('ENGLISH_TUTOR_ALLOWED_ORIGINS').split(',').map(value=>value.trim());
 if(!/^https?:\/\//.test(url)||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/.test(model)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(pilotUserId)||!origins.length||origins.some(origin=>{
  try{return new URL(origin).origin!==origin||!/^https?:\/\//.test(origin);}catch{return true;}
 })){logTutorFailure(tutorDiagnostic('configuration','CONFIG_INVALID',startedAt));throw new Error('Invalid english-tutor configuration');}
 return {url,publishableKey,apiKey,model,pilotUserId,origins};
}
