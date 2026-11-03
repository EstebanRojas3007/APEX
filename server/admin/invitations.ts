// Node transport retained for local regression tests. Production uses Deno.serve.
import {createServer} from 'node:http';
import {invitationHandler} from '../../supabase/functions/_shared/handler.ts';
import type {InvitationPorts} from '../../supabase/functions/_shared/invitations.ts';
export * from '../../supabase/functions/_shared/invitations.ts';
export function makeInvitationServer(ports:InvitationPorts,origins:string[]){
 const handle=invitationHandler(ports,origins);
 return createServer(async(req,res)=>{
  if(req.url==='/health'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;}
  if(req.url!=='/invitations/dispatch'){res.writeHead(404);res.end('{}');return;}
  try{
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)break;}
   const response=await handle(new Request('http://localhost/invitations/dispatch',{method:req.method,headers,...(req.method==='POST'?{body:raw}:{})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(503);res.end('{}');}
 });
}
