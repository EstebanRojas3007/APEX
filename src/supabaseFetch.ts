export const ENGLISH_TUTOR_CLIENT_TIMEOUT_MS=40000;

// Explicit signals own their deadline (the tutor API keeps it through body parsing).
// Calls without a signal still give the tutor 40 s; other calls keep the 12 s default.
export const supabaseFetch:typeof fetch=async(input,init)=>{
 if(init?.signal)return fetch(input,init);
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 const timeout=url.pathname==='/functions/v1/english-tutor'?ENGLISH_TUTOR_CLIENT_TIMEOUT_MS:12000;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);}
};
