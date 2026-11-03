import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {testServiceSchemaSQL,identity,asUser,rpc} from './harness';
test('Additive invitation upgrade preserves a previously sent new account and accepts it explicitly',async()=>{
 const db=new PGlite();try{
  const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  await db.exec(testServiceSchemaSQL);
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort())if(file<'202610260001_teacher_invitation_modes.sql')await db.exec(read(`../migrations/${file}`));
  await db.exec(read('../seed-demo.sql'));await db.exec('ALTER TABLE auth.users ADD COLUMN encrypted_password text');
  const admin=await identity(db,19901,'administrador'),id=randomUUID(),recipient=randomUUID();
  await asUser(db,admin,()=>rpc(db,'admin_invite_prepare',{invitationId:id,name:'Legacy sent invite',email:'upgrade-invite@example.test',reason:'Legacy authorization',confirmed:true}));
  const claim=(await db.query<any>('SELECT public.apex_admin_invitation_dispatch($1,$2,$3) v',[id,admin.id,'claim'])).rows[0]!.v;
  await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at,encrypted_password) VALUES($1,$2,$3,now(),'synthetic-existing-hash')",[recipient,'upgrade-invite@example.test',JSON.stringify({apex_invite_nonce:claim.nonce})]);
  await db.query('SELECT public.apex_admin_invitation_dispatch($1,$2,$3,$4,$5)',[id,admin.id,'sent',claim.lease,recipient]);
  const snapshot=async()=>(await db.query("SELECT jsonb_agg(to_jsonb(u)-'revision_cuenta' ORDER BY id) users FROM apex_private.usuario u")).rows;
  const before=await snapshot();
  await db.exec(read('../preflight-teacher-invitation-modes.sql'));
  await db.exec(read('../migrations/202610260001_teacher_invitation_modes.sql'));
  assert.deepEqual(await snapshot(),before);
  const user={id:recipient,sid:randomUUID()};await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[user.sid,user.id]);
  const review=await asUser(db,user,async()=>(await db.query<any>('SELECT public.apex_teacher_invitation_review() v')).rows[0]!.v);
  assert.equal(review.status,'sent');assert.equal(review.mode,'new');
  await assert.rejects(asUser(db,user,()=>db.query('SELECT public.apex_accept_teacher_invitation()')),/aceptar explícitamente/);
  assert.equal((await db.query<any>('SELECT rol FROM apex_private.usuario WHERE auth_user_id=$1',[recipient])).rows[0]!.rol,'estudiante');
  await asUser(db,user,()=>db.query('SELECT public.apex_accept_teacher_invitation_v2()'));
  assert.equal((await asUser(db,user,()=>rpc(db,'me'))).profile.role,'docente');
  await db.exec(read('../verify-teacher-invitation-modes.sql'));
 }finally{await db.close();}
});
