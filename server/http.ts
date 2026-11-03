import { createServer, type IncomingMessage } from 'node:http';
import { ApiError, ApexService } from './service';
import type { Registration } from '../shared/contracts';
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw='';
  for await(const chunk of request) { raw+=String(chunk); if(Buffer.byteLength(raw)>16_384) throw new ApiError(413,'Solicitud demasiado grande.'); }
  try { const parsed: unknown=JSON.parse(raw||'{}'); if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw Error(); return parsed as Record<string,unknown>; }
  catch { throw new ApiError(400,'Solicitud JSON inválida.'); }
}
export function makeServer(service: ApexService) {
  const aiRequests=new Map<string,number>();
  return createServer(async(req,res)=>{
    // API solo para desarrollo local. CORS restringido a servidores Expo locales.
    const origin=req.headers.origin;
    if(origin && !/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):808[0-9]$/.test(origin)) {res.writeHead(403);res.end();return;}
    const headers: Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Vary':'Origin'};
    if(origin) headers['Access-Control-Allow-Origin']=origin;
    if(req.method==='OPTIONS') {res.writeHead(204,headers);res.end();return;}
    try {
      const url=new URL(req.url??'/','http://localhost'); const path=url.pathname; const method=req.method;
      let result: unknown;
      if(path==='/health' && method==='GET') result={ok:true,mode:'local-demo'};
      else if(path==='/auth/register' && method==='POST') result=service.register(await body(req) as unknown as Registration);
      else if(path==='/auth/login' && method==='POST') {const data=await body(req);result=service.login(data.email as string,data.password as string);}
      else if(path==='/auth/recovery' && method==='POST') throw new ApiError(503,'El correo de recuperación aún no está conectado. No se ha enviado ningún mensaje. Usa solo cuentas de prueba.');
      else {
        const session=service.session((req.headers.authorization??'').replace(/^Bearer /,''));
        const data=method==='POST'||method==='PUT'?await body(req):{};
        if(path==='/me' && method==='GET') result=service.summary(session.user_id);
        else if(path==='/me' && method==='PUT') { result=service.updateProfile(session.user_id,data as unknown as Registration);service.activity(session); }
        else if(path==='/auth/logout' && method==='POST') {service.logout(session);result={ok:true};}
        else if(path==='/auth/password' && method==='POST') {service.changePassword(session,data.current as string,data.next as string);result={ok:true};}
        else if(path==='/activity' && method==='POST') {const scope=data.scope; if(scope!==undefined && scope!=='menu' && scope!=='exam') throw new ApiError(400,'Ámbito inválido.');service.activity(session,scope);result={ok:true};}
        else if(path==='/attempts/start' && method==='POST') result=service.start(session,data.confirmed as boolean);
        else if(/^\/attempts\/[^/]+$/.test(path) && method==='GET') result=service.attempt(path.split('/')[2]!,session.user_id);
        else if(/^\/attempts\/[^/]+\/answers$/.test(path) && method==='PUT') result=service.answer(session,path.split('/')[2]!,data.item as string,data.option as string|null);
        else if(/^\/attempts\/[^/]+\/finish$/.test(path) && method==='POST') result=service.finish(session,path.split('/')[2]!);
        else if(path==='/materials' && method==='GET') result=service.materials(session.user_id);
        else if(path==='/tutor' && method==='POST') {
          if(Date.now()-(aiRequests.get(session.user_id)??0)<3000) throw new ApiError(429,'Espera unos segundos antes de consultar otra vez.');
          result=service.tutor(session.user_id,data.message as string,data.consent as boolean);aiRequests.set(session.user_id,Date.now());service.activity(session);
        } else throw new ApiError(404,'Operación no disponible.');
      }
      res.writeHead(200,headers);res.end(JSON.stringify(result));
    } catch(error) {
      res.writeHead(error instanceof ApiError?error.status:500,headers);
      res.end(JSON.stringify({message:error instanceof ApiError?error.message:'No se pudo completar la operación. Intenta de nuevo.'}));
    }
  });
}
