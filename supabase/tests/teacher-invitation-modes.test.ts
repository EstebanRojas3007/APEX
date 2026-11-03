import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {adminFixture} from './admin-fixture';
import {asUser} from './harness';
import {dispatchInvitation,InvitationError} from '../../server/admin/invitations';
import {createGmailSender} from '../../server/admin/mail';

async function fixture(){
 const f=await adminFixture();const links:{id:string;token:string;authId:string;email:string}[]=[];
 f.ports.sendExisting=async(authId,email,id,token)=>{links.push({authId,email,id,token});};
 const lookup=(id=f.student.id)=>f.call(f.admin,'admin_invite_lookup',{userId:id});
 const prepare=async(userId=f.student.id,fields:Record<string,unknown>={})=>{
  const user=await lookup(userId);
  return f.call(f.admin,'admin_invite_prepare',{mode:'existing',role:'docente',userId,invitationId:randomUUID(),expectedRole:user.role,expectedStatus:user.status,expectedRevision:user.revision,reason:'Propuesta docente de prueba',confirmed:true,...fields});
 };
 const accept=(id:string,token:string|null,user=f.student)=>asUser(f.db,user,async()=>(await f.db.query<any>('SELECT public.apex_accept_teacher_invitation_v2($1,$2) v',[id,token])).rows[0]!.v);
 return {...f,lookup,prepareExisting:prepare,links,acceptExisting:accept};
}
test('Existing APEX ID differs from Auth; identity lookup, explicit acceptance, idempotency and history',async()=>{
 const f=await fixture();try{
  const auth=f.student.id,domain='apex-domain-existing-19004';
  // Change the domain ID with its FK dependents in this synthetic fixture only.
  await f.db.exec("SET session_replication_role='replica'");
  for(const table of ['usuario','estudiante'])await f.db.query(`UPDATE apex_private.${table} SET ${table==='usuario'?'id':'id_usuario'}=$1 WHERE ${table==='usuario'?'id':'id_usuario'}=$2`,[domain,auth]);
  await f.db.query('UPDATE apex_private.asignacion_evaluacion SET id_estudiante=$1 WHERE id_estudiante=$2',[domain,auth]);
  await f.db.exec("SET session_replication_role='origin'");
  const user=await f.lookup(domain);assert.equal(user.authId,auth);assert.equal(user.id,domain);
  const history=await f.scalar('SELECT jsonb_agg(to_jsonb(e)) FROM apex_private.estudiante e');
  const invite=await f.prepareExisting(domain);assert.equal(invite.email,user.email);assert.equal(invite.status,'pending');
  await assert.rejects(f.prepareExisting(domain),/pendiente/);
  await dispatchInvitation(f.ports,f.admin.sid,invite.id);await dispatchInvitation(f.ports,f.admin.sid,invite.id);
  assert.equal(f.links.length,1);assert.equal(f.delivery().created.length,0);assert.equal(f.delivery().recoveries,0);
  assert.equal(await f.scalar('SELECT rol FROM apex_private.usuario WHERE id=$1',[domain]),'estudiante');
  assert.equal(await f.scalar('SELECT estado FROM apex_private.usuario WHERE id=$1',[domain]),'activo');
  const link=f.links[0]!;
  const review=await asUser(f.db,f.student,async()=>(await f.db.query<any>('SELECT public.apex_teacher_invitation_review($1,$2) v',[link.id,link.token])).rows[0]!.v);
  assert.equal(review.currentRole,'estudiante');assert.equal(await f.scalar('SELECT rol FROM apex_private.usuario WHERE id=$1',[domain]),'estudiante','GET/review cannot grant a role');
  await assert.rejects(f.acceptExisting(link.id,link.token,f.teacher),/incorrecta/);
  await assert.rejects(f.acceptExisting(link.id,randomUUID()),/inválido/);
  await assert.rejects(f.acceptExisting(link.id,null),/inválido/);
  assert.deepEqual(await f.acceptExisting(link.id,link.token),{accepted:true});
  assert.equal((await f.acceptExisting(link.id,link.token)).alreadyAccepted,true);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.auditoria_rol WHERE destinatario=$1',[auth]),1);
  assert.deepEqual(await f.scalar('SELECT jsonb_agg(to_jsonb(e)) FROM apex_private.estudiante e'),history);
  assert.equal((await f.call(f.student,'me')).profile.role,'docente');
  assert.equal((await f.call(f.admin,'admin_invitations')).rows[0].status,'accepted');
  const audit=JSON.stringify(await f.call(f.admin,'admin_audit'));assert.ok(!audit.includes(link.token));assert.ok(!audit.includes('nonce'));
 }finally{await f.db.close();}
});
test('Existing invitation: revocation, role/state ABA, active exam, cancellation, expiration and rotated resend',async()=>{
 const f=await fixture();try{
  let i=await f.prepareExisting();await dispatchInvitation(f.ports,f.admin.sid,i.id);let link=f.links.at(-1)!;
  await f.update(f.admin,{status:'inactivo'});
  await assert.rejects(f.acceptExisting(i.id,link.token),/administrador/);
  await f.update(f.admin,{status:'activo',expectedStatus:'inactivo'},f.backup);
  await f.update(f.student,{status:'inactivo'});await f.update(f.student,{status:'activo',expectedStatus:'inactivo'});
  await assert.rejects(f.acceptExisting(i.id,link.token),/cambiaron/);
  await f.call(f.admin,'admin_invite_cancel',{invitationId:i.id,reason:'Cuenta modificada',confirmed:true});
  await assert.rejects(f.acceptExisting(i.id,link.token),/inválido/);
  i=await f.prepareExisting();await dispatchInvitation(f.ports,f.admin.sid,i.id);link=f.links.at(-1)!;
  const me=await f.call(f.student,'me');const a=await f.call(f.student,'start',{assignmentId:me.assignments[0].id,confirmed:true});
  await assert.rejects(f.acceptExisting(i.id,link.token),/examen activo/);
  assert.equal(await f.scalar('SELECT rol FROM apex_private.usuario WHERE id=$1',[f.student.id]),'estudiante');
  await f.call(f.student,'finish',{attemptId:a.id});
  await f.call(f.admin,'admin_invite_resend',{invitationId:i.id,reason:'Reenvío confirmado',confirmed:true});
  await dispatchInvitation(f.ports,f.admin.sid,i.id);const next=f.links.at(-1)!;assert.notEqual(link.token,next.token);
  await assert.rejects(f.acceptExisting(i.id,link.token),/inválido/);
  await f.db.query("UPDATE apex_private.invitacion_docente SET vence_en=now()-interval '1 second' WHERE id=$1",[i.id]);
  await assert.rejects(f.acceptExisting(i.id,next.token),/vencida/);
 }finally{await f.db.close();}
});
test('Existing lookup and prepare authorize each call, validate teacher role and reject direct promotion/identity races',async()=>{
 const f=await fixture();try{
  for(const actor of [f.student,f.teacher,null])await assert.rejects(f.call(actor,'admin_invite_lookup',{userId:f.student.id}),/administrador|permission denied/);
  await assert.rejects(f.lookup('does-not-exist'),/ID APEX/);
  await assert.rejects(f.lookup(f.teacher.id),/estudiante activo/);
  await assert.rejects(f.prepareExisting(f.student.id,{role:'administrador'}),/Solo se permite/);
  await assert.rejects(f.prepareExisting(f.student.id,{reason:''}),/Motivo/);
  await assert.rejects(f.prepareExisting(f.student.id,{expectedRevision:999}),/cambió/);
  await assert.rejects(f.update(f.student,{role:'docente'}),/aceptación/);
  await assert.rejects(f.call(f.admin,'set_role',{userId:f.student.id,role:'docente',reason:'Bypass',confirmed:true}),/aceptación/);
  await assert.rejects(f.prepare('student19004@example.test'),/con cuenta existente/);
  const i=await f.prepareExisting();let failure='MAIL_NOT_CONFIGURED';
  f.ports.sendExisting=async()=>{throw new InvitationError(failure);};
  await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,i.id),/MAIL_NOT_CONFIGURED/);
  failure='MAIL_REJECTED';await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,i.id),/MAIL_REJECTED/);
  const events=await f.call(f.admin,'admin_audit',{action:'error_envio_invitacion'});assert.equal(events.total,2);
  assert.equal(await f.scalar('SELECT rol FROM apex_private.usuario WHERE id=$1',[f.student.id]),'estudiante');
  await f.db.exec(readFileSync(new URL('../verify-teacher-invitation-modes.sql',import.meta.url),'utf8'));
 }finally{await f.db.close();}
});

test('Gmail uncertainty/revocation retain audit and identity; lease prevents overlapping send, explicit retry may duplicate email but not acceptance',async()=>{
 const f=await fixture();try{
  const invite=await f.prepareExisting();let mode:'uncertain'|'revoked'|'success'='uncertain',mails=0,token='';
  const credentials={clientId:'synthetic-client',clientSecret:'synthetic-secret',refreshToken:'synthetic-refresh',redirect:'http://localhost:8081/auth/invite'};
  const google:typeof fetch=async(url)=>{
   if(String(url).includes('oauth2.googleapis.com'))return mode==='revoked'?new Response('{"error":"invalid_grant"}',{status:400}):new Response('{"access_token":"synthetic-access","expires_in":3600}',{status:200});
   mails++; // Simulate provider acceptance before the response is lost/fails.
   return mode==='uncertain'?new Response('{}',{status:503}):new Response('{"id":"synthetic-mail"}',{status:200});
  };
  const attach=()=>{
   const send=createGmailSender(credentials,google);
   f.ports.sendExisting=async(authId,email,id,capability)=>{
    assert.equal(authId,f.student.id);token=capability;
    assert.equal((await f.dispatch(id,f.admin.id,'claim')).dispatch,false,'A second worker cannot claim a live send lease');
    await send(email,id,capability);
   };
  };
  attach();await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,invite.id),/SEND_UNCERTAIN/);
  assert.equal(mails,1,'No automatic retry after an ambiguous send');
  let row=(await f.call(f.admin,'admin_invitations')).rows[0];assert.equal(row.status,'error');assert.equal(row.errorCode,'DELIVERY_FAILED');
  mode='revoked';attach();await assert.rejects(dispatchInvitation(f.ports,f.admin.sid,invite.id),/GOOGLE_AUTH_REVOKED/);
  row=(await f.call(f.admin,'admin_invitations')).rows[0];assert.equal(row.errorCode,'MAIL_REJECTED');assert.equal(mails,1);
  assert.equal((await f.call(f.student,'me')).profile.role,'estudiante');
  mode='success';attach();await dispatchInvitation(f.ports,f.admin.sid,invite.id);await dispatchInvitation(f.ports,f.admin.sid,invite.id);
  assert.equal(mails,2,'An operator retry after uncertainty can duplicate mail; confirmed sends remain idempotent');
  assert.equal((await f.call(f.student,'me')).profile.role,'estudiante');
  await f.acceptExisting(invite.id,token);await f.acceptExisting(invite.id,token);
  assert.equal(await f.scalar('SELECT count(*)::int FROM apex_private.auditoria_rol WHERE destinatario=$1',[f.student.id]),1);
  const audit=await f.call(f.admin,'admin_audit',{action:'error_envio_invitacion'});assert.equal(audit.total,2);
  for(const privateValue of [token,credentials.clientSecret,credentials.refreshToken,'synthetic-access'])assert.ok(!JSON.stringify(audit).includes(privateValue));
 }finally{await f.db.close();}
});
