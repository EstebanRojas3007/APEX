import type {PGlite} from '@electric-sql/pglite';
import {database,identity,asUser,rpc} from './harness';
import type {InvitationPorts} from '../../server/admin/invitations';
import {randomUUID} from 'node:crypto';
export type User={id:string;sid:string};
export async function adminFixture(){
 const db=await database();
 await db.exec("ALTER TABLE auth.users ADD COLUMN encrypted_password text;INSERT INTO apex_private.componente VALUES('ingles','Inglés sintético') ON CONFLICT DO NOTHING;INSERT INTO apex_private.programa_componente VALUES('demo','ingles') ON CONFLICT DO NOTHING;");
 const admin=await identity(db,19001,'administrador'),backup=await identity(db,19002,'administrador'),teacher=await identity(db,19003,'docente'),student=await identity(db,19004);
 await db.exec('UPDATE auth.users SET email_confirmed_at=now()');
 const call=(user:User|null,op:string,payload:unknown={})=>asUser(db,user,()=>rpc(db,op,payload));
 const update=(target:User,fields:Record<string,unknown>,actor=admin)=>call(actor,'admin_user_update',{userId:target.id,authId:target.id,expectedRole:target.id===admin.id||target.id===backup.id?'administrador':target.id===teacher.id?'docente':'estudiante',expectedStatus:'activo',reason:'Motivo de prueba administrativa aislada',confirmed:true,...fields});
 const scalar=async<T=any>(sql:string,args:unknown[]=[])=>Object.values((await db.query<Record<string,T>>(sql,args)).rows[0]!)[0]!;
 const prepare=(email=`invite-${randomUUID()}@example.test`,id=randomUUID())=>call(admin,'admin_invite_prepare',{email,name:'Profesor invitado sintético',invitationId:id,reason:'Alta docente de prueba',confirmed:true});
 const dispatch=async(id:string,actor:string,step:string,lease:string|null=null,authId:string|null=null,code:string|null=null)=>{
  await db.exec('SET ROLE service_role');
  try{return (await db.query<any>('SELECT public.apex_admin_invitation_dispatch($1,$2,$3,$4,$5,$6) v',[id,actor,step,lease,authId,code])).rows[0]!.v;}
  finally{await db.exec('RESET ROLE');}
 };
 const authPorts=localInvitationPorts(db,call,dispatch,admin);
 return {db,admin,backup,teacher,student,call,update,scalar,prepare,dispatch,...authPorts};
}
export function localInvitationPorts(db:PGlite,call:(user:User|null,op:string,payload?:unknown)=>Promise<any>,dispatch:(id:string,actor:string,step:string,lease?:string|null,authId?:string|null,code?:string|null)=>Promise<any>,admin:User){
 let mails=0,recoveries=0,created:string[]=[];
 const ports:InvitationPorts={
  authorize:async token=>{if(token!==admin.sid)throw Error('invalid synthetic session');await call(admin,'admin_overview');return admin.id;},
  claim:(id,actor)=>dispatch(id,actor,'claim'),
  invite:async(email,name,nonce)=>{
   mails++;const id=randomUUID();
   await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES($1,$2,$3::jsonb,now())',[id,email,JSON.stringify({name,apex_invite_nonce:nonce})]);created.push(id);return id;
  },
  recoverOwned:async(authId,email)=>{
   const found=(await db.query<{email:string}>('SELECT email FROM auth.users WHERE id=$1',[authId])).rows[0];
   if(found?.email!==email)throw Error('identity mismatch');recoveries++;mails++;
  },
  complete:async(id,actor,lease,authId)=>{await dispatch(id,actor,'sent',lease,authId);},
  fail:async(id,actor,lease,code)=>{await dispatch(id,actor,'error',lease,null,code);},
 };
 const acceptedSession=async(id:string)=>{
  const sid=randomUUID();await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,id]);
  return {id,sid};
 };
 const accept=(user:User)=>asUser(db,user,async()=>(await db.query<any>('SELECT public.apex_accept_teacher_invitation_v2() v')).rows[0]!.v);
 return {ports,acceptedSession,accept,delivery:()=>({mails,recoveries,created})};
}
